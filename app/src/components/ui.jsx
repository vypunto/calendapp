import { Children, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { initials, isVideoFile, isVideoUrl, projectColor, splitMedia, thumbOf } from '../lib/data.js'
import { useApp } from '../store.jsx'
import { ACCOUNT_STATUS } from '../lib/social.jsx'
import { destLabel } from '../lib/destinations.js'

// ── Iconos ────────────────────────────────────────────────────────────────
const P = {
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  search: '<circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  camera: '<path d="M14.5 4h-5L8 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  play: '<path d="m7 4 13 8-13 8z" fill="currentColor"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  bookmark: '<path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7M19 12H5"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 13 5.22 3.48a.5.5 0 0 0 .78-.42V7.94a.5.5 0 0 0-.78-.42L16 11"/>',
  text: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
  story: '<circle cx="12" cy="12" r="9" stroke-dasharray="3.2 3"/><circle cx="12" cy="12" r="4"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.9 4.24A9 9 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  sheet: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
}

export function Icon({ name, size = 16, className, style }) {
  return (
    <svg className={`ico ${className || ''}`} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: P[name] || '' }} />
  )
}

export const tipoIcon = { imagen: 'image', video: 'video', reel: 'video', carrusel: 'layers', historia: 'story', texto: 'text' }

// ── Canales ───────────────────────────────────────────────────────────────
const CHANNEL_STYLE = {
  instagram: { bg: 'linear-gradient(135deg,#f9a43a,#e1306c 55%,#833ab4)' },
  tiktok: { bg: '#111' },
  facebook: { bg: '#1877f2' },
  linkedin: { bg: '#0a66c2' },
  twitter: { bg: '#111' },
  youtube: { bg: '#ff0000' },
  web: { bg: '#6b7280' },
  otros: { bg: '#9ca3af' },
}

function ChannelGlyph({ k, s }) {
  const c = { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (k) {
    case 'instagram': return <svg {...c}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r=".6" fill="#fff" /></svg>
    case 'facebook': return <svg {...c} fill="#fff" stroke="none"><path d="M14 8V6.5c0-.8.3-1.2 1.3-1.2H17V2h-2.6C11.5 2 10 3.7 10 6.2V8H8v3.3h2V22h4V11.3h2.6L17 8z" /></svg>
    case 'linkedin': return <svg {...c} fill="#fff" stroke="none"><path d="M4 9h3.5v11H4zM5.75 3.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM10 9h3.3v1.5c.6-1 1.8-1.8 3.5-1.8 3.2 0 3.7 2.1 3.7 4.8V20H17v-5.6c0-1.3-.1-2.9-1.8-2.9s-1.8 1.500-1.800 2.900V20H10z" /></svg>
    case 'tiktok': return <svg {...c}><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.3 2.4 1.9 4 4.5 4.2" /></svg>
    case 'youtube': return <svg {...c} fill="#fff" stroke="none"><path d="m10 8.5 6 3.5-6 3.5z" /></svg>
    case 'twitter': return <svg {...c}><path d="M5 4l14 16M19 4 5 20" /></svg>
    default: return <svg {...c}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
  }
}

export function ChannelTile({ canal, size = 24, onMedia }) {
  const k = (canal || '').toLowerCase().trim() || 'otros'
  const st = CHANNEL_STYLE[k] || CHANNEL_STYLE.otros
  const key = CHANNEL_STYLE[k] ? k : 'otros'
  return (
    <span className={`channel-tile ${onMedia ? 'on-media' : ''}`} style={{ width: size, height: size, background: st.bg, borderRadius: size * 0.3 }} title={canal || 'Sin canal'}>
      <ChannelGlyph k={key} s={Math.round(size * 0.58)} />
    </span>
  )
}

// ── Estados ───────────────────────────────────────────────────────────────
const PUB_TONE = { publicado: '', programado: 'green', borrador: 'no-dot', cancelado: 'red', 'en edición': 'amber', aprobado: 'green', error: 'red', publicando: 'amber' }
const REQ_TONE = { pendiente: 'amber', 'en revisión': 'blue', aprobado: 'green', rechazado: 'red' }
const STATE_DOT = { publicado: '#8b918d', programado: '#7553f0', borrador: '#c3c8c4', cancelado: '#c23a3a', 'en edición': '#d18a1f', aprobado: '#7553f0', error: '#c23a3a', publicando: '#d18a1f' }
export const stateDot = (estado) => STATE_DOT[(estado || '').toLowerCase().trim()] || '#c3c8c4'

export function StatusBadge({ estado, kind = 'pub', glass }) {
  if (!estado) return null
  const k = estado.toLowerCase().trim()
  if (glass) return <span className="badge glass" style={{ '--dot': stateDot(estado) }}>{estado}</span>
  const tone = (kind === 'req' ? REQ_TONE : PUB_TONE)[k] ?? ''
  return <span className={`badge ${tone}`}>{estado}</span>
}

const PRIO = { Baja: '#9ca3af', Media: '#3b82f6', Alta: '#f59e0b', 'Muy alta': '#dc2626' }
export const PriorityLabel = ({ prioridad }) => (
  <span className="prio"><i style={{ background: PRIO[prioridad] || PRIO.Media }} />{prioridad || 'Media'}</span>
)

// ── Miniaturas ────────────────────────────────────────────────────────────
export function Thumb({ media, tipo, size = '', style, project }) {
  const [broken, setBroken] = useState(false)
  const src = thumbOf(media)
  useEffect(() => setBroken(false), [media])
  return (
    <div className={`thumb ${size}`} style={project && !(src && !broken) ? { background: projectColor(project).bg, color: projectColor(project).dot, ...style } : style}>
      {src && !broken ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /> : <Icon name={tipoIcon[tipo] || 'image'} size={size === 'lg' ? 22 : size === 'sm' ? 13 : 16} />}
    </div>
  )
}

export function Cover({ media, tipo, iconSize = 30, showPlay = true }) {
  const [broken, setBroken] = useState(false)
  const src = thumbOf(media)
  const file = !src && isVideoFile(media) ? media.split(',')[0].trim() : null
  useEffect(() => setBroken(false), [media])
  const show = (src || file) && !broken
  return (
    <>
      {src && !broken ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
        : file && !broken ? <video src={`${file}#t=0.1`} preload="metadata" muted playsInline onError={() => setBroken(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        : <Icon name={tipoIcon[tipo] || 'image'} size={iconSize} />}
      {show && showPlay && isVideoUrl(media) && <div className="play"><span><Icon name="play" size={16} /></span></div>}
    </>
  )
}

export function ProjectAvatar({ name, size = 32 }) {
  const c = projectColor(name)
  return <div className="avatar" style={{ width: size, height: size, background: c.bg, color: c.dot, fontSize: size * 0.34 }}>{initials(name)}</div>
}

export function ProjectPill({ name }) {
  const c = projectColor(name)
  return <span className="pill" style={{ background: c.bg, color: c.text }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot }} />{name}</span>
}

export const firstMedia = (pub) => splitMedia(pub.media)[0] || ''

// ── Modal ─────────────────────────────────────────────────────────────────
export function Modal({ onClose, size = '', children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${size}`} role="dialog" aria-modal="true">{children}</div>
    </div>
  )
}

// ── Popover ───────────────────────────────────────────────────────────────
export function useOutside(ref, onOut) {
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && onOut()
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [ref, onOut])
}


// ── Desplegable propio (mismo aspecto en toda la app, sustituye al <Select> nativo) ───────────
// Acepta <option> como hijos y llama a onChange({ target: { value } }) para no cambiar los usos existentes.
const textOf = (n) => (typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(textOf).join('') : n?.props ? textOf(n.props.children) : '')
export function Select({ id, className = '', value, onChange, disabled, children, placeholder = '', 'aria-label': ariaLabel }) {
  const options = Children.toArray(children).filter((c) => c?.type === 'option').map((c) => ({ value: String(c.props.value ?? textOf(c.props.children)), label: textOf(c.props.children), disabled: !!c.props.disabled }))
  const btn = useRef(null)
  const list = useRef(null)
  const [pos, setPos] = useState(null)
  const [hi, setHi] = useState(-1)
  const current = options.find((o) => o.value === String(value ?? ''))
  const close = () => setPos(null)
  const open = () => {
    if (disabled) return
    const r = btn.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom
    const h = Math.min(320, options.length * 36 + 12)
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 200) - 8)), width: Math.max(r.width, 200), top: below < h + 12 && r.top > below ? undefined : r.bottom + 6, bottom: below < h + 12 && r.top > below ? window.innerHeight - r.top + 6 : undefined })
    setHi(options.findIndex((o) => o.value === String(value ?? '')))
  }
  useEffect(() => {
    if (!pos) return undefined
    const out = (e) => { if (!list.current?.contains(e.target) && !btn.current?.contains(e.target)) close() }
    const key = (e) => {
      if (['Escape', 'ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) e.stopPropagation() // que no cierre el diálogo que lo contiene
      if (e.key === 'Escape') { close(); btn.current?.focus() } else if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(options.length - 1, i + 1)) } else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(0, i - 1)) } else if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); pick(options[hi]) }
    }
    document.addEventListener('mousedown', out)
    document.addEventListener('keydown', key, true)
    window.addEventListener('resize', close)
    const scroll = (e) => { if (!list.current?.contains(e.target)) close() } // el desplazamiento de la propia lista no la cierra
    document.addEventListener('scroll', scroll, true)
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', key, true); window.removeEventListener('resize', close); document.removeEventListener('scroll', scroll, true) }
  })
  useEffect(() => { if (pos && hi >= 0) list.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' }) }, [hi, pos])
  const pick = (o) => { if (o.disabled) return; close(); btn.current?.focus(); if (o.value !== String(value ?? '')) onChange?.({ target: { value: o.value } }) }
  const filters = className.includes('filters-select')
  return (
    <div className={`menu-wrap ${filters ? '' : 'select-wrap'}`}>
      <button type="button" ref={btn} id={id} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={!!pos} disabled={disabled} className={`select select-btn ${className}`} onClick={() => (pos ? close() : open())}
        onKeyDown={(e) => { if (!pos && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); open() } }}>
        <span className={current ? '' : 'ph'}>{current ? current.label : placeholder || '\u00a0'}</span>
      </button>
      {pos && createPortal(
        <div ref={list} className="popover select-pop" role="listbox" style={{ position: 'fixed', left: pos.left, top: pos.top ?? 'auto', bottom: pos.bottom ?? 'auto', width: pos.width }}>
          {options.map((o, i) => (
            <button type="button" key={`${o.value}-${i}`} data-i={i} role="option" aria-selected={o.value === String(value ?? '')} disabled={o.disabled}
              className={`pop-item ${o.value === String(value ?? '') ? 'on' : ''} ${i === hi ? 'hi' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => pick(o)}>
              <span className="trunc">{o.label || '\u00a0'}</span>{o.value === String(value ?? '') && <Icon name="check" size={14} style={{ marginLeft: 'auto', color: 'var(--accent-600)' }} />}
            </button>
          ))}
        </div>, document.body)}
    </div>
  )
}

export function ProjectFilter({ projects, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false))
  const toggle = (p) => onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p])
  const label = value.length === 0 ? 'Todos los proyectos' : value.length === 1 ? value[0] : `${value.length} proyectos`
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="select filters-select" style={{ textAlign: 'left', minWidth: 190 }} onClick={() => setOpen((o) => !o)}>{label}</button>
      {open && (
        <div className="popover">
          {value.length > 0 && <button className="pop-item" style={{ color: 'var(--accent-600)', fontWeight: 600 }} onClick={() => onChange([])}><Icon name="x" size={13} /> Quitar filtros</button>}
          {projects.map((p) => {
            const c = projectColor(p)
            return (
              <button key={p} className="pop-item" onClick={() => toggle(p)}>
                <input type="checkbox" className="check" readOnly checked={value.includes(p)} />
                <span className="dot" style={{ background: c.dot }} /> <span className="trunc">{p}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Empty({ icon = 'calendar', title, children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={30} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  )
}

export function PageHead({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      <div className="page-actions">{children}</div>
    </div>
  )
}

// ── Kpis (una sola superficie, sin tarjetas sueltas) ──────────────────────
export function Kpis({ items }) {
  return (
    <div className="panel kpis">
      {items.map((k) => {
        const inner = <><b>{k.value}</b><span>{k.label}</span></>
        return k.onClick
          ? <button key={k.label} className={`kpi ${k.active ? 'on' : ''}`} onClick={k.onClick}>{inner}</button>
          : <div key={k.label} className="kpi">{inner}</div>
      })}
    </div>
  )
}

// ── Menú contextual ───────────────────────────────────────────────────────
export function Menu({ items, label = 'Más acciones' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false))
  return (
    <div className="menu-wrap" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button className="icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}><Icon name="more" size={16} /></button>
      {open && (
        <div className="popover right" role="menu" style={{ minWidth: 190 }}>
          {items.filter(Boolean).map((it) => it.href
            ? <a key={it.label} className="pop-item" role="menuitem" href={it.href} target="_blank" rel="noreferrer"><Icon name={it.icon} size={15} />{it.label}</a>
            : <button key={it.label} className="pop-item" role="menuitem" onClick={() => { setOpen(false); it.onClick() }}><Icon name={it.icon} size={15} />{it.label}</button>)}
        </div>
      )}
    </div>
  )
}

export function DemoBanner() {
  const app = useApp()
  if (!app.demo) return null
  return (
    <div className="banner demo"><Icon name="flame" size={15} /><span className="grow"><b>Modo demo</b> · datos de ejemplo, no se guarda nada en la hoja.</span><button onClick={app.exitDemo}>Salir</button></div>
  )
}

// ── Cuentas y destinos ────────────────────────────────────────────────────
export function AccountStatusBadge({ status }) {
  const st = ACCOUNT_STATUS[status] || ACCOUNT_STATUS.pending
  return <span className={`badge ${st.tone || 'no-dot'}`}>{st.label}</span>
}

const ACCOUNT_DOT = { connected: 'var(--accent)', demo: 'var(--blue)', expired: '#d18a1f', error: 'var(--red)' }
export const accountDot = (status) => ACCOUNT_DOT[status] || 'var(--ink-4)'

// Estado de un destino (una cuenta concreta) dentro de una publicación.
export function DestBadge({ dest, glass }) {
  return <StatusBadge estado={destLabel(dest.status)} glass={glass} />
}
