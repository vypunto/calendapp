// Usuarios del equipo: contraseñas con scrypt (sal por usuario). Nunca se guardan ni registran en claro.
import crypto from 'node:crypto'
import { query } from './db.js'

// Cuentas iniciales. La contraseña inicial NO está en el repositorio: se lee de INITIAL_TEAM_PASSWORD
// la primera vez que se crea cada usuario, y deben cambiarla en su primer acceso.
export const SEED_USERS = [
  { email: 'v.santiago@grupoelchandrio.com', name: 'V. Santiago' },
  { email: 'm.guerrero@grupoelchandrio.com', name: 'M. Guerrero' },
  { email: 'n.romo@grupoelchandrio.com', name: 'N. Romo' },
]

export function hashPassword(plain) {
  const salt = crypto.randomBytes(16)
  return `scrypt$${salt.toString('base64url')}$${crypto.scryptSync(plain, salt, 64).toString('base64url')}`
}

// Hash de relleno para que un correo inexistente tarde lo mismo que uno válido.
const DUMMY = hashPassword(crypto.randomBytes(12).toString('hex'))

export function verifyPassword(plain, stored) {
  const [alg, salt, hash] = String(stored || DUMMY).split('$')
  if (alg !== 'scrypt' || !salt || !hash) return false
  const want = Buffer.from(hash, 'base64url')
  const got = crypto.scryptSync(String(plain), Buffer.from(salt, 'base64url'), want.length)
  return crypto.timingSafeEqual(want, got)
}

export const normEmail = (e) => String(e || '').trim().toLowerCase()

export async function find(email) {
  return (await query('SELECT email, name, pass_hash, must_change FROM users WHERE email = $1', [normEmail(email)])).rows[0] || null
}

export async function setPassword(email, plain) {
  await query('UPDATE users SET pass_hash = $1, must_change = 0, updated_at = $2 WHERE email = $3', [hashPassword(plain), new Date().toISOString(), normEmail(email)])
}
