import { Fragment, useMemo, useState } from 'react'
import { useApp } from '../store.jsx'
import { MONTHS, MONTHS_SHORT, REQ_ESTADOS, thumbOf } from '../lib/data.js'
import { prettyProject, projectById } from '../lib/projects.js'
import { ChannelTile, DemoBanner, Icon, Kpis, PageHead, StatusBadge, Thumb, firstMedia, tipoIcon } from './ui.jsx'

const PERIODS = [['month', 'Este mes'], ['prev', 'Mes anterior'], ['90', '90 días'], ['year', 'Este año'], ['all', 'Todo']]

function periodRange(key) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  if (key === 'month') return [new Date(y, m, 1), new Date(y, m + 1, 0, 23, 59, 59), 'day']
  if (key === 'prev') return [new Date(y, m - 1, 1), new Date(y, m, 0, 23, 59, 59), 'day']
  if (key === '90') return [new Date(y, m, now.getDate() - 89), new Date(y, m, now.getDate(), 23, 59, 59), 'month']
  if (key === 'year') return [new Date(y, 0, 1), new Date(y, 11, 31, 23, 59, 59), 'month']
  return [null, null, 'month']
}

function AreaChart({ points }) {
  const [hover, setHover] = useState(null)
  const W = 720, H = 240, padL = 30, padB = 26, padT = 14, padR = 12
  const max = Math.max(1, ...points.map((p) => p.value))
  const top = Math.max(4, Math.ceil(max / 4) * 4)
  const x = (i) => padL + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - padL - padR))
  const y = (v) => padT + (1 - v / top) * (H - padT - padB)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const area = points.length ? `${line} L${x(points.length - 1)},${H - padB} L${x(0)},${H - padB} Z` : ''
  const step = Math.ceil(points.length / 8)
  const last = points.length - 1
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Publicaciones a lo largo del tiempo" onMouseLeave={() => setHover(null)}>
        <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity="0.18" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (top / 4) * i
          return <g key={i}><line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray={i ? '3 4' : ''} /><text x={padL - 8} y={y(v) + 4} fontSize="11" fill="var(--ink-3)" textAnchor="end">{Math.round(v)}</text></g>
        })}
        {area && <path d={area} fill="url(#ag)" />}
        {line && <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((p, i) => (
          <g key={p.key}>
            {i % step === 0 && <text x={x(i)} y={H - 7} fontSize="11" fill="var(--ink-3)" textAnchor="middle">{p.label}</text>}
            <rect x={x(i) - Math.max(6, (W - padL - padR) / points.length / 2)} y={padT} width={Math.max(12, (W - padL - padR) / points.length)} height={H - padT - padB} fill="transparent" onMouseEnter={() => setHover(i)} />
          </g>
        ))}
        {last >= 0 && hover == null && <circle cx={x(last)} cy={y(points[last].value)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />}
        {hover != null && points[hover] && <><line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="var(--line-strong)" /><circle cx={x(hover)} cy={y(points[hover].value)} r="4.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" /></>}
      </svg>
      {hover != null && points[hover] && (
        <div style={{ position: 'absolute', left: `${Math.min(88, Math.max(12, (x(hover) / W) * 100))}%`, top: 0, transform: 'translate(-50%,-2px)', background: 'var(--ink)', color: '#fff', fontSize: 11.5, padding: '5px 9px', borderRadius: 8, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          <b>{points[hover].value}</b> {points[hover].value === 1 ? 'publicación' : 'publicaciones'} · {points[hover].full}
        </div>
      )}
    </div>
  )
}

function Bars({ rows, total, format }) {
  if (rows.length === 0) return <p className="muted" style={{ margin: 0 }}>Sin datos en este periodo.</p>
  return rows.map(([label, n, icon]) => (
    <div className="bar-row" key={label}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{icon}<span className="trunc" style={{ textTransform: 'capitalize' }}>{label}</span></span>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${(n / total) * 100}%` }} /></div>
      <span className="v">{format ? format(n) : `${Math.round((n / total) * 100)}%`}</span>
    </div>
  ))
}

// ── Rendimiento real en Instagram (métricas de Meta de lo publicado desde Nowepost) ──
const fmt = (n) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : Math.round(n).toLocaleString('es-ES'))
const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const SLOTS = [['Madrugada', 0, 7], ['Mañana', 7, 13], ['Tarde', 13, 20], ['Noche', 20, 24]]
const inter = (m) => m.total_interactions ?? ((m.likes || 0) + (m.comments || 0) + (m.saved || 0) + (m.shares || 0))

function Performance({ from, to }) {
  const app = useApp()
  const { insights, refreshInsights, busy, backend } = app.social
  const [sort, setSort] = useState('reach')
  const rows = useMemo(() => insights.items.filter((i) => {
    if (app.account && String(i.social_account_id) !== app.account.id) return false
    const d = i.published_at ? new Date(i.published_at) : null
    return d && (!from || (d >= from && d <= to))
  }).map((i) => ({ ...i, date: new Date(i.published_at), inter: inter(i.metrics), reach: i.metrics.reach || 0 })), [insights.items, app.account, from, to])
  if (app.demo || backend.state !== 'online' || !backend.authenticated) return null

  const withData = rows.filter((r) => Object.keys(r.metrics).length)
  const sum = (k) => withData.reduce((a, r) => a + (k === 'inter' ? r.inter : r.metrics[k] || 0), 0)
  const reach = sum('reach'), totalInter = sum('inter')
  const rate = reach ? (totalInter / reach) * 100 : 0
  const missingPerm = rows.some((r) => /permiso/i.test(r.error || ''))
  const top = [...withData].sort((a, b) => (sort === 'rate' ? (b.inter / (b.reach || 1)) - (a.inter / (a.reach || 1)) : sort === 'inter' ? b.inter - a.inter : b.reach - a.reach)).slice(0, 5)
  const byTipo = [...withData.reduce((m, r) => m.set(r.tipo, [...(m.get(r.tipo) || []), r]), new Map())]
    .map(([t, list]) => [t, list.reduce((a, r) => a + r.reach, 0) / list.length, <Icon name={tipoIcon[t] || 'image'} size={16} key="i" />]).sort((a, b) => b[1] - a[1])
  const heat = SLOTS.map(([label, a, b]) => ({ label, cells: [1, 2, 3, 4, 5, 6, 0].map((d) => {
    const list = withData.filter((r) => r.date.getDay() === d && r.date.getHours() >= a && r.date.getHours() < b)
    return { d, n: list.length, avg: list.length ? list.reduce((x, r) => x + r.inter, 0) / list.length : 0 }
  }) }))
  const maxAvg = Math.max(1, ...heat.flatMap((h) => h.cells.map((c) => c.avg)))
  const best = heat.flatMap((h) => h.cells.map((c) => ({ ...c, slot: h.label }))).filter((c) => c.n).sort((a, b) => b.avg - a.avg)[0]
  const proj = (id) => prettyProject(projectById(id)?.name || id || '')

  return (
    <section className="perf">
      <div className="perf-head">
        <div><h3 className="section-title">Rendimiento en Instagram</h3>
          <p className="section-sub">Métricas de Meta de lo publicado desde Nowepost{insights.lastRun ? ` · actualizado ${new Date(insights.lastRun).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</p></div>
        <button className="btn btn-sm" onClick={refreshInsights} disabled={busy}><Icon name="refresh" size={14} /> Actualizar métricas</button>
      </div>
      {missingPerm && <div className="perf-warn"><Icon name="info" size={15} /> Alguna cuenta se conectó antes de pedir estadísticas. <button className="perf-link" onClick={app.goIntegrations}>Vuelve a conectarla</button> para ver sus métricas.</div>}
      {withData.length === 0 ? (
        <div className="panel card-pad perf-empty"><Icon name="chart" size={22} /><div><b>Aún no hay métricas en este periodo</b><p className="muted" style={{ margin: 0 }}>Aparecen cuando se publica desde Nowepost; se recogen a diario durante los 30 días siguientes a cada publicación.</p></div></div>
      ) : <>
        <Kpis items={[{ label: 'Alcance', value: fmt(reach) }, { label: 'Interacciones', value: fmt(totalInter) }, { label: 'Tasa de interacción', value: `${rate.toFixed(1)}%` }, { label: 'Guardados y compartidos', value: fmt(sum('saved') + sum('shares')) }]} />
        <div className="stats-layout">
          <div className="panel card-pad">
            <div className="perf-head"><div><h3 className="section-title">Mejores publicaciones</h3><p className="section-sub">Top 5 del periodo</p></div>
              <div className="segmented">{[['reach', 'Alcance'], ['inter', 'Interacción'], ['rate', 'Tasa']].map(([k, l]) => <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>)}</div></div>
            <table className="table perf-table"><thead><tr><th>Publicación</th><th>Alcance</th><th>Interac.</th><th>Guard.</th><th>Tasa</th></tr></thead><tbody>
              {top.map((r) => <tr key={r.channel_id}>
                <td><div className="perf-title"><Icon name={tipoIcon[r.tipo] || 'image'} size={14} /><div><b className="trunc">{r.external_url ? <a href={r.external_url} target="_blank" rel="noreferrer">{r.title || 'Sin título'}</a> : r.title || 'Sin título'}</b><small className="muted">{[proj(r.project_id), r.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}</small></div></div></td>
                <td>{fmt(r.reach)}</td><td>{fmt(r.inter)}</td><td>{fmt(r.metrics.saved || 0)}</td><td>{r.reach ? `${((r.inter / r.reach) * 100).toFixed(1)}%` : '—'}</td>
              </tr>)}
            </tbody></table>
          </div>
          <div className="panel card-pad">
            <h3 className="section-title">Alcance medio por formato</h3><p className="section-sub">Qué tipo de contenido llega a más gente</p>
            <Bars rows={byTipo.map(([t, v, i]) => [t, Math.round(v), i])} total={Math.max(1, ...byTipo.map((b) => b[1]))} format={fmt} />
          </div>
        </div>
        <div className="panel card-pad">
          <h3 className="section-title">Cuándo funciona mejor</h3>
          <p className="section-sub">{best ? `Mejor franja: ${DOW[best.d]} por la ${best.slot.toLowerCase()} (${fmt(best.avg)} interacciones de media).` : ''} Interacciones medias por día y franja de publicación.</p>
          <div className="heat" role="table">
            <span />{[1, 2, 3, 4, 5, 6, 0].map((d) => <i key={d}>{DOW[d]}</i>)}
            {heat.map((h) => <Fragment key={h.label}><small>{h.label}</small>{h.cells.map((c) => <b key={h.label + c.d} title={c.n ? `${c.n} publicaci${c.n === 1 ? 'ón' : 'ones'} · ${fmt(c.avg)} de media` : 'Sin publicaciones'} style={{ '--a': c.n ? 0.12 + 0.88 * (c.avg / maxAvg) : 0, color: c.avg / maxAvg > 0.55 ? '#fff' : undefined }}>{c.n ? fmt(c.avg) : ''}</b>)}</Fragment>)}
          </div>
        </div>
      </>}
    </section>
  )
}

export default function Stats() {
  const app = useApp()
  const [period, setPeriod] = useState('month')
  const [from, to, bin] = periodRange(period)
  const pubs = useMemo(() => app.publications.filter((p) => p.fecha && app.pubMatchesAccount(p) && (!from || (p.fecha >= from && p.fecha <= to))), [app.publications, app.pubMatchesAccount, from, to])
  const est = (e) => pubs.filter((p) => (p.estado || '').toLowerCase() === e).length

  const points = useMemo(() => {
    if (!from && pubs.length === 0) return []
    const [a, b] = from ? [from, to] : [new Date(Math.min(...pubs.map((p) => p.fecha))), new Date(Math.max(...pubs.map((p) => p.fecha)))]
    const out = []
    if (bin === 'day') {
      for (let d = new Date(a); d <= b; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.push({ key: d.toDateString(), label: String(d.getDate()), full: `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`, value: 0 })
      pubs.forEach((p) => { const i = out.findIndex((o) => o.key === p.fecha.toDateString()); if (i >= 0) out[i].value++ })
    } else {
      for (let d = new Date(a.getFullYear(), a.getMonth(), 1); d <= b; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS_SHORT[d.getMonth()], full: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, value: 0 })
      pubs.forEach((p) => { const i = out.findIndex((o) => o.key === `${p.fecha.getFullYear()}-${p.fecha.getMonth()}`); if (i >= 0) out[i].value++ })
    }
    return out
  }, [pubs, from, to, bin])

  const tally = (fn) => { const m = new Map(); pubs.forEach((p) => { const k = fn(p); m.set(k, (m.get(k) || 0) + 1) }); return [...m.entries()].sort((a, b) => b[1] - a[1]) }
  const canales = tally((p) => p.canal || 'Sin canal').map(([k, n]) => [k, n, k === 'Sin canal' ? <Icon name="globe" size={16} key="i" /> : <ChannelTile canal={k} size={18} key="i" />])
  const tipos = tally((p) => p.tipo || 'imagen').map(([k, n]) => [k, n, <Icon name={tipoIcon[k] || 'image'} size={16} key="i" />])
  const proyectos = tally((p) => p.proyecto).slice(0, 5)
  const reqBy = REQ_ESTADOS.map((e) => [e, app.requests.filter((r) => (r.estado || 'Pendiente') === e).length]).filter(([, n]) => n > 0)

  return (
    <div className="view-enter">
      <PageHead title="Estadísticas" subtitle="Actividad de contenido a partir de tus publicaciones y peticiones.">
        <div className="segmented" role="tablist" aria-label="Periodo">{PERIODS.map(([k, l]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)} role="tab" aria-selected={period === k}>{l}</button>)}</div>
      </PageHead>
      <DemoBanner />
      <Kpis items={[{ label: 'Publicaciones', value: pubs.length }, { label: 'Programadas', value: est('programado') }, { label: 'Publicadas', value: est('publicado') }, { label: 'Peticiones por revisar', value: app.pendingCount }]} />
      <Performance from={from} to={to} />
      <div className="stats-layout">
        <div className="panel card-pad">
          <h3 className="section-title">Publicaciones {bin === 'day' ? 'por día' : 'por mes'}</h3>
          <p className="section-sub">{pubs.length} en el periodo seleccionado</p>
          {points.length ? <AreaChart points={points} /> : <p className="muted">Sin publicaciones en este periodo.</p>}
        </div>
        <div className="panel card-pad">
          <h3 className="section-title">Por canal</h3>
          <p className="section-sub">Distribución de las publicaciones</p>
          <Bars rows={canales} total={pubs.length || 1} />
        </div>
      </div>
      <div className="stats-trio">
        <div className="panel card-pad"><h3 className="section-title">Tipo de contenido</h3><p className="section-sub">Formato de cada publicación</p><Bars rows={tipos} total={pubs.length || 1} /></div>
        <div className="panel card-pad">
          <h3 className="section-title">Proyectos con más publicaciones</h3><p className="section-sub">Top 5 del periodo</p>
          {proyectos.length === 0 ? <p className="muted" style={{ margin: 0 }}>Sin datos en este periodo.</p> : proyectos.map(([name, n]) => {
            const latest = pubs.filter((p) => p.proyecto === name && thumbOf(firstMedia(p))).sort((a, b) => b.fecha - a.fecha)[0]
            return (
              <button key={name} className="list-row" onClick={() => { app.setProjectsFilter([name]); app.setView('calendar') }}>
                <Thumb media={latest && firstMedia(latest)} tipo="imagen" project={name} size="sm" />
                <div className="grow"><b className="trunc list-title">{prettyProject(name)}</b><small>{n} publicaci{n === 1 ? 'ón' : 'ones'}</small></div>
                <Icon name="right" size={14} className="muted" />
              </button>
            )
          })}
        </div>
        <div className="panel card-pad">
          <h3 className="section-title">Peticiones por estado</h3><p className="section-sub">Todas las peticiones recibidas</p>
          {reqBy.length === 0 ? <p className="muted" style={{ margin: 0 }}>Aún no hay peticiones.</p> : reqBy.map(([e, n]) => (
            <div key={e} className="list-row"><StatusBadge estado={e} kind="req" /><span className="grow" /><b style={{ display: 'inline' }}>{n}</b></div>
          ))}
        </div>
      </div>
    </div>
  )
}
