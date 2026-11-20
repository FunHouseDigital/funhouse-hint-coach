// Downloads the model file from its official Hugging Face repo at a pinned revision
// and checks a pinned sha256. Node 18+, no extra packages.
// Usage: node scripts/fetch-model.js
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
// Keep these values in step with js/config.js (the app config).
const MODEL = {
  repo: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
  revision: '9217f5db79a29953eb74d5343926648285ec7e67',
  file: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
  bytes: 491400032,
  sha256: '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db',
};
const dest = root + 'models/' + MODEL.file;

function sha256(path) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(path).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

if (existsSync(dest) && statSync(dest).size === MODEL.bytes && (await sha256(dest)) === MODEL.sha256) {
  console.log('Model already present and checked:', dest);
  process.exit(0);
}

mkdirSync(dirname(dest), { recursive: true });
const url = `https://huggingface.co/${MODEL.repo}/resolve/${MODEL.revision}/${MODEL.file}`;
console.log('Downloading', url);
const res = await fetch(url, { redirect: 'follow' });
if (!res.ok) throw new Error('Download failed: HTTP ' + res.status);
const tmp = dest + '.part';
let got = 0;
const total = Number(res.headers.get('content-length')) || MODEL.bytes;
let last = 0;
const body = Readable.fromWeb(res.body);
body.on('data', (c) => {
  got += c.length;
  if (Date.now() - last > 1000) { last = Date.now(); process.stdout.write(`\r${(got / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB`); }
});
await pipeline(body, createWriteStream(tmp));
process.stdout.write('\n');
const sum = await sha256(tmp);
if (sum !== MODEL.sha256) {
  unlinkSync(tmp);
  throw new Error(`sha256 mismatch. Expected ${MODEL.sha256}, got ${sum}. The file was deleted.`);
}
renameSync(tmp, dest);
console.log('Saved and sha256 checked:', dest);
