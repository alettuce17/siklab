// Run: node tests/test_question_bank_layout.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const root = join(import.meta.dirname, '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const js = readFileSync(join(root, 'js/17_nova_integration.js'), 'utf8');
for (const id of ['qb-questions-panel', 'cq-module', 'game1-ai-panel', 'nova-ai-panel', 'game1-topic-panel', 'nova-topic-panel']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} must appear exactly once`);
}
assert(html.indexOf('id="cq-module"') < html.indexOf('id="nova-topic-panel"'), 'game selection should precede all game sections');
assert(/qb-toolbar[\s\S]*?lg:items-end/.test(html), 'game picker and tabs should align at the bottom');

const start = js.indexOf('let qbActivePanel =');
const end = js.indexOf('function setNovaQuestionFormMode()', start);
assert(start >= 0 && end > start);
const element = id => ({ id, dataset: {}, attributes: {}, classList: {
    values: new Set(),
    toggle(name, on) { if (on) this.values.add(name); else this.values.delete(name); },
    contains(name) { return this.values.has(name); }
}, setAttribute(name, value) { this.attributes[name] = value; } });
const ids = ['qb-questions-panel', 'cq-module', 'game1-ai-panel', 'nova-ai-panel', 'game1-topic-panel', 'nova-topic-panel'];
const els = Object.fromEntries(ids.map(id => [id, element(id)]));
const buttons = ['questions', 'ai', 'settings'].map(tab => Object.assign(element(tab), { dataset: { qbTab: tab } }));
const document = {
    getElementById(id) { return els[id] || null; },
    querySelectorAll() { return buttons; }
};
const ctx = vm.createContext({ document });
vm.runInContext(`${js.slice(start, end)}\nthis.setPanel = qbSetPanel;`, ctx);
const visible = () => ids.filter(id => id !== 'cq-module' && !els[id].classList.contains('hidden'));

els['cq-module'].value = 'W1';
ctx.setPanel('questions');
assert.deepEqual(visible(), ['qb-questions-panel']);
ctx.setPanel('ai');
assert.deepEqual(visible(), ['game1-ai-panel']);
ctx.setPanel('settings');
assert.deepEqual(visible(), ['game1-topic-panel']);
els['cq-module'].value = 'NOVA';
ctx.setPanel('settings');
assert.deepEqual(visible(), ['nova-topic-panel']);
ctx.setPanel('ai');
assert.deepEqual(visible(), ['nova-ai-panel']);
els['cq-module'].value = 'W3';
ctx.setPanel('ai');
assert.deepEqual(visible(), ['qb-questions-panel']);
assert(buttons[1].classList.contains('hidden') && buttons[2].classList.contains('hidden'));
assert.equal(buttons[0].attributes['aria-pressed'], 'true');
console.log('Question Bank game and tab visibility checks passed');
