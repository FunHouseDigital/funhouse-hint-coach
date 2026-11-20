// Loads the small model on first use and answers one classification prompt at a time.
// CPU only: n_gpu_layers 0, so wllama never starts WebGPU. wllama runs inference in a Web Worker.
import { Wllama } from '../vendor/wllama/index.js';
import { MODEL, GEN, N_CTX } from './config.js';

let wllama = null;
let loading = null;
export const info = { loaded: false, threads: 1, multithread: false, bytes: MODEL.bytes, file: MODEL.path.split('/').pop() };

async function fetchModelBlob(onProgress) {
  const res = await fetch(new URL('../' + MODEL.path, import.meta.url));
  if (!res.ok) throw new Error('Model file not found: ' + MODEL.path + ' (run: node scripts/fetch-model.js)');
  const total = Number(res.headers.get('content-length')) || MODEL.bytes;
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onProgress?.(got, total);
  }
  return new Blob(parts);
}

export function ensureModel(onProgress) {
  if (info.loaded) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    const w = new Wllama({ default: new URL('../vendor/wllama/wllama.wasm', import.meta.url).href }, { suppressNativeLog: true });
    // Older browsers without JSPI or Memory64 get the compat build, served locally (never the CDN default).
    w.setCompat({
      worker: new URL('../vendor/wllama-compat/wllama.js', import.meta.url).href,
      wasm: new URL('../vendor/wllama-compat/wllama.wasm', import.meta.url).href,
    });
    const blob = await fetchModelBlob(onProgress);
    const isolated = self.crossOriginIsolated === true;
    const n_threads = isolated ? Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 2) / 2))) : 1;
    await w.loadModel([blob], { n_ctx: N_CTX, n_gpu_layers: 0, n_threads });
    wllama = w;
    info.loaded = true;
    info.multithread = w.isMultithread();
    info.threads = w.getNumThreads();
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

// Returns { text, ms }. The text is cut at the first newline.
export async function classify(prompt) {
  await ensureModel();
  const t0 = performance.now();
  const r = await wllama.createChatCompletion({
    messages: [{ role: 'user', content: prompt }],
    max_tokens: GEN.max_tokens,
    temperature: GEN.temperature,
  });
  const ms = performance.now() - t0;
  const text = (r.choices?.[0]?.message?.content ?? '').trim().split('\n')[0];
  return { text, ms };
}
