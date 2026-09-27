/* ---------------------------------------------------------
 * SIKLAB QUESTION BANK - SCHOOL-YEAR SCOPED
 * Table: custom_question
 * Storage: question-images
 * Requires migration 003.
 * --------------------------------------------------------- */
let customQuestions = [];
const DEFAULT_QUESTIONS = { W1: [], W2: [], W3: [], W4: [], W5: [], W6: [], W7: [], W8: [] };

function questionBankYearId() {
    const value = Number(window.currentSchoolYearId || currentSchoolYearId || 0);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function loadCustomQuestions() {
    const module = document.getElementById('cq-module')?.value || 'W1';
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
        const { data, error } = await db
            .from('custom_question')
            .select('question_id,school_year_id,game_module,prompt,correct_ans,answer_options,time_limit,image_url,image_query,image_attribution,image_license,image_source,question_set,explanation,topic,review_status')
            .eq('school_year_id', yearId)
            .eq('game_module', module)
            .order('question_id', { ascending: true });
        if (error) throw error;

        customQuestions = (data || []).map(q => ({
            id: q.question_id,
            schoolYearId: Number(q.school_year_id),
            prompt: q.prompt,
            ans: Number(q.correct_ans),
            options: Array.isArray(q.answer_options) && q.answer_options.length===5 ? q.answer_options : ['Sight','Touch','Hearing','Smell','Taste'],
            img: q.image_url || '',
            image_query: q.image_query || '',image_attribution: q.image_attribution || '',image_license: q.image_license || '',image_source:q.image_source || '',
            timeLimit: Number(q.time_limit) || 10,
            set: q.question_set || 'General Questions', explanation: q.explanation || '', topic: q.topic || '' 
        }));

        if (!customQuestions.length) {
            customQuestions = DEFAULT_QUESTIONS[module] ? [...DEFAULT_QUESTIONS[module]] : [];
        }
    } catch (error) {
        console.error('[questions load]', error);
        customQuestions = [];
        showErrorToast(error.message || 'Could not load questions from Supabase.');
    }
    renderQuestionsList();
}

function renderQuestionsList() {
    const container = document.getElementById('questions-list-container');
    if (!container) return;

    if (!questionBankYearId()) {
        container.innerHTML = '<div class="text-center text-slate-400 mt-10"><p>Create or select a school year first.</p></div>';
        return;
    }

    if (!customQuestions.length) {
        container.innerHTML = `<div class="text-center text-slate-400 mt-10"><p>No questions in ${escapeHtml(window.currentSchoolYearLabel || 'this school year')} for this module yet.</p></div>`;
        return;
    }

    const senseNames = ['A / BTN 1','B / BTN 2','C / BTN 3','D / BTN 4','E / BTN 5'];
    const senseColors = ['text-blue-600 bg-blue-100','text-orange-600 bg-orange-100','text-green-600 bg-green-100','text-purple-600 bg-purple-100','text-red-600 bg-red-100'];

    container.innerHTML = customQuestions.map((q, i) => `
        <div class="flex justify-between items-center p-4 bg-white border border-slate-100 rounded-xl mb-3 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group">
            <div class="flex items-center gap-4 w-full">
                ${q.img
                    ? `<img src="${escapeAttr(q.img)}" alt="" class="w-12 h-12 rounded object-cover border bg-slate-50">`
                    : '<div class="w-12 h-12 rounded bg-slate-100 flex items-center justify-center text-slate-400"><i class="fa-solid fa-image"></i></div>'}
                <div class="flex-grow pr-4">
                    <p class="font-bold text-slate-800 text-sm">${escapeHtml(q.prompt)}</p>
                    <div class="flex gap-2 mt-1">
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded inline-block ${senseColors[q.ans] || 'text-slate-600 bg-slate-100'}">
                            ${escapeHtml(`${senseNames[q.ans] || `BTN ${q.ans+1}`}: ${(q.options||[])[q.ans] || ''}`)}
                        </span><span class="text-[10px] font-bold text-slate-500">${escapeHtml(q.set || 'General Questions')}</span>
                    </div>
                </div>
            </div>
            <div class="flex gap-2 flex-wrap items-center">
                ${document.getElementById('cq-module')?.value === 'W1' && q.id ? `<button type="button" onclick="openQuestionImageManager(${Number(q.id)})" class="text-xs font-bold px-2 py-2 bg-orange-50 text-orange-700 rounded-lg border border-orange-200" title="Search, replace or remove saved picture">Manage Picture</button>` : ''}
                <button onclick="editCustomQuestion(${i})" class="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center hover:bg-blue-500 hover:text-white"><i class="fa-solid fa-pen"></i></button>
                <button onclick="deleteCustomQuestion(${q.id ? Number(q.id) : 'null'}, ${i})" class="w-8 h-8 flex-shrink-0 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

function editCustomQuestion(index) {
    const q = customQuestions[index];
    if (!q) return;

    document.getElementById('cq-edit-id').value = q.id || '';
    document.getElementById('cq-prompt').value = q.prompt || '';
    document.getElementById('cq-answer').value = q.ans;
    for(let n=0;n<5;n++){const el=document.getElementById(`cq-option-${n}`);if(el)el.value=(q.options||[])[n]||'';}
    document.getElementById('cq-set-name').value = q.set || 'General Questions';
    document.getElementById('cq-explanation').value = q.explanation || '';

    const existingImage = document.getElementById('cq-existing-image');
    if (existingImage) existingImage.value = q.img || '';

    const fileInput = document.getElementById('cq-image-file');
    if (fileInput) fileInput.value = '';

    const helpText = document.getElementById('cq-image-help');
    if (helpText) {
        if (q.img) {
            helpText.innerText = 'Current image is stored in Supabase. Browse to replace it.';
            helpText.classList.remove('hidden');
        } else {
            helpText.classList.add('hidden');
        }
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
    for(let n=0;n<5;n++){const el=document.getElementById(`cq-option-${n}`);if(el)el.value='';}
    const setField = document.getElementById('cq-set-name');
    if (setField) setField.value = 'General Questions';
    const helpText = document.getElementById('cq-image-help');
    if (helpText) helpText.classList.add('hidden');

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
        const module = document.getElementById('cq-module')?.value || 'W1';
        const editId = document.getElementById('cq-edit-id')?.value || '';
        const prompt = document.getElementById('cq-prompt')?.value.trim() || '';
        const ans = Number.parseInt(document.getElementById('cq-answer')?.value, 10);
        const fileInput = document.getElementById('cq-image-file');
        const existingImage = document.getElementById('cq-existing-image')?.value || '';
        const options = Array.from({length:5},(_,n)=>document.getElementById(`cq-option-${n}`)?.value.trim().slice(0,55)||'');
        if(module==='W1' && (options.some(value=>!value)||new Set(options.map(value=>value.toLowerCase())).size!==5))return showErrorToast('Enter five distinct options (A–E) for Picture Challenge.');

        if (!yearId) return showErrorToast('Select a school year first.');
        if (!prompt) return showErrorToast('Question prompt is required.');
        if (!Number.isInteger(ans) || ans < 0 || ans > 4) return showErrorToast('Choose a valid answer button.');

        let finalImageUrl = existingImage;
        let uploaded = null;

        try {
            if (fileInput?.files?.length) {
                const compressed = await compressSikLabImage(fileInput.files[0], 1200, 0.82);
                uploaded = await uploadSikLabImage(
                    'question-images',
                    compressed,
                    `school-year-${yearId}/${module}`
                );
                finalImageUrl = uploaded.publicUrl;
            }

            const payload = {
                school_year_id: yearId,
                game_module: module,
                prompt,
                correct_ans: ans,
                answer_options: module==='W1' ? options : null,
                time_limit: 10,
                image_url: finalImageUrl || null,
                question_set: document.getElementById('cq-set-name')?.value.trim().slice(0, 90) || 'General Questions',
                explanation: document.getElementById('cq-explanation')?.value.trim().slice(0, 500) || null,
                review_status: 'approved'
            };
            const oldQuestion = editId ? customQuestions.find(q=>Number(q.id)===Number(editId)) : null;
            if(uploaded?.publicUrl){payload.image_attribution='Teacher supplied';payload.image_license='Teacher supplied';payload.image_source=null;}
            else if(oldQuestion){payload.image_attribution=oldQuestion.image_attribution||null;payload.image_license=oldQuestion.image_license||null;payload.image_source=oldQuestion.image_source||null;}

            const db = requireSupabase();
            const result = editId
                ? await db.from('custom_question').update(payload)
                    .eq('question_id', Number(editId))
                    .eq('school_year_id', yearId)
                : await db.from('custom_question').insert(payload);

            if (result.error) throw result.error;

            // Do not delete an old saved image automatically. Curriculum copied
            // between years can intentionally share the same Storage URL.
            await loadCustomQuestions();
            if (typeof loadSenseQuestionSets === 'function') loadSenseQuestionSets();
            cancelEdit();
            if (typeof loadContentManagement === 'function') loadContentManagement();
            showToast(editId ? 'Question updated!' : 'Question saved to this school year!');
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

        try {
            if (!dbId) {
                customQuestions.splice(arrayIndex, 1);
                renderQuestionsList();
                return;
            }

            const db = requireSupabase();
            const { error } = await db.from('custom_question')
                .delete()
                .eq('question_id', Number(dbId))
                .eq('school_year_id', yearId);
            if (error) throw error;

            // Storage file is intentionally retained because copied questions in
            // another school year may still reference the same URL.
            await loadCustomQuestions();
            if (typeof loadSenseQuestionSets === 'function') loadSenseQuestionSets();
            if (typeof loadContentManagement === 'function') loadContentManagement();
            showToast('Question deleted from this school year.');
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
    const module = document.getElementById('cq-module')?.value || 'W1';
    if (!customQuestions.length) return showErrorToast('No questions to export!');

    const exportRows = customQuestions.map(({ id, schoolYearId, ...q }) => q);
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportRows, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    const safeYear = String(window.currentSchoolYearLabel || 'SchoolYear').replace(/[^a-zA-Z0-9_-]+/g, '_');
    a.download = `SikLab_${safeYear}_Questions_${module}.json`;
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
            if (!yearId) throw new Error('Select a school year first.');

            const imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) throw new Error('JSON must contain an array.');

            const module = document.getElementById('cq-module')?.value || 'W1';
            const rows = imported.map(q => ({
                school_year_id: yearId,
                game_module: module,
                prompt: String(q.prompt || '').trim(),
                correct_ans: Number(q.ans ?? q.correct_ans),
                time_limit: Number(q.timeLimit ?? q.time_limit ?? 10) || 10,
                image_url: q.img || q.image_url || null
            })).filter(q =>
                q.prompt &&
                Number.isInteger(q.correct_ans) &&
                q.correct_ans >= 0 &&
                q.correct_ans <= 4
            );

            if (!rows.length) throw new Error('No valid questions found.');

            const db = requireSupabase();
            const { error } = await db.from('custom_question').insert(rows);
            if (error) throw error;

            await loadCustomQuestions();
            if (typeof loadContentManagement === 'function') loadContentManagement();
            showToast(`Imported ${rows.length} questions into ${window.currentSchoolYearLabel}.`);
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
