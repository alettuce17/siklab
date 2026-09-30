/* SikLab dashboard bridge for the bundled Tug of Knowledge game. */
async function showTugQuickLaunch(path) {
    const selected = getModuleFromPath(path) === 'TUG';
    document.getElementById('tug-quick-launch')?.classList.toggle('hidden', !selected);
    if (!selected) return;
    await loadTugTopics();
    const label = document.getElementById('tug-question-count');
    const yearId = typeof settingsYearId === 'function' ? settingsYearId() : null;
    if (!yearId) { if (label) label.textContent = 'Select a school year first.'; return; }
    const topicId = getLaunchTugTopicId();
    if (!topicId) { if (label) label.textContent = 'Choose a topic before launching.'; return; }
    try {
        const { data, error } = await requireSupabase().from('custom_question')
            .select('answer_options,correct_ans')
            .eq('school_year_id', yearId).eq('game_module', 'TUG').eq('topic_id', topicId)
            .eq('review_status','approved').eq('question_type','mc');
        if (error) throw error;
        if (getModuleFromPath(document.getElementById('launch-game')?.value) !== 'TUG' ||
            settingsYearId() !== yearId) return;
        const count = (data || []).filter(q => Array.isArray(q.answer_options) && q.answer_options.length === 5 && Number(q.correct_ans) >= 0 && Number(q.correct_ans) < 5).length;
        if (label) label.textContent = count
            ? `${count} playable five-answer question${count === 1 ? '' : 's'} in this topic.`
            : 'No approved questions in this topic. Add questions before launching.';
    } catch (error) {
        if (label) label.textContent = 'Question count unavailable. You can still launch.';
        console.warn('[Tug question count]', error);
    }
}

function openTugQuestionBank() {
    switchTab('content');
    if (document.getElementById('cq-module')) document.getElementById('cq-module').value = 'TUG';
    if (typeof onQuestionModuleChanged === 'function') onQuestionModuleChanged('TUG');
    if (typeof qbSetPanel === 'function') qbSetPanel('settings');
}

function openTugSettings() {
    switchTab('settings');
    const path = allGames.find(game => getModuleFromPath(game.path) === 'TUG')?.path;
    if (path && document.getElementById('setting-game')) {
        document.getElementById('setting-game').value = path;
        renderSettingsForm(path);
    }
}

async function getTugLaunchPayload() {
    const yearId = typeof settingsYearId === 'function' ? settingsYearId() : null;
    if (!yearId) throw new Error('Select a school year first.');
    const topicId = getLaunchTugTopicId();
    if (!topicId) throw new Error('Choose a Tug topic before launching.');
    let p1, p2;
    try {
        p1 = JSON.parse(localStorage.getItem('siklab_active_p1'));
        p2 = JSON.parse(localStorage.getItem('siklab_active_p2'));
    } catch (_) { /* handled below */ }
    if (!p1?.id || !p2?.id || !p1?.name || !p2?.name || String(p1.id) === String(p2.id)) {
        throw new Error('Assign two different players or groups before launching.');
    }

    const db = requireSupabase();
    const [questionResult, settingsResult] = await Promise.all([
        db.from('custom_question')
            .select('question_id,prompt,answer_options,correct_ans,explanation,difficulty,time_limit,topic,question_set')
            .eq('school_year_id', yearId).eq('game_module', 'TUG').eq('topic_id', topicId)
            .eq('review_status', 'approved').eq('question_type', 'mc')
            .order('question_id', { ascending: true }),
        db.from('game_settings').select('settings_json')
            .eq('school_year_id', yearId).eq('game_module', 'TUG').maybeSingle()
    ]);
    if (questionResult.error) throw questionResult.error;
    if (settingsResult.error) throw settingsResult.error;
    const questions = (questionResult.data || []).filter(q =>
        typeof q.prompt === 'string' && q.prompt.trim() && q.prompt.length <= 1000 &&
        Array.isArray(q.answer_options) && q.answer_options.length === 5 &&
        q.answer_options.every(s => typeof s === 'string' && s.trim() && s.length <= 350) &&
        Number.isInteger(Number(q.correct_ans)) && Number(q.correct_ans) >= 0 && Number(q.correct_ans) < 5
    ).map(q => ({
        id: `siklab-${q.question_id}`, text: q.prompt, choices: q.answer_options,
        correct: Number(q.correct_ans), explanation: String(q.explanation || '').slice(0, 1200),
        category: String(q.topic || q.question_set || 'Science').slice(0, 80) || 'Science',
        difficulty: ['easy','medium','hard'].includes(String(q.difficulty || '').toLowerCase())
            ? String(q.difficulty).charAt(0).toUpperCase() + String(q.difficulty).slice(1).toLowerCase() : 'Medium',
        timeLimit: 0, // School-year Tug timer controls every question.
        image: ''
    }));
    if (!questions.length) throw new Error('No approved five-choice questions in this Tug topic. Edit older four-choice questions and add answer E.');
    const raw = settingsResult.data?.settings_json || {};
    const bounds = (value, fallback, min, max) => {
        const n = Number(value);
        return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
    };
    return {
        type: 'siklab_game_config', game: 'TUG', schoolYearId: yearId, topicId,
        players: [p1, p2].map((p, i) => ({ id: `siklab-p${i + 1}-${String(p.id).slice(0, 80)}`,
            name: String(p.name).slice(0, 40), avatar: i ? '👩‍🔬' : '🧑‍🚀',
            color: i ? '#ff963f' : '#4386f5' })),
        questions,
        settings: {
            pulls: Math.round(bounds(raw.pulls, 5, 1, 15)),
            timeLimit: Math.round(bounds(raw.timeLimit, 20, 5, 180)),
            delay: bounds(raw.delay, 2, .5, 8)
        }
    };
}

async function launchTugIntoIframe(gameIframe, gamePath) {
    const payload = await getTugLaunchPayload();
    gameIframe.onload = () => {
        try { gameIframe.contentWindow.postMessage(payload, window.location.origin); }
        finally { gameIframe.onload = null; }
    };
    gameIframe.src = gamePath;
    return payload;
}

const siklabSavedTugMatches = new Set();
window.addEventListener('message', async event => {
    if (event.origin !== window.location.origin || event.data?.type !== 'siklab_tug_result') return;
    const frame = document.getElementById('game-iframe');
    if (!frame || event.source !== frame.contentWindow ||
        getModuleFromPath(document.getElementById('launch-game')?.value) !== 'TUG') return;
    const result = event.data.result;
    if (!result?.id || !Array.isArray(result.players) || result.players.length !== 2 ||
        siklabSavedTugMatches.has(result.id)) return;
    siklabSavedTugMatches.add(result.id);
    const [p1, p2] = result.players;
    const p1Score = Number(result.correct?.[p1.id] || 0);
    const p2Score = Number(result.correct?.[p2.id] || 0);
    try {
        const customGameData = {
            game: 'Tug of Knowledge', matchId: result.id, schoolYearId: settingsYearId(),
            p1Name: String(p1.name || 'Player 1'), p2Name: String(p2.name || 'Player 2'),
            p1Score, p2Score,
            winner: result.winnerId === p1.id ? p1.name : result.winnerId === p2.id ? p2.name : 'TIE',
            date: new Date(result.endedAt || Date.now()).toLocaleString(),
            finalPosition: Number(result.finalPosition) || 0,
            questionsAnswered: Number(result.questionsAnswered) || 0
        };
        const { error } = await requireSupabase().from('player_score').insert({
            final_score: Math.max(p1Score, p2Score), custom_game_data: customGameData
        });
        if (error) throw error;
        if (typeof loadHistory === 'function') loadHistory();
    } catch (error) {
        siklabSavedTugMatches.delete(result.id);
        console.error('[Tug match history]', error);
        showErrorToast(error.message || 'Tug match finished, but history could not be saved.');
    }
});
