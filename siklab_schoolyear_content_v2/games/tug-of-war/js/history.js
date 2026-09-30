(function () {
  'use strict';
  const TW = window.TW, S = TW.storage;
  function validateRecord(h) {
    if (!h || typeof h !== 'object' || !h.id || !h.startedAt || !h.endedAt ||
        !Array.isArray(h.players) || h.players.length !== 2 || !Array.isArray(h.rounds) ||
        typeof h.finalPosition !== 'number' || !Number.isFinite(h.finalPosition))
      throw new Error('Invalid match history record.');
    return h;
  }
  function validateMany(list) {
    if (!Array.isArray(list)) throw new Error('History must be an array.');
    const valid = list.map(validateRecord);
    if (new Set(valid.map(h => h.id)).size !== valid.length) throw new Error('Duplicate match history IDs.');
    return valid;
  }
  function init() { if (!S.initialized('history')) S.write('history', []); }
  function all() { const list = S.read('history', []); return Array.isArray(list) ? list : []; }
  function save(list) { return S.write('history', validateMany(list)); }
  function add(match) {
    const list = all(); if (list.some(h => h.id === match.id)) return false;
    return save([validateRecord(match), ...list]);
  }
  function remove(id) { return save(all().filter(h => h.id !== id)); }
  function stats(list = all()) {
    const byId = {};
    let correct = 0, incorrect = 0, totalDuration = 0, draws = 0;
    list.forEach(h => {
      totalDuration += h.durationSeconds || 0;
      if (!h.winnerId) draws++;
      h.players.forEach(p => {
        const ref = byId[p.id] || (byId[p.id] = {id: p.id, name: p.name, avatar: p.avatar,
          wins: 0, matches: 0, correct: 0, incorrect: 0});
        ref.name = p.name; ref.matches++;
        const c = Number(h.correct?.[p.id] || 0), w = Number(h.incorrect?.[p.id] || 0);
        ref.correct += c; ref.incorrect += w; correct += c; incorrect += w;
        if (h.winnerId === p.id) ref.wins++;
      });
    });
    return {matches: list.length, draws, correct, incorrect,
      accuracy: correct + incorrect ? Math.round(100 * correct / (correct + incorrect)) : 0,
      averageDuration: list.length ? Math.round(totalDuration / list.length) : 0,
      players: Object.values(byId).sort((a,b) => b.wins - a.wins || a.name.localeCompare(b.name))};
  }
  TW.history = {init, all, save, add, remove, validateMany, stats};
})();
