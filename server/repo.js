// Acceso a datos. Los tokens solo se leen aquí (descifrados) para publicar; nunca se serializan hacia el cliente.
import { query, tx as withTx, now, isoAfter } from './db.js'
import * as cryptoBox from './crypto.js'

import crypto from 'node:crypto'

const one = async (q, text, params) => (await q(text, params)).rows[0] ?? null
const jsonOr = (s, fallback) => { try { return JSON.parse(s || '') ?? fallback } catch { return fallback } }

export const tx = withTx

export function accountPublic(r) {
  let status = r.status
  if (status === 'connected' && r.token_expires_at && r.token_expires_at < now()) status = 'expired'
  return {
    id: Number(r.id), project_id: r.project_id, platform: r.platform, external_account_id: r.external_account_id, username: r.username, status,
    token_expires_at: r.token_expires_at, metadata: jsonOr(r.metadata, {}), last_error: r.last_error, connected_at: r.connected_at,
  }
}

export const accounts = async () => (await query('SELECT * FROM social_accounts ORDER BY username')).rows.map(accountPublic)
export const account = (id) => one(query, 'SELECT * FROM social_accounts WHERE id = $1', [Number(id) || 0])
export const accountByUsername = (platform, username) => one(query, 'SELECT * FROM social_accounts WHERE platform = $1 AND lower(username) = lower($2)', [platform, username])
export const accountByExternal = (platform, ext) => one(query, 'SELECT * FROM social_accounts WHERE platform = $1 AND external_account_id = $2', [platform, ext])
export async function projectExists(id) { return !id || !!(await one(query, 'SELECT 1 AS x FROM projects WHERE id = $1', [id])) }
export const projects = async () => (await query('SELECT id, name FROM projects ORDER BY name')).rows

export async function addAccount(platform, username, projectId) {
  const t = now()
  const r = await one(query, `INSERT INTO social_accounts (project_id, platform, username, status, created_at, updated_at) VALUES ($1, $2, $3, 'pending', $4, $4) RETURNING id`,
    [projectId || null, platform, username.toLowerCase(), t])
  return Number(r.id)
}

const ACCOUNT_FIELDS = new Set(['project_id', 'external_account_id', 'username', 'access_token_enc', 'token_expires_at', 'token_refreshed_at', 'status', 'metadata', 'last_error', 'connected_at'])
const CHANNEL_FIELDS = new Set(['status', 'scheduled_at', 'published_at', 'external_post_id', 'external_url', 'container_id', 'error_message', 'locked_at', 'timezone'])
async function update(table, allowed, id, fields) {
  const keys = Object.keys(fields).filter((k) => allowed.has(k))
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).concat(`updated_at = $${keys.length + 1}`)
  await query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${keys.length + 2}`, [...keys.map((k) => fields[k]), now(), id])
}
export const updateAccount = (id, fields) => update('social_accounts', ACCOUNT_FIELDS, id, fields)
export const updateChannel = (id, fields) => update('publication_channels', CHANNEL_FIELDS, id, fields)
export const deleteAccount = (id) => query('DELETE FROM social_accounts WHERE id = $1', [id])

export function token(acc) {
  if (!acc.access_token_enc) throw new Error('La cuenta no tiene credenciales guardadas. Conéctala primero.')
  return cryptoBox.decrypt(acc.access_token_enc)
}

// ── Publicaciones y destinos ────────────────────────────────────────────
export async function upsertPublication(q, ref, previousRef, projectId, title, caption, media, tipo, ratio = null, fit = null, firstComment = null) {
  const t = now()
  let row = await one(q, 'SELECT id FROM publications WHERE ref = $1', [ref])
  if (!row && previousRef) row = await one(q, 'SELECT id FROM publications WHERE ref = $1', [previousRef])
  const mediaJson = JSON.stringify(media)
  if (row) {
    await q('UPDATE publications SET ref = $1, project_id = $2, title = $3, caption = $4, media = $5, tipo = $6, image_ratio = $7, image_fit = $8, updated_at = $9, first_comment = $11 WHERE id = $10', [ref, projectId, title, caption, mediaJson, tipo, ratio, fit, t, row.id, firstComment])
    return Number(row.id)
  }
  const r = await one(q, 'INSERT INTO publications (ref, project_id, title, caption, media, tipo, image_ratio, image_fit, created_at, updated_at, first_comment) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10) RETURNING id', [ref, projectId, title, caption, mediaJson, tipo, ratio, fit, t, firstComment])
  return Number(r.id)
}

export async function logEvent(channelId, type, message = null, q = query) {
  await q('INSERT INTO publication_events (channel_id, at, type, message) VALUES ($1, $2, $3, $4)', [channelId, now(), type, message])
}

// Sincroniza los destinos no publicados con la lista recibida; los publicados no se tocan.
export async function syncChannels(q, publicationId, dests) {
  const t = now()
  const existing = new Map((await q('SELECT * FROM publication_channels WHERE publication_id = $1', [publicationId])).rows.map((r) => [Number(r.social_account_id), r]))
  const keep = new Set()
  for (const d of dests) {
    const accId = Number(d.social_account_id)
    keep.add(accId)
    let status = ['draft', 'scheduled'].includes(d.status) ? d.status : 'draft'
    const when = status === 'scheduled' ? d.scheduled_at ?? null : null
    if (status === 'scheduled' && !when) status = 'draft'
    const tz = d.timezone ?? null
    const old = existing.get(accId)
    if (old) {
      if (['published', 'publishing'].includes(old.status)) continue
      await q('UPDATE publication_channels SET status = $1, scheduled_at = $2, timezone = $3, error_message = NULL, container_id = NULL, updated_at = $4 WHERE id = $5', [status, when, tz, t, old.id])
      if (old.scheduled_at !== when || old.status !== status) {
        await logEvent(old.id, status === 'scheduled' ? (old.scheduled_at ? 'rescheduled' : 'scheduled') : 'draft', when ? `Programado para ${when}` : null, q)
      }
    } else {
      const r = await one(q, 'INSERT INTO publication_channels (publication_id, social_account_id, status, scheduled_at, timezone, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id', [publicationId, accId, status, when, tz, t])
      await logEvent(r.id, 'created', 'Destino añadido', q)
      if (status === 'scheduled') await logEvent(r.id, 'scheduled', `Programado para ${when}`, q)
    }
  }
  for (const [accId, r] of existing) {
    if (!keep.has(accId) && !['published', 'publishing'].includes(r.status)) await q('DELETE FROM publication_channels WHERE id = $1', [r.id])
  }
}

export async function events(limit = 600) {
  const rows = (await query('SELECT channel_id, at, type, message FROM publication_events ORDER BY id DESC LIMIT $1', [limit])).rows
  return rows.reverse().map((r) => ({ channel_id: Number(r.channel_id), at: r.at, type: r.type, message: r.message }))
}

// Elimina la publicación y sus destinos no publicados. Devuelve false si hay destinos ya publicados.
export async function deletePublication(ref) {
  const p = await one(query, 'SELECT id FROM publications WHERE ref = $1', [ref])
  if (!p) return true
  const c = await one(query, `SELECT COUNT(*)::int AS n FROM publication_channels WHERE publication_id = $1 AND status IN ('published','publishing')`, [p.id])
  if (c.n > 0) return false
  await query('DELETE FROM publications WHERE id = $1', [p.id])
  return true
}

export const channelPublic = (r) => ({
  id: Number(r.id), ref: r.ref ?? null, publication_id: Number(r.publication_id), social_account_id: Number(r.social_account_id), status: r.status,
  scheduled_at: r.scheduled_at, published_at: r.published_at, external_post_id: r.external_post_id, external_url: r.external_url, error_message: r.error_message, timezone: r.timezone ?? null,
})

// Contenido guardado en el servidor: permite mostrar publicaciones aunque la hoja no las tenga.
export const publications = async () => (await query('SELECT ref, project_id, title, caption, tipo, media, image_ratio, image_fit, first_comment FROM publications ORDER BY id')).rows
  .map((r) => ({ ref: r.ref, project_id: r.project_id, title: r.title, caption: r.caption, tipo: r.tipo, media: jsonOr(r.media, []), image_ratio: r.image_ratio, image_fit: r.image_fit, first_comment: r.first_comment || '' }))

export async function channels(publicationId = null, q = query) {
  const rows = publicationId
    ? (await q('SELECT c.*, p.ref FROM publication_channels c JOIN publications p ON p.id = c.publication_id WHERE c.publication_id = $1 ORDER BY c.id', [publicationId])).rows
    : (await q('SELECT c.*, p.ref FROM publication_channels c JOIN publications p ON p.id = c.publication_id ORDER BY c.id')).rows
  return rows.map(channelPublic)
}

export const channel = (id) => one(query, 'SELECT c.*, p.ref, p.title, p.caption, p.media, p.tipo, p.project_id, p.image_ratio, p.image_fit, p.first_comment FROM publication_channels c JOIN publications p ON p.id = c.publication_id WHERE c.id = $1', [Number(id) || 0])

// Reserva atómica: evita que dos procesos publiquen el mismo destino.
export async function claim(id, resume = false) {
  const t = now()
  const r = resume
    ? await query(`UPDATE publication_channels SET locked_at = $1, updated_at = $1 WHERE id = $2 AND status = 'publishing' AND (locked_at IS NULL OR locked_at < $3)`, [t, id, isoAfter(-60)])
    : await query(`UPDATE publication_channels SET status = 'publishing', locked_at = $1, attempts = attempts + 1, updated_at = $1 WHERE id = $2 AND status IN ('draft','scheduled','failed')`, [t, id])
  return r.rowCount === 1
}

export const dueChannelIds = async () => (await query(
  `SELECT id FROM publication_channels WHERE (status = 'scheduled' AND scheduled_at <= $1) OR (status = 'publishing' AND container_id IS NOT NULL AND locked_at < $2) ORDER BY scheduled_at`,
  [now(), isoAfter(-60)])).rows.map((r) => Number(r.id))

export const setState = (key, value) => query('INSERT INTO app_state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, value])
export const getState = async (key) => (await one(query, 'SELECT value FROM app_state WHERE key = $1', [key]))?.value ?? null

// Estado del programador: última ejecución y destinos programados cuya hora ya pasó.
export async function schedulerInfo() {
  const over = await one(query, `SELECT COUNT(*)::int AS n FROM publication_channels WHERE status = 'scheduled' AND scheduled_at <= $1`, [now()])
  const pend = await one(query, `SELECT COUNT(*)::int AS n FROM publication_channels WHERE status = 'scheduled' AND scheduled_at > $1`, [now()])
  return { last_run: await getState('scheduler_last_run'), overdue: over.n, upcoming: pend.n }
}

export const cleanStates = () => query('DELETE FROM oauth_states WHERE created_at < $1', [isoAfter(-900)])
export async function saveState(state, projectId, sessionHash) {
  await cleanStates()
  await query('INSERT INTO oauth_states (state, project_id, session_hash, created_at) VALUES ($1, $2, $3, $4)', [state, projectId, sessionHash, now()])
}
export async function consumeState(state) {
  await cleanStates()
  const row = await one(query, 'DELETE FROM oauth_states WHERE state = $1 RETURNING *', [state])
  return row
}

// ── Estadísticas de publicaciones ─────────────────────────────────────────
// Destinos publicados en los últimos `days` días cuyas métricas tienen más de `staleHours` horas (o no existen).
export const insightTargets = async (days = 30, staleHours = 12) => (await query(
  `SELECT c.id, c.social_account_id, c.external_post_id, p.tipo FROM publication_channels c
     JOIN publications p ON p.id = c.publication_id LEFT JOIN post_insights i ON i.channel_id = c.id
   WHERE c.status = 'published' AND c.external_post_id IS NOT NULL AND c.published_at >= $1 AND (i.fetched_at IS NULL OR i.fetched_at < $2)
   ORDER BY i.fetched_at NULLS FIRST, c.published_at DESC`, [isoAfter(-days * 86400), isoAfter(-staleHours * 3600)])).rows

export const saveInsights = (channelId, metrics, error = null) => query(
  `INSERT INTO post_insights (channel_id, metrics, error, fetched_at) VALUES ($1, $2, $3, $4)
   ON CONFLICT (channel_id) DO UPDATE SET metrics = CASE WHEN EXCLUDED.error IS NULL THEN EXCLUDED.metrics ELSE post_insights.metrics END, error = EXCLUDED.error, fetched_at = EXCLUDED.fetched_at`,
  [channelId, JSON.stringify(metrics || {}), error, now()])

export const insights = async () => (await query(
  `SELECT i.channel_id, i.metrics, i.error, i.fetched_at, c.social_account_id, c.published_at, c.external_url, p.ref, p.title, p.tipo, p.project_id
     FROM post_insights i JOIN publication_channels c ON c.id = i.channel_id JOIN publications p ON p.id = c.publication_id ORDER BY c.published_at DESC`)).rows
  .map((r) => ({ channel_id: Number(r.channel_id), social_account_id: Number(r.social_account_id), ref: r.ref, title: r.title, tipo: r.tipo, project_id: r.project_id,
    published_at: r.published_at, external_url: r.external_url, metrics: jsonOr(r.metrics, {}), error: r.error, fetched_at: r.fetched_at, key: `c${r.channel_id}`, source: 'nowepost' }))
  .concat((await query(
    `SELECT m.*, a.project_id FROM account_media m JOIN social_accounts a ON a.id = m.account_id
     WHERE NOT EXISTS (SELECT 1 FROM publication_channels c WHERE c.external_post_id = m.media_id) ORDER BY m.posted_at DESC LIMIT 500`)).rows
    .map((r) => ({ key: `m${r.media_id}`, channel_id: null, social_account_id: Number(r.account_id), ref: null, title: (String(r.caption || '').split('\n')[0].trim().slice(0, 70)) || 'Publicación de Instagram',
      tipo: r.tipo, project_id: r.project_id, published_at: r.posted_at, external_url: r.permalink, thumbnail: r.thumbnail, metrics: jsonOr(r.metrics, {}), error: r.error, fetched_at: r.fetched_at, source: 'instagram' })))

// ── Avisos del scheduler ──────────────────────────────────────────────────
// Programadas que deberían haber salido hace más de `graceMin` minutos y siguen sin publicarse.
export const overdueChannels = async (graceMin = 15) => (await query(
  `SELECT c.id, c.scheduled_at, p.title, a.username FROM publication_channels c JOIN publications p ON p.id = c.publication_id
     LEFT JOIN social_accounts a ON a.id = c.social_account_id WHERE c.status IN ('scheduled','publishing') AND c.scheduled_at < $1`, [isoAfter(-graceMin * 60)])).rows
// Programadas en las próximas `hours` horas cuya cuenta no está conectada (fallarán si nadie la reconecta).
export const atRiskChannels = async (hours = 24) => (await query(
  `SELECT c.id, c.scheduled_at, p.title, a.username, a.status, a.token_expires_at FROM publication_channels c JOIN publications p ON p.id = c.publication_id
     JOIN social_accounts a ON a.id = c.social_account_id WHERE c.status = 'scheduled' AND c.scheduled_at BETWEEN $1 AND $2`, [now(), isoAfter(hours * 3600)])).rows
  .filter((r) => accountPublic(r).status !== 'connected')

// ── Plantillas y bancos de hashtags ───────────────────────────────────────
export const snippets = async () => (await query('SELECT id, project_id, kind, name, body FROM snippets ORDER BY kind, name')).rows.map((r) => ({ ...r, id: Number(r.id) }))
export async function saveSnippet({ id, project_id, kind, name, body }) {
  if (id) { await query('UPDATE snippets SET project_id = $1, kind = $2, name = $3, body = $4 WHERE id = $5', [project_id, kind, name, body, id]); return Number(id) }
  return Number((await one(query, 'INSERT INTO snippets (project_id, kind, name, body, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id', [project_id, kind, name, body, now()])).id)
}
export const deleteSnippet = (id) => query('DELETE FROM snippets WHERE id = $1', [Number(id) || 0])

// ── Enlaces de aprobación para clientes ───────────────────────────────────
export async function createReviewLink({ project_id, label, date_from, date_to, created_by, days = 30 }) {
  const token = crypto.randomBytes(18).toString('base64url')
  await query('INSERT INTO review_links (token, project_id, label, date_from, date_to, created_by, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [token, project_id, label, date_from, date_to, created_by, now(), isoAfter(days * 86400)])
  return token
}
export const reviewLink = async (token) => {
  const r = await one(query, 'SELECT * FROM review_links WHERE token = $1', [String(token || '')])
  return r && r.expires_at > now() ? r : null
}
export const reviewLinks = async () => (await query(
  `SELECT l.*, (SELECT COUNT(*)::int FROM review_feedback f WHERE f.token = l.token) AS feedback FROM review_links l WHERE l.expires_at > $1 ORDER BY l.created_at DESC LIMIT 30`, [now()])).rows
export const deleteReviewLink = (token) => query('DELETE FROM review_links WHERE token = $1', [String(token || '')])
export async function addFeedback(token, ref, decision, comment, author) {
  return Number((await one(query, 'INSERT INTO review_feedback (token, ref, decision, comment, author, at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [token, ref, decision, comment, author, now()])).id)
}
export const feedbackFor = async (token) => (await query('SELECT id, ref, decision, comment, author, at FROM review_feedback WHERE token = $1 ORDER BY at', [token])).rows.map((r) => ({ ...r, id: Number(r.id) }))
export const allFeedback = async () => (await query(
  `SELECT f.id, f.ref, f.decision, f.comment, f.author, f.at, l.label, l.project_id FROM review_feedback f JOIN review_links l ON l.token = f.token ORDER BY f.at DESC LIMIT 500`)).rows.map((r) => ({ ...r, id: Number(r.id) }))

// ── Historial de la cuenta (publicaciones hechas fuera de Nowepost) ───────
export async function upsertAccountMedia(accountId, m, tipo) {
  await query(`INSERT INTO account_media (media_id, account_id, caption, tipo, permalink, thumbnail, posted_at) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (media_id) DO UPDATE SET caption = EXCLUDED.caption, permalink = EXCLUDED.permalink, thumbnail = EXCLUDED.thumbnail`,
  [String(m.id), accountId, String(m.caption || '').slice(0, 2200), tipo, m.permalink || null, m.thumbnail_url || m.media_url || null, new Date(m.timestamp || Date.now()).toISOString().replace(/\.\d{3}Z$/, 'Z')])
}
// Las ya publicadas desde Nowepost se miden por su destino: no se duplican.
export const accountMediaTargets = async (days = 90, staleHours = 24) => (await query(
  `SELECT m.media_id, m.account_id, m.tipo, m.posted_at FROM account_media m
   WHERE m.posted_at >= $1 AND m.tipo <> 'historia' AND (m.fetched_at IS NULL OR m.fetched_at < $2)
     AND NOT EXISTS (SELECT 1 FROM publication_channels c WHERE c.external_post_id = m.media_id)
   ORDER BY m.fetched_at NULLS FIRST, m.posted_at DESC`, [isoAfter(-days * 86400), isoAfter(-staleHours * 3600)])).rows
export const saveAccountMediaInsights = (mediaId, metrics, error = null) => query(
  `UPDATE account_media SET metrics = CASE WHEN $3::text IS NULL THEN $2 ELSE metrics END, error = $3, fetched_at = $4 WHERE media_id = $1`,
  [mediaId, JSON.stringify(metrics || {}), error, now()])
