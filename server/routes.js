// API de CalendApp: cuentas sociales, OAuth de Instagram, destinos de publicación y publicación manual.
// La programación automática la ejecuta /api/cron (no depende del navegador).
import crypto from 'node:crypto'
import * as cfg from './config.js'
import * as cryptoBox from './crypto.js'
import * as Auth from './auth.js'
import * as Repo from './repo.js'
import * as Instagram from './instagram.js'
import * as Platforms from './platforms.js'
import * as Publisher from './publisher.js'
import { now } from './db.js'
import { MetaException } from './meta-exception.js'
import { collectInsights, publishDue } from './cron.js'
import * as Notify from './notify.js'
import { HttpError, bodyOf, fail, queryOf, sendError, sendJson } from './http.js'

export const VERSION = '2.0.0'
const TIPOS = ['imagen', 'video', 'reel', 'carrusel', 'historia', 'texto']
const RATIOS = ['original', '1:1', '4:5', '1.91:1']
const FITS = ['crop', 'fit']
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

const need = (input, key) => {
  const v = String(input[key] ?? '').trim()
  if (!v) fail('invalid', `Falta el campo «${key}».`, 422)
  return v
}
const projectOf = async (input) => {
  const p = input.project_id !== undefined && input.project_id !== null && input.project_id !== '' ? String(input.project_id) : null
  if (!(await Repo.projectExists(p))) fail('invalid', 'Proyecto no válido.', 422)
  return p
}
const accountOrFail = async (input) => (await Repo.account(input.id)) ?? fail('not_found', 'Cuenta no encontrada.', 404)
const validTz = (tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false } }

async function bootstrap(req, res) {
  const authed = Auth.check(req)
  sendJson(res, {
    ok: true, backend: true, version: VERSION, configured: cfg.flags(), authenticated: authed, user: Auth.user(req),
    projects: await Repo.projects(), platforms: Platforms.all(), accounts: await Repo.accounts(), scheduler: authed ? await Repo.schedulerInfo() : null,
    publications: authed ? await Repo.publications() : [], destinations: authed ? await Repo.channels() : [], events: authed ? await Repo.events() : [],
    insights: authed ? await Repo.insights() : [], insights_last_run: authed ? await Repo.getState('insights_last_run') : null,
    notifications: authed ? await Notify.recent() : [], snippets: authed ? await Repo.snippets() : [],
    review_links: authed ? await Repo.reviewLinks() : [], feedback: authed ? await Repo.allFeedback() : [],
  })
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const clip = (v, n) => String(v ?? '').trim().slice(0, n)

// ── Aprobación del cliente (público, protegido por el token del enlace) ──
async function reviewView(req, res) {
  const link = await Repo.reviewLink(queryOf(req).t)
  if (!link) fail('not_found', 'Este enlace no existe o ha caducado.', 404)
  // Piezas guardadas en el servidor dentro del enlace (las de la hoja las carga el navegador).
  const publications = (await Repo.publications()).filter((p) => {
    const day = p.ref.split('|')[1] || ''
    return (!link.project_id || p.project_id === link.project_id) && day >= link.date_from && day <= link.date_to
  }).map(({ ref, project_id, title, caption, tipo, media }) => ({ ref, project_id, title, caption, tipo, media }))
  sendJson(res, { ok: true, link: { project_id: link.project_id, label: link.label, date_from: link.date_from, date_to: link.date_to, expires_at: link.expires_at }, feedback: await Repo.feedbackFor(link.token), publications })
}
async function reviewFeedback(req, res, input) {
  const link = await Repo.reviewLink(input.t)
  if (!link) fail('not_found', 'Este enlace no existe o ha caducado.', 404)
  const decision = String(input.decision ?? '')
  if (!['approved', 'changes'].includes(decision)) fail('invalid', 'Decisión no válida.', 422)
  const ref = clip(input.ref, 300)
  const [, day] = ref.split('|')
  if (!ref || !DAY.test(day || '') || day < link.date_from || day > link.date_to) fail('invalid', 'Esa publicación no forma parte de este enlace.', 422)
  if ((await Repo.feedbackFor(link.token)).length >= 300) fail('rate_limited', 'Este enlace ya ha recibido demasiadas respuestas.', 429)
  const comment = clip(input.comment, 1500), author = clip(input.author, 80) || 'Cliente'
  if (decision === 'changes' && !comment) fail('invalid', 'Cuéntanos qué cambiarías.', 422)
  const id = await Repo.addFeedback(link.token, ref, decision, comment, author)
  const title = clip(input.title, 120) || 'una publicación'
  await Notify.notify(`review:${id}`, decision === 'approved' ? 'review_ok' : 'review_changes',
    decision === 'approved' ? `${author} aprobó «${title}»` : `${author} pide cambios en «${title}»`, comment || 'Aprobada sin comentarios.', '#/calendar')
  sendJson(res, { ok: true, feedback: await Repo.feedbackFor(link.token) })
}

const POST = {
  async 'review/create'(req, res, input) {
    const date_from = String(input.date_from ?? ''), date_to = String(input.date_to ?? '')
    if (!DAY.test(date_from) || !DAY.test(date_to) || date_to < date_from) fail('invalid', 'Fechas no válidas.', 422)
    const project_id = await projectOf(input)
    const token = await Repo.createReviewLink({ project_id, label: clip(input.label, 120), date_from, date_to, created_by: Auth.user(req)?.email || null, days: Math.min(90, Math.max(1, Number(input.days) || 30)) })
    sendJson(res, { ok: true, token, review_links: await Repo.reviewLinks() })
  },
  async 'review/delete'(req, res, input) { await Repo.deleteReviewLink(input.token); sendJson(res, { ok: true, review_links: await Repo.reviewLinks() }) },
  async 'snippets/save'(req, res, input) {
    const kind = String(input.kind ?? '')
    if (!['template', 'hashtags'].includes(kind)) fail('invalid', 'Tipo no válido.', 422)
    const name = clip(input.name, 80), body = clip(input.body, 2200)
    if (!name || !body) fail('invalid', 'Pon un nombre y un contenido.', 422)
    await Repo.saveSnippet({ id: Number(input.id) || null, project_id: await projectOf(input), kind, name, body })
    sendJson(res, { ok: true, snippets: await Repo.snippets() })
  },
  async 'snippets/delete'(req, res, input) { await Repo.deleteSnippet(input.id); sendJson(res, { ok: true, snippets: await Repo.snippets() }) },
  async 'notifications/test'(req, res) {
    if (!Notify.emailConfigured()) fail('not_configured', 'Configura RESEND_API_KEY y NOTIFY_FROM en Vercel para enviar avisos por email.', 503)
    const ok = await Notify.sendEmail('Prueba de avisos', 'Si lees esto, los avisos por email de Nowepost funcionan.', '')
    if (!ok) fail('email', 'Resend rechazó el envío. Revisa que el remitente (NOTIFY_FROM) esté verificado en Resend.', 502)
    sendJson(res, { ok: true })
  },
  // Actualización manual de métricas (las de menos de 1 h se reutilizan para no gastar cuota).
  async 'insights/refresh'(req, res) {
    const results = await collectInsights(25000, 1)
    sendJson(res, { ok: true, results, insights: await Repo.insights() })
  },
  async 'instagram/connect'(req, res, input) {
    const f = cfg.flags()
    if (!f.meta_app || !f.redirect_uri || !f.crypto) fail('not_configured', 'Faltan la aplicación de Meta, la URL de retorno o APP_KEY en la configuración del servidor.', 503)
    const project = await projectOf(input)
    const state = crypto.randomBytes(20).toString('hex')
    await Repo.saveState(state, project, Auth.sessionHash(req))
    sendJson(res, { ok: true, url: Instagram.authorizeUrl(state, !!input.force_reauth) })
  },

  async 'accounts/add'(req, res, input) {
    const username = need(input, 'username').replace(/^@+/, '').toLowerCase()
    if (!/^[a-z0-9._]{1,30}$/.test(username)) fail('invalid', 'El usuario de Instagram no es válido.', 422)
    const project = await projectOf(input)
    if (await Repo.accountByUsername('instagram', username)) fail('exists', 'Esa cuenta ya existe.', 409)
    sendJson(res, { ok: true, id: await Repo.addAccount('instagram', username, project) })
  },

  async 'accounts/update'(req, res, input) {
    const acc = await accountOrFail(input)
    await Repo.updateAccount(acc.id, { project_id: await projectOf(input) })
    sendJson(res, { ok: true })
  },

  async 'accounts/disconnect'(req, res, input) {
    const acc = await accountOrFail(input)
    await Repo.updateAccount(acc.id, { access_token_enc: null, token_expires_at: null, status: 'disconnected', last_error: null })
    sendJson(res, { ok: true })
  },

  async 'accounts/remove'(req, res, input) {
    const acc = await accountOrFail(input)
    if (acc.status === 'connected') fail('invalid', 'Desconecta la cuenta antes de eliminarla.', 409)
    await Repo.deleteAccount(acc.id)
    sendJson(res, { ok: true })
  },

  async 'accounts/refresh'(req, res, input) {
    const acc = await accountOrFail(input)
    try {
      const t = await Instagram.refresh(Repo.token(acc))
      await Repo.updateAccount(acc.id, { access_token_enc: cryptoBox.encrypt(t.access_token), token_expires_at: iso(Date.now() + t.expires_in * 1000), token_refreshed_at: now(), status: 'connected', last_error: null })
    } catch (e) {
      if (e instanceof MetaException) fail('meta', e.userMessage(), 502)
      if (e instanceof HttpError) throw e
      fail('invalid', e.message, 409)
    }
    sendJson(res, { ok: true })
  },

  async 'accounts/check'(req, res, input) {
    const acc = await accountOrFail(input)
    try {
      const token = Repo.token(acc)
      const me = await Instagram.me(token)
      const quota = await Instagram.quota(String(acc.external_account_id), token)
      let meta = {}
      try { meta = JSON.parse(acc.metadata || '{}') || {} } catch { /* vacío */ }
      for (const k of ['account_type', 'profile_picture_url', 'followers_count', 'media_count']) if (me[k] !== undefined) meta[k] = me[k]
      await Repo.updateAccount(acc.id, { metadata: JSON.stringify(meta), last_error: null, status: 'connected' })
      sendJson(res, { ok: true, quota })
    } catch (e) {
      if (e instanceof MetaException) {
        if (e.isAuthError()) await Repo.updateAccount(acc.id, { status: 'expired', last_error: e.userMessage() })
        fail('meta', e.userMessage(), 502)
      }
      if (e instanceof HttpError) throw e
      fail('invalid', e.message, 409)
    }
  },

  async 'publications/save'(req, res, input) {
    const ref = need(input, 'ref')
    const title = String(input.title ?? '').trim()
    const tipo = String(input.tipo ?? 'imagen')
    if (!TIPOS.includes(tipo)) fail('invalid', 'Tipo de contenido no válido.', 422)
    const project = await projectOf(input)
    const ratio = input.image_ratio === undefined || input.image_ratio === null || input.image_ratio === '' ? 'original' : String(input.image_ratio)
    const fit = input.image_fit === undefined || input.image_fit === null || input.image_fit === '' ? 'fit' : String(input.image_fit)
    if (!RATIOS.includes(ratio) || !FITS.includes(fit)) fail('invalid', 'Formato de imagen no válido.', 422)
    const media = (Array.isArray(input.media) ? input.media : []).map(String).filter((u) => /^https?:\/\//i.test(u))
    if (media.length > 10) fail('invalid', 'Un contenido admite un máximo de 10 archivos.', 422)
    const firstComment = String(input.first_comment ?? '').trim()
    if ([...firstComment].length > 2200) fail('invalid', 'El primer comentario supera los 2.200 caracteres.', 422)
    const dests = []
    for (const d of Array.isArray(input.destinations) ? input.destinations : []) {
      const acc = await Repo.account(d?.social_account_id)
      if (!acc || acc.platform !== 'instagram') fail('invalid', 'Cuenta de destino no válida.', 422)
      const status = String(d.status ?? 'draft')
      let when = null
      if (status === 'scheduled') {
        const ts = d.scheduled_at ? Date.parse(String(d.scheduled_at)) : NaN
        if (Number.isNaN(ts)) fail('invalid', 'Falta la fecha y hora de programación.', 422)
        if (ts <= Date.now()) fail('invalid', 'La hora programada ya ha pasado.', 422)
        if (Repo.accountPublic(acc).status !== 'connected') fail('invalid', `La cuenta @${acc.username} no está conectada: no se puede programar.`, 409)
        when = iso(ts)
      }
      dests.push({ social_account_id: Number(acc.id), status, scheduled_at: when, timezone: d.timezone && validTz(String(d.timezone)) ? String(d.timezone) : null })
    }
    const out = await Repo.tx(async (q) => {
      const pubId = await Repo.upsertPublication(q, ref, input.previous_ref ? String(input.previous_ref) : null, project, title, String(input.caption ?? ''), media, tipo, ratio, fit, firstComment || null)
      await Repo.syncChannels(q, pubId, dests)
      return { pubId, list: await Repo.channels(pubId, q) }
    })
    sendJson(res, { ok: true, publication: { id: out.pubId, ref }, destinations: out.list.map((c) => ({ ...c, ref })) })
  },

  async 'destinations/publish'(req, res, input) {
    const id = Number(input.id) || 0
    if (!(await Repo.channel(id))) fail('not_found', 'Destino no encontrado.', 404)
    sendJson(res, { ok: true, destination: await Publisher.run(id, req, 40) })
  },

  async 'destinations/cancel'(req, res, input) {
    const ch = await Repo.channel(input.id)
    if (!ch) fail('not_found', 'Destino no encontrado.', 404)
    if (!['draft', 'scheduled', 'failed'].includes(ch.status)) fail('invalid', 'Este destino ya no se puede cancelar.', 409)
    await Repo.updateChannel(ch.id, { status: 'cancelled', error_message: null })
    await Repo.logEvent(ch.id, 'cancelled', 'Cancelado')
    sendJson(res, { ok: true })
  },

  // Publica ahora lo programado cuya hora ya pasó (respaldo del programador externo; el cron sigue siendo el principal).
  async 'scheduler/run'(req, res) {
    sendJson(res, { ok: true, results: await publishDue(req, 40000) })
  },

  async 'publications/delete'(req, res, input) {
    if (!(await Repo.deletePublication(need(input, 'ref')))) fail('published', 'Esta publicación ya está publicada. Meta no permite borrarla desde la API: elimínala desde Instagram.', 409)
    sendJson(res, { ok: true })
  },
}

export async function handle(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  try {
    const route = queryOf(req).r || ''
    const method = req.method || 'GET'
    if (route === 'status') return sendJson(res, { ok: true, backend: true, version: VERSION, configured: cfg.flags(), authenticated: Auth.check(req), user: Auth.user(req) })
    if (route === 'bootstrap' && method === 'GET') return await bootstrap(req, res)
    if (route === 'review/view' && method === 'GET') return await reviewView(req, res)
    if (method !== 'POST') fail('not_found', 'Ruta no encontrada.', 404)
    Auth.requireCsrf(req)
    const input = await bodyOf(req)
    if (route === 'auth/login') {
      if (!(await Auth.login(req, res, String(input.password ?? ''), String(input.email ?? '')))) fail('bad_credentials', input.email ? 'Correo o contraseña incorrectos.' : 'Contraseña incorrecta.', 401)
      return sendJson(res, { ok: true })
    }
    if (route === 'auth/logout') { Auth.logout(req, res); return sendJson(res, { ok: true }) }
    if (route === 'review/feedback') return await reviewFeedback(req, res, input)
    Auth.requireSession(req)
    if (route === 'auth/password') return sendJson(res, { ok: true, user: await Auth.changePassword(req, res, String(input.current ?? ''), String(input.password ?? '')) })
    const fn = Object.hasOwn(POST, route) ? POST[route] : null
    if (!fn) fail('not_found', 'Ruta no encontrada.', 404)
    return await fn(req, res, input)
  } catch (e) {
    if (e instanceof HttpError) return sendError(res, e)
    console.error('[calendapp]', e)
    return sendError(res, new HttpError('server', 'Error interno del servidor.', 500))
  }
}
