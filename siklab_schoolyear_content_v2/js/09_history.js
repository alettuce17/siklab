/* =========================================================
 * MATCH HISTORY - SUPABASE
 * Table expected: player_score.custom_game_data
 * ========================================================= */

function parseHistoryPayload(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (_) { return null; }
}

async function loadHistory() {
    try {
        const db = requireSupabase();
        const { data, error } = await db
            .from('player_score')
            .select('score_id,custom_game_data')
            .not('custom_game_data', 'is', null)
            .order('score_id', { ascending: false });
        if (error) throw error;

        matchHistory = (data || [])
            .map(row => parseHistoryPayload(row.custom_game_data))
            .filter(Boolean);
    } catch (error) {
        console.error('[history]', error);
        matchHistory = [];
    }

    renderHistory();
}

function renderHistory() {
    const container = document.getElementById('history-list-container');
    if (!container) return;

    if (matchHistory.length === 0) {
        container.innerHTML = '<div class="text-center text-slate-400 mt-20"><i class="fa-solid fa-ghost text-6xl mb-4 opacity-50"></i><p class="text-xl font-bold">No matches played yet!</p></div>';
        return;
    }

    container.innerHTML = matchHistory.map(match => `
        <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div class="flex items-center gap-4 w-full md:w-1/3">
                <div class="bg-orange-100 text-orange-600 w-12 h-12 rounded-full flex items-center justify-center text-xl"><i class="fa-solid fa-gamepad"></i></div>
                <div>
                    <h4 class="font-black text-slate-800">${siklabSafe(match.game || 'SikLab Game')}</h4>
                    <p class="text-xs text-slate-400 font-bold"><i class="fa-regular fa-calendar mr-1"></i> ${siklabSafe(match.date || '')}</p>
                </div>
            </div>
            <div class="flex items-center justify-center gap-6 w-full md:w-1/3">
                <div class="text-center"><p class="text-[10px] font-bold text-blue-500 uppercase truncate w-24">${siklabSafe(match.p1Name || 'Player 1')}</p><p class="text-2xl font-black text-slate-800">${Number(match.p1Score || 0)}</p></div>
                <div class="text-xl font-black text-slate-300 italic">VS</div>
                <div class="text-center"><p class="text-[10px] font-bold text-red-500 uppercase truncate w-24">${siklabSafe(match.p2Name || 'Player 2')}</p><p class="text-2xl font-black text-slate-800">${Number(match.p2Score || 0)}</p></div>
            </div>
            <div class="w-full md:w-1/3 flex justify-end">
                <div class="bg-yellow-100 border border-yellow-300 px-4 py-2 rounded-xl text-center min-w-[120px]"><p class="text-[10px] font-bold text-yellow-600 uppercase tracking-widest">Winner</p><p class="font-black text-yellow-800 text-lg truncate">${siklabSafe(match.winner || '—')}</p></div>
            </div>
        </div>
    `).join('');
}

async function clearHistory() {
    applyMiddleware('CLEAR_HISTORY', null, async () => {
        if (!confirm('Clear all match history?')) return;

        try {
            const db = requireSupabase();
            const { error } = await db
                .from('player_score')
                .delete()
                .not('custom_game_data', 'is', null);
            if (error) throw error;

            matchHistory = [];
            renderHistory();
            showToast('Match history cleared.');
        } catch (error) {
            console.error('[clear history]', error);
            showErrorToast(error.message || 'Could not clear match history.');
        }
    });
}
