// Tests scripts/apply-sesotho.js on temp copies of the packs. The real packs are never written.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseSheet, plan, loadPacks, writeChanges, PACK_FILES } from '../scripts/apply-sesotho.js';
import { buildSheet, buildUniqueSheet } from '../scripts/make-translation-sheet.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const realPacks = join(root, 'packs');
const hashDir = (d) => PACK_FILES.map((f) => createHash('sha256').update(readFileSync(join(d, f))).digest('hex')).join(',');
const realBefore = hashDir(realPacks);
let fail = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.log('FAIL', m, '\n  got ', JSON.stringify(a), '\n  want', JSON.stringify(b)); } };
const temps = [];
const tempPacks = () => { const d = mkdtempSync(join(tmpdir(), 'hc-packs-')); temps.push(d); for (const f of PACK_FILES) cpSync(join(realPacks, f), join(d, f)); return d; };
// Everything except st fields, to prove nothing else changed.
const noSt = (p) => JSON.stringify(p, (k, v) => (k === 'st' ? null : v));

// Fill one entry of the full sheet.
const fillFull = (text, key, st) => text.replace(new RegExp('(\\[' + key.replace(/[|.]/g, '\\$&') + '\\]\\r\\nEnglish: [^\\r]*\\r\\nSesotho:) ', ''), (_, a) => a + ' ' + st);
// Fill every line of the unique sheet, keeping placeholders.
const fillUnique = (text) => text.replace(/\[U(\d+)\]\r\nEnglish: ([^\r]*)\r\n((?:[^\r]*\r\n)*?)Sesotho: /g, (_, n, en, mid) => {
  const ph = (en.match(/\{end\}|\{target\}/g) ?? []).join(' ');
  return `[U${n}]\r\nEnglish: ${en}\r\n${mid}Sesotho: ST-${n} Sesotho ${ph}`.trimEnd() + (ph ? '' : '');
});

const full = buildSheet().text;
const uniq = buildUniqueSheet();
eq(uniq.count, 80, 'unique lines');
const committedUniq = readFileSync(join(root, 'docs/sesotho-unique-lines.txt'), 'utf8').replace(/^\uFEFF/, '');
eq(committedUniq === uniq.text, true, 'docs/sesotho-unique-lines.txt is up to date');

// 1. Unique sheet, fully filled: every place gets Sesotho, nothing else changes.
{
  const dir = tempPacks();
  const before = loadPacks(dir);
  const packs = loadPacks(dir);
  const r = plan(packs, parseSheet(fillUnique(uniq.text)));
  eq(r.ok, true, 'unique sheet ok');
  eq([r.summary.filled, r.summary.reused, r.summary.empty, r.summary.conflicts], [112, 0, 0, 0], 'unique sheet fills all 112');
  writeChanges(dir, packs, r.changes);
  const after = loadPacks(dir);
  for (const f of PACK_FILES) eq(noSt(after[f]), noSt(before[f]), 'only st changed in ' + f);
  eq(Object.values(after['t1-l1.json'].hints).every((h) => h.st.every((s) => /^ST-\d+ Sesotho/.test(s))), true, 'st filled');
  const raw = readFileSync(join(dir, 't1-l1.json'), 'utf8');
  eq(raw, JSON.stringify(after['t1-l1.json'], null, 2) + '\n', 'formatting kept (2 spaces, final newline)');
}

// 2. Full sheet: one occurrence of a repeated English line filled, copied to the others.
const dupe = [...uniq.text.matchAll(/\[U\d+\]\r\nEnglish: ([^\r]*)\r\nUsed at:\r\n((?:  \[[^\]]+\]\r\n){2,})/g)].find((m) => !m[1].includes('{'));
const dupeKeys = [...dupe[2].matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
{
  const dir = tempPacks();
  const packs = loadPacks(dir);
  const r = plan(packs, parseSheet(fillFull(full, dupeKeys[0], 'Sesotho e le nngwe')));
  eq([r.ok, r.summary.filled, r.summary.reused], [true, 1, dupeKeys.length - 1], 'one filled, rest reused');
  eq(r.changes.map((c) => c.key).sort(), [...dupeKeys].sort(), 'reused at every place');
}

// 3. Conflict: two places, two different Sesotho texts: stop, write nothing.
{
  const dir = tempPacks();
  const before = hashDir(dir);
  let t = fillFull(full, dupeKeys[0], 'Taba A');
  t = fillFull(t, dupeKeys[1], 'Taba B');
  const r = spawnSync(process.execPath, [join(root, 'scripts/apply-sesotho.js'), write(t), '--packs', dir], { encoding: 'utf8' });
  eq(r.status, 1, 'conflict exits 1');
  eq(/different Sesotho/.test(r.stdout) && /Taba A/.test(r.stdout) && /Taba B/.test(r.stdout), true, 'conflict listed');
  eq(hashDir(dir), before, 'nothing written on conflict');
}

// 4. English edited by the translator: stop and list.
{
  const k = 't1-l1.json | turn_moves | 1';
  const t = fillFull(full, k, 'Sesotho').replace('English: Look at your Turn card.', 'English: Look at the Turn card.');
  const r = plan(loadPacks(tempPacks()), parseSheet(t));
  eq([r.ok, r.mismatches.map((m) => m.key)], [false, [k]], 'English mismatch found');
}

// 5. Placeholder count wrong: reported and skipped, the rest still applies.
{
  const ph = [...full.matchAll(/\[([^\]]+)\]\r\nEnglish: ([^\r]*\{(?:end|target)\}[^\r]*)\r\n/g)][0];
  let t = fillFull(full, ph[1], 'Sesotho e se nang placeholder');
  t = fillFull(t, 't1-l1.json | turn_moves | 2', 'Sesotho e nepahetseng');
  const r = plan(loadPacks(tempPacks()), parseSheet(t));
  eq(r.ok, true, 'placeholder case still ok');
  eq(r.placeholderSkips.length, 1, 'one placeholder skip');
  eq(r.changes.some((c) => c.key === ph[1]), false, 'placeholder entry not written');
  eq(r.changes.some((c) => c.key === 't1-l1.json | turn_moves | 2'), true, 'other entry written');
}

// 6. --dry prints a summary and writes nothing. A real run prints new hashes.
{
  const dir = tempPacks();
  const before = hashDir(dir);
  const sheet = write(fillFull(full, 't3-l1.json | done | -', 'Ho lokile.'));
  const d = spawnSync(process.execPath, [join(root, 'scripts/apply-sesotho.js'), sheet, '--dry', '--packs', dir], { encoding: 'utf8' });
  eq([d.status, /Summary: filled 1/.test(d.stdout), /Dry run/.test(d.stdout), hashDir(dir) === before], [0, true, true, true], 'dry run');
  const w = spawnSync(process.execPath, [join(root, 'scripts/apply-sesotho.js'), sheet, '--packs', dir], { encoding: 'utf8' });
  eq([w.status, /t3-l1\.json\s+[0-9a-f]{64}/.test(w.stdout)], [0, true], 'real run prints new hash');
  eq(JSON.parse(readFileSync(join(dir, 't3-l1.json'), 'utf8')).done.st, 'Ho lokile.', 'done.st written');
}

// 7. An empty sheet changes nothing.
eq(plan(loadPacks(tempPacks()), parseSheet(full)).changes.length, 0, 'empty sheet: no changes');

function write(text) { const d = mkdtempSync(join(tmpdir(), 'hc-sheet-')); temps.push(d); const f = join(d, 'sheet.txt'); writeFileSync(f, '\uFEFF' + text, 'utf8'); return f; }

for (const d of temps) rmSync(d, { recursive: true, force: true });
eq(hashDir(realPacks), realBefore, 'real packs untouched');
if (fail) { console.log(fail + ' apply-sesotho checks failed'); process.exit(1); }
console.log('apply-sesotho checks passed');
