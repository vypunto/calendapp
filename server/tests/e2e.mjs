// Prueba de integración del backend (Node + Postgres en memoria) contra un Meta simulado. Uso: node server/tests/e2e.mjs
import crypto from 'node:crypto'
import sharp from 'sharp'
import { startMock } from './mock-meta.js'

const APP = 'http://127.0.0.1:8900'; const MOCK = 'http://127.0.0.1:8901'
Object.assign(process.env, {
  APP_KEY: crypto.randomBytes(32).toString('base64'), ADMIN_PASSWORD: 'pw-test', INITIAL_TEAM_PASSWORD: 'inicial-test-1', META_APP_ID: '123', META_APP_SECRET: 'test-secret', CRON_SECRET: 'cron-test',
  META_REDIRECT_URI: `${APP}/api/instagram-callback`, APP_URL: `${APP}/`, DATABASE_URL: 'pglite://memory',
  META_GRAPH_BASE: MOCK, META_OAUTH_TOKEN: `${MOCK}/oauth/access_token`, MEDIA_ALLOW_PRIVATE: '1',
})
const { createServer } = await import('../local.js')
const mock = await startMock(8901)
const app = await createServer()
await new Promise((r) => app.listen(8900, '127.0.0.1', r))

let pass = 0; let fail = 0
const ok = (name, cond) => { console.log(cond ? 'PASS' : 'FAIL', name); cond ? pass++ : fail++ }
let cookie = ''
const H = () => ({ 'Content-Type': 'application/json', 'X-CalendApp': '1', ...(cookie ? { Cookie: cookie } : {}) })
const keep = (r) => { const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0].endsWith('=') ? '' : c.split(';')[0] }
const post = async (route, body = {}) => { const r = await fetch(`${APP}/api/index?r=${route}`, { method: 'POST', headers: H(), body: JSON.stringify(body) }); keep(r); return r.json() }
const get = async (route) => (await fetch(`${APP}/api/index?r=${route}`, { headers: cookie ? { Cookie: cookie } : {} })).json()
const status = async (route, opts) => (await fetch(`${APP}/api/index?r=${route}`, opts)).status
const callback = async (qs) => (await fetch(`${APP}/api/instagram-callback?${qs}`, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} })).headers.get('location') || ''
const cron = async (job = 'publish') => (await fetch(`${APP}/api/cron?job=${job}`, { headers: { Authorization: 'Bearer cron-test' } })).json()
const acct = async (u) => (await get('bootstrap')).accounts.find((a) => a.username === u)
const dest = async (id) => (await get('bootstrap')).destinations.find((d) => d.id === id)
const bad = (v) => v === undefined

try {
  let R = await get('status'); ok('status disponible y configurado', R.configured.meta_app && R.configured.crypto && R.configured.cron)
  R = await get('bootstrap'); ok('5 cuentas iniciales sin conectar', R.accounts.length === 5 && R.accounts.every((a) => a.status === 'pending'))
  ok('5 proyectos actuales', R.projects.length === 5)
  ok('sin sesión no se exponen destinos ni contenido', R.destinations.length === 0 && R.publications.length === 0)
  ok('POST sin cabecera CSRF rechazado', (await status('accounts/add', { method: 'POST', body: '{}' })) === 403)
  ok('acción sin sesión → 401', (await status('accounts/add', { method: 'POST', headers: H(), body: '{"username":"x"}' })) === 401)
  ok('contraseña incorrecta → 401', (await status('auth/login', { method: 'POST', headers: H(), body: '{"password":"mala"}' })) === 401)
  R = await post('auth/login', { password: '  pw-test\n' }); ok('login tolera espacios/saltos de línea sobrantes', R.ok === true); cookie = ''
  // Usuarios del equipo (correo + contraseña, cambio obligatorio en el primer acceso).
  ok('usuario con contraseña incorrecta → 401', (await status('auth/login', { method: 'POST', headers: H(), body: JSON.stringify({ email: 'n.romo@grupoelchandrio.com', password: 'mala' }) })) === 401)
  R = await post('auth/login', { email: ' N.Romo@grupoelchandrio.com ', password: 'inicial-test-1' }); ok('login de usuario sembrado', R.ok === true && !!cookie)
  R = await get('status'); ok('sesión con usuario y cambio de contraseña pendiente', R.user?.email === 'n.romo@grupoelchandrio.com' && R.user.mustChange === true)
  R = await post('auth/password', { current: 'inicial-test-1', password: 'corta1' }); ok('contraseña débil rechazada', R.ok === false)
  R = await post('auth/password', { current: 'inicial-test-1', password: 'NuevaClave2026' }); ok('cambio de contraseña', R.ok === true && R.user.mustChange === false)
  R = await get('status'); ok('la sesión renovada ya no exige cambio', R.user?.mustChange === false); cookie = ''
  R = await post('auth/login', { email: 'n.romo@grupoelchandrio.com', password: 'NuevaClave2026' }); ok('login con la nueva contraseña', R.ok === true); cookie = ''
  R = await post('auth/login', { password: 'pw-test' }); ok('login correcto (cookie HttpOnly firmada)', R.ok === true && cookie.startsWith('calendapp_sid='))
  ok('una cookie manipulada no vale', (await status('accounts/add', { method: 'POST', headers: { ...H(), Cookie: cookie.slice(0, -3) + 'abc' }, body: '{"username":"zz"}' })) === 401)

  R = await post('instagram/connect', { project_id: 'corfu' })
  const url = new URL(R.url); let state = url.searchParams.get('state')
  ok('URL de autorización oficial con scopes y state', url.host.endsWith('instagram.com') && url.searchParams.get('scope') === 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights,instagram_business_manage_comments' && !!state)
  ok('state inválido rechazado', (await callback('code=corfu&state=badstate')).includes('ig=error'))
  ok('callback conecta la cuenta', (await callback(`code=corfu&state=${state}`)).includes('ig=connected'))
  ok('el state es de un solo uso', (await callback(`code=corfu&state=${state}`)).includes('ig=error'))
  let a = await acct('teatrocorfu7'); ok('teatrocorfu7 conectada con proyecto corfu', a.status === 'connected' && a.project_id === 'corfu' && !!a.token_expires_at)
  R = await get('bootstrap'); ok('las demás siguen sin conectar', R.accounts.filter((x) => x.status === 'connected').length === 1)
  ok('el token no viaja al cliente', !/LONG_|SHORT_|access_token/.test(JSON.stringify(R)))
  const { query } = await import('../db.js')
  const enc = (await query(`SELECT access_token_enc FROM social_accounts WHERE username = 'teatrocorfu7'`)).rows[0].access_token_enc
  ok('el token está cifrado en la base de datos', !!enc && !enc.includes('LONG_'))
  const sess = new URL((await post('instagram/connect', {})).url).searchParams.get('state')
  ok('cuenta personal rechazada', (await callback(`code=personal&state=${sess}`)).includes('ig=error'))
  const other = await (async () => { const s2 = new URL((await post('instagram/connect', {})).url).searchParams.get('state'); const saved = cookie; cookie = ''; const r = await callback(`code=corfu&state=${s2}`); cookie = saved; return r })()
  ok('callback sin sesión de servidor rechazado', other.includes('ig=error'))

  const ACC = a.id; const ACC2 = (await acct('clubtemeraria')).id
  const FUT = new Date(Date.now() + 3600e3).toISOString(); const PAST = new Date(Date.now() - 3600e3).toISOString()
  const IMG = `${MOCK}/files/foto.jpg`
  const pub = (ref, extra = {}) => post('publications/save', { ref, project_id: 'corfu', title: ref, caption: 'Texto #hola', tipo: 'imagen', media: [IMG], ...extra })
  const D = (accId, st = 'draft', extra = {}) => ({ social_account_id: accId, status: st, ...extra })
  R = await pub('corfu|2026-09-30|cerramos', { destinations: [D(ACC, 'scheduled', { scheduled_at: FUT })] }); ok('programar destino futuro', R.destinations?.[0]?.status === 'scheduled')
  R = await pub('x|1', { destinations: [D(ACC, 'scheduled', { scheduled_at: PAST })] }); ok('programar en el pasado rechazado', R.ok === false)
  R = await pub('x|2', { project_id: 'temeraria', destinations: [D(ACC2, 'scheduled', { scheduled_at: FUT })] }); ok('programar en cuenta sin conectar rechazado', R.ok === false)

  R = await pub('corfu|2026-09-29|img', { caption: 'Hola', destinations: [D(ACC)] }); const D1 = R.destinations[0].id
  R = await post('destinations/publish', { id: D1 }); ok('publicar imagen ahora', R.destination.status === 'published' && !!R.destination.external_post_id)
  ok('permalink guardado', /instagram\.com\/p\//.test(R.destination.external_url))
  const lastC = () => Object.values(mock.state.containers).at(-1)
  ok('Meta recibió image_url firmada del relé y el texto', lastC().image_url.includes('/api/media?u=') && lastC().caption === 'Hola')
  R = await pub('corfu|2026-09-29|reel', { tipo: 'reel', media: [`${MOCK}/files/clip.mp4`], caption: 'Reel', destinations: [D(ACC)] })
  R = await post('destinations/publish', { id: R.destinations[0].id }); ok('publicar reel (espera al contenedor)', R.destination.status === 'published')
  ok('reel usa media_type REELS y video_url', lastC().media_type === 'REELS' && !!lastC().video_url)
  R = await pub('corfu|2026-09-29|car', { tipo: 'carrusel', media: [IMG, `${MOCK}/files/otra.jpg`], caption: 'Car', destinations: [D(ACC)] })
  R = await post('destinations/publish', { id: R.destinations[0].id }); ok('publicar carrusel', R.destination.status === 'published')
  const cs = Object.values(mock.state.containers)
  ok('carrusel: hijos con is_carousel_item y padre CAROUSEL', lastC().media_type === 'CAROUSEL' && lastC().children.split(',').length === 2 && cs.at(-2).is_carousel_item === 'true')
  R = await pub('corfu|2026-09-29|html', { media: [`${MOCK}/files/pagina.html`], destinations: [D(ACC)] })
  R = await post('destinations/publish', { id: R.destinations[0].id }); ok('archivo no público → error legible', R.destination.status === 'failed' && /archivo/i.test(R.destination.error_message))
  R = await pub('corfu|2026-09-29|yt', { tipo: 'reel', media: ['https://www.youtube.com/watch?v=abc'], destinations: [D(ACC)] })
  R = await post('destinations/publish', { id: R.destinations[0].id }); ok('YouTube no se publica en Instagram', R.destination.status === 'failed' && /YouTube/.test(R.destination.error_message))
  R = await pub('corfu|2026-09-29|txt', { tipo: 'texto', media: [], destinations: [D(ACC)] })
  R = await post('destinations/publish', { id: R.destinations[0].id }); ok('solo texto no se publica', R.destination.status === 'failed')
  R = await pub('corfu|2026-09-29|png', { media: [`${MOCK}/files/foto.png`], destinations: [D(ACC)] })
  R = await post('destinations/publish', { id: R.destinations[0].id }); ok('PNG: se convierte a JPEG antes de enviarlo a Instagram', R.destination.status === 'published')

  // formato de imagen: recorte / entera
  const dims = async (u) => { const m = await sharp(Buffer.from(await (await fetch(u)).arrayBuffer())).metadata(); return [m.width, m.height] }
  const fmtPub = async (name, media, extra) => { const r = await pub(`corfu|2026-09-29|${name}`, { media, destinations: [D(ACC)], ...extra }); const x = await post('destinations/publish', { id: r.destinations[0].id }); return x.destination }
  let X = await fmtPub('fmt-orig', [`${MOCK}/files/ok.jpg`]); ok('original dentro de 4:5–1,91:1: se publica sin tocar', X.status === 'published')
  let [w0, h0] = await dims(lastC().image_url); ok('…y mantiene sus proporciones (800×1000)', w0 === 800 && h0 === 1000)
  X = await fmtPub('fmt-wide', [`${MOCK}/files/wide.jpg`]); [w0, h0] = await dims(lastC().image_url)
  ok('original fuera de rango (panorámica 3,3:1): se deja entera con bandas hasta 1,91:1', X.status === 'published' && Math.abs(w0 / h0 - 1.91) < 0.02)
  X = await fmtPub('fmt-sq-crop', [`${MOCK}/files/tall.jpg`], { image_ratio: '1:1', image_fit: 'crop' }); [w0, h0] = await dims(lastC().image_url)
  ok('1:1 recortada: 400×400', X.status === 'published' && w0 === 400 && h0 === 400)
  X = await fmtPub('fmt-45-fit', [`${MOCK}/files/wide.jpg`], { image_ratio: '4:5', image_fit: 'fit' }); [w0, h0] = await dims(lastC().image_url)
  ok('4:5 entera (con bandas): 1000×1250', X.status === 'published' && w0 === 1000 && h0 === 1250)
  R = await pub('corfu|2026-09-29|fmt-bad', { image_ratio: '7:3', destinations: [D(ACC)] }); ok('formato de imagen no válido rechazado', R.ok === false)
  R = (await get('bootstrap')).publications.find((x) => x.ref.endsWith('fmt-sq-crop')); ok('el formato elegido se guarda y se devuelve', R.image_ratio === '1:1' && R.image_fit === 'crop')

  // programador: estado y ejecución manual de lo vencido
  R = await pub('corfu|2026-09-29|vencida', { destinations: [D(ACC, 'scheduled', { scheduled_at: new Date(Date.now() + 1500).toISOString() })] }); const DV = R.destinations[0].id
  await new Promise((r) => setTimeout(r, 2200))
  R = (await get('bootstrap')).scheduler; ok('bootstrap informa de publicaciones vencidas', R.overdue >= 1)
  R = await post('scheduler/run'); ok('«publicar vencidas» (admin) las publica', R.ok === true && R.results.some((x) => x.id === DV && x.status === 'published'))
  R = (await get('bootstrap')).scheduler; ok('tras ejecutarlo queda constancia de la última ejecución y sin vencidas', !!R.last_run && R.overdue === 0)
  // scheduler por HTTP con CRON_SECRET (sin navegador)
  ok('cron sin secreto rechazado', (await fetch(`${APP}/api/cron`)).status === 401)
  R = await pub('corfu|2026-09-29|cron', { caption: 'Auto', destinations: [D(ACC, 'scheduled', { scheduled_at: new Date(Date.now() + 2500).toISOString() })] })
  const DC = R.destinations[0].id
  R = await cron(); ok('cron no publica antes de hora', !R.results.some((x) => x.id === DC))
  await new Promise((r) => setTimeout(r, 3500)); R = await cron()
  ok('cron publica el destino programado sin navegador', (await dest(DC)).status === 'published' && R.results.some((x) => x.id === DC))
  R = await cron(); ok('cron no republica', R.results.length === 0)

  R = await pub('corfu|2026-10-01|c', { destinations: [D(ACC, 'scheduled', { scheduled_at: FUT })] }); const DX = R.destinations[0].id
  R = await post('destinations/cancel', { id: DX }); ok('cancelar destino programado', R.ok === true)
  R = await pub('corfu|2026-10-02|tz', { destinations: [D(ACC, 'scheduled', { scheduled_at: FUT, timezone: 'Europe/Madrid' })] })
  const DT = R.destinations[0].id; ok('zona horaria guardada y devuelta', R.destinations[0].timezone === 'Europe/Madrid')
  const B = await get('bootstrap')
  ok('bootstrap incluye plataformas (Instagram sí, TikTok no)', B.platforms.find((p) => p.id === 'instagram').implemented && B.platforms.find((p) => p.id === 'tiktok').implemented === false)
  ok('historial registra eventos del destino', B.events.some((e) => e.channel_id === DT))
  ok('historial del publicado incluye published', B.events.some((e) => e.channel_id === D1 && e.type === 'published'))
  R = await post('publications/delete', { ref: 'corfu|2026-09-29|img' }); ok('no se puede borrar una publicación ya publicada', R.ok === false && /Meta/.test(R.error.message))
  R = await post('publications/delete', { ref: 'corfu|2026-10-02|tz' }); ok('borrar publicación no publicada', R.ok === true)
  // Estadísticas de publicaciones
  ok('se pide el permiso de estadísticas', new URL((await post('instagram/connect', {})).url).searchParams.get('scope').includes('instagram_business_manage_insights'))
  R = await post('insights/refresh'); const ins = R.insights?.find((i) => i.channel_id === D1)
  ok('métricas del publicado guardadas', R.ok === true && ins && ins.metrics.reach > 0 && 'saved' in ins.metrics && !ins.error)
  ok('bootstrap devuelve métricas', (await get('bootstrap')).insights.some((i) => i.channel_id === D1))
  const calls = mock.state.insightCalls; await post('insights/refresh'); ok('no se repiten métricas recientes', mock.state.insightCalls === calls)
  await query('UPDATE post_insights SET fetched_at = $1', ['2000-01-01T00:00:00Z']); mock.state.noInsightsPerm = true
  R = await post('insights/refresh'); const ins2 = R.insights.find((i) => i.channel_id === D1)
  ok('sin permiso: aviso de reconectar y se conservan las cifras', /reconectar|conectar/i.test(ins2.error || '') && ins2.metrics.reach === ins.metrics.reach)
  ok('…y la cuenta sigue conectada', (await acct('teatrocorfu7')).status === 'connected'); mock.state.noInsightsPerm = false
  // Historial de la cuenta (publicaciones hechas fuera de Nowepost)
  await query('UPDATE post_insights SET fetched_at = $1', ['2000-01-01T00:00:00Z'])
  R = await post('insights/refresh'); const hist = R.insights.filter((i) => i.source === 'instagram')
  ok('importa el historial de los últimos 90 días', hist.length === 2 && hist.some((h) => h.tipo === 'reel' && h.metrics.reach > 0) && hist.some((h) => h.tipo === 'carrusel'))
  ok('lo publicado desde Nowepost no se duplica', R.insights.filter((i) => i.external_url?.includes('/p/M1') || i.channel_id === D1).length === 1)
  // Primer comentario automático
  R = await pub('corfu|2026-09-30|fc', { first_comment: '#uno #dos', destinations: [D(ACC)] })
  R = await post('destinations/publish', { id: R.destinations[0].id })
  ok('primer comentario publicado tras publicar', R.destination.status === 'published' && mock.state.comments?.some((c) => c.message === '#uno #dos'))
  ok('bootstrap devuelve el primer comentario', (await get('bootstrap')).publications.some((p) => p.first_comment === '#uno #dos'))
  // Plantillas y hashtags
  R = await post('snippets/save', { kind: 'hashtags', name: 'Teatro', body: '#teatro #madrid', project_id: 'corfu' }); ok('guardar banco de hashtags', R.ok && R.snippets.length === 1)
  R = await post('snippets/delete', { id: R.snippets[0].id }); ok('borrar banco de hashtags', R.ok && R.snippets.length === 0)
  // Aprobación del cliente
  R = await post('review/create', { project_id: 'corfu', date_from: '2026-09-28', date_to: '2026-10-04', label: 'Semana 40' }); const TK = R.token
  ok('crear enlace de aprobación', R.ok && TK.length > 20)
  const pubGet = async (route) => (await fetch(`${APP}/api/index?r=${route}`)).json()
  R = await pubGet(`review/view&t=${TK}`); ok('el enlace se abre sin sesión', R.ok && R.link.date_from === '2026-09-28')
  ok('enlace inventado → 404', (await pubGet('review/view&t=nope')).ok === false)
  const fb = (body) => fetch(`${APP}/api/index?r=review/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CalendApp': '1' }, body: JSON.stringify({ t: TK, ...body }) }).then((r) => r.json())
  ok('pedir cambios exige comentario', (await fb({ ref: 'corfu|2026-09-29|img', decision: 'changes' })).ok === false)
  ok('publicación fuera del rango rechazada', (await fb({ ref: 'corfu|2026-11-01|x', decision: 'approved' })).ok === false)
  R = await fb({ ref: 'corfu|2026-09-29|img', decision: 'changes', comment: 'Cambiad la foto', author: 'Ana' }); ok('el cliente pide cambios sin cuenta', R.ok && R.feedback.length === 1)
  const B2 = await get('bootstrap')
  ok('el equipo ve la respuesta y recibe aviso', B2.feedback.some((f) => f.comment === 'Cambiad la foto') && B2.notifications.some((n) => n.kind === 'review_changes'))
  ok('force_reauth en la URL de autorización', new URL((await post('instagram/connect', { force_reauth: true })).url).searchParams.get('force_reauth') === 'true')
  R = await post('accounts/check', { id: ACC }); ok('comprobar cuenta devuelve cuota real de Meta', R.quota?.total === 50)
  R = await post('accounts/refresh', { id: ACC }); ok('renovar token', R.ok === true)
  R = await cron('refresh'); ok('job de renovación de tokens', R.ok === true)

  mock.state.failAuth = true
  R = await pub('corfu|2026-09-29|tok', { caption: 'x', destinations: [D(ACC)] })
  R = await post('destinations/publish', { id: R.destinations[0].id }); ok('token rechazado → destino en error', R.destination.status === 'failed')
  ok('…y la cuenta queda marcada como caducada', (await acct('teatrocorfu7')).status === 'expired')
  ok('un fallo de publicación genera aviso', (await get('bootstrap')).notifications.some((n) => n.kind === 'failed'))
  mock.state.failAuth = false
  R = await post('accounts/disconnect', { id: ACC }); ok('desconectar cuenta', R.ok === true)
  const enc2 = (await query(`SELECT access_token_enc FROM social_accounts WHERE username = 'teatrocorfu7'`)).rows[0].access_token_enc
  ok('tras desconectar no queda token', enc2 === null)
  R = await post('accounts/add', { username: '@nuevacuenta', project_id: 'chandrio' }); ok('añadir cuenta nueva sin tocar código', R.ok === true)
  R = await post('accounts/update', { id: ACC2, project_id: 'ticketea' }); ok('relación proyecto↔cuenta editable', R.ok === true)
  ok('relé de medios rechaza firma inválida', (await fetch(`${APP}/api/media?u=aaa&e=1&s=bbb`)).status === 403)
  const Media = await import('../media.js')
  const rel = new URL(Media.relayUrl(IMG, { headers: { host: '127.0.0.1:8900', 'x-forwarded-proto': 'http' } }))
  ok('relé de medios sirve un JPEG con firma válida', (await fetch(rel)).headers.get('content-type') === 'image/jpeg')
  await post('auth/logout')
  ok('tras cerrar sesión, acciones bloqueadas', (await status('accounts/add', { method: 'POST', headers: H(), body: '{"username":"zzz"}' })) === 401)
} catch (e) { console.error('EXCEPCIÓN', e); fail++ }
console.log(`---- ${pass} OK, ${fail} fallos`)
app.close(); mock.server.close()
process.exit(fail ? 1 : 0)
