(function () {
  'use strict';
  const TW = window.TW = window.TW || {};
  const PREFIX = 'tugwar_';
  const keys = Object.freeze({
    questions: PREFIX + 'questions', players: PREFIX + 'players', settings: PREFIX + 'settings',
    presets: PREFIX + 'presets', history: PREFIX + 'history',
    currentMatch: PREFIX + 'current_match', selection: PREFIX + 'selection'
  });
  const clone = value => JSON.parse(JSON.stringify(value));
  const id = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() :
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,
    char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  function read(name, fallback) {
    const raw = localStorage.getItem(keys[name]);
    if (raw === null) return clone(fallback);
    try { return JSON.parse(raw); }
    catch (error) {
      console.error('Invalid stored JSON in ' + name, error);
      TW.storageErrors = TW.storageErrors || [];
      if (!TW.storageErrors.includes(name)) TW.storageErrors.push(name);
      return clone(fallback);
    }
  }
  function write(name, data) {
    try { localStorage.setItem(keys[name], JSON.stringify(data)); return true; }
    catch (error) {
      console.error('Unable to save ' + name, error);
      if (TW.app?.toast) TW.app.toast('Could not save. Browser storage may be full. Export a backup and remove large images.', true);
      return false;
    }
  }
  function initialized(name) { return localStorage.getItem(keys[name]) !== null; }
  function remove(name) { localStorage.removeItem(keys[name]); }
  function downloadJSON(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function loadJSONFile(file) {
    if (!file || file.size > 12 * 1024 * 1024) throw new Error('Choose a JSON file smaller than 12 MB.');
    try { return JSON.parse(await file.text()); }
    catch { throw new Error('The selected file is not valid JSON.'); }
  }
  TW.storage = {keys, id, clone, escapeHTML, read, write, remove, initialized, downloadJSON, loadJSONFile};
})();
