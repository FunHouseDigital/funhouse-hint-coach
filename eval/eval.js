// Eval page. Synthetic cases only. Runs in the browser, nothing is sent anywhere.
import { evaluate, classifyPrompt, parseChoice, parseRoute } from '../engine.js';
import { loadPacks, straightApostrophes } from '../js/coach.js';
import { classify, ensureModel, info } from '../js/model.js';
import { MODEL, GEN } from '../js/config.js';

const $ = (id) => document.getElementById(id);
const status = (t) => { $('status').textContent = t; };
const got = (r) => (r.complete ? 'ok' : r.misconception);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

let packs, cases;
const report = {
  label: 'synthetic cases',
  note: 'All cases are synthetic, written by the author. Not learner data. Results only hold for the device that ran them.',
  startedAt: null,
  device: {},
  model: { name: MODEL.name, file: MODEL.path.split('/').pop(), bytes: MODEL.bytes, sha256: MODEL.sha256, gen: GEN },
  codeCases: [],
  sentenceCases: [],
  summary: {},
};

function device() {
  return {
    userAgent: navigator.userAgent,
    crossOriginIsolated: self.crossOriginIsolated === true,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemoryGB: navigator.deviceMemory ?? null,
    threadsUsed: info.loaded ? info.threads : null,
    multithread: info.loaded ? info.multithread : null,
  };
}

// Peak memory as the browser reports it. Not every browser reports it.
let peakHeap = null;
function sampleHeap() {
  const m = performance.memory;
  if (m && m.usedJSHeapSize) peakHeap = Math.max(peakHeap ?? 0, m.usedJSHeapSize);
}
async function uaMemory() {
  if (!self.crossOriginIsolated || !performance.measureUserAgentSpecificMemory) return null;
  try { return (await performance.measureUserAgentSpecificMemory()).bytes; } catch { return null; }
}

function row(cells, cls = []) {
  const tr = document.createElement('tr');
  cells.forEach((c, i) => { const td = document.createElement('td'); td.textContent = c ?? ''; if (cls[i]) td.className = cls[i]; tr.append(td); });
  $('cases').tBodies[0].append(tr);
}
function summary() {
  const s = report.summary;
  const lines = [
    ['Label', 'synthetic cases'],
    ['Browser', report.device.userAgent],
    ['crossOriginIsolated', String(report.device.crossOriginIsolated)],
    ['Threads used', report.device.threadsUsed ?? 'model not loaded'],
    ['Model file', `${report.model.file} (${(report.model.bytes / 1e6).toFixed(1)} MB)`],
  ];
  if (s.code) lines.push(['Route, sort, predict (code)', `${s.code.pass} of ${s.code.total} pass`]);
  if (s.sentence) {
    const t = s.sentence;
    lines.push(['Sentence cases', `model ${t.model.correct} of ${t.total}, keyword baseline ${t.keyword.correct} of ${t.total}`]);
    lines.push(['Model replies it could not read', `${t.model.unclear} of ${t.total}`]);
    lines.push(['App result (model, keyword when unclear)', `${t.app.correct} of ${t.total}`]);
    lines.push(['Model call ms: median / slowest', `${t.medianMs?.toFixed(0)} / ${t.slowestMs?.toFixed(0)}`]);
    lines.push(['Model load ms (one time)', t.loadMs?.toFixed(0)]);
    lines.push(['Peak memory', t.peakMemory]);
  }
  const body = $('sum').tBodies[0];
  body.replaceChildren(...lines.map(([k, v]) => { const tr = document.createElement('tr'); const th = document.createElement('th'); th.textContent = k; const td = document.createElement('td'); td.textContent = v; tr.append(th, td); return tr; }));
}

async function setup() {
  status('Loading cases...');
  packs = await loadPacks('../');
  cases = await (await fetch('cases.json')).json();
  report.device = device();
  status(`${cases.length} synthetic cases loaded.`);
  summary();
}

function exFor(c) { return packs[c.pack].exercises.find((e) => e.id === c.exercise); }

$('runCode').addEventListener('click', () => {
  report.codeCases = [];
  let pass = 0, total = 0, n = 0;
  for (const c of cases) {
    n++;
    const ex = exFor(c);
    if (ex.type === 'sentence') continue;
    total++;
    const g = got(evaluate(ex, ex.type === 'route' ? parseRoute(c.attempt) : c.attempt));
    const ok = g === c.expect;
    if (ok) pass++;
    report.codeCases.push({ n, pack: c.pack, exercise: c.exercise, attempt: c.attempt, expect: c.expect, got: g, pass: ok });
    row([n, c.exercise, JSON.stringify(c.attempt), c.expect, g + (ok ? ' (pass)' : ' (FAIL)'), '', '', ''], ['', '', '', '', ok ? 'pass' : 'fail']);
  }
  report.summary.code = { pass, total };
  report.startedAt ??= new Date().toISOString();
  $('dl').disabled = false;
  summary();
  status(`Code checks: ${pass} of ${total} pass.`);
});

$('runSent').addEventListener('click', async () => {
  $('runSent').disabled = true;
  try {
    report.startedAt ??= new Date().toISOString();
    const t0 = performance.now();
    await ensureModel((g, t) => status(`Loading the helper model: ${Math.round(g / 1e6)} of ${Math.round(t / 1e6)} MB`));
    const loadMs = performance.now() - t0;
    report.device = device();
    const list = cases.map((c, i) => ({ c, n: i + 1 })).filter(({ c }) => exFor(c).type === 'sentence');
    const times = [];
    let modelCorrect = 0, modelUnclear = 0, keywordCorrect = 0, appCorrect = 0;
    report.sentenceCases = [];
    for (const [k, { c, n }] of list.entries()) {
      status(`Sentence case ${k + 1} of ${list.length}...`);
      const ex = exFor(c);
      const pack = packs[c.pack];
      const kw = got(evaluate(ex, c.attempt));
      const { text, ms } = await classify(classifyPrompt(pack, ex, c.attempt));
      times.push(ms);
      sampleHeap();
      const choice = parseChoice(straightApostrophes(text), ex);
      const app = choice ?? kw;
      if (choice === null) modelUnclear++;
      if (choice === c.expect) modelCorrect++;
      if (kw === c.expect) keywordCorrect++;
      if (app === c.expect) appCorrect++;
      report.sentenceCases.push({ n, pack: c.pack, exercise: c.exercise, attempt: c.attempt, expect: c.expect, keyword: kw, keywordCorrect: kw === c.expect, model: choice, modelCorrect: choice === c.expect, modelText: text, app, appCorrect: app === c.expect, ms: Math.round(ms) });
      row([n, c.exercise, c.attempt, c.expect, kw, choice ?? 'unclear', text, Math.round(ms)], ['', '', '', '', kw === c.expect ? 'pass' : 'fail', choice === c.expect ? 'pass' : 'fail']);
    }
    const ua = await uaMemory();
    const peakMemory = ua != null ? `${(ua / 1e6).toFixed(0)} MB (measureUserAgentSpecificMemory, after run)`
      : peakHeap != null ? `${(peakHeap / 1e6).toFixed(0)} MB (performance.memory, main thread JS heap only)`
      : 'not reported';
    report.summary.sentence = { total: list.length, model: { correct: modelCorrect, total: list.length, unclear: modelUnclear }, keyword: { correct: keywordCorrect, total: list.length }, app: { correct: appCorrect, total: list.length }, medianMs: median(times), slowestMs: Math.max(...times), loadMs, peakMemory, peakJsHeapBytes: peakHeap, uaMemoryBytes: ua };
    $('dl').disabled = false;
    summary();
    status('Sentence cases done.');
  } catch (e) {
    status('Error: ' + e.message);
  } finally {
    $('runSent').disabled = false;
  }
});

$('dl').addEventListener('click', () => {
  report.device = device();
  report.finishedAt = new Date().toISOString();
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'hint-coach-eval-synthetic.json';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

setup().catch((e) => status('Error: ' + e.message));
