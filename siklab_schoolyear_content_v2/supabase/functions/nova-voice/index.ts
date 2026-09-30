// Ms. Nova voice proxy. ELEVENLABS_API_KEY stays in Supabase Edge secrets.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}
function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
function publishableKey(): string {
  const direct = Deno.env.get('SIKLAB_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')
  if (direct) return direct
  try {
    const map = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')
    return String(map.default || Object.values(map)[0] || '')
  } catch { return '' }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)
  try {
    const bearer = req.headers.get('authorization') || ''
    const key = publishableKey()
    if (!key || !/^Bearer\s+\S+$/i.test(bearer)) return json({ error: 'Teacher sign-in required' }, 401)
    const db = createClient(Deno.env.get('SUPABASE_URL')!, key, {
      global: { headers: { Authorization: bearer } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: user, error: userError } = await db.auth.getUser()
    if (userError || !user.user) return json({ error: 'Teacher sign-in required' }, 401)
    const { data: approved, error: approvalError } = await db.rpc('is_approved_teacher')
    if (approvalError || approved !== true) return json({ error: 'Approved teacher required' }, 403)

    const body = await req.json()
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    if (!text || text.length > 1200) return json({ error: 'Text must be 1–1200 characters' }, 400)
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY')
    if (!apiKey) return json({ error: 'ElevenLabs is not configured' }, 503)
    const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID') || 'EXAVITQu4vr4xnSDxMaL'
    // Match the model and voice settings used by the user's working Nova page.
    const modelId = Deno.env.get('ELEVENLABS_MODEL_ID') || 'eleven_turbo_v2_5'
    if (!/^[A-Za-z0-9]{10,40}$/.test(voiceId)) return json({ error: 'Voice ID is invalid' }, 503)

    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.48,
          similarity_boost: 0.82,
          style: 0.30,
          use_speaker_boost: true,
        },
      }),
      signal: AbortSignal.timeout(25000),
    })
    if (!upstream.ok) {
      console.error('[nova-voice] ElevenLabs HTTP', upstream.status)
      const explanation = upstream.status === 401 || upstream.status === 403
        ? 'ElevenLabs rejected the API key or voice access. Check ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID.'
        : upstream.status === 404
        ? 'ElevenLabs voice ID was not found. Set ELEVENLABS_VOICE_ID to a voice available to your account.'
        : upstream.status === 429
        ? 'ElevenLabs rate limit or quota reached.'
        : `ElevenLabs request failed (HTTP ${upstream.status}).`
      return json({ error: explanation }, 502)
    }
    const bytes = await upstream.arrayBuffer()
    if (!bytes.byteLength || bytes.byteLength > 3_000_000) return json({ error: 'Voice audio unavailable' }, 502)
    // supabase-js returns a Blob for application/octet-stream; audio/mpeg is
    // currently parsed as text by functions.invoke(). The Blob is still MP3.
    return new Response(bytes, { headers: { ...cors, 'Content-Type': 'application/octet-stream' } })
  } catch (error) {
    console.error('[nova-voice]', error)
    return json({ error: 'Voice service unavailable' }, 502)
  }
})
