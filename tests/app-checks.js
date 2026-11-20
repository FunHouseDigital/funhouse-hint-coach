// Checks the app's own logic (coach.js) with a fake model. Run: node tests/app-checks.js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { straightApostrophes, diagnose, stepLadder, newLadder, sesothoFellBack, normaliseCode, Session, allExercises } from '../js/coach.js';
import { PACKS } from '../js/config.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const packs = Object.fromEntries(PACKS.map((id) => [id, JSON.parse(readFileSync(root + 'packs/' + id + '.json', 'utf8'))]));
let fail = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.log('FAIL', m, 'got', JSON.stringify(a), 'want', JSON.stringify(b)); } };
const fake = (text) => async () => ({ text, ms: 1 });

const t3 = packs['t3-l1'];
const ex = t3.exercises.find((e) => e.id === 't3-e1');

// sentence flow
eq((await diagnose(t3, ex, 'anything', fake('correct'))).checkedBy, 'model', 'model reply used');
eq((await diagnose(t3, ex, 'anything', fake('correct'))).complete, true, 'correct -> complete');
eq((await diagnose(t3, ex, 'x', fake('wrong_then'))).misconception, 'wrong_then', 'label used');
const fb = await diagnose(t3, ex, 'If the whistle blows, then everyone stops.', fake('Looking at this'));
eq([fb.checkedBy, fb.complete], ['baseline fallback', true], 'unclear reply -> baseline');
const fb2 = await diagnose(t3, ex, 'everyone stops', fake('not correct'));
eq([fb2.checkedBy, fb2.complete], ['baseline fallback', false], 'negated reply never done');

// curly apostrophes are straightened before parseChoice
eq(straightApostrophes('isn\u2019t \u2018correct\u2019'), "isn't 'correct'", 'curly to straight');
const curly = await diagnose(t3, ex, 'everyone stops', fake('It isn\u2019t correct'));
eq([curly.checkedBy, curly.complete], ['baseline fallback', false], 'curly negation never done');

// non-sentence types never call the model
const route = packs['t1-l1'].exercises[0];
const r = await diagnose(packs['t1-l1'], route, [{ a: 'F', n: 1 }], () => { throw new Error('model called'); });
eq(r.checkedBy, 'code', 'route checked by code');

// ladder
const L = newLadder();
const wrong = (m) => ({ complete: false, misconception: m });
eq(stepLadder(L, wrong('a'), false), { kind: 'hint', level: 1, id: 'a' }, 'first hint');
eq(stepLadder(L, wrong('a'), true).level, 2, 'more -> 2');
eq(stepLadder(L, wrong('a'), true).level, 3, 'more -> 3');
eq(stepLadder(L, wrong('a'), true).kind, 'ask', 'after 3 -> ask');
eq(stepLadder(L, wrong('b'), false), { kind: 'hint', level: 1, id: 'b' }, 'new diagnosis restarts');
eq(stepLadder(L, { complete: true }, false).kind, 'done', 'done');

// Sesotho fields are empty, so every hint falls back
eq(Object.keys(t3.hints).every((id) => sesothoFellBack(t3, id, 1)), true, 'st falls back');

// learner code
eq(['L1', 'l12', ' L3 '].map(normaliseCode), ['L1', 'L12', 'L3'], 'codes ok');
eq(['', 'Thabo', 'L', '1', 'L1a', 'LL1', 'L-1'].map(normaliseCode).every((c) => c === null), true, 'bad codes rejected');

// CSV
const s = new Session();
eq(s.setLearner('Sipho'), false, 'name refused');
s.setLearner('L4');
const row = s.add({ exercise: 't3-e1', event: 'hint', level: 1, diagnosis: 'wrong_then', checkedBy: 'model' });
row.rating = 'helpful';
const csv = s.toCsv().split('\r\n');
eq(csv[0], 'learner_code,exercise_id,event,hint_level,diagnosis,rating,checked_by', 'csv header');
eq(csv[1], 'L4,t3-e1,hint,1,wrong_then,helpful,model', 'csv row');

// clearing records
s.add({ exercise: 't1-e1', event: 'done', checkedBy: 'code' });
s.setLearner('L5');
s.add({ exercise: 't1-e1', event: 'hint', level: 1, diagnosis: 'turn_moves', checkedBy: 'code' });
eq(s.clearLearner('L4'), 2, 'cleared 2 rows for L4');
eq(s.toCsv().includes('L4,'), false, 'L4 gone from CSV');
eq(s.toCsv().includes('L5,t1-e1'), true, 'L5 kept');
eq(s.clearAll(), 1, 'clear all');
eq(s.toCsv().trim().split('\r\n').length, 1, 'CSV is header only after clear all');

eq(allExercises(packs).length, 12, '12 exercises listed');

if (fail) { console.log(fail + ' app checks failed'); process.exit(1); }
console.log('app checks passed');
