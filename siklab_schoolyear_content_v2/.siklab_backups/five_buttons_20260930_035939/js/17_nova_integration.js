/* =========================================================
 * SCIENCE CARNIVAL SHOOTER (NOVA) INTEGRATION V4
 * - Topic CRUD per school year
 * - Topic-scoped Question Bank
 * - Target category configuration
 * - Launch selected topic/difficulty into the game iframe
 * - Coordinates the separate Nova AI/PDF generator panel
 * ========================================================= */

let novaTopics = [];
let novaTopicCounts = new Map();

function novaYearId() {
    const value = Number(window.currentSchoolYearId || (typeof currentSchoolYearId !== 'undefined' ? currentSchoolYearId : 0) || 0);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function novaTopicStorageKey() {
    return `siklab_nova_topic_${novaYearId() || 'none'}`;
}

function novaDifficultyStorageKey() {
    return `siklab_nova_difficulty_${novaYearId() || 'none'}`;
}

function novaBankSelect() { return document.getElementById('nova-topic-select'); }
function novaFormSelect() { return document.getElementById('cq-nova-topic-id'); }
function novaLaunchSelect() { return document.getElementById('launch-nova-topic'); }

function selectedNovaTopicValue() {
    return novaBankSelect()?.value || localStorage.getItem(novaTopicStorageKey()) || '';
}

function getSelectedNovaTopic() {
    const id = Number(selectedNovaTopicValue());
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    return novaTopics.find(t => Number(t.topic_id) === id) || null;
}

function getLaunchNovaTopicId() {
    const id = Number(novaLaunchSelect()?.value || 0);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function getLaunchNovaDifficulty() {
    const select = document.getElementById('launch-nova-difficulty');
    return select?.value || localStorage.getItem(novaDifficultyStorageKey()) || 'medium';
}

function novaTopicName(topicId) {
    return novaTopics.find(t => Number(t.topic_id) === Number(topicId))?.topic_name || '';
}

function syncNovaTopicSelectors(value, sourceId = '') {
    [novaBankSelect(), novaFormSelect(), novaLaunchSelect()].forEach(select => {
        if (!select || select.id === sourceId) return;
        if ([...select.options].some(o => o.value === String(value))) select.value = String(value);
    });
}

function buildNovaTopicOptions(selectedValue = '') {
    const make = (includeBlank = true) => {
        const options = includeBlank ? [new Option('Choose a topic…', '')] : [];
        novaTopics.forEach(topic => {
            const total = novaTopicCounts.get(Number(topic.topic_id)) || 0;
            options.push(new Option(`${topic.topic_name} (${total})`, String(topic.topic_id)));
        });
        return options;
    };

    [novaBankSelect(), novaFormSelect(), novaLaunchSelect()].forEach(select => {
        if (!select) return;
        const previous = select.value || selectedValue;
        select.replaceChildren(...make(true));
        const preferred = [...select.options].some(o => o.value === String(previous)) ? String(previous) : String(selectedValue || '');
        if ([...select.options].some(o => o.value === preferred)) select.value = preferred;
    });
}

function updateNovaTopicSummary() {
    const topic = getSelectedNovaTopic();
    const title = document.getElementById('nova-selected-topic-name');
    const count = document.getElementById('nova-selected-topic-count');
    const topicLabel = document.getElementById('question-bank-topic-label');
    const yearLabel = document.getElementById('question-bank-year-label');

    if (title) title.textContent = topic?.topic_name || 'Choose a topic';
    if (count) {
        const total = topic ? (novaTopicCounts.get(Number(topic.topic_id)) || 0) : 0;
        count.textContent = `${total} question${total === 1 ? '' : 's'}`;
    }
    if (document.getElementById('cq-module')?.value === 'NOVA' && topicLabel) {
        topicLabel.textContent = topic?.topic_name || 'Choose a Science Carnival topic';
    }
    if (yearLabel) yearLabel.textContent = window.currentSchoolYearLabel || 'No school year';

    const launchTopicId = getLaunchNovaTopicId();
    const difficulty = getLaunchNovaDifficulty();
    const launchCount = document.getElementById('launch-nova-topic-count');
    if (launchCount) {
        const topicTotal = launchTopicId ? (novaTopicCounts.get(launchTopicId) || 0) : 0;
        launchCount.textContent = launchTopicId
            ? `${topicTotal} approved question${topicTotal === 1 ? '' : 's'} • ${difficulty[0].toUpperCase() + difficulty.slice(1)}`
            : 'Choose a topic before launching';
    }
}

async function loadNovaTopics(options = {}) {
    const yearId = novaYearId();
    const preferred = String(options.preferredValue || localStorage.getItem(novaTopicStorageKey()) || novaBankSelect()?.value || '');
    novaTopics = [];
    novaTopicCounts = new Map();

    if (!yearId) {
        buildNovaTopicOptions('');
        updateNovaTopicSummary();
        return;
    }

    try {
        const db = requireSupabase();
        const [{ data: topics, error: topicError }, { data: questions, error: questionError }] = await Promise.all([
            db.from('game_question_topics')
                .select('topic_id,school_year_id,game_module,topic_name,description,icon,is_active,game_config,created_at')
                .eq('school_year_id', yearId)
                .eq('game_module', 'NOVA')
                .eq('is_active', true)
                .order('topic_name', { ascending: true }),
            db.from('custom_question')
                .select('topic_id,review_status')
                .eq('school_year_id', yearId)
                .eq('game_module', 'NOVA')
                .eq('review_status', 'approved')
        ]);
        if (topicError) throw topicError;
        if (questionError) throw questionError;

        novaTopics = topics || [];
        for (const q of questions || []) {
            if (q.topic_id == null) continue;
            const key = Number(q.topic_id);
            novaTopicCounts.set(key, (novaTopicCounts.get(key) || 0) + 1);
        }

        const valid = novaTopics.some(t => String(t.topic_id) === preferred);
        const selected = valid ? preferred : (novaTopics[0] ? String(novaTopics[0].topic_id) : '');
        buildNovaTopicOptions(selected);
        if (selected) {
            localStorage.setItem(novaTopicStorageKey(), selected);
            syncNovaTopicSelectors(selected);
        } else {
            localStorage.removeItem(novaTopicStorageKey());
        }
        updateNovaTopicSummary();
        renderNovaTargetEditor();
        if (typeof novaAiSyncTopic === 'function') novaAiSyncTopic();
        if (typeof novaTargetsAiSyncTopic === 'function') novaTargetsAiSyncTopic();
        if (typeof novaTargetAiRefreshLessons === 'function') novaTargetAiRefreshLessons();
    } catch (error) {
        console.error('[Nova topics]', error);
        buildNovaTopicOptions('');
        updateNovaTopicSummary();
        const message = String(error.message || 'Could not load Science Carnival topics.');
        showErrorToast(message.includes('game_config') || message.includes('difficulty')
            ? 'Science Carnival integration is not installed yet. Run migration 010_science_carnival_topics.sql.'
            : message);
    }
}

async function selectNovaTopic(value, sourceId = 'nova-topic-select') {
    const yearId = novaYearId();
    if (!yearId) return showErrorToast('Select a school year first.');
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) {
        localStorage.removeItem(novaTopicStorageKey());
    } else {
        localStorage.setItem(novaTopicStorageKey(), String(id));
        syncNovaTopicSelectors(String(id), sourceId);
    }
    updateNovaTopicSummary();
    renderNovaTargetEditor();
    if (typeof novaAiSyncTopic === 'function') novaAiSyncTopic();
    if (typeof novaTargetsAiSyncTopic === 'function') novaTargetsAiSyncTopic();
    if (typeof cancelEdit === 'function') cancelEdit();
    if (document.getElementById('cq-module')?.value === 'NOVA' && typeof loadCustomQuestions === 'function') {
        await loadCustomQuestions();
    }
}

async function createNovaTopic() {
    const yearId = novaYearId();
    const name = document.getElementById('nova-new-topic-name')?.value.trim().replace(/\s+/g, ' ').slice(0, 80) || '';
    const description = document.getElementById('nova-new-topic-description')?.value.trim().slice(0, 220) || null;
    if (!yearId) return showErrorToast('Select a school year first.');
    if (name.length < 2) return showErrorToast('Enter a topic name first.');

    try {
        const db = requireSupabase();
        const { data, error } = await db.from('game_question_topics').insert({
            school_year_id: yearId,
            game_module: 'NOVA',
            topic_name: name,
            description,
            icon: '🎪',
            game_config: {},
            is_active: true
        }).select('topic_id').single();
        if (error) throw error;
        document.getElementById('nova-new-topic-name').value = '';
        document.getElementById('nova-new-topic-description').value = '';
        const value = String(data.topic_id);
        await loadNovaTopics({ preferredValue: value });
        await selectNovaTopic(value);
        showToast(`Science Carnival topic “${name}” created.`);
    } catch (error) {
        console.error('[Nova topic create]', error);
        showErrorToast(error.message || 'Could not create topic.');
    }
}

async function renameNovaTopic() {
    const topic = getSelectedNovaTopic();
    if (!topic) return showErrorToast('Choose a Science Carnival topic first.');
    const next = prompt('Rename topic:', topic.topic_name);
    if (next == null) return;
    const name = next.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (name.length < 2) return showErrorToast('Topic name is too short.');

    try {
        const db = requireSupabase();
        const { error } = await db.from('game_question_topics')
            .update({ topic_name: name, updated_at: new Date().toISOString() })
            .eq('topic_id', Number(topic.topic_id))
            .eq('school_year_id', novaYearId());
        if (error) throw error;
        await db.from('custom_question')
            .update({ topic: name, question_set: name })
            .eq('school_year_id', novaYearId())
            .eq('game_module', 'NOVA')
            .eq('topic_id', Number(topic.topic_id));
        await loadNovaTopics({ preferredValue: String(topic.topic_id) });
        if (typeof loadCustomQuestions === 'function') await loadCustomQuestions();
        showToast('Topic renamed.');
    } catch (error) {
        console.error('[Nova topic rename]', error);
        showErrorToast(error.message || 'Could not rename topic.');
    }
}

async function deleteNovaTopic() {
    const topic = getSelectedNovaTopic();
    if (!topic) return showErrorToast('Choose a Science Carnival topic first.');
    const count = novaTopicCounts.get(Number(topic.topic_id)) || 0;
    if (count > 0) return showErrorToast(`Move or delete the ${count} question${count === 1 ? '' : 's'} in this topic first.`);
    if (!confirm(`Delete empty topic “${topic.topic_name}”?`)) return;

    try {
        const db = requireSupabase();
        const { error } = await db.from('game_question_topics')
            .delete()
            .eq('topic_id', Number(topic.topic_id))
            .eq('school_year_id', novaYearId());
        if (error) throw error;
        localStorage.removeItem(novaTopicStorageKey());
        await loadNovaTopics();
        if (typeof loadCustomQuestions === 'function') await loadCustomQuestions();
        showToast('Topic deleted.');
    } catch (error) {
        console.error('[Nova topic delete]', error);
        showErrorToast(error.message || 'Could not delete topic.');
    }
}

function parseNovaTargets(text) {
    return String(text || '')
        .split(/[,\n]+/)
        .map(v => v.trim())
        .filter(Boolean)
        .slice(0, 6)
        .map(value => {
            const match = value.match(/^(\S+)\s+(.+)$/);
            if (match) return { emoji: match[1], label: match[2].trim().slice(0, 24) };
            return { emoji: '🔹', label: value.slice(0, 24) };
        });
}

function formatNovaTargets(items) {
    return (Array.isArray(items) ? items : []).map(item => `${item.emoji || '🔹'} ${item.label || ''}`.trim()).join(', ');
}

function renderNovaTargetEditor() {
    const topic = getSelectedNovaTopic();
    const editor = document.getElementById('nova-target-editor');
    const status = document.getElementById('nova-target-config-status');
    if (!editor) return;

    if (!topic) {
        editor.classList.add('opacity-50', 'pointer-events-none');
        if (status) status.textContent = 'Choose a topic first.';
        for (let i = 0; i < 4; i++) {
            const name = document.getElementById(`nova-cat-name-${i}`);
            const targets = document.getElementById(`nova-cat-targets-${i}`);
            if (name) name.value = '';
            if (targets) targets.value = '';
        }
        return;
    }

    editor.classList.remove('opacity-50', 'pointer-events-none');
    const cfg = topic.game_config && typeof topic.game_config === 'object' ? topic.game_config : {};
    const order = Array.isArray(cfg.catOrder) ? cfg.catOrder.slice(0, 4) : [];
    const categories = cfg.categories && typeof cfg.categories === 'object' ? cfg.categories : {};

    for (let i = 0; i < 4; i++) {
        const catName = order[i] || '';
        const nameEl = document.getElementById(`nova-cat-name-${i}`);
        const targetEl = document.getElementById(`nova-cat-targets-${i}`);
        if (nameEl) nameEl.value = catName;
        if (targetEl) targetEl.value = catName ? formatNovaTargets(categories[catName]) : '';
    }
    if (status) status.textContent = order.length >= 2 ? `${order.length} target categories configured.` : 'Add at least 2 target categories before launching.';
}

async function saveNovaTargetConfig() {
    const topic = getSelectedNovaTopic();
    if (!topic) return showErrorToast('Choose a Science Carnival topic first.');

    const catOrder = [];
    const categories = {};
    for (let i = 0; i < 4; i++) {
        const name = document.getElementById(`nova-cat-name-${i}`)?.value.trim().replace(/\s+/g, ' ').slice(0, 32) || '';
        const items = parseNovaTargets(document.getElementById(`nova-cat-targets-${i}`)?.value || '');
        if (!name && items.length === 0) continue;
        if (!name) return showErrorToast(`Category ${i + 1} needs a name.`);
        if (items.length < 2) return showErrorToast(`“${name}” needs at least 2 targets. Use format: 🌱 Plant, 🐕 Dog`);
        if (catOrder.some(existing => existing.toLowerCase() === name.toLowerCase())) return showErrorToast('Category names must be unique.');
        catOrder.push(name);
        categories[name] = items;
    }
    if (catOrder.length < 2) return showErrorToast('Add at least 2 target categories.');

    const gameConfig = { categories, catOrder };
    try {
        const db = requireSupabase();
        const { error } = await db.from('game_question_topics')
            .update({ game_config: gameConfig, updated_at: new Date().toISOString() })
            .eq('topic_id', Number(topic.topic_id))
            .eq('school_year_id', novaYearId());
        if (error) throw error;
        await loadNovaTopics({ preferredValue: String(topic.topic_id) });
        showToast('Science Carnival target categories saved.');
    } catch (error) {
        console.error('[Nova target config save]', error);
        showErrorToast(error.message || 'Could not save target categories.');
    }
}

async function moveNovaQuestionToTopic(questionId, topicId) {
    const target = novaTopics.find(t => Number(t.topic_id) === Number(topicId));
    if (!target) return;
    try {
        const db = requireSupabase();
        const { error } = await db.from('custom_question').update({
            topic_id: Number(target.topic_id),
            topic: target.topic_name,
            question_set: target.topic_name
        }).eq('question_id', Number(questionId)).eq('school_year_id', novaYearId());
        if (error) throw error;
        await loadNovaTopics({ preferredValue: String(target.topic_id) });
        await selectNovaTopic(String(target.topic_id));
        showToast(`Question moved to ${target.topic_name}.`);
    } catch (error) {
        showErrorToast(error.message || 'Could not move question.');
    }
}

function showNovaQuickLaunch(path) {
    const box = document.getElementById('nova-topic-quick-launch');
    if (box) box.classList.toggle('hidden', typeof getModuleFromPath === 'function' && getModuleFromPath(path) !== 'NOVA');
}

async function saveNovaLaunchTopic() {
    const id = getLaunchNovaTopicId();
    if (id) {
        localStorage.setItem(novaTopicStorageKey(), String(id));
        syncNovaTopicSelectors(String(id), 'launch-nova-topic');
    }
    const difficulty = getLaunchNovaDifficulty();
    localStorage.setItem(novaDifficultyStorageKey(), difficulty);
    updateNovaTopicSummary();
}

function openNovaQuestionBank() {
    switchTab('content');
    const module = document.getElementById('cq-module');
    if (module) module.value = 'NOVA';
    qbSetPanel('questions');
    onQuestionModuleChanged('NOVA');
}

let qbActivePanel = 'questions';
function qbSetPanel(panel = qbActivePanel) {
    const module = document.getElementById('cq-module')?.value || 'W1';
    const supported = module === 'W1' || module === 'NOVA' || module === 'TUG';
    const hasSettings = module === 'W1' || module === 'NOVA' || module === 'TUG';
    qbActivePanel = (panel === 'ai' && supported) || (panel === 'settings' && hasSettings) ? panel : 'questions';

    document.querySelectorAll('[data-qb-tab]').forEach(button => {
        const active = button.dataset.qbTab === qbActivePanel;
        button.classList.toggle('is-active', active);
        button.classList.toggle('hidden', (!supported && button.dataset.qbTab !== 'questions') || (!hasSettings && button.dataset.qbTab === 'settings'));
        button.setAttribute('aria-pressed', String(active));
    });
    document.getElementById('qb-questions-panel')?.classList.toggle('hidden', qbActivePanel !== 'questions');
    const sections = {
        'game1-topic-panel': module === 'W1' && qbActivePanel === 'settings',
        'nova-topic-panel': module === 'NOVA' && qbActivePanel === 'settings',
        'tug-topic-panel': module === 'TUG' && qbActivePanel === 'settings',
        'game1-ai-panel': module === 'W1' && qbActivePanel === 'ai',
        'nova-ai-panel': module === 'NOVA' && qbActivePanel === 'ai',
        'tug-ai-panel': module === 'TUG' && qbActivePanel === 'ai'
    };
    for (const [id, show] of Object.entries(sections)) {
        document.getElementById(id)?.classList.toggle('hidden', !show);
    }
}

function setNovaQuestionFormMode() {
    const module = document.getElementById('cq-module')?.value || 'W1';
    const isNova = module === 'NOVA';
    const isGame1 = module === 'W1';
    const isTug = module === 'TUG';

    document.getElementById('cq-topic-wrap')?.classList.toggle('hidden', !isGame1);
    document.getElementById('cq-nova-topic-wrap')?.classList.toggle('hidden', !isNova);
    document.getElementById('cq-tug-topic-wrap')?.classList.toggle('hidden', !isTug);
    document.getElementById('cq-difficulty-wrap')?.classList.toggle('hidden', !isNova);
    document.getElementById('cq-image-section')?.classList.toggle('hidden', !isGame1);
    document.getElementById('cq-answer-wrap')?.classList.toggle('hidden', !(isGame1 || isNova || isTug));

    const optionWrap = document.getElementById('cq-options-wrap');
    const option5 = document.getElementById('cq-option-field-4');
    if (optionWrap) optionWrap.classList.toggle('hidden', !(isGame1 || isNova || isTug));
    if (option5) option5.classList.remove('hidden');

    const labels = ['A • Red','B • Green','C • White','D • Blue','E • Yellow'];
    for (let i = 0; i < 5; i++) {
        const label = document.getElementById(`cq-option-label-${i}`);
        if (label) label.firstChild.textContent = labels[i];
    }

    const moduleLabel = document.getElementById('question-bank-module-label');
    if (moduleLabel) moduleLabel.textContent = isNova ? 'Science Carnival Question Bank' : (isGame1 ? 'Picture Challenge Question Bank' : isTug ? 'Tug of Knowledge Question Bank' : `${module} Question Bank`);
    const helper = document.querySelector('#cq-options-wrap > p');
    if (helper) helper.textContent = isTug ? 'Tug of Knowledge uses all five controller colors A–E on both controllers.' : isNova
        ? 'Science Carnival uses A–E while a question is open. Red A returns to Shoot/Grab during the shooting phase.'
        : 'Picture Challenge uses five controller colors: A red, B green, C white, D blue, E yellow.';
    const answerLabel = document.getElementById('cq-answer-label');
    if (answerLabel) answerLabel.textContent = 'Correct color / letter (A–E)';

    const answer = document.getElementById('cq-answer');
    if (answer) {
        const answerLabels = ['A • Red','B • Green','C • White','D • Blue','E • Yellow'];
        answer.replaceChildren(...answerLabels.map((text, i) => new Option(text, String(i))));
    }
}

// Overrides Game 1's earlier handler because this file is loaded after js/16_game1_topics.js.
function onQuestionModuleChanged(module) {
    const value = String(module || 'W1');
    const isGame1 = value === 'W1';
    const isNova = value === 'NOVA';
    const picker = document.getElementById('cq-module');
    if (picker && [...picker.options].some(option => option.value === value)) picker.value = value;

    qbSetPanel(qbActivePanel);
    setNovaQuestionFormMode();
    if (typeof cancelEdit === 'function') cancelEdit();

    if (isGame1) {
        loadGame1Topics().then(() => loadCustomQuestions());
    } else if (isNova) {
        loadNovaTopics().then(() => {
            if (typeof novaAiSyncTopic === 'function') novaAiSyncTopic();
            if (typeof novaTargetsAiSyncTopic === 'function') novaTargetsAiSyncTopic();
            if (typeof novaAiRefreshLessons === 'function') novaAiRefreshLessons();
            if (typeof novaTargetAiRefreshLessons === 'function') novaTargetAiRefreshLessons();
            return loadCustomQuestions();
        });
    } else if (value === 'TUG') {
        loadTugTopics().then(() => loadCustomQuestions());
    } else if (typeof loadCustomQuestions === 'function') {
        loadCustomQuestions();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    qbSetPanel('questions');
    setNovaQuestionFormMode();
});

async function getNovaLaunchPayload() {
    const yearId = novaYearId();
    const topicId = getLaunchNovaTopicId();
    const difficulty = getLaunchNovaDifficulty();
    if (!yearId) throw new Error('Select a school year first.');
    if (!topicId) throw new Error('Choose a Science Carnival topic before launching.');

    const db = requireSupabase();
    const [{ data: topic, error: topicError }, { data: questions, error: questionError }, { data: settingRow, error: settingError }] = await Promise.all([
        db.from('game_question_topics')
            .select('topic_id,topic_name,description,game_config')
            .eq('topic_id', topicId)
            .eq('school_year_id', yearId)
            .eq('game_module', 'NOVA')
            .single(),
        db.from('custom_question')
            .select('question_id,prompt,answer_options,correct_ans,explanation,difficulty,question_type')
            .eq('school_year_id', yearId)
            .eq('game_module', 'NOVA')
            .eq('topic_id', topicId)
            .eq('review_status', 'approved')
            .eq('question_type', 'mc')
            .eq('difficulty', difficulty)
            .order('question_id', { ascending: true }),
        db.from('game_settings')
            .select('settings_json')
            .eq('school_year_id', yearId)
            .eq('game_module', 'NOVA')
            .maybeSingle()
    ]);
    if (topicError) throw topicError;
    if (questionError) throw questionError;
    if (settingError) throw settingError;

    const validQuestions = (questions || []).filter(q => Array.isArray(q.answer_options) && q.answer_options.length === 5 && Number(q.correct_ans) >= 0 && Number(q.correct_ans) <= 4);
    if (!validQuestions.length) throw new Error(`No approved ${difficulty} questions are saved in “${topic.topic_name}”.`);

    const gameConfig = topic.game_config && typeof topic.game_config === 'object' ? topic.game_config : {};
    if (!Array.isArray(gameConfig.catOrder) || gameConfig.catOrder.length < 2 || !gameConfig.categories) {
        throw new Error(`Configure at least 2 target categories for “${topic.topic_name}” before launching.`);
    }

    return {
        type: 'siklab_game_config',
        game: 'NOVA',
        schoolYearId: yearId,
        topic: { id: Number(topic.topic_id), name: topic.topic_name, description: topic.description || '' },
        difficulty,
        questions: validQuestions,
        gameConfig,
        settings: Object.assign({ questionTimer: 15, meterGoal: 5, pointsToWin: 5, roundTimer: 99 }, settingRow?.settings_json || {})
    };
}

async function launchNovaIntoIframe(gameIframe, gamePath) {
    try {
        const payload = await getNovaLaunchPayload();
        gameIframe.onload = () => {
            try {
                gameIframe.contentWindow.postMessage(payload, window.location.origin);
            } catch (error) {
                console.error('[Nova config postMessage]', error);
            }
            gameIframe.onload = null;
        };
        gameIframe.src = gamePath;
        return payload;
    } catch (error) {
        gameIframe.onload = null;
        throw error;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const storedDiff = localStorage.getItem(novaDifficultyStorageKey()) || 'medium';
    const diff = document.getElementById('launch-nova-difficulty');
    if (diff && [...diff.options].some(o => o.value === storedDiff)) diff.value = storedDiff;
    loadNovaTopics().catch(error => console.warn('[Nova integration boot]', error));
    setNovaQuestionFormMode();
});

window.addEventListener('message', async (event) => {
    if (event.origin !== window.location.origin) return;
    const iframe = document.getElementById('game-iframe');
    if (iframe?.contentWindow && event.source !== iframe.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'siklab_close_game') {
        if (typeof closeGameOverlay === 'function') closeGameOverlay();
        return;
    }

    if (data.type !== 'siklab_match_result') return;

    try {
        const db = requireSupabase();
        const customGameData = {
            game: data.game || 'Science Carnival Shooter',
            topicId: data.topicId || null,
            topicName: data.topicName || '',
            schoolYearId: novaYearId(),
            p1Name: data.p1Name || 'Player 1',
            p2Name: data.p2Name || 'Player 2',
            p1Score: Number(data.p1Score || 0),
            p2Score: Number(data.p2Score || 0),
            winner: data.winner || 'TIE',
            date: data.date || new Date().toLocaleString()
        };
        const { error } = await db.from('player_score').insert({
            final_score: Math.max(customGameData.p1Score, customGameData.p2Score),
            custom_game_data: customGameData
        });
        if (error) throw error;
        if (typeof loadHistory === 'function') loadHistory();
    } catch (error) {
        console.error('[Nova match history]', error);
        showErrorToast(error.message || 'Science Carnival match finished, but history could not be saved.');
    }
});
