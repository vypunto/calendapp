import { useState } from 'react'
import { useApp } from '../store.jsx'
import { Icon } from './ui.jsx'
import logo from '../assets/logo_nowepost.png'

const FEATURES = [
  { icon: 'calendar', title: 'Planifica', text: 'Organiza tu contenido por proyectos y canales.' },
  { icon: 'users', title: 'Colabora', text: 'Recibe peticiones, aprueba y trabaja en equipo.' },
  { icon: 'chart', title: 'Publica', text: 'Conecta tus redes y lleva tu contenido del plan a la realidad.' },
]
const NETWORKS = [
  { name: 'Instagram', bg: 'linear-gradient(135deg,#f9a43a,#e1306c 55%,#833ab4)', ch: 'IG' },
  { name: 'Facebook', bg: '#1877f2', ch: 'f' },
  { name: 'TikTok', bg: '#111', ch: '♪' },
  { name: 'LinkedIn', bg: '#0a66c2', ch: 'in' },
]
const THUMBS = { 3: 'a', 9: 'b', 18: 'c', 23: 'd' }

// Ilustración del producto: calendario con piezas y tarjetas flotantes (sin imágenes externas).
function Mockup() {
  const days = Array.from({ length: 35 }, (_, i) => i - 2)
  return (
    <div className="lg-mock" aria-hidden="true">
      <div className="lg-cal">
        <div className="lg-cal-head"><b>Octubre 2026</b><span><Icon name="left" size={12} /><Icon name="right" size={12} /></span></div>
        <div className="lg-cal-grid">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => <i key={d}>{d}</i>)}
          {days.map((d) => <div key={d} className={d < 1 || d > 31 ? 'off' : ''}>{d >= 1 && d <= 31 && <small>{d}</small>}{THUMBS[d] && <em className={`th th-${THUMBS[d]}`} />}</div>)}
        </div>
      </div>
      <div className="lg-card lg-post">
        <div className="th th-a big"><span>1/3</span></div>
        <span className="lg-pill"><i />Programado</span>
        <b>Early bird · hasta las 20:30h</b>
        <small>1 oct 2026 · 13:35</small>
      </div>
      <div className="lg-card lg-req">
        <span className="lg-avatar">MG</span>
        <div><b>Nueva petición</b><small>Necesitamos una pieza para el fin de semana.</small><em>Hace 2 horas</em></div>
        <Icon name="right" size={14} />
      </div>
    </div>
  )
}

function PasswordInput({ id, value, onChange, autoComplete, placeholder = '••••••••', autoFocus }) {
  const [show, setShow] = useState(false)
  return (
    <div className="lg-input">
      <Icon name="lock" size={17} />
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} placeholder={placeholder} autoFocus={autoFocus} required />
      <button type="button" className="lg-eye" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}><Icon name={show ? 'eyeOff' : 'eye'} size={17} /></button>
    </div>
  )
}

function SignIn() {
  const app = useApp()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      if (!(await app.login(pw, email.trim()))) { setErr('Correo o contraseña incorrectos.'); setPw('') }
    } catch (x) { setErr(x.message || 'No se pudo iniciar sesión.') } finally { setBusy(false) }
  }
  return (
    <form className="lg-form" onSubmit={submit} noValidate={false}>
      <h2>Bienvenido de nuevo</h2>
      <p className="lg-sub">Ingresa tus credenciales para acceder a tu calendario</p>
      <label htmlFor="lg-email">Correo electrónico</label>
      <div className="lg-input"><Icon name="mail" size={17} /><input id="lg-email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr('') }} autoComplete="username" placeholder="tu@correo.com" autoFocus required /></div>
      <label htmlFor="lg-pw">Contraseña</label>
      <PasswordInput id="lg-pw" value={pw} onChange={(v) => { setPw(v); setErr('') }} autoComplete="current-password" />
      {err && <p className="lg-err" role="alert">{err}</p>}
      <button className="lg-submit" type="submit" disabled={!email.trim() || !pw || busy}>{busy ? 'Entrando…' : <>Iniciar sesión <Icon name="arrowRight" size={17} /></>}</button>
      <div className="lg-or"><span>o</span></div>
      <button type="button" className="lg-ghost" onClick={app.enterDemo}><Icon name="play" size={14} /> Explorar la demo</button>
      <button type="button" className="lg-link" onClick={() => setForgot(!forgot)}>¿Olvidaste tu contraseña?</button>
      {forgot && <p className="lg-hint">Pide a un administrador del equipo que restablezca tu acceso. Por seguridad, las contraseñas no se envían por correo.</p>}
    </form>
  )
}

function ChangePassword() {
  const app = useApp()
  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const strong = pw.length >= 10 && /[a-zA-Z]/.test(pw) && /\d/.test(pw)
  const submit = async (e) => {
    e.preventDefault()
    if (pw !== pw2) return setErr('Las contraseñas no coinciden.')
    setBusy(true); setErr('')
    try { await app.changePassword(cur, pw) } catch (x) { setErr(x.message || 'No se pudo cambiar la contraseña.') } finally { setBusy(false) }
  }
  return (
    <form className="lg-form" onSubmit={submit}>
      <h2>Crea tu contraseña</h2>
      <p className="lg-sub">Hola{app.user?.name ? `, ${app.user.name}` : ''}. Es tu primer acceso: sustituye la contraseña inicial por una propia.</p>
      <label htmlFor="cp-cur">Contraseña inicial</label>
      <PasswordInput id="cp-cur" value={cur} onChange={(v) => { setCur(v); setErr('') }} autoComplete="current-password" autoFocus />
      <label htmlFor="cp-new">Nueva contraseña</label>
      <PasswordInput id="cp-new" value={pw} onChange={(v) => { setPw(v); setErr('') }} autoComplete="new-password" placeholder="Mínimo 10 caracteres" />
      <p className={`lg-rule ${strong ? 'ok' : ''}`}><Icon name="check" size={13} /> 10 caracteres o más, con letras y números</p>
      <label htmlFor="cp-new2">Repite la nueva contraseña</label>
      <PasswordInput id="cp-new2" value={pw2} onChange={(v) => { setPw2(v); setErr('') }} autoComplete="new-password" placeholder="" />
      {err && <p className="lg-err" role="alert">{err}</p>}
      <button className="lg-submit" type="submit" disabled={!cur || !strong || !pw2 || busy}>{busy ? 'Guardando…' : <>Guardar y entrar <Icon name="arrowRight" size={17} /></>}</button>
      <button type="button" className="lg-link" onClick={app.logout}>Cerrar sesión</button>
    </form>
  )
}

export default function Login({ mode = 'signin' }) {
  return (
    <div className="lg">
      <section className="lg-hero">
        <img className="lg-logo" src={logo} alt="Nowepost" />
        <h1>Tu agenda de contenido, clara y en equipo.</h1>
        <p className="lg-lead">Planifica, crea, programa y visualiza todo tu contenido en un solo lugar.</p>
        <ul className="lg-feats">
          {FEATURES.map((f) => <li key={f.title}><span><Icon name={f.icon} size={22} /></span><div><b>{f.title}</b><small>{f.text}</small></div></li>)}
        </ul>
        <div className="lg-nets">{NETWORKS.map((n) => <span key={n.name} title={n.name} style={{ background: n.bg }}>{n.ch}</span>)}<span className="more" title="Más redes próximamente">+</span></div>
      </section>
      <Mockup />
      <section className="lg-panel">{mode === 'password' ? <ChangePassword /> : <SignIn />}</section>
    </div>
  )
}
