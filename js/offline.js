// Registers the service worker and fills the caches once, with progress.
// The model goes straight from the network into the Cache API as a stream, so it is never held in memory.
import { MODEL } from './config.js';

// Must match the names in sw.js. Bump the shell version on every release so updates arrive.
const SHELL = 'hint-coach-shell-v4';
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

// Puts the model into the Cache API once (streamed, never held in memory). Shared by the
// offline saver and the model loader, so the file is only fetched once at a time.
let modelCaching = null;
const progressFns = new Set();
export function ensureModelCached(onGot) {
  if (onGot) progressFns.add(onGot);
  if (!modelCaching) {
    modelCaching = (async () => {
      const mc = await caches.open(MODEL_CACHE);
      const mu = new URL(MODEL.path, base).href;
      const have = await mc.match(mu);
      if (!have || Number(have.headers.get('content-length')) !== MODEL.bytes) {
        let got = 0;
        await putStream(mc, mu, (n) => { got += n; for (const f of progressFns) f(got); });
      }
      return mu;
    })();
    modelCaching.catch(() => { modelCaching = null; });
  }
  return modelCaching;
}

// The model as a Blob straight from the Cache API. Chrome backs this Blob with the file on disk,
// so the page does not hold a second full copy of the model in memory.
export async function cachedModelBlob(onGot) {
  const mu = await ensureModelCached(onGot);
  const res = await (await caches.open(MODEL_CACHE)).match(mu);
  if (!res) throw new Error('Model is not in the offline cache');
  const blob = await res.blob();
  if (blob.size !== MODEL.bytes) {
    await (await caches.open(MODEL_CACHE)).delete(mu); // a broken copy: fetch it again next time
    modelCaching = null;
    throw new Error('Model file has the wrong size: ' + blob.size);
  }
  return blob;
}

export async function registerOffline(msgEl) {
  if (!('serviceWorker' in navigator) || !('caches' in self)) { if (msgEl) msgEl.textContent = 'Offline mode not supported in this browser.'; return; }
  const say = (t) => { if (msgEl) msgEl.textContent = t; };
  // When a newer version takes over, reload once so the new app shows straight away. Only while no
  // learner has started (the start screen is showing), so no in-memory notes are ever lost.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    const started = document.getElementById('main') && !document.getElementById('main').hidden;
    if (started) { say('A newer version is ready. Reload the page when this learner is done.'); return; }
    reloaded = true;
    location.reload();
  });
  try {
    await navigator.serviceWorker.register(new URL('sw.js', base), { scope: base.pathname });
    // Remove shell caches from older versions (an old page may have refilled one during the update).
    for (const k of await caches.keys()) if (k.startsWith('hint-coach-shell-') && k !== SHELL) await caches.delete(k);
    const shell = await caches.open(SHELL);
    for (const f of SHELL_FILES) {
      const u = new URL(f, base).href;
      if (!(await shell.match(u))) await putStream(shell, u, () => {});
    }
    let last = 0;
    await ensureModelCached((got) => {
      if (performance.now() - last > 500) { last = performance.now(); say(`Saving for offline: helper model ${Math.round((got / MODEL.bytes) * 100)}%`); }
    });
    say('Ready offline.');
  } catch (e) {
    say('Offline saving stopped: ' + e.message + '. It will try again next time.');
  }
}
