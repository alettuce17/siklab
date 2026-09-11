/* =========================================================
 * ESP PLAYER CLOUD SETUP
 * No laptop/server IP is required.
 * QR opens the selected ESP setup role at 192.168.4.1.
 * ========================================================= */

let latestDeviceSetup = {
    player1: null,
    player2: null
};

function initializeDeviceSetup() {
    const title = document.getElementById('header-title');
    const subtitle = document.getElementById('header-subtitle');
    if (title) title.innerText = 'ESP Player Setup';
    if (subtitle) subtitle.innerText = 'Pair controllers with an internet Wi-Fi network and SikLab Cloud.';

    setCloudStatus(window.supabaseClient ? 'Online' : 'Not Configured', !!window.supabaseClient);
    refreshDeviceControllerStatus();
}

function formatPlayer(player) {
    return player === 'player1' ? 'Player 1' : 'Player 2';
}

function buildControllerSetupURL(player) {
    const url = new URL('http://192.168.4.1/');
    url.searchParams.set('player', player);
    return url.toString();
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
        const setupURL = buildControllerSetupURL(player);
        const qrURL = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(setupURL)}`;

        const config = {
            player,
            setup_url: setupURL,
            qr_url: qrURL
        };

        latestDeviceSetup[player] = config;
        renderControllerQR(player, config);
        showToast(`${formatPlayer(player)} setup QR generated.`);
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
    if (expires) expires.innerText = 'Connect to SikLab-Setup-XXXXXX before opening this QR.';
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

function relativeLastSeen(value) {
    if (!value) return '—';
    const timestamp = typeof value === 'number' ? value : new Date(value).getTime();
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 2) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
}

async function refreshDeviceControllerStatus() {
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
            const lastSeen = row?.last_seen ? new Date(row.last_seen).getTime() : window.siklabControllerLastSeen[player];
            const online = !!lastSeen && Date.now() - lastSeen < 12000;
            updateDeviceStatusCard(player, online, row?.device_id || window.siklabControllerDevices[player], lastSeen);
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

    if (device) {
        device.innerText = deviceId || 'Not connected';
    }

    if (last) {
        last.innerText = relativeLastSeen(lastSeen);
    }

    // Also update the global top P1 / P2 indicator
    updateTopControllerBadge(
        player,
        online,
        deviceId
    );
}

setInterval(() => {
    if (
        window.supabaseClient &&
        window.siklabCurrentUser
    ) {
        refreshDeviceControllerStatus();
    }
}, 4000);

function updateTopControllerBadge(player, online, deviceId = null) {
    const id = player === 'player1'
        ? 'ui-status-p1'
        : 'ui-status-p2';

    const label = player === 'player1'
        ? 'P1'
        : 'P2';

    const badge = document.getElementById(id);

    if (!badge) return;

    if (online) {
        badge.className =
            'bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full font-bold text-xs flex items-center gap-2 border border-emerald-200 transition-colors shadow-sm';

        badge.innerHTML =
            `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
             <i class="fa-solid fa-gamepad"></i>
             ${label}: ON`;
    } else {
        badge.className =
            'bg-slate-100 text-slate-500 px-4 py-2 rounded-full font-bold text-xs flex items-center gap-2 border border-slate-200 transition-colors shadow-sm';

        badge.innerHTML =
            `<span class="w-2 h-2 rounded-full bg-slate-400"></span>
             <i class="fa-solid fa-gamepad"></i>
             ${label}: OFF`;
    }

    if (deviceId) {
        badge.title = `${label} Controller: ${deviceId}`;
    } else {
        badge.title = `${label} Controller offline`;
    }
}