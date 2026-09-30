(function () {
  'use strict';
  const TW = window.TW;
  let audio, musicTimer, note = 0, cleanTimer;
  const tune = [392, 440, 523, 440, 349, 392, 440, 330];
  function audioContext() {
    if (!audio) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (Ctor) audio = new Ctor();
    }
    if (audio?.state === 'suspended') audio.resume().catch(() => {});
    return audio;
  }
  function tone(frequency, length = .12, volume = .07, type = 'sine') {
    try {
      const ctx = audioContext(); if (!ctx) return;
      const osc = ctx.createOscillator(), gain = ctx.createGain(), now = ctx.currentTime;
      osc.type = type; osc.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + .018);
      gain.gain.exponentialRampToValueAtTime(.0001, now + length);
      osc.connect(gain).connect(ctx.destination); osc.start(now); osc.stop(now + length + .015);
    } catch (error) { console.debug('Audio unavailable', error); }
  }
  function effect(type, settings) {
    if (!settings?.sound) return;
    if (type === 'correct') { tone(523); setTimeout(() => tone(784, .18), 100); }
    if (type === 'wrong') tone(195, .19, .05, 'sawtooth');
    if (type === 'tick') tone(440, .07, .023);
    if (type === 'win') [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .27, .08), i * 130));
  }
  function music(settings) {
    stopMusic();
    if (!settings?.music) return;
    musicTimer = setInterval(() => {
      if (!document.hidden && TW.app?.screen === 'game' && TW.game?.isPlaying()) tone(tune[note++ % tune.length], .22, .014, 'triangle');
    }, 650);
  }
  function stopMusic() { if (musicTimer) clearInterval(musicTimer); musicTimer = null; }
  function confetti() {
    const host = document.getElementById('confetti');
    if (!host) return;
    host.innerHTML = '';
    for (let i = 0; i < 65; i++) {
      const piece = document.createElement('i');
      piece.className = 'confetti-piece';
      piece.style.cssText = 'left:' + Math.random() * 100 + '%;animation-delay:' + Math.random() * 1.5 +
        's;animation-duration:' + (2 + Math.random() * 2) + 's;background:hsl(' + Math.random() * 360 + ' 95% 65%)';
      host.append(piece);
    }
    setTimeout(() => { if (host.isConnected) host.innerHTML = ''; }, 5500);
  }
  function pull(position, pulls, player, animation) {
    const stage = document.getElementById('rope-stage'), rope = document.getElementById('moving-rope');
    if (!stage || !rope) return 0;
    const width = stage.clientWidth;
    const boundary = Math.max(42, Math.min(220, width * .245));
    const duration = animation === 'none' ? 0 : animation === 'low' ? 320 : 670;
    stage.style.setProperty('--boundary', boundary + 'px');
    rope.style.transitionDuration = duration + 'ms';
    rope.style.transform = 'translateX(' + ((position / pulls) * boundary) + 'px)';
    const meter = document.getElementById('rope-progress');
    if (meter) meter.textContent = position === 0 ? 'CENTER' : (position < 0 ? '← P1 +' : 'P2 +') + Math.abs(position);
    stage.querySelectorAll('.character').forEach(el => el.classList.remove('pulling', 'wrong-shake'));
    clearTimeout(cleanTimer);
    if (player != null && duration) {
      stage.querySelector('.character.p' + (player + 1))?.classList.add('pulling');
      cleanTimer = setTimeout(() => stage.querySelectorAll('.character').forEach(el => el.classList.remove('pulling')), duration + 100);
    }
    return duration;
  }
  function wrong(player) {
    const el = document.querySelector('.character.p' + (player + 1));
    if (!el) return;
    el.classList.remove('wrong-shake'); void el.offsetWidth; el.classList.add('wrong-shake');
    setTimeout(() => el.classList.remove('wrong-shake'), 550);
  }
  TW.animations = {unlock:audioContext, effect, music, stopMusic, confetti, pull, wrong};
})();
