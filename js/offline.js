// Registers the service worker and fills the caches once, with progress.
// The model goes straight from the network into the Cache API as a stream, so it is never held in memory.
import { MODEL } from './config.js';

// Must match the names in sw.js. Bump the shell version on every release so updates arrive.
const SHELL = 'hint-coach-shell-v2';
const MODEL_CACHE = 'hint-coach-model-' + MODEL.sha256.slice(0, 8);
const base = new URL('../', import.meta.url);
export const SHELL_FILES = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg', 'css/app.css', 'engine.js',
  'js/app.js', 'js/coach.js', 'js/config.js', 'js/model.js', 'js/offline.js',
  'vendor/wllama/index.js', 'vendor/wllama/wllama.wasm',
  'vendor/wllama-compat/wllama.js', 'vendor/wllama-compat/wllama.wasm',
  'packs/t1-l1.json', 'packs/t2-l1.json', 'packs/t3-l1.json', 'packs/g910-t1-l1.json',
  'eval/', 'eval/index.html', 'eval/eval.js', 'eval/counts.js', 'eval/cases.json',
];

async function putStream(cache, url, onBytes) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(url + ': HTTP ' + res.status);
  const counter = new TransformStream({ transform(chunk, ctl) { onBytes(chunk.byteLength); ctl.enqueue(chunk); } });
  await cache.put(url, new Response(res.body.pipeThrough(counter), { status: 200, headers: res.headers }));
}

export async function registerOffline(msgEl) {
  if (!('serviceWorker' in navigator) || !('caches' in self)) { if (msgEl) msgEl.textContent = 'Offline mode not supported in this browser.'; return; }
  const say = (t) => { if (msgEl) msgEl.textContent = t; };
  try {
    await navigator.serviceWorker.register(new URL('sw.js', base), { scope: base.pathname });
    const shell = await caches.open(SHELL);
    for (const f of SHELL_FILES) {
      const u = new URL(f, base).href;
      if (!(await shell.match(u))) await putStream(shell, u, () => {});
    }
    const mc = await caches.open(MODEL_CACHE);
    const mu = new URL(MODEL.path, base).href;
    const have = await mc.match(mu);
    if (!have || Number(have.headers.get('content-length')) !== MODEL.bytes) {
      let got = 0, last = 0;
      await putStream(mc, mu, (n) => {
        got += n;
        if (performance.now() - last > 500) { last = performance.now(); say(`Saving for offline: helper model ${Math.round((got / MODEL.bytes) * 100)}%`); }
      });
    }
    say('Ready offline.');
  } catch (e) {
    say('Offline saving stopped: ' + e.message + '. It will try again next time.');
  }
}
