import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store.jsx'
import {
  CHANNELS, PUB_ESTADOS, TIPOS, readAsDataUrl, scriptUploadFile, splitMedia, thumbOf, toInputDate,
} from '../lib/data.js'
import { TIMEZONES, combineDateTime, defaultTz, destLabel, destTime, pubRef } from '../lib/destinations.js'
import { AccountStatusBadge, Select } from './ui.jsx'
import { prettyProject } from '../lib/projects.js'
import { ChannelTile, Cover, Icon, Modal, ProjectAvatar, StatusBadge, tipoIcon } from './ui.jsx'
import { BestTimeHint, FirstComment, SnippetMenu } from './EditorExtras.jsx'

// ── Subida de archivos (misma lógica que el original) ─────────────────────
export function useUploader(scriptUrl, onUrl) {
  const [items, setItems] = useState([])
  const upload = useCallback(async (files) => {
    for (const file of Array.from(files)) {
      const key = `${file.name}-${Date.now()}-${Math.random()}`
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
      const patch = (status) => setItems((l) => l.map((i) => (i.key === key ? { ...i, status } : i)))
      if (file.size >= 50 * 1024 * 1024) { setItems((l) => [...l, { key, nombre: file.name, preview, status: 'toobig' }]); continue }
      setItems((l) => [...l, { key, nombre: file.name, preview, status: 'uploading' }])
      if (!scriptUrl) { patch('error'); continue }
      try {
        const res = await scriptUploadFile(scriptUrl, file.name, file.type, await readAsDataUrl(file))
        if (res?.url) { onUrl(res.url); patch('done') } else patch('error')
      } catch (e) {
        console.error('Upload error:', e?.message || e)
        patch('error')
      }
    }
  }, [scriptUrl, onUrl])
  const dismiss = (key) => setItems((l) => l.filter((i) => i.key !== key))
  return { items, upload, dismiss }
}

const STATUS_TXT = { uploading: 'Subiendo…', error: 'Error', toobig: '>50 MB' }

export function MediaField({ value, onChange, scriptUrl }) {
  const inputRef = useRef(null)
  const [url, setUrl] = useState('')
  const list = splitMedia(value)
  const valueRef = useRef(value)
  valueRef.current = value
  const append = useCallback((u) => onChange(valueRef.current ? `${valueRef.current}, ${u}` : u), [onChange])
  const { items, upload, dismiss } = useUploader(scriptUrl, append)
  const pending = items.filter((i) => i.status !== 'done')
  const remove = (i) => onChange(list.filter((_, x) => x !== i).join(', '))
  const addUrl = () => { if (url.trim()) { append(url.trim()); setUrl('') } }
  return (
    <div className="field">
      <div className="media-strip"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) upload(e.dataTransfer.files) }}>
        {list.map((m, i) => (
          <div className="media-item" key={m + i}>
            {thumbOf(m) ? <img src={thumbOf(m)} alt="" /> : <Icon name="video" size={20} />}
            <button className="rm" onClick={() => remove(i)} aria-label="Quitar"><Icon name="x" size={11} /></button>
          </div>
        ))}
        {pending.map((p) => (
          <div className="media-item" key={p.key}>
            {p.preview && <img src={p.preview} alt="" />}
            <div className="st">{STATUS_TXT[p.status]}</div>
            {p.status !== 'uploading' && <button className="rm" onClick={() => dismiss(p.key)} aria-label="Descartar"><Icon name="x" size={11} /></button>}
          </div>
        ))}
        <button type="button" className="media-add" onClick={() => inputRef.current?.click()}><Icon name="plus" size={16} />Añadir</button>
        <input ref={inputRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { if (e.target.files.length) upload(e.target.files); e.target.value = '' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input className="input" placeholder="…o pega un enlace (Drive, YouTube, imagen)" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUrl())} />
        <button type="button" className="btn" onClick={addUrl} disabled={!url.trim()}>Añadir</button>
      </div>
    </div>
  )
}

// ── Formato de la imagen (recorte) ────────────────────────────────────────
// Instagram solo admite imágenes entre 4:5 y 1,91:1. El recorte se hace en el servidor al publicar.
export const IMAGE_RATIOS = [['original', 'Original'], ['1:1', 'Cuadrado 1:1'], ['4:5', 'Vertical 4:5'], ['1.91:1', 'Horizontal 1,91:1']]
const ratioOf = (sel, natural) => ({ '1:1': 1, '4:5': 0.8, '1.91:1': 1.91 }[sel] ?? Math.min(1.91, Math.max(0.8, natural || 1)))

function useNaturalRatio(media) {
  const src = thumbOf(media)
  const [r, setR] = useState(null)
  useEffect(() => {
    setR(null)
    if (!src) return undefined
    const i = new Image()
    i.onload = () => setR(i.naturalWidth && i.naturalHeight ? i.naturalWidth / i.naturalHeight : null)
    i.src = src
    return undefined
  }, [src])
  return r
}

// ── Previsualización ──────────────────────────────────────────────────────
export function PostPreview({ form, accountHandle }) {
  const app = useApp()
  const natural = useNaturalRatio(splitMedia(form.media)[0])
  const isFeedImage = ['imagen', 'carrusel'].includes(form.tipo) && splitMedia(form.media).length > 0
  const canal = (form.canal || 'Instagram').toLowerCase()
  const handle = accountHandle || app.accountOf(form.proyecto)?.handle || (form.proyecto || 'tu_proyecto').toLowerCase().replace(/[^a-z0-9]+/g, '')
  const first = splitMedia(form.media)[0]
  const n = splitMedia(form.media).length
  const copy = form.copy || ''
  const placeholder = <span className="muted" style={{ fontStyle: 'italic' }}>El contenido aparecerá aquí…</span>
  const media = (cls) => (
    <div className={`p-media ${cls}`}><Cover media={first} tipo={form.tipo} iconSize={36} />{n > 1 && <span className="mc-count" style={{ position: 'absolute', top: 10, right: 10 }}>1/{n}</span>}</div>
  )
  const head = (sub) => (
    <div className="p-head"><ProjectAvatar name={form.proyecto || '?'} size={34} /><div><b>{canal === 'instagram' || canal === 'tiktok' ? handle : form.proyecto || 'Proyecto'}</b><small>{sub}</small></div><span style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}><Icon name="more" size={16} /></span></div>
  )
  if (canal === 'tiktok') {
    return (
      <div className="phone dark">
        <div className="p-media tall" style={{ background: '#1b1b1b' }}>
          <Cover media={first} tipo={form.tipo} iconSize={40} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '40px 14px 14px', background: 'linear-gradient(transparent,rgba(0,0,0,.75))', textAlign: 'left', color: '#fff' }}>
            <b style={{ fontSize: 13 }}>@{handle}</b>
            <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{copy.slice(0, 180) || 'El contenido aparecerá aquí…'}</div>
          </div>
        </div>
      </div>
    )
  }
  if (canal === 'facebook' || canal === 'linkedin' || canal === 'twitter' || canal === 'web' || canal === 'youtube' || canal === 'otros') {
    return (
      <div className="phone">
        {head(canal === 'linkedin' ? 'Publicación · Público' : 'Ahora · Público')}
        <div className="p-copy" style={{ paddingTop: 0 }}>{copy || placeholder}</div>
        {first && media('wide')}
        <div className="p-actions" style={{ borderTop: '1px solid var(--line)', marginTop: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)', justifyContent: 'space-around', padding: '10px 12px' }}>
          <span>Me gusta</span><span>Comentar</span><span>Compartir</span>
        </div>
      </div>
    )
  }
  const tipo = form.tipo
  const avatar = <ProjectAvatar name={form.proyecto || '?'} size={32} />
  if (tipo === 'historia') {
    return (
      <div className="phone vertical story">
        <div className="p-media tall" style={{ background: '#111' }}>
          <Cover media={first} tipo={tipo} iconSize={40} />
          <div className="story-top"><i className="story-bar" /><div className="story-head">{avatar}<b>{handle}</b><small>Ahora</small><span style={{ marginLeft: 'auto' }}><Icon name="more" size={16} /></span></div></div>
          <div className="story-bottom"><span>Enviar mensaje</span><Icon name="heart" size={20} /><Icon name="send" size={20} /></div>
        </div>
        <p className="muted preview-note">Las historias se publican sin texto: Instagram no admite pie de foto por API.</p>
      </div>
    )
  }
  if (tipo === 'reel' || tipo === 'video') {
    return (
      <div className="phone vertical reel">
        <div className="p-media tall" style={{ background: '#111' }}>
          <Cover media={first} tipo={tipo} iconSize={40} />
          <div className="reel-top"><b>Reels</b><Icon name="camera" size={18} /></div>
          <div className="reel-side"><span><Icon name="heart" size={22} /><small>0</small></span><span><Icon name="message" size={22} /><small>0</small></span><span><Icon name="send" size={22} /></span><span><Icon name="more" size={22} /></span></div>
          <div className="reel-bottom">
            <div className="reel-user">{avatar}<b>{handle}</b><em>Seguir</em></div>
            <div className="reel-copy">{copy ? copy.slice(0, 140) : 'El texto aparecerá aquí…'}</div>
            <small>♪ Audio original · {handle}</small>
          </div>
        </div>
      </div>
    )
  }
  if (tipo === 'texto') {
    return (
      <div className="phone">
        {head('Ahora')}
        <div className="p-copy" style={{ paddingTop: 0 }}>{copy ? <><b>{handle}</b>{copy}</> : placeholder}</div>
        <p className="muted preview-note" style={{ paddingTop: 0 }}>Instagram necesita siempre una imagen o un vídeo: una publicación solo de texto no se puede publicar en Instagram.</p>
      </div>
    )
  }
  return (
    <div className="phone">
      {head('Ahora')}
      {isFeedImage
        ? <div className={`p-media ${form.image_fit === 'crop' ? '' : 'contain'}`} style={{ aspectRatio: ratioOf(form.image_ratio, natural) }}><Cover media={first} tipo={tipo} iconSize={36} />{n > 1 && <span className="mc-count" style={{ position: 'absolute', top: 10, right: 10 }}>1/{n}</span>}</div>
        : media('')}
      <div className="p-actions"><Icon name="heart" size={20} /><Icon name="message" size={20} /><Icon name="send" size={20} />{tipo === 'carrusel' && n > 1 && <span className="dots">{Array.from({ length: Math.min(n, 10) }, (_, i) => <i key={i} className={i === 0 ? 'on' : ''} />)}</span>}<span className="sp"><Icon name="bookmark" size={20} /></span></div>
      <div className="p-copy">{copy ? <><b>{handle}</b>{copy}</> : placeholder}</div>
    </div>
  )
}

// ── Destinos: cuentas donde se publicará ──────────────────────────────────
function DestinationPicker({ app, project, selected, setSelected, existing, disabledReason, onPick }) {
  const accounts = useMemo(() => {
    const own = app.accounts.filter((a) => a.proyecto === project)
    return [...own, ...app.accounts.filter((a) => a.proyecto !== project)]
  }, [app.accounts, project])
  const toggle = (id) => {
    if (!selected.has(id)) onPick?.(app.accountById(id)) // al marcar una cuenta se completa el proyecto si falta
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  return (
    <div className="field">
      <span className="label">Cuentas de destino</span>
      {disabledReason && <div className="banner err" style={{ margin: 0 }}><Icon name="info" size={15} /><span className="grow">{disabledReason}</span></div>}
      <div className="dest-list">
        {accounts.map((a) => {
          const ex = existing.get(a.id)
          const locked = ex && ex.status === 'published'
          const usable = app.canPublish(a) || a.status === 'demo'
          const off = !!disabledReason || (!usable && !ex)
          return (
            <label key={a.id} className={`dest-row ${selected.has(a.id) ? 'on' : ''} ${off || locked ? 'off' : ''}`}>
              <input type="checkbox" className="check" checked={selected.has(a.id)} disabled={off || locked} onChange={() => toggle(a.id)} />
              <ChannelTile canal={a.canal} size={22} />
              <span className="grow"><b>Instagram · @{a.handle}</b><small>{a.proyecto ? prettyProject(a.proyecto) : 'Sin proyecto asociado'}</small></span>
              {ex ? <StatusBadge estado={destLabel(ex.status)} /> : <AccountStatusBadge status={a.status} />}
            </label>
          )
        })}
        <div className="dest-row off"><input type="checkbox" className="check" disabled /><ChannelTile canal="Facebook" size={22} /><span className="grow"><b>Facebook</b><small>Sin integración disponible</small></span></div>
      </div>
      {!disabledReason && accounts.every((a) => !(app.canPublish(a) || a.status === 'demo')) && (
        <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => { app.setEditing(null); app.goIntegrations() }}><Icon name="plus" size={14} /> Conectar una cuenta</button>
      )}
    </div>
  )
}

// ── Editor ────────────────────────────────────────────────────────────────
const EMPTY = { first_comment: '', proyecto: '', fecha: '', titulo: '', copy: '', media: '', tipo: 'imagen', canal: 'Instagram', estado: 'Programado', url_post: '', promocionado: false, presupuesto: '', image_ratio: 'original', image_fit: 'fit' }

// La hoja puede traer el canal vacío o en minúsculas: se normaliza para que no se confunda con un canal sin integración.
const normCanal = (c) => (!c || String(c).trim().toLowerCase() === 'instagram' ? 'Instagram' : c)

export default function Editor() {
  const app = useApp()
  const pub = app.editing === 'new' ? null : app.editing
  const isDup = !!pub?.isDuplicate // «Duplicar»: se edita como una publicación nueva con el contenido copiado
  const isNew = !pub || isDup
  const existing = useMemo(() => (isDup ? new Map() : new Map((pub?.destinos || []).map((d) => [d.accountId, d]))), [pub, isDup])
  const [confirmDel, setConfirmDel] = useState(false)
  const [form, setForm] = useState(() => !pub
    ? { ...EMPTY, proyecto: app.projectsFilter.length === 1 ? app.projectsFilter[0] : (app.account?.proyecto || ''), fecha: toInputDate(app.newPubDate || new Date()) }
    : {
      proyecto: pub.proyecto || '', fecha: toInputDate(pub.fecha), titulo: pub.titulo || '', copy: pub.copy || '', media: pub.media || '',
      tipo: pub.tipo || 'imagen', canal: normCanal(pub.canal), estado: isDup ? '' : pub.estado || '', url_post: pub.url_post || '',
      promocionado: (pub.promocionado || 'No').toLowerCase().startsWith('s'), presupuesto: pub.presupuesto || '',
      image_ratio: pub.image_ratio || 'original', image_fit: pub.image_fit || 'fit', first_comment: pub.first_comment || '',
    })
  const [selected, setSelected] = useState(() => new Set((pub?.destinos || []).filter((d) => d.status !== 'cancelled').map((d) => d.accountId)))
  const [touched, setTouched] = useState(false)
  const firstScheduled = (pub?.destinos || []).find((x) => x.scheduledAt)
  const [hora, setHora] = useState(() => (firstScheduled ? destTime(firstScheduled) : pub?.hora || ''))
  const [tz, setTz] = useState(() => firstScheduled?.timezone || defaultTz())
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState('')
  const previousRef = useMemo(() => (pub && !isDup ? pubRef(pub) : null), [pub, isDup])
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setMedia = useCallback((v) => setForm((f) => ({ ...f, media: v })), [])
  const close = () => { app.setEditing(null); app.setNewPubDate(null) }
  const valid = form.proyecto && form.fecha && form.titulo.trim()
  const canalList = [...new Set([...CHANNELS.filter((x) => x !== 'Otros'), ...(form.canal && !CHANNELS.includes(form.canal) ? [form.canal] : [])])]

  // Sin selección manual, los destinos por defecto son las cuentas del proyecto elegido.
  useEffect(() => {
    if (touched || (pub?.destinos?.length)) return
    const usable = app.accounts.filter((a) => a.proyecto === form.proyecto && (app.canPublish(a) || a.status === 'demo'))
    const active = usable.find((a) => a.id === app.account?.id)
    setSelected(new Set((active ? [active] : usable).map((a) => a.id)))
  }, [form.proyecto, touched, pub, app.accounts, app.account, app.canPublish])

  const backend = app.social.backend
  const disabledReason = form.canal !== 'Instagram' ? 'Este canal solo se registra en el calendario.'
    : app.demo ? null
      : backend.state !== 'online' ? 'El servidor de Nowepost no está disponible: los destinos no se pueden guardar.'
        : !backend.authenticated ? 'La sesión del servidor ha caducado: vuelve a entrar con el acceso del equipo para elegir cuentas y programar.'
          : null
  const pickedAccounts = [...selected].map((id) => app.accountById(id)).filter(Boolean)
  const usesDestinations = !disabledReason && pickedAccounts.length > 0
  const firstHandle = pickedAccounts[0]?.handle

  const validateDestinations = (scheduling, now) => {
    if (!usesDestinations) return ''
    if ((scheduling || now) && (form.tipo === 'texto' || splitMedia(form.media).length === 0)) return 'Instagram necesita una imagen o un vídeo para programar o publicar. Puedes guardar un borrador sin archivo.'
    if (scheduling) {
      if (!hora) return 'Indica la hora para programar la publicación.'
      const when = combineDateTime(new Date(`${form.fecha}T12:00:00`), hora, tz)
      if (!when) return 'La hora no es válida.'
      if (!now && !app.demo && when <= new Date()) return 'La hora programada ya ha pasado. Cámbiala o usa “Publicar ahora”.'
    }
    return ''
  }

  const buildDests = (estado, scheduling) => {
    if (!usesDestinations) return undefined
    const when = scheduling ? combineDateTime(new Date(`${form.fecha}T12:00:00`), hora, tz) : null
    return [...selected].map((accountId) => {
      const ex = existing.get(accountId)
      if (ex && ex.status === 'published') return { accountId, status: 'published', scheduledAt: ex.scheduledAt }
      return { accountId, status: scheduling ? 'scheduled' : 'draft', scheduledAt: when, timezone: tz }
    }).filter((d) => d.status !== 'published')
  }

  const save = async (estadoOverride, { now = false, explicit = false } = {}) => {
    if (!valid || saving) return
    const estado = estadoOverride ?? form.estado
    const scheduling = !now && estado === 'Programado'
    const err = (explicit || now) && form.canal === 'Instagram' && !usesDestinations ? needAccount : validateDestinations(scheduling, now)
    if (err) { setProblem(err); return }
    setProblem('')
    setSaving(true)
    const dests = buildDests(estado, scheduling)
    const publishAfter = now ? [...selected].filter((id) => existing.get(id)?.status !== 'published') : undefined
    try {
      if (isNew) await app.createPublication({ ...form, estado, hora, promocionado: undefined, url_post: undefined }, { dests, publishAfter })
      else {
        await app.savePublication({ ...pub, ...form, estado, fecha: form.fecha ? new Date(`${form.fecha}T12:00:00`) : pub.fecha, promocionado: form.promocionado ? 'Sí' : 'No' }, { dests, previousRef, publishAfter })
      }
    } finally { setSaving(false) }
  }

  const noAccounts = form.canal === 'Instagram' && !app.accounts.some((a) => app.canPublish(a) || a.status === 'demo')
  const needAccount = noAccounts ? 'Conecta una cuenta de Instagram para programar o publicar. Puedes guardar un borrador mientras tanto.' : 'Elige al menos una cuenta de destino para programar o publicar.'
  const canPublishNow = usesDestinations && pickedAccounts.some((a) => (app.demo || app.canPublish(a)) && existing.get(a.id)?.status !== 'published')
  const publishWhy = !valid ? 'Completa proyecto, fecha y título.' : form.canal !== 'Instagram' ? 'Este canal solo se registra en el calendario.' : disabledReason || (noAccounts ? needAccount : !usesDestinations ? 'Elige una cuenta de destino.' : '')
  const busyLabel = saving ? 'Guardando…' : null
  const locked = !isNew && (pub.destinos || []).some((d) => ['published', 'publishing'].includes(d.status))

  return (
    <Modal onClose={close} size="editor">
      <div className="dialog-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="icon-btn" onClick={close} aria-label="Cerrar"><Icon name="x" size={16} /></button>
          <div><h2>{isDup ? 'Duplicar publicación' : isNew ? 'Nueva publicación' : 'Editar publicación'}</h2><small>{isDup ? 'Se creará una publicación nueva con este contenido' : isNew ? 'Se añadirá a la hoja de publicaciones' : 'Los cambios se guardan en la hoja'}</small></div>
        </div>
      </div>

      <div className="dialog-body">
        {noAccounts && !app.demo && (
          <div className="no-account" style={{ marginBottom: 'var(--s4)' }}>
            <Icon name="info" size={18} />
            <div className="grow"><b>Conecta una cuenta primero</b><small>Para programar o publicar necesitas una cuenta de Instagram conectada con la autorización oficial de Meta. Mientras tanto puedes guardar borradores.</small></div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { app.setEditing(null); app.goIntegrations() }}><Icon name="plus" size={14} /> Conectar Instagram</button>
          </div>
        )}
        {problem && <div className="banner err"><Icon name="info" size={15} /><span className="grow">{problem}</span></div>}
        <div className="editor-grid">
          <div className="form-card">
            <div className="form-section">
              <div className="field-row">
                <div className="field">
                  <label htmlFor="e-proyecto">Proyecto *</label>
                  <Select id="e-proyecto" className="select" value={form.proyecto} onChange={(e) => set('proyecto', e.target.value)}>
                    <option value="">Selecciona…</option>
                    {[...new Set([...app.projectNames, form.proyecto].filter(Boolean))].map((p) => <option key={p}>{p}</option>)}
                  </Select>
                </div>
                <div className="field">
                  <label htmlFor="e-canal">Canal</label>
                  <Select id="e-canal" className="select" value={form.canal} onChange={(e) => set('canal', e.target.value)}>
                    <option value="">Sin canal</option>
                    {canalList.map((c) => <option key={c}>{c}</option>)}
                  </Select>
                </div>
              </div>
              <DestinationPicker app={app} project={form.proyecto} selected={selected} existing={existing} disabledReason={disabledReason}
                onPick={(a) => { if (!form.proyecto && a?.proyecto) set('proyecto', a.proyecto) }}
                setSelected={(fn) => { setTouched(true); setSelected(fn) }} />
            </div>

            <div className="form-section">
              <div className="field"><label htmlFor="e-titulo">Título *</label><input id="e-titulo" className="input" value={form.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Nombre interno de la publicación" /></div>
              <div className="field">
                <span className="label">Tipo de contenido</span>
                <div className="chip-group">{TIPOS.map((t) => <button type="button" key={t} className={`chip ${form.tipo === t ? 'on' : ''}`} aria-pressed={form.tipo === t} onClick={() => set('tipo', t)} style={{ textTransform: 'capitalize' }}><Icon name={tipoIcon[t]} size={13} />{t}</button>)}</div>
              </div>
              <div className="field">
                <div className="label-row">
                  <label htmlFor="e-copy">Contenido</label>
                  <div className="label-tools">
                    <SnippetMenu kind="template" project={form.proyecto} current={form.copy} onInsert={(t) => set('copy', form.copy.trim() ? `${form.copy.trimEnd()}\n\n${t}` : t)} />
                    <SnippetMenu kind="hashtags" project={form.proyecto} current={`${form.copy} ${form.first_comment}`} onInsert={(t) => set('copy', `${form.copy.trimEnd()}${form.copy.trim() ? '\n\n' : ''}${t}`)} />
                  </div>
                </div>
                <div className="copy-wrap">
                  <textarea id="e-copy" value={form.copy} onChange={(e) => set('copy', e.target.value)} placeholder="Escribe el texto de la publicación…" />
                  <div className="copy-foot"><span>Puedes usar #hashtags y emojis</span><span className={form.copy.length > 2200 ? 'over' : ''}>{form.copy.length}/2.200</span></div>
                </div>
              </div>
              {form.canal === 'Instagram' && form.tipo !== 'historia' && form.tipo !== 'texto' && (
                <FirstComment value={form.first_comment} onChange={(v) => set('first_comment', v)} copy={form.copy} setCopy={(v) => set('copy', v)} />
              )}
            </div>

            <div className="form-section">
              <span className="label">Archivo multimedia</span>
              <MediaField value={form.media} onChange={setMedia} scriptUrl={app.config.requestsScriptUrl} />
              {['imagen', 'carrusel'].includes(form.tipo) && (
                <div className="field" style={{ marginTop: 'var(--s4)' }}>
                  <span className="label">Formato de la imagen</span>
                  <div className="chip-group">{IMAGE_RATIOS.map(([k, l]) => <button type="button" key={k} className={`chip ${form.image_ratio === k ? 'on' : ''}`} aria-pressed={form.image_ratio === k} onClick={() => set('image_ratio', k)}>{l}</button>)}</div>
                  <div className="segmented" role="group" aria-label="Ajuste" style={{ alignSelf: 'flex-start', marginTop: 8 }}>
                    <button type="button" className={form.image_fit === 'crop' ? 'on' : ''} onClick={() => set('image_fit', 'crop')}>Recortada</button>
                    <button type="button" className={form.image_fit !== 'crop' ? 'on' : ''} onClick={() => set('image_fit', 'fit')}>Entera (con bandas)</button>
                  </div>
                  <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
                    {form.tipo === 'carrusel' ? 'En un carrusel todas las imágenes deben tener el mismo formato: elige 1:1 o 4:5. ' : ''}Instagram solo admite imágenes entre 4:5 y 1,91:1; si la tuya queda fuera se deja entera con bandas blancas. El ajuste se aplica al publicar.
                  </p>
                </div>
              )}
            </div>

            <div className="form-section">
              <div className="field-row three">
                <div className="field"><label htmlFor="e-fecha">Fecha *</label><input id="e-fecha" type="date" className="input" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} /></div>
                <div className="field"><label htmlFor="e-hora">Hora</label><input id="e-hora" type="time" className="input" value={hora} disabled={!usesDestinations} onChange={(e) => setHora(e.target.value)} /></div>
                <div className="field"><label htmlFor="e-tz">Zona horaria</label>
                  <Select id="e-tz" className="select" value={tz} disabled={!usesDestinations} onChange={(e) => setTz(e.target.value)}>
                    {[...new Set([...TIMEZONES, tz])].map((z) => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}
                  </Select>
                </div>
              </div>
              {!isNew && (
                <div className="field-row">
                  <div className="field"><label htmlFor="e-estado">Estado en la hoja</label>
                    <Select id="e-estado" className="select" value={form.estado} onChange={(e) => set('estado', e.target.value)}>
                      <option value="">Sin estado</option>{PUB_ESTADOS.map((s) => <option key={s}>{s}</option>)}
                    </Select>
                  </div>
                  <div className="field"><label htmlFor="e-url">URL de la publicación</label><input id="e-url" className="input" value={form.url_post} onChange={(e) => set('url_post', e.target.value)} placeholder="https://…" /></div>
                </div>
              )}
              {usesDestinations && <BestTimeHint project={form.proyecto} fecha={form.fecha} onPick={(d, t) => { set('fecha', d); setHora(t) }} />}
              {usesDestinations && <p className="muted" style={{ margin: 0, fontSize: 12 }}>El servidor publica a la hora indicada en {tz.replace('_', ' ')}, aunque el navegador esté cerrado. La hoja no guarda horas.</p>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="button" className={`switch ${form.promocionado ? 'on' : ''}`} onClick={() => set('promocionado', !form.promocionado)} role="switch" aria-checked={form.promocionado} aria-label="Campaña de Ads" />
                <div style={{ flex: 1 }}><b>Campaña de Ads</b><div className="muted" style={{ fontSize: 12 }}>La publicación se promociona con presupuesto</div></div>
                {form.promocionado && <input className="input" style={{ width: 120 }} placeholder="Presupuesto €" inputMode="decimal" value={form.presupuesto} onChange={(e) => set('presupuesto', e.target.value)} />}
              </div>
            </div>
          </div>

          <div className="preview-stage">
            <div className="preview-head">
              <b>Vista previa</b>
              <span className="who">{form.canal && <ChannelTile canal={form.canal} size={18} />}{form.canal || 'Sin canal'}{firstHandle && ` · @${firstHandle}${pickedAccounts.length > 1 ? ` +${pickedAccounts.length - 1}` : ''}`}</span>
            </div>
            <PostPreview form={form} accountHandle={firstHandle} />
          </div>
        </div>
      </div>

      <div className="editor-foot">
        <span className="hint" role="status" style={problem ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{problem || (publishWhy && !canPublishNow ? publishWhy : app.demo ? 'Modo demo: publicar y conectar son simulaciones.' : ' ')}</span>
        <div className="page-actions">
          {!isNew && (confirmDel
            ? <span className="confirm-inline"><span>¿Eliminar?</span><button className="btn btn-sm btn-danger" disabled={saving} onClick={async () => { if (await app.deletePublication(pub)) close() }}>Sí, eliminar</button><button className="btn btn-sm btn-ghost" onClick={() => setConfirmDel(false)}>No</button></span>
            : <button className="btn btn-ghost btn-danger" disabled={saving} onClick={() => (locked ? app.toast.error('Esta publicación ya está en Instagram. Meta no permite borrarla desde la API: elimínala desde la app de Instagram.') : setConfirmDel(true))}><Icon name="trash" size={14} /> Eliminar</button>)}
          <button className="btn btn-ghost" onClick={close}>Cancelar</button>
          {isNew
            ? <button className="btn" disabled={!valid || saving} onClick={() => save('Borrador')}>{busyLabel || 'Guardar borrador'}</button>
            : <button className="btn" disabled={!valid || saving} onClick={() => save()}>{busyLabel || 'Guardar cambios'}</button>}
          <button className="btn btn-primary" disabled={!valid || saving} onClick={() => save('Programado', { explicit: true })}>Programar</button>
          <button className="btn btn-accent" disabled={!valid || saving || !canPublishNow} title={!canPublishNow ? publishWhy : undefined} onClick={() => save(undefined, { now: true })}><Icon name="send" size={14} /> Publicar ahora</button>
        </div>
      </div>
    </Modal>
  )
}
