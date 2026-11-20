// Fails if the owner's engine, packs or eval cases differ from the pinned v0.1.2 files.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PINNED = {
  'engine.js': 'b4ae2c6e02b513b5dd6a5636be624915a69a55ed6bb063e20c914076fed16d71',
  'eval/cases.json': 'efccf92883d1bbe8cffe233292831a89667ed3ffa8ba4c17ec2d18065a9c8ac4',
  'packs/g910-t1-l1.json': 'db863ad858041f45db741f0edce9fe784bf52f683e26461bb660c7aa7e62b200',
  'packs/t1-l1.json': '8d7712be707f6ba4880e26bc9a3386dd658c5a6499a699e1820fa8e804e7040d',
  'packs/t2-l1.json': '69775356507b19a2ce65be007de7a182e227190f1ecbe2bb5b9392887fd77fee',
  'packs/t3-l1.json': 'b617d232b7c2734876229301e3bcd27f63847960ede424220ebe07cc5c850cc0',
};
const root = fileURLToPath(new URL('..', import.meta.url));
let bad = 0;
for (const [f, h] of Object.entries(PINNED)) {
  const got = createHash('sha256').update(readFileSync(root + f)).digest('hex');
  if (got !== h) { bad++; console.log('FAIL hash mismatch:', f); }
}
if (bad) process.exit(1);
console.log('pinned hashes OK (' + Object.keys(PINNED).length + ' files)');
