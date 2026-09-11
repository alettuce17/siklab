/* =========================================================
 * ADMIN / REPORTS - SUPABASE
 * ========================================================= */

function renderAdminYearList() {
    const container = document.getElementById('admin-year-list');
    if (!container) return;

    container.innerHTML = schoolYears.map(sy => {
        const active = siklabIsActiveYear(sy.is_active);
        return `
            <tr class="hover:bg-slate-50 transition-colors group">
                <td class="p-4 border-b border-slate-100 font-black text-slate-700">${siklabSafe(sy.label)}</td>
                <td class="p-4 border-b border-slate-100">
                    ${active
                        ? '<span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold border border-green-200"><i class="fa-solid fa-circle-check"></i> Active Default</span>'
                        : '<span class="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-xs font-bold border border-slate-200"><i class="fa-solid fa-box-archive"></i> Archived</span>'}
                </td>
                <td class="p-4 border-b border-slate-100 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="manageSchoolYearContent(${Number(sy.year_id)})" class="text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white px-3 py-1.5 rounded font-bold transition-colors mr-2"><i class="fa-solid fa-boxes-stacked"></i> Content</button>
                    ${!active ? `<button onclick="setYearActive(${Number(sy.year_id)})" class="text-xs bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white px-3 py-1.5 rounded font-bold transition-colors mr-2">Set as Active</button>` : ''}
                    <button onclick="deleteSchoolYear(${Number(sy.year_id)})" class="text-xs bg-red-50 text-red-500 hover:bg-red-500 hover:text-white px-3 py-1.5 rounded font-bold transition-colors"><i class="fa-solid fa-trash"></i> Delete</button>
                </td>
            </tr>`;
    }).join('');
}

async function setYearActive(yearId) {
    if (!confirm('Set this as the active school year?')) return;

    try {
        const db = requireSupabase();
        const { error } = await db.rpc('set_active_school_year', {
            p_year_id: Number(yearId)
        });
        if (error) throw error;

        await fetchSchoolYears();
        renderAdminYearList();
        showToast('Active School Year Updated!');
    } catch (error) {
        console.error('[active year]', error);
        showErrorToast(error.message || 'Could not update active year.');
    }
}

async function deleteSchoolYear(yearId) {
    const year = schoolYears.find(sy => Number(sy.year_id) === Number(yearId));
    const label = year?.label || 'this school year';

    if (year && siklabIsActiveYear(year.is_active)) {
        return showErrorToast('The active school year cannot be deleted. Set another year as active first.');
    }

    if (!confirm(`Delete ${label}? This is allowed only when the school year has no students, lessons, or saved groups.`)) return;

    try {
        const db = requireSupabase();
        const checks = await Promise.all([
            db.from('student').select('student_id', { count: 'exact', head: true }).eq('school_year_id', Number(yearId)),
            db.from('lesson_modules').select('module_id', { count: 'exact', head: true }).eq('school_year_id', Number(yearId)),
            db.from('student_group_set').select('set_id', { count: 'exact', head: true }).eq('school_year_id', Number(yearId)),
            db.from('custom_question').select('question_id', { count: 'exact', head: true }).eq('school_year_id', Number(yearId)),
            db.from('game_settings').select('setting_id', { count: 'exact', head: true }).eq('school_year_id', Number(yearId))
        ]);

        for (const result of checks) {
            if (result.error) throw result.error;
        }

        const [studentsResult, lessonsResult, groupsResult, questionsResult, settingsResult] = checks;
        const relatedCount = Number(studentsResult.count || 0)
            + Number(lessonsResult.count || 0)
            + Number(groupsResult.count || 0)
            + Number(questionsResult.count || 0)
            + Number(settingsResult.count || 0);

        if (relatedCount > 0) {
            throw new Error('This school year still contains roster or curriculum data. Keep it archived, or clear its content first.');
        }

        const { error } = await db.from('school_years').delete().eq('year_id', Number(yearId));
        if (error) throw error;

        await fetchSchoolYears();
        renderAdminYearList();
        showToast('School Year Deleted.');
    } catch (error) {
        console.error('[delete year]', error);
        showErrorToast(error.message || 'Could not delete school year.');
    }
}

function parseUnlockedWeeks(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch (_) { return []; }
    }
    return [];
}

async function loadProgressReport() {
    const container = document.getElementById('admin-progress-list');
    const syLabel = document.getElementById('report-sy-label');
    if (syLabel) syLabel.innerText = window.currentSchoolYearLabel;
    if (!container || !window.currentSchoolYearId) return;

    container.innerHTML = '<tr><td colspan="4" class="text-center p-8 text-slate-400"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-2"></i><p>Generating report...</p></td></tr>';

    try {
        const db = requireSupabase();
        const { data: roster, error: rosterError } = await db
            .from('student')
            .select('student_id,first_name,last_name,section')
            .eq('school_year_id', window.currentSchoolYearId)
            .order('last_name');
        if (rosterError) throw rosterError;

        if (!roster?.length) {
            container.innerHTML = '<tr><td colspan="4" class="text-center p-8 text-slate-400 font-bold italic">No students found for this school year.</td></tr>';
            return;
        }

        const ids = roster.map(student => student.student_id);
        const { data: scores } = await db
            .from('player_score')
            .select('student_id,final_score')
            .in('student_id', ids);

        let progress = [];
        try {
            const result = await db.from('student_progress').select('student_name,stars,unlocked_weeks');
            if (!result.error) progress = result.data || [];
        } catch (_) {}

        container.innerHTML = roster.map(student => {
            const scoreTotal = (scores || [])
                .filter(row => Number(row.student_id) === Number(student.student_id))
                .reduce((sum, row) => sum + (Number(row.final_score) || 0), 0);

            const fullName = `${student.first_name} ${student.last_name}`.trim().toLowerCase();
            const p = progress.find(row => String(row.student_name || '').trim().toLowerCase() === fullName);
            const stars = p ? Number(p.stars || 0) : scoreTotal;
            const unlocked = parseUnlockedWeeks(p?.unlocked_weeks);
            const lessonsDone = Math.max(0, unlocked.length ? unlocked.length - 1 : 0);

            return `
                <tr class="hover:bg-emerald-50/30 transition-colors border-b border-slate-100 last:border-0">
                    <td class="p-4 font-black text-slate-700">${siklabSafe(student.last_name)}, ${siklabSafe(student.first_name)}</td>
                    <td class="p-4 text-slate-500 font-bold text-sm">${siklabSafe(student.section || '')}</td>
                    <td class="p-4 text-center"><span class="bg-yellow-100 text-yellow-700 font-black px-3 py-1 rounded-full"><i class="fa-solid fa-star text-yellow-500"></i> ${stars}</span></td>
                    <td class="p-4 text-center"><span class="font-black text-emerald-600">${lessonsDone}</span><span class="text-xs text-slate-400 font-bold ml-1">Lessons Done</span></td>
                </tr>`;
        }).join('');
    } catch (error) {
        console.error('[progress report]', error);
        container.innerHTML = `<tr><td colspan="4" class="text-center p-8 text-red-400 font-bold">${siklabSafe(error.message || 'Error fetching report.')}</td></tr>`;
    }
}


async function manageSchoolYearContent(yearId) {
    const select = document.getElementById('school-year-filter');
    if (select) select.value = String(yearId);
    await changeSchoolYear(yearId);
    switchTab('curriculum');
}
