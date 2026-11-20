// The counts .txt must hold counts and timings only: no case attempt, no model reply.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluate, parseRoute } from '../engine.js';
import { countsText } from '../eval/counts.js';
import { PACKS } from '../js/config.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const packs = Object.fromEntries(PACKS.map((id) => [id, JSON.parse(readFileSync(root + 'packs/' + id + '.json', 'utf8'))]));
const cases = JSON.parse(readFileSync(root + 'eval/cases.json', 'utf8'));
const got = (r) => (r.complete ? 'ok' : r.misconception);

// Build a report the same shape eval.js builds, with a fake model reply on every sentence case.
const report = { label: 'synthetic cases', device: { userAgent: 'TestBrowser/1', crossOriginIsolated: true, threadsUsed: 2 },
  model: { file: 'm.gguf', bytes: 123 }, codeCases: [], sentenceCases: [], summary: {} };
let pass = 0, total = 0, kwc = 0;
cases.forEach((c, i) => {
  const ex = packs[c.pack].exercises.find((e) => e.id === c.exercise);
  const g = got(evaluate(ex, ex.type === 'route' ? parseRoute(c.attempt) : c.attempt));
  if (ex.type === 'sentence') {
    if (g === c.expect) kwc++;
    report.sentenceCases.push({ n: i + 1, type: 'sentence', attempt: c.attempt, expect: c.expect, keyword: g, model: null, modelText: 'MODEL-REPLY-' + i, app: g, appCorrect: g === c.expect, ms: 5 });
  } else {
    total++; if (g === c.expect) pass++;
    report.codeCases.push({ n: i + 1, type: ex.type, attempt: c.attempt, expect: c.expect, got: g, pass: g === c.expect });
  }
});
const n = report.sentenceCases.length;
report.summary.code = { pass, total };
report.summary.sentence = { total: n, model: { correct: 0, total: n, unclear: n }, keyword: { correct: kwc, total: n }, app: { correct: kwc, total: n }, medianMs: 5, slowestMs: 5, loadMs: 9, peakMemory: 'not reported' };

const txt = countsText(report, new Date('2026-01-01T00:00:00Z'));
let fail = 0;
for (const c of cases) {
  const s = typeof c.attempt === 'string' ? c.attempt : JSON.stringify(c.attempt);
  if (txt.includes(s)) { fail++; console.log('FAIL attempt found in counts text:', s); }
}
if (/MODEL-REPLY-/.test(txt)) { fail++; console.log('FAIL model reply found'); }
for (const need of ['synthetic cases', `${pass} of ${total} pass`, `keyword baseline ${kwc} of ${n}`, 'median 5', 'Threads used: 2', 'm.gguf (123 bytes)', '2026-01-01']) {
  if (!txt.includes(need)) { fail++; console.log('FAIL missing:', need); }
}
if (/%/.test(txt)) { fail++; console.log('FAIL percent sign in counts text'); }
if (fail) process.exit(1);
console.log('counts text checks passed');
