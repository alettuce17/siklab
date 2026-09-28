/* =========================================================
 * GAME 1 TOPIC LIBRARY
 * Topic CRUD + Question Bank filtering + launch selection
 * Table: game_question_topics
 * ========================================================= */

let game1Topics = [];
let game1TopicCounts = new Map();

function game1YearId() {
    const id = Number(window.currentSchoolYearId || (typeof currentSchoolYearId !== 'undefined' ? currentSchoolYearId : 0) || 0);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function game1TopicStorageKey() {
    return `siklab_game1_topic_${game1YearId() || 'none'}`;
}

function game1BankSelect() { return document.getElementById('game1-topic-select'); }
function game1FormSelect() { return document.getElementById('cq-topic-id'); }
function game1LaunchSelect() { return document.getElementById('launch-game1-topic'); }

function selectedGame1TopicValue() {
    return game1BankSelect()?.value || localStorage.getItem(game1TopicStorageKey()) || '';
}

function getSelectedGame1TopicFilter() {
    const value = selectedGame1TopicValue();
    if (value === 'unassigned') return { mode: 'unassigned', topicId: null, topic: null };
    const topicId = Number(value);
    if (!Number.isSafeInteger(topicId) || topicId <= 0) return { mode: 'none', topicId: null, topic: null };
    return { mode: 'topic', topicId, topic: game1Topics.find(t => Number(t.topic_id) === topicId) || null };
}

function getSelectedGame1Topic() {
    const filter = getSelectedGame1TopicFilter();
    return filter.mode === 'topic' ? filter.topic : null;
}

function getLaunchGame1TopicId() {
    const value = game1LaunchSelect()?.value || '';
    const topicId = Number(value);
    return Number.isSafeInteger(topicId) && topicId > 0 ? topicId : null;
}

function game1TopicName(topicId) {
    return game1Topics.find(t => Number(t.topic_id) === Number(topicId))?.topic_name || '';
}

function syncGame1TopicSelectors(value, sourceId = '') {
    [game1BankSelect(), game1FormSelect()].forEach(select => {
        if (!select || select.id === sourceId) return;
        if ([...select.options].some(o => o.value === value)) select.value = value;
    });

    const launch = game1LaunchSelect();
    if (launch && sourceId !== launch.id && value !== 'unassigned' && [...launch.options].some(o => o.value === value)) {
        launch.value = value;
    }
}

function updateGame1TopicSummary() {
    const filter = getSelectedGame1TopicFilter();
    const title = document.getElementById('game1-selected-topic-name');
    const count = document.getElementById('game1-selected-topic-count');
    const badge = document.getElementById('question-bank-topic-label');
    const aiBadge = document.getElementById('sense-bank-topic-name');

    let name = 'Choose a topic';
    let total = 0;
    if (filter.mode === 'topic') {
        name = filter.topic?.topic_name || 'Selected topic';
        total = game1TopicCounts.get(filter.topicId) || 0;
    } else if (filter.mode === 'unassigned') {
        name = 'Unassigned Questions';
        total = game1TopicCounts.get('unassigned') || 0;
    }

    if (title) title.textContent = name;
    if (count) count.textContent = `${total} question${total === 1 ? '' : 's'}`;
    if (badge) badge.textContent = name;
    if (aiBadge) aiBadge.textContent = filter.mode === 'topic' ? name : 'Select a topic first';

    const topicInput = document.getElementById('sense-topic');
    if (filter.mode === 'topic' && topicInput && (!topicInput.value.trim() || topicInput.dataset.autoTopic === '1')) {
        topicInput.value = name;
        topicInput.dataset.autoTopic = '1';
    }

    const launchCount = document.getElementById('launch-game1-topic-count');
    const launchTopicId = getLaunchGame1TopicId();
    const launchTotal = launchTopicId ? (game1TopicCounts.get(launchTopicId) || 0) : 0;
    if (launchCount) launchCount.textContent = launchTopicId ? `${launchTotal} approved question${launchTotal === 1 ? '' : 's'} available` : 'Choose a topic before launching';
}

function buildGame1TopicOptions(selectedValue) {
    const bankOptions = [new Option('Choose a topic…', '')];
    game1Topics.forEach(topic => {
        const count = game1TopicCounts.get(Number(topic.topic_id)) || 0;
        bankOptions.push(new Option(`${topic.topic_name} (${count})`, String(topic.topic_id)));
    });
    const unassigned = game1TopicCounts.get('unassigned') || 0;
    if (unassigned > 0) bankOptions.push(new Option(`Unassigned Questions (${unassigned})`, 'unassigned'));

    [game1BankSelect(), game1FormSelect()].forEach(select => {
        if (!select) return;
        select.replaceChildren(...bankOptions.map(o => new Option(o.text, o.value)));
        if ([...select.options].some(o => o.value === selectedValue)) select.value = selectedValue;
    });

    const launch = game1LaunchSelect();
    if (launch) {
        const currentLaunch = launch.value || localStorage.getItem(game1TopicStorageKey()) || '';
        launch.replaceChildren(new Option('Choose a topic…', ''), ...game1Topics.map(topic => {
            const count = game1TopicCounts.get(Number(topic.topic_id)) || 0;
            return new Option(`${topic.topic_name} (${count})`, String(topic.topic_id));
        }));
        const preferred = [...launch.options].some(o => o.value === currentLaunch) ? currentLaunch :
            ([...launch.options].some(o => o.value === selectedValue) ? selectedValue : '');
        launch.value = preferred;
    }
}

async function loadGame1Topics(options = {}) {
    const yearId = game1YearId();
    const previous = options.preferredValue || localStorage.getItem(game1TopicStorageKey()) || game1BankSelect()?.value || '';

    game1Topics = [];
    game1TopicCounts = new Map();

    if (!yearId) {
        buildGame1TopicOptions('');
        updateGame1TopicSummary();
        return;
    }

    try {
        const db = requireSupabase();
        const [{ data: topics, error: topicError }, { data: questions, error: questionError }] = await Promise.all([
            db.from('game_question_topics')
                .select('topic_id,school_year_id,game_module,topic_name,description,icon,is_active,created_at')
                .eq('school_year_id', yearId)
                .eq('game_module', 'W1')
                .eq('is_active', true)
                .order('topic_name', { ascending: true }),
            db.from('custom_question')
                .select('topic_id,review_status')
                .eq('school_year_id', yearId)
                .eq('game_module', 'W1')
                .eq('review_status', 'approved')
        ]);
        if (topicError) throw topicError;
        if (questionError) throw questionError;

        game1Topics = topics || [];
        for (const row of questions || []) {
            const key = row.topic_id == null ? 'unassigned' : Number(row.topic_id);
            game1TopicCounts.set(key, (game1TopicCounts.get(key) || 0) + 1);
        }

        const validPrevious = previous === 'unassigned'
            ? (game1TopicCounts.get('unassigned') || 0) > 0
            : game1Topics.some(t => String(t.topic_id) === String(previous));
        const fallback = game1Topics[0] ? String(game1Topics[0].topic_id) : ((game1TopicCounts.get('unassigned') || 0) > 0 ? 'unassigned' : '');
        const selected = validPrevious ? String(previous) : fallback;

        buildGame1TopicOptions(selected);
        if (selected) localStorage.setItem(game1TopicStorageKey(), selected);
        else localStorage.removeItem(game1TopicStorageKey());
        syncGame1TopicSelectors(selected);
        updateGame1TopicSummary();
    } catch (error) {
        console.error('[Game 1 topics]', error);
        buildGame1TopicOptions('');
        updateGame1TopicSummary();
        const message = String(error.message || 'Could not load Game 1 topics.');
        showErrorToast(message.includes('game_question_topics')
            ? 'Game 1 topics are not installed yet. Run migration 009_game1_question_topics.sql in Supabase SQL Editor.'
            : message);
    }
}

async function selectGame1Topic(value, sourceId = 'game1-topic-select') {
    const yearId = game1YearId();
    if (!yearId) return showErrorToast('Select a school year first.');
    value = String(value || '');
    if (value) localStorage.setItem(game1TopicStorageKey(), value);
    else localStorage.removeItem(game1TopicStorageKey());
    syncGame1TopicSelectors(value, sourceId);
    updateGame1TopicSummary();
    if (typeof cancelEdit === 'function') cancelEdit();
    if (typeof loadCustomQuestions === 'function') await loadCustomQuestions();
}

async function createGame1Topic() {
    const yearId = game1YearId();
    const nameInput = document.getElementById('game1-new-topic-name');
    const descInput = document.getElementById('game1-new-topic-description');
    const topicName = nameInput?.value.trim().replace(/\s+/g, ' ').slice(0, 80) || '';
    const description = descInput?.value.trim().slice(0, 220) || null;
    if (!yearId) return showErrorToast('Select a school year first.');
    if (topicName.length < 2) return showErrorToast('Enter a topic name first.');

    try {
        const db = requireSupabase();
        const { data, error } = await db.from('game_question_topics').insert({
            school_year_id: yearId,
            game_module: 'W1',
            topic_name: topicName,
            description,
            icon: '📚',
            is_active: true
        }).select('topic_id').single();
        if (error) throw error;
        if (nameInput) nameInput.value = '';
        if (descInput) descInput.value = '';
        const value = String(data.topic_id);
        await loadGame1Topics({ preferredValue: value });
        await selectGame1Topic(value);
        showToast(`Topic “${topicName}” created.`);
    } catch (error) {
        console.error('[create Game 1 topic]', error);
        const msg = String(error.message || 'Could not create topic.');
        showErrorToast(msg.toLowerCase().includes('duplicate') ? 'A topic with that name already exists in this school year.' : msg);
    }
}

async function renameGame1Topic() {
    const topic = getSelectedGame1Topic();
    if (!topic) return showErrorToast('Select a created topic first.');
    const next = prompt('Rename topic:', topic.topic_name);
    if (next == null) return;
    const topicName = next.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (topicName.length < 2) return showErrorToast('Topic name is too short.');

    try {
        const db = requireSupabase();
        const { error } = await db.from('game_question_topics').update({
            topic_name: topicName,
            updated_at: new Date().toISOString()
        }).eq('topic_id', topic.topic_id).eq('school_year_id', game1YearId());
        if (error) throw error;

        // Keep legacy metadata readable for older builds, while topic_id remains the true link.
        const { error: questionError } = await db.from('custom_question').update({
            topic: topicName,
            question_set: topicName
        }).eq('school_year_id', game1YearId()).eq('game_module', 'W1').eq('topic_id', topic.topic_id);
        if (questionError) throw questionError;

        await loadGame1Topics({ preferredValue: String(topic.topic_id) });
        await loadCustomQuestions();
        showToast('Topic renamed.');
    } catch (error) {
        console.error('[rename Game 1 topic]', error);
        showErrorToast(error.message || 'Could not rename topic.');
    }
}

async function deleteGame1Topic() {
    const topic = getSelectedGame1Topic();
    if (!topic) return showErrorToast('Select a created topic first.');
    const count = game1TopicCounts.get(Number(topic.topic_id)) || 0;
    if (count > 0) return showErrorToast(`“${topic.topic_name}” still has ${count} question${count === 1 ? '' : 's'}. Move or delete those questions before deleting the topic.`);
    if (!confirm(`Delete empty topic “${topic.topic_name}”?`)) return;

    try {
        const { error } = await requireSupabase().from('game_question_topics')
            .delete().eq('topic_id', topic.topic_id).eq('school_year_id', game1YearId());
        if (error) throw error;
        localStorage.removeItem(game1TopicStorageKey());
        await loadGame1Topics();
        await loadCustomQuestions();
        showToast('Topic deleted.');
    } catch (error) {
        console.error('[delete Game 1 topic]', error);
        showErrorToast(error.message || 'Could not delete topic.');
    }
}


async function moveGame1QuestionToTopic(questionId, topicValue) {
    const topicId = Number(topicValue);
    const topic = game1Topics.find(t => Number(t.topic_id) === topicId);
    if (!questionId || !topic) return;
    try {
        const { error } = await requireSupabase().from('custom_question').update({
            topic_id: topicId,
            topic: topic.topic_name,
            question_set: topic.topic_name
        }).eq('question_id', Number(questionId)).eq('school_year_id', game1YearId()).eq('game_module', 'W1');
        if (error) throw error;
        const current = selectedGame1TopicValue();
        await loadGame1Topics({ preferredValue: current });
        await loadCustomQuestions();
        showToast(`Question moved to “${topic.topic_name}”.`);
    } catch (error) {
        console.error('[move Game 1 question]', error);
        showErrorToast(error.message || 'Could not move question.');
    }
}

async function saveGame1LaunchTopic() {
    const topicId = getLaunchGame1TopicId();
    if (!topicId) {
        updateGame1TopicSummary();
        return;
    }
    const value = String(topicId);
    localStorage.setItem(game1TopicStorageKey(), value);
    syncGame1TopicSelectors(value, 'launch-game1-topic');
    updateGame1TopicSummary();
}

function showGame1TopicQuickLaunch(path) {
    const box = document.getElementById('game1-topic-quick-launch');
    if (box) box.classList.toggle('hidden', typeof getModuleFromPath === 'function' && getModuleFromPath(path) !== 'W1');
}


function onQuestionModuleChanged(module) {
    const isGame1 = String(module || 'W1') === 'W1';
    document.getElementById('game1-topic-panel')?.classList.toggle('hidden', !isGame1);
    document.getElementById('game1-ai-panel')?.classList.toggle('hidden', !isGame1);
    document.getElementById('cq-topic-wrap')?.classList.toggle('hidden', !isGame1);
    if (typeof cancelEdit === 'function') cancelEdit();
    if (isGame1) {
        loadGame1Topics().then(() => loadCustomQuestions());
    } else if (typeof loadCustomQuestions === 'function') {
        loadCustomQuestions();
    }
}

function openGame1QuestionBank() {
    switchTab('content');
    const module = document.getElementById('cq-module');
    if (module) module.value = 'W1';
    loadGame1Topics().then(() => loadCustomQuestions());
    if (typeof senseRefreshLessons === 'function') senseRefreshLessons();
}

// Compatibility aliases for the previous Question Set implementation.
async function loadSenseQuestionSets() { await loadGame1Topics(); if (typeof loadCustomQuestions === 'function') await loadCustomQuestions(); }
function saveSenseQuestionSet() { return saveGame1LaunchTopic(); }
function showSenseQuickLaunch(path) { return showGame1TopicQuickLaunch(path); }

window.addEventListener('DOMContentLoaded', () => {
    loadGame1Topics().catch(error => console.warn('[Game 1 topic boot]', error));
});
