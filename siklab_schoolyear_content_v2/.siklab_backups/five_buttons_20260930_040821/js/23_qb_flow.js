/* Question Bank: game first, topic second, questions and AI after. */
function qbUpdateTopicShortcut() {
    const module = document.getElementById('cq-module')?.value || 'W1';
    const quick = document.getElementById('qb-topic-select');
    if (!quick) return;
    const source = module === 'W1' ? {rows:game1Topics, selected:document.getElementById('game1-topic-select')?.value, counts:game1TopicCounts}
        : module === 'NOVA' ? {rows:novaTopics, selected:document.getElementById('nova-topic-select')?.value, counts:novaTopicCounts}
        : module === 'TUG' ? {rows:tugTopics, selected:document.getElementById('tug-topic-select')?.value, counts:tugTopicCounts} : null;
    if (!source) { quick.replaceChildren(new Option('No topics for this game', '')); return; }
    const chosen = String(source.selected || '');
    const options = [new Option(source.rows.length ? 'Choose a topic…' : 'No topics yet — create one below', '')];
    for (const row of source.rows) {
        const count = source.counts?.get(Number(row.topic_id)) || 0;
        options.push(new Option(`${row.topic_name} (${count})`, String(row.topic_id)));
    }
    if (module === 'W1' && (source.counts?.get('unassigned') || 0) > 0)
        options.push(new Option('Unassigned Questions', 'unassigned'));
    quick.replaceChildren(...options);
    quick.value = options.some(option => option.value === chosen) ? chosen : '';
    const next = document.getElementById('qb-continue-questions');
    if (next) next.disabled = !quick.value || quick.value === 'unassigned';
}
async function qbChooseTopic(value) {
    const module = document.getElementById('cq-module')?.value;
    if (module === 'W1') await selectGame1Topic(value, 'qb-topic-select');
    else if (module === 'NOVA') await selectNovaTopic(value, 'qb-topic-select');
    else if (module === 'TUG') await selectTugTopic(value);
    qbUpdateTopicShortcut();
}
