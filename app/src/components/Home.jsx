// Inicio: lo que importa hoy, lo que necesita atención y lo que viene.
import { useMemo, useState } from 'react'
import { useApp } from '../store.jsx'
import { DAYS_LONG, MONTHS, sameDay } from '../lib/data.js'
import { prettyProject } from '../lib/projects.js'
import { CreateMenu } from './Sidebar.jsx'
import { ReviewLinksModal, ReviewMark, refOf, useReviewMap } from './Review.jsx'
import { resolveProject } from '../lib/projects.js'
import { ChannelTile, DemoBanner, Icon, Thumb, firstMedia, stateDot } from './ui.jsx'

const pad = (n) => String(n).padStart(2, '0')
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const fmt = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toLocaleString('es-ES'))

// Momento real de una publicación: la hora programada del primer destino, o el día de la hoja.
function whenOf(p) {
  const d = (p.destinos || []).map((x) => x.publishedAt || x.scheduledAt).filter(Boolean).sort((a, b) => a - b)[0]
  return d ? new Date(d) : p.fecha
}

function Row({ p, review, onOpen, right, sub }) {
  const w = whenOf(p)
  const hasTime = (p.destinos || []).some((x) => x.scheduledAt || x.publishedAt)
  return (
    <button className="home-row" onClick={() => onOpen(p)}>
      <span className="home-time">{hasTime ? hhmm(w) : ''}</span>
      <Thumb media={firstMedia(p)} tipo={p.tipo} size="sm" project={p.proyecto} />
      <span className="grow"><b className="trunc">{p.titulo || 'Sin título'}</b><small className="trunc">{sub ? <span className="trunc">{prettyProject(p.proyecto)} · {sub}</span> : <>{p.canal && <ChannelTile canal={p.canal} size={11} />} {prettyProject(p.proyecto)}</>}</small></span>
      <ReviewMark f={review} />
      {right || <i className="state-dot" style={{ '--dot': stateDot(p.estado) }} title={p.estado || 'Sin estado'} />}
    </button>
  )
}

export default function Home() {
  const app = useApp()
  const reviews = useReviewMap()
  const [reviewOpen, setReviewOpen] = useState(false)
  const now = new Date()
  const today = startOfDay(now)
  const week = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 8)
  const pubs = useMemo(() => app.publications.filter((p) => p.fecha && app.pubMatchesAccount(p) && p.estado !== 'Cancelado'), [app.publications, app.pubMatchesAccount])
  const open = (p) => app.setSelectedPub(p)

  const todayList = pubs.filter((p) => sameDay(p.fecha, now)).sort((a, b) => whenOf(a) - whenOf(b))
  const upcoming = pubs.filter((p) => p.fecha > new Date(today.getTime() + 86399999) && p.fecha < week).sort((a, b) => whenOf(a) - whenOf(b))
  const byDay = [...upcoming.reduce((m, p) => { const k = startOfDay(p.fecha).getTime(); m.set(k, [...(m.get(k) || []), p]); return m }, new Map())]

  // Requiere atención: fallos, vencidas y cambios pedidos por el cliente.
  const attention = []
  pubs.forEach((p) => {
    const failed = (p.destinos || []).find((d) => d.status === 'failed')
    const overdue = (p.destinos || []).find((d) => d.status === 'scheduled' && d.scheduledAt && new Date(d.scheduledAt) < new Date(now.getTime() - 15 * 60000))
    const rv = reviews.get(refOf(p))
    if (failed) attention.push({ p, kind: 'failed', text: failed.errorMessage || 'La publicación falló' })
    else if (overdue) attention.push({ p, kind: 'overdue', text: 'Debía haberse publicado y sigue pendiente' })
    else if (rv?.decision === 'changes' && p.fecha >= today) attention.push({ p, kind: 'changes', text: `${rv.author}: “${rv.comment}”` })
  })
  const disconnected = app.accounts.filter((a) => ['expired', 'error'].includes(a.status))

  // Esperando al cliente: piezas futuras dentro de un enlace activo sin respuesta.
  const waiting = pubs.filter((p) => p.fecha >= today && !reviews.get(refOf(p)) && app.social.reviewLinks.some((l) => {
    const day = refOf(p).split('|')[1]
    return (!l.project_id || resolveProject(p.proyecto)?.id === l.project_id) && day >= l.date_from && day <= l.date_to
  })).length

  const ins = app.social.insights.items.filter((i) => i.published_at && new Date(i.published_at) > new Date(now.getTime() - 7 * 86400000) && (!app.account || String(i.social_account_id) === app.account.id))
  const reach = ins.reduce((a, i) => a + (i.metrics.reach || 0), 0)
  const inter = ins.reduce((a, i) => a + (i.metrics.total_interactions ?? ((i.metrics.likes || 0) + (i.metrics.comments || 0) + (i.metrics.saved || 0) + (i.metrics.shares || 0))), 0)

  const hour = now.getHours()
  const hello = hour < 13 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches'
  const name = (app.user?.name || app.userName || '').split(' ')[0]
  const server = !app.demo && app.social.backend.state === 'online' && app.isAuth

  const kpis = [
    { label: 'Hoy', value: todayList.length, icon: 'calendar' },
    { label: 'Próximos 7 días', value: upcoming.length, icon: 'clock' },
    { label: 'Requieren atención', value: attention.length + disconnected.length, icon: 'info', tone: attention.length + disconnected.length ? 'bad' : 'ok' },
    { label: 'Esperando al cliente', value: waiting, icon: 'users' },
  ]

  return (
    <div className="view-enter home">
      <header className="home-head">
        <div>
          <p className="home-date">{DAYS_LONG[now.getDay()][0].toUpperCase() + DAYS_LONG[now.getDay()].slice(1)}, {now.getDate()} de {MONTHS[now.getMonth()]}</p>
          <h1>{hello}{name ? `, ${name}` : ''}</h1>
        </div>
        <div className="home-actions">
          {server && <button className="btn" onClick={() => setReviewOpen(true)}><Icon name="users" size={15} /> Aprobación cliente</button>}
          <CreateMenu />
        </div>
      </header>
      <DemoBanner />
      {reviewOpen && <ReviewLinksModal onClose={() => setReviewOpen(false)} />}

      <div className="home-kpis">{kpis.map((k) => (
        <div key={k.label} className={`home-kpi ${k.tone || ''}`}><span><Icon name={k.icon} size={16} /></span><b>{k.value}</b><small>{k.label}</small></div>
      ))}</div>

      <div className="home-grid">
        <div className="home-col">
          {(attention.length > 0 || disconnected.length > 0) && (
            <section className="panel card-pad home-attn">
              <h3 className="section-title"><Icon name="info" size={15} /> Requiere atención</h3>
              {disconnected.map((a) => (
                <button key={a.id} className="home-row" onClick={app.goIntegrations}>
                  <span className="home-tag bad">Cuenta</span>
                  <span className="grow"><b>@{a.handle} necesita reconectarse</b><small>Las publicaciones programadas en esta cuenta fallarán.</small></span>
                  <Icon name="right" size={14} className="muted" />
                </button>
              ))}
              {attention.map(({ p, kind, text }) => (
                <Row key={`${kind}-${p.id}`} p={p} review={reviews.get(refOf(p))} onOpen={open} sub={text}
                  right={<span className={`home-tag ${kind === 'changes' ? 'warn' : 'bad'}`} title={text}>{kind === 'failed' ? 'Falló' : kind === 'overdue' ? 'Vencida' : 'Cambios'}</span>} />
              ))}
            </section>
          )}

          <section className="panel card-pad">
            <div className="home-sec-head"><h3 className="section-title">Hoy</h3><button className="btn btn-sm btn-ghost" onClick={() => { app.goToday(); app.setView('calendar') }}>Ver calendario <Icon name="right" size={13} /></button></div>
            {todayList.length === 0
              ? <div className="home-empty"><Icon name="calendar" size={20} /><span>No hay nada programado para hoy.</span>{app.isAuth && <button className="btn btn-sm" onClick={() => { app.startPublication ? app.startPublication(now) : app.setEditing('new') }}><Icon name="plus" size={13} /> Crear para hoy</button>}</div>
              : todayList.map((p) => <Row key={p.id} p={p} review={reviews.get(refOf(p))} onOpen={open} />)}
          </section>

          <section className="panel card-pad">
            <h3 className="section-title">Próximos 7 días</h3>
            {byDay.length === 0 ? <p className="muted" style={{ margin: '8px 0 0' }}>Semana despejada. Buen momento para planificar.</p> : byDay.map(([k, list]) => {
              const d = new Date(k)
              return (
                <div key={k} className="home-day">
                  <p className="home-day-h">{DAYS_LONG[d.getDay()]} <span>{d.getDate()}</span></p>
                  {list.map((p) => <Row key={p.id} p={p} review={reviews.get(refOf(p))} onOpen={open} />)}
                </div>
              )
            })}
          </section>
        </div>

        <aside className="home-col">
          {server && (
            <section className="panel card-pad home-perf">
              <h3 className="section-title">Últimos 7 días en Instagram</h3>
              {ins.length === 0 ? <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Pulsa «Actualizar métricas» en Estadísticas para importar el historial de Instagram.</p> : <>
                <div className="home-perf-nums"><div><b>{fmt(reach)}</b><small>Alcance</small></div><div><b>{fmt(inter)}</b><small>Interacciones</small></div><div><b>{ins.length}</b><small>Publicaciones</small></div></div>
                <button className="btn btn-sm btn-ghost" onClick={() => app.setView('stats')}>Ver estadísticas <Icon name="right" size={13} /></button>
              </>}
            </section>
          )}
          <section className="panel card-pad">
            <div className="home-sec-head"><h3 className="section-title">Peticiones pendientes</h3><span className="pd-count">{app.pendingCount}</span></div>
            {app.pendingCount === 0 ? <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Nada por revisar.</p>
              : <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => { app.setReqFilter('pending'); app.setView('requests') }}>Revisar {app.pendingCount} petici{app.pendingCount === 1 ? 'ón' : 'ones'}</button>}
          </section>
          {server && app.social.notifications.length > 0 && (
            <section className="panel card-pad">
              <div className="home-sec-head"><h3 className="section-title">Actividad reciente</h3><button className="btn btn-sm btn-ghost" onClick={() => { app.setSettingsTab('notificaciones'); app.setView('settings') }}>Todo</button></div>
              {app.social.notifications.slice(0, 5).map((n) => (
                <div key={n.key} className="home-act"><i className={`alert-dot k-${n.kind}`} /><div><b>{n.title}</b><small>{new Date(n.at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div></div>
              ))}
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
