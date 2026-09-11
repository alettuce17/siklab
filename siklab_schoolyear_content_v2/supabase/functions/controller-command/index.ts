import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  adminClient,
  broadcastPublic,
  corsHeaders,
  hmacSha256Hex,
  jsonResponse,
  requiredEnv,
  validPlayer,
} from '../_shared/common.ts'

const ALLOWED_COMMANDS = new Set([
  'g1correct',
  'g1wrong',
  'g1track1',
  'g1track2',
  'track1',
  'track2',
])

function normalizeCommand(value: unknown): string {
  const command = String(value ?? '').trim().toLowerCase()
  const aliases: Record<string, string> = {
    correct: 'g1correct',
    wrong: 'g1wrong',
  }
  return aliases[command] ?? command
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST required' }, 405)
  }

  try {
    // This function is called by the logged-in teacher browser.
    // Validate the actual Supabase Auth user, not only the publishable key.
    const authHeader = req.headers.get('authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Teacher login required' }, 401)
    }

    const userClient = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SIKLAB_PUBLISHABLE_KEY'),
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    )

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) {
      return jsonResponse({ error: 'Invalid teacher session' }, 401)
    }

    const admin = adminClient()
    const { data: teacher, error: teacherError } = await admin
      .from('teacher_profiles')
      .select('is_approved')
      .eq('user_id', userData.user.id)
      .maybeSingle()

    if (teacherError) {
      console.error('[teacher approval lookup]', teacherError)
      return jsonResponse({ error: 'Teacher approval lookup failed' }, 500)
    }

    if (!teacher?.is_approved) {
      return jsonResponse({ error: 'Approved teacher account required' }, 403)
    }

    const body = await req.json().catch(() => null)
    const player = body?.player === 'p1'
      ? 'player1'
      : body?.player === 'p2'
        ? 'player2'
        : body?.player

    if (!validPlayer(player)) {
      return jsonResponse({ error: 'Player must be player1 or player2' }, 400)
    }

    const command = normalizeCommand(body?.command ?? body?.action)
    if (!ALLOWED_COMMANDS.has(command)) {
      return jsonResponse({ error: 'Unsupported controller command' }, 400)
    }

    const { data: device, error: deviceError } = await admin
      .from('controller_devices')
      .select('device_id,assigned_player,device_token_hash,enabled')
      .eq('assigned_player', player)
      .eq('enabled', true)
      .maybeSingle()

    if (deviceError) {
      console.error('[command device lookup]', deviceError)
      return jsonResponse({ error: 'Controller lookup failed' }, 500)
    }

    if (!device) {
      return jsonResponse({ error: `${player} controller is not provisioned` }, 404)
    }

    const nonce = crypto.randomUUID()
    const ts = String(Date.now())
    const canonical = `${device.device_id}|${player}|${command}|${ts}|${nonce}`

    // Important: the public Realtime channel can be listened to by the ESP
    // without giving the ESP a teacher JWT. The command itself is HMAC signed,
    // so an arbitrary public-channel broadcast is ignored by the firmware.
    const sig = await hmacSha256Hex(device.device_token_hash, canonical)

    await broadcastPublic('siklab-controllers', 'controller_command', {
      device_id: device.device_id,
      player,
      command,
      ts,
      nonce,
      sig,
    })

    return jsonResponse({
      ok: true,
      device_id: device.device_id,
      player,
      command,
    })
  } catch (error) {
    console.error('[controller-command]', error)
    return jsonResponse({ error: 'Internal controller-command error' }, 500)
  }
})
