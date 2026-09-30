/* =========================================================
 * SCHOOL-YEAR CURRICULUM CONTENT MANAGEMENT
 * Requires migration 003_school_year_content_management.sql
 * ========================================================= */

let schoolYearContentSummary = [];

function selectedContentYearLabel(yearId) {
    const row = schoolYears.find(y => Number(y.year_id) === Number(yearId));
    return row?.label || `School Year ${yearId}`;
}

async function loadContentManagement() {
    const currentLabel = document.getElementById('content-current-year-label');
    if (currentLabel) currentLabel.textContent = window.currentSchoolYearLabel || 'No school year selected';

    populateContentCopySelectors();

    try {
        const db = requireSupabase();
        const { data, error } = await db.rpc('get_school_year_content_summary');
        if (error) throw error;
        schoolYearContentSummary = Array.isArray(data) ? data : [];
        renderSchoolYearContentSummary();
        renderCurrentYearContentCards();
    } catch (error) {
        console.error('[content summary]', error);
        schoolYearContentSummary = [];
        const container = document.getElementById('school-year-content-summary');
        if (container) {
            container.innerHTML = `<div class="p-6 text-center text-red-500 font-bold">${escapeHtml(error.message || 'Could not load curriculum summary.')}</div>`;
        }
    }
}

function populateContentCopySelectors() {
    const source = document.getElementById('copy-content-source');
    const target = document.getElementById('copy-content-target');
    if (!source || !target) return;

    const options = schoolYears.map(year =>
        `<option value="${Number(year.year_id)}">${escapeHtml(year.label)}</option>`
    ).join('');

    source.innerHTML = options || '<option value="">No school years</option>';
    target.innerHTML = options || '<option value="">No school years</option>';

    if (window.currentSchoolYearId) target.value = String(window.currentSchoolYearId);

    const candidates = schoolYears.filter(y => Number(y.year_id) !== Number(window.currentSchoolYearId));
    if (candidates.length) source.value = String(candidates[0].year_id);
    else if (window.currentSchoolYearId) source.value = String(window.currentSchoolYearId);

    updateCopyContentWarning();
}

function updateCopyContentWarning() {
    const sourceId = Number(document.getElementById('copy-content-source')?.value || 0);
    const targetId = Number(document.getElementById('copy-content-target')?.value || 0);
    const mode = document.getElementById('copy-content-mode')?.value || 'merge';
    const box = document.getElementById('copy-content-warning');
    const btn = document.getElementById('copy-content-button');
    if (!box || !btn) return;

    if (!sourceId || !targetId || sourceId === targetId) {
        box.className = 'rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2.5 text-xs font-bold leading-relaxed';
        box.textContent = 'Choose two different school years.';
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        return;
    }

    btn.disabled = false;
    btn.classList.remove('opacity-50', 'cursor-not-allowed');

    if (mode === 'replace') {
        box.className = 'rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2.5 text-xs font-bold leading-relaxed';
        box.textContent = `Replace mode will delete the selected curriculum categories currently stored in ${selectedContentYearLabel(targetId)} before copying.`;
    } else {
        box.className = 'rounded-lg border border-blue-200 bg-blue-50 text-blue-700 px-3 py-2.5 text-xs font-bold leading-relaxed';
        box.textContent = `Merge mode keeps existing content in ${selectedContentYearLabel(targetId)} and only adds missing lessons/questions/settings.`;
    }
}

async function copySchoolYearContent(event) {
    event?.preventDefault?.();

    const sourceId = Number(document.getElementById('copy-content-source')?.value || 0);
    const targetId = Number(document.getElementById('copy-content-target')?.value || 0);
    const mode = document.getElementById('copy-content-mode')?.value || 'merge';
    const copyLessons = !!document.getElementById('copy-content-lessons')?.checked;
    const copyQuestions = !!document.getElementById('copy-content-questions')?.checked;
    const copySettings = !!document.getElementById('copy-content-settings')?.checked;

    if (!sourceId || !targetId || sourceId === targetId) {
        return showErrorToast('Choose two different school years.');
    }
    if (!copyLessons && !copyQuestions && !copySettings) {
        return showErrorToast('Choose at least one curriculum content type to copy.');
    }

    const sourceLabel = selectedContentYearLabel(sourceId);
    const targetLabel = selectedContentYearLabel(targetId);
    const message = mode === 'replace'
        ? `Replace selected curriculum content in ${targetLabel} using ${sourceLabel}? Existing selected content in the target year will be deleted first.`
        : `Merge selected curriculum content from ${sourceLabel} into ${targetLabel}? Existing target content will be kept.`;

    if (!confirm(message)) return;

    const btn = document.getElementById('copy-content-button');
    const oldHtml = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Copying...';
    }

    try {
        const db = requireSupabase();
        const { data, error } = await db.rpc('copy_school_year_content', {
            p_source_year_id: sourceId,
            p_target_year_id: targetId,
            p_copy_lessons: copyLessons,
            p_copy_questions: copyQuestions,
            p_copy_settings: copySettings,
            p_mode: mode
        });
        if (error) throw error;

        await loadContentManagement();

        if (Number(window.currentSchoolYearId) === targetId) {
            if (typeof loadCustomQuestions === 'function') await loadCustomQuestions();
            if (typeof refreshLessonBuilderForSchoolYear === 'function') refreshLessonBuilderForSchoolYear();
            if (typeof refreshStudentPreview === 'function') refreshStudentPreview();
        }

        const result = data || {};
        showToast(`Copied ${Number(result.lessons_copied || 0)} lessons, ${Number(result.questions_copied || 0)} questions, and ${Number(result.settings_copied || 0)} settings.`);
    } catch (error) {
        console.error('[copy school year content]', error);
        showErrorToast(error.message || 'Could not copy curriculum content.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = oldHtml || '<i class="fa-solid fa-copy mr-2"></i>Copy Curriculum';
        }
        updateCopyContentWarning();
    }
}

function renderCurrentYearContentCards() {
    const row = schoolYearContentSummary.find(item => Number(item.year_id) === Number(window.currentSchoolYearId));
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(Number(value || 0));
    };
    setValue('content-count-lessons', row?.lesson_count);
    setValue('content-count-published', row?.published_lesson_count);
    setValue('content-count-questions', row?.question_count);
    setValue('content-count-settings', row?.settings_count);
}

function renderSchoolYearContentSummary() {
    const container = document.getElementById('school-year-content-summary');
    if (!container) return;

    if (!schoolYearContentSummary.length) {
        container.innerHTML = `
            <div class="px-4 py-8 text-center">
                <div class="w-10 h-10 mx-auto rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mb-2">
                    <i class="fa-solid fa-calendar-xmark"></i>
                </div>
                <p class="text-sm text-slate-500 font-bold">No school years yet.</p>
            </div>`;
        return;
    }

    const metric = (value, label, colorClass = 'text-slate-700') => `
        <div class="min-w-0 text-center rounded-lg bg-slate-50/70 px-2 py-1.5">
            <div class="text-sm font-black ${colorClass} leading-none">${Number(value || 0)}</div>
            <div class="text-[9px] uppercase tracking-wide font-black text-slate-400 mt-1 truncate">${label}</div>
        </div>`;

    container.innerHTML = schoolYearContentSummary.map(row => {
        const active = row.is_active === true;
        const yearId = Number(row.year_id);

        return `
            <div class="px-3 py-3 hover:bg-orange-50/40 transition-colors">
                <div class="grid grid-cols-1 xl:grid-cols-[minmax(155px,1.35fr)_repeat(5,minmax(58px,0.55fr))_auto] gap-2.5 xl:items-center">
                    <div class="min-w-0 flex xl:block items-center justify-between gap-2">
                        <div class="font-black text-slate-800 text-sm leading-tight truncate" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</div>
                        <span class="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] uppercase tracking-wide font-black ${active ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}">
                            <span class="w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-400'}"></span>
                            ${active ? 'Active' : 'Archived'}
                        </span>
                    </div>

                    <div class="grid grid-cols-5 gap-1.5 xl:contents">
                        ${metric(row.student_count, 'Students')}
                        ${metric(row.lesson_count, 'Lessons')}
                        ${metric(row.published_lesson_count, 'Published', 'text-emerald-600')}
                        ${metric(row.question_count, 'Questions', 'text-blue-600')}
                        ${metric(row.settings_count, 'Settings', 'text-purple-600')}
                    </div>

                    <div class="flex gap-1.5 justify-end">
                        <button onclick="useSchoolYearFromContentManager(${yearId})" title="Use ${escapeHtml(row.label)}" class="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-800 hover:text-white text-slate-700 text-[11px] font-black transition-colors">
                            <i class="fa-solid fa-arrow-right-to-bracket"></i><span class="hidden sm:inline">Use</span>
                        </button>
                        <button onclick="previewSchoolYear(${yearId})" title="Preview ${escapeHtml(row.label)}" class="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 text-[11px] font-black transition-colors border border-blue-100">
                            <i class="fa-solid fa-eye"></i><span class="hidden sm:inline">Preview</span>
                        </button>
                    </div>
                </div>
            </div>`;
    }).join('');
}

async function useSchoolYearFromContentManager(yearId) {
    const select = document.getElementById('school-year-filter');
    if (select) select.value = String(yearId);
    await changeSchoolYear(yearId);
    await loadContentManagement();
}

function previewSchoolYear(yearId) {
    if (Number(window.currentSchoolYearId) !== Number(yearId)) {
        const select = document.getElementById('school-year-filter');
        if (select) select.value = String(yearId);
        changeSchoolYear(yearId).then(() => {
            switchTab('student-preview');
            refreshStudentPreview();
        });
        return;
    }
    switchTab('student-preview');
    refreshStudentPreview();
}

function refreshStudentPreview() {
    const frame = document.getElementById('student-preview-frame');
    if (!frame) return;
    const yearId = Number(window.currentSchoolYearId || 0);
    const cacheBust = Date.now();
    frame.src = `student.html?preview=1&year=${encodeURIComponent(yearId)}&t=${cacheBust}`;
}

function openStudentPortalInNewTab() {
    const yearId = Number(window.currentSchoolYearId || 0);
    window.open(`student.html?preview=1&year=${encodeURIComponent(yearId)}`, '_blank', 'noopener');
}

async function clearSelectedSchoolYearContent() {
    const targetId = Number(document.getElementById('copy-content-target')?.value || 0);
    const clearLessons = !!document.getElementById('copy-content-lessons')?.checked;
    const clearQuestions = !!document.getElementById('copy-content-questions')?.checked;
    const clearSettings = !!document.getElementById('copy-content-settings')?.checked;

    if (!targetId) return showErrorToast('Choose a target school year first.');
    if (!clearLessons && !clearQuestions && !clearSettings) return showErrorToast('Choose at least one curriculum content type.');

    const targetLabel = selectedContentYearLabel(targetId);
    const selected = [clearLessons ? 'lessons' : null, clearQuestions ? 'questions' : null, clearSettings ? 'game settings' : null].filter(Boolean).join(', ');
    if (!confirm(`Permanently clear ${selected} from ${targetLabel}? Student roster, groups, progress, and match history will NOT be deleted.`)) return;
    if (!confirm(`Final confirmation: delete the selected curriculum content from ${targetLabel}?`)) return;

    const btn = document.getElementById('clear-content-button');
    const oldHtml = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Clearing...'; }

    try {
        const db = requireSupabase();
        const { data, error } = await db.rpc('clear_school_year_content', {
            p_year_id: targetId,
            p_clear_lessons: clearLessons,
            p_clear_questions: clearQuestions,
            p_clear_settings: clearSettings
        });
        if (error) throw error;

        if (Number(window.currentSchoolYearId) === targetId) {
            if (typeof loadCustomQuestions === 'function') await loadCustomQuestions();
            if (typeof refreshLessonBuilderForSchoolYear === 'function') refreshLessonBuilderForSchoolYear();
            if (typeof refreshStudentPreview === 'function') refreshStudentPreview();
        }
        await loadContentManagement();
        const result = data || {};
        showToast(`Cleared ${Number(result.lessons_deleted || 0)} lessons, ${Number(result.questions_deleted || 0)} questions, and ${Number(result.settings_deleted || 0)} settings.`);
    } catch (error) {
        console.error('[clear school year content]', error);
        showErrorToast(error.message || 'Could not clear curriculum content.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = oldHtml || '<i class="fa-solid fa-trash mr-2"></i>Clear Selected Content'; }
    }
}
