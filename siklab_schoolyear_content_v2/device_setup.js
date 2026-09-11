/* =========================================================
 * SIKLAB CLOUD DEVICE SETUP HELPER
 *
 * This page NEVER fetches 192.168.4.1 from the Netlify page.
 * It only navigates the browser directly to the ESP AP.
 * That avoids mixed-content / Private Network Access issues.
 * ========================================================= */

const ESP_SETUP_BASE_URL = 'http://192.168.4.1/';
let selectedPlayer = null;

window.addEventListener('DOMContentLoaded', initializeDeviceSetupPage);

function initializeDeviceSetupPage() {
    const params = new URLSearchParams(window.location.search);
    const player = params.get('player');

    if (player === 'player1' || player === 'player2') {
        selectedPlayer = player;
        const title = document.getElementById('setup-player-title');
        if (title) title.textContent = player === 'player1'
            ? 'Configure Player 1'
            : 'Configure Player 2';
    } else {
        selectedPlayer = null;
        showSetupError('Player assignment was not included. Open this page from the Player 1 or Player 2 setup action in the SikLab dashboard.');
    }

    const button = document.getElementById('open-controller-button');
    if (button) button.disabled = !selectedPlayer;
}

function openControllerSetup() {
    if (!selectedPlayer) {
        showSetupError('Choose Player 1 or Player 2 from the SikLab dashboard first.');
        return;
    }

    const url = new URL(ESP_SETUP_BASE_URL);
    url.searchParams.set('player', selectedPlayer);

    // Direct navigation — intentionally NOT fetch().
    window.location.href = url.toString();
}

function showSetupError(message) {
    const box = document.getElementById('setup-error');
    if (!box) return;
    box.textContent = message;
    box.style.display = 'block';
}
