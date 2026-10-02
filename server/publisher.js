// Publicación en Instagram: contenedor → (espera) → media_publish. Usado por la API (manual) y por el scheduler.
import * as Repo from './repo.js'
import * as Instagram from './instagram.js'
import * as Media from './media.js'
import * as Platforms from './platforms.js'
import { MetaException } from './meta-exception.js'
import { now } from './db.js'
import { notify } from './notify.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fail(channelId, message, account = null, e = null) {
  const msg = message.slice(0, 500)
  await Repo.updateChannel(channelId, { status: 'failed', error_message: msg, locked_at: null })
  await Repo.logEvent(channelId, 'failed', msg)
  if (account && e && e.isAuthError()) await Repo.updateAccount(account.id, { status: 'expired', last_error: e.userMessage().slice(0, 300) })
  const ch = await Repo.channel(channelId)
  if (ch) await notify(`failed:${channelId}:${ch.attempts}`, 'failed', `No se pudo publicar «${ch.title || 'sin título'}»${account ? ` en @${account.username}` : ''}`, msg, '#/calendar')
  return Repo.channelPublic(ch ?? {})
}

export async function run(channelId, req, maxWait = 60) {
  let ch = await Repo.channel(channelId)
  if (!ch) throw new Error('Destino no encontrado.')
  const resume = ch.status === 'publishing' && !!ch.container_id
  if (!(await Repo.claim(channelId, resume))) return Repo.channelPublic(ch)
  ch = await Repo.channel(channelId)
  const account = await Repo.account(ch.social_account_id)
  await Repo.logEvent(channelId, resume ? 'resumed' : 'publishing', resume ? 'Se retoma la publicación' : 'Publicando…')
  try {
    if (!account) throw new Error('La cuenta de destino no existe.')
    if (!Platforms.implemented(account.platform)) throw new Error(`El canal ${Platforms.label(account.platform)} todavía no está disponible en CalendApp.`)
    const pub = Repo.accountPublic(account)
    if (pub.status !== 'connected' || !account.external_account_id) throw new Error(`La cuenta @${account.username} no está conectada (estado: ${pub.status}). Conéctala en Ajustes → Integraciones.`)
    const token = Repo.token(account)
    const ig = String(account.external_account_id)

    let creation
    if (!ch.container_id) {
      await checkQuota(ig, token)
      creation = await createContainer(ch, ig, token, req)
      await Repo.updateChannel(channelId, { container_id: creation })
    } else creation = String(ch.container_id)

    const status = await wait(creation, token, maxWait)
    if (status === 'IN_PROGRESS') return Repo.channelPublic((await Repo.channel(channelId)) ?? {}) // seguirá en "publishing"; el scheduler lo retoma
    const mediaId = await Instagram.publish(ig, token, creation)
    await Repo.updateChannel(channelId, { status: 'published', published_at: now(), external_post_id: mediaId, external_url: await Instagram.permalink(mediaId, token), error_message: null, locked_at: null })
    await Repo.logEvent(channelId, 'published', `Publicado en @${account.username}`)
    // Primer comentario: si falla, la publicación sigue siendo válida; queda en el historial.
    const first = String(ch.first_comment ?? '').trim()
    if (first) {
      try { await Instagram.comment(mediaId, token, first); await Repo.logEvent(channelId, 'comment', 'Primer comentario publicado') } catch (e) {
        const m = e instanceof MetaException ? e.userMessage() : e.message
        await Repo.logEvent(channelId, 'comment_failed', `No se pudo publicar el primer comentario: ${m}`.slice(0, 500))
      }
    }
    return Repo.channelPublic((await Repo.channel(channelId)) ?? {})
  } catch (e) {
    return fail(channelId, e instanceof MetaException ? e.userMessage() : e.message, account, e instanceof MetaException ? e : null)
  }
}

async function checkQuota(ig, token) {
  let q
  try { q = await Instagram.quota(ig, token) } catch (e) { if (e instanceof MetaException) return; throw e } // informativa; la API rechazará si se supera
  if (q.total !== null && q.usage >= q.total) throw new Error(`Se alcanzó el límite de publicaciones de Instagram (${q.usage} de ${q.total} en ${Math.round(q.duration / 3600)} h). Inténtalo más tarde.`)
}

// Espera a que el contenedor esté listo. Devuelve FINISHED o IN_PROGRESS (si se agota el tiempo).
async function wait(containerId, token, maxWait) {
  const deadline = Date.now() + maxWait * 1000
  for (;;) {
    const s = await Instagram.containerStatus(containerId, token)
    if (s === 'FINISHED' || s === 'PUBLISHED') return 'FINISHED'
    if (s === 'ERROR') throw new Error('Instagram no pudo procesar el archivo multimedia (estado ERROR). Revisa el formato y vuelve a intentarlo.')
    if (s === 'EXPIRED') throw new Error('El contenedor caducó antes de publicarse. Vuelve a intentarlo.')
    if (Date.now() >= deadline) return 'IN_PROGRESS'
    await sleep(2000)
  }
}

function validateCaption(caption) {
  if ([...caption].length > 2200) throw new Error('El texto supera los 2.200 caracteres que admite Instagram.')
  if ((caption.match(/#[\p{L}\p{N}_]+/gu) || []).length > 30) throw new Error('Instagram admite un máximo de 30 hashtags.')
  if ((caption.match(/@[\w.]+/gu) || []).length > 20) throw new Error('Instagram admite un máximo de 20 menciones.')
}

async function source(url, expect, req, opts = {}) {
  const [kind, detail] = await Media.classify(url)
  if (kind === 'youtube') throw new Error('Los enlaces de YouTube no se pueden publicar en Instagram: sube el archivo de vídeo.')
  if (kind === 'blocked') throw new Error(`No se puede usar el archivo multimedia: ${detail}`)
  if (kind !== expect) throw new Error(expect === 'image' ? 'Este contenido necesita una imagen y el archivo es un vídeo.' : 'Este contenido necesita un vídeo y el archivo es una imagen.')
  if (expect === 'image' && !['jpeg', 'png', 'webp', 'gif'].includes(detail)) throw new Error('Formato de imagen no compatible.')
  return Media.relayUrl(url, req, 3600, expect === 'image' ? opts : {})
}

async function createContainer(ch, ig, token, req) {
  // Las imágenes de feed se ajustan al formato elegido (Instagram solo admite relaciones entre 4:5 y 1,91:1).
  const fmt = { ratio: ch.image_ratio || 'original', fit: ch.image_fit || 'fit' }
  let media = []
  try { media = JSON.parse(ch.media || '[]') || [] } catch { /* vacío */ }
  const caption = String(ch.caption ?? '')
  const tipo = String(ch.tipo)
  if (!media.length || tipo === 'texto') throw new Error('Instagram necesita una imagen o un vídeo para publicar.')
  validateCaption(caption)
  switch (tipo) {
    case 'carrusel': {
      if (media.length > 10) throw new Error('Un carrusel admite un máximo de 10 archivos.')
      const children = []
      for (const m of media) {
        const [kind] = await Media.classify(m)
        if (kind === 'video') throw new Error('Los carruseles con vídeo todavía no están soportados por CalendApp: usa solo imágenes.')
        children.push(await Instagram.createContainer(ig, token, { image_url: await source(m, 'image', req, fmt), is_carousel_item: 'true' }))
      }
      for (const c of children) await wait(c, token, 30)
      return Instagram.createContainer(ig, token, { media_type: 'CAROUSEL', children: children.join(','), caption })
    }
    case 'reel':
    case 'video':
      return Instagram.createContainer(ig, token, { media_type: 'REELS', video_url: await source(media[0], 'video', req), caption })
    case 'historia': {
      const [kind] = await Media.classify(media[0])
      return kind === 'video'
        ? Instagram.createContainer(ig, token, { media_type: 'STORIES', video_url: await source(media[0], 'video', req) })
        : Instagram.createContainer(ig, token, { media_type: 'STORIES', image_url: await source(media[0], 'image', req) })
    }
    default:
      return Instagram.createContainer(ig, token, { image_url: await source(media[0], 'image', req, fmt), caption })
  }
}
