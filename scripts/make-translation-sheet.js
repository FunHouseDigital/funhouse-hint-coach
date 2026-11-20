// Writes docs/sesotho-translation-sheet.txt from the packs (UTF-8, CRLF, for Notepad).
// Usage: node scripts/make-translation-sheet.js
// Entry key: [pack file | hint id | level]. The done message uses [pack file | done | -].
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
export const PACK_FILES = ['t1-l1.json', 't2-l1.json', 't3-l1.json', 'g910-t1-l1.json'];

export function buildSheet() {
  const L = [
    'FunHouse Hint Coach - Sesotho translation sheet',
    '',
    'What this is: every hint the Hint Coach app can show, in English.',
    'Please write the Sesotho under each English line, on the line that starts with "Sesotho:".',
    '',
    'Rules:',
    '- Do not change the line in square brackets, like [t1-l1.json | lr_swapped | 2]. It tells us where your text goes.',
    '- Keep {end} and {target} exactly as written. The app puts a square name there, like C3.',
    '- If you are not sure, leave the Sesotho line empty. The app will show English for that hint.',
    '- Level 1 is a small hint. Level 2 is more help. Level 3 is the most help.',
    '- All English hints are drafts too. Tell us if an English line is unclear.',
    '',
    'Order: pack files ' + PACK_FILES.join(', ') + '. In each file: the hints in file order, levels 1 to 3, then the done message.',
    '',
  ];
  let count = 0;
  const entry = (key, en) => { L.push('[' + key + ']', 'English: ' + en, 'Sesotho: ', ''); count++; };
  for (const f of PACK_FILES) {
    const p = JSON.parse(readFileSync(root + 'packs/' + f, 'utf8'));
    L.push('==================== ' + f + ' (' + p.lesson + ': ' + p.title + ') ====================', '');
    for (const [id, h] of Object.entries(p.hints)) {
      L.push('--- ' + id + ': ' + h.desc, '');
      h.en.forEach((en, i) => entry(`${f} | ${id} | ${i + 1}`, en));
    }
    if ('st' in p.done) { L.push('--- done message (shown when the exercise is complete)', ''); entry(`${f} | done | -`, p.done.en); }
  }
  L.push('End of sheet. Entries: ' + count, '');
  return { text: L.join('\r\n'), count };
}

// The shorter sheet: each English line once, with every place it is used.
// Sorted by how many places use it, most first. Ties keep first-seen order of the full sheet.
export function buildUniqueSheet() {
  const lines = new Map(); // English -> [keys]
  for (const f of PACK_FILES) {
    const p = JSON.parse(readFileSync(root + 'packs/' + f, 'utf8'));
    for (const [id, h] of Object.entries(p.hints)) h.en.forEach((en, i) => { if (!lines.has(en)) lines.set(en, []); lines.get(en).push(`${f} | ${id} | ${i + 1}`); });
    if ('st' in p.done) { if (!lines.has(p.done.en)) lines.set(p.done.en, []); lines.get(p.done.en).push(`${f} | done | -`); }
  }
  const L = [
    'FunHouse Hint Coach - Sesotho translation sheet (short version: each English line once)',
    '',
    'What this is: every different English line the Hint Coach app can show. Lines used in the most places come first.',
    'Please write the Sesotho on the line that starts with "Sesotho:". It is used in every place listed under it.',
    '',
    'Rules:',
    '- Do not change the lines in square brackets, like [U12] or [t1-l1.json | lr_swapped | 2]. They tell us where your text goes.',
    '- Keep {end} and {target} exactly as written. The app puts a square name there, like C3.',
    '- If you are not sure, leave the Sesotho line empty. The app will show English for that line.',
    '- All English lines are drafts too. Tell us if an English line is unclear.',
    '',
  ];
  const sorted = [...lines].map((x, i) => [...x, i]).sort((a, b) => b[1].length - a[1].length || a[2] - b[2]);
  let n = 0;
  for (const [en, keys] of sorted) {
    n++;
    L.push(`[U${n}]`, 'English: ' + en, `Used in ${keys.length} place${keys.length === 1 ? '' : 's'}:`, ...keys.map((k) => '  [' + k + ']'), 'Sesotho: ', '');
  }
  L.push('End of sheet. Lines: ' + n, '');
  return { text: L.join('\r\n'), count: n };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(root + 'docs', { recursive: true });
  const full = buildSheet();
  writeFileSync(root + 'docs/sesotho-translation-sheet.txt', '\uFEFF' + full.text, 'utf8');
  console.log('Wrote docs/sesotho-translation-sheet.txt with ' + full.count + ' entries');
  const uniq = buildUniqueSheet();
  writeFileSync(root + 'docs/sesotho-unique-lines.txt', '\uFEFF' + uniq.text, 'utf8');
  console.log('Wrote docs/sesotho-unique-lines.txt with ' + uniq.count + ' unique lines');
}
