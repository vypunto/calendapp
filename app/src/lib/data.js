// Capa de datos de CalendApp. Portada del bundle original sin cambiar el
// contrato con Google Sheets ni con el Apps Script.

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
export const DAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export const PUBLICATIONS_CSV =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRajBUvB3OQ0d3aHcKWnz716xuj2i7_B6rGosEgLXQkeE5nvB1G737dWHVRKLSVsE3lIJ3CC28w1PF-/pub?gid=525718474&single=true&output=csv'
export const REQUESTS_CSV =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRajBUvB3OQ0d3aHcKWnz716xuj2i7_B6rGosEgLXQkeE5nvB1G737dWHVRKLSVsE3lIJ3CC28w1PF-/pub?gid=1088150027&single=true&output=csv'
export const SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycby7s21MuJEE_B42i3DtC-iXe7c26PHaIVy45SL5rTOpsVC0Dhq_ICCllxqlkH_edSs/exec'

export const TIPOS = ['imagen', 'video', 'reel', 'carrusel', 'historia', 'texto']
export const CHANNELS = ['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'Twitter', 'YouTube', 'Web', 'Otros']
export const PUB_ESTADOS = ['Programado', 'Publicado', 'Borrador', 'Cancelado', 'En edición']
export const REQ_ESTADOS = ['Pendiente', 'En revisión', 'Aprobado', 'Rechazado']
export const PRIORIDADES = ['Baja', 'Media', 'Alta', 'Muy alta']

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h &= h
  }
  return Math.abs(h)
}

export { projectColor } from './projects.js'

export function initials(name) {
  return (name || '').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

// ── Fechas ────────────────────────────────────────────────────────────────
export function parseDate(v) {
  if (!v) return null
  const t = v.trim()
  let m
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return new Date(+m[1], +m[2] - 1, +m[3])
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})T/))) return new Date(+m[1], +m[2] - 1, +m[3])
  if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return new Date(+m[3], +m[2] - 1, +m[1])
  if ((m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/))) return new Date(+m[3], +m[2] - 1, +m[1])
  if (/^\d{5}$/.test(t)) {
    const n = parseInt(t)
    if (n >= 40000 && n <= 55000) return new Date(Date.UTC(1899, 11, 30) + n * 864e5)
  }
  const d = new Date(t)
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export const sameDay = (a, b) =>
  !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export const fmtLong = (d) => (d ? `${DAYS_LONG[d.getDay()][0].toUpperCase()}${DAYS_LONG[d.getDay()].slice(1)} ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}` : '')
export const fmtShort = (d) => (d ? `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}` : '')
export const fmtFull = (d) => (d ? `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}` : '')
export const toInputDate = (d) => (d instanceof Date && !isNaN(d) ? new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10) : '')

export function timeAgo(ts) {
  if (!ts) return ''
  const m = Math.floor((Date.now() - ts) / 6e4)
  return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h`
}

// ── Medios ────────────────────────────────────────────────────────────────
export const splitMedia = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])

const PREVIEW = import.meta.env.MODE === 'preview'
// Solo para la vista previa de Claude, que bloquea imágenes externas. El build real nunca lo usa.
const PREVIEW_TONES = ['#d5dad6', '#c8cfca', '#dedcd4', '#cdd3d8', '#d8d2cc', '#c5cec8']
function placeholder(url) {
  if (!url || url.startsWith('data:')) return url
  const h = hashStr(url)
  const a = PREVIEW_TONES[h % PREVIEW_TONES.length]
  const b = PREVIEW_TONES[(h >> 3) % PREVIEW_TONES.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="600" height="750" fill="url(#g)"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export function thumbOf(url) {
  const out = rawThumbOf(url)
  return PREVIEW ? placeholder(out) : out
}

function rawThumbOf(url) {
  if (!url) return null
  const t = url.split(',')[0].trim()
  let m = t.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([^&?/]+)/)
  if (m) return `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`
  if (/^blob:|^data:image/.test(t)) return t
  m = t.match(/drive\.google\.com\/file\/d\/([^/?]+)/) || (t.includes('drive.google.com') && t.match(/[?&]id=([\w-]+)/)) || t.match(/docs\.google\.com\/uc\?.*id=([\w-]+)/)
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`
  if (t.includes('googleusercontent.com') || t.includes('unsplash.com')) return t
  if (/\.(jpg|jpeg|png|gif|webp|avif)(\?|#|$)/i.test(t)) return t
  return null
}

export const isVideoFile = (url) => /\.(mp4|mov|webm)(\?|#|$)/i.test((url || '').split(',')[0].trim())

export function isVideoUrl(url) {
  if (!url) return false
  const t = url.split(',')[0].trim()
  return t.includes('youtube.com') || t.includes('youtu.be') || /\.(mp4|mov|webm)(\?|#|$)/i.test(t)
}

export const hashtagsOf = (text) => [...new Set((text || '').match(/#[\p{L}\p{N}_]+/gu) || [])]

// ── Hoja de cálculo ───────────────────────────────────────────────────────
function normalizeHeader(s) {
  try {
    return s.trim().toLowerCase()
      .replace(/[áàäâã]/g, 'a').replace(/[éèëê]/g, 'e').replace(/[íìïî]/g, 'i')
      .replace(/[óòöôõ]/g, 'o').replace(/[úùüû]/g, 'u').replace(/[ñ]/g, 'n')
  } catch {
    return s.trim()
  }
}

function parseCsvRows(text) {
  const rows = []
  let row = []
  let cell = ''
  let i = 0
  while (i < text.length) {
    if (text[i] === '"') {
      i++
      while (i < text.length) {
        if (text[i] === '"' && text[i + 1] === '"') { cell += '"'; i += 2 }
        else if (text[i] === '"') { i++; break }
        else cell += text[i++]
      }
    } else if (text[i] === ',') { row.push(cell); cell = ''; i++ }
    else if (text[i] === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i += 2 }
    else if (text[i] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++ }
    else cell += text[i++]
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

function csvToObjects(text) {
  if (typeof text !== 'string' || !text.trim()) return []
  try {
    const rows = parseCsvRows(String(text).replace(/^﻿/, ''))
    if (rows.length < 2) return []
    const headers = rows[0].map(normalizeHeader)
    return rows.slice(1).filter((r) => r.some((c) => c.trim())).map((r) => {
      const o = {}
      headers.forEach((h, i) => { o[h] = r[i] || '' })
      return o
    })
  } catch {
    return []
  }
}

const looksLikeCsv = (s) => typeof s === 'string' && !s.includes('<!DOCTYPE') && !s.includes('<html')

function withTimeout(url, opts = {}, ms = 12000) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  return fetch(url, { ...opts, signal: ctl.signal }).finally(() => clearTimeout(t))
}

async function fetchCsv(url, bust = false) {
  const u = bust ? `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}` : url
  const attempts = [
    (x) => withTimeout(x, { mode: 'cors' }),
    (x) => withTimeout(`https://corsproxy.io/?url=${encodeURIComponent(x)}`),
    (x) => withTimeout(`https://api.allorigins.win/raw?url=${encodeURIComponent(x)}`),
    (x) => withTimeout(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(x)}`),
    (x) => withTimeout(`https://thingproxy.freeboard.io/fetch/${encodeURIComponent(x)}`),
  ]
  for (const attempt of attempts) {
    try {
      const r = await attempt(u)
      if (r.ok) {
        const text = await r.text()
        if (looksLikeCsv(text)) return text
      }
    } catch { /* siguiente intento */ }
  }
  throw new Error('No se pudo acceder a la hoja. Asegúrate de haberla publicado en Archivo → Compartir → Publicar en la web (formato CSV).')
}

function toPublication(r, i) {
  return {
    id: String(i),
    proyecto: (r.proyecto || r.project || '').toUpperCase(),
    fecha: parseDate(r.fecha || r.date || ''),
    titulo: r.titulo || r.title || '',
    copy: r.copy || r.descripcion || '',
    media: r['imagen/video'] || r.imagen || r.video || r.media || r.url || '',
    url_post: r.url_post || r['url post'] || r.urlpost || '',
    tipo: (r.tipo || r.type || '').toLowerCase().trim(),
    canal: r.canal || r.channel || '',
    estado: r.estado || r.status || '',
    hora: (r.hora || r.time || '').trim(),
    promocionado: (r.promocionado || 'No').trim(),
    presupuesto: r.presupuesto || '',
  }
}

export async function fetchPublications(url, bust = false) {
  return csvToObjects(await fetchCsv(url, bust)).map(toPublication).filter((p) => p.proyecto && p.fecha)
}

export async function fetchRequests(url, bust = false) {
  return csvToObjects(await fetchCsv(url, bust))
    .map((r, i) => ({
      id: `sheet-${i}`,
      proyecto: (r.proyecto || r.project || '').toUpperCase(),
      fecha: parseDate(r.fecha || r.date || '') || new Date(),
      titulo: r.titulo || r['titulo del post'] || r.title || '',
      info: r.info || r['informacion adicional'] || r.descripcion || '',
      contenido: r.contenido || r.content || r['link contenido'] || '',
      tipo: (r.tipo || r.type || 'imagen').toLowerCase().trim(),
      solicitante: r.solicitante || r.nombre || r.name || '',
      canal: r.canal || r.channel || '',
      estado: r.estado || r.status || 'Pendiente',
      promocionado: (r.promocionado || 'No').trim(),
      presupuesto: r.presupuesto || '',
      prioridad: r.prioridad || r.priority || 'Media',
    }))
    .filter((r) => r.proyecto)
}

export const requestToPublication = (r) => ({
  id: `approved-${r.id}`,
  proyecto: r.proyecto,
  fecha: r.fecha,
  titulo: r.titulo,
  copy: r.info || '',
  media: r.contenido || '',
  url_post: '',
  tipo: r.tipo || 'imagen',
  canal: r.canal || '',
  estado: 'Aprobado',
  promocionado: r.promocionado || 'No',
  presupuesto: r.presupuesto || '',
  solicitante: r.solicitante || '',
})

// ── Apps Script ───────────────────────────────────────────────────────────
const postNoCors = (url, body) => fetch(url, { method: 'POST', mode: 'no-cors', body: JSON.stringify(body) }).then(() => ({ ok: true }))

export const scriptUpdatePublication = (url, rowIndex, data) => postNoCors(url, { action: 'updatePublication', rowIndex, data })
export const scriptSubmitRequest = (url, data) => postNoCors(url, data)
export const scriptDeleteRequest = (url, rowIndex) => postNoCors(url, { action: 'delete', rowIndex })

export async function scriptUpdateRequest(url, rowIndex, data) {
  const r = await fetch(url, { method: 'POST', body: JSON.stringify({ action: 'update', rowIndex, data }) })
  if (!r.ok) throw new Error(`Error ${r.status}`)
  return r.json()
}

export async function scriptCreatePublication(url, data) {
  await fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, action: 'publicacion', fechaSolicitud: new Date().toLocaleDateString('es-ES') }),
  })
  return { ok: true }
}

export async function scriptUploadFile(url, nombre, tipo, datos) {
  const body = JSON.stringify({ action: 'uploadFile', nombre, tipo, datos })
  async function parse(res) {
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch { throw new Error('Respuesta inválida del script') }
    if (!json.url) throw new Error('El script no devolvió URL')
    return json
  }
  try {
    return await parse(await withTimeout(url, { method: 'POST', body }, 90000))
  } catch (e) {
    console.warn('uploadFile directo falló:', e.message, '— reintentando vía proxy CORS')
  }
  return parse(await withTimeout(`https://corsproxy.io/?url=${encodeURIComponent(url)}`, { method: 'POST', body }, 90000))
}

export function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = (e) => resolve(e.target.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

// ── Estados pendientes ────────────────────────────────────────────────────
export const isPendingRequest = (r) => !r.estado || r.estado === 'Pendiente' || r.estado === 'En revisión'
export const PASSWORD = 'GL12345!'
