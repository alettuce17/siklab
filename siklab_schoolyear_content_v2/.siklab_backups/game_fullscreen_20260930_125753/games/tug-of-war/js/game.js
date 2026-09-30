(function () {
  'use strict';
  const TW = window.TW, S = TW.storage;
  let match = null, interval = null, transition = null, lastTick = -1;
  let lastResult = null;
  function clearTimers() {
    clearInterval(interval); clearTimeout(transition);
    interval = transition = null;
  }
  function snapshot() { if (match && match.phase !== 'GAME_OVER') S.write('currentMatch', match); }
  function playing() { return !!match && match.phase === 'QUESTION_ACTIVE' && !match.paused; }
  function isPlaying() { return !!match && !match.paused && ['QUESTION_ACTIVE','ROUND_RESULT'].includes(match.phase); }
  function get() { return match; }
  function last() { return lastResult; }
  function validMatch(m) {
    return m && typeof m === 'object' && m.id && Array.isArray(m.players) && m.players.length === 2 &&
      m.players[0].id !== m.players[1].id && m.settings && Number.isFinite(m.position) &&
      Array.isArray(m.used) && Array.isArray(m.rounds) && m.currentQuestionId &&
      m.correct && m.incorrect && m.roundWrong && m.attempted && m.retryUntil &&
      m.phase !== 'GAME_OVER' && !TW.history.all().some(h => h.id === m.id) &&
      TW.questions.all().some(q => q.id === m.currentQuestionId && q.choices.length === 5);
  }
  function stored() {
    const raw = S.read('currentMatch', null);
    try { return validMatch(raw) ? raw : null; } catch { return null; }
  }
  function playerIndex(id) { return match.players.findIndex(x => x.id === id); }
  function durationFor(q) { return q.timeLimit || match.settings.timeLimit; }
  function currentQuestion() { return TW.questions.all().find(q => q.id === match?.currentQuestionId) || null; }
  function shuffled(items) {
    for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
    return items;
  }
  function chooseNext(first = false) {
    const all = TW.questions.all().filter(q => q.choices.length === 5);
    if (!all.length) return null;
    const available = all.filter(q => !match.used.includes(q.id));
    if (!available.length) {
      if (!match.settings.repeat && !first) return null;
      const lastId = match.currentQuestionId;
      match.used = [];
      let pool = all.slice();
      if (match.settings.order === 'random') {
        shuffled(pool);
        if (pool.length > 1 && pool[0].id === lastId) [pool[0], pool[1]] = [pool[1], pool[0]];
      }
      if (pool.length) { match.used.push(pool[0].id); return pool[0]; }
      return null;
    }
    const pool = available.slice();
    if (match.settings.order === 'random') shuffled(pool);
    const selected = pool[0]; match.used.push(selected.id); return selected;
  }
  function resetRound() {
    match.attempted = [false, false]; match.retryUntil = [0, 0];
    match.roundWrong = [0, 0]; match.roundStartedAt = 0;
    match.timeRemaining = durationFor(currentQuestion());
    match.result = null;
  }
  function begin(p1, p2, selectedPresetId) {
    const ids = [p1, p2];
    if (ids[0] === ids[1]) throw new Error('Select two different players.');
    const all = TW.players.all(), chosen = ids.map(id => all.find(p => p.id === id));
    if (chosen.some(p => !p)) throw new Error('A selected player no longer exists.');
    if (!TW.questions.all().some(q => q.choices.length === 5)) throw new Error('Add at least one five-answer question. Edit older questions and fill in E.');
    const config = TW.settings.get();
    if (selectedPresetId && selectedPresetId !== 'custom') {
      if (!TW.settings.usePreset(selectedPresetId)) throw new Error('Could not apply game preset.');
    }
    const settings = TW.settings.get();
    clearTimers(); TW.animations.stopMusic(); TW.animations.unlock();
    match = {id: S.id(), players: S.clone(chosen), settings: S.clone(settings),
      startedAt: new Date().toISOString(), elapsedBefore: 0, activeStarted: Date.now(),
      position: 0, used: [], currentQuestionId: '', rounds: [], correct: {[p1]:0,[p2]:0},
      incorrect: {[p1]:0,[p2]:0}, roundWrong: [0,0], attempted: [false,false],
      retryUntil: [0,0], phase: 'READY', paused: false, roundStartedAt: 0, timeRemaining: settings.timeLimit,
      result: null};
    const first = chooseNext(true);
    if (!first) throw new Error('No valid question available.');
    match.currentQuestionId = first.id;
    resetRound(); snapshot();
    TW.app.show('game');
    TW.animations.music(match.settings);
    beginCountdown();
  }
  // A round starts immediately: no pre-question 3-2-1 countdown.
  function beginCountdown() {
    clearTimers();
    if (!match) return;
    match.paused = false;
    activateQuestion();
  }
  function activateQuestion() {
    if (!match || match.paused) return;
    match.phase = 'QUESTION_ACTIVE';
    match.roundStartedAt = Date.now();
    match.questionDeadline = match.roundStartedAt + match.timeRemaining * 1000;
    lastTick = -1;
    snapshot(); render();
    clearInterval(interval);
    interval = setInterval(() => {
      if (!playing()) return;
      match.timeRemaining = Math.max(0, (match.questionDeadline - Date.now()) / 1000);
      const seconds = Math.ceil(match.timeRemaining);
      if (seconds !== lastTick) {
        lastTick = seconds;
        if (seconds <= 5 && seconds > 0) TW.animations.effect('tick', match.settings);
      }
      const readout = document.getElementById('timer-readout');
      if (readout) { readout.textContent = seconds + 's'; readout.classList.toggle('danger', seconds <= 5); }
      const bar = document.getElementById('timer-bar');
      if (bar) bar.style.width = Math.max(0, match.timeRemaining / durationFor(currentQuestion()) * 100) + '%';
      const now = Date.now();
      const badges = document.querySelectorAll('[data-retry-badge]');
      badges.forEach((badge, idx) => {
        if (match.settings.retries && match.retryUntil[idx] > now) {
          badge.textContent = 'Retry in ' + Math.ceil((match.retryUntil[idx] - now)/1000) + 's';
        } else {
          if (match.settings.retries && match.retryUntil[idx]) {
            match.retryUntil[idx] = 0;
            document.querySelectorAll('#choices-' + idx + ' button').forEach(button => { button.disabled = false; });
            snapshot();
          }
          badge.textContent = match.attempted[idx] ? (match.settings.retries ? 'Ready to retry' : 'Answer used') : 'Ready to answer';
        }
      });
      if (match.timeRemaining <= 0) resolve(null, 'timeout');
    }, 90);
  }
  function submit(player, answer) {
    if (!playing() || !Number.isInteger(player) || ![0,1].includes(player) ||
      !Number.isInteger(answer) || answer < 0 || answer > 3) return false;
    const now = Date.now();
    if (match.questionDeadline <= now) { resolve(null, 'timeout'); return false; }
    if (match.attempted[player] && !match.settings.retries) return false;
    if (match.retryUntil[player] > now) return false;
    const q = currentQuestion(); if (!q) return false;
    const id = match.players[player].id;
    match.attempted[player] = true;
    if (answer === q.correct) {
      // Synchronous phase flip guarantees that exactly one answer may score, even for rapid inputs.
      match.phase = 'ROUND_RESULT';
      match.correct[id]++;
      match.position = Math.max(-match.settings.pulls, Math.min(match.settings.pulls,
        match.position + (player === 0 ? -1 : 1)));
      TW.animations.effect('correct', match.settings);
      resolve(player, 'correct');
      return true;
    }
    match.incorrect[id]++;
    match.roundWrong[player]++;
    const extra = match.settings.wrongPenalty === 'cooldown3' ? 3000 :
      match.settings.wrongPenalty === 'cooldown5' ? 5000 : 900;
    match.retryUntil[player] = now + extra;
    TW.animations.effect('wrong', match.settings);
    TW.animations.wrong(player);
    TW.app.toast(match.players[player].name + ': Not quite! ' + (match.settings.retries ? 'Try again after the cooldown.' : 'The other player can still answer.'));
    snapshot(); render();
    if (!match.settings.retries && match.attempted.every(Boolean)) resolve(null, 'bothIncorrect');
    return true;
  }
  function resolve(winnerIndex, reason) {
    if (!match || (match.phase !== 'QUESTION_ACTIVE' && !(match.phase === 'ROUND_RESULT' && reason === 'correct')) || match.result) return;
    clearInterval(interval); interval = null;
    match.phase = 'ROUND_RESULT';
    const q = currentQuestion();
    if (!q) return finish('noQuestions');
    match.timeRemaining = Math.max(0, (match.questionDeadline - Date.now()) / 1000);
    const round = {questionId: q.id, questionText: q.text, correctAnswer: q.choices[q.correct],
      winnerId: winnerIndex === null ? null : match.players[winnerIndex].id,
      wrongAttempts: [...match.roundWrong], reason, secondsUsed: Math.max(0, Math.round((Date.now() - match.roundStartedAt) / 1000))};
    match.rounds.push(round);
    match.result = {winnerIndex, reason};
    snapshot(); render();
    const duration = TW.animations.pull(match.position, match.settings.pulls,
      winnerIndex, match.settings.animation);
    const won = Math.abs(match.position) >= match.settings.pulls;
    transition = setTimeout(() => {
      if (!match || match.paused || match.phase !== 'ROUND_RESULT') return;
      if (won) return finish('boundary');
      if (reason === 'timeout' && !match.settings.skipUnanswered) {
        resetRound(); beginCountdown(); return;
      }
      nextQuestion();
    }, duration + match.settings.delay * 1000);
  }
  function nextQuestion() {
    if (!match) return;
    match.phase = 'NEXT_QUESTION';
    const next = chooseNext();
    if (!next) { finish('noQuestions'); return; }
    match.currentQuestionId = next.id;
    resetRound(); snapshot(); beginCountdown();
  }
  function finish(reason) {
    if (!match || match.phase === 'GAME_OVER') return;
    clearTimers(); TW.animations.stopMusic();
    match.phase = 'GAME_OVER';
    const winnerIndex = match.position <= -match.settings.pulls ? 0 :
      match.position >= match.settings.pulls ? 1 : null;
    const winnerId = winnerIndex === null ? null : match.players[winnerIndex].id;
    const durationSeconds = Math.max(0, Math.floor(match.elapsedBefore +
      (match.activeStarted ? (Date.now() - match.activeStarted) / 1000 : 0)));
    const data = {
      id: match.id, startedAt: match.startedAt, endedAt: new Date().toISOString(),
      players: S.clone(match.players), winnerId, finalPosition: match.position,
      pullsToWin: match.settings.pulls, correct: S.clone(match.correct), incorrect: S.clone(match.incorrect),
      rounds: S.clone(match.rounds), questionsAnswered: match.rounds.length,
      durationSeconds, reason
    };
    const saved = TW.history.add(data);
    lastResult = data;
    if (TW.siklab?.embedded && window.parent !== window) {
      window.parent.postMessage({type:'siklab_tug_result', result:data}, window.location.origin);
    }
    if (saved) S.remove('currentMatch');
    else TW.app.toast('Match ended, but history could not be saved. Export a backup and check browser space.', true);
    TW.app.show('victory');
    if (winnerIndex !== null) { TW.animations.effect('win', match.settings); TW.animations.confetti(); }
    match = null;
  }
  function resume() {
    const old = stored(); if (!old) throw new Error('There is no unfinished match to resume.');
    clearTimers();
    match = old;
    if (match.phase === 'ROUND_RESULT' && match.result) {
      match.paused = false;
      match.activeStarted = Date.now();
      TW.app.show('game');
      TW.animations.music(match.settings);
      const won = Math.abs(match.position) >= match.settings.pulls;
      transition = setTimeout(() => won ? finish('boundary') :
        (match.result?.reason === 'timeout' && !match.settings.skipUnanswered ? (resetRound(), beginCountdown()) : nextQuestion()),
        match.settings.delay * 1000);
      render();
      return;
    }
    // Restart an interrupted question fairly; remove its previous incorrect attempts from totals.
    match.players.forEach((p, i) => {
      match.incorrect[p.id] = Math.max(0, match.incorrect[p.id] - (match.roundWrong[i] || 0));
    });
    resetRound();
    match.paused = false;
    match.activeStarted = Date.now();
    TW.app.show('game'); TW.animations.music(match.settings); beginCountdown();
    TW.app.toast('Match restored. The interrupted question has a fresh timer.');
  }
  function pause() {
    if (!match || match.phase === 'GAME_OVER' || match.paused) return;
    if (match.phase === 'QUESTION_ACTIVE')
      match.timeRemaining = Math.max(0, (match.questionDeadline - Date.now()) / 1000);
    match.paused = true;
    match.elapsedBefore += Math.max(0, (Date.now() - match.activeStarted) / 1000);
    match.activeStarted = 0;
    clearTimers(); TW.animations.stopMusic(); snapshot(); render();
  }
  function unpause() {
    if (!match || !match.paused) return;
    match.paused = false; match.activeStarted = Date.now(); snapshot();
    TW.animations.music(match.settings);
    if (match.phase === 'ROUND_RESULT') {
      render();
      transition = setTimeout(() => {
        if (!match || match.paused) return;
        Math.abs(match.position) >= match.settings.pulls ? finish('boundary') :
          (match.result?.reason === 'timeout' && !match.settings.skipUnanswered ? (resetRound(), beginCountdown()) : nextQuestion());
      }, match.settings.delay * 1000);
    } else if (match.phase === 'QUESTION_ACTIVE') activateQuestion();
    else beginCountdown();
  }
  function abandon() {
    clearTimers(); TW.animations.stopMusic(); match = null; S.remove('currentMatch');
    TW.app.show('home');
  }
  function render() {
    if (!match || TW.app?.screen !== 'game') return;
    const q = currentQuestion(), E = S.escapeHTML;
    if (!q) return;
    const stage = document.getElementById('rope-stage'); if (!stage) return;
    const overlay = document.getElementById('game-overlay');
    if (overlay) {
      if (match.paused) overlay.innerHTML = '<div class="overlay-card"><span class="big-emoji">⏸️</span><h2>Game paused</h2><button class="btn primary" data-action="unpause">▶ Continue</button></div>';
      else overlay.innerHTML = '';
      overlay.classList.toggle('visible', match.paused || false);
    }
    const ropeText = document.getElementById('rope-position-number');
    if (ropeText) ropeText.textContent = (match.position > 0 ? '+' : '') + match.position + ' / ±' + match.settings.pulls;
    const round = document.getElementById('round-number');
    if (round) round.textContent = '#' + (match.rounds.length + (match.result ? 0 : 1));
    const question = document.getElementById('game-question');
    if (question) question.textContent = q.text;
    const image = document.getElementById('game-question-image');
    if (image) image.innerHTML = q.image ? '<img class="question-img" src="' + E(q.image) + '" alt="Question illustration">' : '';
    const banner = document.getElementById('round-result');
    if (banner) {
      if (match.result) {
        const winner = match.result.winnerIndex === null ? 'Nobody pulled this round' :
          E(match.players[match.result.winnerIndex].name) + ' gets the pull!';
        banner.innerHTML = '<strong>' + winner + '</strong><span>Answer: ' + E(q.choices[q.correct]) +
          (q.explanation ? ' — ' + E(q.explanation) : '') + '</span>';
        banner.classList.add('shown');
      } else { banner.innerHTML = ''; banner.classList.remove('shown'); }
    }
    match.players.forEach((p, i) => {
      const score = document.getElementById('player-score-' + i);
      if (score) score.textContent = match.correct[p.id] + ' correct · ' + match.incorrect[p.id] + ' incorrect';
      const badge = document.getElementById('badge-' + i);
      if (badge) badge.textContent = match.attempted[i] && !match.settings.retries ? 'Answer used' :
        match.attempted[i] && match.settings.retries ? 'Retry in a moment' : 'Ready to answer';
      const host = document.getElementById('choices-' + i);
      if (!host) return;
      host.innerHTML = q.choices.map((c, idx) => {
        const reveal = !!match.result;
        const mark = reveal && idx === q.correct ? 'correct-choice' : '';
        const disabled = match.phase !== 'QUESTION_ACTIVE' || match.paused ||
          (match.attempted[i] && !match.settings.retries) || match.retryUntil[i] > Date.now();
        const letter = 'ABCDE'[idx];
        return '<button type="button" class="answer-btn ' + mark + '" data-action="answer" data-player="' + i +
          '" data-answer="' + idx + '" ' + (disabled ? 'disabled' : '') + '><kbd class="controller-key key-' + idx + '">' + letter + '</kbd><span>' +
          E(c) + '</span></button>';
      }).join('');
    });
    const timer = document.getElementById('timer-readout');
    if (timer) timer.textContent = Math.ceil(match.timeRemaining) + 's';
    const bar = document.getElementById('timer-bar');
    if (bar) bar.style.width = Math.max(0, match.timeRemaining / durationFor(q) * 100) + '%';
    TW.animations.pull(match.position, match.settings.pulls, null, match.settings.animation);
  }
  TW.game = {begin, resume, stored, submit, get, last, pause, unpause, abandon, render, isPlaying, playing};
})();
