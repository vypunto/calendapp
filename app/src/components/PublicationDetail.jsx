import { ReviewFeedback } from './Review.jsx'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store.jsx'
import { fmtFull, fmtLong, hashtagsOf, isVideoUrl, splitMedia, thumbOf } from '../lib/data.js'
import { EVENT_LABEL, aggregateStatus, destLabel, destTime } from '../lib/destinations.js'
import { prettyProject } from '../lib/projects.js'
import { ChannelTile, Cover, Icon, Menu, ProjectPill, StatusBadge, tipoIcon } from './ui.jsx'

function fileLabel(url, i) {
  if (/drive\.google\.com\/file\/d\//.test(url)) return { name: `Archivo ${i + 1}`, kind: 'Google Drive', icon: 'folder' }
  if (url.includes('youtu')) return { name: `Vídeo ${i + 1}`, kind: 'YouTube', icon: 'video' }
  let name = url
  try { name = decodeURIComponent(new URL(url).pathname.split('/').pop() || url) || url } catch { /* se deja la URL */ }
  return { name, kind: isVideoUrl(url) ? 'Vídeo' : 'Archivo', icon: isVideoUrl(url) ? 'video' : 'image' }
}

const STATUS_INFO = {
  Programado: ['clock', 'Se publicará automáticamente en la fecha y hora indicadas.'],
  Publicado: ['check', 'Ya está publicada en Instagram.'],
  Borrador: ['edit', 'Todavía no está programada ni publicada.'],
  Publicando: ['refresh', 'Instagram está procesando el contenido…'],
  Error: ['info', 'No se pudo publicar. Revisa el motivo y vuelve a intentarlo.'],
  Cancelado: ['x', 'Esta publicación se ha cancelado.'],
}
const RATIO_LABEL = { original: 'Original', '1:1': 'Cuadrado 1:1', '4:5': 'Vertical 4:5', '1.91:1': 'Horizontal 1,91:1' }

const Fact = ({ icon, label, children }) => (
  <div className="pd-fact">
    <span className="pd-fact-ico">{icon}</span>
    <div><small>{label}</small><b>{children}</b></div>
  </div>
)

export default function PublicationDetail() {
  const app = useApp()
  const pub = app.publications.find((p) => p.id === app.selectedPub.id) || app.selectedPub
  const list = app.sortedPublications
  const idx = list.findIndex((p) => p.id === pub.id)
  const media = useMemo(() => splitMedia(pub.media), [pub.media])
  const [active, setActive] = useState(0)
  const [confirmDel, setConfirmDel] = useState(false)
  useEffect(() => { setActive(0); setConfirmDel(false) }, [pub.id])
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || app.editing) return
      if (e.key === 'Escape') app.setSelectedPub(null)
      if (e.key === 'ArrowLeft' && idx > 0) app.setSelectedPub(list[idx - 1])
      if (e.key === 'ArrowRight' && idx < list.length - 1) app.setSelectedPub(list[idx + 1])
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const tags = hashtagsOf(pub.copy)
  const dests = pub.destinos || []
  const accOf = (d) => app.accountById(d.accountId)
  const firstAcc = dests.length ? accOf(dests[0]) : null
  const published = dests.find((d) => d.externalUrl)
  const igUrl = published?.externalUrl || (firstAcc ? `https://www.instagram.com/${firstAcc.handle}/` : null)
  const current = media[active] || ''
  const promocionado = (pub.promocionado || '').toLowerCase().startsWith('s')
  const estado = dests.length ? destLabel(aggregateStatus(dests)) : pub.estado || 'Sin estado'
  const locked = dests.some((d) => ['published', 'publishing'].includes(d.status))
  const runnable = dests.filter((d) => ['draft', 'scheduled', 'failed'].includes(d.status))
  const canRunAll = app.isAuth && runnable.length > 0 && (app.demo || runnable.some((d) => { const a = accOf(d); return a && app.canPublish(a) }))
  const failed = dests.filter((d) => d.status === 'failed' && d.errorMessage)
  const [sIcon, sText] = STATUS_INFO[estado] || ['info', '']
  const tz = dests.find((d) => d.timezone)?.timezone
  const hora = pub.hora || ''

  const history = useMemo(() => {
    const out = []
    dests.forEach((d) => {
      const a = app.accountById(d.accountId)
      const evs = app.social.eventsByDest.get(d.id) || []
      if (evs.length) evs.forEach((e) => out.push({ at: e.at, type: e.type, text: EVENT_LABEL[e.type] || e.type, note: e.message, who: a?.handle }))
      else if (app.demo) {
        if (d.scheduledAt) out.push({ at: d.scheduledAt, type: 'scheduled', text: 'Programada (demo)', note: '', who: a?.handle })
        if (d.publishedAt) out.push({ at: d.publishedAt, type: 'published', text: 'Publicada (simulación demo)', note: '', who: a?.handle })
      }
    })
    return out.sort((x, y) => x.at - y.at)
  }, [dests, app.social.eventsByDest, app.accountById, app.demo])
  const created = history.find((h) => h.type === 'created')
  const stamp = (d) => `${fmtFull(d)} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

  const destMenu = (d, a, canRun) => {
    const items = [
      d.externalUrl && { label: 'Ver en Instagram', icon: 'external', href: d.externalUrl },
      canRun && { label: d.status === 'failed' ? 'Reintentar' : 'Publicar ahora', icon: 'send', onClick: () => app.publishDestinationNow(d) },
      app.isAuth && ['draft', 'scheduled'].includes(d.status) && { label: 'Cancelar destino', icon: 'x', onClick: () => app.cancelDestination(d) },
    ].filter(Boolean)
    return items.length ? items : [{ label: 'Sin acciones disponibles', icon: 'info', onClick: () => {} }]
  }

  return (
    <div className="view-enter pd">
      <div className="pd-top">
        <button className="back" onClick={() => app.setSelectedPub(null)}><Icon name="arrowLeft" size={16} /> Volver</button>
        <div className="page-actions">
          <button className="btn btn-icon" disabled={idx <= 0} onClick={() => app.setSelectedPub(list[idx - 1])} aria-label="Anterior"><Icon name="left" size={15} /></button>
          <button className="btn btn-icon" disabled={idx < 0 || idx >= list.length - 1} onClick={() => app.setSelectedPub(list[idx + 1])} aria-label="Siguiente"><Icon name="right" size={15} /></button>
        </div>
      </div>

      <div className="pd-grid">
        {/* ── Multimedia ─────────────────────────────────────────────── */}
        <aside className="pd-media">
          <div className="pd-stage">
            <div className="pd-frame"><Cover media={current} tipo={pub.tipo} iconSize={52} /></div>
            {isVideoUrl(current) && <a href={current} target="_blank" rel="noreferrer" className="btn btn-sm pd-open"><Icon name="external" size={13} /> Abrir vídeo</a>}
          </div>
          <div className="pd-thumbs">
            {media.map((m, i) => (
              <button key={m + i} className={i === active ? 'on' : ''} onClick={() => setActive(i)} aria-label={`Archivo ${i + 1}`}>
                {thumbOf(m) ? <img src={thumbOf(m)} alt="" /> : <Icon name={isVideoUrl(m) ? 'video' : 'image'} size={18} />}
              </button>
            ))}
            {app.isAuth && !locked && <button className="pd-add" onClick={() => app.setEditing(pub)}><Icon name="plus" size={16} /><span>Añadir media</span></button>}
          </div>
        </aside>

        {/* ── Información ────────────────────────────────────────────── */}
        <section className="pd-info">
          <div className="pd-chips">
            <ProjectPill name={pub.proyecto} />
            <StatusBadge estado={estado} />
            {pub.canal && <span className="pd-chan"><ChannelTile canal={pub.canal} size={16} />{pub.canal}<em>· {pub.tipo || 'imagen'}</em></span>}
          </div>

          <div className="pd-title">
            <h1>{pub.titulo || pub.proyecto}</h1>
            <div className="pd-title-actions">
              {igUrl && <a className="btn btn-sm" href={igUrl} target="_blank" rel="noreferrer"><Icon name="external" size={13} /> {published ? 'Ver en Instagram' : 'Ver perfil'}</a>}
              <Menu items={[
                { label: 'Editar', icon: 'edit', onClick: () => app.requireAuth(() => app.setEditing(pub)) },
                { label: 'Duplicar', icon: 'copy', onClick: () => app.requireAuth(() => app.duplicatePublication(pub)) },
                !locked && { label: 'Eliminar', icon: 'trash', onClick: () => app.requireAuth(() => setConfirmDel(true)) },
              ]} />
            </div>
          </div>
          <p className="pd-date"><Icon name="calendar" size={15} /> {fmtLong(pub.fecha)}{hora ? ` · ${hora}` : ''}</p>
          {created && <p className="pd-created"><Icon name="clock" size={13} /> Creado{created.who ? ` por @${created.who}` : ''} · {stamp(created.at)}</p>}

          <div className={`pd-status s-${estado.toLowerCase()}`}>
            <span className="pd-status-ico"><Icon name={sIcon} size={20} /></span>
            <div className="grow"><b>{estado}</b><small>{sText}</small></div>
            {app.isAuth && !locked && <button className="btn btn-sm" onClick={() => app.setEditing(pub)}>Modificar fecha</button>}
          </div>

          {failed.length > 0 && failed.map((d) => <div key={d.id} className="err-box"><b>@{accOf(d)?.handle}</b> · {d.errorMessage}</div>)}

          {dests.length > 0 && (
            <div className="pd-card">
              <h3>Destinos de publicación <span className="pd-count">{dests.length}</span></h3>
              <div className="pd-list">
                {dests.map((d) => {
                  const a = accOf(d)
                  const when = d.publishedAt || d.scheduledAt
                  const canRun = app.isAuth && (app.demo || (a && app.canPublish(a))) && ['draft', 'scheduled', 'failed'].includes(d.status)
                  return (
                    <div key={d.id} className="pd-row">
                      <ChannelTile canal={d.canal} size={34} />
                      <div className="grow">
                        <b>@{a?.handle || d.accountId}</b>
                        <small>{when ? `${d.publishedAt ? 'Publicado' : 'Programado para'} ${fmtFull(when)} · ${destTime(d)}${d.timezone && !d.publishedAt ? ` (${d.timezone.replace('_', ' ')})` : ''}` : 'Sin fecha de programación'}</small>
                      </div>
                      <StatusBadge estado={destLabel(d.status)} />
                      <Menu items={destMenu(d, a, canRun)} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <ReviewFeedback pub={pub} />

          <div className="pd-card">
            <h3>Contenido</h3>
            <div className="pd-text">
              <small>Texto</small>
              {pub.copy ? <p>{pub.copy}</p> : <p className="muted">Sin texto.</p>}
              {tags.length > 0 && <div className="pd-tags">{tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
            </div>
            {pub.first_comment && <div className="pd-text" style={{ marginTop: 12 }}><small>Primer comentario</small><p>{pub.first_comment}</p></div>}
          </div>

          <div className="pd-card">
            <h3>Información</h3>
            <div className="pd-facts">
              <Fact icon={<Icon name="folder" size={16} />} label="Proyecto">{prettyProject(pub.proyecto)}</Fact>
              <Fact icon={<Icon name="users" size={16} />} label="Cuenta">{dests.length ? dests.map((d) => `@${accOf(d)?.handle || d.accountId}`).join(', ') : <span className="muted">Sin cuenta asignada</span>}</Fact>
              <Fact icon={pub.canal ? <ChannelTile canal={pub.canal} size={18} /> : <Icon name="globe" size={16} />} label="Canal">{pub.canal || 'Sin canal'}</Fact>
              <Fact icon={<Icon name="calendar" size={16} />} label="Fecha y hora">{fmtFull(pub.fecha)}{hora ? ` · ${hora}` : ''}{tz && <em> {tz.replace('_', ' ')}</em>}</Fact>
              <Fact icon={<Icon name={tipoIcon[pub.tipo] || 'image'} size={16} />} label="Tipo de contenido"><span style={{ textTransform: 'capitalize' }}>{pub.tipo || 'imagen'}</span></Fact>
              <Fact icon={<i className="state-dot" style={{ '--dot': 'var(--accent)' }} />} label="Estado"><StatusBadge estado={estado} /></Fact>
              {['imagen', 'carrusel'].includes(pub.tipo || 'imagen') && pub.image_ratio && <Fact icon={<Icon name="image" size={16} />} label="Formato de imagen">{RATIO_LABEL[pub.image_ratio] || pub.image_ratio} · {pub.image_fit === 'crop' ? 'recortada' : 'entera'}</Fact>}
              {pub.solicitante && <Fact icon={<Icon name="users" size={16} />} label="Responsable">{pub.solicitante}</Fact>}
              {promocionado && <Fact icon={<Icon name="chart" size={16} />} label="Campaña Ads">Sí{pub.presupuesto ? ` · ${pub.presupuesto} €` : ''}</Fact>}
            </div>
          </div>

          {media.length > 0 && (
            <div className="pd-card">
              <h3>Archivos <span className="pd-count">{media.length}</span></h3>
              <div className="pd-list">
                {media.map((m, i) => {
                  const f = fileLabel(m, i)
                  return (
                    <a key={m + i} className="pd-row pd-file" href={m} target="_blank" rel="noreferrer">
                      <span className="pd-file-ico"><Icon name={f.icon} size={16} /></span>
                      <div className="grow"><b className="trunc">{f.name}</b><small>{f.kind}</small></div>
                      <Icon name="external" size={14} />
                    </a>
                  )
                })}
              </div>
            </div>
          )}

          <div className="pd-card">
            <h3>Historial</h3>
            {history.length === 0
              ? <p className="muted" style={{ margin: 0 }}>Todavía no hay actividad registrada.</p>
              : <ol className="history">{history.map((h, i) => <li key={i}><i className={h.type} /><div><b>{h.text}{h.who ? ` · @${h.who}` : ''}</b><small>{stamp(h.at)}{h.note ? ` · ${h.note}` : ''}</small></div></li>)}</ol>}
          </div>

          {locked && <p className="muted pd-note">Ya está en Instagram. Meta no permite editar ni borrar publicaciones publicadas desde la API; hazlo desde la app de Instagram.</p>}

          <div className="pd-actions">
            <button className="btn btn-primary" onClick={() => app.requireAuth(() => app.setEditing(pub))}><Icon name="edit" size={14} /> Editar</button>
            {!locked && <button className="btn" onClick={() => app.requireAuth(() => app.setEditing(pub))}><Icon name="clock" size={14} /> Programar</button>}
            <button className="btn" onClick={() => app.requireAuth(() => app.duplicatePublication(pub))}><Icon name="copy" size={14} /> Duplicar</button>
            {canRunAll && <button className="btn btn-accent" disabled={app.social.busy} onClick={() => app.publishPublicationNow(pub)}><Icon name="send" size={14} /> Publicar ahora</button>}
            {app.isAuth && !locked && !confirmDel && <button className="btn btn-outline-danger" onClick={() => setConfirmDel(true)}><Icon name="trash" size={14} /> Eliminar</button>}
            {confirmDel && <span className="confirm-inline"><span>¿Eliminar esta publicación?</span><button className="btn btn-sm btn-danger" onClick={() => app.deletePublication(pub)}>Sí, eliminar</button><button className="btn btn-sm btn-ghost" onClick={() => setConfirmDel(false)}>No</button></span>}
          </div>
        </section>
      </div>
    </div>
  )
}
