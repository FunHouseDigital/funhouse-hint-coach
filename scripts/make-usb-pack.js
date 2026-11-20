// Builds dist/usb-pack/: the app, vendor files, model, packs, eval and README-USB.txt.
// Runs on the build PC only (Node). The school laptop needs no Node or Python.
// Usage: node scripts/fetch-model.js  then  node scripts/make-usb-pack.js
import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync, readdirSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHELL_FILES } from '../js/offline.js';
import { MODEL } from '../js/config.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist', 'usb-pack');

const model = join(root, MODEL.path);
if (!existsSync(model) || statSync(model).size !== MODEL.bytes) {
  console.error('Model missing or wrong size. Run: node scripts/fetch-model.js');
  process.exit(1);
}
const sum = await new Promise((res, rej) => { const h = createHash('sha256'); createReadStream(model).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });
if (sum !== MODEL.sha256) { console.error('Model sha256 mismatch. Delete it and run fetch-model again.'); process.exit(1); }

rmSync(out, { recursive: true, force: true });
const files = [...SHELL_FILES.filter((f) => !f.endsWith('/')), 'sw.js', 'LICENSE', 'LICENSE-packs', 'vendor/wllama/LICENCE', 'vendor/README.md', MODEL.path];
for (const f of files) {
  const dest = join(out, 'app', f);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(root, f), dest);
}
// shortcut: the start file (Start Hint Coach.cmd) is added here once the owner approves its exact contents.
writeFileSync(join(out, 'README-USB.txt'), [
  'FunHouse Hint Coach - USB pack',
  '',
  'What is here',
  '- app\\  the Hint Coach app, the helper model and the exercise packs.',
  '',
  'How to start it',
  '- The start file (Start Hint Coach.cmd) is not in this pack yet. It is waiting for approval.',
  '- Until then, open the app from a computer that serves this folder on http://127.0.0.1 (see README.md in the repo).',
  '',
  'Privacy',
  '- Nothing leaves the laptop. Learner notes stay in memory until you press Export session notes.',
  '- Use learner codes like L1, L2. Never names.',
  '',
  'All hints are drafts and need a teacher check. The Sesotho hints are empty for now.',
  '',
].join('\r\n'));

const size = (d) => readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? size(join(d, e.name)) : statSync(join(d, e.name)).size), 0);
console.log(`Built ${out} (${(size(out) / 1e6).toFixed(1)} MB)`);
