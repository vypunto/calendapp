// Scheduler real: publica los destinos programados cuya hora ya llegó y retoma los que siguen procesándose.
// No depende del navegador. Lo llama Vercel Cron o un cron externo con `Authorization: Bearer $CRON_SECRET`.
import * as cfg from './config.js'
import * as cryptoBox from './crypto.js'
import * as Repo from './repo.js'
import * as Instagram from './instagram.js'
import * as Publisher from './publisher.js'
import { now } from './db.js'
import { notify } from './notify.js'
import { MetaException } from './meta-exception.js'
import { queryOf, sendJson } from './http.js'

export async function publishDue(req, budgetMs) {
  const started = Date.now()
  await Repo.setState('scheduler_last_run', now())
  const out = []
  for (const id of await Repo.dueChannelIds()) {
    if (Date.now() - started > budgetMs) break // el resto se retoma en la siguiente ejecución
    const r = await Publisher.run(id, req, 20)
    out.push({ id, status: r.status ?? '?', error: r.error_message ?? null })
  }
  await watchdog()
  return out
}

// Avisos preventivos: lo que debió salir y no salió, y lo que fallará si nadie reconecta la cuenta.
const when = (iso) => new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export async function watchdog() {
  for (const c of await Repo.overdueChannels(15)) {
    await notify(`overdue:${c.id}:${c.scheduled_at}`, 'overdue', `Publicación vencida: «${c.title || 'sin título'}»`,
      `Estaba programada para el ${when(c.scheduled_at)}${c.username ? ` en @${c.username}` : ''} y todavía no se ha publicado. Revísala o publícala manualmente.`, '#/calendar')
  }
  for (const c of await Repo.atRiskChannels(24)) {
    await notify(`atrisk:${c.id}:${c.scheduled_at}`, 'at_risk', `La cuenta @${c.username} no está conectada`,
      `«${c.title || 'sin título'}» está programada para el ${when(c.scheduled_at)} y fallará si no reconectas la cuenta en Ajustes → Integraciones.`, '#/settings')
  }
}

// Renueva los tokens de larga duración antes de que caduquen (60 días). Meta solo permite renovar tokens con más de 24 h que sigan vigentes.
async function refreshTokens() {
  const out = []
  for (const pub of await Repo.accounts()) {
    if (pub.status !== 'connected' || !pub.token_expires_at) continue
    if (Date.parse(pub.token_expires_at) - Date.now() > 10 * 86400 * 1000) continue // aún queda margen
    const acc = await Repo.account(pub.id)
    try {
      const t = await Instagram.refresh(Repo.token(acc))
      await Repo.updateAccount(pub.id, { access_token_enc: cryptoBox.encrypt(t.access_token), token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'), token_refreshed_at: now(), last_error: null })
      out.push({ account: pub.username, result: 'renovado' })
    } catch (e) {
      if (e instanceof MetaException) await Repo.updateAccount(pub.id, { status: e.isAuthError() ? 'expired' : 'error', last_error: e.userMessage() })
      await notify(`refresh:${pub.id}:${pub.token_expires_at}`, 'token', `No se pudo renovar el acceso de @${pub.username}`, `Vuelve a conectar la cuenta antes del ${when(pub.token_expires_at)} para no perder publicaciones programadas.`, '#/settings')
      out.push({ account: pub.username, result: e.message })
    }
  }
  return out
}

// Recoge las métricas de lo publicado en los últimos 30 días. Un fallo de permisos no desconecta la cuenta.
export async function collectInsights(budgetMs = 40000, staleHours = 12) {
  const started = Date.now()
  const out = []
  const tokens = new Map()
  for (const t of await Repo.insightTargets(30, staleHours)) {
    if (Date.now() - started > budgetMs) break
    if (!tokens.has(t.social_account_id)) {
      const acc = await Repo.account(t.social_account_id)
      tokens.set(t.social_account_id, acc && acc.status === 'connected' && acc.access_token_enc ? Repo.token(acc) : null)
    }
    const token = tokens.get(t.social_account_id)
    if (!token) { await Repo.saveInsights(t.id, {}, 'La cuenta no está conectada.'); continue }
    try {
      const m = await Instagram.mediaInsights(t.external_post_id, token, t.tipo)
      await Repo.saveInsights(t.id, m)
      out.push({ channel: Number(t.id), ok: true })
    } catch (e) {
      if (!(e instanceof MetaException)) throw e
      const msg = e.isPermissionError() || /permission/i.test(e.message)
        ? 'Falta el permiso de estadísticas: vuelve a conectar la cuenta en Ajustes → Integraciones.' : e.userMessage()
      await Repo.saveInsights(t.id, {}, msg)
      out.push({ channel: Number(t.id), ok: false, error: msg })
    }
  }
  await Repo.setState('insights_last_run', now())
  return out
}

export async function handle(req, res) {
  const secret = cfg.get('CRON_SECRET')
  if (!secret) return sendJson(res, { ok: false, error: { code: 'not_configured', message: 'Falta CRON_SECRET.' } }, 503)
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!cryptoBox.safeEqual(secret, given)) return sendJson(res, { ok: false, error: { code: 'unauthorized', message: 'No autorizado.' } }, 401)
  try {
    const job = queryOf(req).job || 'publish'
    // El cron diario renueva tokens y recoge estadísticas (Vercel Hobby solo permite crons diarios).
    if (job === 'refresh') { await watchdog(); return sendJson(res, { ok: true, job, results: await refreshTokens(), insights: await collectInsights(30000) }) }
    if (job === 'insights') return sendJson(res, { ok: true, job, results: await collectInsights(40000) })
    return sendJson(res, { ok: true, job: 'publish', results: await publishDue(req, 40000) })
  } catch (e) {
    console.error('[calendapp cron]', e)
    return sendJson(res, { ok: false, error: { code: 'server', message: 'Error interno del servidor.' } }, 500)
  }
}
