/* ---------------------------------------------------------
 * SIKLAB SETTINGS MANAGER - SUPABASE
 * Validated numeric settings for each game module.
 * --------------------------------------------------------- */
const SETTINGS_SCHEMA = {
    W1: [
        { id: 'basePoints', label: 'Base Points (Per Question)', type: 'number', default: 10, min: 0, max: 1000, step: 1 },
        { id: 'deduction', label: 'Deduction (If wrong)', type: 'number', default: 2, min: 0, max: 1000, step: 1 },
        { id: 'stunDelay', label: 'Error Stun Delay (Sec)', type: 'number', default: 1.0, min: 0, max: 30, step: 0.1 },
        { id: 'roundTimer', label: 'Global Round Timer (Sec)', type: 'number', default: 15, min: 1, max: 600, step: 1 },
        { id: 'retryMultiplier', label: 'Retry Multiplier (0.0 - 1.0)', type: 'number', default: 0.5, min: 0, max: 1, step: 0.05 }
    ],
    W2: [
        { id: 'basePoints', label: 'Base Points (All Modes)', type: 'number', default: 10, min: 0, max: 1000, step: 1 },
        { id: 'deduction', label: 'Deduction (Quiz/Egg/Boat)', type: 'number', default: 2, min: 0, max: 1000, step: 1 },
        { id: 'quizTimer', label: 'Day 1 & 3: Round Timer (Sec)', type: 'number', default: 15, min: 1, max: 600, step: 1 },
        { id: 'balloonGoal', label: 'Day 2: Air/Clicks Needed to Pop', type: 'number', default: 100, min: 1, max: 5000, step: 1 },
        { id: 'boatSpeed', label: 'Day 4: Boat Movement Speed', type: 'number', default: 8, min: 1, max: 100, step: 1 },
        { id: 'hazardRate', label: 'Day 4: Hazard Spawn Rate (%)', type: 'number', default: 5, min: 0, max: 100, step: 1 },
        { id: 'boatTimer', label: 'Day 4: River Round Timer (Sec)', type: 'number', default: 60, min: 1, max: 1800, step: 1 }
    ],
    DEFAULT: [
        { id: 'basePoints', label: 'Base Points', type: 'number', default: 10, min: 0, max: 1000, step: 1 },
        { id: 'deduction', label: 'Deduction', type: 'number', default: 2, min: 0, max: 1000, step: 1 },
        { id: 'roundTimer', label: 'Round Timer (Sec)', type: 'number', default: 15, min: 1, max: 600, step: 1 }
    ]
};

function getModuleFromPath(path) {
    if (!path) return 'W1';
    const match = String(path).match(/_([Ww]\d+)(?:_|\.html)/);
    return match ? match[1].toUpperCase() : 'DEFAULT';
}

function clampSettingValue(field, rawValue) {
    let value = Number.parseFloat(rawValue);
    if (!Number.isFinite(value)) value = field.default;
    if (Number.isFinite(field.min)) value = Math.max(field.min, value);
    if (Number.isFinite(field.max)) value = Math.min(field.max, value);
    return value;
}

function renderSettingsForm(activePath) {
    const module = getModuleFromPath(activePath);
    const container = document.getElementById('dynamic-settings-container');
    const title = document.getElementById('dynamic-settings-title');
    if (!container) return;

    const schema = SETTINGS_SCHEMA[module] || SETTINGS_SCHEMA.DEFAULT;
    if (title) title.innerText = `${module} Dynamic Rules`;

    container.innerHTML = schema.map(field => `
        <div>
            <label class="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">${escapeHtml(field.label)}</label>
            <input
                type="number"
                id="setting-${escapeAttr(field.id)}"
                step="${escapeAttr(field.step ?? 'any')}"
                min="${escapeAttr(field.min ?? 0)}"
                ${Number.isFinite(field.max) ? `max="${escapeAttr(field.max)}"` : ''}
                class="w-full px-5 py-3 rounded-xl border-2 border-slate-200 focus:border-indigo-500 outline-none font-bold text-lg transition-colors"
            >
        </div>
    `).join('');

    loadGameConfig(module, schema);
}

async function loadGameConfig(module, schema) {
    let moduleSettings = {};
    try {
        const yearId = Number(window.currentSchoolYearId);
        if (!Number.isSafeInteger(yearId) || yearId <= 0) {
            throw new Error('Select a school year first.');
        }
        const db = requireSupabase();
        const { data, error } = await db
            .from('game_settings')
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
        if (!input) return;
        const sourceValue = moduleSettings[field.id] !== undefined
            ? moduleSettings[field.id]
            : field.default;
        input.value = clampSettingValue(field, sourceValue);
    });
}

async function saveGameConfig() {
    const activePath = document.getElementById('setting-game')?.value || '';
    const module = getModuleFromPath(activePath);
    const schema = SETTINGS_SCHEMA[module] || SETTINGS_SCHEMA.DEFAULT;
    const settings = {};

    for (const field of schema) {
        const input = document.getElementById(`setting-${field.id}`);
        const value = clampSettingValue(field, input?.value);
        settings[field.id] = value;
        if (input) input.value = value;
    }

    try {
        const db = requireSupabase();
        const yearId = Number(window.currentSchoolYearId);
        if (!Number.isSafeInteger(yearId) || yearId <= 0) throw new Error('Select a school year first.');
        const { error } = await db.from('game_settings').upsert({
            school_year_id: yearId,
            game_module: module,
            settings_json: settings,
            updated_at: new Date().toISOString()
        }, { onConflict: 'school_year_id,game_module' });
        if (error) throw error;
        if (typeof loadContentManagement === 'function') loadContentManagement();
        showToast(`${module} configuration saved for ${window.currentSchoolYearLabel || 'the selected school year'}!`);
    } catch (error) {
        console.error('[settings save]', error);
        showErrorToast(error.message || 'Could not save game settings.');
    }
}
