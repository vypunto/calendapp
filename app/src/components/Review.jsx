// Aprobación del cliente: el equipo crea un enlace y el cliente revisa las piezas sin cuenta.
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store.jsx'
import { api } from '../lib/api.js'
import { isoDate, pubRef } from '../lib/destinations.js'
import { PROJECTS, prettyProject, projectById, resolveProject } from '../lib/projects.js'
import { splitMedia } from '../lib/data.js'
import { Cover, Icon, Modal, Select, tipoIcon } from './ui.jsx'
import logo from '../assets/logo_nowepost.png'

export const refOf = (p) => p.ref || pubRef(p)
const pad = (n) => String(n).padStart(2, '0')
const fmtDay = (d) => d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
const linkUrl = (token) => `${window.location.origin}${window.location.pathname}#/review/${token}`
export const reviewToken = () => (window.location.hash.match(/^#\/review\/([\w-]{16,})/) || [])[1] || null

function weekRange(offset = 0) {
  const d = new Date(); const day = (d.getDay() + 6) % 7
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + offset * 7)
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6)
  return [isoDate(mon), isoDate(sun)]
}

// ── Lado del equipo: crear y gestionar enlaces ────────────────────────────
export function ReviewLinksModal({ onClose }) {
  const app = useApp()
  const { reviewLinks, createReviewLink, deleteReviewLink } = app.social
  const defProject = resolveProject(app.projectsFilter[0] || app.account?.proyecto)?.id || ''
  const [project, setProject] = useState(defProject)
  const [[from, to], setRange] = useState(() => weekRange(1))
  const [label, setLabel] = useState('')
  const [copied, setCopied] = useState('')
  const [busy, setBusy] = useState(false)
  const count = app.publications.filter((p) => p.fecha && (!project || resolveProject(p.proyecto)?.id === project) && isoDate(p.fecha) >= from && isoDate(p.fecha) <= to && p.estado !== 'Cancelado').length
  const copy = async (t) => { try { await navigator.clipboard.writeText(linkUrl(t)); setCopied(t); setTimeout(() => setCopied(''), 2000) } catch { window.prompt('Copia el enlace:', linkUrl(t)) } }
  const create = async () => {
    setBusy(true)
    try { const t = await createReviewLink({ project_id: project || null, date_from: from, date_to: to, label: label.trim() || `${projectById(project)?.name ? prettyProject(projectById(project).name) + ' · ' : ''}${from} → ${to}` }); await copy(t); setLabel('') } finally { setBusy(false) }
  }
  return (
    <Modal onClose={onClose}>
      <div className="dialog-head"><div><h2>Aprobación del cliente</h2><small>Un enlace para que el cliente vea las piezas y las apruebe o pida cambios, sin cuenta.</small></div>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={16} /></button></div>
      <div className="dialog-body" style={{ display: 'grid', gap: 14 }}>
        <div className="field-row">
          <div className="field"><span className="label">Proyecto</span>
            <Select className="select" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Proyecto">
              <option value="">Todos los proyectos</option>{PROJECTS.map((p) => <option key={p.id} value={p.id}>{prettyProject(p.name)}</option>)}
            </Select></div>
          <div className="field"><span className="label">Periodo</span>
            <div className="segmented">{[['Esta semana', 0], ['Próxima', 1], ['En 2 semanas', 2]].map(([l, o]) => { const r = weekRange(o); return <button type="button" key={o} className={r[0] === from && r[1] === to ? 'on' : ''} onClick={() => setRange(r)}>{l}</button> })}</div></div>
        </div>
        <div className="field-row">
          <div className="field"><label htmlFor="rv-from">Desde</label><input id="rv-from" type="date" className="input" value={from} onChange={(e) => setRange([e.target.value, to < e.target.value ? e.target.value : to])} /></div>
          <div className="field"><label htmlFor="rv-to">Hasta</label><input id="rv-to" type="date" className="input" value={to} min={from} onChange={(e) => setRange([from, e.target.value])} /></div>
        </div>
        <div className="field"><label htmlFor="rv-label">Nombre del enlace <span className="muted" style={{ fontWeight: 400 }}>· opcional</span></label><input id="rv-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="p. ej. Semana 42 · Teatro Corfú" /></div>
        <button className="btn btn-accent" disabled={busy || !count} onClick={create}><Icon name="link" size={15} /> {count ? `Crear y copiar enlace · ${count} pieza${count === 1 ? '' : 's'}` : 'No hay piezas en ese periodo'}</button>
        {reviewLinks.length > 0 && <div className="rv-links">
          <span className="label">Enlaces activos</span>
          {reviewLinks.map((l) => (
            <div key={l.token} className="rv-link">
              <div className="grow"><b className="trunc">{l.label || `${l.date_from} → ${l.date_to}`}</b><small>{l.feedback} respuesta{l.feedback === 1 ? '' : 's'} · caduca {new Date(l.expires_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</small></div>
              <button className="btn btn-sm" onClick={() => copy(l.token)}><Icon name={copied === l.token ? 'check' : 'copy'} size={13} /> {copied === l.token ? 'Copiado' : 'Copiar'}</button>
              <button className="icon-btn" onClick={() => deleteReviewLink(l.token)} aria-label="Desactivar enlace" title="Desactivar enlace"><Icon name="trash" size={14} /></button>
            </div>
          ))}
        </div>}
      </div>
    </Modal>
  )
}

// Respuestas del cliente en el detalle de una publicación.
export function ReviewFeedback({ pub }) {
  const app = useApp()
  const ref = refOf(pub)
  const list = app.social.feedback.filter((f) => f.ref === ref)
  if (!list.length) return null
  return (
    <div className="pd-card">
      <h3>Opinión del cliente <span className="pd-count">{list.length}</span></h3>
      <div className="rv-fb-list">{list.map((f) => (
        <div key={f.id} className={`rv-fb ${f.decision}`}>
          <span className="rv-fb-ico"><Icon name={f.decision === 'approved' ? 'check' : 'message'} size={14} /></span>
          <div className="grow"><b>{f.author} {f.decision === 'approved' ? 'la aprobó' : 'pide cambios'}</b>{f.comment && <p>{f.comment}</p>}
            <small>{new Date(f.at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{f.label ? ` · ${f.label}` : ''}</small></div>
        </div>
      ))}</div>
    </div>
  )
}

// ── Lado del cliente: página pública ──────────────────────────────────────
function ReviewCard({ pub, last, token, onDone }) {
  const [mode, setMode] = useState(null)
  const [comment, setComment] = useState('')
  const [author, setAuthor] = useState(() => { try { return localStorage.getItem('nw_review_name') || '' } catch { return '' } })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const media = splitMedia(pub.media)
  const [idx, setIdx] = useState(0)
  const send = async (decision) => {
    setBusy(true); setErr('')
    try {
      try { localStorage.setItem('nw_review_name', author.trim()) } catch { /* sin almacenamiento */ }
      const r = await api('review/feedback', { method: 'POST', body: { t: token, ref: pub.ref || pubRef(pub), title: pub.titulo, decision, comment: comment.trim(), author: author.trim() } })
      onDone(r.feedback); setMode(null); setComment('')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <article className={`rv-card ${last ? `is-${last.decision}` : ''}`}>
      <div className="rv-media">
        <Cover media={media[idx] || ''} tipo={pub.tipo} iconSize={42} />
        {media.length > 1 && <div className="rv-dots">{media.map((_, i) => <button key={i} className={i === idx ? 'on' : ''} onClick={() => setIdx(i)} aria-label={`Imagen ${i + 1}`} />)}</div>}
        <span className="rv-type"><Icon name={tipoIcon[pub.tipo] || 'image'} size={12} /> {pub.tipo || 'imagen'}</span>
      </div>
      <div className="rv-body">
        <small className="rv-date">{fmtDay(pub.fecha)}{pub.hora ? ` · ${pub.hora}` : ''}</small>
        <h3>{pub.titulo}</h3>
        {pub.copy ? <p className="rv-copy">{pub.copy}</p> : <p className="rv-copy muted">Sin texto.</p>}
        {last && <div className={`rv-state ${last.decision}`}><Icon name={last.decision === 'approved' ? 'check' : 'message'} size={14} /> {last.decision === 'approved' ? `Aprobada por ${last.author}` : `${last.author} pidió cambios: “${last.comment}”`}</div>}
        {mode === 'changes' ? (
          <div className="rv-form">
            <textarea className="textarea" autoFocus value={comment} onChange={(e) => setComment(e.target.value)} placeholder="¿Qué cambiarías?" maxLength={1500} />
            <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Tu nombre" maxLength={80} />
            <div className="rv-actions"><button className="btn" onClick={() => setMode(null)}>Cancelar</button><button className="btn btn-primary" disabled={busy || !comment.trim()} onClick={() => send('changes')}>Enviar comentario</button></div>
          </div>
        ) : (
          <div className="rv-actions">
            <button className="btn" onClick={() => setMode('changes')}><Icon name="message" size={14} /> Pedir cambios</button>
            <button className="btn btn-accent" disabled={busy} onClick={() => send('approved')}><Icon name="check" size={14} /> Aprobar</button>
          </div>
        )}
        {err && <p className="lg-err" role="alert" style={{ margin: '8px 0 0' }}>{err}</p>}
      </div>
    </article>
  )
}

export default function ReviewPage({ token }) {
  const app = useApp()
  const [state, setState] = useState({ loading: true })
  useEffect(() => {
    api('review/view', { query: { t: token } }).then((r) => setState({ link: r.link, feedback: r.feedback, server: r.publications || [] })).catch((e) => setState({ error: e.message }))
  }, [token])
  const pubs = useMemo(() => {
    if (!state.link) return []
    const pid = state.link.project_id
    const sheet = app.publications.filter((p) => p.fecha && (!pid || resolveProject(p.proyecto)?.id === pid) && p.estado !== 'Cancelado' && isoDate(p.fecha) >= state.link.date_from && isoDate(p.fecha) <= state.link.date_to)
    const known = new Set(sheet.map(pubRef))
    const extra = (state.server || []).filter((s) => !known.has(s.ref)).map((s) => ({
      id: `srv-${s.ref}`, ref: s.ref, proyecto: projectById(s.project_id)?.name || '', fecha: new Date(`${s.ref.split('|')[1]}T12:00:00`), titulo: s.title, copy: s.caption, media: (s.media || []).join(', '), tipo: s.tipo,
    }))
    return [...sheet, ...extra].sort((a, b) => a.fecha - b.fecha)
  }, [app.publications, state.link, state.server])
  const lastOf = (p) => { const r = p.ref || pubRef(p); return [...(state.feedback || [])].reverse().find((f) => f.ref === r) }
  const approved = pubs.filter((p) => lastOf(p)?.decision === 'approved').length
  const project = state.link?.project_id ? projectById(state.link.project_id)?.name : null
  const d = (s) => new Date(`${s}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
  return (
    <div className="rv">
      <header className="rv-head"><img src={logo} alt="Nowepost" /><span>Revisión de contenido</span></header>
      {state.loading || app.loading && !pubs.length ? <p className="rv-msg">Cargando…</p>
        : state.error ? <div className="rv-msg"><Icon name="info" size={22} /><b>{state.error}</b><span>Pide al equipo un enlace nuevo.</span></div>
        : <>
          <section className="rv-hero">
            <h1>{state.link.label || (project ? prettyProject(project) : 'Contenido programado')}</h1>
            <p>{project ? `${prettyProject(project)} · ` : ''}del {d(state.link.date_from)} al {d(state.link.date_to)}</p>
            {pubs.length > 0 && <div className="rv-progress"><div style={{ width: `${(approved / pubs.length) * 100}%` }} /><span>{approved} de {pubs.length} aprobadas</span></div>}
          </section>
          {pubs.length === 0 ? <p className="rv-msg">No hay publicaciones en este periodo.</p>
            : <div className="rv-list">{pubs.map((p) => <ReviewCard key={p.id} pub={p} last={lastOf(p)} token={token} onDone={(feedback) => setState((s) => ({ ...s, feedback }))} />)}</div>}
          <footer className="rv-foot">Tus respuestas llegan al equipo al momento. Puedes cambiar de opinión cuando quieras.</footer>
        </>}
    </div>
  )
}

// Última respuesta del cliente por publicación (para marcarla en el calendario y en Inicio).
export function useReviewMap() {
  const app = useApp()
  return useMemo(() => {
    const m = new Map()
    app.social.feedback.forEach((f) => { const cur = m.get(f.ref); if (!cur || f.at > cur.at) m.set(f.ref, f) })
    return m
  }, [app.social.feedback])
}
export function ReviewMark({ f }) {
  if (!f) return null
  return <span className={`rv-mark ${f.decision}`} title={f.decision === 'approved' ? `Aprobada por ${f.author}` : `${f.author} pide cambios: ${f.comment}`}><Icon name={f.decision === 'approved' ? 'check' : 'message'} size={10} /></span>
}
