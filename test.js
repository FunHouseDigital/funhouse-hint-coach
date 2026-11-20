import { readFileSync, readdirSync } from 'node:fs';
import { evaluate, hintFor, parseRoute, classifyPrompt, parseChoice } from './engine.js';
const packs = {};
for (const f of readdirSync('packs')) packs[f.replace('.json','')] = JSON.parse(readFileSync('packs/' + f, 'utf8'));
let fail = 0;
const bad = (m) => { fail++; console.log('FAIL', m); };

// structure checks
for (const [name, p] of Object.entries(packs)) {
  const ids = new Set();
  for (const ex of p.exercises) {
    if (ids.has(ex.id)) bad(name + ' duplicate id ' + ex.id); ids.add(ex.id);
    for (const l of ex.labels ?? []) if (!p.hints[l]) bad(`${name} ${ex.id} label without hints: ${l}`);
  }
  for (const [id, h] of Object.entries(p.hints)) {
    if (h.en.length !== 3 || h.st.length !== 3) bad(`${name} hint ${id} needs 3 levels`);
    if (h.en.some((t) => /[—;]/.test(t))) bad(`${name} hint ${id} has an em dash or semicolon`);
    if (h.st.some((t) => t !== '')) bad(`${name} hint ${id} has Sesotho text: must come from a Sesotho speaker`);
  }
}

// labelled cases
const cases = JSON.parse(readFileSync('eval/cases.json', 'utf8'));
let pass = 0;
for (const c of cases) {
  const ex = packs[c.pack].exercises.find((e) => e.id === c.exercise);
  const r = evaluate(ex, c.attempt);
  const got = r.complete ? 'ok' : r.misconception;
  if (got !== c.expect) bad(`${c.exercise} ${JSON.stringify(c.attempt)} expected ${c.expect} got ${got}`);
  else pass++;
  if (!r.complete && !hintFor(packs[c.pack], r.misconception, 1, r.detail)) bad(`no hint for ${r.misconception}`);
}
console.log(`labelled cases: ${pass}/${cases.length} correct`);

// route fuzz: never throws, every diagnosis has a hint, a complete answer really lands on target
let n = 0;
const cards = ['F', 'F2', 'F3', 'R', 'L'];
for (const name of ['t1-l1', 't2-l1']) {
  for (const ex of packs[name].exercises) {
    for (let i = 0; i < 3000; i++) {
      const len = 1 + Math.floor(Math.random() * 9);
      const route = Array.from({ length: len }, () => cards[Math.floor(Math.random() * cards.length)]).join(' ');
      const r = evaluate(ex, name === 't1-l1' ? route.replace(/F\d/g, 'F') : route);
      n++;
      if (!r.complete && !hintFor(packs[name], r.misconception, 3, r.detail)) bad(`fuzz: no hint for ${r.misconception}`);
      if (r.complete && r.detail.end !== ex.target.sq) bad('fuzz: complete but wrong square');
    }
  }
}
console.log(`fuzz routes checked: ${n}`);

// prompt and parser smoke test
const ex = packs['t3-l1'].exercises[0];
const prompt = classifyPrompt(packs['t3-l1'], ex, 'If I stop, then the whistle blows.');
if (!prompt.includes('swapped_if_then') || parseChoice('Label: swapped_if_then', ex) !== 'swapped_if_then' || parseChoice('banana', ex) !== null) bad('prompt/parser');
// parseChoice must never read ordinary words as a label (bug found by Kiro: 'ok' inside 'look' and 'book')
const pc = (s) => parseChoice(s, ex);
const checks = [
  ['Looking at this answer, I think', null], ['Look at the book', null], ['incorrect', null], ['banana', null],
  ['correct', 'ok'], ['Label: correct', 'ok'], ['ok', 'ok'], ['OK.', 'ok'],
  ['swapped_if_then', 'swapped_if_then'], ['The label is missing_then.', 'missing_then'],
];
for (const [text, want] of checks) if (pc(text) !== want) bad(`parseChoice(${JSON.stringify(text)}) gave ${pc(text)}, wanted ${want}`);
if (!classifyPrompt(packs['t3-l1'], ex, 'x').includes('- correct:')) bad('prompt must offer the label "correct"');

// hintFor: unknown diagnosis uses the generic ladder, and every placeholder is filled
for (const [name, p] of Object.entries(packs)) if (!hintFor(p, 'some_new_diagnosis', 2)) bad(name + ' has no generic fallback');
const fake = { hints: { x: { en: ['{end} and {end} then {target} and {target}', 'b', 'c'], st: ['', '', ''] } } };
if (hintFor(fake, 'x', 1, { end: 'B2', target: 'C3' }) !== 'B2 and B2 then C3 and C3') bad('placeholders not all replaced');
console.log(fail ? `${fail} FAILURES` : 'ALL CHECKS PASSED');
process.exit(fail ? 1 : 0);
