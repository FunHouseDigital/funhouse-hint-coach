// Single place for settings. To swap the model, change MODEL (and scripts/fetch-model.js).
export const MODEL = {
  name: 'Qwen2.5-0.5B-Instruct Q4_K_M',
  path: 'models/qwen2.5-0.5b-instruct-q4_k_m.gguf', // relative to the app folder
  bytes: 491400032,
  sha256: '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db',
  licence: 'Apache-2.0',
};
export const GEN = { max_tokens: 8, temperature: 0 }; // greedy, tiny answer, cut at first newline
export const N_CTX = 1024;
export const PACKS = ['t1-l1', 't2-l1', 't3-l1', 'g910-t1-l1'];
export const SIDES = ['INPUT', 'PROCESSING', 'OUTPUT', 'STORAGE'];
