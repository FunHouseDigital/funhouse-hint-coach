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
const files = [...SHELL_FILES.filter((f) => !f.endsWith('/')), 'sw.js', 'LICENSE', 'LICENSE-packs', 'vendor/wllama/LICENCE', 'vendor/wllama-compat/LICENCE', 'vendor/README.md', 'NOTICE', 'licenses/Qwen2.5-0.5B-Instruct-LICENSE.txt', MODEL.path];
for (const f of files) {
  const dest = join(out, 'app', f);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(root, f), dest);
}
cpSync(join(root, 'usb', 'Start Hint Coach.cmd'), join(out, 'Start Hint Coach.cmd'));
cpSync(join(root, 'docs', 'testing'), join(out, 'testing'), { recursive: true });
// The model's licence and the NOTICE also sit right next to the model file.
cpSync(join(root, 'NOTICE'), join(out, 'app', dirname(MODEL.path), 'NOTICE'));
cpSync(join(root, 'licenses', 'Qwen2.5-0.5B-Instruct-LICENSE.txt'), join(out, 'app', dirname(MODEL.path), 'Qwen2.5-0.5B-Instruct-LICENSE.txt'));
writeFileSync(join(out, 'README-USB.txt'), [
  'FunHouse Hint Coach - USB pack',
  '',
  'What is here',
  '- Start Hint Coach.cmd  the start file: double-click it to start Hint Coach. It is plain text you can open in Notepad.',
  '- app\\  the Hint Coach app, the helper model and the exercise packs.',
  '- testing\\  the test steps (lounge-laptop-test.md) and the results sheet (lounge-laptop-results.txt).',
  '',
  'How to start it',
  '1. Close other programs and browser tabs first.',
  '2. Double-click Start Hint Coach.cmd. A black window opens and then the browser opens the app.',
  '   The black window shows a line like:  Address: http://127.0.0.1:8765/app/',
  '3. Chrome is the browser we tested. If the app opens in another browser and doesn\'t work, open Chrome and type the address shown in the black window.',
  '4. Keep the black window open while you use Hint Coach. Close it to stop.',
  '5. Windows protected your PC: click More info, then Run anyway.',
  '6. If antivirus or a school policy blocks it, show IT the notes at the top of Start Hint Coach.cmd (open it in Notepad).',
  '- No internet is needed. Nothing is installed.',
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
