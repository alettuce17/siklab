/* Teacher-reviewed AI drafts for Tug of Knowledge (5 answers / A–E controller colors). */
let tugAiDrafts = [];
let tugAiSourceInfo = null;
const tugAiEl = id => document.getElementById(id);
const tugAiEscape = value => typeof escapeHtml === 'function' ? escapeHtml(String(value ?? ''))
    : String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function tugAiStatus(message, tone = '') {
    const el = tugAiEl('tug-ai-status');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('text-slate-600', 'text-red-700', 'text-emerald-700');
    el.classList.add(tone === 'error' ? 'text-red-700' : tone === 'success' ? 'text-emerald-700' : 'text-slate-600');
}

function tugAiNormalizeQuestions(data, topicName = '') {
    const rows = Array.isArray(data?.questions) ? data.questions : Array.isArray(data?.drafts) ? data.drafts : [];
    const rejected = { choices: 0, duplicate: 0, answer: 0, prompt: 0 };
    const drafts = rows.map(q => {
        const raw = q.answer_options ?? q.options;
        const options = Array.isArray(raw) ? raw : raw && typeof raw === 'object'
            ? 'ABCDE'.split('').map(letter => raw[letter] ?? raw[letter.toLowerCase()]) : [];
        const paddedOptions = options.length === 4 ? [...options, ''] : options;
        const answer = q.correct_ans ?? q.correct_answer;
        const correct = typeof answer === 'string' && /^[A-E]$/i.test(answer.trim())
            ? 'ABCDE'.indexOf(answer.trim().toUpperCase()) : Number(answer);
        return {
            include:true,
            prompt:String(q.prompt ?? q.question ?? '').trim().slice(0,350),
            answer_options:paddedOptions.map(v => String(v ?? '').trim().slice(0,55)),
            correct_ans:correct,
            explanation:String(q.explanation ?? '').trim().slice(0,500),
            topic:String(q.topic || topicName).trim().slice(0,160),
            source_page:String(q.source_page || '').trim().slice(0,15)
        };
    }).filter(q => {
        if (!q.prompt) { rejected.prompt++; return false; }
        if (q.answer_options.length !== 5 || q.answer_options.slice(0,4).some(v => !v)) { rejected.choices++; return false; }
        const filled = q.answer_options.filter(Boolean).map(v => v.toLocaleLowerCase());
        if (new Set(filled).size !== filled.length) { rejected.duplicate++; return false; }
        if (!Number.isInteger(q.correct_ans) || q.correct_ans < 0 || q.correct_ans > 4) { rejected.answer++; return false; }
        return true;
    });
    return { drafts, received: rows.length, rejected };
}

function tugAiEmptyReason(result, version) {
    if (!result.received) return `The AI function returned no questions${version ? ` (version ${version})` : ''}. Deploy the updated ai-game-questions function, then try again.`;
    const {choices, duplicate, answer, prompt} = result.rejected;
    return `The AI returned ${result.received} draft(s), but none had five valid answers (wrong/missing choices: ${choices}; repeated choices: ${duplicate}; invalid correct answer: ${answer}; missing question: ${prompt}). Deploy the updated AI function if this keeps happening.`;
}

function tugAiChangeSource() {
    const source = tugAiEl('tug-ai-source')?.value || 'topic';
    tugAiEl('tug-ai-topic-wrap')?.classList.toggle('hidden', source !== 'topic');
    tugAiEl('tug-ai-lesson-wrap')?.classList.toggle('hidden', source !== 'lesson');
    tugAiEl('tug-ai-file-wrap')?.classList.toggle('hidden', source !== 'pdf' && source !== 'pptx');
    const file = tugAiEl('tug-ai-file');
    if (file) { file.value = ''; file.accept = source === 'pdf' ? '.pdf,application/pdf'
        : '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation'; }
    if (source === 'lesson') tugAiRefreshLessons();
    tugAiStatus('Generate a new draft for the selected source. Drafts are saved only after your review.');
}

async function tugAiRefreshLessons() {
    const select = tugAiEl('tug-ai-lesson');
    const yearId = Number(window.currentSchoolYearId || 0);
    if (!select) return;
    const previous = select.value;
    select.replaceChildren(new Option('Loading lessons…', ''));
    if (!yearId) { select.replaceChildren(new Option('Select a school year first', '')); return; }
    try {
        const { data, error } = await requireSupabase().from('lesson_modules')
            .select('module_id,title,week_id,is_published').eq('school_year_id', yearId)
            .order('week_id', { ascending: true });
        if (error) throw error;
        if (Number(window.currentSchoolYearId || 0) !== yearId) return;
        select.replaceChildren(new Option('Select an existing lesson', ''),
            ...(data || []).map(row => new Option(`${row.title || `Lesson ${row.week_id}`}${row.is_published === false ? ' (Draft)' : ''}`, String(row.module_id))));
        if ([...select.options].some(option => option.value === previous)) select.value = previous;
    } catch (error) {
        console.error('[Tug AI lessons]', error);
        select.replaceChildren(new Option('Lessons unavailable', ''));
        tugAiStatus(error.message || 'Could not load lessons.', 'error');
    }
}

async function tugAiGenerate() {
    const yearId = Number(window.currentSchoolYearId || 0);
    if (!yearId) return showErrorToast('Select a school year first.');
    const source = tugAiEl('tug-ai-source')?.value || 'topic';
    const difficulty = tugAiEl('tug-ai-difficulty')?.value || 'medium';
    const count = Number(tugAiEl('tug-ai-count')?.value || 10);
    const selectedTopic = getSelectedTugTopic();
    if (!selectedTopic) return showErrorToast('Choose or add a Tug topic in the sidebar first.');
    const body = { game_module:'TUG', school_year_id:yearId,
        source_type:source, difficulty, question_count:count,
        focus:tugAiEl('tug-ai-focus')?.value.trim().slice(0,160) || '' };
    const button = tugAiEl('tug-ai-generate-btn');
    try {
        if (!['easy','medium','hard'].includes(difficulty) || ![5,10,15].includes(count)) throw new Error('Choose a valid difficulty and question count.');
        if (source === 'topic') {
            body.topic = tugAiEl('tug-ai-topic')?.value.trim().slice(0,160) || '';
            if (body.topic.length < 3) throw new Error('Enter a science topic first.');
        } else if (source === 'lesson') {
            body.lesson_module_id = Number(tugAiEl('tug-ai-lesson')?.value || 0);
            if (!body.lesson_module_id) throw new Error('Select a saved lesson first.');
        } else if (source === 'pdf' || source === 'pptx') {
            const file = tugAiEl('tug-ai-file')?.files?.[0];
            if (!file) throw new Error('Choose a reference file first.');
            body[source === 'pdf' ? 'pdf_base64' : 'pptx_base64'] = await siklabReferenceBase64(file, source);
            body.filename = file.name.slice(0,140);
        } else throw new Error('Choose a question source.');
        if (button) { button.disabled = true; button.textContent = 'Generating…'; }
        tugAiStatus('Creating a five-answer draft…');
        const { data, error } = await requireSupabase().functions.invoke('ai-game-questions', { body });
        if (error || data?.error) throw new Error(data?.error || error?.message || 'AI generation failed.');
        if (data?.game_module !== 'TUG') throw new Error('The deployed ai-game-questions function needs the Tug update. Deploy the function included in this ZIP.');
        const normalized = tugAiNormalizeQuestions(data, body.topic || selectedTopic.topic_name);
        const drafts = normalized.drafts;
        if (!drafts.length) throw new Error(tugAiEmptyReason(normalized, data?.version));
        if (Number(window.currentSchoolYearId || 0) !== yearId) throw new Error('School year changed during generation. Generate again.');
        tugAiDrafts = drafts;
        tugAiSourceInfo = { yearId, topicId:Number(selectedTopic.topic_id), topicName:selectedTopic.topic_name, source, difficulty, sourceLabel: source === 'topic' ? body.topic
            : source === 'lesson' ? tugAiEl('tug-ai-lesson')?.selectedOptions?.[0]?.textContent || 'Saved lesson' : body.filename,
            lessonId: source === 'lesson' ? body.lesson_module_id : null };
        tugAiRender();
        const missing = drafts.filter(q => !q.answer_options[4]).length;
        tugAiStatus(missing
            ? `Generated ${drafts.length} editable drafts. The AI returned only four answers for ${missing}; add answer E before saving. Deploy the updated AI function to generate all five automatically.`
            : `Generated ${drafts.length} draft questions. Edit and approve them before saving.`, missing ? 'error' : 'success');
    } catch (error) {
        console.error('[Tug AI]', error);
        tugAiStatus(error.message || 'Could not generate questions.', 'error');
        showErrorToast(error.message || 'Could not generate Tug questions.');
    } finally {
        if (button) { button.disabled = false; button.textContent = 'Generate editable draft'; }
    }
}

function tugAiUpdate(index, field, value) {
    const q = tugAiDrafts[index];
    if (q && ['prompt','explanation'].includes(field)) q[field] = String(value || '').slice(0, field === 'prompt' ? 350 : 500);
}
function tugAiOption(index, option, value) {
    if (tugAiDrafts[index]) tugAiDrafts[index].answer_options[option] = String(value || '').slice(0,55);
    if (option === 4) {
        const filled = !!String(value || '').trim();
        tugAiEl(`tug-missing-answer-${index}`)?.classList.toggle('hidden', filled);
        const label = tugAiEl(`tug-answer-e-${index}`);
        label?.classList.toggle('border-amber-400', !filled);
        label?.classList.toggle('bg-amber-50', !filled);
    }
    tugAiSaveCount();
}
function tugAiInclude(index, checked) {
    if (tugAiDrafts[index]) tugAiDrafts[index].include = !!checked;
    tugAiSaveCount();
}
function tugAiCorrect(index, correct) {
    if (tugAiDrafts[index]) tugAiDrafts[index].correct_ans = correct;
}
function tugAiRemove(index) {
    tugAiDrafts.splice(index,1);
    tugAiRender();
}
function tugAiSaveCount() {
    const button = tugAiEl('tug-ai-save-btn');
    if (!button) return;
    const count = tugAiDrafts.filter(q => q.include).length;
    const incomplete = tugAiDrafts.filter(q => q.include && (q.answer_options.length !== 5 || q.answer_options.some(v => !v))).length;
    button.textContent = incomplete ? `Complete missing answers (${incomplete} left)` : `Save ${count} approved question${count === 1 ? '' : 's'}`;
    button.disabled = !count || !!incomplete;
    if (!incomplete && tugAiEl('tug-ai-status')?.textContent.includes('AI returned only four answers'))
        tugAiStatus('All selected drafts now have five answers. Review and save them.', 'success');
}
function tugAiRender() {
    const host = tugAiEl('tug-ai-drafts');
    if (!host) return;
    if (!tugAiDrafts.length) { host.innerHTML = ''; return; }
    host.innerHTML = `<div class="flex flex-wrap justify-between items-center gap-2 mb-3"><div><h4 class="font-black text-slate-800">Review AI Draft</h4><p class="text-xs text-slate-500">Uncheck or remove unwanted questions. Changes are saved only when you approve.</p></div><button id="tug-ai-save-btn" type="button" onclick="tugAiSave()" class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black disabled:opacity-50"></button></div>` +
        tugAiDrafts.map((q,i) => `<article class="rounded-2xl border border-orange-200 bg-white p-4 mb-3 shadow-sm">
            <div class="flex flex-wrap justify-between items-center gap-2 mb-3"><label class="flex items-center gap-2 font-black"><input type="checkbox" ${q.include ? 'checked' : ''} onchange="tugAiInclude(${i},this.checked)">Question ${i+1}</label><div class="flex items-center gap-2"><span class="text-xs text-slate-500">${tugAiEscape(q.source_page ? `${tugAiSourceInfo?.source === 'pptx' ? 'Slide' : 'Page'} ${q.source_page}` : '')}</span><button type="button" onclick="tugAiRemove(${i})" class="px-2 py-1 rounded-lg bg-red-50 text-red-600" aria-label="Remove question ${i+1}">Remove</button></div></div>
            <label class="block text-xs font-black text-slate-600 mb-1">Question<textarea rows="2" maxlength="350" oninput="tugAiUpdate(${i},'prompt',this.value)" class="block w-full mt-1 px-3 py-2 rounded-xl border-2 border-slate-200 font-bold">${tugAiEscape(q.prompt)}</textarea></label>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 my-3">${q.answer_options.map((option, oi) => `<label ${oi === 4 ? `id="tug-answer-e-${i}"` : ''} class="flex items-center gap-2 rounded-xl border ${oi === 4 && !option ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-slate-50'} p-2"><input type="radio" name="tug-correct-${i}" ${oi === q.correct_ans ? 'checked' : ''} onchange="tugAiCorrect(${i},${oi})" aria-label="Correct answer ${'ABCDE'[oi]}"><span class="text-xs font-black text-orange-700"><b class="controller-chip controller-chip-${oi}">${'ABCDE'[oi]}</b> ${['Red','Green','White','Blue','Yellow'][oi]}</span><input value="${tugAiEscape(option)}" maxlength="55" placeholder="${oi === 4 ? 'Enter fifth answer' : ''}" oninput="tugAiOption(${i},${oi},this.value)" class="min-w-0 flex-1 px-2 py-1.5 rounded-lg border border-slate-200 bg-white" aria-label="Answer ${'ABCDE'[oi]}"></label>`).join('')}</div>
            <p id="tug-missing-answer-${i}" class="${q.answer_options[4] ? 'hidden ' : ''}text-xs font-bold text-amber-800 mb-2" role="status">The AI supplied four answers. Enter answer E (yellow) before saving this question.</p>
            <label class="block text-xs font-black text-slate-600">Explanation<textarea rows="2" maxlength="500" oninput="tugAiUpdate(${i},'explanation',this.value)" class="block w-full mt-1 px-3 py-2 rounded-xl border border-slate-200">${tugAiEscape(q.explanation)}</textarea></label>
        </article>`).join('');
    tugAiSaveCount();
}

async function tugAiSave() {
    const info = tugAiSourceInfo;
    const yearId = Number(window.currentSchoolYearId || 0);
    if (!info || !yearId || yearId !== info.yearId || tugAiEl('cq-module')?.value !== 'TUG') {
        return showErrorToast('School year or game changed. Switch back to the original year and Game 3, or generate a new draft.');
    }
    const selectedTopic = getSelectedTugTopic();
    if (!selectedTopic || Number(selectedTopic.topic_id) !== info.topicId) return showErrorToast('Topic changed. Select the original Tug topic or generate again.');
    const chosen = tugAiDrafts.filter(q => q.include);
    if (!chosen.length) return showErrorToast('Select at least one question.');
    const rows = [];
    for (const [index,q] of chosen.entries()) {
        const prompt = q.prompt.trim();
        const options = q.answer_options.map(v => v.trim());
        if (!prompt || prompt.length > 350) return showErrorToast(`Question ${index+1} needs a valid prompt.`);
        if (options.length !== 5 || options.some(v => !v) || new Set(options.map(v => v.toLowerCase())).size !== 5)
            return showErrorToast(`Question ${index+1} needs five distinct answers.`);
        if (!Number.isInteger(q.correct_ans) || q.correct_ans < 0 || q.correct_ans > 4)
            return showErrorToast(`Question ${index+1} needs one correct answer.`);
        rows.push({school_year_id:yearId, game_module:'TUG', prompt, answer_options:options,
            correct_ans:q.correct_ans, explanation:q.explanation.trim() || null,
            topic:info.topicName, question_set:info.topicName,
            topic_id:info.topicId, time_limit:20, image_url:null,
            difficulty:info.difficulty, question_type:'mc', review_status:'approved', ai_generated:true,
            source_type:info.source, source_label:String(info.sourceLabel || '').slice(0,150) || null,
            lesson_module_id:info.lessonId});
    }
    if (!confirm(`Save ${rows.length} reviewed Tug question${rows.length === 1 ? '' : 's'} to this school year?`)) return;
    const button = tugAiEl('tug-ai-save-btn');
    try {
        if (button) { button.disabled = true; button.textContent = 'Saving…'; }
        const { error } = await requireSupabase().from('custom_question').insert(rows);
        if (error) throw error;
        tugAiDrafts = []; tugAiSourceInfo = null; tugAiRender();
        await loadTugTopics({preferredValue:String(info.topicId)});
        if (typeof loadCustomQuestions === 'function') await loadCustomQuestions();
        tugAiStatus(`Saved ${rows.length} approved Tug questions.`, 'success');
        showToast(`${rows.length} Tug of Knowledge questions saved!`);
    } catch (error) {
        console.error('[Tug AI save]', error);
        tugAiStatus(error.message || 'Could not save Tug questions.', 'error');
        showErrorToast(error.message || 'Could not save questions.');
        if (button) tugAiSaveCount();
    }
}
