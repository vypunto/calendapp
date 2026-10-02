// Cliente de la API de Instagram con inicio de sesión de Instagram (graph.instagram.com).
// Endpoints, parámetros y permisos según la documentación oficial de Meta.
import * as cfg from './config.js'
import { request } from './http.js'
import { MetaException } from './meta-exception.js'

export const SCOPES = 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights,instagram_business_manage_comments'
const v = (path) => `${cfg.graphBase()}/${cfg.graphVersion()}/${path.replace(/^\/+/, '')}`

async function call(method, url, params) {
  const [http, json, raw] = await request(method, url, params)
  if (http >= 400 || json?.error || json?.error_message || json === null) throw MetaException.fromResponse(http, json, raw)
  return json
}
const row = (j) => (Array.isArray(j?.data) && j.data[0] && typeof j.data[0] === 'object' ? j.data[0] : j)

// force_reauth (documentado por Meta) obliga a volver a iniciar sesión, útil para elegir otra cuenta.
export function authorizeUrl(state, forceReauth = false) {
  const q = new URLSearchParams({ client_id: cfg.get('META_APP_ID'), redirect_uri: cfg.get('META_REDIRECT_URI'), response_type: 'code', scope: SCOPES, state })
  if (forceReauth) q.set('force_reauth', 'true')
  return `${cfg.oauthAuthorize()}?${q}`
}

// Token de corta duración (1 h). La respuesta documentada es {"data":[{...}]}; se acepta también el formato plano.
export async function exchangeCode(code) {
  const json = await call('POST', cfg.oauthToken(), {
    client_id: cfg.get('META_APP_ID'), client_secret: cfg.get('META_APP_SECRET'), grant_type: 'authorization_code',
    redirect_uri: cfg.get('META_REDIRECT_URI'), code: String(code).replace(/#_$/, ''),
  })
  const r = row(json)
  if (!r.access_token) throw new MetaException('Instagram no devolvió un token de acceso.')
  return { user_id: String(r.user_id ?? ''), access_token: String(r.access_token), permissions: r.permissions ?? null }
}

// Token de larga duración (60 días). Solo se puede pedir desde el servidor.
export async function longLived(shortToken) {
  const j = await call('GET', `${cfg.graphBase()}/access_token`, { grant_type: 'ig_exchange_token', client_secret: cfg.get('META_APP_SECRET'), access_token: shortToken })
  return { access_token: String(j.access_token), expires_in: Number(j.expires_in ?? 5184000) }
}

// Renovación: el token debe tener al menos 24 h, seguir vigente y la cuenta haber concedido instagram_business_basic.
export async function refresh(token) {
  const j = await call('GET', `${cfg.graphBase()}/refresh_access_token`, { grant_type: 'ig_refresh_token', access_token: token })
  return { access_token: String(j.access_token), expires_in: Number(j.expires_in ?? 5184000) }
}

export async function me(token) {
  const base = row(await call('GET', v('me'), { fields: 'user_id,username', access_token: token }))
  let extra = {}
  try { extra = row(await call('GET', v('me'), { fields: 'account_type,profile_picture_url,followers_count,media_count', access_token: token })) } catch (e) { if (!(e instanceof MetaException)) throw e }
  return { ...base, ...extra }
}

export async function createContainer(igId, token, params) {
  const j = await call('POST', v(`${igId}/media`), { ...params, access_token: token })
  if (!j.id) throw new MetaException('Instagram no devolvió el identificador del contenedor.')
  return String(j.id)
}

export async function containerStatus(containerId, token) {
  return String((await call('GET', v(containerId), { fields: 'status_code', access_token: token })).status_code ?? 'IN_PROGRESS')
}

export async function publish(igId, token, creationId) {
  const j = await call('POST', v(`${igId}/media_publish`), { creation_id: creationId, access_token: token })
  if (!j.id) throw new MetaException('Instagram no confirmó la publicación.')
  return String(j.id)
}

// Uso de la cuota de publicación. El total lo indica Meta en la respuesta (no se fija aquí).
export async function quota(igId, token) {
  const r = row(await call('GET', v(`${igId}/content_publishing_limit`), { fields: 'quota_usage,config', access_token: token }))
  return { usage: Number(r.quota_usage ?? 0), total: r.config?.quota_total != null ? Number(r.config.quota_total) : null, duration: Number(r.config?.quota_duration ?? 86400) }
}

export async function permalink(mediaId, token) {
  try { return (await call('GET', v(mediaId), { fields: 'permalink', access_token: token })).permalink ?? null } catch (e) { if (e instanceof MetaException) return null; throw e }
}

// Métricas de una publicación (requiere instagram_business_manage_insights). Cada formato admite métricas distintas;
// si Meta rechaza alguna (cambian entre versiones), se reintenta con el conjunto básico.
const METRICS = {
  historia: 'reach,views,replies,shares,total_interactions',
  reel: 'reach,views,likes,comments,saved,shares,total_interactions,ig_reels_avg_watch_time',
  default: 'reach,views,likes,comments,saved,shares,total_interactions',
}
const BASIC = 'reach,likes,comments,saved,shares'
const readInsights = (j) => Object.fromEntries((j?.data || []).map((d) => [d.name, Number(d.total_value?.value ?? d.values?.[0]?.value ?? 0)]))

export async function mediaInsights(mediaId, token, tipo) {
  const metric = METRICS[tipo] || METRICS.default
  try {
    return readInsights(await call('GET', v(`${mediaId}/insights`), { metric, access_token: token }))
  } catch (e) {
    if (!(e instanceof MetaException) || e.isAuthError() || e.isPermissionError?.() || tipo === 'historia') throw e
    return readInsights(await call('GET', v(`${mediaId}/insights`), { metric: BASIC, access_token: token }))
  }
}

// Comentario en una publicación propia (requiere instagram_business_manage_comments).
export async function comment(mediaId, token, message) {
  const j = await call('POST', v(`${mediaId}/comments`), { message, access_token: token })
  return String(j.id ?? '')
}
