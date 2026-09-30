(function () {
  'use strict';
  const TW = window.TW, S = TW.storage, E = S.escapeHTML;
  const app = {screen:'home', editId:null, editPresetId:null, questionImageData:'', questionSearch:'',
    questionCategory:'all', questionDifficulty:'all', selectedQuestions:new Set(),
    historySearch:'', historyWinner:'all', toastTimer:null};
  const root = () => document.getElementById('screen');
  const option = (value, label, current) => '<option value="' + E(value) + '" ' + (value === current ? 'selected' : '') + '>' + E(label) + '</option>';
  const head = (title, desc, actions = '') => '<div class="section-heading"><div><div class="eyebrow">TUG OF KNOWLEDGE</div><h1 class="page-title">' + title +
    '</h1><p class="muted">' + desc + '</p></div><div class="buttons">' + actions + '</div></div>';
  function toast(message, error = false) {
    const host = document.getElementById('toast-root');
    host.innerHTML = '<div class="toast ' + (error ? 'error' : '') + '">' + E(message) + '</div>';
    clearTimeout(app.toastTimer); app.toastTimer = setTimeout(() => host.innerHTML = '', 3900);
  }
  function modal(html) {
    document.getElementById('modal-root').innerHTML = '<div class="modal-backdrop" data-dismiss="modal"><div class="modal" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><span class="eyebrow">Preview & details</span><button type="button" class="btn small" data-action="close-modal">✕ Close</button></div>' + html + '</div></div>';
  }
  function closeModal() { document.getElementById('modal-root').innerHTML = ''; }
  function button(action, text, extra = '') { return '<button type="button" class="btn ' + extra + '" data-action="' + action + '">' + text + '</button>'; }
  function navigate(screen) {
    if (app.screen === 'game' && screen !== 'game') TW.game.pause();
    TW.animations.stopMusic(); show(screen);
  }
  function show(screen) {
    app.screen = screen;
    const view = {
      home, selection, questions, 'question-edit':questionEditor, players,
      'player-edit':playerEditor, settings:settingsPage, presets,
      'preset-edit':presetEditor, game:gamePage, victory, history, stats, backup
    }[screen];
    if (!view) return show('home');
    document.body.classList.toggle('tug-round-active', screen === 'game');
    root().innerHTML = view();
    document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active', b.dataset.screen === screen));
    document.getElementById('site-nav').classList.remove('open');
    if (screen === 'game') TW.game.render();
    if (screen === 'victory' && TW.game.last()?.winnerId) TW.animations.confetti();
    if (screen !== 'game') scrollTo({top:0, behavior:'instant'});
  }
  function mascot(kind) {
    // Local inline vector illustration: no external asset, font or internet required.
    const right = kind === 2;
    return `<svg class="boba-mascot" viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Smiling bubble tea mascot">
      <ellipse cx="101" cy="205" rx="73" ry="10" fill="#7b3b1d" opacity=".13"/>
      <g class="mascot-body">
        <path d="M47 61 Q42 57 44 75 L57 178 Q61 194 79 194 H121 Q140 194 144 178 L157 75 Q159 57 153 61 Z" fill="${right?'#f6ba70':'#ff9b35'}" stroke="#874323" stroke-width="5" stroke-linejoin="round"/>
        <path d="M53 78 H149 L142 113 H59Z" fill="#fff3dd" opacity=".7"/>
        <path d="M59 148 Q102 164 142 146 L139 174 Q137 187 122 188 H79 Q66 187 63 174 Z" fill="#b96538" opacity=".6"/>
        <g fill="#593123"><circle cx="74" cy="167" r="9"/><circle cx="96" cy="179" r="8"/><circle cx="120" cy="166" r="10"/><circle cx="133" cy="177" r="6"/><circle cx="83" cy="186" r="6"/></g>
        <path d="M42 61 Q42 51 56 51 H144 Q160 51 160 61 L158 72 H44Z" fill="#613823" stroke="#613823" stroke-width="4"/>
        <rect x="81" y="9" width="13" height="53" rx="6" fill="#fff7e6" stroke="#80482c" stroke-width="3" transform="rotate(-13 88 60)"/>
        <ellipse cx="102" cy="60" rx="63" ry="12" fill="#6f3c27"/>
        <ellipse cx="102" cy="57" rx="57" ry="8" fill="#ffe9bb"/>
        <ellipse cx="80" cy="120" rx="10" ry="13" fill="#42251e"/><ellipse cx="119" cy="120" rx="10" ry="13" fill="#42251e"/>
        <circle cx="83" cy="115" r="4" fill="white"/><circle cx="122" cy="115" r="4" fill="white"/>
        <ellipse cx="62" cy="138" rx="12" ry="6" fill="#e16d67" opacity=".65"/><ellipse cx="139" cy="138" rx="12" ry="6" fill="#e16d67" opacity=".65"/>
        <path d="M91 137 Q100 149 109 137" fill="none" stroke="#633228" stroke-width="4" stroke-linecap="round"/>
        <path d="M51 127 Q20 111 15 132" fill="none" stroke="#8b482a" stroke-width="11" stroke-linecap="round"/><circle cx="17" cy="132" r="8" fill="#fff1d7" stroke="#8b482a" stroke-width="3"/>
        <path d="M148 127 Q177 111 185 132" fill="none" stroke="#8b482a" stroke-width="11" stroke-linecap="round"/><circle cx="185" cy="132" r="8" fill="#fff1d7" stroke="#8b482a" stroke-width="3"/>
        <path d="M77 190 L65 202 M124 190 L138 202" stroke="#713a27" stroke-width="9" stroke-linecap="round"/>
      </g></svg>`;
  }
  function home() {
    const st = TW.history.stats(), unfinished = TW.game.stored(), count = TW.questions.all().length;
    return '<section class="hero"><div><span class="eyebrow">LEARN • RACE • PULL • WIN</span>' +
      '<h1>Sweet science.<br><em>Big brain energy!</em></h1><p>Two cute challengers, one mighty rope. Answer fast, pull hard, and sip your way to victory!</p>' +
      '<div class="buttons mt"><button class="btn huge light" data-action="navigate" data-screen="selection">⚡ Start a match →</button>' +
      (unfinished ? '<button class="btn huge orange" data-action="resume">↩ Resume match</button>' : '') + '</div></div>' +
      '<div class="hero-visual" aria-hidden="true"><span class="hero-doodle">✳ SWEET! ✳</span><div class="hero-mascots">' + mascot(1) + '<span class="hero-versus">VS</span>' + mascot(2) + '</div><span class="hero-sticker">100% FUN<br>100% SCIENCE</span></div></section>' +
      '<section class="grid three mt"><div class="mini-card"><div class="emoji">📚</div><div class="metric">' + count +
      '</div><strong>Science questions ready</strong><p class="help">Create, edit, delete or import your own.</p></div>' +
      '<div class="mini-card"><div class="emoji">🏆</div><div class="metric">' + st.matches + '</div><strong>Saved matches</strong><p class="help">Track wins and science accuracy.</p></div>' +
      '<div class="mini-card"><div class="emoji">🎮</div><div class="metric">2</div><strong>Players per round</strong><p class="help">One keyboard or independent touch controls.</p></div></section>' +
      '<section class="card mt"><h2>How it works</h2><div class="grid three"><div>🔵 <strong>Player 1:</strong> press <kbd>1</kbd>–<kbd>5</kbd> for A–E.</div>' +
      '<div>🟠 <strong>Player 2:</strong> press <kbd>6</kbd>–<kbd>0</kbd> for A–E.</div>' +
      '<div>🏁 Answer correctly first to pull. The first to reach the boundary wins!</div></div></section>';
  }
  function selection() {
    const people = TW.players.all(), presets = TW.settings.allPresets(), current = TW.settings.get(),
      prior = S.read('selection', {}), p1 = people.some(p => p.id === prior.p1) ? prior.p1 : people[0]?.id,
      p2 = people.some(p => p.id === prior.p2 && p.id !== p1) ? prior.p2 : people.find(p => p.id !== p1)?.id;
    return head('Choose your challengers', 'Pick two different players and a game mode.',
      button('navigate','👥 Manage players', 'small') .replace('data-action="navigate"','data-action="navigate" data-screen="players"')) +
      '<form id="start-form" class="card"><div class="grid two"><div class="player-pick"><h2>🔵 Player 1 — Left</h2><div class="field"><label for="select-p1">Select player</label><select id="select-p1" name="p1" required>' +
      people.map(p => option(p.id, p.avatar + ' ' + p.name, p1)).join('') + '</select></div><p class="help">Controls: 1, 2, 3, 4, 5</p></div>' +
      '<div class="player-pick orange-pick"><h2>🟠 Player 2 — Right</h2><div class="field"><label for="select-p2">Select player</label><select id="select-p2" name="p2" required>' +
      people.map(p => option(p.id, p.avatar + ' ' + p.name, p2)).join('') + '</select></div><p class="help">Controls: 6, 7, 8, 9, 0</p></div></div>' +
      '<div class="form-grid mt"><div class="field"><label for="select-preset">Game preset</label><select id="select-preset" name="preset">' +
      option('custom', 'Use current custom settings', !current.selectedPresetId ? 'custom' : current.selectedPresetId) +
      presets.map(p => option(p.id, p.name + ' (' + p.config.pulls + ' pulls / ' + p.config.timeLimit + 's)', current.selectedPresetId)).join('') +
      '</select></div><div class="panel"><strong>📚 ' + TW.questions.all().filter(q => q.choices.length === 5).length + ' five-answer questions available</strong><p class="help">' +
      E(current.order) + ' selection · Current setting: ' + current.pulls + ' pulls, ' + current.timeLimit + 's</p></div></div>' +
      '<div class="buttons mt"><button class="btn primary huge" type="submit" ' + (people.length < 2 || !TW.questions.all().some(q => q.choices.length === 5) ? 'disabled' : '') +
      '>Start tug of war ⚡</button>' + (TW.game.stored() ? '<button class="btn" type="button" data-action="resume">↩ Resume unfinished match</button>' : '') +
      '</div>' + (people.length < 2 ? '<p class="orange-text">Add at least two players to continue.</p>' : '') + '</form>';
  }
  function filteredQuestions() {
    const term = app.questionSearch.toLowerCase();
    return TW.questions.all().filter(q => (app.questionCategory === 'all' || q.category === app.questionCategory) &&
      (app.questionDifficulty === 'all' || q.difficulty === app.questionDifficulty) &&
      (!term || [q.text, q.category, ...q.choices].some(v => v.toLowerCase().includes(term))));
  }
  function questionRows() {
    const qs = filteredQuestions();
    return qs.length ? '<div class="table-wrap"><table class="table"><thead><tr><th><input type="checkbox" id="select-all-questions" aria-label="Select all visible questions"></th><th>Question</th><th>Category</th><th>Difficulty</th><th>Time</th><th>Actions</th></tr></thead><tbody>' +
      qs.map(q => '<tr><td><input class="question-check" type="checkbox" value="' + E(q.id) + '" ' + (app.selectedQuestions.has(q.id) ? 'checked' : '') +
      ' aria-label="Select question"></td><td><strong>' + E(q.text) + '</strong>' + (q.image ? ' 🖼️' : '') + '</td><td><span class="tag">' + E(q.category) +
      '</span></td><td>' + E(q.difficulty) + '</td><td>' + (q.timeLimit ? q.timeLimit + 's' : 'Preset') + '</td><td>' +
      '<button class="btn small" data-action="preview-question" data-id="' + E(q.id) + '">👁️</button> ' +
      '<button class="btn small" data-action="edit-question" data-id="' + E(q.id) + '">✏️</button> ' +
      '<button class="btn small danger" data-action="delete-question" data-id="' + E(q.id) + '">🗑️</button></td></tr>').join('') +
      '</tbody></table></div>' : '<div class="empty"><span class="emoji">📭</span>No questions match your filters. Try another search or add a question.</div>';
  }
  function questions() {
    const list = TW.questions.all(), categories = [...new Set(list.map(q => q.category))].sort();
    return head('Question bank', list.length + ' saved questions · All changes are stored locally.',
      '<button class="btn primary" data-action="new-question">＋ Add question</button>' +
      '<button class="btn" data-action="export-questions">⬇ Export JSON</button>') +
      '<section class="card">' + (list.some(q => q.choices.length !== 5) ? '<p class="help">Older four-answer questions are kept for editing. Add E to use them in a match.</p>' : '') + '<div class="toolbar mb"><div class="field" style="flex:2;min-width:190px"><label for="q-search">Search questions or answers</label><input id="q-search" type="search" value="' + E(app.questionSearch) + '" placeholder="Search science topics…"></div>' +
      '<div class="field" style="flex:1;min-width:140px"><label for="q-category">Category</label><select id="q-category">' +
      option('all','All categories',app.questionCategory) + categories.map(c => option(c,c,app.questionCategory)).join('') + '</select></div>' +
      '<div class="field" style="flex:1;min-width:130px"><label for="q-difficulty">Difficulty</label><select id="q-difficulty">' +
      ['all','Easy','Medium','Hard'].map(c => option(c,c === 'all' ? 'All difficulties' : c, app.questionDifficulty)).join('') +
      '</select></div></div><div class="buttons mb"><button class="btn small danger" data-action="bulk-delete-questions">🗑 Delete selected</button>' +
      '<button class="btn small danger" data-action="clear-questions">Delete all questions</button>' +
      '<span class="help" id="selected-count">' + app.selectedQuestions.size + ' selected</span></div><div id="question-list">' + questionRows() + '</div></section>';
  }
  function questionEditor() {
    const existing = TW.questions.all().find(q => q.id === app.editId), q = existing ||
      {text:'', choices:['','','','',''], correct:0, explanation:'', category:'Science', difficulty:'Easy', timeLimit:0, image:''};
    app.questionImageData = q.image;
    return head(existing ? 'Edit question' : 'Create question', 'Build a five-choice Grade 3 Science question.',
      '<button class="btn" data-action="navigate" data-screen="questions">← Question bank</button>') +
      '<form id="question-form" class="card form-grid"><div class="field wide"><label for="question-text">Question *</label><textarea id="question-text" name="text" maxlength="1000" required placeholder="What do plants need to grow?">' + E(q.text) + '</textarea></div>' +
      [...q.choices, ...Array(Math.max(0,5-q.choices.length)).fill('')].slice(0,5).map((c,i) => '<div class="field"><label for="choice-' + i + '">Answer ' + 'ABCDE'[i] + ' *</label><div class="choice-editor"><label class="controller-key key-' + i + '" for="choice-' + i + '">' + 'ABCDE'[i] + '</label>' +
      '<input id="choice-' + i + '" name="choice' + i + '" maxlength="350" value="' + E(c) + '" required></div></div>').join('') +
      '<div class="field"><label for="correct-answer">Correct answer *</label><select id="correct-answer" name="correct">' +
      [0,1,2,3,4].map(i => option(String(i), 'ABCDE'[i] + ' • ' + ['Red','Green','White','Blue','Yellow'][i], String(q.correct))).join('') + '</select></div>' +
      '<div class="field"><label for="category">Category *</label><input id="category" name="category" maxlength="80" list="category-suggestions" value="' + E(q.category) + '" required>' +
      '<datalist id="category-suggestions">' + [...new Set(TW.questions.all().map(x => x.category))].map(x => '<option value="' + E(x) + '"></option>').join('') + '</datalist></div>' +
      '<div class="field"><label for="difficulty">Difficulty</label><select name="difficulty" id="difficulty">' +
      ['Easy','Medium','Hard'].map(d => option(d,d,q.difficulty)).join('') + '</select></div>' +
      '<div class="field"><label for="question-limit">Time limit (seconds)</label><input id="question-limit" name="timeLimit" type="number" min="0" max="180" value="' + q.timeLimit + '" required><span class="help">0 = game timer; otherwise 5–180 seconds.</span></div>' +
      '<div class="field wide"><label for="explanation">Optional explanation</label><textarea id="explanation" name="explanation" maxlength="1200" placeholder="Explain why this answer is correct">' + E(q.explanation) + '</textarea></div>' +
      '<div class="field wide"><label for="question-image-input">Optional image (PNG, JPG, WebP, GIF; max 900 KB)</label><input type="file" id="question-image-input" name="image" accept="image/png,image/jpeg,image/webp,image/gif"><div id="image-preview">' +
      (q.image ? '<img class="question-img" src="' + E(q.image) + '" alt="Question illustration">' : '<span class="help">No image attached</span>') +
      '</div><label class="check-row"><input type="checkbox" id="remove-question-image"> Remove current image</label></div>' +
      '<div class="buttons wide"><button class="btn primary" type="submit">💾 Save question</button><button type="button" class="btn" data-action="navigate" data-screen="questions">Cancel</button></div></form>';
  }
  function players() {
    const people = TW.players.all();
    return head('Player profiles', people.length + ' saved players · Names in past match history stay intact.',
      '<button class="btn primary" data-action="new-player">＋ Add player</button>') +
      '<div class="grid">' + people.map(p => '<article class="card"><div class="player-tile"><div class="avatar" style="background:' + E(p.color) + '27;border:2px solid ' + E(p.color) + '">' + E(p.avatar) +
      '</div><div><h3 style="margin:0">' + E(p.name) + '</h3><small class="muted">' + E(p.color) + '</small></div></div><div class="buttons mt"><button class="btn small" data-action="edit-player" data-id="' + E(p.id) +
      '">✏️ Edit</button><button class="btn small danger" data-action="delete-player" data-id="' + E(p.id) + '">🗑 Delete</button></div></article>').join('') +
      '</div>' + (!people.length ? '<div class="empty">Add two players to start a match.</div>' : '');
  }
  function playerEditor() {
    const p = TW.players.all().find(x => x.id === app.editId) || {name:'',avatar:'🧑‍🚀',color:'#4386f5'};
    return head(app.editId ? 'Edit player' : 'Add player', 'Choose a name, avatar and signature color.',
      '<button class="btn" data-action="navigate" data-screen="players">← Players</button>') +
      '<form id="player-form" class="card form-grid"><div class="field wide"><label for="player-name">Player name *</label><input id="player-name" name="name" value="' + E(p.name) + '" maxlength="40" required></div>' +
      '<div class="field"><label for="player-avatar">Avatar</label><select id="player-avatar" name="avatar">' +
      TW.players.avatars.map(a => option(a,a,p.avatar)).join('') + '</select></div>' +
      '<div class="field"><label for="player-color">Player color</label><input id="player-color" type="color" name="color" value="' + E(p.color) + '"></div>' +
      '<div class="buttons wide"><button class="btn primary" type="submit">💾 Save player</button><button class="btn" type="button" data-action="navigate" data-screen="players">Cancel</button></div></form>';
  }
  function settingFields(cfg, prefix) {
    const field = (name, label, value, min, max, step = '1') => '<div class="field"><label for="' + prefix + name + '">' + label + '</label><input id="' + prefix + name + '" name="' + name + '" type="number" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '" required></div>';
    const pick = (name, label, pairs) => '<div class="field"><label for="' + prefix + name + '">' + label + '</label><select id="' + prefix + name + '" name="' + name + '">' + pairs.map(([v,l]) => option(v,l,cfg[name])).join('') + '</select></div>';
    const toggle = (name, label, hint) => '<label class="check-row"><input type="checkbox" name="' + name + '" ' + (cfg[name] ? 'checked' : '') + '> <span><strong>' + label + '</strong>' +
      (hint ? '<small class="help" style="display:block">' + hint + '</small>' : '') + '</span></label>';
    return '<div class="form-grid">' + field('pulls','Pulls required to win',cfg.pulls,1,15) +
      field('timeLimit','Default question timer (seconds)',cfg.timeLimit,5,180) +
      field('delay','Delay after each round (seconds)',cfg.delay,.5,8,.5) +
      pick('order','Question order',[['random','Random'],['sequential','Sequential']]) +
      pick('animation','Animation intensity',[['full','Full'],['low','Low'],['none','No movement animation']]) +
      pick('wrongPenalty','Incorrect-answer penalty',[['none','None (brief retry delay)'],['cooldown3','3-second retry cooldown'],['cooldown5','5-second retry cooldown']]) +
      '</div><fieldset class="mt"><legend>Match options</legend><div class="grid two">' +
      toggle('sound','Sound effects','Correct, incorrect, countdown and victory effects.') +
      toggle('music','Background music','Quiet, synthesized looping melody; no download required.') +
      toggle('retries','Allow incorrect-answer retries','A wrong answer locks that player briefly before they can retry.') +
      toggle('skipUnanswered','Skip unanswered questions','If disabled, a timed-out question is repeated with a fresh timer.') +
      toggle('repeat','Repeat questions after bank is exhausted','If disabled, the match ends in a draw when no questions remain and neither player has won.') +
      toggle('fullscreen','Try full-screen mode when a match begins','Chrome may require a direct button click; Esc exits full-screen.') +
      '</div></fieldset>';
  }
  function readConfig(form, selectedPresetId) {
    const f = new FormData(form), bool = key => f.has(key);
    return TW.settings.validate({pulls:Number(f.get('pulls')),timeLimit:Number(f.get('timeLimit')),
      delay:Number(f.get('delay')),order:f.get('order'),animation:f.get('animation'),
      wrongPenalty:f.get('wrongPenalty'),sound:bool('sound'),music:bool('music'),
      retries:bool('retries'),skipUnanswered:bool('skipUnanswered'),repeat:bool('repeat'),
      fullscreen:bool('fullscreen'),selectedPresetId});
  }
  function settingsPage() {
    const s = TW.settings.get(), p = TW.settings.allPresets().find(x => x.id === s.selectedPresetId);
    return head('Game settings', 'These settings control actual gameplay and become a snapshot when a match starts.',
      '<button class="btn" data-action="navigate" data-screen="presets">🎛️ Manage presets</button>') +
      '<form id="settings-form" class="card"><p class="tag">' + (p ? 'Active preset: ' + E(p.name) : 'Custom settings') +
      '</p><p class="help">Editing any field creates a custom configuration. Save it as a preset on the Presets screen if you want to reuse it.</p>' +
      settingFields(s,'game-') + '<div class="buttons mt"><button class="btn primary" type="submit">💾 Save game settings</button>' +
      '<button class="btn" type="button" data-action="reset-settings">↺ Restore defaults</button></div></form>';
  }
  function presets() {
    const all = TW.settings.allPresets(), current = TW.settings.get();
    return head('Game presets', 'Create, choose, edit and delete reusable classroom match setups.',
      '<button class="btn primary" data-action="new-preset">＋ New preset</button>') +
      '<div class="grid">' + all.map(p => '<article class="card preset-card ' + (current.selectedPresetId === p.id ? 'active' : '') + '">' +
      (current.selectedPresetId === p.id ? '<span class="tag selected-ribbon">✓ ACTIVE</span>' : '') +
      '<div class="emoji" style="font-size:37px">' + (p.config.pulls <= 3 ? '⚡' : p.config.pulls >= 7 ? '🔥' : '🎮') + '</div>' +
      '<h2>' + E(p.name) + '</h2><p><strong>' + p.config.pulls + '</strong> pulls to win · <strong>' + p.config.timeLimit +
      's</strong> per question</p><p class="help">' + E(p.config.order) + ' questions · ' + (p.config.retries ? 'Retry enabled' : 'One chance per player') + '</p>' +
      '<div class="buttons"><button class="btn small primary" data-action="use-preset" data-id="' + E(p.id) + '">▶ Select</button>' +
      '<button class="btn small" data-action="edit-preset" data-id="' + E(p.id) + '">✏️ Edit</button>' +
      '<button class="btn small danger" data-action="delete-preset" data-id="' + E(p.id) + '">🗑 Delete</button></div></article>').join('') +
      '</div>' + (!all.length ? '<div class="empty">No presets yet. Create one to begin.</div>' : '');
  }
  function presetEditor() {
    const found = TW.settings.allPresets().find(p => p.id === app.editPresetId),
      p = found || {name:'',config:{...TW.settings.get(),selectedPresetId:''}};
    return head(found ? 'Edit preset' : 'New game preset','Save an entire working game configuration, not just the name.',
      '<button class="btn" data-action="navigate" data-screen="presets">← Presets</button>') +
      '<form id="preset-form" class="card"><div class="field mb"><label for="preset-name">Preset name *</label><input id="preset-name" name="name" maxlength="40" required value="' + E(p.name) + '"></div>' +
      settingFields(p.config,'preset-') + '<div class="buttons mt"><button class="btn primary" type="submit">💾 Save preset</button>' +
      '<button class="btn" type="button" data-action="navigate" data-screen="presets">Cancel</button></div></form>';
  }
  function gamePage() {
    const m = TW.game.get();
    if (!m) return '<div class="empty">No active game. <button class="btn primary" data-action="navigate" data-screen="selection">Set up a match</button></div>';
    const p1=m.players[0], p2=m.players[1];
    return '<section class="game-shell"><div class="game-top"><div><div class="eyebrow">THE SWEETEST SCIENCE SHOWDOWN</div><h1 class="page-title" style="margin-bottom:0">🧋 Tug of knowledge</h1></div>' +
      '<div class="buttons"><div class="mini-stat">Round <span id="round-number">#1</span></div><div class="mini-stat">Rope <span id="rope-position-number">0</span></div>' +
      '<button class="btn" data-action="pause">⏸ Pause</button><button class="btn" data-action="leave-game">⌂ Menu</button>' +
      '<button class="btn danger" data-action="end-game">✕ End</button></div></div>' +
      '<div class="arena" id="rope-stage"><span class="arena-doodle doodle-one">✳</span><span class="arena-doodle doodle-two">✺</span><span class="arena-doodle doodle-three">♡</span><div class="ground"></div><div class="character p1" style="--player-color:' + E(p1.color) + '"><div class="face">' + mascot(1) +
      '</div><div class="name" title="' + E(p1.name) + '">' + E(p1.name) + '</div></div><div class="character p2" style="--player-color:' + E(p2.color) + '"><div class="face">' + mascot(2) +
      '</div><div class="name" title="' + E(p2.name) + '">' + E(p2.name) + '</div></div><div class="rope-zone"><div class="centerline"></div>' +
      '<div class="boundary left"><label>P1 WIN</label></div><div class="boundary right"><label>P2 WIN</label></div>' +
      '<div id="moving-rope" class="moving-rope"><div class="rope"></div><div class="ribbon">🎀</div></div></div>' +
      '<span id="rope-progress" class="rope-status">CENTER</span><div class="score-pill one" id="player-score-0"></div><div class="score-pill two" id="player-score-1"></div>' +
      '<div id="game-overlay" class="game-overlay" aria-live="polite"></div></div>' +
      '<section class="question-panel"><div class="eyebrow">FIRST CORRECT ANSWER GETS THE PULL</div><h2 id="game-question"></h2>' +
      '<div id="game-question-image"></div><div>⏳ <span id="timer-readout" class="timer-readout"></span></div>' +
      '<div class="timer-track"><div id="timer-bar" class="timer-bar"></div></div><div class="result-banner" id="round-result" aria-live="polite"></div></section>' +
      '<div class="answer-panels">' + [p1,p2].map((p,i) => '<section class="answer-panel" style="--player-color:' + E(p.color) + '"><div class="answer-head"><span><span class="small-avatar">' +
      E(p.avatar) + '</span> <span class="player-display-name" title="' + E(p.name) + '">' + E(p.name) + '</span></span><span class="ready" id="badge-' + i + '" data-retry-badge="' + i + '"></span></div>' +
      '<div class="answer-grid" id="choices-' + i + '"></div><p class="help" style="margin-bottom:0">' +
      (i === 0 ? 'Keyboard: 1 / 2 / 3 / 4 / 5' : 'Keyboard: 6 / 7 / 8 / 9 / 0') + '</p></section>').join('') + '</div></section>';
  }
  function victory() {
    const h = TW.game.last();
    if (!h) return head('Match finished', 'Find results in match history.') + '<button class="btn primary" data-action="navigate" data-screen="history">View history</button>';
    const winner = h.players.find(p => p.id === h.winnerId);
    return '<section class="victory"><div id="confetti" class="confetti"></div><div style="position:relative;z-index:1"><div class="eyebrow" style="color:#a3f2ff">MATCH COMPLETE</div>' +
      '<div class="champion">' + (winner ? E(winner.avatar) : '🤝') + '</div><h1>' + (winner ? E(winner.name) + ' wins!' : 'It’s a draw!') + '</h1>' +
      '<p>' + (winner ? 'Incredible thinking! You pulled the rope all the way home.' : 'No more unanswered questions in the bank. Great effort, everyone!') +
      '</p><div class="grid two mt" style="max-width:650px;margin:28px auto;text-align:left">' + h.players.map(p => '<div class="panel" style="color:#23375e"><h3>' + E(p.avatar) + ' ' + E(p.name) +
      '</h3><strong>' + h.correct[p.id] + ' correct</strong> · ' + h.incorrect[p.id] + ' incorrect</div>').join('') + '</div>' +
      '<p>' + h.questionsAnswered + ' questions · ' + h.durationSeconds + ' seconds · Final rope ' + h.finalPosition + '</p>' +
      '<div class="buttons"><button class="btn huge light" data-action="navigate" data-screen="selection">↺ Rematch</button>' +
      '<button class="btn huge light" data-action="navigate" data-screen="history">🏆 Match history</button>' +
      '<button class="btn huge light" data-action="navigate" data-screen="home">⌂ Home</button></div></div></section>';
  }
  function filteredHistory() {
    const term = app.historySearch.toLowerCase();
    return TW.history.all().filter(h => (app.historyWinner === 'all' || (app.historyWinner === 'draw' ? !h.winnerId : h.winnerId === app.historyWinner)) &&
      (!term || h.players.some(p => p.name.toLowerCase().includes(term)) || h.id.toLowerCase().includes(term)));
  }
  function historyRows() {
    const list = filteredHistory();
    return list.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Players</th><th>Winner</th><th>Questions</th><th>Duration</th><th>Actions</th></tr></thead><tbody>' +
      list.map(h => { const winner = h.players.find(p => p.id === h.winnerId);
        return '<tr><td>' + E(new Date(h.endedAt).toLocaleString()) + '</td><td>' + h.players.map(p => E(p.avatar + ' ' + p.name)).join(' vs. ') +
          '</td><td><span class="tag">' + (winner ? E(winner.name) : 'Draw') + '</span></td><td>' + h.questionsAnswered + '</td><td>' + h.durationSeconds +
          's</td><td><button class="btn small" data-action="detail-match" data-id="' + E(h.id) + '">👁️ Details</button> ' +
          '<button class="btn small danger" data-action="delete-match" data-id="' + E(h.id) + '">🗑️</button></td></tr>'; }).join('') +
      '</tbody></table></div>' : '<div class="empty"><span class="emoji">🏆</span>No matches found.</div>';
  }
  function history() {
    const all = TW.history.all(); const names = [...new Map(all.flatMap(h => h.players).map(p => [p.id,p])).values()];
    return head('Match history', all.length + ' completed matches stored on this browser.',
      '<button class="btn" data-action="export-history">⬇ Export history</button>' +
      '<button class="btn danger" data-action="clear-history">🗑 Clear history</button>') +
      '<section class="card"><div class="toolbar mb"><div class="field" style="flex:2;min-width:210px"><label for="history-search">Search player names or match ID</label><input id="history-search" type="search" value="' + E(app.historySearch) + '" placeholder="Search history…"></div>' +
      '<div class="field" style="flex:1;min-width:170px"><label for="history-winner">Winner</label><select id="history-winner">' +
      option('all','All results',app.historyWinner) + option('draw','Draws',app.historyWinner) +
      names.map(p => option(p.id,p.name,app.historyWinner)).join('') + '</select></div></div><div id="history-list">' + historyRows() + '</div></section>';
  }
  function stats() {
    const st = TW.history.stats();
    return head('Classroom statistics','Numbers are calculated only from actual saved match records.',
      '<button class="btn" data-action="navigate" data-screen="history">🏆 View matches</button>') +
      '<div class="grid three"><div class="mini-card">🏆<div class="metric">' + st.matches + '</div><strong>Total matches</strong></div>' +
      '<div class="mini-card">🎯<div class="metric">' + st.accuracy + '%</div><strong>Overall answer accuracy</strong><p class="help">Correct / (correct + incorrect) answer attempts.</p></div>' +
      '<div class="mini-card">⏱️<div class="metric">' + st.averageDuration + 's</div><strong>Average match duration</strong></div>' +
      '<div class="mini-card">✅<div class="metric">' + st.correct + '</div><strong>Correct answers</strong></div>' +
      '<div class="mini-card">❌<div class="metric">' + st.incorrect + '</div><strong>Incorrect answers</strong></div>' +
      '<div class="mini-card">🤝<div class="metric">' + st.draws + '</div><strong>Drawn matches</strong></div></div>' +
      '<section class="card mt"><h2>Player performance</h2>' + (st.players.length ? st.players.map(p => '<div class="leader"><div><strong>' + E(p.avatar) + ' ' + E(p.name) + '</strong>' +
      '<div class="help">' + p.matches + ' matches · ' + p.correct + ' correct / ' + p.incorrect + ' incorrect</div></div><div class="right"><strong>' + p.wins +
      ' wins</strong><div class="help">' + (p.correct + p.incorrect ? Math.round(p.correct / (p.correct + p.incorrect) * 100) : 0) + '% accuracy</div></div></div>').join('') :
      '<p class="muted">Finish a match to see player statistics.</p>') + '</section>';
  }
  function backup() {
    return head('Import, export & backup', 'Keep a portable copy of your offline game data.') +
      '<div class="grid two"><section class="card"><h2>⬇ Export data</h2><p class="help">JSON files can be imported into another Chrome browser or computer.</p><div class="buttons">' +
      '<button class="btn primary" data-action="export-backup">💾 Full backup</button><button class="btn" data-action="export-questions">📚 Questions</button>' +
      '<button class="btn" data-action="export-players">👥 Players</button><button class="btn" data-action="export-history">🏆 History</button></div></section>' +
      '<section class="card"><h2>⬆ Import questions</h2><p class="help">Merge skips existing question IDs. Replace removes your current question bank.</p>' +
      '<div class="field mb"><label for="import-mode">Import mode</label><select id="import-mode">' +
      option('merge','Merge (keep existing questions)','merge') + option('replace','Replace all questions','merge') + '</select></div>' +
      '<input class="file-input" id="import-questions-file" data-import="questions" type="file" accept=".json,application/json"></section>' +
      '<section class="card"><h2>🔁 Restore full backup</h2><p class="help">Restoring will replace questions, players, presets, settings, history and any unfinished match. Export a backup first if you need the existing data.</p>' +
      '<div class="import-zone"><input class="file-input" id="import-backup-file" data-import="backup" type="file" accept=".json,application/json"></div></section>' +
      '<section class="card"><h2>🔐 Where is everything stored?</h2><p>Data is saved in this Chrome profile and origin, not in an online account. Deleting site data or using a different profile may remove it.</p>' +
      '<p class="help">File URLs may have browser-specific localStorage isolation rules. Keep the folder in one location, use the same Chrome profile, and export backups frequently. Large images can reach storage limits.</p></section></div>';
  }
  function confirmAction(message, action) {
    if (window.confirm(message)) action();
  }
  function matchDetail(id) {
    const h = TW.history.all().find(x => x.id === id); if (!h) return;
    const winner = h.players.find(p => p.id === h.winnerId);
    modal('<h2>🏆 ' + (winner ? E(winner.name) + ' wins!' : 'Draw') + '</h2><p class="muted">' +
      E(new Date(h.endedAt).toLocaleString()) + '</p><p>' + h.players.map(p => E(p.avatar + ' ' + p.name)).join(' vs. ') +
      '</p><div class="panel">' + h.players.map(p => '<p><strong>' + E(p.name) + '</strong>: ' + (h.correct?.[p.id] || 0) + ' correct, ' +
      (h.incorrect?.[p.id] || 0) + ' incorrect</p>').join('') + '<p><strong>Rope:</strong> ' + h.finalPosition +
      ' / ±' + h.pullsToWin + ' · <strong>Duration:</strong> ' + h.durationSeconds + 's</p></div><h3>Round-by-round</h3>' +
      h.rounds.map((r,i) => '<div class="panel mb"><strong>#' + (i+1) + ' ' + E(r.questionText) + '</strong>' +
      '<p class="help">Answer: ' + E(r.correctAnswer) + ' · ' + (h.players.find(p => p.id === r.winnerId)?.name ?
        E(h.players.find(p => p.id === r.winnerId).name) + ' pulled' : E(r.reason)) + '</p></div>').join(''));
  }
  function previewQuestion(id) {
    const q = TW.questions.all().find(x => x.id === id); if (!q) return;
    modal('<h2>' + E(q.text) + '</h2><p><span class="tag">' + E(q.category) + '</span> <span class="tag">' + E(q.difficulty) +
      '</span></p>' + (q.image ? '<img class="question-img" src="' + E(q.image) + '" alt="Question illustration">' : '') +
      q.choices.map((c,i) => '<div class="preview-choice ' + (i === q.correct ? 'yes' : '') + '"><strong class="controller-key key-' + i + '">' + 'ABCDE'[i] +
      '</strong> ' + E(c) + (i === q.correct ? ' ✅' : '') + '</div>').join('') +
      (q.explanation ? '<p><strong>Explanation:</strong> ' + E(q.explanation) + '</p>' : '') +
      '<p class="help">Question timer: ' + (q.timeLimit ? q.timeLimit + 's' : 'Use match default') + '</p>');
  }
  function exportData(type) {
    const stamp = new Date().toISOString().slice(0,10);
    const data = type === 'backup' ? {
      app: 'tug-of-knowledge', schemaVersion: 1, exportedAt: new Date().toISOString(),
      data: {
        questions: TW.questions.all(), players: TW.players.all(), settings: TW.settings.get(),
        presets: TW.settings.allPresets(), history: TW.history.all(),
        currentMatch: TW.game.get() && TW.game.get().phase !== 'GAME_OVER' ? TW.game.get() : TW.game.stored(),
        selection: S.read('selection', {})
      }
    } : type === 'questions' ? TW.questions.all() : type === 'players' ? TW.players.all() : TW.history.all();
    S.downloadJSON('tug-of-knowledge-' + type + '-' + stamp + '.json', data);
    toast('Exported ' + type + ' JSON.');
  }
  function restoreFull(payload) {
    if (!payload || payload.app !== 'tug-of-knowledge' || payload.schemaVersion !== 1 ||
        !payload.data || typeof payload.data !== 'object') throw new Error('This is not a compatible Tug of Knowledge v1 backup.');
    const d = payload.data;
    const questions = TW.questions.validateMany(d.questions), players = TW.players.validateMany(d.players),
      settings = TW.settings.validate(d.settings), presets = TW.settings.validatePresets(d.presets),
      history = TW.history.validateMany(d.history);
    if (!d.selection || typeof d.selection !== 'object' || Array.isArray(d.selection)) throw new Error('Invalid selection in backup.');
    if (d.currentMatch !== null && d.currentMatch !== undefined) {
      const m = d.currentMatch;
      if (!m || typeof m !== 'object' || !m.id || !Array.isArray(m.players) || m.players.length !== 2 ||
          !m.currentQuestionId || !questions.some(q => q.id === m.currentQuestionId) ||
          !Array.isArray(m.used) || !Array.isArray(m.rounds) ||
          !m.correct || !m.incorrect || !m.attempted || !m.roundWrong || !m.retryUntil ||
          !Number.isFinite(m.position) || !m.settings || !m.phase)
        throw new Error('The unfinished match in this backup is invalid.');
    }
    const clean = {questions,players,settings,presets,history,
      currentMatch:d.currentMatch || null,selection:d.selection};
    const before = {};
    Object.keys(S.keys).forEach(key => before[key] = localStorage.getItem(S.keys[key]));
    try {
      for (const key of Object.keys(clean)) {
        if (clean[key] === null) S.remove(key);
        else if (!S.write(key,clean[key])) throw new Error('Not enough space to restore the backup.');
      }
    } catch (error) {
      for (const key of Object.keys(before)) {
        try { if (before[key] === null) S.remove(key); else localStorage.setItem(S.keys[key],before[key]); }
        catch (rollbackError) { console.error('Restore rollback failed:', rollbackError); }
      }
      throw error;
    }
    if (TW.game.get()) TW.game.pause();
    app.selectedQuestions.clear(); app.questionSearch = ''; app.historySearch = '';
    show('home'); toast('Full backup restored.');
  }
  async function handleImport(input) {
    const file = input.files?.[0]; if (!file) return;
    const type = input.dataset.import;
    const mode = document.getElementById('import-mode')?.value || 'merge';
    input.value = '';
    if (type === 'backup' && !window.confirm('Restore this full backup? This replaces ALL current game data.')) return;
    if (type === 'questions' && mode === 'replace' && !window.confirm('Replace every existing question with the imported bank?')) return;
    try {
      const data = await S.loadJSONFile(file);
      if (type === 'backup') restoreFull(data);
      else {
        const result = TW.questions.importList(data, mode);
        app.selectedQuestions.clear();
        if (app.screen === 'questions') show('questions');
        toast('Imported ' + result.added + ' questions; skipped ' + result.skipped + ' duplicate IDs.');
      }
    } catch (error) { toast(error.message || 'Import failed.', true); }
  }
  async function handleImageFile(input) {
    const file = input.files?.[0]; if (!file) return;
    if (!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type) || file.size > 900 * 1024) {
      input.value = ''; toast('Choose PNG, JPG, WebP or GIF under 900 KB.', true); return;
    }
    try {
      const uri = await new Promise((resolve,reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read image.'));
        reader.readAsDataURL(file);
      });
      app.questionImageData = String(uri);
      const preview = document.getElementById('image-preview');
      if (preview) preview.innerHTML = '<img class="question-img" alt="New question image" src="' + E(uri) + '">';
      const remove = document.getElementById('remove-question-image'); if (remove) remove.checked = false;
    } catch (error) { toast(error.message,true); }
  }
  function clickAction(event) {
    const target = event.target.closest('[data-action]'); if (!target) return;
    const a = target.dataset.action, id = target.dataset.id;
    try {
      switch (a) {
        case 'toggle-nav': document.getElementById('site-nav').classList.toggle('open'); break;
        case 'navigate': navigate(target.dataset.screen); break;
        case 'close-modal': closeModal(); break;
        case 'resume': TW.game.resume(); break;
        case 'pause': TW.game.pause(); break;
        case 'unpause': TW.game.unpause(); break;
        case 'leave-game': navigate('home'); toast('Match paused and saved. Resume from Home.'); break;
        case 'end-game': confirmAction('End this unfinished match? It will not count in match history.', () => { TW.game.abandon(); toast('Match ended.'); }); break;
        case 'answer': TW.game.submit(Number(target.dataset.player), Number(target.dataset.answer)); break;
        case 'new-question': app.editId = null; show('question-edit'); break;
        case 'edit-question': app.editId = id; show('question-edit'); break;
        case 'preview-question': previewQuestion(id); break;
        case 'delete-question': confirmAction('Delete this question?', () => {
          if (TW.questions.remove([id])) {app.selectedQuestions.delete(id);show('questions');toast('Question deleted.');}
        }); break;
        case 'bulk-delete-questions': {
          const ids = [...app.selectedQuestions]; if (!ids.length) return toast('Select questions to delete.');
          confirmAction('Delete ' + ids.length + ' selected questions?', () => {
            if (TW.questions.remove(ids)) { app.selectedQuestions.clear(); show('questions'); toast('Selected questions deleted.'); }
          }); break;
        }
        case 'clear-questions': confirmAction('Permanently delete ALL questions? Export them first if needed.', () => {
          if (TW.questions.save([])) { app.selectedQuestions.clear(); show('questions'); toast('Question bank cleared.'); }
        }); break;
        case 'new-player': app.editId = null;show('player-edit');break;
        case 'edit-player': app.editId = id;show('player-edit');break;
        case 'delete-player': confirmAction('Delete this player profile? Saved match history keeps the original name.', () => {
          if (TW.players.remove(id)) { show('players'); toast('Player deleted; saved history retained.'); }
        });break;
        case 'reset-settings': confirmAction('Restore default game settings?', () => {
          if (TW.settings.save(TW.settings.base())) {show('settings');toast('Defaults restored.');}
        });break;
        case 'new-preset': app.editPresetId = null;show('preset-edit');break;
        case 'edit-preset': app.editPresetId = id;show('preset-edit');break;
        case 'use-preset': if (TW.settings.usePreset(id)) {show('presets');toast('Preset applied to future matches.');}break;
        case 'delete-preset': confirmAction('Delete this game preset?', () => {
          if (TW.settings.removePreset(id)) {show('presets');toast('Preset deleted.');}
        });break;
        case 'detail-match': matchDetail(id);break;
        case 'delete-match': confirmAction('Delete this match history record?', () => {
          if (TW.history.remove(id)) {show('history');toast('Match record deleted.');}
        });break;
        case 'clear-history': confirmAction('Permanently clear ALL match history?', () => {
          if (TW.history.save([])) {show('history');toast('Match history cleared.');}
        });break;
        case 'export-backup': exportData('backup');break;
        case 'export-questions': exportData('questions');break;
        case 'export-players': exportData('players');break;
        case 'export-history': exportData('history');break;
      }
    } catch (error) { console.error(error); toast(error.message || 'Something went wrong.',true); }
  }
  function handleSubmit(event) {
    if (!['start-form','question-form','player-form','settings-form','preset-form'].includes(event.target.id)) return;
    event.preventDefault(); const form = event.target, f = new FormData(form);
    try {
      if (form.id === 'start-form') {
        const p1=f.get('p1'),p2=f.get('p2'),preset=f.get('preset');
        if (p1 === p2) throw new Error('Choose two different players.');
        if (TW.game.stored() && !window.confirm('Start a new match and discard the unfinished match?')) return;
        const presetConfig = TW.settings.allPresets().find(p => p.id === preset)?.config;
        if ((presetConfig || TW.settings.get()).fullscreen && document.documentElement.requestFullscreen)
          document.documentElement.requestFullscreen().catch(() => toast('Full-screen unavailable; match continues normally.'));
        S.write('selection',{p1,p2});
        TW.game.begin(p1,p2,preset);
      }
      if (form.id === 'question-form') {
        const data = {id:app.editId || S.id(),text:f.get('text'),choices:[0,1,2,3,4].map(i => f.get('choice'+i)),
          correct:Number(f.get('correct')),explanation:f.get('explanation'),category:f.get('category'),
          difficulty:f.get('difficulty'),timeLimit:Number(f.get('timeLimit')),
          image:document.getElementById('remove-question-image').checked ? '' : app.questionImageData};
        if (TW.questions.upsert(data)) {show('questions');toast('Question saved.');}
      }
      if (form.id === 'player-form') {
        const data={id:app.editId || S.id(),name:f.get('name'),avatar:f.get('avatar'),color:f.get('color')};
        if (TW.players.upsert(data)) {show('players');toast('Player saved.');}
      }
      if (form.id === 'settings-form') {
        if (TW.settings.save(readConfig(form,''))) {show('settings');toast('Game settings saved.');}
      }
      if (form.id === 'preset-form') {
        const name=String(f.get('name') || '').trim();
        if (!name || name.length > 40) throw new Error('Preset name must be 1–40 characters.');
        if (TW.settings.upsertPreset({id:app.editPresetId || S.id(),name,config:readConfig(form,'')})) {
          show('presets');toast('Preset saved.');
        }
      }
    } catch (error) {console.error(error);toast(error.message || 'Could not save.',true);}
  }
  function handleInput(event) {
    const t=event.target;
    if (t.id === 'q-search') {app.questionSearch=t.value;document.getElementById('question-list').innerHTML=questionRows();}
    if (t.id === 'history-search') {app.historySearch=t.value;document.getElementById('history-list').innerHTML=historyRows();}
    if (t.id === 'remove-question-image' && t.checked) {
      app.questionImageData='';document.getElementById('image-preview').innerHTML='<span class="help">No image attached</span>';
      document.getElementById('question-image-input').value='';
    }
  }
  function handleChange(event) {
    const t=event.target;
    if (t.id === 'q-category') {app.questionCategory=t.value;document.getElementById('question-list').innerHTML=questionRows();}
    if (t.id === 'q-difficulty') {app.questionDifficulty=t.value;document.getElementById('question-list').innerHTML=questionRows();}
    if (t.id === 'history-winner') {app.historyWinner=t.value;document.getElementById('history-list').innerHTML=historyRows();}
    if (t.id === 'select-all-questions') {
      filteredQuestions().forEach(q => t.checked ? app.selectedQuestions.add(q.id) : app.selectedQuestions.delete(q.id));
      document.getElementById('question-list').innerHTML=questionRows();
    }
    if (t.classList.contains('question-check')) {
      if (t.checked) app.selectedQuestions.add(t.value);else app.selectedQuestions.delete(t.value);
    }
    if (t.classList.contains('question-check') || t.id === 'select-all-questions')
      document.getElementById('selected-count').textContent=app.selectedQuestions.size+' selected';
    if (t.id === 'question-image-input') handleImageFile(t);
    if (t.dataset.import) handleImport(t);
  }
  function handleKey(event) {
    if (event.repeat || app.screen !== 'game' || event.altKey || event.ctrlKey || event.metaKey ||
        ['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName) ||
        document.getElementById('modal-root').children.length) return;
    const key=event.code?.startsWith('Numpad') && /^Numpad[0-9]$/.test(event.code) ? event.code.slice(-1) : event.key;
    let player,answer;
    if (['1','2','3','4','5'].includes(key)) {player=0;answer=Number(key)-1;}
    else if (['6','7','8','9','0'].includes(key)) {player=1;answer=['6','7','8','9','0'].indexOf(key);}
    else return;
    event.preventDefault();TW.game.submit(player,answer);
  }
  function init() {
    try {TW.questions.init();TW.players.init();TW.settings.init();TW.history.init();}
    catch (error) {console.error(error);toast('Chrome storage is not available. Check browser settings.',true);}
    document.addEventListener('click',event => {
      if (event.target.classList.contains('modal-backdrop')) closeModal();
      clickAction(event);
    });
    document.addEventListener('submit',handleSubmit);
    document.addEventListener('input',handleInput);
    document.addEventListener('change',handleChange);
    document.addEventListener('keydown',handleKey);
    window.addEventListener('resize',() => {if (app.screen === 'game') TW.game.render();});
    document.addEventListener('visibilitychange',() => {
      if (document.hidden && app.screen === 'game' && TW.game.isPlaying()) TW.game.pause();
    });
    TW.app=app;show('home');
    if (TW.storageErrors?.length) toast('Some saved browser data could not be read. Export a backup and check your saved data.',true);
  }
  app.show=show;app.navigate=navigate;app.toast=toast;app.closeModal=closeModal;
  init();
})();
