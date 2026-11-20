// FunHouse Hint Coach: checking engine. Pure JavaScript, no dependencies, runs in a browser or Node.
// Exercise types: route, sort, predict (all checked exactly by code) and sentence (small model plus a keyword baseline).

const DIRS = ['N', 'E', 'S', 'W'];
const STEP = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };

// ---------- ROUTE ----------
// Cards: { a: 'F', n: 1..5 } | { a: 'L' } | { a: 'R' }. Text form: "F2 R F2".
export function parseRoute(s) {
  if (Array.isArray(s)) return s;
  return s.trim().split(/[\s,]+/).filter(Boolean).map((t) => {
    const m = /^([FLR])(\d*)$/i.exec(t);
    if (!m) throw new Error('Bad card: ' + t);
    const a = m[1].toUpperCase();
    return a === 'F' ? { a, n: m[2] ? parseInt(m[2], 10) : 1 } : { a };
  });
}

const sqName = (c, r) => String.fromCharCode(65 + c) + (r + 1);
const sqParse = (s) => [s.charCodeAt(0) - 65, parseInt(s.slice(1), 10) - 1];

// model.swapLR: learner mixes left and right. model.turnSteps: learner thinks a turn also moves one square.
export function simulate(route, ex, model = {}) {
  let [c, r] = sqParse(ex.start.sq);
  let f = DIRS.indexOf(ex.start.facing);
  let off = false;
  const move = () => {
    const [dc, dr] = STEP[DIRS[f]];
    const nc = c + dc;
    const nr = r + dr;
    if (nc < 0 || nr < 0 || nc >= ex.grid.cols || nr >= ex.grid.rows) { off = true; return; }
    c = nc; r = nr;
  };
  for (const card of route) {
    if (off) break;
    if (card.a === 'F') {
      for (let i = 0; i < card.n && !off; i++) move();
    } else {
      let right = card.a === 'R';
      if (model.swapLR) right = !right;
      f = (f + (right ? 1 : 3)) % 4;
      if (model.turnSteps) move();
    }
  }
  return { sq: sqName(c, r), facing: DIRS[f], off };
}

function variants(route, delta) {
  const out = [];
  route.forEach((card, i) => {
    if (card.a !== 'F') return;
    if (delta > 0) out.push(route.map((x, j) => (j === i ? { a: 'F', n: x.n + 1 } : x)));
    else if (card.n > 1) out.push(route.map((x, j) => (j === i ? { a: 'F', n: x.n - 1 } : x)));
    else out.push(route.filter((_, j) => j !== i));
  });
  if (delta > 0) {
    for (let i = 0; i <= route.length; i++) out.push([...route.slice(0, i), { a: 'F', n: 1 }, ...route.slice(i)]);
  }
  return out;
}

function evaluateRoute(ex, attempt) {
  const route = parseRoute(attempt);
  const real = simulate(route, ex);
  const target = ex.target.sq;
  const hit = (s) => !s.off && s.sq === target;
  const detail = { end: real.sq, offGrid: real.off, facing: real.facing, target, cards: route.length };

  if (hit(real)) {
    if (ex.target.facing && real.facing !== ex.target.facing) return { complete: false, misconception: 'wrong_facing', detail };
    if (ex.maxCards && route.length > ex.maxCards) return { complete: false, misconception: 'too_long', detail };
    return { complete: true, misconception: null, detail };
  }
  if (hit(simulate(route, ex, { swapLR: true }))) return { complete: false, misconception: 'lr_swapped', detail };
  if (route.some((c) => c.a !== 'F') && hit(simulate(route, ex, { turnSteps: true }))) return { complete: false, misconception: 'turn_moves', detail };
  if (variants(route, +1).some((v) => hit(simulate(v, ex)))) return { complete: false, misconception: 'stopped_short', detail };
  if (variants(route, -1).some((v) => hit(simulate(v, ex)))) return { complete: false, misconception: 'went_too_far', detail };
  if (real.off) return { complete: false, misconception: 'off_grid', detail };
  return { complete: false, misconception: 'no_match', detail };
}

// ---------- SORT ----------
// attempt: { itemId: 'INPUT' | 'PROCESSING' | 'OUTPUT' | 'STORAGE' }
function evaluateSort(ex, attempt) {
  const wrong = ex.items.filter((i) => attempt[i.id] !== i.bin);
  const correct = ex.items.length - wrong.length;
  const detail = { correct, total: ex.items.length, pass: correct >= ex.passMark, wrong: wrong.map((w) => w.id) };
  if (wrong.length === 0) return { complete: true, misconception: null, detail };
  const pair = (w, a, b) => (w.bin === a && attempt[w.id] === b) || (w.bin === b && attempt[w.id] === a);
  let m = 'mixed';
  if (wrong.some((w) => pair(w, 'STORAGE', 'OUTPUT'))) m = 'storage_as_output';
  else if (wrong.some((w) => pair(w, 'INPUT', 'OUTPUT'))) m = 'input_output_swapped';
  else if (wrong.some((w) => w.bin === 'PROCESSING')) m = 'processing_unclear';
  return { complete: false, misconception: m, detail };
}

// ---------- PREDICT ----------
// attempt: { x, y }
function evaluatePredict(ex, attempt) {
  const detail = { answer: ex.answer };
  if (attempt.x === ex.answer.x && attempt.y === ex.answer.y) return { complete: true, misconception: null, detail };
  for (const p of ex.patterns) {
    const okX = p.x === undefined || p.x === attempt.x;
    const okY = p.y === undefined || p.y === attempt.y;
    if (okX && okY) return { complete: false, misconception: p.id, detail };
  }
  return { complete: false, misconception: 'no_match_predict', detail };
}

// ---------- SENTENCE ----------
// The small model does the real classification in the app. This keyword baseline is the comparison.
function splitIfThen(text) {
  const t = text.trim().replace(/\.$/, '');
  const m = /^\s*if\b(.*?)(?:,\s*then\b|\bthen\b|,)(.*)$/i.exec(t);
  return m ? { cond: m[1], then: m[2] } : null;
}
const STOPW = /\b(stop|stops|freeze|freezes|frozen|sit|sits|stands? still|stays? still|halt)\b/i;

const BASELINES = {
  whistle_if_then(t) {
    const p = splitIfThen(t);
    if (!p) return 'missing_then';
    if (STOPW.test(p.cond) && /whistle/i.test(p.then)) return 'swapped_if_then';
    if (/whistle/i.test(p.cond) && STOPW.test(p.then)) return 'ok';
    return 'wrong_then';
  },
  no_whistle(t) {
    const p = splitIfThen(t);
    if (!p) return 'missing_then';
    if (STOPW.test(p.then)) return 'stops_anyway';
    if (/\b(keep|continue|carry|walk|walks|go on|play|move)\b/i.test(p.then)) return 'ok';
    return 'no_match';
  },
  till_sale(t) {
    const m = /input is (.+?)\s*,?\s*and (?:the )?output is (.+?)\.?$/i.exec(t.trim());
    if (!m) return 'no_match';
    const [, a, b] = m;
    const IN = /\b(price|prices|barcode|bar code|code|tin|item|items|number|amount|scan|scanned|typed|keys?)\b/i;
    const OUT = /\b(slip|receipt|total|change|bill|ticket|printout)\b/i;
    const STORE = /\b(book|record|records|stored|saved|memory|drive)\b/i;
    const ADD = /\b(add|adds|adding|add up|calculate|calculates|works out)\b/i;
    if (ADD.test(a)) return 'processing_as_input';
    if (OUT.test(a) && IN.test(b) && !OUT.test(b)) return 'swapped_input_output';
    if (STORE.test(b)) return 'storage_as_output';
    if (IN.test(a) && OUT.test(b)) return 'ok';
    return 'no_match';
  },
};

function evaluateSentence(ex, attempt) {
  const id = BASELINES[ex.baseline](attempt);
  return { complete: id === 'ok', misconception: id === 'ok' ? null : id, detail: { by: 'keyword baseline' } };
}

// Prompt for the small model (sentence exercises). The model must answer with one label only.
export function classifyPrompt(pack, ex, attempt) {
  const labels = [['correct', 'The answer is correct.']];
  for (const id of ex.labels) labels.push([id, pack.hints[id].desc]);
  return [
    'A teacher is checking a learner answer. Choose the one label that best describes the answer.',
    'Reply with the label only.',
    'Exercise: ' + ex.prompt,
    'Labels:',
    ...labels.map(([id, d]) => '- ' + id + ': ' + d),
    'Learner answer: ' + attempt,
    'Label:',
  ].join('\n');
}

// Reads the model's reply. Whole-word matching only, so words like "look" or "book" can never read as a label.
// A "correct" with a negation just before it ("not correct", "isn't quite correct") is ignored.
// If the reply names more than one different label, or none, it is unclear and null is returned:
// the app then uses the keyword baseline result instead. An unclear reply can never show "done".
export function parseChoice(modelText, ex) {
  if (/^\s*ok\W*$/i.test(modelText)) return 'ok';
  const ids = ['correct', ...ex.labels];
  const rx = new RegExp('(?<![a-z_])(' + ids.join('|') + ')(?![a-z_])', 'gi');
  const NEG = /\b(not|never|no|isn'?t|aren'?t|wasn'?t|doesn'?t|don'?t)\s+(?:\w+\s+){0,2}$/i;
  const found = new Set();
  let m;
  while ((m = rx.exec(modelText)) !== null) {
    const id = m[1].toLowerCase();
    if (id === 'correct' && NEG.test(modelText.slice(0, m.index))) continue;
    found.add(id === 'correct' ? 'ok' : id);
  }
  return found.size === 1 ? [...found][0] : null;
}

// ---------- COMMON ----------
export function evaluate(ex, attempt) {
  switch (ex.type) {
    case 'route': return evaluateRoute(ex, attempt);
    case 'sort': return evaluateSort(ex, attempt);
    case 'predict': return evaluatePredict(ex, attempt);
    case 'sentence': return evaluateSentence(ex, attempt);
    default: throw new Error('Unknown exercise type: ' + ex.type);
  }
}

// Returns the hint text. level 1 to 3. lang 'en' or 'st'. Sesotho falls back to English when empty.
// A diagnosis with no hint of its own uses the pack's 'generic' ladder.
export function hintFor(pack, misconceptionId, level, detail = {}, lang = 'en') {
  const h = pack.hints[misconceptionId] ?? pack.hints.generic;
  if (!h) return null;
  const i = Math.min(Math.max(level, 1), 3) - 1;
  const text = (lang === 'st' && h.st && h.st[i]) ? h.st[i] : h.en[i];
  return text.replaceAll('{end}', detail.end ?? '').replaceAll('{target}', detail.target ?? '');
}

export function doneMessage(pack, lang = 'en') {
  return (lang === 'st' && pack.done.st) ? pack.done.st : pack.done.en;
}
