// The sheet must have exactly one entry per English hint field (and per done message with an st field),
// unique keys, no Sesotho filled in, CRLF lines, and match the committed file.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSheet, PACK_FILES } from '../scripts/make-translation-sheet.js';

const root = fileURLToPath(new URL('..', import.meta.url));
let fail = 0;
const bad = (m) => { fail++; console.log('FAIL', m); };

const want = new Set();
for (const f of PACK_FILES) {
  const p = JSON.parse(readFileSync(root + 'packs/' + f, 'utf8'));
  for (const [id, h] of Object.entries(p.hints)) h.en.forEach((_, i) => want.add(`${f} | ${id} | ${i + 1}`));
  if ('st' in p.done) want.add(`${f} | done | -`);
}

const file = readFileSync(root + 'docs/sesotho-translation-sheet.txt', 'utf8').replace(/^\uFEFF/, '');
const { text } = buildSheet();
if (file !== text) bad('docs/sesotho-translation-sheet.txt is out of date: run node scripts/make-translation-sheet.js');
if (/[^\r]\n/.test(file)) bad('sheet has a line ending that is not CRLF');

const keys = [...file.matchAll(/^\[(.+)\]\r?$/gm)].map((m) => m[1]);
if (keys.length !== want.size) bad(`entries ${keys.length}, want ${want.size}`);
if (new Set(keys).size !== keys.length) bad('duplicate keys');
for (const k of keys) if (!want.has(k)) bad('unknown key ' + k);
for (const k of want) if (!keys.includes(k)) bad('missing key ' + k);
const filled = [...file.matchAll(/^Sesotho: (.+)$/gm)].filter((m) => m[1].trim());
if (filled.length) bad('Sesotho lines must be empty');

if (fail) process.exit(1);
console.log(`translation sheet checks passed (${keys.length} entries)`);
