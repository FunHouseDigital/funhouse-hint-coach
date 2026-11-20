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
- The facilitator can clear notes any time. **Clear this learner's record** removes every note for the current learner code (it asks "Clear all notes for L3? This cannot be undone."). **Clear all records** removes the notes for every learner. Cleared notes are not in any later CSV export.
- The first screen says one thing: "Your answers stay on this laptop."
- **Export session notes** builds a CSV on the laptop (no network) with: learner code, exercise id, event (hint, done, ask_facilitator), hint level, diagnosis, helpful / not helpful, and how it was checked (code, model or baseline fallback). No free text from the learner goes into the CSV.
- The offline cache (service worker) holds only app files, packs, eval cases and the model. These are not learner data, and the clear buttons do not touch them.

### What is kept after the tab closes

| Thing | Where it lives | Closed tab | Browser restart |
|---|---|---|---|
| Session notes (learner code, hints, ratings) | page memory (`Session` in `js/app.js`) | gone | gone |
| Hint progress (level, diagnosis per exercise) | page memory (`ladder` in `js/app.js`) | gone | gone |
| Language choice, learner code typed | page memory | gone (back to English) | gone |
| /eval results | page memory (`report` in `eval/eval.js`) | gone | gone |
| App files, packs, eval cases, model | Cache API (`hint-coach-shell-v3`, `hint-coach-model-74a4da8c`) | kept | kept |
| Service worker | browser service worker registration | kept | kept |
| Exported CSV, JSON or counts .txt | the Downloads folder (only when someone presses a download button) | kept | kept |

The app uses no localStorage, sessionStorage, IndexedDB, cookies or OPFS. wllama has OPFS cache code, but only for loading from a URL or Hugging Face, which this app never calls. To save /eval results, press **Download full report (JSON)** or **Download counts (.txt)** before closing the tab. The .txt holds only counts, timings and device facts, never case texts or answers.

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

This builds `dist/usb-pack/` (about 521 MB): `Start Hint Coach.cmd`, `README-USB.txt` and the `app` folder (app, vendor files, model, packs, eval). Copy the whole `usb-pack` folder to a USB stick.

On the school laptop (Windows 10 or 11, no internet needed):

1. Plug in the USB stick. Copy the `usb-pack` folder to the laptop (for example to Documents). It runs from the USB stick too, but loading is faster from the laptop's own disk.
2. Open the folder. Double-click **Start Hint Coach.cmd**. (If Windows hides file endings it shows as "Start Hint Coach", type "Windows Command Script".)
3. If a blue box says **Windows protected your PC**, click **More info**, then **Run anyway**. See the next section.
4. A black window opens and says "FunHouse Hint Coach is running on this laptop only". The browser opens the app at `http://127.0.0.1:8765/app/` (or the next port up to 8785).
5. Keep the black window open while you use Hint Coach. Use Chrome or Edge if the browser asks.
6. When you are done, press **Export session notes** first if you want the notes. Then close the browser tab and close the black window. Closing the black window stops the server.

What `Start Hint Coach.cmd` is: one plain text file you can open in Notepad. The notes at the top explain it for teachers and IT. It starts Windows PowerShell 5.1 (built into Windows) and runs a tiny web server with `System.Net.HttpListener` bound only to `http://127.0.0.1`. It serves only the pack folder, with the right file types, refuses paths that try to leave the folder, supports Range requests for the model file, and sends `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Resource-Policy: same-origin`, so the model may use several threads. If the browser is not cross-origin isolated anyway, the app uses one thread by itself. It needs no admin rights, installs nothing, writes nothing, makes no internet connection and changes no system settings (`-ExecutionPolicy Bypass` applies to that one window only).

### If PowerShell is blocked or antivirus warns

**"Windows protected your PC" (blue box, Microsoft Defender SmartScreen)**
- What it means: Windows has not seen this file before, and it came from outside (a USB stick or a download). It is not saying the file is harmful.
- What to do: click **More info**, check the name says Start Hint Coach.cmd, then click **Run anyway**. Windows usually asks only once.
- If there is no Run anyway button, the school has locked this. Ask IT (see the last point).

**Antivirus warns or the file disappears (quarantine)**
- What it means: some antivirus tools flag any script that starts PowerShell, even a harmless one. It is a general rule, not a finding about this file.
- What to do: open the antivirus app, find the file in its quarantine or history list, and choose **Restore** and **Allow**. In Windows Security: Virus and threat protection > Protection history > pick the item > Actions > Restore.
- Or ask IT to allow this one file. Show them the notes at the top of `Start Hint Coach.cmd` (right-click > Open with > Notepad). Every line is plain text.

**The black window opens and closes, or shows red text about policy or "language mode"**
- What it means: the school has turned PowerShell off or limited it with a group policy. Bypass for one window cannot get past that, and it should not.
- What to do: ask IT to allow `Start Hint Coach.cmd` for this laptop. Or use the one-time-online way below on that laptop instead: open the app once while online from a web server, wait for "Ready offline.", and after that it works with no internet.

**"Could not find a free port"**
- What it means: ports 8765 to 8785 are all in use, usually because Hint Coach is already open many times.
- What to do: close the other black Hint Coach windows and try again.

### One-time-online PWA way

Host the folder on any web server (HTTPS, or `http://127.0.0.1`). Open it once while online and leave the tab open until the bottom of the help panel says **Ready offline.** (the model is about 491 MB). After that the app and /eval work with no network, in the same browser on the same laptop. If the server sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, the model can use more than one thread.

### Copy this to another school

For a teacher who has never seen Hint Coach.

**What is on the USB pack** (about 521 MB in total):

- `Start Hint Coach.cmd`: the start file. Double-click this one.
- `README-USB.txt`: a short note.
- `app`: the app, the helper model (about 491 MB) and the exercises. Do not change anything in it.

**What the laptop needs:**

- Windows 10 or Windows 11.
- Chrome or Edge.
- Nothing to install, and no admin password.
- No internet once the files are copied.

**Steps:**

1. Copy the whole pack folder from the USB stick to the laptop, for example into Documents. Copy the folder, not single files.
2. Open the copied folder and double-click **Start Hint Coach.cmd**.
3. A black window opens. It says "FunHouse Hint Coach is running on this laptop only". Leave it open.
4. The web browser opens the app by itself, at an address like `http://127.0.0.1:8765/app/`.
5. The first screen says "Your answers stay on this laptop." Type a learner code like L1 and press Start.
6. When you are done, close the browser tab, then close the black window. That stops Hint Coach.

**If Windows or the school blocks the start file:**

- **"Windows protected your PC"** (a blue box): Windows has not seen this file before. Click **More info**, then **Run anyway**.
- **Antivirus removes or blocks the file**: some antivirus tools block any file that starts PowerShell. Restore it from the antivirus history and allow it, or ask IT to allow this one file. IT can read the notes at the top of the file in Notepad.
- **The black window closes at once, or shows red text about a policy**: the school has turned PowerShell off. Ask IT to allow `Start Hint Coach.cmd`, or use the one-time-online way above.
- More detail: see "If PowerShell is blocked or antivirus warns" above.

**Check the start file is the real one (its sha256 fingerprint):**

1. Open the pack folder. Click the address bar, type `powershell` and press Enter. A blue or black window opens in that folder.
2. Type this and press Enter:

   ```
   Get-FileHash ".\Start Hint Coach.cmd" -Algorithm SHA256
   ```

3. Compare the long code under "Hash" with the value printed here, in this README:

   `DFB4BFE04B707AA0344707BA661EB4B42617B49CEAD07FD6A81EE4D1C4DAC22E`

4. If they match, the file is the real one. If they do not match, do not run it. Ask for a fresh copy.

Another way, in a Command Prompt opened in the pack folder (it prints the same code in small letters):

```
CertUtil -hashfile "Start Hint Coach.cmd" SHA256
```

If `Start Hint Coach.cmd` ever changes, this README line must be updated in the same change.

**What was tested on the build PC** (Windows 11 Pro, Chrome 157):

- `Start Hint Coach.cmd` started from the pack folder on the PC's own disk. The black window appeared, and the PC's default browser (Chrome) opened the app.
- The server answered only on 127.0.0.1, with the right file types and headers. It refused paths outside the folder and stopped when its window closed.
- In headless Chrome (no window), through that server: all four exercise types, the sentence model, /eval, the CSV export and the clear buttons worked.
- Emulated offline in headless Chrome: DevTools offline mode, only 127.0.0.1 reachable, and the server stopped. The app still worked from the offline cache.
- `Get-FileHash` and `CertUtil -hashfile` both gave the sha256 above.

**Not tested yet:**

- Edge.
- A real 4 GB laptop.
- A locked-down school laptop, or one with PowerShell turned off.
- Real airplane mode.
- The SmartScreen box on a fresh laptop. The build PC never showed it, because the file was made there and not copied in.
- Antivirus products. The build PC's own antivirus raised no warning, but for the same reason that proves little.
- Copying the pack to another PC, and running it straight from the USB stick.
- Windows 10.

### Airplane-mode check (do this on the real laptop)

Only this check proves the laptop works with no network. The build PC test is an emulation (see below).

**PWA way (loaded once online)**

1. With the network on, start Hint Coach with `Start Hint Coach.cmd` (or the web server you use). Wait until the help panel says **Ready offline.**
2. Close the browser and the black window.
3. Turn on airplane mode, or unplug the network cable and turn off Wi-Fi.
4. Start `Start Hint Coach.cmd` again, and the browser opens the app. (If step 1 used a web server instead, open the browser at the same address. The app must load from the offline cache.)
5. Type learner code L1 and press Start.
6. Open one exercise of each type: a route (build cards, Run my route, Get hint), a sort (put cards on mats, Get hint), a predict (type x and y, Get hint) and a sentence (type a sentence, Get hint).
7. Wait for the sentence hint. The first one loads the helper model, then shows Thinking... and the seconds.
8. Open the Eval page link. Press the two run buttons and wait until it says "Sentence cases done."
9. Go back to the app and press Export session notes. A CSV file downloads.
10. Pass: every step works, a hint or "Well done" shows on all four screens, /eval finishes, and the CSV opens with one row per hint. Fail: any "Something went wrong", "could not load" or browser "no internet" page. Write down which step failed.

**USB-pack way (never online at all)**

1. Use a laptop that has never opened Hint Coach. Turn on airplane mode first (or unplug the network) and leave it on.
2. Copy the `usb-pack` folder from the USB stick to the laptop. Double-click `Start Hint Coach.cmd`.
3. Do steps 5 to 9 above.
4. Close the browser and the black window. Start `Start Hint Coach.cmd` again and do one sentence hint again.
5. Pass: the same as above, with no network at any time.

**What the build PC test did (emulated, not airplane mode)**: one online load through `Start Hint Coach.cmd`'s server, then the server was stopped, a new browser process opened with the same profile, DevTools offline emulation was on from the first request, and the browser could not resolve any host name except 127.0.0.1. All four screens, the sentence model, /eval and the CSV export worked. The Wi-Fi and network adapter of the PC stayed on, so this is not a real airplane-mode test.

Opening `index.html` straight from the disk (`file://`) does **not** work. Browsers block modules, workers and the offline cache there.

## Tests

```
npm test
```

- `node test.js`: the owner's checks (pack structure, 60 synthetic cases, 18,000 random routes).
- `tests/pinned-hashes.js`: fails if `engine.js`, the packs or `eval/cases.json` differ from the pinned v0.1.2 files.
- `tests/app-checks.js`: the app's own logic with a fake model (sentence flow and fallback, curly apostrophes straightened before `parseChoice`, hint ladder, learner code check, CSV).

## Known limits

- All hints are drafts and need a teacher check.
- Every Sesotho field in the packs is empty on purpose. The app shows English with a tag until a Sesotho speaker writes them.
- The eval cases in `eval/cases.json` are **synthetic**, written by the author. They are not learner data. Do not quote /eval results as learner results.
- No accuracy or speed numbers are published here. Run /eval on the target laptop and use only those.
- The first sentence exercise loads the model (about 491 MB) into memory. On a 4 GB laptop close other apps first. Measured on the build PC only (this PC, not the school laptop; headless Chrome, 4 threads, private memory of each Chrome process): the Hint Coach tab used about 30 MB before the model, up to about 1,040 MB while loading the model and answering, and about 830 MB after one hint. All Chrome processes together peaked at about 1,220 MB. The model is read from the offline cache as a disk-backed file, so the page does not keep a second full copy. Use the /eval page on the real laptop for its own figure.
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
