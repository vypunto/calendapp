// Postgres (Neon en producción). Para pruebas locales, DATABASE_URL=pglite://memory usa Postgres en memoria (PGlite).
import { get } from './config.js'

export const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
export const isoAfter = (seconds) => new Date(Date.now() + seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')

let driverPromise = null
let readyPromise = null

async function makeDriver() {
  const url = get('DATABASE_URL')
  if (url.startsWith('pglite://')) {
    const { PGlite } = await import('@electric-sql/pglite')
    const db = new PGlite()
    const wrap = (q) => async (text, params = []) => { const r = await q.query(text, params); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length } }
    return { query: wrap(db), tx: (fn) => db.transaction(async (t) => fn(wrap(t))) }
  }
  if (!url) throw new Error('Falta DATABASE_URL (cadena de conexión de Neon).')
  const { Pool, neonConfig } = await import('@neondatabase/serverless')
  if (typeof WebSocket === 'undefined') neonConfig.webSocketConstructor = (await import('ws')).default
  const pool = new Pool({ connectionString: url, max: 3 })
  return {
    query: (text, params = []) => pool.query(text, params),
    async tx(fn) {
      const c = await pool.connect()
      try {
        await c.query('BEGIN')
        const out = await fn((text, params = []) => c.query(text, params))
        await c.query('COMMIT')
        return out
      } catch (e) { try { await c.query('ROLLBACK') } catch { /* ya cerrada */ } throw e } finally { c.release() }
    },
  }
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS social_accounts (
     id SERIAL PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE SET NULL, platform TEXT NOT NULL DEFAULT 'instagram',
     external_account_id TEXT, username TEXT NOT NULL, access_token_enc TEXT, token_expires_at TEXT, token_refreshed_at TEXT,
     status TEXT NOT NULL DEFAULT 'pending', metadata TEXT NOT NULL DEFAULT '{}', last_error TEXT, connected_at TEXT,
     created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (platform, username))`,
  `CREATE TABLE IF NOT EXISTS publications (
     id SERIAL PRIMARY KEY, ref TEXT NOT NULL UNIQUE, project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
     title TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL DEFAULT '', media TEXT NOT NULL DEFAULT '[]', tipo TEXT NOT NULL DEFAULT 'imagen',
     created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS publication_channels (
     id SERIAL PRIMARY KEY, publication_id INTEGER NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
     social_account_id INTEGER NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'draft',
     scheduled_at TEXT, published_at TEXT, external_post_id TEXT, external_url TEXT, container_id TEXT, error_message TEXT,
     attempts INTEGER NOT NULL DEFAULT 0, locked_at TEXT, timezone TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
     UNIQUE (publication_id, social_account_id))`,
  `CREATE INDEX IF NOT EXISTS idx_channels_due ON publication_channels (status, scheduled_at)`,
  `CREATE TABLE IF NOT EXISTS publication_events (
     id SERIAL PRIMARY KEY, channel_id INTEGER NOT NULL REFERENCES publication_channels(id) ON DELETE CASCADE, at TEXT NOT NULL, type TEXT NOT NULL, message TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_events_channel ON publication_events (channel_id, at)`,
  `CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY, project_id TEXT, session_hash TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', pass_hash TEXT NOT NULL, must_change INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
]

async function migrate(d) {
  for (const s of SCHEMA) await d.query(s)
  // Formato de imagen (recorte) de la publicación.
  await d.query('ALTER TABLE publications ADD COLUMN IF NOT EXISTS image_ratio TEXT')
  await d.query('ALTER TABLE publications ADD COLUMN IF NOT EXISTS image_fit TEXT')
  // Usuarios del equipo: se crean una vez; no se pisa una contraseña ya cambiada.
  const initial = get('INITIAL_TEAM_PASSWORD').trim()
  if (initial) {
    const { SEED_USERS, hashPassword } = await import('./users.js')
    for (const u of SEED_USERS) {
      if ((await d.query('SELECT 1 FROM users WHERE email = $1', [u.email])).rows.length) continue
      await d.query('INSERT INTO users (email, name, pass_hash, must_change, created_at, updated_at) VALUES ($1, $2, $3, 1, $4, $4) ON CONFLICT (email) DO NOTHING', [u.email, u.name, hashPassword(initial), now()])
    }
  }
  const { rows } = await d.query('SELECT COUNT(*)::int AS n FROM projects')
  if (rows[0].n > 0) return
  const seed = (await import('./seed-projects.json', { with: { type: 'json' } })).default
  const t = now()
  for (const p of seed.projects || []) await d.query('INSERT INTO projects (id, name, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [p.id, p.name, t])
  for (const a of seed.accounts || []) {
    await d.query(`INSERT INTO social_accounts (project_id, platform, username, status, created_at, updated_at) VALUES ($1, $2, $3, 'pending', $4, $4) ON CONFLICT DO NOTHING`,
      [a.projectId ?? null, a.platform ?? 'instagram', String(a.username).toLowerCase(), t])
  }
}

export async function db() {
  driverPromise ??= makeDriver()
  const d = await driverPromise
  readyPromise ??= migrate(d).catch((e) => { readyPromise = null; throw e })
  await readyPromise
  return d
}

export const query = async (text, params) => (await db()).query(text, params)
export const tx = async (fn) => (await db()).tx(fn)
