/* =========================================================
 * SCHOOL YEARS + CURRICULUM CREATION - SUPABASE
 * Requires migration 003 for copy-aware creation.
 * ========================================================= */

function siklabIsActiveYear(value) {
    return value === true || value === 1 || value === '1';
}

async function fetchSchoolYears() {
    try {
        const db = requireSupabase();
        const { data, error } = await db
            .from('school_years')
            .select('year_id,label,is_active')
            .order('year_id', { ascending: true });

        if (error) throw error;
        schoolYears = Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('[school years]', error);
        schoolYears = [];
        showErrorToast(error.message || 'Could not load school years.');
    }

    renderSchoolYearDropdown();
    populateNewYearCopySources();
    if (typeof populateContentCopySelectors === 'function') populateContentCopySelectors();
}

function renderSchoolYearDropdown() {
    const select = document.getElementById('school-year-filter');
    if (!select) return;

    if (schoolYears.length === 0) {
        select.innerHTML = '<option value="">No school year yet</option>';
        window.currentSchoolYearId = null;
        window.currentSchoolYearLabel = '';
        currentSchoolYearId = null;
        currentSchoolYearLabel = '';
        return;
    }

    select.innerHTML = schoolYears.map(sy => {
        const activeSuffix = siklabIsActiveYear(sy.is_active) ? ' • Active' : '';
        return `<option value="${Number(sy.year_id)}">${siklabSafe(sy.label)}${activeSuffix}</option>`;
    }).join('');

    const existing = schoolYears.find(sy => Number(sy.year_id) === Number(window.currentSchoolYearId));
    const activeYear = existing || schoolYears.find(sy => siklabIsActiveYear(sy.is_active)) || schoolYears[0];
    setCurrentSchoolYearState(activeYear);
    select.value = String(window.currentSchoolYearId);
}

function setCurrentSchoolYearState(year) {
    window.currentSchoolYearId = year ? Number(year.year_id) : null;
    window.currentSchoolYearLabel = year?.label || '';
    currentSchoolYearId = window.currentSchoolYearId;
    currentSchoolYearLabel = window.currentSchoolYearLabel;

    const syLabel = document.getElementById('selector-sy-label');
    if (syLabel) syLabel.innerText = window.currentSchoolYearLabel;

    const contentLabel = document.getElementById('content-current-year-label');
    if (contentLabel) contentLabel.innerText = window.currentSchoolYearLabel || 'No school year selected';
}

async function changeSchoolYear(yearId) {
    const parsed = Number.parseInt(yearId, 10);
    const selected = schoolYears.find(sy => Number(sy.year_id) === parsed);
    if (!selected) return showErrorToast('School year not found.');

    setCurrentSchoolYearState(selected);

    const select = document.getElementById('school-year-filter');
    if (select) select.value = String(parsed);

    currentGroupSetId = 'A';
    currentGroupSetName = 'Set A';
    availableGroupSets = [{ id: 'A', name: 'Set A' }];
    storedGroups = [];
    if (typeof renderGroupSetDropdown === 'function') renderGroupSetDropdown();

    try {
        if (typeof fetchStudentsFromDB === 'function') await fetchStudentsFromDB();
    } catch (error) {
        console.error('[school year roster refresh]', error);
    }
    if (typeof resetSelections === 'function') resetSelections();

    // Every content editor must reflect the newly selected year.
    if (typeof cancelEdit === 'function') cancelEdit();
    if (typeof loadCustomQuestions === 'function') await loadCustomQuestions();

    const settingsGame = document.getElementById('setting-game');
    if (settingsGame && typeof renderSettingsForm === 'function') {
        renderSettingsForm(settingsGame.value || '');
    }

    refreshLessonBuilderForSchoolYear();
    if (typeof loadContentManagement === 'function') await loadContentManagement();
    if (typeof refreshStudentPreview === 'function') refreshStudentPreview();
    if (typeof loadProgressReport === 'function') {
        const adminView = document.getElementById('view-admin');
        if (adminView && !adminView.classList.contains('hidden')) loadProgressReport();
    }

    showToast(`Switched to ${window.currentSchoolYearLabel}`);
}

function refreshLessonBuilderForSchoolYear() {
    const frame = document.getElementById('lesson-builder-frame');
    if (!frame || !frame.src) return;
    if (!frame.src.includes('lesson_builder.html')) return;

    // Reloading is intentional: a lesson draft must never remain attached to
    // the wrong school year after the teacher changes the global year selector.
    frame.src = `lesson_builder.html?year=${encodeURIComponent(window.currentSchoolYearId || '')}&t=${Date.now()}`;
}

function openAddYearModal() {
    const modal = document.getElementById('add-year-modal');
    const box = document.getElementById('add-year-box');
    if (!modal || !box) return;

    populateNewYearCopySources();
    setNewYearSetupMode(document.querySelector('input[name="new-year-mode"]:checked')?.value || 'empty');

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        box.classList.remove('scale-95');
        document.getElementById('new-year-input')?.focus();
    }, 10);
}

function closeAddYearModal() {
    const modal = document.getElementById('add-year-modal');
    const box = document.getElementById('add-year-box');
    if (!modal || !box) return;

    modal.classList.add('opacity-0');
    box.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        resetNewYearForm();
    }, 300);
}

function resetNewYearForm() {
    const input = document.getElementById('new-year-input');
    if (input) input.value = '';

    const emptyMode = document.querySelector('input[name="new-year-mode"][value="empty"]');
    if (emptyMode) emptyMode.checked = true;

    ['new-year-copy-lessons','new-year-copy-questions','new-year-copy-settings','new-year-set-active'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = true;
    });

    setNewYearSetupMode('empty');
}

function populateNewYearCopySources() {
    const select = document.getElementById('new-year-copy-source');
    if (!select) return;

    if (!schoolYears.length) {
        select.innerHTML = '<option value="">No existing year to copy</option>';
        return;
    }

    select.innerHTML = schoolYears
        .slice()
        .reverse()
        .map(year => `<option value="${Number(year.year_id)}">${siklabSafe(year.label)}${siklabIsActiveYear(year.is_active) ? ' • Active' : ''}</option>`)
        .join('');

    const active = schoolYears.find(year => siklabIsActiveYear(year.is_active));
    if (active) select.value = String(active.year_id);
}

function setNewYearSetupMode(mode) {
    const copyPanel = document.getElementById('new-year-copy-options');
    const isCopy = mode === 'copy';
    if (copyPanel) copyPanel.classList.toggle('hidden', !isCopy);
}

async function handleAddYear(event) {
    event.preventDefault();

    applyMiddleware('ADD_SCHOOL_YEAR', null, async () => {
        const label = document.getElementById('new-year-input')?.value.trim() || '';
        const mode = document.querySelector('input[name="new-year-mode"]:checked')?.value || 'empty';
        const sourceId = mode === 'copy'
            ? Number(document.getElementById('new-year-copy-source')?.value || 0)
            : null;
        const copyLessons = mode === 'copy' && !!document.getElementById('new-year-copy-lessons')?.checked;
        const copyQuestions = mode === 'copy' && !!document.getElementById('new-year-copy-questions')?.checked;
        const copySettings = mode === 'copy' && !!document.getElementById('new-year-copy-settings')?.checked;
        const setActive = !!document.getElementById('new-year-set-active')?.checked;

        if (!label) return showErrorToast('School year name is required.');
        if (mode === 'copy' && !sourceId) return showErrorToast('Choose a source school year.');
        if (mode === 'copy' && !copyLessons && !copyQuestions && !copySettings) {
            return showErrorToast('Choose at least one curriculum content type to copy.');
        }

        const submit = document.getElementById('new-year-submit');
        const oldHtml = submit?.innerHTML;
        if (submit) {
            submit.disabled = true;
            submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Creating...';
        }

        try {
            const db = requireSupabase();
            const { data, error } = await db.rpc('create_school_year_with_content', {
                p_label: label,
                p_source_year_id: sourceId || null,
                p_copy_lessons: copyLessons,
                p_copy_questions: copyQuestions,
                p_copy_settings: copySettings,
                p_set_active: setActive
            });
            if (error) throw error;

            const newYearId = Number(data);
            await fetchSchoolYears();
            if (newYearId) await changeSchoolYear(newYearId);

            closeAddYearModal();
            const copiedText = mode === 'copy' ? ' with curriculum copied' : ' as an empty curriculum';
            showToast(`${label} created${copiedText}.`);
        } catch (error) {
            console.error('[create school year]', error);
            const hint = String(error.message || '').includes('create_school_year_with_content')
                ? ' Run migration 003_school_year_content_management.sql first.'
                : '';
            showErrorToast((error.message || 'Failed to create school year.') + hint);
        } finally {
            if (submit) {
                submit.disabled = false;
                submit.innerHTML = oldHtml || 'Create School Year';
            }
        }
    });
}
