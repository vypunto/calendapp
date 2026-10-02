// Sesión de administración sin estado: cookie firmada (HMAC) y HttpOnly. No depende de la contraseña del cliente.
import crypto from 'node:crypto'
import * as cfg from './config.js'
import * as cryptoBox from './crypto.js'
import { query } from './db.js'
import { fail } from './http.js'
import * as Users from './users.js'

const COOKIE = 'calendapp_sid'
const TTL = 12 * 3600

const parseCookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => c.trim().split(/=(.*)/s).slice(0, 2)).filter(([k]) => k))
const isHttps = (req) => (req.headers['x-forwarded-proto'] || '') === 'https' || !!req.socket?.encrypted

function readSession(req) {
  if (!cfg.appKey()) return null
  const raw = parseCookies(req)[COOKIE]
  if (!raw) return null
  const [payload, sig] = raw.split('.')
  if (!payload || !sig || !cryptoBox.safeEqual(cryptoBox.sign(payload, 'session'), sig)) return null
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return s.admin && s.exp > Date.now() / 1000 && s.sid ? s : null
  } catch { return null }
}

export const check = (req) => readSession(req) !== null
export const requireSession = (req) => { if (!check(req)) fail('unauthorized', 'Inicia sesión en el servidor para continuar.', 401) }
export const sessionHash = (req) => crypto.createHash('sha256').update(readSession(req)?.sid ?? '').digest('hex')

// Protección CSRF: cabecera propia + JSON (no enviables desde un formulario ajeno).
export function requireCsrf(req) {
  if (req.headers['x-calendapp'] !== '1' || !String(req.headers['content-type'] || '').toLowerCase().includes('application/json')) fail('csrf', 'Petición no válida.', 403)
}

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim()

function issue(req, res, claims) {
  if (!cfg.appKey()) fail('not_configured', 'Falta APP_KEY en la configuración del servidor.', 503)
  const t = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(JSON.stringify({ admin: true, sid: crypto.randomBytes(16).toString('hex'), exp: t + TTL, ...claims })).toString('base64url')
  res.setHeader('Set-Cookie', `${COOKIE}=${payload}.${cryptoBox.sign(payload, 'session')}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL}${isHttps(req) ? '; Secure' : ''}`)
}

// Usuario de la sesión actual (null en sesiones antiguas de contraseña compartida).
export function user(req) {
  const s = readSession(req)
  return s?.email ? { email: s.email, name: s.name || '', mustChange: !!s.mc } : null
}

// Con correo: usuarios del equipo. Sin correo: contraseña compartida ADMIN_PASSWORD (compatibilidad).
export async function login(req, res, password, email = '') {
  const ip = clientIp(req)
  const t = Math.floor(Date.now() / 1000)
  await query('DELETE FROM login_attempts WHERE at < $1', [t - 900])
  if ((await query('SELECT COUNT(*)::int AS n FROM login_attempts WHERE ip = $1', [ip])).rows[0].n >= 8) fail('rate_limited', 'Demasiados intentos. Espera unos minutos.', 429)
  let claims = null
  if (String(email).trim()) {
    const u = await Users.find(email)
    if (Users.verifyPassword(password, u?.pass_hash) && u) claims = { email: u.email, name: u.name, mc: u.must_change ? 1 : 0 }
  } else {
    // Se ignoran espacios o saltos de línea al principio/final (error típico al pegar el valor en Vercel).
    const plain = cfg.get('ADMIN_PASSWORD').trim()
    if (plain !== '' && cryptoBox.safeEqual(plain, String(password).trim())) claims = {}
  }
  if (!claims) {
    await query('INSERT INTO login_attempts (ip, at) VALUES ($1, $2)', [ip, t])
    await new Promise((r) => setTimeout(r, 700))
    return false
  }
  issue(req, res, claims)
  return true
}

export async function changePassword(req, res, current, next) {
  const me = user(req)
  if (!me) fail('unauthorized', 'Inicia sesión con tu correo para cambiar la contraseña.', 401)
  const pw = String(next)
  if (pw.length < 10 || !/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) fail('weak_password', 'La nueva contraseña necesita al menos 10 caracteres, con letras y números.', 422)
  const u = await Users.find(me.email)
  if (!u || !Users.verifyPassword(current, u.pass_hash)) fail('bad_credentials', 'La contraseña actual no es correcta.', 401)
  if (Users.verifyPassword(pw, u.pass_hash)) fail('same_password', 'La nueva contraseña debe ser distinta de la actual.', 422)
  await Users.setPassword(me.email, pw)
  issue(req, res, { email: u.email, name: u.name, mc: 0 })
  return { email: u.email, name: u.name, mustChange: false }
}

export const logout = (req, res) => res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps(req) ? '; Secure' : ''}`)
