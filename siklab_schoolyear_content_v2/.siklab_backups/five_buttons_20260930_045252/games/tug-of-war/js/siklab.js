/* Same-origin SikLab host integration. The standalone app still uses its own data. */
(function () {
  'use strict';
  if (window.parent === window) return;
  const TW = window.TW;
  const localQuestions = TW.questions.all;
  const localPlayers = TW.players.all;
  const localSettings = TW.settings.get;
  const localStored = TW.game.stored;
  const lastButtons = {player1:'00000',player2:'00000'};
  let lastPacketAt = {player1:0,player2:0};

  TW.questions.all = function () {
    return TW.siklab?.embedded ? TW.siklab.questions : localQuestions();
  };
  TW.players.all = function () {
    return TW.siklab?.embedded ? TW.siklab.players : localPlayers();
  };
  TW.settings.get = function () {
    return TW.siklab?.embedded ? TW.siklab.settings : localSettings();
  };
  TW.game.stored = function () {
    return TW.siklab?.embedded ? null : localStored();
  };

  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== window.location.origin) return;
    const data = event.data;
    if (data?.type === 'siklab_game_config' && data.game === 'TUG') {
      try {
        const players = TW.players.validateMany(data.players);
        const questions = data.questions?.length ? TW.questions.validateMany(data.questions) : TW.questions.examples();
        const settings = TW.settings.validate({ ...TW.settings.base(), ...data.settings,
          selectedPresetId:'', fullscreen:false });
        TW.siklab = {embedded:true, players, questions, settings};
        document.body.classList.add('siklab-embedded');
        TW.app.show('selection');
        TW.app.toast(data.questions?.length
          ? `${questions.length} school-year questions ready. A red, B green, C white, D blue, E yellow.`
          : 'No approved Tug questions yet. Playing with the 24 built-in sample questions.');
      } catch (error) {
        console.error('[Tug SikLab config]', error);
        TW.app.toast(error.message || 'Could not load SikLab game data.', true);
      }
      return;
    }
    if (data?.type !== 'esp32_input' || !TW.siklab?.embedded) return;
    const player = data.player;
    const state = data.state;
    if (!Object.hasOwn(lastButtons, player) || typeof state !== 'string' || !/^[01]{9}$/.test(state)) return;
    // Controller packets carry joystick (0–3), answer buttons (4–7), and a fifth
    // button (8). Only button edges submit an answer, so holding cannot repeat it.
    const now = Date.now();
    if (now - lastPacketAt[player] > 1500) lastButtons[player] = '00000';
    const buttons = state.slice(4, 9);
    const previous = lastButtons[player];
    lastButtons[player] = buttons;
    lastPacketAt[player] = now;
    if (TW.app.screen !== 'game') return;
    const index = player === 'player1' ? 0 : 1;
    for (let answer = 0; answer < 5; answer++) {
      if (buttons[answer] === '1' && previous[answer] !== '1') {
        TW.game.submit(index, answer);
        break;
      }
    }
  });
})();
