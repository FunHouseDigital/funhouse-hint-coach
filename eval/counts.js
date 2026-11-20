// Builds the "Download counts (.txt)" text from the eval report.
// Only counts, timings and device facts. Never case texts, attempts or model replies.
export function countsText(report, date = new Date()) {
  const L = [];
  const s = report.summary ?? {};
  const d = report.device ?? {};
  const m = report.model ?? {};
  const types = {};
  for (const c of [...(report.codeCases ?? []), ...(report.sentenceCases ?? [])]) {
    const t = c.type ?? 'unknown';
    types[t] ??= { pass: 0, total: 0 };
    types[t].total++;
    if (c.pass ?? c.appCorrect) types[t].pass++;
  }
  L.push('FunHouse Hint Coach eval: synthetic cases');
  L.push('These are synthetic cases written by the author, not learner data.');
  L.push('Date: ' + date.toISOString());
  L.push('');
  L.push('Case counts per type (passed of run):');
  for (const t of ['route', 'sort', 'predict', 'sentence']) if (types[t]) L.push(`  ${t}: ${types[t].pass} of ${types[t].total}`);
  if (s.code) L.push(`Route, sort, predict (code): ${s.code.pass} of ${s.code.total} pass`);
  if (s.sentence) {
    const t = s.sentence;
    L.push(`Sentence: model ${t.model.correct} of ${t.total}, keyword baseline ${t.keyword.correct} of ${t.total}`);
    L.push(`Sentence: model replies it could not read ${t.model.unclear} of ${t.total}`);
    L.push(`Sentence: app result (model, keyword when unclear) ${t.app.correct} of ${t.total}`);
    L.push(`Model call ms: median ${Math.round(t.medianMs)}, slowest ${Math.round(t.slowestMs)}`);
    L.push(`Model load ms (one time): ${Math.round(t.loadMs)}`);
    L.push(`Peak memory: ${t.peakMemory}`);
  } else {
    L.push('Sentence cases: not run');
  }
  L.push('');
  L.push('Browser: ' + (d.userAgent ?? 'unknown'));
  L.push('crossOriginIsolated: ' + d.crossOriginIsolated);
  L.push('Threads used: ' + (d.threadsUsed ?? 'model not loaded'));
  L.push(`Model file: ${m.file} (${m.bytes} bytes)`);
  return L.join('\r\n') + '\r\n';
}
