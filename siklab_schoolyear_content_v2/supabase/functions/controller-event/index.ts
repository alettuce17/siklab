import {
  authenticateDevice,
  broadcastPublic,
  corsHeaders,
  jsonResponse,
  normalizeDeviceId,
  validPlayer,
  validState,
} from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST required' }, 405)
  }

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const deviceId = normalizeDeviceId(body.device_id)
    const player = body.player
    const state = body.state

    if (!validPlayer(player)) {
      return jsonResponse({ error: 'Player must be player1 or player2' }, 400)
    }

    if (!validState(state)) {
      return jsonResponse({ error: 'State must contain exactly 9 binary digits' }, 400)
    }

    const auth = await authenticateDevice(req, deviceId, player)
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status)
    }

    const now = new Date().toISOString()

    const { error: updateError } = await auth.admin
      .from('controller_devices')
      .update({
        last_state: state,
        last_seen: now,
        updated_at: now,
      })
      .eq('device_id', deviceId)

    if (updateError) {
      console.error('[controller update]', updateError)
      return jsonResponse({ error: 'Could not update controller status' }, 500)
    }

    await broadcastPublic('siklab-controllers', 'controller_state', {
      device_id: deviceId,
      player,
      state,
      at: now,
    })

    return jsonResponse({ ok: true })
  } catch (error) {
    console.error('[controller-event]', error)
    return jsonResponse({ error: 'Internal controller-event error' }, 500)
  }
})
