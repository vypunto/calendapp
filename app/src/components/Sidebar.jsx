import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store.jsx'
import { projectColor } from '../lib/data.js'
import { prettyProject } from '../lib/projects.js'
import { ChannelTile, Icon, accountDot, useOutside } from './ui.jsx'
import { ACCOUNT_STATUS } from '../lib/social.jsx'
import logo from "../assets/logo_nowepost.png"
import favicon from "../assets/mark.svg"

const MAX_PROJECTS = 6

function NavItem({ icon, label, active, onClick, count }) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick} title={label} aria-current={active ? 'page' : undefined}>
      <Icon name={icon} size={16} />
      <span className="txt">{label}</span>
      {count > 0 && <span className="count">{count}</span>}
    </button>
  )
}

// Selector de cuenta activa: la lista sale de app.accounts (conexiones del servidor).
export function AccountSwitcher({ up = false }) {
  const app = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false))
  const acc = app.account
  return (
    <div className="account-switch" ref={ref}>
      <button className="acct-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} title={acc ? `@${acc.handle}` : 'Todas las cuentas'}>
        {acc ? <ChannelTile canal={acc.canal} size={28} /> : <span className="avatar" style={{ width: 28, height: 28, background: 'var(--surface-3)', color: 'var(--ink-2)' }}><Icon name="users" size={14} /></span>}
        <span className="acct-meta"><span className="acct-kicker">Cuenta activa</span><b className="trunc" style={{ display: 'block' }}>{acc ? `@${acc.handle}` : 'Todas las cuentas'}</b></span>
        <Icon name="down" size={14} className="acct-chev" />
      </button>
      {open && (
        <div className={`popover ${up ? 'up' : ''}`} style={{ minWidth: 250, left: 0, right: 0 }} role="listbox">
          <div className="pop-label">CUENTAS</div>
          <button className={`pop-item ${!acc ? 'on' : ''}`} role="option" aria-selected={!acc} onClick={() => { app.setActiveAccount(null); setOpen(false) }}>
            <Icon name="users" size={15} /> Todas las cuentas {!acc && <Icon name="check" size={14} style={{ marginLeft: 'auto' }} />}
          </button>
          {app.accounts.map((a) => (
            <button key={a.id} className={`pop-item ${acc?.id === a.id ? 'on' : ''}`} role="option" aria-selected={acc?.id === a.id} onClick={() => { app.setActiveAccount(a.id); setOpen(false) }}>
              <ChannelTile canal={a.canal} size={20} /><span className="trunc">@{a.handle}</span>
              <i className="state-dot" style={{ '--dot': accountDot(a.status), marginLeft: 'auto' }} title={ACCOUNT_STATUS[a.status]?.label} />
              {acc?.id === a.id && <Icon name="check" size={14} />}
            </button>
          ))}
          <div className="pop-sep" />
          <button className="pop-item" onClick={() => { setOpen(false); app.goIntegrations() }}><Icon name="plus" size={15} /> Conectar cuenta</button>
        </div>
      )}
    </div>
  )
}

// Menú global "+ Crear": publicación y petición son flujos independientes.
export function CreateMenu({ block = false, up = false, label = 'Crear' }) {
  const app = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false))
  const run = (fn) => { setOpen(false); fn() }
  return (
    <div className={`create-menu ${block ? 'block' : ''}`} ref={ref}>
      <button className="btn btn-primary create-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title="Crear">
        <Icon name="plus" size={15} /><span className="txt">{label}</span>
      </button>
      {open && (
        <div className={`popover ${up ? 'up' : ''} create-pop`} role="menu">
          <button className="pop-item" role="menuitem" onClick={() => run(() => app.requireAuth(() => app.startPublication(null)))}>
            <Icon name="edit" size={15} /><span><b>Nueva publicación</b><small>Crear, programar o publicar</small></span>
          </button>
          <button className="pop-item" role="menuitem" onClick={() => run(app.startRequest)}>
            <Icon name="inbox" size={15} /><span><b>Nueva petición</b><small>Solicitar contenido al equipo</small></span>
          </button>
        </div>
      )}
    </div>
  )
}

export function UserMenu({ up = true }) {
  const app = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false))
  const name = app.userName || (app.isAuth ? 'Equipo' : 'Invitado')
  const role = app.isAuth ? 'Admin' : 'Solicitante'
  return (
    <div className="user-card" ref={ref}>
      <button className="user-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <div className="avatar" style={{ background: 'var(--surface-3)', color: 'var(--ink-2)' }}>{name.slice(0, 1).toUpperCase()}</div>
        <div className="user-meta"><b>{name}</b><span>{role}</span></div>
      </button>
      {open && (
        <div className={`popover ${up ? 'up' : ''}`} style={{ left: 0, right: 0, minWidth: 210 }} role="menu">
          {app.isAuth
            ? <button className="pop-item" onClick={() => { app.logout(); setOpen(false) }}><Icon name="logout" size={15} /> Cerrar sesión de equipo</button>
            : <button className="pop-item" onClick={() => { app.setShowAuth(true); setOpen(false) }}><Icon name="lock" size={15} /> Acceso del equipo</button>}
          {app.demo
            ? <button className="pop-item" onClick={() => { app.exitDemo(); setOpen(false) }}><Icon name="x" size={15} /> Salir del modo demo</button>
            : <button className="pop-item" onClick={() => { app.enterDemo(); setOpen(false) }}><Icon name="flame" size={15} /> Ver modo demo</button>}
          {app.isAuth && <button className="pop-item" onClick={() => { app.setView('settings'); setOpen(false) }}><Icon name="sliders" size={15} /> Ajustes</button>}
          <a className="pop-item" href="./help.html"><Icon name="info" size={15} /> Ayuda</a>
          <a className="pop-item" href="./privacy.html" target="_blank" rel="noreferrer"><Icon name="lock" size={15} /> Política de privacidad</a>
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const app = useApp()
  const { view, reqFilter, sidebarCollapsed: collapsed } = app
  const counts = {}
  app.publications.forEach((p) => { counts[p.proyecto] = (counts[p.proyecto] || 0) + 1 })
  const projects = app.projectNames.filter((p) => app.matchesAccount(p))
  const shown = projects.slice(0, MAX_PROJECTS)
  const [, bump] = useState(0)
  useEffect(() => { const h = () => bump((n) => n + 1); window.addEventListener('nw-alerts-seen', h); return () => window.removeEventListener('nw-alerts-seen', h) }, [])
  const seen = (() => { try { return localStorage.getItem('nw_alerts_seen') || '' } catch { return '' } })()
  const unseen = app.social.notifications.filter((n) => n.at > seen).length
  const toggleProject = (p) => {
    app.setProjectsFilter(app.projectsFilter.length === 1 && app.projectsFilter[0] === p ? [] : [p])
    if (!['calendar', 'list', 'feed'].includes(view)) app.setView('calendar')
  }
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Navegación principal">
      <div className="sidebar-brand">
        {collapsed ? <img src={favicon} alt="Nowepost" width="30" height="30" style={{ height: 30 }} /> : <img src={logo} alt="Nowepost" />}
        <button className="icon-btn" onClick={() => app.setSidebarCollapsed(!collapsed)} title={collapsed ? 'Expandir' : 'Contraer'} aria-label={collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}><Icon name="panel" size={16} /></button>
      </div>
      <AccountSwitcher />
      <div className="sidebar-create"><CreateMenu block /></div>

      <div className="sidebar-scroll">
        <div className="nav-label"><span>CONTENIDO</span></div>
        <NavItem icon="layers" label="Inicio" active={view === 'home'} onClick={() => app.setView('home')} />
        <NavItem icon="calendar" label="Calendario" active={view === 'calendar'} onClick={() => app.setView('calendar')} />
        <NavItem icon="list" label="Publicaciones" active={view === 'list'} onClick={() => app.setView('list')} />
        <NavItem icon="grid" label="Visual Feed" active={view === 'feed'} onClick={() => app.setView('feed')} />

        <div className="nav-label"><span>PETICIONES</span></div>
        <NavItem icon="inbox" label="Peticiones" active={view === 'requests' && reqFilter === 'all'} onClick={() => { app.setReqFilter('all'); app.setView('requests') }} />
        <NavItem icon="clock" label="Pendientes" count={app.pendingCount} active={view === 'requests' && reqFilter === 'pending'} onClick={() => { app.setReqFilter('pending'); app.setView('requests') }} />

        <div className="projects-block">
          <div className="nav-label"><span>PROYECTOS</span><button onClick={() => app.setView('projects')}>Ver todos</button></div>
          {shown.map((p) => (
            <button key={p} className={`nav-item ${app.projectsFilter.includes(p) ? 'active' : ''}`} onClick={() => toggleProject(p)} title={p}>
              <span className="dot" style={{ background: projectColor(p).dot }} />
              <span className="txt">{prettyProject(p)}</span>
              {counts[p] > 0 && <span className="num">{counts[p]}</span>}
            </button>
          ))}
          {projects.length > MAX_PROJECTS && (
            <button className="nav-item" onClick={() => app.setView('projects')}><Icon name="more" size={16} /><span className="txt">{projects.length - MAX_PROJECTS} más</span></button>
          )}
        </div>

        <div className="nav-label"><span>ESPACIO DE TRABAJO</span></div>
        <NavItem icon="image" label="Biblioteca" active={view === 'library'} onClick={() => app.setView('library')} />
        <NavItem icon="chart" label="Estadísticas" active={view === 'stats'} onClick={() => app.setView('stats')} />
        {app.isAuth && !app.demo && <NavItem icon="bell" label="Avisos" count={unseen || undefined} active={view === 'settings' && app.settingsTab === 'notificaciones'} onClick={() => { app.setSettingsTab('notificaciones'); app.setView('settings') }} />}
        {app.isAuth && <NavItem icon="sliders" label="Ajustes" active={view === 'settings' && app.settingsTab !== 'notificaciones'} onClick={() => app.setView('settings')} />}
      </div>
      <UserMenu />
    </aside>
  )
}

export function MobileBar() {
  const app = useApp()
  const [more, setMore] = useState(false)
  const items = [['home', 'layers', 'Inicio'], ['calendar', 'calendar', 'Calendario'], ['list', 'list', 'Publicaciones'], ['requests', 'inbox', 'Peticiones']]
  const extra = [['feed', 'grid', 'Visual Feed'], ['projects', 'folder', 'Proyectos'], ['library', 'image', 'Biblioteca'], ['stats', 'chart', 'Estadísticas'], ...(app.isAuth ? [['settings', 'sliders', 'Ajustes']] : [])]
  return (
    <>
      {more && (
        <div className="overlay mobile-only" onMouseDown={(e) => e.target === e.currentTarget && setMore(false)}>
          <div className="dialog narrow" style={{ paddingBottom: 92 }}>
            <div style={{ padding: 12 }}>
              <AccountSwitcher up />
              <div style={{ margin: '8px 0' }}><CreateMenu block up /></div>
              {extra.map(([v, ic, label]) => (
                <button key={v} className={`nav-item ${app.view === v ? 'active' : ''}`} style={{ height: 44 }} onClick={() => { app.setView(v); setMore(false) }}><Icon name={ic} size={18} /><span className="txt">{label}</span></button>
              ))}
              <UserMenu up />
            </div>
          </div>
        </div>
      )}
      <nav className="mobile-bar" aria-label="Navegación">
        {items.map(([v, ic, label]) => (
          <button key={v} className={app.view === v ? 'on' : ''} onClick={() => { if (v === 'requests') app.setReqFilter('all'); app.setView(v) }}>
            <Icon name={ic} size={20} />{label}
            {v === 'requests' && app.pendingCount > 0 && <span className="count">{app.pendingCount}</span>}
          </button>
        ))}
        <button className={extra.some(([v]) => v === app.view) ? 'on' : ''} onClick={() => setMore((m) => !m)}><Icon name="more" size={20} />Más</button>
      </nav>
    </>
  )
}
