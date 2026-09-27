// Search Commons and optionally Pexels; import only provider-hosted images selected by an authorized teacher.
import { createClient } from 'npm:@supabase/supabase-js@2'
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers })
function key(): string {
  const direct = Deno.env.get('SIKLAB_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')
  if (direct) return direct
  const map = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')
  return map.default || Object.values(map)[0] as string || ''
}
function stripHtml(value: unknown): string {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").slice(0, 200)
}
async function userClient(req: Request) {
  const bearer = req.headers.get('authorization') || ''
  if (!/^Bearer\s+\S+$/i.test(bearer)) return null
  const db = createClient(Deno.env.get('SUPABASE_URL')!, key(), {
    global: { headers: { Authorization: bearer } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.auth.getUser()
  if (error || !data.user) return null
  const { data: allowed, error: accessError } = await db.rpc('is_approved_teacher')
  return !accessError && allowed === true ? db : null
}
// Pexels image URLs are the only additional URLs accepted by the importer.
// Never proxy arbitrary teacher-entered links: that would create SSRF and copyright risks.
function pexelsImageUrl(raw: unknown): string | null {
  try {
    const u = new URL(String(raw || ''))
    if (u.protocol !== 'https:' || u.hostname !== 'images.pexels.com' || u.username || u.password || u.port) return null
    if (!/^\/photos\/[A-Za-z0-9_./%-]+$/.test(u.pathname) || u.pathname.includes('..')) return null
    return u.toString()
  } catch (_) { return null }
}
function wikimediaImageUrl(raw: unknown): string | null {
  try {
    const u = new URL(String(raw || ''))
    if (u.protocol !== 'https:' || u.hostname !== 'upload.wikimedia.org' || u.username || u.password || u.port) return null
    if (!/^\/wikipedia\/commons\//.test(u.pathname)) return null
    return u.toString()
  } catch (_) { return null }
}

// Commons often returns SVGs, video, and unrelated files for long AI-written
// image prompts. Prefer the main subject and ask the search index for bitmaps.
function pictureSearchTerms(input: string): string[] {
  const noise = new Set([
    'a','an','the','of','for','in','on','at','to','with','and','or','from','by','is','are',
    'colorful','colourful','bright','beautiful','cute','realistic','detailed','clear',
    'small','large','big','close','up','closeup','flying','sitting','standing','showing',
    'simple','plain','white','black','background','educational','science','kids',
    'children','photo','photograph','picture','image','diagram','illustration','drawing'
  ])
  const words = input.toLowerCase().match(/[a-z][a-z'-]*/g) || []
  const subject = words.filter(word => !noise.has(word)).slice(0,5).join(' ').trim()
  const focus = subject || input
  const options = [focus, `${focus} photograph`, input]
  return [...new Set(options.map(s => s.trim()).filter(Boolean))].slice(0,3)
}

function commonsBitmapUrl(info: Record<string,any>): { url: string; thumb: string } | null {
  const mime = String(info.mime || '').toLowerCase()
  const thumbMime = String(info.thumbmime || '').toLowerCase()
  const isOriginalBitmap = /^(image\/(jpeg|png|webp))$/.test(mime)
  // Wikimedia can convert an SVG into a safe PNG thumbnail. Use that generated
  // bitmap only; do not import the SVG itself into classroom Storage.
  const safeThumbnail = /^(image\/(jpeg|png|webp))$/.test(thumbMime)
  if (!isOriginalBitmap && !safeThumbnail) return null
  const full = wikimediaImageUrl(info.url)
  const preview = wikimediaImageUrl(info.thumburl) || full
  if (!preview) return null
  const preferThumb = !isOriginalBitmap || Number(info.size || 0) > 5 * 1024 * 1024
  const url = preferThumb ? (wikimediaImageUrl(info.thumburl) || null) : (full || preview)
  return url ? { url, thumb: preview } : null
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return reply({ error: 'POST required.' }, 405)
  try {
    const db = await userClient(req)
    if (!db) return reply({ error: 'Sign in with an authorized teacher account.' }, 403)
    const body = await req.json()
    if (body?.action === 'search') {
      const query = String(body.query || '').trim().slice(0, 100)
      if (query.length < 2) return reply({ error: 'Enter image search keywords.' }, 400)
      const provider = String(body.provider || 'commons').trim().toLowerCase()
      if (provider === 'pexels') {
        const apiKey = Deno.env.get('PEXELS_API_KEY')
        if (!apiKey) return reply({ error: 'Pexels is optional. Add PEXELS_API_KEY in Supabase Edge Function Secrets, or choose Wikimedia Commons / Browse & Upload.' }, 503)
        const params = new URLSearchParams({ query, per_page: '16', orientation: 'landscape' })
        const r = await fetch(`https://api.pexels.com/v1/search?${params}`, {
          signal: AbortSignal.timeout(16000),
          headers: { Authorization: apiKey, Accept: 'application/json' },
        })
        if (!r.ok) {
          const msg = r.status === 429 ? 'Pexels API limit reached. Try Wikimedia Commons or upload an image.'
            : r.status === 401 || r.status === 403 ? 'Pexels API key is invalid or does not have access.'
            : `Pexels search returned HTTP ${r.status}.`
          return reply({ error: msg }, 502)
        }
        const result = await r.json()
        const images = (Array.isArray(result?.photos) ? result.photos : []).map((p: Record<string, any>) => {
          const url = pexelsImageUrl(p?.src?.large || p?.src?.original)
          const thumb = pexelsImageUrl(p?.src?.medium || p?.src?.small)
          const page = String(p?.url || '')
          const author = String(p?.photographer || 'Pexels contributor').slice(0, 120)
          if (!url || !thumb || !/^https:\/\/www\.pexels\.com\/photo\//.test(page)) return null
          return { title: String(p?.alt || query).slice(0, 150), url, thumb, artist: author,
            license: 'Pexels License', page: page.slice(0, 350), provider: 'Pexels' }
        }).filter(Boolean).slice(0, 16)
        return reply({ images, provider: 'Pexels', version: 'flexible-picker-fix5',
          diagnostics: { searched: [query], files: (result?.photos || []).length, unsupportedType: 0, unverifiedLicense: 0 } })
      }
      if (provider !== 'commons') return reply({ error: 'Choose Wikimedia Commons or Pexels as the search provider.' }, 400)
      const terms = pictureSearchTerms(query)
      const seen = new Set<string>()
      const images: Array<Record<string,string>> = []
      const diagnostics = { searched: [] as string[], files: 0, unsupportedType: 0, unverifiedLicense: 0, invalidUrl: 0 }
      for (const term of terms) {
        // MediaWiki Search supports filetype:bitmap; this avoids wasting almost
        // all results on SVGs, videos, PDFs and other non-photo file formats.
        const search = `${term} filetype:bitmap`
        diagnostics.searched.push(search)
        const params = new URLSearchParams({
          action: 'query', generator: 'search', gsrsearch: search,
          gsrnamespace: '6', gsrlimit: '40', prop: 'imageinfo',
          iiprop: 'url|extmetadata|mime|thumbmime|size',
          iiextmetadatafilter: 'Artist|LicenseShortName|License|UsageTerms',
          iiurlwidth: '440', format: 'json', formatversion: '2',
        })
        const r = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
          signal: AbortSignal.timeout(16000),
          headers: { 'User-Agent': 'SikLabSchoolScience/4.0 (https://siklab2027.netlify.app; classroom Wikimedia search)', 'Accept': 'application/json' },
        })
        if (!r.ok) return reply({ error: `Wikimedia search returned HTTP ${r.status}. Check lesson-media logs.` }, 502)
        const json = await r.json()
        if (json?.error) return reply({ error: `Wikimedia search: ${String(json.error.info || json.error.code || 'Unknown error').slice(0,180)}` }, 502)
        const pages = Array.isArray(json?.query?.pages) ? json.query.pages : []
        diagnostics.files += pages.length
        for (const item of pages) {
          const info = item?.imageinfo?.[0]
          if (!info) { diagnostics.unsupportedType++; continue }
          const mime = String(info.mime || '').toLowerCase()
          const thumbMime = String(info.thumbmime || '').toLowerCase()
          if (!/^image\/(jpeg|png|webp)$/.test(mime) && !/^image\/(jpeg|png|webp)$/.test(thumbMime)) {
            diagnostics.unsupportedType++; continue
          }
          const urls = commonsBitmapUrl(info)
          if (!urls) { diagnostics.invalidUrl++; continue }
          const meta = info.extmetadata || {}
          const license = stripHtml(meta.LicenseShortName?.value || meta.License?.value || meta.UsageTerms?.value)
          if (!/(CC(?:0|[- ]BY)?|public domain|PD-|GFDL)/i.test(license)) { diagnostics.unverifiedLicense++; continue }
          if (seen.has(urls.url)) continue
          seen.add(urls.url)
          images.push({ title: stripHtml(item.title).replace(/^File:/i, ''),
            url: urls.url, thumb: urls.thumb,
            artist: stripHtml(meta.Artist?.value || 'Wikimedia Commons contributor'), license,
            page: String(info.descriptionurl || '').slice(0, 350) })
          if (images.length >= 12) break
        }
        if (images.length >= 8) break
      }
      return reply({ images, diagnostics, provider: 'Wikimedia Commons', version: 'flexible-picker-fix5' })
    }
    if (body?.action === 'generate') {
      const prompt = String(body.prompt || '').trim().slice(0, 180)
      const yearId = Number(body.year_id)
      if (prompt.length < 3) return reply({ error: 'Enter an illustration topic.' }, 400)
      if (!Number.isSafeInteger(yearId) || yearId <= 0) return reply({ error: 'Select a school year first.' }, 400)
      const geminiKey = Deno.env.get('GEMINI_API_KEY')
      if (!geminiKey) return reply({ error: 'GEMINI_API_KEY is not configured.' }, 503)
      const model = Deno.env.get('GEMINI_IMAGE_MODEL') || 'gemini-2.5-flash-image'
      const promptText = `Create one clear, friendly science illustration suitable for Grade 3 students, accurate anatomy/structure, bright clean flat educational artwork, no text labels, no watermark added by prompt, no identifiable children or real people. Topic: ${prompt}`
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }),
        signal: AbortSignal.timeout(110_000),
      })
      if (!r.ok) {
        const detail = await r.text()
        console.error('[Gemini image]', r.status, detail.slice(0, 500))
        return reply({ error: r.status === 429 ? 'Image generation quota exceeded.' : 'Image generation unavailable. Check Gemini image model and billing access.' }, 502)
      }
      const payload = await r.json()
      const part = (payload?.candidates?.[0]?.content?.parts || []).find((part: Record<string, any>) => !!(part.inlineData?.data || part.inline_data?.data))
      const inline = part?.inlineData || part?.inline_data
      if (!inline?.data) return reply({ error: 'AI did not return an image. Try a simpler topic.' }, 502)
      const mime = String(inline.mimeType || inline.mime_type || 'image/png')
      const ext: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
      if (!ext[mime] || inline.data.length > 7_000_000) return reply({ error: 'Generated image was unsupported or too large.' }, 502)
      const bytes = Uint8Array.from(atob(inline.data), ch => ch.charCodeAt(0))
      if (bytes.byteLength > 5 * 1024 * 1024) return reply({ error: 'Generated image exceeded storage limit.' }, 502)
      const path = `school-year-${yearId}/ai-${crypto.randomUUID()}.${ext[mime]}`
      const { error } = await db.storage.from('lesson-images').upload(path, bytes, { contentType: mime, upsert: false })
      if (error) return reply({ error: `Could not save illustration: ${error.message}` }, 403)
      const { data } = db.storage.from('lesson-images').getPublicUrl(path)
      return reply({ publicUrl: data.publicUrl, aiGenerated: true })
    }
    if (body?.action === 'import') {
      const commons = wikimediaImageUrl(body.url)
      const pexels = pexelsImageUrl(body.url)
      const url = commons || pexels
      if (!url) return reply({ error: 'Select an image from Wikimedia Commons or Pexels, or upload your own authorized picture.' }, 400)
      const yearId = Number(body.year_id)
      if (!Number.isSafeInteger(yearId) || yearId <= 0) return reply({ error: 'Select a school year first.' }, 400)
      // Fetch via our server so the teacher does not depend on Wikimedia browser CORS.
      // Do not follow redirects to an arbitrary destination.
      const r = await fetch(url, { signal: AbortSignal.timeout(18000), redirect: 'manual' })
      if (!r.ok) return reply({ error: 'Could not retrieve the chosen image.' }, 502)
      const type = (r.headers.get('content-type') || '').split(';')[0].trim()
      const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
      if (!extensions[type]) return reply({ error: 'Only JPG, PNG, or WEBP can be imported.' }, 400)
      const size = Number(r.headers.get('content-length') || 0)
      if (size > 5 * 1024 * 1024) return reply({ error: 'Image is larger than 5 MB.' }, 400)
      const bytes = await r.arrayBuffer()
      if (bytes.byteLength > 5 * 1024 * 1024) return reply({ error: 'Image is larger than 5 MB.' }, 400)
      const bucket = body.target === 'question' ? 'question-images' : 'lesson-images'
      const storagePath = `school-year-${yearId}/${pexels ? 'pexels' : 'commons'}-${crypto.randomUUID()}.${extensions[type]}`
      const { error } = await db.storage.from(bucket).upload(storagePath, bytes, { contentType: type, upsert: false })
      if (error) return reply({ error: `Unable to save image: ${error.message}` }, 403)
      const { data } = db.storage.from(bucket).getPublicUrl(storagePath)
      return reply({ publicUrl: data.publicUrl, attribution: String(body.attribution || '').slice(0, 200),
        license: pexels ? 'Pexels License' : String(body.license || '').slice(0, 100),
        source: String(body.source || '').slice(0, 350) })
    }
    return reply({ error: 'Unsupported media action.' }, 400)
  } catch (error) {
    console.error('[lesson-media]', error)
    return reply({ error: 'Could not access the image library right now.' }, 500)
  }
})
