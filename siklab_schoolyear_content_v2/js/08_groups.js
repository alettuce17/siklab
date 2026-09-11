/* =========================================================
 * GROUP SETS - SUPABASE
 * Table expected: student_group_set
 * Columns: set_id, school_year_id, set_label, group_data(json/jsonb)
 * ========================================================= */

function renderGroupSetDropdown() {
    const select = document.getElementById('active-group-set');
    if (!select) return;

    let html = availableGroupSets.map(set => `
        <option value="${siklabSafe(set.id)}" ${set.id === currentGroupSetId ? 'selected' : ''}>
            ${siklabSafe(set.name)} ${set.id === currentGroupSetId ? '(Active)' : ''}
        </option>
    `).join('');

    html += '<option value="NEW_SET">+ Create New Set...</option>';
    select.innerHTML = html;

    const container = select.parentElement;
    let actionGroup = document.getElementById('set-action-buttons');
    if (!actionGroup && container) {
        actionGroup = document.createElement('div');
        actionGroup.id = 'set-action-buttons';
        actionGroup.className = 'flex gap-1 mt-2';
        actionGroup.innerHTML = `
            <button onclick="handleRenameCurrentSet()" class="text-[10px] bg-blue-500/20 hover:bg-blue-500 text-blue-200 px-2 py-1 rounded transition-colors font-bold"><i class="fa-solid fa-i-cursor mr-1"></i>Rename</button>
            <button onclick="handleDeleteCurrentSet()" class="text-[10px] bg-red-500/20 hover:bg-red-500 text-red-200 px-2 py-1 rounded transition-colors font-bold"><i class="fa-solid fa-trash-can mr-1"></i>Delete</button>
        `;
        container.appendChild(actionGroup);
    }
}

function nextGroupSetId() {
    const used = new Set(availableGroupSets.map(s => String(s.id).toUpperCase()));
    for (let code = 65; code <= 90; code++) {
        const candidate = String.fromCharCode(code);
        if (!used.has(candidate)) return candidate;
    }
    return null;
}

async function handleCreateNewSet() {
    const id = nextGroupSetId();
    if (!id) return showErrorToast('Maximum of 26 grouping sets reached.');

    const name = prompt('Enter a name for the new grouping set:', `Set ${id}`);
    if (!name) return renderGroupSetDropdown();

    availableGroupSets.push({ id, name: name.trim() || `Set ${id}` });
    currentGroupSetId = id;
    currentGroupSetName = name.trim() || `Set ${id}`;
    storedGroups = [];

    await saveGroupsToDB();
    renderGroupSetDropdown();
    renderGroupsUI();
    showToast(`${currentGroupSetName} created.`);
}

async function handleRenameCurrentSet() {
    const set = availableGroupSets.find(s => s.id === currentGroupSetId);
    if (!set) return;

    const newName = prompt(`Rename "${set.name}" to:`, set.name);
    if (!newName || newName.trim() === set.name) return;

    set.name = newName.trim();
    currentGroupSetName = set.name;
    await saveGroupsToDB();
    renderGroupSetDropdown();
    showToast(`Set renamed to ${currentGroupSetName}`);
}

async function handleDeleteCurrentSet() {
    if (availableGroupSets.length <= 1) return showErrorToast('You must have at least one set!');
    if (!confirm(`Delete "${currentGroupSetName}"?`)) return;

    try {
        const db = requireSupabase();
        const { error } = await db
            .from('student_group_set')
            .delete()
            .eq('school_year_id', window.currentSchoolYearId)
            .eq('set_label', currentGroupSetId);
        if (error) throw error;

        availableGroupSets = availableGroupSets.filter(s => s.id !== currentGroupSetId);
        currentGroupSetId = availableGroupSets[0].id;
        currentGroupSetName = availableGroupSets[0].name;
        await fetchGroupsFromDB();
        showToast('Group set deleted.');
    } catch (error) {
        console.error('[delete groups]', error);
        showErrorToast(error.message || 'Could not delete group set.');
    }
}

function saveSetsManifest() {
    // Group-set manifest is now stored in Supabase via group_data.name.
}

async function changeGroupSet() {
    const select = document.getElementById('active-group-set');
    if (!select) return;

    const value = select.value;
    if (value === 'NEW_SET') return handleCreateNewSet();

    currentGroupSetId = value;
    currentGroupSetName = availableGroupSets.find(s => s.id === value)?.name || `Set ${value}`;
    await fetchGroupsFromDB();
    showToast(`Switched to ${currentGroupSetName}`);
}

function normalizeGroupData(value) {
    if (!value) return { name: '', groups: [] };
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch (_) { return { name: '', groups: [] }; }
    }
    return value;
}

async function saveGroupsToDB() {
    if (!window.currentSchoolYearId || !currentGroupSetId) return;

    try {
        const db = requireSupabase();
        const payload = {
            school_year_id: window.currentSchoolYearId,
            set_label: currentGroupSetId,
            group_data: {
                name: currentGroupSetName,
                groups: storedGroups
            }
        };

        const { data: existing, error: lookupError } = await db
            .from('student_group_set')
            .select('set_id')
            .eq('school_year_id', window.currentSchoolYearId)
            .eq('set_label', currentGroupSetId)
            .maybeSingle();
        if (lookupError) throw lookupError;

        const result = existing
            ? await db.from('student_group_set').update(payload).eq('set_id', existing.set_id)
            : await db.from('student_group_set').insert(payload);

        if (result.error) throw result.error;
    } catch (error) {
        console.error('[save groups]', error);
        showErrorToast(error.message || 'Failed to save groups.');
    }
}

async function fetchGroupsFromDB() {
    if (!window.currentSchoolYearId) {
        storedGroups = [];
        renderGroupsUI();
        return;
    }

    try {
        const db = requireSupabase();
        const { data, error } = await db
            .from('student_group_set')
            .select('set_id,set_label,group_data')
            .eq('school_year_id', window.currentSchoolYearId)
            .order('set_label', { ascending: true });
        if (error) throw error;

        const rows = data || [];
        if (rows.length === 0) {
            availableGroupSets = [{ id: 'A', name: 'Set A' }];
            currentGroupSetId = 'A';
            currentGroupSetName = 'Set A';
            storedGroups = [];
            await saveGroupsToDB();
        } else {
            availableGroupSets = rows.map(row => {
                const parsed = normalizeGroupData(row.group_data);
                return {
                    id: row.set_label,
                    name: parsed.name || `Set ${row.set_label}`
                };
            });

            if (!availableGroupSets.some(s => s.id === currentGroupSetId)) {
                currentGroupSetId = availableGroupSets[0].id;
            }

            const activeRow = rows.find(row => row.set_label === currentGroupSetId) || rows[0];
            const parsed = normalizeGroupData(activeRow.group_data);
            currentGroupSetId = activeRow.set_label;
            currentGroupSetName = parsed.name || `Set ${activeRow.set_label}`;
            storedGroups = Array.isArray(parsed.groups) ? parsed.groups : [];
        }
    } catch (error) {
        console.error('[load groups]', error);
        storedGroups = [];
        showErrorToast(error.message || 'Could not load groups.');
    }

    renderGroupSetDropdown();
    renderGroupsUI();
}

function handleGenerateGroups() {
    applyMiddleware('GENERATE_GROUPS', null, async () => {
        if (students.length === 0) return showToast('No students available.');
        const numGroups = Number.parseInt(document.getElementById('num-groups').value, 10) || 4;
        const shuffled = [...students].sort(() => 0.5 - Math.random());
        storedGroups = Array.from({ length: numGroups }, () => []);
        shuffled.forEach((student, index) => storedGroups[index % numGroups].push(student));
        storedGroups = storedGroups.filter(group => group.length > 0);

        await saveGroupsToDB();
        renderGroupsUI();
        if (currentMatchType === 'group') resetSelections();
        showToast(`Teams evenly divided in ${currentGroupSetName}!`);
    });
}

function handleAddManualGroup() {
    applyMiddleware('ADD_MANUAL_GROUP', null, async () => {
        storedGroups.push([]);
        await saveGroupsToDB();
        renderGroupsUI();
        showToast(`Custom Group added to ${currentGroupSetName}!`);
        openEditGroupModal(storedGroups.length - 1);
    });
}

function deleteGroup(index) {
    applyMiddleware('DELETE_GROUP', null, async () => {
        storedGroups.splice(index, 1);
        await saveGroupsToDB();
        renderGroupsUI();
        if (currentMatchType === 'group') resetSelections();
        showToast('Group deleted.');
    });
}

function openEditGroupModal(index) {
    currentlyEditingGroup = index;
    const modal = document.getElementById('edit-group-modal');
    const box = document.getElementById('edit-group-box');
    document.getElementById('edit-group-title').innerText = `Edit Group ${index + 1} (${currentGroupSetName})`;
    renderEditGroupMembers();
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        box.classList.remove('scale-95');
    }, 10);
}

function closeEditGroupModal() {
    const modal = document.getElementById('edit-group-modal');
    const box = document.getElementById('edit-group-box');
    modal.classList.add('opacity-0');
    box.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        currentlyEditingGroup = null;
    }, 300);
}

function renderEditGroupMembers() {
    if (currentlyEditingGroup === null) return;

    const group = storedGroups[currentlyEditingGroup] || [];
    const membersContainer = document.getElementById('edit-group-members');
    const select = document.getElementById('add-to-group-select');

    membersContainer.innerHTML = group.map((s, idx) => `
        <div class="flex justify-between items-center p-2 border-b border-slate-200 last:border-0">
            <span class="font-bold text-slate-700">${siklabSafe(s.first)} ${siklabSafe(s.last)}</span>
            <button onclick="removeStudentFromGroup(${idx})" class="text-red-500 hover:bg-red-100 p-1 rounded transition-colors"><i class="fa-solid fa-times"></i></button>
        </div>
    `).join('');

    if (!group.length) membersContainer.innerHTML = '<p class="text-slate-400 text-center py-2 text-sm">No members in this group.</p>';

    const inGroupIds = group.map(s => String(s.id));
    const availableStudents = students.filter(s => !inGroupIds.includes(String(s.id)));

    select.innerHTML = '<option value="">-- Select Student --</option>' + availableStudents.map(s => {
        let otherGroup = -1;
        storedGroups.forEach((g, idx) => {
            if (g.find(gs => String(gs.id) === String(s.id))) otherGroup = idx;
        });
        const suffix = otherGroup > -1 ? ` (In Group ${otherGroup + 1})` : '';
        return `<option value="${Number(s.id)}">${siklabSafe(s.first)} ${siklabSafe(s.last)}${siklabSafe(suffix)}</option>`;
    }).join('');
}

async function removeStudentFromGroup(memberIndex) {
    if (currentlyEditingGroup === null) return;
    storedGroups[currentlyEditingGroup].splice(memberIndex, 1);
    await saveGroupsToDB();
    renderEditGroupMembers();
    renderGroupsUI();
}

async function addStudentToGroup() {
    if (currentlyEditingGroup === null) return;
    const select = document.getElementById('add-to-group-select');
    const studentId = select.value;
    if (!studentId) return;

    const student = students.find(s => String(s.id) === String(studentId));
    if (!student) return;

    let oldGroup = -1;
    storedGroups.forEach((group, idx) => {
        if (group.findIndex(s => String(s.id) === String(studentId)) > -1) oldGroup = idx;
    });

    if (oldGroup > -1 && oldGroup !== currentlyEditingGroup) {
        return showErrorToast(`${student.first} is already in Group ${oldGroup + 1}.`);
    }

    storedGroups[currentlyEditingGroup].push(student);
    await saveGroupsToDB();
    renderEditGroupMembers();
    renderGroupsUI();
}

function renderGroupsUI() {
    const container = document.getElementById('groups-container');
    if (!container) return;

    let html = storedGroups.map((group, index) => `
        <div class="bg-white rounded-3xl border-2 border-orange-100 p-5 shadow-sm group/card transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_12px_0_#fdba74] hover:border-orange-400 cursor-default relative">
            <div class="flex justify-between items-start mb-1 relative">
                <div>
                    <h4 class="font-black text-orange-600 text-xl tracking-wide flex items-center gap-2 mb-1"><i class="fa-solid fa-users text-orange-300"></i> Group ${index + 1}</h4>
                    <p class="text-xs font-bold text-slate-400">${group.length} Members</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="openEditGroupModal(${index})" class="w-8 h-8 rounded-full bg-blue-50 text-blue-500 hover:bg-blue-500 hover:text-white flex items-center justify-center"><i class="fa-solid fa-pen text-xs"></i></button>
                    <button onclick="deleteGroup(${index})" class="w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center"><i class="fa-solid fa-trash text-xs"></i></button>
                </div>
            </div>
            <ul class="space-y-2 pt-4 mt-3 border-t-2 border-dashed border-orange-100">
                ${group.map(s => `<li class="text-sm font-bold text-slate-700">${siklabSafe(s.first)} ${siklabSafe(s.last)}</li>`).join('') || '<li class="text-sm text-slate-400">No members</li>'}
            </ul>
        </div>
    `).join('');

    html += `
        <div onclick="handleAddManualGroup()" class="bg-orange-50/50 rounded-3xl border-2 border-dashed border-orange-300 p-5 shadow-sm hover:bg-orange-100 cursor-pointer flex flex-col items-center justify-center text-orange-400 min-h-[160px]">
            <i class="fa-solid fa-users-medical text-4xl mb-2"></i>
            <h4 class="font-black tracking-wide text-lg">Add Custom Group</h4>
            <p class="text-xs font-bold text-orange-300 mt-1">Create empty slot in ${siklabSafe(currentGroupSetName)}</p>
        </div>
    `;

    container.innerHTML = html;
}
