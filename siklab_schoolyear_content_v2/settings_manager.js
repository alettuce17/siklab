/* ---------------------------------------------------------
 * SIKLAB SETTINGS MANAGER - SCHOOL-YEAR SCOPED
 * --------------------------------------------------------- */
const SETTINGS_SCHEMA = {
    W1: [
        { id: 'basePoints', label: 'Base Points', type: 'number', default: 10 },
        { id: 'deduction', label: 'Wrong Answer Deduction', type: 'number', default: 2 },
        { id: 'stunDelay', label: 'Error Stun Delay (Sec)', type: 'number', default: 1.0 },
        { id: 'roundTimer', label: 'Question Timer (Sec)', type: 'number', default: 15 },
        { id: 'retryMultiplier', label: 'Retry Multiplier', type: 'number', default: 0.5 }
    ],
    NOVA: [
        { id: 'questionTimer', label: 'Question Timer (Sec)', type: 'number', default: 15 },
        { id: 'meterGoal', label: 'Targets Before Question', type: 'number', default: 5 },
        { id: 'pointsToWin', label: 'Question Points to Win', type: 'number', default: 5 },
        { id: 'roundTimer', label: 'Match Safety Timer (Sec)', type: 'number', default: 99 }
    ],
    TUG: [
        { id: 'pulls', label: 'Pulls to Win (1–15)', type: 'number', default: 5 },
        { id: 'timeLimit', label: 'Question Timer (5–180 Sec)', type: 'number', default: 20 },
        { id: 'delay', label: 'Time Between Rounds (0.5–8 Sec)', type: 'number', default: 2 }
    ],
    W2: [
        { id: 'basePoints', label: 'Base Points', type: 'number', default: 10 },
        { id: 'deduction', label: 'Deduction', type: 'number', default: 2 },
        { id: 'quizTimer', label: 'Round Timer (Sec)', type: 'number', default: 15 }
    ],
    DEFAULT: [
        { id: 'basePoints', label: 'Base Points', type: 'number', default: 10 },
        { id: 'deduction', label: 'Deduction', type: 'number', default: 2 },
        { id: 'roundTimer', label: 'Round Timer (Sec)', type: 'number', default: 15 }
    ]
};

function settingsYearId() {
    const value = Number(window.currentSchoolYearId || (typeof currentSchoolYearId !== 'undefined' ? currentSchoolYearId : 0) || 0);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function getModuleFromPath(path) {
    const value = String(path || '');
    if (/tug[-_ ]?of[-_ ]?(war|knowledge)|tug[-_ ]?war/i.test(value)) return 'TUG';
    if (/Science_Carnival_Shooter|science[-_ ]?carnival|nova/i.test(value)) return 'NOVA';
    const match = value.match(/_([Ww]\d+)(?:_|\.html)/);
    return match ? match[1].toUpperCase() : 'DEFAULT';
}

function settingsModuleLabel(module) {
    if (module === 'TUG') return 'Tug of Knowledge';
    if (module === 'NOVA') return 'Science Carnival Shooter';
    if (module === 'W1') return 'Picture Challenge';
    return module;
}

function renderSettingsForm(activePath) {
    const module = getModuleFromPath(activePath);
    const container = document.getElementById('dynamic-settings-container');
    const title = document.getElementById('dynamic-settings-title');
    if (!container) return;

    const schema = SETTINGS_SCHEMA[module] || SETTINGS_SCHEMA.DEFAULT;
    if (title) title.innerText = `${settingsModuleLabel(module)} Settings`;

    container.innerHTML = schema.map(field => `
        <div>
            <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">${escapeHtml(field.label)}</label>
            <input type="number" id="setting-${escapeAttr(field.id)}" step="any" min="0" class="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none font-bold text-base transition-colors bg-white">
        </div>
    `).join('');

    loadGameConfig(module, schema);
}

async function loadGameConfig(module, schema) {
    const yearId = settingsYearId();
    let moduleSettings = {};
    if (!yearId) {
        schema.forEach(field => {
            const input = document.getElementById(`setting-${field.id}`);
            if (input) input.value = field.default;
        });
        return;
    }

    try {
        const db = requireSupabase();
        const { data, error } = await db.from('game_settings')
            .select('settings_json')
            .eq('school_year_id', yearId)
            .eq('game_module', module)
            .maybeSingle();
        if (error) throw error;
        moduleSettings = data?.settings_json || {};
    } catch (error) {
        console.error('[settings load]', error);
        showErrorToast(error.message || 'Could not load game settings.');
    }

    schema.forEach(field => {
        const input = document.getElementById(`setting-${field.id}`);
        if (input) input.value = moduleSettings[field.id] !== undefined ? moduleSettings[field.id] : field.default;
    });
}

async function saveGameConfig() {
    const yearId = settingsYearId();
    if (!yearId) return showErrorToast('Select a school year first.');

    const activePath = document.getElementById('setting-game')?.value || '';
    const module = getModuleFromPath(activePath);
    const schema = SETTINGS_SCHEMA[module] || SETTINGS_SCHEMA.DEFAULT;
    const settings = {};

    schema.forEach(field => {
        const input = document.getElementById(`setting-${field.id}`);
        const value = Number.parseFloat(input?.value);
        settings[field.id] = Number.isFinite(value) ? value : field.default;
    });

    try {
        const db = requireSupabase();
        const { error } = await db.from('game_settings').upsert({
            school_year_id: yearId,
            game_module: module,
            settings_json: settings,
            updated_at: new Date().toISOString()
        }, { onConflict: 'school_year_id,game_module' });
        if (error) throw error;
        showToast(`${settingsModuleLabel(module)} settings saved.`);
    } catch (error) {
        console.error('[settings save]', error);
        showErrorToast(error.message || 'Could not save game settings.');
    }
}
