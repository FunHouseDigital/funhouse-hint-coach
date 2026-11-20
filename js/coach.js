// Coach logic without any screen code, so Node can test it. Uses the owner's engine as it is.
import { evaluate, classifyPrompt, parseChoice, hintFor, doneMessage } from '../engine.js';
import { PACKS } from './config.js';

export { hintFor, doneMessage };

export async function loadPacks(base = './') {
  const packs = {};
  for (const id of PACKS) {
    const r = await fetch(base + 'packs/' + id + '.json');
    if (!r.ok) throw new Error('Could not load pack ' + id);
    packs[id] = await r.json();
  }
  return packs;
}

export function allExercises(packs) {
  return Object.entries(packs).flatMap(([packId, pack]) => pack.exercises.map((ex) => ({ packId, pack, ex })));
}

// Sentence flow from the brief. `classify` is injected (the model), so tests can fake it.
// Returns { complete, misconception, detail, checkedBy, modelText?, ms? }.
export async function diagnose(pack, ex, attempt, classify) {
  if (ex.type !== 'sentence') {
    const r = evaluate(ex, attempt);
    return { ...r, checkedBy: 'code' };
  }
  const prompt = classifyPrompt(pack, ex, attempt);
  const { text, ms } = await classify(prompt);
  const choice = parseChoice(straightApostrophes(text), ex);
  if (choice === null) {
    const r = evaluate(ex, attempt);
    return { ...r, checkedBy: 'baseline fallback', modelText: text, ms };
  }
  const complete = choice === 'ok';
  return { complete, misconception: complete ? null : choice, detail: {}, checkedBy: 'model', modelText: text, ms };
}

// Curly quotes (U+2018, U+2019) become a straight apostrophe, so "isn’t correct" reads as a negation.
export const straightApostrophes = (s) => String(s ?? '').replace(/[\u2018\u2019]/g, "'");

// True when a Sesotho hint was asked for but the pack has no Sesotho text for it.
export function sesothoFellBack(pack, misconceptionId, level) {
  const h = pack.hints[misconceptionId] ?? pack.hints.generic;
  const i = Math.min(Math.max(level, 1), 3) - 1;
  return !(h && h.st && h.st[i]);
}

// Hint ladder state for one exercise. Pure functions on a plain object.
export function newLadder() {
  return { diag: null, level: 0, askFacilitator: false };
}

// result: output of diagnose(). more: true for "More help".
// Returns { kind: 'done' } | { kind: 'ask' } | { kind: 'hint', level, id }.
export function stepLadder(ladder, result, more) {
  if (result.complete) return { kind: 'done' };
  const id = result.misconception;
  if (id !== ladder.diag) {
    ladder.diag = id; ladder.level = 1; ladder.askFacilitator = false;
    return { kind: 'hint', level: 1, id };
  }
  if (more) {
    if (ladder.level >= 3) { ladder.askFacilitator = true; return { kind: 'ask' }; }
    ladder.level += 1;
    return { kind: 'hint', level: ladder.level, id };
  }
  return ladder.level === 0
    ? (ladder.level = 1, { kind: 'hint', level: 1, id })
    : { kind: 'hint', level: ladder.level, id };
}

// ---- session notes (memory only) ----
const CODE_RX = /^L\d+$/i;
export function normaliseCode(s) {
  const t = String(s ?? '').trim();
  return CODE_RX.test(t) ? t.toUpperCase() : null;
}

export class Session {
  constructor() { this.learner = null; this.rows = []; }
  setLearner(code) { const c = normaliseCode(code); if (!c) return false; this.learner = c; return true; }
  add(row) { const r = { learner: this.learner, ...row }; this.rows.push(r); return r; }
  // Both return how many rows were removed. Rows live in memory only, so removal is final.
  clearLearner(code) { const n = this.rows.length; this.rows = this.rows.filter((r) => r.learner !== code); return n - this.rows.length; }
  clearAll() { const n = this.rows.length; this.rows = []; return n; }
  toCsv() {
    const head = ['learner_code', 'exercise_id', 'event', 'hint_level', 'diagnosis', 'rating', 'checked_by'];
    const lines = [head.join(',')];
    for (const r of this.rows) {
      lines.push([r.learner, r.exercise, r.event, r.level ?? '', r.diagnosis ?? '', r.rating ?? '', r.checkedBy ?? ''].map(csvCell).join(','));
    }
    return lines.join('\r\n') + '\r\n';
  }
}
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formulas
  return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}
