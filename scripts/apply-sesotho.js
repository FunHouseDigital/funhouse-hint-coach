// Copies Sesotho from a filled translation sheet into the packs' st fields. Nothing else changes.
// Accepts either docs/sesotho-translation-sheet.txt or docs/sesotho-unique-lines.txt (filled copies).
//
// Usage:
//   node scripts/apply-sesotho.js <filled-sheet.txt> --dry            show what would change, write nothing
//   node scripts/apply-sesotho.js <filled-sheet.txt>                  write the st fields into packs/
//   node scripts/apply-sesotho.js <filled-sheet.txt> --packs <dir>    use another packs folder (tests)
//
// It stops without writing when: an English line no longer matches the pack, a key is unknown,
// or the same English line got two different Sesotho texts. Entries whose {end} / {target} count
// differs from the English are reported and skipped.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACK_FILES = ['t1-l1.json', 't2-l1.json', 't3-l1.json', 'g910-t1-l1.json'];
const PLACEHOLDERS = ['{end}', '{target}'];

// Returns [{ key: 'file | id | level', en, st }]. A unique-lines entry becomes one item per "Used at" key.
export function parseSheet(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const out = [];
  let cur = null; // { name, en, used: [], st, inSt }
  const flush = () => {
    if (!cur) return;
    const st = (cur.st ?? '').trim();
    const keys = /^U\d+$/.test(cur.name) ? cur.used : [cur.name];
    for (const key of keys) out.push({ key, en: cur.en, st, sheetKey: cur.name });
    cur = null;
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const head = /^\[(.+)\]$/.exec(line);
    if (head) { flush(); cur = { name: head[1].trim(), en: null, used: [], st: null, inSt: false }; continue; }
    if (!cur) continue;
    const used = /^\s+\[(.+)\]$/.exec(line);
    if (used && !cur.inSt) { cur.used.push(used[1].trim()); continue; }
    if (line.startsWith('English: ')) { cur.en = line.slice(9); continue; }
    if (line === 'English:') { cur.en = ''; continue; }
    if (line === 'Used at:') continue;
    if (/^Sesotho:/.test(line)) { cur.st = line.slice(8).trim(); cur.inSt = true; continue; }
    if (cur.inSt) {
      if (line.trim() === '' || /^(---|====|End of sheet)/.test(line)) { cur.inSt = false; continue; }
      cur.st = (cur.st ? cur.st + ' ' : '') + line.trim(); // a translator pressed Enter: join the lines
    }
  }
  flush();
  return out;
}

const count = (s, p) => s.split(p).length - 1;

// Every place an English line lives in the packs: [{ key, file, id, level, en }].
function locations(packs) {
  const locs = [];
  for (const f of PACK_FILES) {
    const p = packs[f];
    for (const [id, h] of Object.entries(p.hints)) h.en.forEach((en, i) => locs.push({ key: `${f} | ${id} | ${i + 1}`, file: f, id, level: i + 1, en }));
    if ('st' in p.done) locs.push({ key: `${f} | done | -`, file: f, id: 'done', level: null, en: p.done.en });
  }
  return locs;
}

const getSt = (p, loc) => (loc.id === 'done' ? p.done.st : p.hints[loc.id].st[loc.level - 1]);
const setSt = (p, loc, v) => { if (loc.id === 'done') p.done.st = v; else p.hints[loc.id].st[loc.level - 1] = v; };

// Pure: works out every change. Returns { ok, mismatches, conflicts, placeholderSkips, changes, summary }.
export function plan(packs, entries) {
  const locs = locations(packs);
  const byKey = new Map(locs.map((l) => [l.key, l]));
  const mismatches = [];
  for (const e of entries) {
    const loc = byKey.get(e.key);
    if (!loc) mismatches.push({ key: e.key, problem: 'unknown key' });
    else if (e.en !== loc.en) mismatches.push({ key: e.key, problem: 'English changed', sheet: e.en, pack: loc.en });
  }
  // One Sesotho per English text, shared by every place that English is used.
  const given = new Map(); // English -> Map(sesotho -> [keys])
  for (const e of entries) {
    if (!e.st || !byKey.has(e.key)) continue;
    const m = given.get(e.en) ?? new Map();
    m.set(e.st, [...(m.get(e.st) ?? []), e.key]);
    given.set(e.en, m);
  }
  const conflicts = [];
  for (const [en, m] of given) if (m.size > 1) conflicts.push({ en, options: [...m].map(([st, keys]) => ({ st, keys })) });

  const filledKeys = new Set(entries.filter((e) => e.st).map((e) => e.key));
  const placeholderSkips = [];
  const changes = [];
  const summary = { filled: 0, reused: 0, empty: 0, conflicts: conflicts.length, placeholderSkips: 0, unchanged: 0 };
  const conflictEn = new Set(conflicts.map((c) => c.en));
  const skippedEn = new Set();
  for (const [en, m] of given) {
    if (m.size !== 1) continue;
    const st = [...m.keys()][0];
    const bad = PLACEHOLDERS.filter((p) => count(st, p) !== count(en, p));
    if (bad.length) { skippedEn.add(en); placeholderSkips.push({ en, st, placeholders: bad, keys: [...m.values()][0] }); }
  }
  for (const loc of locs) {
    const m = given.get(loc.en);
    if (!m || conflictEn.has(loc.en)) { if (!m) summary.empty++; continue; }
    if (skippedEn.has(loc.en)) { summary.placeholderSkips++; continue; }
    const st = [...m.keys()][0];
    if (getSt(packs[loc.file], loc) === st) { summary.unchanged++; continue; }
    if (filledKeys.has(loc.key)) summary.filled++; else summary.reused++;
    changes.push({ ...loc, from: getSt(packs[loc.file], loc), to: st, how: filledKeys.has(loc.key) ? 'filled' : 'reused' });
  }
  return { ok: mismatches.length === 0 && conflicts.length === 0, mismatches, conflicts, placeholderSkips, changes, summary };
}

export function loadPacks(dir) {
  return Object.fromEntries(PACK_FILES.map((f) => [f, JSON.parse(readFileSync(join(dir, f), 'utf8'))]));
}

// Writes only the changed packs. Same formatting as the owner's files: 2-space JSON plus a final newline.
export function writeChanges(dir, packs, changes) {
  const touched = new Set();
  for (const c of changes) { setSt(packs[c.file], c, c.to); touched.add(c.file); }
  const hashes = {};
  for (const f of touched) {
    const text = JSON.stringify(packs[f], null, 2) + '\n';
    writeFileSync(join(dir, f), text, 'utf8');
    hashes[f] = createHash('sha256').update(text, 'utf8').digest('hex');
  }
  return hashes;
}

function main(argv) {
  const args = argv.slice(2);
  const dry = args.includes('--dry');
  const pi = args.indexOf('--packs');
  const dir = pi >= 0 ? args[pi + 1] : fileURLToPath(new URL('../packs/', import.meta.url));
  const sheet = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--packs');
  if (!sheet) { console.log('Usage: node scripts/apply-sesotho.js <filled-sheet.txt> [--dry] [--packs <dir>]'); return 2; }

  const packs = loadPacks(dir);
  const r = plan(packs, parseSheet(readFileSync(sheet, 'utf8')));
  if (r.mismatches.length) {
    console.log('STOPPED: the sheet does not match the packs. Nothing was written.');
    for (const m of r.mismatches) console.log(`  [${m.key}] ${m.problem}` + (m.sheet !== undefined ? `\n    sheet: ${m.sheet}\n    pack:  ${m.pack}` : ''));
  }
  if (r.conflicts.length) {
    console.log('STOPPED: the same English line has different Sesotho. The owner must choose one. Nothing was written.');
    for (const c of r.conflicts) {
      console.log('  English: ' + c.en);
      for (const o of c.options) console.log(`    Sesotho: ${o.st}\n      from: ${o.keys.map((k) => '[' + k + ']').join(' ')}`);
    }
  }
  for (const s of r.placeholderSkips) {
    console.log(`SKIPPED (placeholders ${s.placeholders.join(' ')} do not match the English): ${s.keys.map((k) => '[' + k + ']').join(' ')}\n  English: ${s.en}\n  Sesotho: ${s.st}`);
  }
  if (!r.ok) return 1;

  for (const c of r.changes) console.log(`${dry ? 'would set' : 'set'} [${c.key}] (${c.how}): ${c.to}`);
  const s = r.summary;
  console.log(`Summary: filled ${s.filled}, reused ${s.reused}, empty ${s.empty}, conflicts ${s.conflicts}, placeholder skips ${s.placeholderSkips}, already the same ${s.unchanged}`);
  if (dry) { console.log('Dry run: nothing was written.'); return 0; }
  if (!r.changes.length) { console.log('Nothing to write.'); return 0; }
  const hashes = writeChanges(dir, packs, r.changes);
  console.log('Wrote the st fields. New sha256 of each changed pack (for the owner to approve and re-pin):');
  for (const [f, h] of Object.entries(hashes)) console.log(`  ${f}  ${h}`);
  console.log('Note: node test.js and tests/pinned-hashes.js will now fail on purpose until the owner approves and updates them.');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv);
