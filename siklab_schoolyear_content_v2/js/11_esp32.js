/* =========================================================
 * SIKLAB CONTROLLER BRIDGE - CLOUD + LOCAL APP MODE
 *
 * CLOUD / NETLIFY
 *   ESP32 -> Supabase -> Dashboard -> Game
 *
 * LOCAL FAST / WINDOWS APP
 *   ESP32 -> SikLab Controller App -> Dashboard -> Game
 *
 * When SikLab is opened from the Windows Controller App at
 * http://127.0.0.1:3000, this file automatically uses the
 * local WebSocket bridge. When opened from Netlify, it uses
 * the existing Supabase cloud bridge.
 * ========================================================= */

let siklabControllerChannel = null;
let siklabRealtimeStarting = false;
let siklabLocalControllerSocket = null;
let siklabLocalReconnectTimer = null;
let siklabLocalStarting = false;
let siklabLocalRuntimeConfig = null;
let siklabLocalConfigCheckedAt = 0;

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

function setControllerOffline(player) {
    const normalized = normalizeControllerPlayer(player);
    if (!normalized) return;

    window.siklabControllerLastSeen[normalized] = 0;

    if (typeof updateTopControllerBadge === 'function') {
        updateTopControllerBadge(
            normalized,
            false,
            window.siklabControllerDevices[normalized] || null
        );
    }

    if (typeof updateDeviceStatusCard === 'function') {
        updateDeviceStatusCard(
            normalized,
            false,
            window.siklabControllerDevices[normalized] || null,
            null
        );
    }
}

function updateControllerRuntimeStatus(player, deviceId = null, at = null) {
    const normalized = normalizeControllerPlayer(player);
    if (!normalized) return;

    const seenAt = at ? new Date(at).getTime() : Date.now();
    window.siklabControllerLastSeen[normalized] = Number.isFinite(seenAt) ? seenAt : Date.now();

    if (deviceId) {
        window.siklabControllerDevices[normalized] = String(deviceId);
    }

    if (typeof updateTopControllerBadge === 'function') {
        updateTopControllerBadge(
            normalized,
            true,
            deviceId || window.siklabControllerDevices[normalized] || null
        );
    }
}

function handleControllerStateBroadcast(message) {
    const payload = message?.payload ?? message ?? {};
    const player = normalizeControllerPlayer(payload.player);
    const state = String(payload.state ?? '');

    if (!player || !isValidControllerState(state)) {
        console.warn('[SikLab controller] Invalid controller payload ignored:', payload);
        return;
    }

    updateControllerRuntimeStatus(player, payload.device_id || null, payload.at || null);
    forwardControllerStateToGame(player, state, payload.device_id || null, payload.at || null);
}

/* =========================================================
 * LOCAL WINDOWS APP DETECTION
 * ========================================================= */
async function getSikLabLocalRuntimeConfig(force = false) {
    const now = Date.now();
    if (!force && siklabLocalRuntimeConfig && now - siklabLocalConfigCheckedAt < 5000) {
        return siklabLocalRuntimeConfig;
    }

    // The local Controller App serves this endpoint. Netlify does not.
    if (window.location.protocol !== 'http:') {
        siklabLocalRuntimeConfig = null;
        siklabLocalConfigCheckedAt = now;
        return null;
    }

    try {
        const response = await fetch('/__siklab_local_config', {
            cache: 'no-store',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const config = await response.json();

        if (!config?.enabled || !config?.browser_ws_url) {
            throw new Error('Local controller service is not enabled.');
        }

        siklabLocalRuntimeConfig = config;
        siklabLocalConfigCheckedAt = now;
        window.siklabLocalRuntimeConfig = config;
        window.SIKLAB_LOCAL_CONTROLLER_ACTIVE = true;
        return config;
    } catch (_) {
        siklabLocalRuntimeConfig = null;
        siklabLocalConfigCheckedAt = now;
        window.siklabLocalRuntimeConfig = null;
        window.SIKLAB_LOCAL_CONTROLLER_ACTIVE = false;
        return null;
    }
}

function scheduleLocalControllerReconnect() {
    if (siklabLocalReconnectTimer) return;

    siklabLocalReconnectTimer = setTimeout(async () => {
        siklabLocalReconnectTimer = null;
        const config = await getSikLabLocalRuntimeConfig(true);
        if (config) initLocalControllerBridge(config);
    }, 600);
}

function closeLocalControllerBridge() {
    if (siklabLocalReconnectTimer) {
        clearTimeout(siklabLocalReconnectTimer);
        siklabLocalReconnectTimer = null;
    }

    if (siklabLocalControllerSocket) {
        const socket = siklabLocalControllerSocket;
        siklabLocalControllerSocket = null;
        try { socket.close(); } catch (_) {}
    }
}

function initLocalControllerBridge(config) {
    if (!config?.browser_ws_url) return;
    if (siklabLocalStarting) return;

    if (
        siklabLocalControllerSocket &&
        [WebSocket.OPEN, WebSocket.CONNECTING].includes(siklabLocalControllerSocket.readyState)
    ) {
        return;
    }

    siklabLocalStarting = true;

    try {
        const socket = new WebSocket(config.browser_ws_url);
        siklabLocalControllerSocket = socket;

        socket.onopen = () => {
            siklabLocalStarting = false;
            window.SIKLAB_LOCAL_CONTROLLER_ACTIVE = true;
            console.info('[SikLab Local] Controller App connected.');
            socket.send(JSON.stringify({ type: 'browser_hello' }));
        };

        socket.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);

                if (payload.type === 'controller_state') {
                    handleControllerStateBroadcast(payload);
                    return;
                }

                if (payload.type === 'controller_online') {
                    const player = normalizeControllerPlayer(payload.player);
                    if (player) {
                        updateControllerRuntimeStatus(
                            player,
                            payload.device_id || null,
                            payload.at || null
                        );
                    }
                    return;
                }

                if (payload.type === 'controller_offline') {
                    setControllerOffline(payload.player);
                }
            } catch (error) {
                console.warn('[SikLab Local] Invalid app message:', error);
            }
        };

        socket.onerror = () => {
            // onclose handles reconnect.
        };

        socket.onclose = () => {
            if (siklabLocalControllerSocket === socket) {
                siklabLocalControllerSocket = null;
            }
            siklabLocalStarting = false;
            window.SIKLAB_LOCAL_CONTROLLER_ACTIVE = false;
            console.warn('[SikLab Local] Controller App disconnected.');
            scheduleLocalControllerReconnect();
        };
    } catch (error) {
        siklabLocalStarting = false;
        siklabLocalControllerSocket = null;
        console.error('[SikLab Local] Could not connect to Controller App:', error);
        scheduleLocalControllerReconnect();
    }
}

/* =========================================================
 * CLOUD MODE
 * ========================================================= */
async function initCloudControllerRealtime() {
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
                config: { broadcast: { self: false } }
            })
            .on('broadcast', { event: 'controller_state' }, handleControllerStateBroadcast)
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.info('[ESP32 realtime] Connected to cloud controller channel.');
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

async function stopCloudControllerRealtime() {
    if (!siklabControllerChannel || !window.supabaseClient) {
        siklabControllerChannel = null;
        return;
    }

    try {
        await window.supabaseClient.removeChannel(siklabControllerChannel);
    } catch (error) {
        console.warn('[ESP32 realtime] Could not remove cloud channel cleanly:', error);
    } finally {
        siklabControllerChannel = null;
    }
}

/* =========================================================
 * AUTO MODE
 * ========================================================= */
async function initESP32Realtime() {
    const localConfig = await getSikLabLocalRuntimeConfig(true);

    if (localConfig) {
        await stopCloudControllerRealtime();
        initLocalControllerBridge(localConfig);
        return;
    }

    closeLocalControllerBridge();
    await initCloudControllerRealtime();
}

async function stopESP32Realtime() {
    closeLocalControllerBridge();
    await stopCloudControllerRealtime();
}

async function restartESP32ConnectionBridge() {
    await stopESP32Realtime();
    setTimeout(() => initESP32Realtime(), 100);
}

/* =========================================================
 * AUDIO / CONTROLLER COMMANDS
 * ========================================================= */
async function requestControllerCommand(player, command) {
    const normalizedPlayer = normalizeControllerPlayer(player);
    const normalizedCommand = String(command || '').trim().toLowerCase();

    if (!normalizedPlayer) throw new Error('Invalid controller player.');
    if (!isAllowedControllerCommand(normalizedCommand)) {
        throw new Error('Unsupported controller command.');
    }

    const localConfig = await getSikLabLocalRuntimeConfig();
    const localSocket = siklabLocalControllerSocket;

    if (
        localConfig &&
        localSocket &&
        localSocket.readyState === WebSocket.OPEN
    ) {
        localSocket.send(JSON.stringify({
            type: 'controller_command',
            player: normalizedPlayer,
            command: normalizedCommand
        }));
        return { ok: true, mode: 'local' };
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
