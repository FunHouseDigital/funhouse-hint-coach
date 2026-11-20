import { loadPacks, allExercises, diagnose, stepLadder, newLadder, hintFor, doneMessage, sesothoFellBack, Session } from './coach.js';
import { parseRoute, simulate } from '../engine.js';
import { SIDES } from './config.js';
import { classify, ensureModel } from './model.js';
import { registerOffline } from './offline.js';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k);
  return n;
};
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const session = new Session();
let packs = {};
let list = [];
let cur = null; // { packId, pack, ex }
let ladder = newLadder();
let lang = 'en';
let answer = null; // screen-specific getter/state
let shown = new Map(); // "id:level" -> session row
let lastHint = null; // { id, level, detail, row }
let cache = null; // { key, result } so More help does not rerun the model
let busy = false;

// ---------- start ----------
async function init() {
  registerOffline($('cacheMsg'));
  try { packs = await loadPacks(); } catch (e) { $('welcome').textContent = 'Could not load the exercises: ' + e.message; return; }
  list = allExercises(packs);
  const sel = $('exSel');
  for (const [i, it] of list.entries()) {
    sel.append(el('option', { value: i }, `${it.pack.lesson}: ${it.ex.title} (${it.ex.type})`));
  }
  sel.addEventListener('change', () => openExercise(Number(sel.value)));
  $('codeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!session.setLearner($('code').value)) { $('codeMsg').textContent = 'Use L and numbers, like L1.'; return; }
    $('codeMsg').textContent = 'Learner ' + session.learner;
    $('code').value = session.learner;
    $('welcome').hidden = true; $('main').hidden = false;
    sel.disabled = false; $('exportBtn').disabled = false;
    openExercise(Number(sel.value) || 0);
  });
  $('langEn').addEventListener('click', () => setLang('en'));
  $('langSt').addEventListener('click', () => setLang('st'));
  $('hintBtn').addEventListener('click', () => requestHint(false));
  $('exportBtn').addEventListener('click', exportCsv);
  $('code').focus();
}

function setLang(l) {
  lang = l;
  $('langEn').setAttribute('aria-pressed', String(l === 'en'));
  $('langSt').setAttribute('aria-pressed', String(l === 'st'));
  document.documentElement.setAttribute('lang', l === 'st' ? 'st' : 'en');
  if (lastHint) renderHint();
}

function openExercise(i) {
  cur = list[i];
  ladder = newLadder(); shown = new Map(); lastHint = null; cache = null;
  $('exTitle').textContent = cur.ex.title;
  $('exPrompt').textContent = cur.ex.prompt;
  $('hintBox').replaceChildren(); $('status').textContent = '';
  $('runBtn').hidden = cur.ex.type !== 'route';
  const screen = $('screen');
  screen.replaceChildren();
  answer = ({ route: routeScreen, sort: sortScreen, predict: predictScreen, sentence: sentenceScreen })[cur.ex.type](screen, cur.ex);
  $('hintBtn').textContent = 'Get hint';
  $('hintBtn').disabled = cur.ex.type === 'route';
}

function answerChanged() {
  $('hintBox').replaceChildren(); $('status').textContent = ''; lastHint = null; cache = null;
}

// ---------- route ----------
function routeScreen(root, ex) {
  const cards = [];
  let ran = false;
  const grid = el('div', { class: 'grid', role: 'img', 'aria-label': 'Grid, columns A to D, rows 1 to 4. A1 is bottom left.' });
  const cap = el('div', { class: 'cap' }, el('span', { 'aria-hidden': 'true' }, '\u25B2'));
  const [sc, sr] = [ex.start.sq.charCodeAt(0) - 65, Number(ex.start.sq.slice(1)) - 1];
  for (let r = ex.grid.rows - 1; r >= 0; r--) {
    for (let c = 0; c < ex.grid.cols; c++) {
      const name = String.fromCharCode(65 + c) + (r + 1);
      grid.append(el('div', { class: 'sq' + (name === ex.target.sq ? ' target' : '') + (name === ex.start.sq ? ' start' : '') },
        name, name === ex.target.sq ? el('span', { class: 'mark' }, 'END') : name === ex.start.sq ? el('span', { class: 'mark' }, 'START') : null));
    }
  }
  grid.append(cap);
  const place = (sq, facing, off = false) => {
    const c = sq.charCodeAt(0) - 65; const r = Number(sq.slice(1)) - 1;
    cap.style.left = c * 68 + 'px'; cap.style.top = (ex.grid.rows - 1 - r) * 68 + 'px';
    cap.firstChild.style.transform = `rotate(${{ N: 0, E: 90, S: 180, W: 270 }[facing]}deg)`;
    cap.classList.toggle('off', off);
  };
  place(ex.start.sq, ex.start.facing);

  const count = el('div', { class: 'count', 'aria-live': 'polite' });
  const seq = el('div', { class: 'seq', 'aria-label': 'Your cards' });
  const steps = ex.allowRepeat ? el('select', { id: 'steps', 'aria-label': 'Forward steps' }, [1, 2, 3, 4, 5].map((n) => el('option', { value: n }, 'Forward ' + n))) : null;
  const label = (c) => (c.a === 'F' ? 'Forward' + (c.n > 1 ? ' ' + c.n : '') : c.a === 'L' ? 'Turn Left' : 'Turn Right');
  const draw = (now = -1) => {
    seq.replaceChildren(...cards.map((c, i) => el('span', { class: 'chip' + (i === now ? ' now' : '') }, label(c))));
    const over = ex.maxCards && cards.length > ex.maxCards;
    count.textContent = `Cards: ${cards.length}${ex.maxCards ? ' of ' + ex.maxCards : ''}`;
    count.className = 'count' + (over ? ' over' : '');
  };
  const edit = (fn) => { if (busy) return; fn(); ran = false; $('hintBtn').disabled = true; place(ex.start.sq, ex.start.facing); draw(); answerChanged(); };
  const add = (card) => edit(() => { if (cards.length < 30) cards.push(card); });
  root.append(el('div', { class: 'route' }, grid, el('div', { class: 'cards' },
    el('div', { class: 'cardrow' },
      el('button', { type: 'button', onclick: () => add({ a: 'F', n: steps ? Number(steps.value) : 1 }) }, steps ? 'Forward' : 'Forward'), steps,
      el('button', { type: 'button', onclick: () => add({ a: 'L' }) }, 'Turn Left'),
      el('button', { type: 'button', onclick: () => add({ a: 'R' }) }, 'Turn Right')),
    seq, count,
    el('div', { class: 'cardrow' },
      el('button', { type: 'button', onclick: () => edit(() => cards.pop()) }, 'Remove last'),
      el('button', { type: 'button', onclick: () => edit(() => { cards.length = 0; }) }, 'Clear')))));
  draw();

  $('runBtn').onclick = async () => {
    if (busy || !cards.length) { $('status').textContent = 'Add some cards first.'; return; }
    busy = true;
    place(ex.start.sq, ex.start.facing);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    if (reduceMotion()) {
      const s = simulate(cards, ex); place(s.sq, s.facing, s.off); draw();
    } else {
      await wait(350);
      for (let i = 0; i < cards.length; i++) {
        const s = simulate(cards.slice(0, i + 1), ex);
        draw(i); place(s.sq, s.facing, s.off);
        await wait(650);
        if (s.off) break;
      }
      draw();
    }
    const end = simulate(cards, ex);
    $('status').textContent = end.off ? 'The robot went off the grid.' : `The robot ended on ${end.sq}.`;
    busy = false; ran = true; $('hintBtn').disabled = false;
    $('hintBtn').focus();
  };
  return () => ({ ok: ran, value: parseRoute(cards.map((c) => ({ ...c }))), why: 'Press "Run my route" first.' });
}

// ---------- sort ----------
function sortScreen(root, ex) {
  const place = {}; // item id -> bin
  let picked = null;
  const wrap = el('div', { class: 'sortwrap' });
  const draw = () => {
    const part = (it) => el('button', { type: 'button', class: 'part', 'aria-pressed': String(picked === it.id), onclick: () => { picked = picked === it.id ? null : it.id; draw(); } }, it.label);
    const pool = el('div', { class: 'pool', 'aria-label': 'Part cards waiting' }, ex.items.filter((i) => !place[i.id]).map(part));
    const mats = el('div', { class: 'mats' }, (ex.bins ?? SIDES).map((b) => el('div', { class: 'mat' },
      el('button', { type: 'button', class: 'name', 'aria-label': 'Put the chosen card on ' + b, onclick: () => { if (!picked) { $('status').textContent = 'Tap a card first.'; return; } place[picked] = b; picked = null; $('status').textContent = ''; answerChanged(); draw(); } }, b),
      el('div', { class: 'in' }, ex.items.filter((i) => place[i.id] === b).map(part)))));
    const back = el('button', { type: 'button', onclick: () => { if (picked) { delete place[picked]; picked = null; answerChanged(); draw(); } } }, 'Move chosen card back');
    wrap.replaceChildren(el('p', { class: 'small' }, 'Tap a card. Then tap a mat.'), pool, mats, back);
  };
  draw();
  root.append(wrap);
  return () => ({ ok: ex.items.every((i) => place[i.id]), value: { ...place }, why: 'Put every card on a mat first.' });
}

// ---------- predict ----------
function predictScreen(root) {
  const x = el('input', { id: 'px', type: 'number', inputmode: 'numeric', step: '1', oninput: answerChanged });
  const y = el('input', { id: 'py', type: 'number', inputmode: 'numeric', step: '1', oninput: answerChanged });
  root.append(el('div', { class: 'fields' },
    el('div', {}, el('label', { for: 'px' }, 'x'), x), el('div', {}, el('label', { for: 'py' }, 'y'), y)));
  return () => {
    const vx = x.value === '' ? NaN : Number(x.value); const vy = y.value === '' ? NaN : Number(y.value);
    return { ok: Number.isFinite(vx) && Number.isFinite(vy), value: { x: vx, y: vy }, why: 'Type a number in both boxes.' };
  };
}

// ---------- sentence ----------
function sentenceScreen(root) {
  const t = el('textarea', { id: 'sent', class: 'sent', rows: '3', 'aria-label': 'Your sentence', oninput: answerChanged });
  root.append(t);
  return () => ({ ok: t.value.trim().length > 0, value: t.value.trim(), why: 'Write your sentence first.' });
}

// ---------- hint flow ----------
async function requestHint(more) {
  if (busy) return;
  const a = answer();
  if (!a.ok) { $('status').textContent = a.why; return; }
  busy = true; setButtons(true);
  try {
    const key = JSON.stringify(a.value);
    let result;
    if (cache && cache.key === key) result = cache.result;
    else {
      result = await runDiagnose(a.value);
      cache = { key, result };
    }
    const step = stepLadder(ladder, result, more);
    $('status').textContent = '';
    if (step.kind === 'done') return showDone(result);
    if (step.kind === 'ask') return showAsk(result);
    const rowKey = step.id + ':' + step.level;
    let row = shown.get(rowKey);
    if (!row) {
      row = session.add({ exercise: cur.ex.id, event: 'hint', level: step.level, diagnosis: step.id, checkedBy: result.checkedBy });
      shown.set(rowKey, row);
    }
    lastHint = { id: step.id, level: step.level, detail: result.detail, row };
    renderHint();
  } catch (e) {
    $('status').textContent = 'Something went wrong: ' + e.message;
  } finally {
    busy = false; setButtons(false);
  }
}

function setButtons(off) {
  $('hintBtn').disabled = off;
  for (const b of document.querySelectorAll('#hintBox button')) b.disabled = off;
}

async function runDiagnose(value) {
  if (cur.ex.type !== 'sentence') return diagnose(cur.pack, cur.ex, value, classify);
  // Sentence: first use loads the model, with progress. Thinking timer while the model answers.
  const box = $('status');
  let timer;
  try {
    const bar = el('progress', { max: '100', value: '0', 'aria-label': 'Loading the helper model' });
    const label = el('div', {}, 'Loading the helper model (one time)');
    box.replaceChildren(label, bar);
    await ensureModel((got, total) => { bar.value = Math.round((got / total) * 100); label.textContent = `Loading the helper model (one time): ${Math.round(got / 1e6)} of ${Math.round(total / 1e6)} MB`; });
    const think = el('span');
    box.replaceChildren(el('span', { class: 'spin', 'aria-hidden': 'true' }), 'Thinking... ', think);
    const t1 = performance.now();
    timer = setInterval(() => { think.textContent = Math.floor((performance.now() - t1) / 1000) + ' s'; }, 250);
    think.textContent = '0 s';
    return await diagnose(cur.pack, cur.ex, value, classify);
  } finally { clearInterval(timer); box.textContent = ''; }
}

function renderHint() {
  const { id, level, detail, row } = lastHint;
  const text = hintFor(cur.pack, id, level, detail, lang);
  const box = $('hintBox');
  const head = el('div', {}, el('strong', {}, `Hint ${level} of 3`));
  if (lang === 'st' && sesothoFellBack(cur.pack, id, level)) head.append(el('span', { class: 'tag' }, 'English until the Sesotho is checked'));
  const rate = (v) => el('button', { type: 'button', 'aria-pressed': String(row.rating === v), onclick: () => { row.rating = v; renderHint(); } }, v === 'helpful' ? 'Helpful' : 'Not helpful');
  box.replaceChildren(head, el('p', {}, text), el('div', { class: 'row' },
    el('button', { type: 'button', class: 'primary', onclick: () => requestHint(true) }, level < 3 ? 'More help' : 'Still stuck?'),
    rate('helpful'), rate('not helpful')));
}

function showDone() {
  once('done', { event: 'done' });
  $('hintBox').replaceChildren(el('p', { class: 'done' }, doneMessage(cur.pack, lang)),
    lang === 'st' && !cur.pack.done.st ? el('span', { class: 'tag' }, 'English until the Sesotho is checked') : null);
}
function showAsk(result) {
  once('ask', { event: 'ask_facilitator', diagnosis: ladder.diag, checkedBy: result.checkedBy });
  $('hintBox').replaceChildren(el('p', { class: 'ask' }, 'Ask your facilitator.'));
}
function once(k, row) {
  if (shown.has(k)) return;
  shown.set(k, session.add({ exercise: cur.ex.id, ...row }));
}

// ---------- export ----------
function exportCsv() {
  const blob = new Blob([session.toCsv()], { type: 'text/csv' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `hint-coach-notes-${session.learner}.csv` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

init();
