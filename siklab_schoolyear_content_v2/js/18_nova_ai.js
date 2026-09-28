/* =========================================================
 * SCIENCE CARNIVAL SHOOTER — AI QUESTION GENERATOR V2
 * Sources: typed topic, saved SikLab lesson, PDF (<=5 MB)
 * Output: 4-choice MC questions for Buttons 2-5
 * Saved only after teacher review into the selected NOVA topic.
 * ========================================================= */

let novaAiDrafts = [];
let novaAiSourceInfo = {};
let novaAiRequestVersion = 0;

const novaAiEl = id => document.getElementById(id);
const novaAiYear = () => Number(window.currentSchoolYearId || 0);
const novaAiEscape = value => typeof escapeHtml === 'function'
    ? escapeHtml(String(value ?? ''))
    : String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));

function novaAiStatus(message, tone = 'normal') {
    const el = novaAiEl('nova-ai-status');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('text-slate-600','text-red-700','text-emerald-700','text-violet-700');
    el.classList.add(tone === 'error' ? 'text-red-700' : tone === 'success' ? 'text-emerald-700' : tone === 'busy' ? 'text-violet-700' : 'text-slate-600');
}

function novaAiSyncTopic() {
    const topic = typeof getSelectedNovaTopic === 'function' ? getSelectedNovaTopic() : null;
    const hint = novaAiEl('nova-ai-selected-topic');
    if (hint) hint.textContent = topic ? `Saving to: ${topic.topic_name}` : 'Select or create a Science Carnival topic first.';

    const topicInput = novaAiEl('nova-ai-topic');
    if (topic && topicInput && !topicInput.dataset.teacherEdited) topicInput.value = topic.topic_name || '';
}

function novaAiMarkTopicEdited() {
    const input = novaAiEl('nova-ai-topic');
    if (input) input.dataset.teacherEdited = '1';
}

function novaAiChangeSource() {
    const source = novaAiEl('nova-ai-source')?.value || 'topic';
    novaAiEl('nova-ai-topic-wrap')?.classList.toggle('hidden', source !== 'topic');
    novaAiEl('nova-ai-lesson-wrap')?.classList.toggle('hidden', source !== 'lesson');
    novaAiEl('nova-ai-pdf-wrap')?.classList.toggle('hidden', source !== 'pdf');
    const labels = { topic:'typed topic', lesson:'saved SikLab lesson', pdf:'uploaded PDF' };
    novaAiStatus(`Source: ${labels[source] || source}. Questions stay unsaved until you review and save them.`);
    if (source === 'lesson') novaAiRefreshLessons();
}

async function novaAiRefreshLessons() {
    const select = novaAiEl('nova-ai-lesson');
    const yearId = novaAiYear();
    if (!select) return;
    if (!yearId) {
        select.replaceChildren(new Option('Select a school year first', ''));
        return;
    }

    const previous = select.value;
    select.replaceChildren(new Option('Loading lessons…', ''));
    try {
        const { data, error } = await requireSupabase()
            .from('lesson_modules')
            .select('module_id,title,week_id,is_published')
            .eq('school_year_id', yearId)
            .order('week_id', { ascending: true });
        if (error) throw error;

        select.replaceChildren(
            new Option('Select an existing lesson', ''),
            ...(data || []).map(row => new Option(
                `${row.title || `Lesson ${row.week_id}`}${row.is_published === false ? ' (Draft)' : ''}`,
                String(row.module_id)
            ))
        );
        if ([...select.options].some(o => o.value === previous)) select.value = previous;
    } catch (error) {
        console.error('[Nova AI lessons]', error);
        select.replaceChildren(new Option('Lessons unavailable', ''));
        novaAiStatus(error.message || 'Could not load saved lessons.', 'error');
    }
}

async function novaAiPdfBase64(file) {
    if (!file) throw new Error('Choose a PDF first.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Choose a PDF no larger than 5 MB.');
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error('Please choose a PDF file.');

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') throw new Error('This file is not a valid PDF.');

    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

function novaAiGetDifficulty() {
    const value = novaAiEl('nova-ai-difficulty')?.value || 'medium';
    return ['easy','medium','hard'].includes(value) ? value : 'medium';
}

async function novaAiGenerateQuestions() {
    const button = novaAiEl('nova-ai-generate-btn');
    const yearId = novaAiYear();
    const bankTopic = typeof getSelectedNovaTopic === 'function' ? getSelectedNovaTopic() : null;
    if (!yearId) return showErrorToast('Choose a school year first.');
    if (!bankTopic) return showErrorToast('Create or select a Science Carnival topic before generating questions.');

    const source = novaAiEl('nova-ai-source')?.value || 'topic';
    const count = Number(novaAiEl('nova-ai-count')?.value || 5);
    const difficulty = novaAiGetDifficulty();
    const focus = novaAiEl('nova-ai-focus')?.value.trim().slice(0, 160) || '';

    const body = {
        game_module: 'NOVA',
        source_type: source,
        school_year_id: yearId,
        question_count: count,
        difficulty,
        focus
    };

    try {
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Generating…';
        }
        novaAiStatus('Preparing a four-choice Science Carnival draft…', 'busy');

        if (source === 'pdf') {
            const file = novaAiEl('nova-ai-pdf')?.files?.[0];
            body.pdf_base64 = await novaAiPdfBase64(file);
            body.filename = file.name.slice(0, 140);
        } else if (source === 'lesson') {
            body.lesson_module_id = Number(novaAiEl('nova-ai-lesson')?.value || 0);
            if (!body.lesson_module_id) throw new Error('Select a saved lesson first.');
        } else {
            const typed = novaAiEl('nova-ai-topic')?.value.trim().slice(0, 160) || '';
            body.topic = typed || bankTopic.topic_name || '';
            if (body.topic.length < 3) throw new Error('Enter a science topic first.');
        }

        const { data, error } = await requireSupabase().functions.invoke('ai-game-questions', { body });
        if (error || data?.error) throw new Error(data?.error || error?.message || 'AI request failed.');
        if (!Array.isArray(data?.questions) || !data.questions.length) throw new Error('Gemini returned no valid Science Carnival questions.');

        const version = ++novaAiRequestVersion;
        novaAiDrafts = data.questions
            .filter(q => Array.isArray(q.answer_options) && q.answer_options.length === 4)
            .map((q, index) => ({
                id: `${version}-${index}`,
                include: true,
                prompt: String(q.prompt || '').trim(),
                answer_options: q.answer_options.map(v => String(v || '').trim()).slice(0, 4),
                correct_ans: Number(q.correct_ans),
                explanation: String(q.explanation || '').trim(),
                source_page: String(q.source_page || '').trim(),
                difficulty
            }));

        if (!novaAiDrafts.length) throw new Error('AI returned questions, but none had four valid answer choices.');

        const lessonSelect = novaAiEl('nova-ai-lesson');
        novaAiSourceInfo = {
            school_year_id: yearId,
            topic_id: Number(bankTopic.topic_id),
            topic_name: bankTopic.topic_name,
            source_type: source,
            source_label: source === 'pdf'
                ? body.filename
                : source === 'lesson'
                    ? (lessonSelect?.selectedOptions?.[0]?.textContent || 'Saved lesson')
                    : body.topic,
            lesson_module_id: source === 'lesson' ? body.lesson_module_id : null,
            difficulty
        };

        novaAiRenderDrafts();
        novaAiStatus(`Generated ${novaAiDrafts.length} ${difficulty} draft question${novaAiDrafts.length === 1 ? '' : 's'}. Review them before saving.`, 'success');
        console.info('[Science Carnival AI]', data.version || 'unversioned', data.source_summary || '');
    } catch (error) {
        console.error('[Nova AI generate]', error);
        novaAiStatus(error.message || 'Could not generate questions.', 'error');
        showErrorToast(error.message || 'Could not generate questions.');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles mr-2"></i>Generate editable draft';
        }
    }
}

function novaAiToggleDraft(index, checked) {
    if (!novaAiDrafts[index]) return;
    novaAiDrafts[index].include = !!checked;
    novaAiUpdateSaveCount();
}

function novaAiUpdateDraft(index, field, value) {
    const q = novaAiDrafts[index];
    if (!q) return;
    if (field === 'prompt') q.prompt = String(value || '').slice(0, 350);
    if (field === 'explanation') q.explanation = String(value || '').slice(0, 500);
}

function novaAiUpdateOption(index, optionIndex, value) {
    const q = novaAiDrafts[index];
    if (!q) return;
    q.answer_options[optionIndex] = String(value || '').slice(0, 55);
}

function novaAiSetCorrect(index, optionIndex) {
    const q = novaAiDrafts[index];
    if (!q) return;
    q.correct_ans = Number(optionIndex);
}

function novaAiRemoveDraft(index) {
    novaAiDrafts.splice(index, 1);
    novaAiRenderDrafts();
    novaAiStatus(novaAiDrafts.length ? 'Draft removed. Review the remaining questions.' : 'No draft questions remain.');
}

function novaAiUpdateSaveCount() {
    const btn = novaAiEl('nova-ai-save-btn');
    if (!btn) return;
    const count = novaAiDrafts.filter(q => q.include !== false).length;
    btn.innerHTML = `<i class="fa-solid fa-floppy-disk mr-2"></i>Save ${count} approved question${count === 1 ? '' : 's'}`;
    btn.disabled = count === 0;
}

function novaAiRenderDrafts() {
    const target = novaAiEl('nova-ai-drafts');
    if (!target) return;

    if (!novaAiDrafts.length) {
        target.innerHTML = '<div class="rounded-xl border border-dashed border-violet-200 bg-violet-50/40 p-5 text-center text-sm font-bold text-violet-400">AI drafts will appear here after generation.</div>';
        return;
    }

    const labels = ['A / Button 2','B / Button 3','C / Button 4','D / Button 5'];
    target.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
                <h4 class="font-black text-slate-800">Review AI Draft</h4>
                <p class="text-xs text-slate-500">Edit any wording or answer before saving. Uncheck a question to skip it.</p>
            </div>
            <button type="button" id="nova-ai-save-btn" onclick="novaAiSaveDrafts()" class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black disabled:opacity-50 disabled:cursor-not-allowed"></button>
        </div>
    ` + novaAiDrafts.map((q, i) => `
        <article class="rounded-2xl border border-violet-200 bg-white p-4 mb-3 shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
                <label class="flex items-center gap-2 text-sm font-black text-slate-700">
                    <input type="checkbox" class="w-4 h-4 accent-violet-600" ${q.include !== false ? 'checked' : ''} onchange="novaAiToggleDraft(${i},this.checked)">
                    Question ${i + 1}
                </label>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] uppercase font-black px-2 py-1 rounded-full bg-violet-50 text-violet-700">${novaAiEscape(q.difficulty || 'medium')}</span>
                    ${q.source_page ? `<span class="text-[10px] font-bold text-slate-500">PDF page ${novaAiEscape(q.source_page)}</span>` : ''}
                    <button type="button" onclick="novaAiRemoveDraft(${i})" class="w-8 h-8 rounded-lg bg-red-50 text-red-500 hover:bg-red-500 hover:text-white"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>

            <label class="block text-xs font-black text-slate-600 mb-1">Question</label>
            <textarea rows="2" class="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-violet-500 outline-none font-bold text-slate-800 resize-y" oninput="novaAiUpdateDraft(${i},'prompt',this.value)">${novaAiEscape(q.prompt)}</textarea>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                ${q.answer_options.map((option, oi) => `
                    <label class="flex items-center gap-2 rounded-xl border ${Number(q.correct_ans) === oi ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'} p-2">
                        <input type="radio" name="nova-ai-correct-${i}" class="w-4 h-4 accent-emerald-600" ${Number(q.correct_ans) === oi ? 'checked' : ''} onchange="novaAiSetCorrect(${i},${oi});novaAiRenderDrafts()">
                        <span class="text-[10px] font-black text-violet-700 w-20 flex-shrink-0">${labels[oi]}</span>
                        <input value="${novaAiEscape(option)}" maxlength="55" oninput="novaAiUpdateOption(${i},${oi},this.value)" class="min-w-0 flex-1 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-bold outline-none focus:border-violet-500">
                    </label>
                `).join('')}
            </div>

            <label class="block text-xs font-black text-slate-600 mt-3 mb-1">Explanation</label>
            <textarea rows="2" class="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-violet-500 outline-none text-sm resize-y" oninput="novaAiUpdateDraft(${i},'explanation',this.value)">${novaAiEscape(q.explanation)}</textarea>
        </article>
    `).join('');

    novaAiUpdateSaveCount();
}

async function novaAiSaveDrafts() {
    const button = novaAiEl('nova-ai-save-btn');
    const yearId = novaAiYear();
    const bankTopic = typeof getSelectedNovaTopic === 'function' ? getSelectedNovaTopic() : null;
    if (!bankTopic) return showErrorToast('Create or select a Science Carnival topic before saving AI questions.');
    if (!yearId || yearId !== Number(novaAiSourceInfo.school_year_id)) {
        return showErrorToast('The school year changed. Generate a fresh AI draft for the selected year.');
    }
    if (Number(bankTopic.topic_id) !== Number(novaAiSourceInfo.topic_id)) {
        return showErrorToast('The selected Science Carnival topic changed. Generate a fresh AI draft before saving.');
    }

    const chosen = novaAiDrafts.filter(q => q.include !== false);
    if (!chosen.length) return showErrorToast('Select at least one draft question to save.');

    const rows = [];
    for (const [index, q] of chosen.entries()) {
        const prompt = String(q.prompt || '').trim();
        const options = Array.isArray(q.answer_options) ? q.answer_options.map(v => String(v || '').trim()) : [];
        const correct = Number(q.correct_ans);

        if (!prompt) return showErrorToast(`Question ${index + 1} needs question text.`);
        if (options.length !== 4 || options.some(v => !v) || new Set(options.map(v => v.toLowerCase())).size !== 4) {
            return showErrorToast(`Question ${index + 1} needs four different answer choices.`);
        }
        if (!Number.isInteger(correct) || correct < 0 || correct > 3) {
            return showErrorToast(`Question ${index + 1} needs one correct answer.`);
        }

        rows.push({
            school_year_id: yearId,
            game_module: 'NOVA',
            topic_id: Number(bankTopic.topic_id),
            question_set: bankTopic.topic_name,
            topic: bankTopic.topic_name,
            prompt: prompt.slice(0, 350),
            correct_ans: correct,
            answer_options: options.map(v => v.slice(0, 55)),
            time_limit: 15,
            explanation: String(q.explanation || '').trim().slice(0, 500) || null,
            source_type: novaAiSourceInfo.source_type || 'topic',
            source_label: String(novaAiSourceInfo.source_label || '').slice(0, 150) || null,
            lesson_module_id: novaAiSourceInfo.lesson_module_id || null,
            ai_generated: true,
            review_status: 'approved',
            difficulty: novaAiSourceInfo.difficulty || q.difficulty || 'medium',
            question_type: 'mc',
            image_url: null
        });
    }

    if (!confirm(`Save ${rows.length} teacher-reviewed ${novaAiSourceInfo.difficulty || 'medium'} question${rows.length === 1 ? '' : 's'} to “${bankTopic.topic_name}”?`)) return;

    try {
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Saving…';
        }
        const { error } = await requireSupabase().from('custom_question').insert(rows);
        if (error) throw error;

        novaAiDrafts = [];
        ++novaAiRequestVersion;
        novaAiRenderDrafts();
        if (typeof loadNovaTopics === 'function') await loadNovaTopics({ preferredValue: String(bankTopic.topic_id) });
        if (typeof selectNovaTopic === 'function') await selectNovaTopic(String(bankTopic.topic_id));
        else if (typeof loadCustomQuestions === 'function') await loadCustomQuestions();
        if (typeof loadContentManagement === 'function') loadContentManagement();

        novaAiStatus(`Saved ${rows.length} approved questions to “${bankTopic.topic_name}”.`, 'success');
        showToast(`${rows.length} Science Carnival AI questions saved!`);
    } catch (error) {
        console.error('[Nova AI save]', error);
        novaAiStatus(error.message || 'Could not save AI questions.', 'error');
        showErrorToast(error.message || 'Could not save AI questions.');
    } finally {
        novaAiUpdateSaveCount();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    novaAiChangeSource();
    novaAiRefreshLessons().catch(error => console.warn('[Nova AI lesson boot]', error));
    novaAiSyncTopic();
    novaAiRenderDrafts();
});
