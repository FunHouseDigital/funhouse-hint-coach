// Browser test for Helpful / Not helpful. Real mouse and keyboard input in headless Chrome or Edge.
// Checks: visible pressed look, "Noted" text, focus kept, last tap wins, recorded per hint, in the CSV,
// and removed by "Clear this learner's record".
// Needs Chrome or Edge on this PC. If neither is found it prints SKIP and passes.
// Serves the repo on 127.0.0.1 only. The model folder answers 404, so no model is loaded or cached.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const exe = BROWSERS.find((p) => existsSync(p));
if (!exe || typeof WebSocket === 'undefined') { console.log('SKIP browser rating test (no Chrome/Edge, or Node without WebSocket)'); process.exit(0); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = normalize(join(root, p));
  if (!f.startsWith(normalize(root)) || p.startsWith('/models/') || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const prof = mkdtempSync(join(tmpdir(), 'hc-browser-'));
const dbg = 9500 + Math.floor(Math.random() * 400);
const br = spawn(exe, ['--headless=new', `--remote-debugging-port=${dbg}`, `--user-data-dir=${prof}`, '--no-first-run', '--disable-gpu', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60 && !ws; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json(); const pg = l.find((t) => t.type === 'page'); if (pg) ws = new WebSocket(pg.webSocketDebuggerUrl); } catch { await sleep(250); }
}
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pend = new Map(); const errors = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id) { pend.get(d.id)?.(d); pend.delete(d.id); } if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result.result.value; };
const wait = async (expr, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr)) return; await sleep(100); } throw new Error('timeout: ' + expr); };

let fail = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.log('FAIL', m, '\n  got ', JSON.stringify(a), '\n  want', JSON.stringify(b)); } };
const btn = (label) => `[...document.querySelectorAll('#hintBox button')].find((b) => b.textContent.replace(/^\\W+/, '') === '${label}')`;
async function mouseClick(sel) {
  const r = await ev(`(() => { const b = ${sel}; const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(150);
}
async function key(k, code, vk) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
  await sleep(150);
}
const csv = () => ev(`(async () => { const o = URL.createObjectURL; let t; URL.createObjectURL = (b) => { b.text().then((x) => { t = x; }); return o(b); }; document.getElementById('exportBtn').click(); await new Promise((r) => setTimeout(r, 300)); URL.createObjectURL = o; return t; })()`);
const state = () => ev(`[${btn('Helpful')}.getAttribute('aria-pressed'), ${btn('Not helpful')}.getAttribute('aria-pressed'), document.querySelector('#hintBox .noted')?.textContent ?? null]`);

try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: base + 'index.html' });
  await wait(`document.querySelectorAll('#exSel option').length === 12`);
  await ev(`document.getElementById('code').value = 'L7'; document.getElementById('codeForm').requestSubmit(); 0`);
  await ev(`(() => { const s = document.getElementById('exSel'); s.value = [...s.options].find((o) => /small hill/.test(o.textContent)).value; s.dispatchEvent(new Event('change')); })(); 0`);
  await ev(`px.value = '45'; py.value = '0'; px.dispatchEvent(new Event('input')); 0`);
  await mouseClick(`document.getElementById('hintBtn')`);
  await wait(`document.querySelector('#hintBox strong')?.textContent === 'Hint 1 of 3'`);
  eq(await state(), ['false', 'false', ''], 'nothing pressed at first');
  const bgBefore = await ev(`getComputedStyle(${btn('Helpful')}).backgroundColor`);

  // Mouse: Helpful
  await mouseClick(btn('Helpful'));
  eq(await state(), ['true', 'false', 'Thanks. Noted: helpful.'], 'Helpful pressed and noted');
  eq((await ev(`getComputedStyle(${btn('Helpful')}).backgroundColor`)) !== bgBefore, true, 'pressed Helpful looks different');
  eq(await ev(`document.activeElement === ${btn('Helpful')}`), true, 'focus stays on Helpful');

  // Keyboard: Tab to Not helpful, Space. Last tap wins.
  await key('Tab', 'Tab', 9);
  eq(await ev(`document.activeElement.textContent`), 'Not helpful', 'Tab moves to Not helpful');
  await key(' ', 'Space', 32);
  eq(await state(), ['false', 'true', 'Thanks. Noted: not helpful.'], 'keyboard changes the rating');
  eq((await csv()).split('\r\n')[1], 'L7,g910-e2,hint,1,distance_not_coordinate,not helpful,code', 'CSV row for hint 1');

  // Level 2 is its own row, starts unrated.
  await mouseClick(btn('More help'));
  await wait(`document.querySelector('#hintBox strong')?.textContent === 'Hint 2 of 3'`);
  eq(await state(), ['false', 'false', ''], 'hint 2 starts unrated');
  await mouseClick(btn('Helpful'));
  const rows = (await csv()).trim().split('\r\n');
  eq(rows.slice(1), ['L7,g910-e2,hint,1,distance_not_coordinate,not helpful,code', 'L7,g910-e2,hint,2,distance_not_coordinate,helpful,code'], 'CSV has one rated row per hint shown');

  // Clear this learner's record removes the ratings too.
  await ev(`window.confirm = () => true; document.getElementById('clearOneBtn').click(); 0`);
  eq((await csv()).trim().split('\r\n').length, 1, 'cleared: CSV is header only');
  eq(errors, [], 'no page errors');
} catch (e) {
  fail++; console.log('FAIL', e.message);
} finally {
  ws.close(); br.kill(); server.close();
  await sleep(500);
  try { rmSync(prof, { recursive: true, force: true }); } catch {}
}
if (fail) { console.log(fail + ' browser rating checks failed'); process.exit(1); }
console.log('browser rating checks passed (' + exe.split(/[\\/]/).pop() + ')');
