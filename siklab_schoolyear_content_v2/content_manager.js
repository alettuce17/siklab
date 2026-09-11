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
            .select('question_id,school_year_id,game_module,prompt,correct_ans,time_limit,image_url')
            .eq('school_year_id', yearId)
            .eq('game_module', module)
            .order('question_id', { ascending: true });
        if (error) throw error;

        customQuestions = (data || []).map(q => ({
            id: q.question_id,
            schoolYearId: Number(q.school_year_id),
            prompt: q.prompt,
            ans: Number(q.correct_ans),
            img: q.image_url || '',
            timeLimit: Number(q.time_limit) || 10
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

    const senseNames = ['BTN 1 (Sight/Square)','BTN 2 (Touch/Up)','BTN 3 (Hear/Circle)','BTN 4 (Smell/Star)','BTN 5 (Taste/Heart)'];
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
                            ${escapeHtml(senseNames[q.ans] || `BTN ${q.ans + 1}`)}
                        </span>
                    </div>
                </div>
            </div>
            <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
    ['cq-edit-id','cq-prompt','cq-existing-image'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const fileInput = document.getElementById('cq-image-file');
    if (fileInput) fileInput.value = '';
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
                time_limit: 10,
                image_url: finalImageUrl || null
            };

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
