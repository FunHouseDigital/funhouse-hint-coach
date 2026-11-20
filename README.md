# FunHouse Hint Coach

A small offline helper for FunHouse exercises. A learner tries an exercise. When they are stuck they press **Get hint**. The app works out the likely mistake and shows a short hint. **More help** shows a stronger hint, up to three. After that it says "Ask your facilitator".

It runs in the browser on the laptop itself. It needs no internet after the first load, no account and no server on the internet.

**Status: draft.** All hints are drafts and need a teacher check before real use.

## What it does

- Exercise types (one screen each):
  - **route**: build a robot route on a 4x4 grid (A to D across, 1 to 4 up, A1 bottom left) with Forward, Turn Left and Turn Right cards. "Run my route" walks the robot one card at a time (instant when the computer asks for reduced motion).
  - **sort**: tap a part card, then tap a mat (INPUT, PROCESSING, OUTPUT, STORAGE).
  - **predict**: type x and y.
  - **sentence**: type one sentence.
- Route, sort and predict answers are checked exactly by code (`engine.js`).
- Sentence answers are read by a small language model on the laptop. The model only picks one label, using `classifyPrompt` and `parseChoice` from `engine.js`. If its reply is unclear, the app uses the keyword check in `engine.js` instead and notes "baseline fallback". The model never chats with the learner. Every hint shown comes from the packs through `hintFor`.
- English and Sesotho hint toggle. The screen labels stay English. When a Sesotho hint is empty the app shows the English hint with the tag "English until the Sesotho is checked".
- Every hint has Helpful / Not helpful buttons.
- **/eval/** page: runs the synthetic test cases. Route, sort and predict cases show pass or fail. Sentence cases run both the model and the keyword check side by side and show accuracy, median and slowest model time, and peak memory when the browser reports it. "Download full report" saves a JSON file.

## Privacy design

- Nothing leaves the device. The app makes no network calls except fetching its own files from the same place it was opened from. No analytics, no external fonts, no CDNs.
- The facilitator types an anonymous learner code (L1, L2 and so on). Anything else is refused. No names, no ages.
- Session notes live in memory only. They are gone when the tab closes. There is no localStorage or IndexedDB for learner records.
- **Export session notes** builds a CSV on the laptop (no network) with: learner code, exercise id, event (hint, done, ask_facilitator), hint level, diagnosis, helpful / not helpful, and how it was checked (code, model or baseline fallback). No free text from the learner goes into the CSV.
- The offline cache (service worker) holds only app files, packs, eval cases and the model. No learner data.

## Model and libraries

| Item | Value |
|---|---|
| Model | Qwen2.5-0.5B-Instruct, GGUF Q4_K_M |
| File | `qwen2.5-0.5b-instruct-q4_k_m.gguf` |
| Size | 491,400,032 bytes (about 491 MB) |
| sha256 | `74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db` |
| Source | [Qwen/Qwen2.5-0.5B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF) at revision `9217f5db79a29953eb74d5343926648285ec7e67` |
| Licence | Apache 2.0 (per the model card) |
| Runtime | [wllama](https://github.com/ngxson/wllama) `@wllama/wllama` 3.13.0 and `@wllama/wllama-compat` 3.13.0, MIT, vendored in `vendor/` (see `vendor/README.md`) |

Why this model: it fits a 4 GB RAM laptop, it is under 0.5B parameters, the official repo publishes a Q4_K_M file, and the licence is Apache 2.0. The other candidate, SmolLM2-360M-Instruct, has only a Q8_0 file (386 MB) in its official GGUF repo, so there is no official Q4_K_M to pin. Accuracy and speed were **not** used to choose. Measure those with /eval on the real laptop.

Settings: CPU only (`n_gpu_layers: 0`, WebGPU is never used), temperature 0, at most 8 new tokens, the reply is cut at the first newline. Context 1024 tokens. The model is loaded only when a sentence exercise first needs it. Inference runs in a Web Worker, so the screen stays responsive. Threads: more than one only when the page is `crossOriginIsolated`, otherwise one thread. (wllama 3 ships one wasm build and turns threads on or off at load time. Browsers without WebAssembly JSPI or Memory64 get the local compat build instead.)

The model file is not in git (GitHub refuses files over 100 MB). Get it with:

```
node scripts/fetch-model.js
```

This downloads from the pinned Hugging Face revision into `models/` and checks the sha256. A wrong file is deleted.

To swap the model later, change `MODEL` in `js/config.js` and the same values in `scripts/fetch-model.js`, and the model cache name in `sw.js`.

## How to run it offline

### USB pack (no internet on the school laptop)

On a PC with internet and Node 18 or newer:

```
node scripts/fetch-model.js
node scripts/make-usb-pack.js
```

This builds `dist/usb-pack/` (app, vendor files, model, packs, eval and `README-USB.txt`). Copy that folder to a USB stick.

The start file **Start Hint Coach.cmd** is not built yet. Its exact contents are waiting for the owner's approval. When it is added it will sit at the pack root and start a tiny web server built into Windows PowerShell, bound only to 127.0.0.1, then open the browser. The school laptop will need nothing installed.

### One-time-online PWA way

Host the folder on any web server (HTTPS, or `http://127.0.0.1`). Open it once while online and leave the tab open until the bottom of the help panel says **Ready offline.** (the model is about 491 MB). After that the app and /eval work with no network, in the same browser on the same laptop. If the server sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, the model can use more than one thread.

Opening `index.html` straight from the disk (`file://`) does **not** work. Browsers block modules, workers and the offline cache there.

## Tests

```
npm test
```

- `node test.js`: the owner's checks (pack structure, 60 synthetic cases, 18,000 random routes).
- `tests/pinned-hashes.js`: fails if `engine.js`, the packs or `eval/cases.json` differ from the pinned v0.1.2 files.
- `tests/app-checks.js`: the app's own logic with a fake model (sentence flow and fallback, hint ladder, learner code check, CSV).

## Known limits

- All hints are drafts and need a teacher check.
- Every Sesotho field in the packs is empty on purpose. The app shows English with a tag until a Sesotho speaker writes them.
- The eval cases in `eval/cases.json` are **synthetic**, written by the author. They are not learner data. Do not quote /eval results as learner results.
- No accuracy or speed numbers are published here. Run /eval on the target laptop and use only those.
- The first sentence exercise loads the model (about 491 MB) into memory. On a 4 GB laptop close other apps first.
- Very old browsers fall back to the slower compat build. Firefox without JSPI runs on the main build without compat, as wllama recommends.
- Session notes are lost if the tab is closed before export.
- The G910 predict exercises assume the ball starts at x -200, y 0 (see the pack notes). Confirm against the real starter file.
- When the app is updated, bump the shell cache name in both `sw.js` and `js/offline.js` so laptops pick up the new files.

## Licences

- Code: MIT, see `LICENSE`.
- Exercise packs (`packs/*.json`): CC BY 4.0, see `LICENSE-packs`. (It sits at the root because `test.js` reads every file in `packs/` as JSON.)
- wllama: MIT, see `vendor/wllama/LICENCE`.
- Model: Apache 2.0, from the Qwen model card. The model file is not in this repo.

## Sharing this repo

The repo is private.

**Add a person** (they get an email invite):

- On GitHub: Settings > Collaborators > Add people, then type their email or GitHub username.
- With gh (needs their GitHub username):

  ```
  gh api -X PUT repos/FunHouseDigital/funhouse-hint-coach/collaborators/USERNAME -f permission=pull
  ```

  Use `permission=push` if they should be able to change code.

**Make it public** (anyone can see it, this is hard to take back):

- On GitHub: Settings > General > Danger zone > Change visibility > Public.
- With gh:

  ```
  gh repo edit FunHouseDigital/funhouse-hint-coach --visibility public --accept-visibility-change-consequences
  ```
