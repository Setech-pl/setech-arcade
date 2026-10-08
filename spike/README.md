# Emulator spike (Phase A)

Everything behind [docs/spike-emulator.md](../docs/spike-emulator.md): the
scripts, the reference harness, the browser prototypes and the measured
results. Third-party code and binaries are fetched or built into
`spike/.cache/`, `spike/vendor/` and next to the prototypes; none of it is in
git (see `.gitignore`).

## Reproduce

Requirements: macOS or Linux, Node 24+, `gh` (logged in), `ffmpeg`, a C
compiler and zlib. The original-OS runs also need your own `ATARIXL.ROM` and
`ATARIBAS.ROM` in `~/rom` (or `VS65_ROM_DIR`); they are never copied here.

```bash
npm ci && npx playwright install chromium firefox webkit
spike/scripts/get-atr.sh                 # v0.2.2 release ATR, SHA-256 checked
spike/scripts/build-native-harness.sh    # atari800 7.2.1 as libatari800 + spike/harness/vs65-harness.c
node spike/scripts/reference-run.mjs     # the whole game, AltirraOS / original OS x BASIC off / on
node spike/scripts/compare-altirraos.mjs # AltirraOS vs original OS, per checkpoint
node spike/scripts/extract-altirra-roms.mjs   # AltirraOS 3.49 + Altirra BASIC 1.59 as ROM files

spike/scripts/build-wasm.sh              # P1: atari800 7.2.1 -> WebAssembly (installs emsdk in .cache)
spike/scripts/build-jsa8e.sh             # P2: jsA8E at a pinned commit
spike/scripts/build-sfotty.sh            # P3: Sfotty Pie at a pinned commit, bundled

node spike/scripts/prototype-measure.mjs atari800-wasm   # Chromium, Firefox, WebKit
node spike/scripts/prototype-measure.mjs sfotty-pie
node spike/scripts/jsa8e-check.mjs
node spike/scripts/p3-sfotty-run.mjs     # Sfotty Pie headless in Node
node spike/scripts/compare-to-reference.mjs spike/results/p3-sfotty-pie/node spike/results/p3-sfotty-pie/side-by-side
node spike/scripts/audio-capture.mjs     # menu music from each core
node spike/scripts/audio-drift.mjs       # real-time audio queue over 60 s
node spike/scripts/throttle-check.mjs    # per-frame cost under CPU throttling
node spike/scripts/mobile-check.mjs      # iPhone-sized WebKit, touch controls
node spike/scripts/cors-check.mjs        # can a page fetch the release ATR?
node spike/scripts/make-sheets.mjs       # the five fixed points, side by side

node spike/scripts/serve.mjs             # then open the prototypes:
#   http://localhost:8765/spike/prototypes/atari800-wasm/
#   http://localhost:8765/spike/prototypes/sfotty-pie/
```

Every run works on a copy of the ATR: the game writes its best score to
sector 599 of its own disk.

## Layout

| Path | What |
|---|---|
| `harness/vs65-harness.c` | Scripted, headless atari800 (libatari800): input, screenshots, RAM peek/poke, waits, WAV, power cycle |
| `../emulator/atari800/wasm-glue.c` | The C surface the WebAssembly build exports to JavaScript (moved there for the site) |
| `scripts/lib/scenario.mjs` | The reference scenario, one script for the native and the browser runs |
| `prototypes/shared/host.js` | Emulator-agnostic page host: picture, input, audio, pacing, IndexedDB saves, `window.vs` |
| `prototypes/atari800-wasm/` | P1 core adapter + page |
| `prototypes/sfotty-pie/` | P3 core adapter + page |
| `proposals/` | Phase B drafts, since adopted: `.github/workflows/deploy.yml`, `games/<id>.json` |
| `results/` | Measured output; every file is written by a script above |
