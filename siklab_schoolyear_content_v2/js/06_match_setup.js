/* =========================================================
 * --- MATCH SETUP & SELECTOR MODAL LOGIC --- 
 * ========================================================= */
function setMatchType(type) {
    currentMatchType = type;
    const indivBtn = document.getElementById('toggle-indiv'); const groupBtn = document.getElementById('toggle-group');
    if (type === 'individual') { 
        indivBtn.className = "px-5 py-1.5 text-sm font-bold rounded-lg bg-white text-orange-600 shadow-sm transition-all"; 
        groupBtn.className = "px-5 py-1.5 text-sm font-bold rounded-lg text-slate-500 hover:text-slate-700 transition-all"; 
    } else { 
        groupBtn.className = "px-5 py-1.5 text-sm font-bold rounded-lg bg-white text-orange-600 shadow-sm transition-all"; 
        indivBtn.className = "px-5 py-1.5 text-sm font-bold rounded-lg text-slate-500 hover:text-slate-700 transition-all"; 
    }
    
    localStorage.removeItem('siklab_active_p1');
    localStorage.removeItem('siklab_active_p2');
    resetSelections();
}

function openSelectorModal(playerNum) {
    activeSelectionTarget = playerNum;
    const modal = document.getElementById('selector-modal');
    const box = document.getElementById('selector-box');
    const title = document.getElementById('selector-title');
    const search = document.getElementById('selector-search');

    title.innerText = `Select ${currentMatchType === 'individual' ? 'Student' : 'Group'} for Player ${playerNum}`;
    search.value = "";
    
    renderSelectorList("");

    modal.classList.remove('hidden');
    setTimeout(() => { modal.classList.remove('opacity-0'); box.classList.remove('scale-90'); search.focus(); }, 10);
}

function closeSelectorModal() {
    const modal = document.getElementById('selector-modal');
    const box = document.getElementById('selector-box');
    modal.classList.add('opacity-0'); box.classList.add('scale-90');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

function filterSelectorList(query) { renderSelectorList(query.toLowerCase()); }

function renderSelectorList(filter = "") {
    const container = document.getElementById('selector-list');
    let items = [];

    if (currentMatchType === 'individual') {
        items = students.filter(s => s.first.toLowerCase().includes(filter) || s.last.toLowerCase().includes(filter) || String(s.id).includes(filter))
            .map(s => ({ id: s.id, name: `${s.first} ${s.last}`, sub: `LRN: ${s.lrn || 'N/A'}`, type: 'individual' }));
    } else {
        items = storedGroups.map((g, idx) => ({ id: `group_${idx}`, name: `Group ${idx + 1}`, sub: `${g.length} Members Assigned`, type: 'group' }))
            .filter(g => g.name.toLowerCase().includes(filter));
    }

    if (items.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-slate-400 font-bold"><p>No results found for "${escapeHtml(filter)}"</p></div>`; return;
    }

    container.innerHTML = items.map(item => {
        const isOther = String(activeSelectionTarget === 1 ? selectedP2?.id : selectedP1?.id) === String(item.id);
        const isCurrent = String(activeSelectionTarget === 1 ? selectedP1?.id : selectedP2?.id) === String(item.id);

        return `
            <div onclick="${isOther ? '' : `selectParticipant('${item.id}', '${item.name.replace(/'/g, "\\'")}', '${item.type}')`}" 
                 class="flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer 
                 ${isOther ? 'bg-slate-50 border-slate-100 opacity-40 cursor-not-allowed' : 
                   isCurrent ? 'bg-orange-50 border-orange-400' : 'bg-white border-slate-100 hover:border-orange-200 hover:shadow-md'} group">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-full flex items-center justify-center text-xl ${currentMatchType === 'individual' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}">
                        <i class="fa-solid ${currentMatchType === 'individual' ? 'fa-user-graduate' : 'fa-users-rays'}"></i>
                    </div>
                    <div class="text-left"><p class="font-black text-slate-800">${escapeHtml(item.name)}</p><p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">${item.sub}</p></div>
                </div>
                ${isOther ? '<span class="text-[10px] font-bold text-slate-400 uppercase">Already picked</span>' : isCurrent ? '<i class="fa-solid fa-circle-check text-orange-500 text-xl"></i>' : '<i class="fa-solid fa-chevron-right text-slate-300 group-hover:translate-x-1 transition-transform"></i>'}
            </div>`;
    }).join('');
}

function selectParticipant(id, name, type) {
    const data = { id, name, type };
    if (activeSelectionTarget === 1) selectedP1 = data; else selectedP2 = data;
    updateSetupDisplay(); closeSelectorModal();
}


function updateSetupDisplay() {
    const updateCard = (num, data) => {
        const card = document.getElementById(`p${num}-display-card`);
        const avatar = document.getElementById(`p${num}-avatar`);
        const nameEl = document.getElementById(`p${num}-display-name`);
        const subEl = document.getElementById(`p${num}-display-sub`);
        
        if(!card) return;

        if (data) {
            nameEl.innerText = data.name;
            subEl.innerText = data.type === 'individual' ? "Click to change" : `Group Set ${currentGroupSetId}`;
            avatar.innerHTML = `<i class="fa-solid ${data.type === 'individual' ? 'fa-user-check' : 'fa-people-group'}"></i>`;
            card.classList.add('border-orange-400', 'bg-white', 'setup-card-glow');
        } else {
            nameEl.innerText = "Select Participant";
            subEl.innerText = "Click to browse";
            avatar.innerHTML = `<i class="fa-solid fa-user-plus"></i>`;
            card.classList.remove('border-orange-400', 'bg-white', 'setup-card-glow');
        }
    };
    updateCard(1, selectedP1); updateCard(2, selectedP2);
}

function resetSelections() {
    selectedP1 = null; selectedP2 = null;
    updateSetupDisplay();
    const setupBox = document.getElementById('live-match-setup-box');
    if (setupBox) {
        setupBox.classList.remove('border-green-500', 'shadow-[0_0_15px_rgba(34,197,94,0.5)]', 'border-red-500', 'shadow-[0_0_15px_rgba(239,68,68,0.5)]');
        setupBox.classList.add('border-orange-300');
    }
}

function saveMatchSetup() {
    applyMiddleware('SAVE_MATCH', null, () => {
        if (!selectedP1 || !selectedP2) return showErrorToast("Please select both slots for the match!");
        if (String(selectedP1.id) === String(selectedP2.id)) return showErrorToast("Participants must be different!");

        let p1Data, p2Data;
        if (currentMatchType === 'individual') {
            const p1 = students.find(s => String(s.id) === String(selectedP1.id)); 
            const p2 = students.find(s => String(s.id) === String(selectedP2.id));
            p1Data = { id: p1.id, name: `${p1.first} ${p1.last.charAt(0)}.` }; 
            p2Data = { id: p2.id, name: `${p2.first} ${p2.last.charAt(0)}.` };
        } else {
            const idx1 = parseInt(selectedP1.id.split('_')[1]); const idx2 = parseInt(selectedP2.id.split('_')[1]);
            const g1 = storedGroups[idx1]; const g2 = storedGroups[idx2];
            p1Data = { id: `g_${idx1}`, name: `GROUP ${idx1 + 1}`, members: g1.map(s=>s.first).join(', ') }; 
            p2Data = { id: `g_${idx2}`, name: `GROUP ${idx2 + 1}`, members: g2.map(s=>s.first).join(', ') };
        }

        localStorage.setItem('siklab_active_p1', JSON.stringify(p1Data)); 
        localStorage.setItem('siklab_active_p2', JSON.stringify(p2Data));
        showToast(`${p1Data.name} vs ${p2Data.name} locked and assigned!`);
        
        const setupBox = document.getElementById('live-match-setup-box');
        if (setupBox) {
            setupBox.classList.remove('border-red-500', 'shadow-[0_0_15px_rgba(239,68,68,0.5)]', 'border-orange-300');
            setupBox.classList.add('border-green-500', 'shadow-[0_0_15px_rgba(34,197,94,0.5)]');
        }
    });
}

