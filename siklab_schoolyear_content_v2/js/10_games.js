/* =========================================================
 * GAME MODULES - SUPABASE
 * Table expected: custom_game_module
 * ========================================================= */

async function loadGames() {
    try {
        const db = requireSupabase();
        const { data, error } = await db
            .from('custom_game_module')
            .select('game_id,quarter,game_name,file_path,is_editable')
            .order('quarter', { ascending: true })
            .order('game_id', { ascending: true });
        if (error) throw error;

        allGames = (data || []).map(game => ({
            id: game.game_id,
            quarter: Number(game.quarter) || 1,
            name: game.game_name,
            path: game.file_path,
            is_editable: game.is_editable === true || game.is_editable === 1
        }));
    } catch (error) {
        console.error('[games]', error);
        allGames = [];
        showErrorToast(error.message || 'Could not load game modules.');
    }

    filterGamesByQuarter();
    renderCustomGamesList();
}

function renderCustomGamesList() {
    const container = document.getElementById('custom-games-list');
    if (!container) return;

    if (allGames.length === 0) {
        container.innerHTML = '<p class="text-sm text-slate-400 text-center italic mt-4">No game modules found.</p>';
        return;
    }

    container.innerHTML = allGames.map((game, index) => `
        <div class="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm ${game.is_editable ? '' : 'bg-slate-50 opacity-90'}">
            <div>
                <span class="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-1 rounded mr-2">Q${Number(game.quarter) || 1}</span>
                <span class="font-bold text-slate-700">${siklabSafe(game.name)}</span>
                <p class="text-xs text-slate-400 mt-1">${siklabSafe(game.path)}</p>
            </div>
            <div class="flex gap-2">
                ${game.is_editable ? `
                    <button onclick="editCustomGame(${index})" class="w-8 h-8 rounded bg-blue-50 text-blue-500 hover:bg-blue-500 hover:text-white transition-colors"><i class="fa-solid fa-pen text-xs"></i></button>
                    <button onclick="deleteCustomGame(${Number(game.id)}, ${index})" class="w-8 h-8 rounded bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-colors"><i class="fa-solid fa-trash text-xs"></i></button>
                ` : '<span class="text-[10px] font-bold text-slate-400 bg-slate-200 px-3 py-1.5 rounded"><i class="fa-solid fa-lock mr-1"></i> System Module</span>'}
            </div>
        </div>
    `).join('');
}

function filterGamesByQuarter() {
    const quarter = Number.parseInt(document.getElementById('launch-quarter')?.value, 10) || 1;
    const launchSelect = document.getElementById('launch-game');
    const settingSelect = document.getElementById('setting-game');
    const filteredGames = allGames.filter(game => Number(game.quarter) === quarter);

    const optionsHTML = filteredGames.length
        ? filteredGames.map(game => `<option value="${siklabSafe(game.path)}">${siklabSafe(game.name)}</option>`).join('')
        : `<option value="">-- No games found for Q${quarter} --</option>`;

    const allOptionsHTML = allGames.map(game => `<option value="${siklabSafe(game.path)}">${siklabSafe(game.name)}</option>`).join('');

    if (launchSelect) launchSelect.innerHTML = optionsHTML;
    if (settingSelect) settingSelect.innerHTML = allOptionsHTML;

    const active = localStorage.getItem('siklab_active_game_path');
    if (active) {
        if (launchSelect && [...launchSelect.options].some(option => option.value === active)) launchSelect.value = active;
        if (settingSelect && [...settingSelect.options].some(option => option.value === active)) settingSelect.value = active;
    } else if (filteredGames.length > 0) {
        if (launchSelect) launchSelect.value = filteredGames[0].path;
        if (settingSelect) settingSelect.value = filteredGames[0].path;
    }

    if (typeof updateGameModeUI === 'function') updateGameModeUI();
}

function updateGameModeUI(sourceId) {
    applyMiddleware('CHANGE_GAME_SETTINGS', null, () => {
        let activePath = '';
        if (sourceId) activePath = document.getElementById(sourceId)?.value || '';
        else activePath = document.getElementById('launch-game')?.value || '';
        if (!activePath) return;

        const launchSelect = document.getElementById('launch-game');
        const settingSelect = document.getElementById('setting-game');
        if (launchSelect && [...launchSelect.options].some(option => option.value === activePath)) launchSelect.value = activePath;
        if (settingSelect && [...settingSelect.options].some(option => option.value === activePath)) settingSelect.value = activePath;

        const gameObj = allGames.find(game => game.path === activePath);
        const statGame = document.getElementById('stat-game');
        if (statGame && gameObj) statGame.innerText = gameObj.name.split(':').pop().trim();

        localStorage.setItem('siklab_active_game_path', activePath);
        if (typeof renderSettingsForm === 'function') renderSettingsForm(activePath);
    });
}

function launchGame() {
    applyMiddleware('LAUNCH_GAME', null, () => {
        const p1 = localStorage.getItem('siklab_active_p1');
        const p2 = localStorage.getItem('siklab_active_p2');
        if (!p1 || !p2) {
            showErrorToast("Setup Incomplete! Please 'Assign Match' first.");
            return;
        }

        const select = document.getElementById('launch-game');
        if (!select?.value) return showErrorToast('No game file selected!');

        const overlay = document.getElementById('siklab-game-overlay');
        const gameIframe = document.getElementById('game-iframe');
        if (!overlay || !gameIframe) return showErrorToast('Game iframe not found.');

        gameIframe.src = select.value;
        overlay.classList.remove('hidden');
        overlay.classList.add('flex', 'flex-col');
        showToast('Game launched!');
    });
}

function closeGameOverlay() {
    const overlay = document.getElementById('siklab-game-overlay');
    const gameIframe = document.getElementById('game-iframe');
    if (!overlay || !gameIframe) return;

    gameIframe.src = '';
    overlay.classList.add('hidden');
    overlay.classList.remove('flex', 'flex-col');
    loadHistory();
}

function editCustomGame(index) {
    const game = allGames[index];
    if (!game?.is_editable) return;

    document.getElementById('edit-custom-game-id').value = game.id || '';
    document.getElementById('new-game-quarter').value = game.quarter;
    document.getElementById('new-game-name').value = game.name;
    document.getElementById('new-game-path').value = game.path;
    document.getElementById('form-custom-game-title').innerHTML = '<i class="fa-solid fa-pen-to-square text-blue-500 mr-2"></i>Edit Custom Game';
    document.getElementById('btn-save-cg').innerText = 'Update Module';
    document.getElementById('btn-cancel-cg').classList.remove('hidden');
}

function cancelEditCustomGame() {
    document.getElementById('edit-custom-game-id').value = '';
    document.getElementById('new-game-name').value = '';
    document.getElementById('new-game-path').value = '';
    document.getElementById('form-custom-game-title').innerHTML = '<i class="fa-solid fa-folder-plus text-orange-500 mr-2"></i>Add Custom Game Module';
    document.getElementById('btn-save-cg').innerText = 'Add Custom Game';
    document.getElementById('btn-cancel-cg').classList.add('hidden');
}

async function deleteCustomGame(dbId) {
    applyMiddleware('DELETE_CUSTOM_GAME', null, async () => {
        if (!confirm('Delete this custom game module?')) return;

        try {
            const db = requireSupabase();
            const { error } = await db.from('custom_game_module').delete().eq('game_id', Number(dbId));
            if (error) throw error;
            await loadGames();
            showToast('Game module deleted.');
        } catch (error) {
            console.error('[delete game]', error);
            showErrorToast(error.message || 'Could not delete game module.');
        }
    });
}

function handleAddCustomGame(event) {
    event.preventDefault();

    applyMiddleware('ADD_CUSTOM_GAME', null, async () => {
        const editId = document.getElementById('edit-custom-game-id').value;
        const quarter = Number.parseInt(document.getElementById('new-game-quarter').value, 10) || 1;
        const name = document.getElementById('new-game-name').value.trim();
        const path = document.getElementById('new-game-path').value.trim();
        if (!name || !path) return showErrorToast('Game name and path are required.');

        const payload = {
            quarter,
            game_name: name,
            file_path: path,
            is_editable: true
        };

        try {
            const db = requireSupabase();
            const result = editId
                ? await db.from('custom_game_module').update(payload).eq('game_id', Number(editId))
                : await db.from('custom_game_module').insert(payload);
            if (result.error) throw result.error;

            await loadGames();
            showToast(editId ? 'Game module updated!' : 'Custom game added!');
            cancelEditCustomGame();

            const launchQuarter = document.getElementById('launch-quarter');
            if (launchQuarter) {
                launchQuarter.value = quarter;
                filterGamesByQuarter();
            }
        } catch (error) {
            console.error('[save game]', error);
            showErrorToast(error.message || 'Could not save game module.');
        }
    });
}
