// Configuración solo por variables de entorno (en Vercel: Project → Settings → Environment Variables).
// Se recortan espacios y saltos de línea (error típico al pegar valores en Vercel).
export const get = (key, fallback = '') => {
  const v = process.env[key] === undefined ? '' : String(process.env[key]).trim()
  return v !== '' ? v : fallback
}

export const graphVersion = () => get('META_GRAPH_VERSION', 'v25.0')
// Los hosts solo se sustituyen en pruebas locales con un Meta simulado.
export const graphBase = () => get('META_GRAPH_BASE', 'https://graph.instagram.com').replace(/\/+$/, '')
export const oauthAuthorize = () => get('META_OAUTH_AUTHORIZE', 'https://www.instagram.com/oauth/authorize')
export const oauthToken = () => get('META_OAUTH_TOKEN', 'https://api.instagram.com/oauth/access_token')

export function appKey() {
  const b = Buffer.from(get('APP_KEY'), 'base64')
  return b.length === 32 ? b : null
}

export function appUrl(req) {
  const u = get('APP_URL')
  if (u) return u.replace(/\/+$/, '') + '/'
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'localhost'
  const proto = req?.headers?.['x-forwarded-proto'] || (String(host).startsWith('localhost') || String(host).startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}/`
}

export const flags = () => ({
  meta_app: get('META_APP_ID') !== '' && get('META_APP_SECRET') !== '',
  redirect_uri: get('META_REDIRECT_URI') !== '',
  crypto: appKey() !== null,
  admin: get('ADMIN_PASSWORD') !== '',
  cron: get('CRON_SECRET') !== '',
  email: get('RESEND_API_KEY') !== '' && get('NOTIFY_FROM') !== '',
})
