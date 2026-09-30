(function () {
  'use strict';
  const TW = window.TW, S = TW.storage;
  const base = () => ({pulls: 5, timeLimit: 20, delay: 2, order: 'random', sound: true,
    music: false, animation: 'full', wrongPenalty: 'none', retries: false,
    skipUnanswered: true, repeat: true, fullscreen: false, selectedPresetId: 'standard'});
  const presetSettings = (pulls, timeLimit) => ({...base(), pulls, timeLimit, selectedPresetId: ''});
  const initial = () => [
    {id: 'quick', name: 'Quick Match', config: presetSettings(3, 10)},
    {id: 'standard', name: 'Standard Match', config: presetSettings(5, 20)},
    {id: 'challenge', name: 'Challenge Match', config: presetSettings(7, 15)}
  ];
  function validate(source) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Invalid settings.');
    const obj = {...base(), ...source};
    if (!Number.isInteger(obj.pulls) || obj.pulls < 1 || obj.pulls > 15) throw new Error('Pulls to win must be 1–15.');
    if (!Number.isInteger(obj.timeLimit) || obj.timeLimit < 5 || obj.timeLimit > 180) throw new Error('Question timer must be 5–180 seconds.');
    if (typeof obj.delay !== 'number' || !Number.isFinite(obj.delay) || obj.delay < .5 || obj.delay > 8)
      throw new Error('Round delay must be 0.5–8 seconds.');
    if (!['random', 'sequential'].includes(obj.order)) throw new Error('Invalid question ordering.');
    if (!['none', 'low', 'full'].includes(obj.animation)) throw new Error('Invalid animation intensity.');
    if (!['none', 'cooldown3', 'cooldown5'].includes(obj.wrongPenalty)) throw new Error('Invalid incorrect-answer penalty.');
    for (const prop of ['sound','music','retries','skipUnanswered','repeat','fullscreen'])
      if (typeof obj[prop] !== 'boolean') throw new Error('Invalid ' + prop + ' setting.');
    if (typeof obj.selectedPresetId !== 'string') throw new Error('Invalid selected preset.');
    return obj;
  }
  function validatePresets(list) {
    if (!Array.isArray(list)) throw new Error('Presets must be an array.');
    const result = list.map(p => {
      if (!p || typeof p.id !== 'string' || !p.id.trim() || p.id.length > 120 ||
          typeof p.name !== 'string' || !p.name.trim() || p.name.length > 40) throw new Error('Invalid preset name or ID.');
      return {id: p.id, name: p.name.trim(), config: validate(p.config)};
    });
    if (new Set(result.map(x => x.id)).size !== result.length) throw new Error('Duplicate preset IDs.');
    return result;
  }
  function init() {
    if (!S.initialized('settings')) S.write('settings', base());
    if (!S.initialized('presets')) S.write('presets', initial());
  }
  function get() { try { return validate(S.read('settings', base())); } catch { return base(); } }
  function save(obj) { return S.write('settings', validate(obj)); }
  function allPresets() { const list = S.read('presets', []); return Array.isArray(list) ? list : []; }
  function savePresets(list) { return S.write('presets', validatePresets(list)); }
  function upsertPreset(p) {
    const list = allPresets(), item = {id: p.id || S.id(), name: p.name, config: validate(p.config)};
    const idx = list.findIndex(x => x.id === item.id);
    if (idx >= 0) list[idx] = item; else list.push(item);
    return savePresets(list);
  }
  function removePreset(id) {
    const ok = savePresets(allPresets().filter(p => p.id !== id));
    if (ok && get().selectedPresetId === id) save({...get(), selectedPresetId: ''});
    return ok;
  }
  function usePreset(id) {
    const p = allPresets().find(x => x.id === id);
    if (!p) throw new Error('Preset not found.');
    return save({...validate(p.config), selectedPresetId: id});
  }
  TW.settings = {base, initial, init, validate, validatePresets, get, save, allPresets, savePresets, upsertPreset, removePreset, usePreset};
})();
