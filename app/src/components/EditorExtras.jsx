// Ayudas del editor: plantillas y bancos de hashtags, primer comentario y mejor momento para publicar.
import { useMemo, useRef, useState } from 'react'
import { useApp } from '../store.jsx'
import { resolveProject } from '../lib/projects.js'
import { Icon, useOutside } from './ui.jsx'

const HASHTAG = /#[\p{L}\p{N}_]+/gu
export const countTags = (s) => (String(s || '').match(HASHTAG) || []).length

// ── Plantillas y hashtags ─────────────────────────────────────────────────
export function SnippetMenu({ kind, project, current, onInsert }) {
  const app = useApp()
  const { snippets, saveSnippet, deleteSnippet } = app.social
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false))
  const projectId = resolveProject(project)?.id || null
  const list = snippets.filter((s) => s.kind === kind && (!s.project_id || s.project_id === projectId))
  const label = kind === 'template' ? 'Plantillas' : 'Hashtags'
  if (app.demo || !app.isAuth) return null
  const save = async () => {
    if (!name.trim() || !current.trim()) return
    await saveSnippet({ kind, name: name.trim(), body: kind === 'hashtags' ? (current.match(HASHTAG) || []).join(' ') : current, project_id: projectId })
    setName('')
  }
  return (
    <div className="snip" ref={ref}>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(!open)} aria-expanded={open}><Icon name={kind === 'template' ? 'text' : 'layers'} size={13} /> {label}{list.length ? <em>{list.length}</em> : null}</button>
      {open && (
        <div className="snip-pop" role="menu">
          <p className="snip-h">{label}{projectId ? ' de este proyecto y generales' : ' generales'}</p>
          {list.length === 0 && <p className="muted snip-empty">{kind === 'template' ? 'Guarda un texto que repitas a menudo (cabecera, firma, CTA…).' : 'Guarda un grupo de hashtags para insertarlo con un clic.'}</p>}
          {list.map((s) => (
            <div key={s.id} className="snip-row">
              <button type="button" className="grow" onClick={() => { onInsert(s.body); setOpen(false) }} title="Insertar">
                <b>{s.name}{!s.project_id && <small> · general</small>}</b><span className="trunc">{s.body}</span>
              </button>
              <button type="button" className="icon-btn" onClick={() => deleteSnippet(s.id)} aria-label={`Borrar ${s.name}`}><Icon name="trash" size={13} /></button>
            </div>
          ))}
          <div className="snip-save">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'template' ? 'Nombre para el texto actual' : 'Nombre para los hashtags actuales'} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }} />
            <button type="button" className="btn btn-sm" disabled={!name.trim() || !current.trim() || (kind === 'hashtags' && !countTags(current))} onClick={save}>Guardar</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Primer comentario ─────────────────────────────────────────────────────
export function FirstComment({ value, onChange, copy, setCopy }) {
  const tags = (copy.match(HASHTAG) || [])
  const moveTags = () => {
    const rest = copy.replace(HASHTAG, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim()
    setCopy(rest)
    onChange([value.trim(), tags.join(' ')].filter(Boolean).join(' '))
  }
  const total = countTags(copy) + countTags(value)
  return (
    <div className="field">
      <label htmlFor="e-first">Primer comentario <span className="muted" style={{ fontWeight: 400 }}>· opcional</span></label>
      <div className="copy-wrap">
        <textarea id="e-first" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Se publica como comentario justo después del post. Ideal para los hashtags." style={{ minHeight: 64 }} />
        <div className="copy-foot">
          {tags.length > 0 ? <button type="button" className="link-inline" onClick={moveTags}><Icon name="arrowRight" size={12} /> Mover {tags.length} hashtag{tags.length === 1 ? '' : 's'} del texto aquí</button> : <span>Solo Instagram</span>}
          <span className={total > 30 ? 'over' : ''}>{total}/30 hashtags</span>
        </div>
      </div>
    </div>
  )
}

// ── Mejor momento para publicar (a partir de las métricas reales) ─────────
const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const inter = (m) => m.total_interactions ?? ((m.likes || 0) + (m.comments || 0) + (m.saved || 0) + (m.shares || 0))
const pad = (n) => String(n).padStart(2, '0')

export function useBestTime(project) {
  const app = useApp()
  return useMemo(() => {
    const pid = resolveProject(project)?.id
    const all = app.social.insights.items.filter((i) => Object.keys(i.metrics || {}).length && i.published_at)
    const own = all.filter((i) => pid && i.project_id === pid)
    const rows = own.length >= 4 ? own : all
    if (rows.length < 4) return null
    const buckets = new Map()
    rows.forEach((r) => {
      const d = new Date(r.published_at)
      const k = `${d.getDay()}-${Math.floor(d.getHours() / 2) * 2}`
      const b = buckets.get(k) || { day: d.getDay(), hour: Math.floor(d.getHours() / 2) * 2, sum: 0, n: 0 }
      b.sum += inter(r.metrics); b.n++
      buckets.set(k, b)
    })
    const avgAll = rows.reduce((a, r) => a + inter(r.metrics), 0) / rows.length
    const best = [...buckets.values()].map((b) => ({ ...b, avg: b.sum / b.n })).sort((a, b) => b.avg - a.avg)[0]
    if (!best || best.avg <= avgAll) return null
    return { ...best, lift: avgAll ? Math.round(((best.avg - avgAll) / avgAll) * 100) : 0, scope: own.length >= 4 ? 'project' : 'all', n: rows.length }
  }, [app.social.insights.items, project])
}

export function BestTimeHint({ project, fecha, onPick }) {
  const best = useBestTime(project)
  if (!best) return null
  const from = fecha ? new Date(`${fecha}T12:00:00`) : new Date()
  const next = new Date(from)
  next.setDate(from.getDate() + ((best.day - from.getDay() + 7) % 7))
  const date = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`
  const time = `${pad(best.hour + 1)}:00`
  return (
    <button type="button" className="best-time" onClick={() => onPick(date, time)} title={`Basado en ${best.n} publicaciones con métricas${best.scope === 'project' ? ' de este proyecto' : ''}`}>
      <Icon name="flame" size={14} />
      <span><b>Mejor momento:</b> {DOW[best.day]} hacia las {time}{best.lift > 0 ? ` · +${best.lift}% interacción` : ''}</span>
      <em>Usar</em>
    </button>
  )
}
