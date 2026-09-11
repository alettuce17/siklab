/* =========================================================
 * ESP32 REALTIME BRIDGE - SUPABASE
 *
 * Input:
 *   ESP32 -> controller-event Edge Function -> Realtime broadcast
 *   -> Dashboard -> postMessage -> active game iframe
 *
 * Commands:
 *   Game/Dashboard -> controller-command Edge Function -> Realtime
 *   -> ESP32 (firmware verifies HMAC signature)
 * ========================================================= */

let siklabControllerChannel = null;
let siklabRealtimeStarting = false;

function normalizeControllerPlayer(value) {
    if (value === 'p1') return 'player1';
    if (value === 'p2') return 'player2';
    return value === 'player1' || value === 'player2' ? value : null;
}

function isValidControllerState(value) {
    return typeof value === 'string' && /^[01]{9}$/.test(value);
}

function isAllowedControllerCommand(value) {
    return new Set([
        'g1correct',
        'g1wrong',
        'g1track1',
        'g1track2',
        'track1',
        'track2'
    ]).has(String(value || '').trim().toLowerCase());
}

function getActiveGameFrame() {
    const frame = document.getElementById('game-iframe');
    return frame && frame.contentWindow ? frame : null;
}

function forwardControllerStateToGame(player, state, deviceId = null, at = null) {
    const frame = getActiveGameFrame();
    if (!frame || !frame.src) return;

    frame.contentWindow.postMessage({
        type: 'esp32_input',
        player,
        state,
        device_id: deviceId,
        at: at || new Date().toISOString()
    }, window.location.origin);
}

function handleControllerStateBroadcast(message) {
    const payload = message?.payload ?? message ?? {};
    const player = normalizeControllerPlayer(payload.player);
    const state = String(payload.state ?? '');

    if (!player || !isValidControllerState(state)) {
        console.warn('[ESP32 realtime] Ignored invalid controller payload:', payload);
        return;
    }

    const seenAt = payload.at ? new Date(payload.at).getTime() : Date.now();
    window.siklabControllerLastSeen[player] = Number.isFinite(seenAt) ? seenAt : Date.now();
    if (typeof updateTopControllerBadge === 'function') {
    updateTopControllerBadge(
        player,
        true,
        payload.device_id || window.siklabControllerDevices[player]
    );
}

    forwardControllerStateToGame(player, state, payload.device_id || null, payload.at || null);
}

async function initESP32Realtime() {
    if (siklabControllerChannel || siklabRealtimeStarting) return;
    if (!window.supabaseClient) {
        console.warn('[ESP32 realtime] Supabase client is not ready.');
        return;
    }

    siklabRealtimeStarting = true;

    try {
        const db = requireSupabase();

        siklabControllerChannel = db
            .channel('siklab-controllers', {
                config: {
                    broadcast: { self: false }
                }
            })
            .on('broadcast', { event: 'controller_state' }, handleControllerStateBroadcast)
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.info('[ESP32 realtime] Connected to SikLab controller channel.');
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    console.warn('[ESP32 realtime] Channel status:', status);
                }
            });
    } catch (error) {
        console.error('[ESP32 realtime] Could not initialize:', error);
        siklabControllerChannel = null;
    } finally {
        siklabRealtimeStarting = false;
    }
}

async function stopESP32Realtime() {
    if (!siklabControllerChannel || !window.supabaseClient) {
        siklabControllerChannel = null;
        return;
    }

    try {
        await window.supabaseClient.removeChannel(siklabControllerChannel);
    } catch (error) {
        console.warn('[ESP32 realtime] Could not remove channel cleanly:', error);
    } finally {
        siklabControllerChannel = null;
    }
}

async function requestControllerCommand(player, command) {
    const normalizedPlayer = normalizeControllerPlayer(player);
    const normalizedCommand = String(command || '').trim().toLowerCase();

    if (!normalizedPlayer) {
        throw new Error('Invalid controller player.');
    }
    if (!isAllowedControllerCommand(normalizedCommand)) {
        throw new Error('Unsupported controller command.');
    }

    const db = requireSupabase();
    const { data, error } = await db.functions.invoke('controller-command', {
        body: {
            player: normalizedPlayer,
            command: normalizedCommand
        }
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
}

window.addEventListener('message', async (event) => {
    if (event.origin !== window.location.origin) return;

    const frame = getActiveGameFrame();
    if (!frame || event.source !== frame.contentWindow) return;

    const data = event.data;
    if (!data || data.type !== 'controller_command') return;

    const player = normalizeControllerPlayer(data.player);
    const command = String(data.command || '').trim().toLowerCase();

    if (!player || !isAllowedControllerCommand(command)) {
        console.warn('[ESP32 command] Invalid game request ignored:', data);
        return;
    }

    try {
        await requestControllerCommand(player, command);
    } catch (error) {
        console.error('[ESP32 command]', error);
        if (typeof showErrorToast === 'function') {
            showErrorToast(error.message || 'Could not send controller command.');
        }
    }
});
