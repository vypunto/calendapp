// Cliente del backend de CalendApp (carpeta api/). Nunca recibe ni envía tokens de Instagram:
// los tokens viven cifrados en el servidor.
export class ApiError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status }
}

const ENDPOINT = 'api/index'

export async function api(route, { method = 'GET', body, timeout = 20000, query } = {}) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeout)
  let res
  try {
    res = await fetch(`${ENDPOINT}?r=${encodeURIComponent(route)}${query ? `&${new URLSearchParams(query)}` : ''}`, {
      method, credentials: 'same-origin', signal: ctl.signal,
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-CalendApp': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (e) {
    throw new ApiError('unavailable', 'No se pudo contactar con el servidor de Nowepost.')
  } finally { clearTimeout(t) }
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* no es JSON: el backend no está desplegado */ }
  if (!json || typeof json !== 'object') throw new ApiError('unavailable', 'El servidor de Nowepost no está disponible en esta dirección.', res.status)
  if (!res.ok || json.ok === false) throw new ApiError(json.error?.code || 'error', json.error?.message || `Error ${res.status}`, res.status)
  return json
}
