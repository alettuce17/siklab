/* School-year topic library for Tug of Knowledge. */
let tugTopics = [];
let tugTopicCounts = new Map();
let tugTopicLoadSerial = 0;
const tugTopicYear = () => Number(window.currentSchoolYearId || 0);
const tugTopicKey = () => `siklab_tug_topic_${tugTopicYear()}`;
const tugEl = id => document.getElementById(id);
const getSelectedTugTopic = () => tugTopics.find(t => String(t.topic_id) === String(tugEl('tug-topic-select')?.value || '')) || null;
const getLaunchTugTopicId = () => Number(tugEl('launch-tug-topic')?.value || 0) || null;
function tugTopicName(id) { return tugTopics.find(t => Number(t.topic_id) === Number(id))?.topic_name || ''; }
function tugTopicSummary() {
    const selected = getSelectedTugTopic();
    const title = tugEl('tug-selected-topic-name');
    const count = tugEl('tug-selected-topic-count');
    const label = tugEl('question-bank-topic-label');
    const name = selected?.topic_name || 'Choose a Tug topic';
    if (title) title.textContent = name;
    if (count) count.textContent = `${tugTopicCounts.get(Number(selected?.topic_id)) || 0} approved questions`;
    if (label && tugEl('cq-module')?.value === 'TUG') label.textContent = name;
    const launchId = getLaunchTugTopicId();
    const launchCount = tugEl('tug-question-count');
    if (launchCount) launchCount.textContent = launchId
        ? `${tugTopicCounts.get(launchId) || 0} approved questions in this topic.`
        : 'Choose a topic before launching.';
    const aiLabel = tugEl('tug-ai-selected-topic');
    if (aiLabel) aiLabel.textContent = selected ? `Saving to: ${name}` : 'Create or choose a Tug topic first.';
    const aiTopic = tugEl('tug-ai-topic');
    if (selected && aiTopic && (!aiTopic.value.trim() || aiTopic.dataset.autoTopic === '1')) {
        aiTopic.value = name;
        aiTopic.dataset.autoTopic = '1';
    }
}
function tugBuildOptions(selected = '') {
    for (const id of ['tug-topic-select', 'cq-tug-topic-id', 'launch-tug-topic']) {
        const select = tugEl(id);
        if (!select) continue;
        select.replaceChildren(new Option('Choose a topic…', ''), ...tugTopics.map(t =>
            new Option(`${t.topic_name} (${tugTopicCounts.get(Number(t.topic_id)) || 0})`, String(t.topic_id))));
        select.value = tugTopics.some(t => String(t.topic_id) === String(selected)) ? String(selected) : '';
    }
    tugTopicSummary();
}
async function loadTugTopics({preferredValue} = {}) {
    const year = tugTopicYear(), serial = ++tugTopicLoadSerial;
    const previous = preferredValue || localStorage.getItem(tugTopicKey()) || tugEl('tug-topic-select')?.value || '';
    if (!year) { tugTopics = []; tugTopicCounts = new Map(); tugBuildOptions(); return; }
    try {
        const db = requireSupabase();
        const [topicResult, countResult] = await Promise.all([
            db.from('game_question_topics').select('topic_id,school_year_id,game_module,topic_name,description,is_active')
                .eq('school_year_id', year).eq('game_module', 'TUG').eq('is_active', true).order('topic_name'),
            db.from('custom_question').select('topic_id').eq('school_year_id', year)
                .eq('game_module', 'TUG').eq('review_status', 'approved')
        ]);
        if (topicResult.error) throw topicResult.error;
        if (countResult.error) throw countResult.error;
        if (serial !== tugTopicLoadSerial || year !== tugTopicYear()) return;
        tugTopics = topicResult.data || [];
        tugTopicCounts = new Map();
        for (const row of countResult.data || []) if (row.topic_id != null) {
            const id = Number(row.topic_id);
            tugTopicCounts.set(id, (tugTopicCounts.get(id) || 0) + 1);
        }
        const selected = tugTopics.some(t => String(t.topic_id) === String(previous)) ? String(previous)
            : tugTopics[0] ? String(tugTopics[0].topic_id) : '';
        tugBuildOptions(selected);
        if (selected) localStorage.setItem(tugTopicKey(), selected);
        else localStorage.removeItem(tugTopicKey());
    } catch (error) {
        if (serial !== tugTopicLoadSerial) return;
        tugTopics = []; tugTopicCounts = new Map(); tugBuildOptions();
        console.error('[Tug topics]', error);
        showErrorToast(`Tug topics unavailable: ${error.message || 'run migration 011_tug_topics.sql'}`);
    }
}
async function selectTugTopic(value) {
    if (!tugTopicYear()) return showErrorToast('Select a school year first.');
    const id = String(value || '');
    for (const key of ['tug-topic-select', 'cq-tug-topic-id', 'launch-tug-topic']) {
        const select = tugEl(key);
        if (select && [...select.options].some(o => o.value === id)) select.value = id;
    }
    if (id) localStorage.setItem(tugTopicKey(), id);
    else localStorage.removeItem(tugTopicKey());
    tugTopicSummary();
    if (tugEl('cq-module')?.value === 'TUG') await loadCustomQuestions();
}
function saveTugLaunchTopic() {
    const id = tugEl('launch-tug-topic')?.value || '';
    if (id) localStorage.setItem(tugTopicKey(), id);
    tugTopicSummary();
}
async function createTugTopic() {
    const input = tugEl('tug-new-topic-name');
    const name = input?.value.trim().replace(/\s+/g, ' ').slice(0,80) || '';
    const description = tugEl('tug-new-topic-description')?.value.trim().slice(0,220) || null;
    if (!tugTopicYear()) return showErrorToast('Select a school year first.');
    if (name.length < 2) return showErrorToast('Enter a topic name.');
    try {
        const { data, error } = await requireSupabase().from('game_question_topics').insert({
            school_year_id:tugTopicYear(), game_module:'TUG', topic_name:name, description,
            icon:'🧋', is_active:true
        }).select('topic_id').single();
        if (error) throw error;
        input.value = '';
        tugEl('tug-new-topic-description').value = '';
        await loadTugTopics({preferredValue:String(data.topic_id)});
        await selectTugTopic(String(data.topic_id));
        showToast(`Tug topic “${name}” created.`);
    } catch (error) { showErrorToast(error.message || 'Could not create Tug topic.'); }
}
async function renameTugTopic() {
    const current = getSelectedTugTopic();
    if (!current) return showErrorToast('Choose a Tug topic first.');
    const entered = prompt('Rename Tug topic:', current.topic_name);
    if (entered === null) return;
    const name = entered.trim().replace(/\s+/g,' ').slice(0,80);
    if (name.length < 2) return showErrorToast('Enter a longer topic name.');
    try {
        const db = requireSupabase(), year = tugTopicYear();
        const {error} = await db.from('game_question_topics').update({topic_name:name,updated_at:new Date().toISOString()})
            .eq('topic_id',current.topic_id).eq('school_year_id',year).eq('game_module','TUG');
        if (error) throw error;
        const {error:questionError} = await db.from('custom_question').update({topic:name,question_set:name})
            .eq('school_year_id',year).eq('game_module','TUG').eq('topic_id',current.topic_id);
        if (questionError) throw questionError;
        await loadTugTopics({preferredValue:String(current.topic_id)});
        await loadCustomQuestions();
        showToast('Tug topic renamed.');
    } catch (error) { showErrorToast(error.message || 'Could not rename Tug topic.'); }
}
async function deleteTugTopic() {
    const current = getSelectedTugTopic();
    if (!current) return showErrorToast('Choose a Tug topic first.');
    const {count,error:countError} = await requireSupabase().from('custom_question')
        .select('question_id',{count:'exact',head:true}).eq('school_year_id',tugTopicYear())
        .eq('game_module','TUG').eq('topic_id',current.topic_id);
    if (countError) return showErrorToast(countError.message);
    if (count) return showErrorToast(`Move or delete the ${count} questions in this topic first.`);
    if (!confirm(`Delete empty Tug topic “${current.topic_name}”?`)) return;
    try {
        const {error} = await requireSupabase().from('game_question_topics').delete()
            .eq('topic_id',current.topic_id).eq('school_year_id',tugTopicYear()).eq('game_module','TUG');
        if (error) throw error;
        localStorage.removeItem(tugTopicKey());
        await loadTugTopics();
        await loadCustomQuestions();
        showToast('Tug topic deleted.');
    } catch (error) { showErrorToast(error.message || 'Could not delete Tug topic.'); }
}
