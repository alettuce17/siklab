// Packet-level controller regression checks. Run: node tests/test_carnival_input.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const html = readFileSync(join(import.meta.dirname, '..', 'games', 'Science_Carnival_Shooter.html'), 'utf8');
const start = html.indexOf('const KEYS={');
const end = html.indexOf('/* ════════════════════════════════════════════════════\n   JOYSTICK', start);
assert(start > 0 && end > start, 'Input section must be present');
const listeners = {};
let clock = 1;
const window = { location: { origin: 'https://classroom.example' }, addEventListener(name, handler) { listeners[name] = handler; } };
window.parent = window;
const document = { addEventListener() {}, getElementById() { return { style: { display: 'none' } }; } };
const ctx = vm.createContext({ window, document, performance: { now: () => clock }, console });
vm.runInContext(`${html.slice(start, end)}\nthis.check = {
  inputHeld, receiveESP32Input, applyESP32State, mayAnswerWithButton,
  down: (p, i) => BTNS[p][i], edge: (p, i) => BTNS_PRESSED_THIS_FRAME[p][i],
  resetPressedThisFrame, keyboard: KEYS
};`, ctx);
const c = ctx.check;

c.receiveESP32Input('p1', '100000000');
assert(c.inputHeld('w'), 'up must move while the physical stick is held');
c.receiveESP32Input('p1', '000000000');
assert(!c.inputHeld('w'), 'centering the physical stick must stop movement');
c.keyboard.w = true;
assert(c.inputHeld('w'), 'keyboard movement is independent of physical input');
c.keyboard.w = false;

c.receiveESP32Input('p2', '001000000');
assert(c.inputHeld('ArrowLeft'), 'P2 movement has its own joystick mapping');
c.receiveESP32Input('p2', '000000000');
assert(!c.inputHeld('ArrowLeft'));

// Both packets arrive before the next animation frame.
c.receiveESP32Input('p1', '000010000');
c.receiveESP32Input('p1', '000000000');
assert(c.edge('p1', 0), 'short shoot press cannot vanish between frames');
assert(!c.down('p1', 0), 'release must clear held state');
c.resetPressedThisFrame();
c.receiveESP32Input('p1', '000010000');
c.receiveESP32Input('p1', '000010000');
assert(c.edge('p1', 0));
c.resetPressedThisFrame();
c.receiveESP32Input('p1', '000010000');
assert(!c.edge('p1', 0), 'heartbeat while held must not repeat the action');

assert(!c.mayAnswerWithButton(false, { choices: ['A'] }, 'mc'), 'shot opening a question cannot answer it on the same frame');
assert(c.mayAnswerWithButton(true, { choices: ['A'] }, 'mc'));
assert(!c.mayAnswerWithButton(true, { choices: ['A'] }, 'sort'));
clock += 5100;
c.applyESP32State();
assert(!c.down('p1', 0), 'stale controller packet must release held button');

// Run the real game loop with a mocked target hit that opens a question.
const loopStart = html.indexOf('function gameLoop(ts){');
const loopEnd = html.indexOf('/* ════════════════════════════════════════════════════\n   TIMER', loopStart);
assert(loopStart > 0 && loopEnd > loopStart);
vm.runInContext(`
  var gameActive = true, lastTime = null, rafId = null;
  var questionActive = [false, false], currentQuestion = [null, null], challengeType = ['mc', 'mc'];
  var tutActive = false, tutStep = 0, tutData = {};
  var playerState = [{x:100,y:80}, {x:100,y:80}], emojiObjs = [[], []];
  var SPEED = 230, shootCount = 0, answerCount = 0;
  function updateCH() {}
  function tryShoot(p) { shootCount++; questionActive[p] = true; currentQuestion[p] = {choices:['A','B'],correct:0}; }
  function answerQuestion() { answerCount++; }
  function requestAnimationFrame() { return 1; }
  function tutAnswerPress() {}
  ${html.slice(loopStart, loopEnd)}
`, ctx);
document.getElementById = id => id.startsWith('half-')
  ? { getBoundingClientRect: () => ({ width: 400, height: 200 }) }
  : { style: { display: 'none' }, textContent: '' };
c.receiveESP32Input('p1', '000000000');
c.resetPressedThisFrame();
c.receiveESP32Input('p1', '000010000');
vm.runInContext('gameLoop(16)', ctx);
assert.equal(vm.runInContext('shootCount', ctx), 1);
assert.equal(vm.runInContext('answerCount', ctx), 0, 'the shot opening the question must not answer A');
c.receiveESP32Input('p1', '000000000');
c.receiveESP32Input('p1', '000010000');
vm.runInContext('gameLoop(32)', ctx);
assert.equal(vm.runInContext('answerCount', ctx), 1, 'a new press while the question is open answers A');
console.log('Carnival controller input checks passed');

// Supabase creates the voice Blob in the teacher dashboard window. The game
// runs in an iframe with its own Blob constructor, so instanceof is unreliable.
const blobCheckStart = html.indexOf('function _isPlayableAudioBlob(value)');
const blobCheckEnd = html.indexOf('async function _voiceErrorMessage', blobCheckStart);
assert(blobCheckStart > 0 && blobCheckEnd > blobCheckStart);
const voiceCtx = vm.createContext({ Blob: class CarnivalBlob extends Blob {} });
vm.runInContext(`${html.slice(blobCheckStart, blobCheckEnd)}\nthis.isPlayableAudioBlob = _isPlayableAudioBlob`, voiceCtx);
const dashboardBlob = new Blob([new Uint8Array([0x49, 0x44, 0x33, 0x04])], { type: 'application/octet-stream' });
assert.equal(dashboardBlob instanceof voiceCtx.Blob, false);
assert(voiceCtx.isPlayableAudioBlob(dashboardBlob), 'audio from parent dashboard must play inside Carnival iframe');
assert(!voiceCtx.isPlayableAudioBlob(new Blob([])), 'empty response must not play');
assert(!voiceCtx.isPlayableAudioBlob({ error: 'No API key' }), 'error JSON must not play');
console.log('Carnival cross-window voice checks passed');
