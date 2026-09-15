/* =========================================================
 * SIKLAB ESP PLAYER SETUP
 *
 * NETLIFY / CLOUD:
 *   Existing Supabase QR setup remains available.
 *
 * WINDOWS CONTROLLER APP:
 *   When SikLab is opened from http://127.0.0.1:3000,
 *   the app is detected automatically. Setup QRs include:
 *     - player1 / player2
 *     - mode=local
 *     - laptop IPv4
 *     - WebSocket port
 *
 * No Supabase device token is required for LOCAL gameplay.
 * ========================================================= */

let latestDeviceSetup = {
    player1: null,
    player2: null
};

function formatPlayer(player) {
    return player === 'player1' ? 'Player 1' : 'Player 2';
}

function relativeLastSeen(value) {
    if (!value) return '—';
    const timestamp = typeof value === 'number' ? value : new Date(value).getTime();
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 2) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
}

async function getDeviceSetupRuntime() {
    if (typeof getSikLabLocalRuntimeConfig === 'function') {
        const local = await getSikLabLocalRuntimeConfig();
        if (local) return { mode: 'local', ...local };
    }
    return { mode: 'cloud' };
}

async function initializeDeviceSetup() {
    const title = document.getElementById('header-title');
    const subtitle = document.getElementById('header-subtitle');
    const runtime = await getDeviceSetupRuntime();

    if (title) title.innerText = 'ESP Player Setup';

    if (runtime.mode === 'local') {
        if (subtitle) {
            subtitle.innerText = `Local Fast Mode • ${runtime.controller_host}:${runtime.controller_port}`;
        }
        setCloudStatus('Local Fast', true);
    } else {
        if (subtitle) {
            subtitle.innerText = 'Cloud Mode • Pair controllers with SikLab through Supabase.';
        }
        setCloudStatus(window.supabaseClient ? 'Online' : 'Not Configured', !!window.supabaseClient);
    }

    ensureLocalModeNotice(runtime);
    await refreshDeviceControllerStatus();

    if (typeof initESP32Realtime === 'function') {
        initESP32Realtime();
    }
}

function ensureLocalModeNotice(runtime) {
    const view = document.getElementById('view-device-setup');
    if (!view) return;

    let notice = document.getElementById('controller-runtime-notice');
    if (!notice) {
        const container = view.querySelector('.max-w-6xl');
        if (!container) return;

        notice = document.createElement('div');
        notice.id = 'controller-runtime-notice';
        notice.className = 'rounded-2xl border px-4 py-3 text-sm font-bold';
        container.prepend(notice);
    }

    if (runtime.mode === 'local') {
        notice.className = 'rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800';
        notice.innerHTML = `
            <i class="fa-solid fa-bolt mr-2"></i>
            <strong>Local Fast Controller App is running.</strong>
            P1/P2 gameplay goes directly to this laptop at
            <code>${runtime.controller_host}:${runtime.controller_port}</code>.
            Internet is not used for button presses.
        `;
    } else {
        notice.className = 'rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800';
        notice.innerHTML = `
            <i class="fa-solid fa-cloud mr-2"></i>
            <strong>Cloud Controller Mode.</strong>
            Start the Windows SikLab Controller App and open the local SikLab site to use near-zero-latency local gameplay.
        `;
    }
}

async function buildControllerSetupURL(player) {
    const runtime = await getDeviceSetupRuntime();
    const url = new URL('http://192.168.4.1/');
    url.searchParams.set('player', player);

    if (runtime.mode === 'local') {
        url.searchParams.set('mode', 'local');
        url.searchParams.set('server', runtime.controller_host);
        url.searchParams.set('port', String(runtime.controller_port));
    } else {
        url.searchParams.set('mode', 'cloud');
    }

    return {
        setupURL: url.toString(),
        runtime
    };
}

async function generateControllerQR(player) {
    if (player !== 'player1' && player !== 'player2') {
        return showErrorToast('Invalid player assignment.');
    }

    const button = document.getElementById(`btn-qr-${player}`);
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Generating...';
    }

    try {
        const { setupURL, runtime } = await buildControllerSetupURL(player);

        // Local mode creates the QR entirely on the laptop; no internet required.
        const qrURL = runtime.mode === 'local'
            ? `/__siklab_qr?data=${encodeURIComponent(setupURL)}`
            : `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(setupURL)}`;

        const config = {
            player,
            mode: runtime.mode,
            setup_url: setupURL,
            qr_url: qrURL,
            runtime
        };

        latestDeviceSetup[player] = config;
        renderControllerQR(player, config);
        showToast(`${formatPlayer(player)} ${runtime.mode === 'local' ? 'local-fast' : 'cloud'} setup QR generated.`);
    } catch (error) {
        console.error('[QR]', error);
        showErrorToast(error.message || 'Could not generate setup QR.');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = `<i class="fa-solid fa-qrcode mr-2"></i>Generate ${formatPlayer(player)} Setup QR`;
        }
    }
}

function renderControllerQR(player, config) {
    document.getElementById(`qr-empty-${player}`)?.classList.add('hidden');
    document.getElementById(`qr-result-${player}`)?.classList.remove('hidden');

    const image = document.getElementById(`qr-image-${player}`);
    const link = document.getElementById(`qr-link-${player}`);
    const expires = document.getElementById(`qr-expires-${player}`);

    if (image) image.src = config.qr_url;
    if (link) link.value = config.setup_url;

    if (expires) {
        expires.innerText = config.mode === 'local'
            ? `LOCAL FAST • ${config.runtime.controller_host}:${config.runtime.controller_port} • Connect your phone to SikLab-Setup-XXXXXX before scanning.`
            : 'CLOUD • Connect your phone to SikLab-Setup-XXXXXX before scanning.';
    }
}

async function copyDeviceSetupLink(player) {
    const config = latestDeviceSetup[player];
    if (!config) return showErrorToast('Generate a QR code first.');

    try {
        await navigator.clipboard.writeText(config.setup_url);
        showToast('Setup link copied.');
    } catch (_) {
        const field = document.getElementById(`qr-link-${player}`);
        if (field) {
            field.select();
            document.execCommand('copy');
            showToast('Setup link copied.');
        }
    }
}

async function refreshDeviceControllerStatus() {
    const runtime = await getDeviceSetupRuntime();

    if (runtime.mode === 'local') {
        for (const player of ['player1', 'player2']) {
            const lastSeen = window.siklabControllerLastSeen?.[player] || null;
            const online = !!lastSeen && Date.now() - lastSeen < 3500;
            updateDeviceStatusCard(
                player,
                online,
                window.siklabControllerDevices?.[player] || null,
                lastSeen
            );
        }
        setCloudStatus('Local Fast', true);
        return;
    }

    if (!window.supabaseClient) {
        updateDeviceStatusCard('player1', false, null, null);
        updateDeviceStatusCard('player2', false, null, null);
        return;
    }

    try {
        const { data, error } = await window.supabaseClient
            .from('controller_devices')
            .select('device_id,assigned_player,last_seen')
            .in('assigned_player', ['player1', 'player2']);

        if (error) throw error;

        for (const player of ['player1', 'player2']) {
            const row = (data || []).find(item => item.assigned_player === player);
            const lastSeen = row?.last_seen
                ? new Date(row.last_seen).getTime()
                : window.siklabControllerLastSeen[player];
            const online = !!lastSeen && Date.now() - lastSeen < 12000;

            updateDeviceStatusCard(
                player,
                online,
                row?.device_id || window.siklabControllerDevices[player],
                lastSeen
            );
        }

        setCloudStatus('Online', true);
    } catch (error) {
        console.warn('[device status]', error);
        setCloudStatus('Online', true);

        for (const player of ['player1', 'player2']) {
            const lastSeen = window.siklabControllerLastSeen[player];
            updateDeviceStatusCard(
                player,
                !!lastSeen && Date.now() - lastSeen < 12000,
                window.siklabControllerDevices[player],
                lastSeen
            );
        }
    }
}

function updateTopControllerBadge(player, online, deviceId = null) {
    const id = player === 'player1' ? 'ui-status-p1' : 'ui-status-p2';
    const label = player === 'player1' ? 'P1' : 'P2';
    const badge = document.getElementById(id);
    if (!badge) return;

    badge.className = online
        ? 'bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full font-bold text-xs flex items-center gap-2 border border-emerald-200 transition-colors shadow-sm'
        : 'bg-slate-100 text-slate-500 px-4 py-2 rounded-full font-bold text-xs flex items-center gap-2 border border-slate-200 transition-colors shadow-sm';

    badge.innerHTML = online
        ? `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span><i class="fa-solid fa-gamepad"></i>${label}: ON`
        : `<span class="w-2 h-2 rounded-full bg-slate-400"></span><i class="fa-solid fa-gamepad"></i>${label}: OFF`;

    badge.title = online && deviceId
        ? `${label} Controller: ${deviceId}`
        : `${label} Controller offline`;
}

function updateDeviceStatusCard(player, online, deviceId, lastSeen) {
    const badge = document.getElementById(`device-status-${player}`);
    const device = document.getElementById(`device-id-${player}`);
    const last = document.getElementById(`device-last-seen-${player}`);

    if (badge) {
        badge.className = online
            ? 'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-700 border border-emerald-200'
            : 'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black bg-slate-100 text-slate-500 border border-slate-200';

        badge.innerHTML = online
            ? '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> ONLINE'
            : '<span class="w-2 h-2 rounded-full bg-slate-400"></span> OFFLINE';
    }

    if (device) device.innerText = deviceId || 'Not connected';
    if (last) last.innerText = relativeLastSeen(lastSeen);

    updateTopControllerBadge(player, online, deviceId);
}

setInterval(() => {
    const dashboard = document.getElementById('dashboard-layout');
    if (dashboard?.classList.contains('hidden')) return;
    refreshDeviceControllerStatus();
}, 1500);
