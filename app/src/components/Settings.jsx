import { useMemo, useState } from 'react'
import { useApp } from '../store.jsx'
import { PUBLICATIONS_CSV, REQUESTS_CSV, SCRIPT_URL, fmtFull, fmtShort, isPendingRequest, splitMedia, timeAgo } from '../lib/data.js'
import { lsSet } from '../lib/storage.js'
import { prettyProject } from '../lib/projects.js'
import { AccountStatusBadge, ChannelTile, DemoBanner, Icon, Menu, PageHead, ProjectAvatar, StatusBadge, Thumb, Select } from './ui.jsx'

const TABS = [['cuenta', 'Cuenta'], ['equipo', 'Equipo'], ['proyectos', 'Proyectos'], ['integraciones', 'Integraciones'], ['notificaciones', 'Notificaciones']]
const NAME_KEY = 'pubcal_solicitante'

function Group({ title, sub, children }) {
  return (
    <section className="settings-group">
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
      <div className="panel divided">{children}</div>
    </section>
  )
}

const Row = ({ icon, title, sub, children }) => (
  <div className="row-item">
    {icon}
    <div className="grow"><b>{title}</b>{sub && <small>{sub}</small>}</div>
    {children}
  </div>
)

// ── Programador: ¿se está ejecutando el cron que publica lo programado? ────
function SchedulerRow() {
  const app = useApp()
  const sch = app.social.scheduler
  const last = sch.last_run ? new Date(sch.last_run) : null
  const mins = last ? (Date.now() - last.getTime()) / 60000 : null
  const state = last && mins <= 15 ? ['green', 'Activo'] : last ? ['amber', 'Retrasado'] : sch.upcoming || sch.overdue ? ['red', 'Sin ejecutar'] : ['no-dot', 'Sin uso']
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try { const r = await app.social.runScheduler(); app.toast.success(r.results?.length ? `Procesadas ${r.results.length} publicaciones vencidas` : 'No había nada vencido') } catch (e) { app.toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <Row icon={<div className="integration-icon" style={{ background: 'var(--ink)' }}><Icon name="clock" size={19} /></div>} title="Programador de publicaciones"
      sub={`${last ? `Última ejecución ${timeAgo(last)}` : 'Todavía no se ha ejecutado'} · ${sch.upcoming} programadas · ${sch.overdue} vencidas${state[0] !== 'green' && (sch.upcoming || sch.overdue) ? ' · Configura el cron externo (DEPLOY-VERCEL.md)' : ''}`}>
      <span className={`badge ${state[0]}`}>{state[1]}</span>
      {sch.overdue > 0 && <button className="btn btn-sm btn-primary" disabled={busy} onClick={run}>{busy ? 'Publicando…' : 'Publicar vencidas ahora'}</button>}
    </Row>
  )
}

// ── Servidor de Nowepost (OAuth, cuentas y publicación) ──────────────────
function ServerGroup() {
  const app = useApp()
  const { backend } = app.social
  const cfg = backend.configured || {}
  const flags = [
    ['meta_app', 'Aplicación de Meta (ID y secreto)'], ['redirect_uri', 'URL de retorno OAuth'], ['crypto', 'Clave de cifrado de tokens'], ['admin', 'Contraseña de administración'],
  ]
  return (
    <Group title="Servidor de Nowepost" sub="Guarda las cuentas conectadas, cifra los tokens y programa las publicaciones. Los tokens nunca llegan al navegador.">
      <Row icon={<div className="integration-icon" style={{ background: 'var(--ink)' }}><Icon name="code" size={19} /></div>} title="Backend"
        sub={backend.state === 'online' ? `Disponible${backend.version ? ` · v${backend.version}` : ''}` : backend.state === 'offline' ? 'No disponible en esta dirección' : 'Comprobando…'}>
        <span className={`badge ${backend.state === 'online' ? 'green' : backend.state === 'offline' ? 'red' : 'no-dot'}`}>{backend.state === 'online' ? 'Conectado' : backend.state === 'offline' ? 'Sin conexión' : 'Comprobando'}</span>
        <button className="btn btn-sm" onClick={app.social.bootstrap}><Icon name="refresh" size={13} /> Comprobar</button>
      </Row>
      {backend.state === 'online' && (
        <div className="row-item" style={{ display: 'block' }}>
          <div className="flag-grid">
            {flags.map(([k, l]) => <span key={k} className={`flag ${cfg[k] ? 'ok' : 'bad'}`}><Icon name={cfg[k] ? 'check' : 'x'} size={13} />{l}</span>)}
          </div>
          {flags.some(([k]) => !cfg[k]) && <p className="muted" style={{ margin: '10px 0 0', fontSize: 12.5 }}>Faltan variables de entorno en el servidor (en Vercel: Settings → Environment Variables). Consulta DEPLOY-VERCEL.md.</p>}
        </div>
      )}
      {backend.state === 'online' && backend.authenticated && app.social.scheduler && <SchedulerRow />}
      {backend.state === 'online' && backend.authenticated && (
        <Row title="Sesión de administración activa" sub="Entraste con el acceso del equipo: puedes conectar cuentas, programar y publicar. Dura 12 horas."><button className="btn btn-sm" onClick={app.logout}>Cerrar sesión</button></Row>
      )}
    </Group>
  )
}

// ── Cuentas de Instagram ──────────────────────────────────────────────────
function AddAccount() {
  const app = useApp()
  const [username, setUsername] = useState('')
  const [projectId, setProjectId] = useState('')
  return (
    <form className="row-item add-account" onSubmit={async (e) => { e.preventDefault(); try { await app.social.addAccount({ username, projectId }); setUsername(''); setProjectId(''); app.toast.success('Cuenta añadida. Conéctala para poder publicar.') } catch { /* el error ya se muestra */ } }}>
      <input className="input" placeholder="@usuario" aria-label="Usuario de Instagram" value={username} onChange={(e) => setUsername(e.target.value)} />
      <Select className="select" aria-label="Proyecto" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
        <option value="">Proyecto…</option>{app.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      <button className="btn" type="submit" disabled={!username.trim()}><Icon name="plus" size={14} /> Añadir</button>
    </form>
  )
}

// ── Plataformas sociales (centro de conexiones) ───────────────────────────
function InstagramGroup({ platform }) {
  const app = useApp()
  const { backend, busy } = app.social
  const ready = app.demo ? true : backend.state === 'online' && backend.authenticated
  const canConnect = app.demo || (ready && backend.configured?.meta_app && backend.configured?.redirect_uri && backend.configured?.crypto)
  const why = backend.state !== 'online' && !app.demo ? 'El servidor no está disponible.' : !ready ? 'La sesión del servidor ha caducado: vuelve a entrar con el acceso del equipo.' : !canConnect ? 'Falta configuración de Meta en el servidor.' : ''
  const connected = app.accounts.filter((a) => a.status === 'connected' || a.status === 'demo')
  const check = async (a) => {
    try {
      const r = await app.social.checkAccount(a.id)
      app.toast.success(r.quota ? `@${a.handle}: ${r.quota.usage} de ${r.quota.total} publicaciones usadas en ${Math.round((r.quota.duration || 86400) / 3600)} h` : `@${a.handle}: cuenta verificada`)
    } catch { /* el error ya se muestra */ }
  }
  const live = (a) => a.status === 'connected' || a.status === 'demo'
  return (
    <Group title="Instagram" sub="Conexión oficial con Meta (inicio de sesión de Instagram). Introduces tus credenciales en instagram.com, nunca en Nowepost.">
      {app.demo && <div className="row-item"><div className="grow"><b>Modo demo</b><small>Conectar y desconectar son simulaciones. Fuera del demo se abre el inicio de sesión oficial de Instagram.</small></div><span className="badge blue">Simulado</span></div>}
      {app.accounts.map((a) => {
        const exp = a.tokenExpiresAt
        return (
          <div key={a.id} className="row-item account-row">
            <ChannelTile canal={a.canal} size={38} />
            <div className="grow">
              <b>@{a.handle}</b>
              <small>{a.metadata?.account_type ? `${a.metadata.account_type} · ` : ''}{a.status === 'connected' && exp ? `Token válido hasta ${fmtFull(exp)}` : a.lastError || (a.status === 'demo' ? 'Cuenta de ejemplo' : 'Sin credenciales guardadas')}</small>
            </div>
            <Select className="select project-select" aria-label={`Proyecto de @${a.handle}`} value={a.projectId || ''} disabled={!ready || busy || app.demo}
              onChange={(e) => app.social.setAccountProject(a.id, e.target.value)}>
              <option value="">Sin proyecto</option>{app.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            {live(a)
              ? <span className="conn-dot"><i />{a.status === 'demo' ? 'Conectado (demo)' : 'Conectado'}</span>
              : <AccountStatusBadge status={a.status} />}
            {ready && (
              <div className="row-actions">
                {live(a) && <button className="btn btn-sm" disabled={busy} onClick={() => app.social.disconnectAccount(a.id).catch(() => {})}>Desconectar</button>}
                {!live(a) && <button className="btn btn-sm btn-primary" disabled={!canConnect || busy} onClick={() => app.social.connectInstagram(a.projectId, { accountId: a.id })}>{a.status === 'pending' || a.status === 'disconnected' ? 'Conectar' : 'Reconectar'}</button>}
                <Menu label={`Acciones de @${a.handle}`} items={[
                  a.status === 'connected' && !app.demo && { label: 'Comprobar cuenta y cuota', icon: 'refresh', onClick: () => check(a) },
                  a.status === 'connected' && !app.demo && { label: 'Renovar token', icon: 'lock', onClick: () => app.social.renewToken(a.id).catch(() => {}) },
                  !app.demo && a.status !== 'pending' && a.status !== 'disconnected' && { label: 'Reconectar con otra cuenta', icon: 'users', onClick: () => app.social.connectInstagram(a.projectId, { forceReauth: true }) },
                  { label: 'Abrir perfil', icon: 'external', href: `https://www.instagram.com/${a.handle}/` },
                  !app.demo && a.status !== 'connected' && { label: 'Eliminar cuenta', icon: 'trash', onClick: () => app.social.removeAccount(a.id).catch(() => {}) },
                ]} />
              </div>
            )}
          </div>
        )
      })}
      <div className="row-item">
        <div className="grow"><b>{connected.length ? 'Conectar otra cuenta' : 'Conectar Instagram'}</b><small>{why || 'Se abrirá el inicio de sesión de Instagram para autorizar una cuenta profesional.'}</small></div>
        <button className="btn btn-primary" disabled={!canConnect || busy} onClick={() => app.social.connectInstagram(null, { forceReauth: connected.length > 0 })}><Icon name="plus" size={14} /> {connected.length ? 'Conectar otra cuenta' : 'Conectar Instagram'}</button>
      </div>
      {ready && !app.demo && <AddAccount />}
      {platform?.requirements?.length > 0 && (
        <details className="plain"><summary>Requisitos y límites de Meta <Icon name="down" size={15} className="muted" /></summary>
          <ul className="req-list">{platform.requirements.map((r) => <li key={r}>{r}</li>)}</ul>
        </details>
      )}
    </Group>
  )
}

const SOON_COLOR = { facebook: '#1877f2', tiktok: '#181A19', linkedin: '#0a66c2' }
function ComingSoon({ platform }) {
  return (
    <Row icon={<div className="integration-icon" style={{ background: SOON_COLOR[platform.id] || 'var(--ink-3)' }}><ChannelTile canal={platform.label} size={22} /></div>} title={platform.label}
      sub="Integración preparada en la arquitectura, todavía no disponible. No se simula ninguna conexión.">
      <span className="badge no-dot">Próximamente</span>
    </Row>
  )
}

function SocialGroups() {
  const app = useApp()
  const list = app.social.platforms
  const ig = list.find((p) => p.id === 'instagram') || { id: 'instagram', requirements: [] }
  const soon = list.filter((p) => !p.implemented)
  return (
    <>
      <InstagramGroup platform={ig} />
      {soon.length > 0 && <Group title="Otras redes" sub="Cada red necesitará su propia autorización oficial. Aparecerán aquí cuando estén implementadas.">{soon.map((p) => <ComingSoon key={p.id} platform={p} />)}</Group>}
    </>
  )
}

export default function Settings() {
  const app = useApp()
  const tab = app.settingsTab
  const setTab = app.setSettingsTab
  const [name, setName] = useState(app.userName)
  const [saved, setSaved] = useState(false)
  const people = useMemo(() => {
    const m = new Map()
    app.requests.forEach((r) => { const k = (r.solicitante || '').trim(); if (!k) return; const e = m.get(k) || { name: k, n: 0, last: null }; e.n++; if (!e.last || r.fecha > e.last) e.last = r.fecha; m.set(k, e) })
    return [...m.values()].sort((a, b) => b.n - a.n)
  }, [app.requests])
  const pending = app.requests.filter(isPendingRequest)

  // Ajustes (cuentas, integraciones, equipo) solo para el equipo. La protección real de las acciones está en el servidor.
  if (!app.isAuth) {
    return (
      <div className="view-enter">
        <PageHead title="Ajustes" subtitle="Cuenta, equipo, proyectos e integraciones." />
        <div className="card"><div className="no-account" style={{ border: 0 }}>
          <Icon name="lock" size={18} />
          <div className="grow"><b>Acceso restringido</b><small>Los ajustes y las integraciones solo están disponibles para el equipo.</small></div>
          <button className="btn btn-primary btn-sm" onClick={() => app.setShowAuth(true)}><Icon name="lock" size={14} /> Acceso del equipo</button>
        </div></div>
      </div>
    )
  }

  return (
    <div className="view-enter">
      <PageHead title="Ajustes" subtitle="Cuenta, equipo, proyectos e integraciones." />
      <DemoBanner />
      <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} role="tab" aria-selected={tab === k}>{l}</button>)}</div>
      <div className="settings-body">
        {tab === 'cuenta' && (
          <>
            <Group title="Perfil" sub="Tu nombre se usa al enviar o modificar peticiones.">
              <div className="row-item">
                <div className="grow"><div className="field"><label htmlFor="s-name">Nombre</label><input id="s-name" className="input" value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} placeholder="Tu nombre" /></div></div>
                <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => { lsSet(NAME_KEY, name.trim()); setSaved(true) }}>{saved ? 'Guardado' : 'Guardar'}</button>
              </div>
            </Group>
            <Group title="Acceso" sub="El acceso del equipo permite crear y editar publicaciones y aprobar peticiones.">
              <Row title={app.isAuth ? 'Acceso de equipo activo' : 'Sin acceso de equipo'} sub={`Rol: ${app.isAuth ? 'Admin' : 'Solicitante'}`}>
                {app.isAuth ? <button className="btn" onClick={app.logout}><Icon name="logout" size={14} /> Cerrar sesión</button> : <button className="btn btn-primary" onClick={() => app.setShowAuth(true)}><Icon name="lock" size={14} /> Acceso del equipo</button>}
              </Row>
              <Row title="Política de privacidad" sub="Qué datos trata Nowepost y cómo eliminarlos."><a className="btn btn-sm" href="./privacy.html" target="_blank" rel="noreferrer">Abrir <Icon name="external" size={12} /></a></Row>
              <Row title="Modo demo" sub="Explora la app con datos de ejemplo, sin tocar la hoja.">
                <button type="button" className={`switch ${app.demo ? 'on' : ''}`} onClick={() => (app.demo ? app.exitDemo() : app.enterDemo())} role="switch" aria-checked={app.demo} aria-label="Modo demo" />
              </Row>
            </Group>
          </>
        )}

        {tab === 'equipo' && (
          <Group title="Equipo" sub="Personas que han enviado peticiones. El acceso de equipo se comparte con una contraseña.">
            {people.length === 0 ? <Row title="Todavía no hay solicitantes" /> : people.map((p) => (
              <Row key={p.name} icon={<div className="avatar" style={{ background: 'var(--surface-3)', color: 'var(--ink-2)' }}>{p.name.slice(0, 1).toUpperCase()}</div>} title={p.name} sub={`Última petición: ${fmtShort(p.last)}`}>
                <span className="badge no-dot">{p.n} petici{p.n === 1 ? 'ón' : 'ones'}</span>
              </Row>
            ))}
          </Group>
        )}

        {tab === 'proyectos' && (
          <Group title="Proyectos activos" sub="Cada proyecto puede tener una o varias cuentas sociales. La relación se edita en Integraciones.">
            {app.projects.map((p) => {
              const accs = app.accountsOf(p.name)
              return (
                <Row key={p.id} icon={<ProjectAvatar name={p.name} />} title={prettyProject(p.name)}
                  sub={`${app.publications.filter((x) => x.proyecto === p.name).length} publicaciones · ${app.requests.filter((x) => x.proyecto === p.name).length} peticiones`}>
                  {accs.length ? accs.map((a) => <span key={a.id} className="badge no-dot">@{a.handle}</span>) : <span className="muted" style={{ fontSize: 12.5 }}>Sin cuentas</span>}
                </Row>
              )
            })}
            {app.hiddenCount > 0 && !app.demo && <Row title={`${app.hiddenCount} registros de otros proyectos ocultos`} sub="Hay filas en la hoja de proyectos que ya no están activos. No se muestran en Nowepost ni se modifican en la hoja." />}
          </Group>
        )}

        {tab === 'integraciones' && (
          <>
            <ServerGroup />
            <SocialGroups />
            <Group title="Datos" sub="La conexión con Google Sheets está fijada y no puede modificarse desde la app.">
              <Row icon={<div className="integration-icon" style={{ background: '#0f9d58' }}><Icon name="sheet" size={19} /></div>} title="Google Sheets · Publicaciones" sub={app.lastSynced ? `Sincronizado ${timeAgo(app.lastSynced)}` : 'Pendiente de sincronizar'}>
                <a className="btn btn-sm" href={PUBLICATIONS_CSV} target="_blank" rel="noreferrer">Abrir</a>
                <button className="btn btn-sm" onClick={() => app.loadPublications(true)}><Icon name="refresh" size={13} className={app.loading ? 'spin' : ''} /> Sincronizar</button>
              </Row>
              <Row icon={<div className="integration-icon" style={{ background: '#0f9d58' }}><Icon name="inbox" size={19} /></div>} title="Google Sheets · Peticiones" sub="Conectado">
                <a className="btn btn-sm" href={REQUESTS_CSV} target="_blank" rel="noreferrer">Abrir</a>
              </Row>
              <Row icon={<div className="integration-icon" style={{ background: '#4285f4' }}><Icon name="code" size={19} /></div>} title="Google Apps Script" sub={<code className="mono">…{SCRIPT_URL.slice(-26)}</code>}>
                <span className="badge green">Conectado</span>
              </Row>
            </Group>
            <section className="settings-group">
              <div className="panel"><details className="plain"><summary>Columnas de la hoja de publicaciones <Icon name="down" size={15} className="muted" /></summary>
                <div className="table-wrap"><table className="table" style={{ pointerEvents: 'none' }}><thead><tr>{['Proyecto', 'Fecha', 'Título', 'Copy', 'Imagen/Video', 'Tipo'].map((c) => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody><tr>{['temeraria', '15/07/2026', 'Post verano', 'El copy…', 'https://…', 'imagen'].map((c) => <td key={c} className="muted" style={{ height: 48 }}>{c}</td>)}</tr></tbody></table></div>
              </details></div>
            </section>
          </>
        )}

        {tab === 'notificaciones' && (
          <Group title="Pendiente de revisar" sub="Peticiones que esperan una decisión del equipo.">
            {pending.length === 0 ? <Row title="No hay peticiones pendientes" /> : pending.map((r) => (
              <button key={r.id} className="row-item" style={{ width: '100%', textAlign: 'left' }} onClick={() => { app.setReqFilter('pending'); app.setView('requests') }}>
                <Thumb media={splitMedia(r.contenido)[0]} tipo={r.tipo} project={r.proyecto} />
                <div className="grow"><b className="trunc">{r.titulo}</b><small>{r.proyecto}{r.solicitante ? ` · ${r.solicitante}` : ''}</small></div>
                <StatusBadge estado={r.estado || 'Pendiente'} kind="req" />
              </button>
            ))}
          </Group>
        )}
      </div>
    </div>
  )
}
