# Firefox: the start button never starts the game without an audio device

CI run 37736469429 (main 515fb2a), job "Test - build checks, Chromium,
Firefox (required)": `[firefox] tests/keyboard.spec.mjs:25` fails on both
attempts at line 32. `window.arcade.running && window.arcade.frame > 0`
never becomes true. Lines 30 and 31 pass. The deploy job never runs.

## The start path

`site/js/player.js`, `start()` (the `#start` click handler; Enter on the
focused button is a click):

1. `started = true`, `#start` hidden, `#stage` focused (the test's lines 30
   and 31 pass).
2. `if (MANUAL) return;`
3. `await startAudio()`:
   1. `new AudioContext({ sampleRate: 44100, latencyHint: "interactive" })`
   2. `await audio.audioWorklet.addModule(...)`
   3. `new AudioWorkletNode(...)` and `connect`
   4. `if (audio.state !== "running") await audio.resume()`
4. Only then: `running = true`, `requestAnimationFrame(tick)`, and the status
   changes to "Playing.".

A rejection in step 3 is caught: the status shows "Sound could not start…"
and the game runs. A promise that never settles is not caught, and the
game never starts.

`menu.spec.mjs` and `save.spec.mjs` open the page with `?manual=1`. They
leave `start()` at step 2 and step frames through `arcade.runScript()`. They
skip all of step 3, which is why they pass in the same Firefox run.

## Root cause

When Firefox has no audio output device, `AudioContext.resume()` stays
pending forever. It neither resolves nor rejects, so `start()` waits at
step 3.4 for good. The CI runner (ubuntu-latest, headless, no sound server)
has no audio device. Chromium resolves `resume()` there anyway.

Evidence:

- **CI trace** (the `playwright-report` artifact,
  `test-results/…-firefox/trace.zip`): across all 42 DOM snapshots of the
  run, `#status` reads "Loading…" and then "Ready." and nothing after.
  "Playing." never appears, and neither does "Sound could not start". So
  `startAudio()` neither resolved nor rejected.
- **Local reproduction** (macOS, Playwright Firefox 157, a throwaway probe
  that timestamps each AudioContext step after Enter on `#start`; the probe
  was not committed):

  | Firefox prefs | steps reached | after 6 s |
  |---|---|---|
  | default | ctor → addModule done → resume done → state running | running, frame 297, "Playing." |
  | `media.cubeb.force_null_context: true` (no audio device) | ctor → addModule done → **resume start, never settles** | not running, frame 0, "Ready." |
  | `media.cubeb.backend: "null"` | as default | running |

  `force_null_context` is the setting Firefox uses for "no audio device".
  It reproduces the CI result exactly. Context creation and `addModule`
  succeed; `resume()` hangs.
- Without that setting, the test passes locally 3 out of 3 times in headless
  Firefox (18.8 s each).

## Could a real player hit it?

Yes, but rarely. A Firefox user with no working audio output would see the
start button disappear and the game screen stay frozen with no message,
with nothing they could do. That includes a desktop with no output device,
Linux without PulseAudio or PipeWire running, some VMs and remote desktops,
and a device unplugged or disabled at the OS level. Autoplay
blocking should not cause it, because the click is a user gesture (not
verified separately). But any browser where `resume()` waits indefinitely,
for whatever reason, would hang the same way, because the game waited on
audio before it started.

## Fix

- `start()` starts emulation immediately. Sound never gates the game.
- Audio comes up asynchronously, with a bounded wait (`AUDIO_START_MS`). If
  it fails or times out, the game keeps running silently. A small notice
  button, "Sound unavailable — click to retry", appears below the screen.
  Clicking it (a fresh user gesture) tries again. If a pending `resume()`
  settles later, the context's `statechange` hides the notice.
- Samples go to the worklet only while the context is running.
- Tests: the keyboard-start flow runs with `AudioContext.resume()` stubbed
  to never settle and with `AudioContext` stubbed to throw (Chromium and
  Firefox). In Firefox it also runs with the real
  `media.cubeb.force_null_context` setting. The 15 s timeout, retries, and
  projects are unchanged.
