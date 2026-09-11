import { createClient } from 'npm:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-device-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

export function adminClient() {
  return createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SIKLAB_SECRET_KEY'),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function hmacSha256Hex(keyText: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keyText),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message),
  )

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function normalizeDeviceId(value: unknown): string {
  return String(value ?? '').trim().toUpperCase()
}

export function validPlayer(value: unknown): value is 'player1' | 'player2' {
  return value === 'player1' || value === 'player2'
}

export function validState(value: unknown): value is string {
  return typeof value === 'string' && /^[01]{9}$/.test(value)
}

export async function authenticateDevice(
  req: Request,
  deviceId: string,
  player?: string,
) {
  const publishableKey = requiredEnv('SIKLAB_PUBLISHABLE_KEY')
  const suppliedApiKey = req.headers.get('apikey') ?? ''

  // Publishable key is safe to ship in ESP firmware, but we still require it
  // so random requests that do not belong to this project fail early.
  if (suppliedApiKey !== publishableKey) {
    return { ok: false as const, status: 401, error: 'Invalid project API key' }
  }

  const token = req.headers.get('x-device-token')?.trim() ?? ''
  if (token.length < 32) {
    return { ok: false as const, status: 401, error: 'Missing device token' }
  }

  if (!/^[A-F0-9]{6,32}$/.test(deviceId)) {
    return { ok: false as const, status: 400, error: 'Invalid device id' }
  }

  const admin = adminClient()
  const { data: device, error } = await admin
    .from('controller_devices')
    .select('device_id,assigned_player,device_token_hash,enabled')
    .eq('device_id', deviceId)
    .maybeSingle()

  if (error) {
    console.error('[device lookup]', error)
    return { ok: false as const, status: 500, error: 'Controller lookup failed' }
  }

  if (!device || !device.enabled) {
    return { ok: false as const, status: 403, error: 'Controller is not provisioned' }
  }

  if (player && device.assigned_player !== player) {
    return { ok: false as const, status: 403, error: 'Player assignment mismatch' }
  }

  const suppliedHash = await sha256Hex(token)
  if (suppliedHash !== device.device_token_hash) {
    return { ok: false as const, status: 403, error: 'Invalid device token' }
  }

  return {
    ok: true as const,
    admin,
    device,
    tokenHash: suppliedHash,
  }
}

export async function broadcastPublic(
  topic: string,
  event: string,
  payload: unknown,
) {
  const url = requiredEnv('SUPABASE_URL')
  const secret = requiredEnv('SIKLAB_SECRET_KEY')

  const response = await fetch(
    `${url}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/${encodeURIComponent(event)}`,
    {
      method: 'POST',
      headers: {
        apikey: secret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  )

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Realtime broadcast failed (${response.status}): ${text}`)
  }
}
