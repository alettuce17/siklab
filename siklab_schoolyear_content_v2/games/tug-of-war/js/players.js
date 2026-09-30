(function () {
  'use strict';
  const TW = window.TW, S = TW.storage;
  const avatars = ['🧑‍🚀', '👩‍🔬', '👨‍🔬', '🦊', '🐯', '🐼', '🐸', '🦁', '🦄', '🐱', '🌟', '🚀', '🌻', '🐻'];
  function initial() {
    return [{id: 'default-blue', name: 'Blue Explorer', avatar: '🧑‍🚀', color: '#4386f5'},
      {id: 'default-orange', name: 'Orange Explorer', avatar: '👩‍🔬', color: '#ff963f'}];
  }
  function validate(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Invalid player.');
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 40) throw new Error('Player name must be 1–40 characters.');
    if (!avatars.includes(p.avatar)) throw new Error('Select a valid avatar.');
    if (typeof p.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(p.color)) throw new Error('Select a valid color.');
    if (p.id != null && (typeof p.id !== 'string' || !p.id.trim() || p.id.length > 120)) throw new Error('Invalid player ID.');
    return {id: p.id || S.id(), name: p.name.trim(), avatar: p.avatar, color: p.color};
  }
  function validateMany(list) {
    if (!Array.isArray(list)) throw new Error('Players must be an array.');
    const result = list.map(validate);
    if (new Set(result.map(x => x.id)).size !== result.length) throw new Error('Duplicate player ID.');
    return result;
  }
  function init() { if (!S.initialized('players')) S.write('players', initial()); }
  function all() { const data = S.read('players', []); return Array.isArray(data) ? data : []; }
  function save(list) { return S.write('players', validateMany(list)); }
  function upsert(p) {
    const data = validate(p), list = all(), idx = list.findIndex(x => x.id === data.id);
    if (idx >= 0) list[idx] = data; else list.push(data);
    return save(list);
  }
  function remove(id) { return save(all().filter(p => p.id !== id)); }
  TW.players = {avatars, init, all, save, validateMany, upsert, remove};
})();
