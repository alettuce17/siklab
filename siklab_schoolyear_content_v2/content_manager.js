/* ---------------------------------------------------------
 * SIKLAB QUESTION BANK - SCHOOL-YEAR + TOPIC SCOPED
 * Picture Challenge (W1): 5 choices / Buttons 1-5
 * Science Carnival (NOVA): 5 choices / Buttons 1-5 during questions
 * --------------------------------------------------------- */
let customQuestions = [];
const DEFAULT_QUESTIONS = { W1: [], NOVA: [], W2: [], W3: [], W4: [], W5: [], W6: [], W7: [], W8: [] };

function questionBankYearId() {
    const value = Number(window.currentSchoolYearId || (typeof currentSchoolYearId !== 'undefined' ? currentSchoolYearId : 0) || 0);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function questionModule() {
    return document.getElementById('cq-module')?.value || 'W1';
}

function selectedTopicForModule(module) {
    if (module === 'W1' && typeof getSelectedGame1Topic === 'function') return getSelectedGame1Topic();
    if (module === 'NOVA' && typeof getSelectedNovaTopic === 'function') return getSelectedNovaTopic();
    return null;
}

async function refreshQuestionTopicState(module) {
    if (module === 'W1' && typeof loadGame1Topics === 'function') await loadGame1Topics();
    if (module === 'NOVA' && typeof loadNovaTopics === 'function') await loadNovaTopics();
}

async function loadCustomQuestions() {
    const module = questionModule();
    const yearId = questionBankYearId();
    const yearLabel = document.getElementById('question-bank-year-label');
    if (yearLabel) yearLabel.textContent = window.currentSchoolYearLabel || 'No school year';

    if (!yearId) {
        customQuestions = [];
        renderQuestionsList();
        return;
    }

    try {
        const db = requireSupabase();
        let query = db
            .from('custom_question')
            .select('question_id,school_year_id,game_module,topic_id,prompt,correct_ans,answer_options,time_limit,image_url,image_query,image_attribution,image_license,image_source,question_set,explanation,topic,review_status,difficulty,question_type')
            .eq('school_year_id', yearId)
            .eq('game_module', module);

        if (module === 'W1' && typeof getSelectedGame1TopicFilter === 'function') {
            const filter = getSelectedGame1TopicFilter();
            if (filter.mode === 'none') {
                customQuestions = [];
                renderQuestionsList();
                return;
            }
            query = filter.mode === 'unassigned'
                ? query.is('topic_id', null)
                : query.eq('topic_id', filter.topicId);
        }

        if (module === 'NOVA') {
            const topic = selectedTopicForModule('NOVA');
            if (!topic) {
                customQuestions = [];
                renderQuestionsList();
                return;
            }
            query = query.eq('topic_id', Number(topic.topic_id));
        }

        const { data, error } = await query.order('question_id', { ascending: true });
        if (error) throw error;

        customQuestions = (data || []).map(q => ({
            id: q.question_id,
            schoolYearId: Number(q.school_year_id),
            module: q.game_module,
            topicId: q.topic_id == null ? null : Number(q.topic_id),
            prompt: q.prompt,
            ans: Number(q.correct_ans),
            options: Array.isArray(q.answer_options) ? q.answer_options : [],
            img: q.image_url || '',
            image_query: q.image_query || '',
            image_attribution: q.image_attribution || '',
            image_license: q.image_license || '',
            image_source: q.image_source || '',
            timeLimit: Number(q.time_limit) || 10,
            set: q.question_set || 'General Questions',
            explanation: q.explanation || '',
            topic: q.topic || '',
            difficulty: q.difficulty || 'medium',
            questionType: q.question_type || 'mc'
        }));

        if (!customQuestions.length) customQuestions = DEFAULT_QUESTIONS[module] ? [...DEFAULT_QUESTIONS[module]] : [];
    } catch (error) {
        console.error('[questions load]', error);
        customQuestions = [];
        showErrorToast(error.message || 'Could not load questions from Supabase.');
    }
    renderQuestionsList();
}

function questionTopicDisplay(q, module) {
    if (module === 'W1' && q.topicId && typeof game1TopicName === 'function') return game1TopicName(q.topicId);
    if (module === 'NOVA' && q.topicId && typeof novaTopicName === 'function') return novaTopicName(q.topicId);
    return q.topic || 'Unassigned';
}

function renderQuestionsList() {
    const container = document.getElementById('questions-list-container');
    if (!container) return;
    const module = questionModule();

    if (!questionBankYearId()) {
        container.innerHTML = '<div class="text-center text-slate-400 mt-10"><p>Create or select a school year first.</p></div>';
        return;
    }

    if (module === 'W1' && typeof getSelectedGame1TopicFilter === 'function' && getSelectedGame1TopicFilter().mode === 'none') {
        container.innerHTML = '<div class="text-center text-slate-400 mt-10"><i class="fa-solid fa-layer-group text-3xl text-orange-200 mb-3"></i><p class="font-bold">Create or select a Picture Challenge topic first.</p></div>';
        return;
    }
    if (module === 'NOVA' && !selectedTopicForModule('NOVA')) {
        container.innerHTML = '<div class="text-center text-slate-400 mt-10"><i class="fa-solid fa-tents text-3xl text-orange-200 mb-3"></i><p class="font-bold">Create or select a Science Carnival topic first.</p></div>';
        return;
    }

    if (!customQuestions.length) {
        const topic = selectedTopicForModule(module);
        container.innerHTML = `<div class="text-center text-slate-400 mt-10"><p>No questions in <strong>${escapeHtml(topic?.topic_name || 'this topic')}</strong> yet.</p></div>`;
        return;
    }

    const isNova = module === 'NOVA';
    const buttonNames = ['A / BTN 1','B / BTN 2','C / BTN 3','D / BTN 4','E / BTN 5'];
    const colors = ['text-blue-600 bg-blue-100','text-orange-600 bg-orange-100','text-green-600 bg-green-100','text-purple-600 bg-purple-100','text-red-600 bg-red-100'];

    const topicOptions = module === 'W1' && typeof game1Topics !== 'undefined'
        ? game1Topics.map(t => `<option value="${Number(t.topic_id)}">${escapeHtml(t.topic_name)}</option>`).join('')
        : module === 'NOVA' && typeof novaTopics !== 'undefined'
            ? novaTopics.map(t => `<option value="${Number(t.topic_id)}">${escapeHtml(t.topic_name)}</option>`).join('')
            : '';

    container.innerHTML = customQuestions.map((q, i) => `
        <div class="flex justify-between items-center p-4 bg-white border border-slate-100 rounded-xl mb-3 shadow-sm hover:shadow-md hover:border-orange-200 transition-all group">
            <div class="flex items-center gap-4 w-full min-w-0">
                ${!isNova && q.img
                    ? `<img src="${escapeAttr(q.img)}" alt="" class="w-12 h-12 rounded object-cover border bg-slate-50 flex-shrink-0">`
                    : `<div class="w-12 h-12 rounded ${isNova ? 'bg-violet-50 text-violet-500' : 'bg-slate-100 text-slate-400'} flex items-center justify-center flex-shrink-0"><i class="fa-solid ${isNova ? 'fa-tents' : 'fa-image'}"></i></div>`}
                <div class="flex-grow pr-3 min-w-0">
                    <p class="font-bold text-slate-800 text-sm">${escapeHtml(q.prompt)}</p>
                    <div class="flex gap-2 mt-1 flex-wrap">
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded inline-block ${colors[q.ans] || 'text-slate-600 bg-slate-100'}">
                            ${escapeHtml(`${buttonNames[q.ans] || `BTN ${q.ans + 1}`}: ${(q.options || [])[q.ans] || ''}`)}
                        </span>
                        ${isNova ? `<span class="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-violet-50 text-violet-700">${escapeHtml(q.difficulty)}</span>` : ''}
                        <span class="text-[10px] font-bold text-slate-500">${escapeHtml(questionTopicDisplay(q, module))}</span>
                    </div>
                </div>
            </div>
            <div class="flex gap-2 flex-wrap items-center justify-end">
                ${q.id && topicOptions ? `<select aria-label="Move question to another topic" onchange="if(this.value){${module === 'NOVA' ? 'moveNovaQuestionToTopic' : 'moveGame1QuestionToTopic'}(${Number(q.id)},this.value);this.value='';}" class="text-xs font-bold px-2 py-2 bg-slate-50 text-slate-700 rounded-lg border border-slate-200"><option value="">Move to…</option>${topicOptions}</select>` : ''}
                ${module === 'W1' && q.id ? `<button type="button" onclick="openQuestionImageManager(${Number(q.id)})" class="text-xs font-bold px-2 py-2 bg-orange-50 text-orange-700 rounded-lg border border-orange-200">Manage Picture</button>` : ''}
                <button onclick="editCustomQuestion(${i})" class="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center hover:bg-blue-500 hover:text-white"><i class="fa-solid fa-pen"></i></button>
                <button onclick="deleteCustomQuestion(${q.id ? Number(q.id) : 'null'}, ${i})" class="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

function editCustomQuestion(index) {
    const q = customQuestions[index];
    if (!q) return;
    const module = questionModule();

    document.getElementById('cq-edit-id').value = q.id || '';
    document.getElementById('cq-prompt').value = q.prompt || '';
    document.getElementById('cq-answer').value = String(q.ans);
    for (let n = 0; n < 5; n++) {
        const el = document.getElementById(`cq-option-${n}`);
        if (el) el.value = (q.options || [])[n] || '';
    }
    document.getElementById('cq-explanation').value = q.explanation || '';

    if (module === 'W1') {
        const select = document.getElementById('cq-topic-id');
        if (select && q.topicId && [...select.options].some(o => o.value === String(q.topicId))) select.value = String(q.topicId);
    }
    if (module === 'NOVA') {
        const select = document.getElementById('cq-nova-topic-id');
        if (select && q.topicId && [...select.options].some(o => o.value === String(q.topicId))) select.value = String(q.topicId);
        const diff = document.getElementById('cq-difficulty');
        if (diff) diff.value = q.difficulty || 'medium';
    }

    const existingImage = document.getElementById('cq-existing-image');
    if (existingImage) existingImage.value = q.img || '';
    const fileInput = document.getElementById('cq-image-file');
    if (fileInput) fileInput.value = '';

    const helpText = document.getElementById('cq-image-help');
    if (helpText) {
        if (q.img && module === 'W1') {
            helpText.innerText = 'Current image is stored in Supabase. Browse to replace it.';
            helpText.classList.remove('hidden');
        } else helpText.classList.add('hidden');
    }

    document.getElementById('form-cq-title').innerHTML = '<i class="fa-solid fa-pen-to-square text-blue-500 mr-2"></i> Edit Question';
    document.getElementById('btn-save-cq').innerText = 'Update Question';
    document.getElementById('btn-cancel-edit').classList.remove('hidden');
    document.getElementById('btn-save-cq').classList.replace('w-full', 'w-2/3');
}

function cancelEdit() {
    ['cq-edit-id','cq-prompt','cq-existing-image','cq-explanation'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const fileInput = document.getElementById('cq-image-file');
    if (fileInput) fileInput.value = '';
    for (let n = 0; n < 5; n++) {
        const el = document.getElementById(`cq-option-${n}`);
        if (el) el.value = '';
    }
    document.getElementById('cq-image-help')?.classList.add('hidden');
    const title = document.getElementById('form-cq-title');
    if (title) title.innerHTML = '<i class="fa-solid fa-folder-plus text-indigo-500 mr-2"></i> Add Question';
    const saveBtn = document.getElementById('btn-save-cq');
    if (saveBtn) {
        saveBtn.innerText = 'Save to Bank';
        saveBtn.classList.remove('w-2/3');
        saveBtn.classList.add('w-full');
    }
    document.getElementById('btn-cancel-edit')?.classList.add('hidden');
}

async function addCustomQuestion(event) {
    event.preventDefault();

    applyMiddleware('ADD_QUESTION', null, async () => {
        const yearId = questionBankYearId();
        const module = questionModule();
        const editId = document.getElementById('cq-edit-id')?.value || '';
        const prompt = document.getElementById('cq-prompt')?.value.trim() || '';
        const ans = Number.parseInt(document.getElementById('cq-answer')?.value, 10);
        const existingImage = document.getElementById('cq-existing-image')?.value || '';
        const fileInput = document.getElementById('cq-image-file');
        const rawOptions = Array.from({ length: 5 }, (_, n) => document.getElementById(`cq-option-${n}`)?.value.trim().slice(0, 80) || '');
        const neededChoices = (module === 'NOVA' || module === 'W1') ? 5 : 0;
        const options = neededChoices ? rawOptions.slice(0, neededChoices) : [];
        const topic = selectedTopicForModule(module);

        if (!yearId) return showErrorToast('Select a school year first.');
        if ((module === 'W1' || module === 'NOVA') && !topic) return showErrorToast('Create or select a topic before saving a question.');
        if (!prompt) return showErrorToast('Question prompt is required.');
        if (neededChoices) {
            if (options.some(v => !v) || new Set(options.map(v => v.toLowerCase())).size !== neededChoices) {
                return showErrorToast(`Enter ${neededChoices} distinct answer choices.`);
            }
            if (!Number.isInteger(ans) || ans < 0 || ans >= neededChoices) return showErrorToast('Choose a valid correct answer.');
        }

        let finalImageUrl = module === 'W1' ? existingImage : '';
        let uploaded = null;

        try {
            if (module === 'W1' && fileInput?.files?.length) {
                const compressed = await compressSikLabImage(fileInput.files[0], 1200, 0.82);
                uploaded = await uploadSikLabImage('question-images', compressed, `school-year-${yearId}/${module}`);
                finalImageUrl = uploaded.publicUrl;
            }

            const payload = {
                school_year_id: yearId,
                game_module: module,
                prompt,
                correct_ans: Number.isInteger(ans) ? ans : 0,
                answer_options: neededChoices ? options : null,
                time_limit: module === 'NOVA' ? 15 : 10,
                image_url: finalImageUrl || null,
                topic_id: topic ? Number(topic.topic_id) : null,
                question_set: topic?.topic_name || 'General Questions',
                topic: topic?.topic_name || null,
                explanation: document.getElementById('cq-explanation')?.value.trim().slice(0, 500) || null,
                review_status: 'approved',
                difficulty: module === 'NOVA' ? (document.getElementById('cq-difficulty')?.value || 'medium') : 'medium',
                question_type: 'mc'
            };

            const oldQuestion = editId ? customQuestions.find(q => Number(q.id) === Number(editId)) : null;
            if (uploaded?.publicUrl) {
                payload.image_attribution = 'Teacher supplied';
                payload.image_license = 'Teacher supplied';
                payload.image_source = null;
            } else if (oldQuestion && module === 'W1') {
                payload.image_attribution = oldQuestion.image_attribution || null;
                payload.image_license = oldQuestion.image_license || null;
                payload.image_source = oldQuestion.image_source || null;
            }

            const db = requireSupabase();
            const result = editId
                ? await db.from('custom_question').update(payload).eq('question_id', Number(editId)).eq('school_year_id', yearId)
                : await db.from('custom_question').insert(payload);
            if (result.error) throw result.error;

            await refreshQuestionTopicState(module);
            await loadCustomQuestions();
            cancelEdit();
            if (typeof loadContentManagement === 'function') loadContentManagement();
            showToast(editId ? 'Question updated!' : 'Question saved to the selected topic!');
        } catch (error) {
            console.error('[question save]', error);
            if (uploaded?.publicUrl) await deleteSikLabStorageUrl('question-images', uploaded.publicUrl);
            showErrorToast(error.message || 'Could not save question.');
        }
    });
}

async function deleteCustomQuestion(dbId, arrayIndex) {
    applyMiddleware('DELETE_QUESTION', null, async () => {
        if (!confirm('Delete this question from the selected school year?')) return;
        const yearId = questionBankYearId();
        const module = questionModule();
        try {
            if (!dbId) {
                customQuestions.splice(arrayIndex, 1);
                renderQuestionsList();
                return;
            }
            const db = requireSupabase();
            const { error } = await db.from('custom_question').delete().eq('question_id', Number(dbId)).eq('school_year_id', yearId);
            if (error) throw error;
            await refreshQuestionTopicState(module);
            await loadCustomQuestions();
            if (typeof loadContentManagement === 'function') loadContentManagement();
            showToast('Question deleted.');
        } catch (error) {
            console.error('[question delete]', error);
            showErrorToast(error.message || 'Could not delete question.');
        }
    });
}

function resetCustomQuestions() {
    loadCustomQuestions();
    showToast('Reloaded questions from Supabase.');
}

function exportQuestions() {
    const module = questionModule();
    if (!customQuestions.length) return showErrorToast('No questions to export!');
    const exportRows = customQuestions.map(({ id, schoolYearId, module: _m, ...q }) => q);
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportRows, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    const safeYear = String(window.currentSchoolYearLabel || 'SchoolYear').replace(/[^a-zA-Z0-9_-]+/g, '_');
    const topic = selectedTopicForModule(module);
    const topicPart = topic ? '_' + String(topic.topic_name).replace(/[^a-zA-Z0-9_-]+/g, '_') : '';
    a.download = `SikLab_${safeYear}_${module}${topicPart}_Questions.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast(`Exported ${customQuestions.length} questions!`);
}

function importQuestions(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
        try {
            const yearId = questionBankYearId();
            const module = questionModule();
            const topic = selectedTopicForModule(module);
            if (!yearId) throw new Error('Select a school year first.');
            if ((module === 'W1' || module === 'NOVA') && !topic) throw new Error('Create or select a topic first.');

            const imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) throw new Error('JSON must contain an array.');
            const neededChoices = (module === 'NOVA' || module === 'W1') ? 5 : 0;

            const rows = imported.map(q => {
                const opts = q.options || q.answer_options || null;
                return {
                    school_year_id: yearId,
                    game_module: module,
                    topic_id: topic ? Number(topic.topic_id) : null,
                    topic: topic?.topic_name || q.topic || null,
                    question_set: topic?.topic_name || q.question_set || 'General Questions',
                    prompt: String(q.prompt || q.q || '').trim(),
                    correct_ans: Number(q.ans ?? q.correct_ans ?? q.correct),
                    answer_options: neededChoices ? opts : null,
                    explanation: q.explanation || null,
                    review_status: 'approved',
                    difficulty: module === 'NOVA' ? (q.difficulty || 'medium') : 'medium',
                    question_type: 'mc',
                    time_limit: Number(q.timeLimit ?? q.time_limit ?? (module === 'NOVA' ? 15 : 10)) || 10,
                    image_url: module === 'W1' ? (q.img || q.image_url || null) : null
                };
            }).filter(q =>
                q.prompt &&
                Number.isInteger(q.correct_ans) &&
                (!neededChoices || (
                    q.correct_ans >= 0 && q.correct_ans < neededChoices &&
                    Array.isArray(q.answer_options) && q.answer_options.length === neededChoices
                ))
            );

            if (!rows.length) throw new Error('No valid questions found.');
            const db = requireSupabase();
            const { error } = await db.from('custom_question').insert(rows);
            if (error) throw error;
            await refreshQuestionTopicState(module);
            await loadCustomQuestions();
            showToast(`Imported ${rows.length} questions.`);
        } catch (error) {
            console.error('[question import]', error);
            showErrorToast(error.message || 'Failed to import questions.');
        } finally {
            const input = document.getElementById('import-questions-file');
            if (input) input.value = '';
        }
    };
    reader.readAsText(file);
}
