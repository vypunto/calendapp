import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, api } from './api.js'
import { SEED_ACCOUNTS, projectById } from './projects.js'
import { demoAccounts } from './demo.js'
import { normalizeDestination, normalizeEvent } from './destinations.js'

// Estados de una cuenta social. "demo" y "offline" no son conexiones reales.
export const ACCOUNT_STATUS = {
  connected: { label: 'Conectada', tone: 'green' },
  disconnected: { label: 'Sin conectar', tone: '' },
  pending: { label: 'Sin conectar', tone: '' },
  expired: { label: 'Token caducado', tone: 'amber' },
  error: { label: 'Error', tone: 'red' },
  demo: { label: 'Demo', tone: 'blue' },
  offline: { label: 'Sin servidor', tone: '' },
}
export const canPublish = (a) => a?.status === 'connected'

// Si el servidor no responde se muestran las plataformas conocidas, sin simular ninguna capacidad.
export const PLATFORMS_FALLBACK = [
  { id: 'instagram', label: 'Instagram', implemented: true, requirements: [
    'Cuenta profesional de Instagram (Business o Creator). Las cuentas personales no se pueden conectar.',
    'Permisos solicitados: instagram_business_basic e instagram_business_content_publish.',
    'Imágenes en JPEG (máx. 8 MB). Reels en MP4/MOV (3 s–15 min, máx. 300 MB). Stories en vídeo de hasta 60 s (máx. 100 MB).',
    'Texto de hasta 2.200 caracteres, 30 hashtags y 20 menciones. Carruseles de hasta 10 imágenes.',
    'Instagram limita las publicaciones por API cada 24 h; Nowepost consulta la cuota antes de publicar.',
    'El acceso dura 60 días y se renueva automáticamente; si caduca hay que volver a conectar la cuenta.',
    'Meta no permite borrar publicaciones desde la API: eliminarlas en Nowepost no las quita de Instagram.',
  ] },
  { id: 'facebook', label: 'Facebook', implemented: false, requirements: [] },
  { id: 'tiktok', label: 'TikTok', implemented: false, requirements: [] },
  { id: 'linkedin', label: 'LinkedIn', implemented: false, requirements: [] },
]

function fromServer(a) {
  const proj = projectById(a.project_id)
  return {
    id: String(a.id), projectId: a.project_id || null, proyecto: proj?.name || null, platform: a.platform || 'instagram', canal: 'Instagram',
    username: a.username, handle: a.username, externalAccountId: a.external_account_id || null, status: a.status || 'pending',
    tokenExpiresAt: a.token_expires_at ? new Date(a.token_expires_at) : null, metadata: a.metadata || {}, lastError: a.last_error || null,
    connectedAt: a.connected_at ? new Date(a.connected_at) : null, source: 'server',
  }
}

const fromSeed = (a, status) => ({
  id: a.username, projectId: a.projectId, proyecto: projectById(a.projectId)?.name || null, platform: a.platform, canal: 'Instagram',
  username: a.username, handle: a.username, externalAccountId: null, status, tokenExpiresAt: null, metadata: {}, lastError: null, source: 'seed',
})

const fromDemo = (a) => ({ ...fromSeed({ username: a.username, projectId: a.projectId, platform: a.platform }, 'demo'), source: 'demo' })

export function useSocial({ demo, toast }) {
  const [backend, setBackend] = useState({ state: 'unknown', configured: null, authenticated: false, user: null, version: null })
  const [serverAccounts, setServerAccounts] = useState([])
  const [destinations, setDestinations] = useState([])
  const [serverPubs, setServerPubs] = useState([])
  const [scheduler, setScheduler] = useState(null)
  const autoRun = useRef(0)
  const [platforms, setPlatforms] = useState(PLATFORMS_FALLBACK)
  const [events, setEvents] = useState([])
  const [insights, setInsights] = useState({ items: [], lastRun: null })
  const [notifications, setNotifications] = useState([])
  const [snippets, setSnippets] = useState([])
  const [reviewLinks, setReviewLinks] = useState([])
  const [feedback, setFeedback] = useState([])
  const [demoOff, setDemoOff] = useState(() => new Set()) // cuentas demo "desconectadas" (simulación)
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const bootstrap = useCallback(async () => {
    try {
      const r = await api('bootstrap')
      if (!alive.current) return
      setBackend({ state: 'online', configured: r.configured || {}, authenticated: !!r.authenticated, user: r.user || null, version: r.version || null })
      setServerAccounts((r.accounts || []).map(fromServer))
      setDestinations((r.destinations || []).map((d) => ({ ...normalizeDestination(d), ref: d.ref })))
      setServerPubs(r.publications || [])
      setScheduler(r.scheduler || null)
      if (r.platforms?.length) setPlatforms(r.platforms)
      setEvents((r.events || []).map(normalizeEvent))
      setInsights({ items: r.insights || [], lastRun: r.insights_last_run || null })
      setNotifications(r.notifications || []); setSnippets(r.snippets || []); setReviewLinks(r.review_links || []); setFeedback(r.feedback || [])
    } catch (e) {
      if (!alive.current) return
      setBackend((b) => ({ ...b, state: e.code === 'unavailable' ? 'offline' : 'online' }))
    }
  }, [])

  useEffect(() => { if (!demo) bootstrap() }, [demo, bootstrap])
  useEffect(() => {
    if (demo || backend.state !== 'online') return undefined
    const publishing = destinations.some((d) => d.status === 'publishing')
    const t = setInterval(bootstrap, publishing ? 8000 : 60000)
    return () => clearInterval(t)
  }, [demo, backend.state, destinations, bootstrap])

  const accounts = useMemo(() => {
    if (demo) return demoAccounts.map((a) => { const x = fromDemo(a); return demoOff.has(x.id) ? { ...x, status: 'pending', source: 'demo' } : x })
    if (backend.state === 'online') return serverAccounts
    return SEED_ACCOUNTS.map((a) => fromSeed(a, backend.state === 'offline' ? 'offline' : 'pending'))
  }, [demo, demoOff, backend.state, serverAccounts])

  const serverPubsByRef = useMemo(() => new Map(serverPubs.map((p) => [p.ref, p])), [serverPubs])
  const destinationsByRef = useMemo(() => {
    const m = new Map()
    destinations.forEach((d) => { if (!m.has(d.ref)) m.set(d.ref, []); m.get(d.ref).push(d) })
    return m
  }, [destinations])

  // Ejecuta una llamada al servidor mostrando errores y detectando sesión caducada.
  const call = useCallback(async (route, opts, { silent = false } = {}) => {
    setBusy(true)
    try { return await api(route, opts) } catch (e) {
      if (e instanceof ApiError && e.status === 401 && route !== 'auth/password') setBackend((b) => ({ ...b, authenticated: false }))
      if (!silent) toast.error(e.message)
      throw e
    } finally { if (alive.current) setBusy(false) }
  }, [toast])

  const login = useCallback(async (password, email = '') => {
    const r = await call('auth/login', { method: 'POST', body: email ? { email, password } : { password } }, { silent: true })
    if (r.ok) { setBackend((b) => ({ ...b, authenticated: true })); await bootstrap() }
    return true
  }, [call, bootstrap])
  const refreshInsights = useCallback(async () => {
    const r = await call('insights/refresh', { method: 'POST', body: {} })
    setInsights({ items: r.insights || [], lastRun: new Date().toISOString() })
    const failed = (r.results || []).filter((x) => !x.ok)
    if (failed.length) toast.error(failed[0].error); else toast.success('Métricas actualizadas')
  }, [call, toast])
  const saveSnippet = useCallback(async (sn) => { const r = await call('snippets/save', { method: 'POST', body: sn }); setSnippets(r.snippets || []); toast.success('Guardado') }, [call, toast])
  const deleteSnippet = useCallback(async (id) => { const r = await call('snippets/delete', { method: 'POST', body: { id } }); setSnippets(r.snippets || []) }, [call])
  const createReviewLink = useCallback(async (body) => { const r = await call('review/create', { method: 'POST', body }); setReviewLinks(r.review_links || []); return r.token }, [call])
  const deleteReviewLink = useCallback(async (token) => { const r = await call('review/delete', { method: 'POST', body: { token } }); setReviewLinks(r.review_links || []) }, [call])
  const testEmail = useCallback(async () => { await call('notifications/test', { method: 'POST', body: {} }); toast.success('Email de prueba enviado') }, [call, toast])
  const changePassword = useCallback(async (current, password) => {
    const r = await call('auth/password', { method: 'POST', body: { current, password } }, { silent: true })
    setBackend((b) => ({ ...b, user: r.user || null }))
    return true
  }, [call])
  const logout = useCallback(async () => { try { await api('auth/logout', { method: 'POST', body: {} }) } catch { /* sin sesión */ } setBackend((b) => ({ ...b, authenticated: false, user: null })); setDestinations([]); setServerPubs([]) }, [])

  // OAuth oficial de Instagram: el usuario introduce sus credenciales en instagram.com, nunca en Nowepost.
  const connectInstagram = useCallback(async (projectId, { forceReauth = false, accountId = null } = {}) => {
    if (demo) {
      setDemoOff((s) => { const n = new Set(s); if (accountId) n.delete(accountId); else n.clear(); return n })
      toast.info('Conexión simulada (modo demo). Fuera del demo se abre el inicio de sesión oficial de Instagram.')
      return
    }
    const r = await call('instagram/connect', { method: 'POST', body: { project_id: projectId || null, force_reauth: forceReauth || undefined } })
    if (r.url) window.location.assign(r.url)
  }, [call, demo, toast])
  const addAccount = useCallback(async ({ username, projectId }) => {
    await call('accounts/add', { method: 'POST', body: { username, project_id: projectId || null, platform: 'instagram' } })
    await bootstrap()
  }, [call, bootstrap])
  const disconnectAccount = useCallback(async (id) => {
    if (demo) { setDemoOff((s) => new Set(s).add(id)); toast.success('Cuenta desconectada (demo)'); return }
    await call('accounts/disconnect', { method: 'POST', body: { id } }); await bootstrap(); toast.success('Cuenta desconectada')
  }, [call, bootstrap, toast, demo])
  const removeAccount = useCallback(async (id) => { await call('accounts/remove', { method: 'POST', body: { id } }); await bootstrap(); toast.success('Cuenta eliminada') }, [call, bootstrap, toast])
  const setAccountProject = useCallback(async (id, projectId) => { await call('accounts/update', { method: 'POST', body: { id, project_id: projectId || null } }); await bootstrap() }, [call, bootstrap])
  const renewToken = useCallback(async (id) => { await call('accounts/refresh', { method: 'POST', body: { id } }); await bootstrap(); toast.success('Token renovado') }, [call, bootstrap, toast])
  const checkAccount = useCallback(async (id) => { const r = await call('accounts/check', { method: 'POST', body: { id } }); await bootstrap(); return r }, [call, bootstrap])

  // Publica lo programado cuya hora ya pasó. El cron externo es el principal; esto es el respaldo del administrador.
  const runScheduler = useCallback(async () => {
    const r = await call('scheduler/run', { method: 'POST', body: {}, timeout: 90000 }, { silent: true })
    await bootstrap()
    return r
  }, [call, bootstrap])
  useEffect(() => {
    if (demo || backend.state !== 'online' || !backend.authenticated || !scheduler?.overdue || busy) return
    if (Date.now() - autoRun.current < 45000) return
    autoRun.current = Date.now()
    runScheduler().catch(() => {})
  }, [demo, backend.state, backend.authenticated, scheduler, busy, runScheduler])

  const savePublicationDestinations = useCallback(async (payload) => {
    const r = await call('publications/save', { method: 'POST', body: payload })
    const list = (r.destinations || []).map((d) => ({ ...normalizeDestination(d), ref: payload.ref }))
    setDestinations((all) => [...all.filter((d) => d.ref !== payload.ref && d.ref !== payload.previous_ref), ...list])
    return list
  }, [call])
  const publishDestination = useCallback(async (id) => {
    const r = await call('destinations/publish', { method: 'POST', body: { id }, timeout: 150000 }, { silent: true })
    await bootstrap()
    return r.destination
  }, [call, bootstrap])
  const cancelDestination = useCallback(async (id) => { await call('destinations/cancel', { method: 'POST', body: { id } }); await bootstrap() }, [call, bootstrap])
  const deletePublication = useCallback(async (ref) => {
    await call('publications/delete', { method: 'POST', body: { ref } })
    setDestinations((all) => all.filter((d) => d.ref !== ref))
    await bootstrap()
  }, [call, bootstrap])
  const eventsByDest = useMemo(() => {
    const m = new Map()
    events.forEach((e) => { if (!m.has(e.channelId)) m.set(e.channelId, []); m.get(e.channelId).push(e) })
    return m
  }, [events])

  return {
    backend, platforms, scheduler, runScheduler, serverPubs, serverPubsByRef, eventsByDest, deletePublication, accounts, destinations, destinationsByRef, busy, bootstrap, login, logout, changePassword, insights, refreshInsights, notifications, snippets, saveSnippet, deleteSnippet, reviewLinks, createReviewLink, deleteReviewLink, feedback, testEmail, connectInstagram, addAccount, disconnectAccount, removeAccount,
    setAccountProject, renewToken, checkAccount, savePublicationDestinations, publishDestination, cancelDestination,
  }
}
