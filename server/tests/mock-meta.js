// Meta simulado SOLO para pruebas locales de integración (no forma parte del despliegue).
// Reproduce la forma de las respuestas documentadas de la API de Instagram con inicio de sesión de Instagram.
import http from 'node:http'
import sharp from 'sharp'

export async function startMock(port) {
  // Imágenes JPEG reales (el relé las procesa con sharp): por defecto 4:5 dentro del rango; wide y tall quedan fuera de 4:5–1,91:1.
  const jpg = (w, h, c) => sharp({ create: { width: w, height: h, channels: 3, background: c } }).jpeg().toBuffer()
  const IMG = { default: await jpg(800, 1000, '#c33'), wide: await jpg(1000, 300, '#3a3'), tall: await jpg(400, 1000, '#33c') }
  const st = { n: 0, published: [], containers: {}, polls: {}, failAuth: false, calls: [] }
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x'); const p = url.pathname
    let form = {}
    if (req.method === 'POST') { const chunks = []; for await (const c of req) chunks.push(c); form = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString())) }
    st.calls.push(`${req.method} ${p}`)
    const out = (d, code = 200) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(d)) }
    if (p.startsWith('/files/')) {
      if (p.endsWith('.jpg')) { res.setHeader('Content-Type', 'image/jpeg'); return res.end(p.includes('wide') ? IMG.wide : p.includes('tall') ? IMG.tall : IMG.default) }
      if (p.endsWith('.png')) { res.setHeader('Content-Type', 'image/png'); return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')) }
      if (p.endsWith('.mp4')) { res.setHeader('Content-Type', 'video/mp4'); return res.end(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(4000, 86)])) }
      res.setHeader('Content-Type', 'text/html'); return res.end('<html>login</html>')
    }
    if (st.failAuth) return out({ error: { message: 'Error validating access token: Session has expired', type: 'OAuthException', code: 190 } }, 400)
    if (p === '/oauth/access_token') {
      if (form.client_secret !== 'test-secret' || form.grant_type !== 'authorization_code') return out({ error_type: 'OAuthException', code: 400, error_message: 'Invalid client secret' }, 400)
      return out({ data: [{ access_token: `SHORT_${form.code}`, user_id: `178414${form.code.length}`, permissions: 'instagram_business_basic,instagram_business_content_publish' }] })
    }
    if (p === '/access_token') return out({ access_token: `LONG_${(url.searchParams.get('access_token') || '').slice(6)}`, token_type: 'bearer', expires_in: 5184000 })
    if (p === '/refresh_access_token') return out({ access_token: 'LONG_REFRESHED', token_type: 'bearer', expires_in: 5184000 })
    if (p === '/v25.0/me') {
      const tok = url.searchParams.get('access_token') || ''
      const who = tok.includes('corfu') ? 'teatrocorfu7' : tok.includes('personal') ? 'cuenta.personal' : 'clubtemeraria'
      const type = tok.includes('personal') ? 'PERSONAL' : 'BUSINESS'
      if ((url.searchParams.get('fields') || '').includes('account_type')) return out({ account_type: type, followers_count: 1234, media_count: 56 })
      return out({ user_id: `17841${who.length}`, username: who })
    }
    let m
    if ((m = p.match(/^\/v25\.0\/(\d+)\/media$/)) && req.method === 'GET') {
      const t = (d) => new Date(Date.now() - d * 86400000).toISOString().replace(/\.\d{3}Z$/, '+0000')
      return out({ data: [
        { id: 'H1', caption: 'Reel antiguo\n#teatro', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/h1/', timestamp: t(3) },
        { id: 'H2', caption: 'Carrusel subido a mano', media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED', permalink: 'https://www.instagram.com/p/h2/', timestamp: t(10) },
        { id: 'H3', caption: 'Muy antiguo', media_type: 'IMAGE', media_product_type: 'FEED', permalink: 'https://www.instagram.com/p/h3/', timestamp: t(200) },
        ...st.published.map((x) => ({ id: x.id, caption: 'Publicado desde Nowepost', media_type: 'IMAGE', media_product_type: 'FEED', permalink: `https://www.instagram.com/p/${x.id}/`, timestamp: t(0) })),
      ] })
    }
    if ((m = p.match(/^\/v25\.0\/(\d+)\/media$/))) {
      const u = form.image_url || form.video_url
      if (!u && form.media_type !== 'CAROUSEL') return out({ error: { message: 'Missing media', type: 'OAuthException', code: 100 } }, 400)
      if (u) { // Meta descarga la URL: comprobamos que el relé sirve un JPEG o un vídeo real
        const r = await fetch(u).catch(() => null)
        const ct = (r?.headers.get('content-type') || '').toLowerCase()
        if (!r || r.status !== 200 || !(ct.startsWith('image/jpeg') || ct.startsWith('video/'))) return out({ error: { message: 'Media download failed', type: 'IGApiException', code: -2, error_subcode: 2207003 } }, 400)
      }
      st.n++; st.containers[String(st.n)] = form
      return out({ id: `C${st.n}` })
    }
    if ((m = p.match(/^\/v25\.0\/C(\d+)$/))) {
      st.polls[m[1]] = (st.polls[m[1]] || 0) + 1
      const slow = st.containers[m[1]]?.media_type === 'REELS' && st.polls[m[1]] < 2
      return out({ status_code: slow ? 'IN_PROGRESS' : 'FINISHED', id: `C${m[1]}` })
    }
    if (p.match(/^\/v25\.0\/(\d+)\/media_publish$/)) {
      if (!/^C\d+$/.test(form.creation_id || '')) return out({ error: { message: 'Invalid creation_id', type: 'OAuthException', code: 24 } }, 400)
      const id = `M${st.published.length + 1}`; st.published.push({ id, creation: form.creation_id })
      return out({ id })
    }
    if (p.match(/^\/v25\.0\/(\d+)\/content_publishing_limit$/)) return out({ data: [{ quota_usage: st.published.length, config: { quota_total: 50, quota_duration: 86400 } }] })
    if ((m = p.match(/^\/v25\.0\/M(\d+)\/comments$/)) && req.method === 'POST') {
      if (!form.message) return out({ error: { message: 'Missing message', type: 'OAuthException', code: 100 } }, 400)
      st.comments = [...(st.comments || []), { media: `M${m[1]}`, message: form.message }]
      return out({ id: `CM${st.comments.length}` })
    }
    if ((m = p.match(/^\/v25\.0\/[MH](\d+)\/insights$/))) {
      if (st.noInsightsPerm) return out({ error: { message: '(#10) Application does not have permission for this action', type: 'OAuthException', code: 10 } }, 400)
      const metric = url.searchParams.get('metric') || ''
      if (metric.includes('ig_reels_avg_watch_time') && st.rejectReelMetric) return out({ error: { message: '(#100) metric[7] must be one of the following values', type: 'OAuthException', code: 100 } }, 400)
      st.insightCalls = (st.insightCalls || 0) + 1
      return out({ data: metric.split(',').map((name, i) => ({ name, period: 'lifetime', values: [{ value: (Number(m[1]) * 100) + i }] })) })
    }
    if ((m = p.match(/^\/v25\.0\/M(\d+)$/))) return out({ permalink: `https://www.instagram.com/p/mock${m[1]}/`, id: `M${m[1]}` })
    return out({ error: { message: `Unknown mock path ${p}`, type: 'GraphMethodException', code: 100 } }, 404)
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, state: st })))
}
