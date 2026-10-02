// Avisos del equipo: se guardan (una vez por clave) y se envían por email con Resend si está configurado.
// Variables: RESEND_API_KEY, NOTIFY_FROM (remitente verificado en Resend) y NOTIFY_TO (opcional; por defecto, los usuarios del equipo).
import * as cfg from './config.js'
import { query, now } from './db.js'

export const emailConfigured = () => cfg.get('RESEND_API_KEY') !== '' && cfg.get('NOTIFY_FROM') !== ''

async function recipients() {
  const fixed = cfg.get('NOTIFY_TO').split(',').map((s) => s.trim()).filter(Boolean)
  if (fixed.length) return fixed
  return (await query('SELECT email FROM users ORDER BY email')).rows.map((r) => r.email)
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export async function sendEmail(subject, text, link = null) {
  if (!emailConfigured()) return false
  const to = await recipients()
  if (!to.length) return false
  const url = link ? `${cfg.get('APP_URL').replace(/\/+$/, '')}/${link.replace(/^\/+/, '')}` : cfg.get('APP_URL')
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#15161a">
    <div style="height:6px;border-radius:6px;background:linear-gradient(90deg,#6a5af9,#ee4f8c,#ffa64a);margin-bottom:20px"></div>
    <h2 style="margin:0 0 10px;font-size:19px">${esc(subject)}</h2><p style="margin:0 0 20px;line-height:1.55;color:#4b4d57">${esc(text)}</p>
    ${url ? `<a href="${esc(url)}" style="display:inline-block;background:#15161a;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600">Abrir Nowepost</a>` : ''}
    <p style="margin-top:28px;font-size:12px;color:#8c8f9c">Aviso automático de Nowepost.</p></div>`
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${cfg.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: cfg.get('NOTIFY_FROM'), to, subject: `Nowepost · ${subject}`, text: `${text}\n\n${url || ''}`, html }),
    })
    if (!r.ok) console.error('[notify] Resend', r.status, (await r.text()).slice(0, 200))
    return r.ok
  } catch (e) { console.error('[notify]', e.message); return false }
}

// Registra el aviso si no existía (la clave evita duplicados) y lo envía por email. Nunca lanza.
export async function notify(key, kind, title, message, link = null) {
  try {
    const r = await query('INSERT INTO notifications (key, kind, title, message, link, at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (key) DO NOTHING RETURNING key', [key, kind, title, message, link, now()])
    if (!r.rows.length) return false
    if (await sendEmail(title, message, link)) await query('UPDATE notifications SET emailed = 1 WHERE key = $1', [key])
    return true
  } catch (e) { console.error('[notify]', e.message); return false }
}

export const recent = async (limit = 40) => (await query('SELECT key, kind, title, message, link, emailed, at FROM notifications ORDER BY at DESC LIMIT $1', [limit])).rows
  .map((r) => ({ ...r, emailed: !!r.emailed }))
