/* A compact, topic-centered question bank for all three topic games. */
function qbTopicSource() {
    const module = document.getElementById('cq-module')?.value || 'W1';
    if (module === 'W1') return { module, rows: game1Topics, counts: game1TopicCounts, selected: document.getElementById('game1-topic-select')?.value || '' };
    if (module === 'NOVA') return { module, rows: novaTopics, counts: novaTopicCounts, selected: document.getElementById('nova-topic-select')?.value || '' };
    if (module === 'TUG') return { module, rows: tugTopics, counts: tugTopicCounts, selected: document.getElementById('tug-topic-select')?.value || '' };
    return null;
}

function qbUpdateTopicShortcut() {
    const list = document.getElementById('qb-topic-list');
    if (!list) return;
    const source = qbTopicSource();
    list.replaceChildren();
    if (!source) {
        const add = document.getElementById('qb-add-question');
        if (add) add.disabled = false;
        return;
    }
    const query = (document.getElementById('qb-topic-search')?.value || '').trim().toLocaleLowerCase();
    const rows = source.rows.filter(row => row.topic_name.toLocaleLowerCase().includes(query));
    const total = document.getElementById('qb-topic-total');
    if (total) total.textContent = `${source.rows.length} topic${source.rows.length === 1 ? '' : 's'} · choose one to view questions`;
    const editorTopic = document.getElementById('qb-editor-topic');
    if (editorTopic) editorTopic.textContent = source.rows.find(row => String(row.topic_id) === source.selected)?.topic_name || 'Choose a topic';
    const entries = rows.map(topic => ({ value: String(topic.topic_id), name: topic.topic_name, count: source.counts.get(Number(topic.topic_id)) || 0, title: topic.description || topic.topic_name }));
    if (source.module === 'W1' && (source.counts.get('unassigned') || 0) > 0 && 'unassigned questions'.includes(query))
        entries.push({ value: 'unassigned', name: 'Unassigned Questions', count: source.counts.get('unassigned'), title: 'Older questions without a topic' });
    for (const entry of entries) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'qb-topic-row';
        item.setAttribute('role', 'listitem');
        item.setAttribute('aria-pressed', String(source.selected === entry.value));
        item.title = entry.title;
        const label = document.createElement('span');
        label.className = 'qb-topic-row-name';
        label.textContent = entry.name;
        const badge = document.createElement('span');
        badge.className = 'qb-topic-count';
        badge.textContent = String(entry.count);
        item.append(label, badge);
        item.onclick = () => qbChooseTopic(entry.value);
        list.append(item);
    }
    if (!entries.length) {
        const empty = document.createElement('p');
        empty.className = 'text-xs text-slate-500 p-3';
        empty.textContent = query ? 'No matching topics.' : 'No topics yet. Add one to start your question bank.';
        list.append(empty);
    }
    document.getElementById('qb-topic-actions')?.classList.toggle('hidden', !source.rows.some(row => String(row.topic_id) === source.selected));
    const add = document.getElementById('qb-add-question');
    if (add) add.disabled = !source.rows.some(row => String(row.topic_id) === source.selected);
}

async function qbChooseTopic(value) {
    const module = document.getElementById('cq-module')?.value;
    qbHideEditor();
    if (module === 'W1') await selectGame1Topic(value);
    else if (module === 'NOVA') await selectNovaTopic(value);
    else if (module === 'TUG') await selectTugTopic(value);
    qbUpdateTopicShortcut();
    qbSetPanel('questions');
}

function qbToggleCreateTopic(force) {
    const form = document.getElementById('qb-create-topic');
    if (!form) return;
    const show = typeof force === 'boolean' ? force : form.classList.contains('hidden');
    if (show && form.classList.contains('hidden') && !form.dataset.editId) {
        document.getElementById('qb-new-topic-name').value = '';
        document.getElementById('qb-new-topic-description').value = '';
        document.getElementById('qb-save-topic-label').textContent = 'Save topic';
    }
    if (!show) delete form.dataset.editId;
    form.classList.toggle('hidden', !show);
    if (show) document.getElementById('qb-new-topic-name')?.focus();
}

function qbEditTopic() {
    const source = qbTopicSource();
    const topic = source?.rows.find(row => String(row.topic_id) === source.selected);
    if (!topic) return;
    const form = document.getElementById('qb-create-topic');
    form.dataset.editId = String(topic.topic_id);
    document.getElementById('qb-new-topic-name').value = topic.topic_name;
    document.getElementById('qb-new-topic-description').value = topic.description || '';
    document.getElementById('qb-save-topic-label').textContent = 'Save changes';
    qbToggleCreateTopic(true);
}

async function qbSaveTopic() {
    const id = document.getElementById('qb-create-topic')?.dataset.editId;
    if (!id) return qbCreateTopic();
    const source = qbTopicSource();
    const name = document.getElementById('qb-new-topic-name')?.value.trim().replace(/\s+/g, ' ').slice(0, 80) || '';
    const description = document.getElementById('qb-new-topic-description')?.value.trim().slice(0, 220) || null;
    if (name.length < 2) return showErrorToast('Enter a topic name of at least two characters.');
    const year = questionBankYearId();
    if (!year || !source?.rows.some(row => String(row.topic_id) === id)) return showErrorToast('Select a topic and school year first.');
    try {
        const db = requireSupabase();
        const {error} = await db.from('game_question_topics').update({
            topic_name: name, description, updated_at: new Date().toISOString()
        }).eq('topic_id', Number(id)).eq('school_year_id', year).eq('game_module', source.module);
        if (error) throw error;
        const {error: questionError} = await db.from('custom_question').update({topic:name,question_set:name})
            .eq('school_year_id', year).eq('game_module', source.module).eq('topic_id', Number(id));
        if (questionError) throw questionError;
        if (source.module === 'W1') await loadGame1Topics({preferredValue:id});
        else if (source.module === 'NOVA') await loadNovaTopics({preferredValue:id});
        else await loadTugTopics({preferredValue:id});
        await loadCustomQuestions();
        document.getElementById('qb-topic-search').value = '';
        qbUpdateTopicShortcut();
        qbToggleCreateTopic(false);
        showToast('Topic updated.');
    } catch (error) { showErrorToast(error.message || 'Could not update topic.'); }
}

async function qbCreateTopic() {
    const source = qbTopicSource();
    if (!source) return;
    const prefix = source.module === 'W1' ? 'game1' : source.module === 'NOVA' ? 'nova' : 'tug';
    document.getElementById(`${prefix}-new-topic-name`).value = document.getElementById('qb-new-topic-name').value;
    document.getElementById(`${prefix}-new-topic-description`).value = document.getElementById('qb-new-topic-description').value;
    const before = source.rows.length;
    if (source.module === 'W1') await createGame1Topic();
    else if (source.module === 'NOVA') await createNovaTopic();
    else await createTugTopic();
    if (qbTopicSource()?.rows.length > before) {
        document.getElementById('qb-new-topic-name').value = '';
        document.getElementById('qb-new-topic-description').value = '';
        document.getElementById('qb-topic-search').value = '';
        qbUpdateTopicShortcut();
        qbToggleCreateTopic(false);
        qbSetPanel('questions');
    }
}

async function qbDeleteTopic() {
    const module = qbTopicSource()?.module;
    if (module === 'W1') await deleteGame1Topic();
    else if (module === 'NOVA') await deleteNovaTopic();
    else if (module === 'TUG') await deleteTugTopic();
}

function qbShowEditor() {
    const module = document.getElementById('cq-module')?.value;
    if (['W1','NOVA','TUG'].includes(module) && !selectedTopicForModule(module)) {
        showErrorToast('Choose a topic first.'); return;
    }
    document.getElementById('qb-question-editor')?.classList.remove('hidden');
    document.getElementById('qb-question-list-view')?.classList.add('hidden');
    document.getElementById('btn-cancel-edit')?.classList.remove('hidden');
    document.getElementById('btn-save-cq')?.classList.replace('w-full', 'w-2/3');
    document.getElementById('qb-question-editor')?.scrollIntoView({block:'nearest',behavior:'smooth'});
    document.getElementById('cq-prompt')?.focus({preventScroll:true});
}

function qbHideEditor() {
    document.getElementById('qb-question-editor')?.classList.add('hidden');
    document.getElementById('qb-question-list-view')?.classList.remove('hidden');
}
