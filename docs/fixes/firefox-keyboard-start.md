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
step 3.4 for good. The CI runner (ubuntu-24.04, headless, no sound server)
has no audio device. Chromium resolves `resume()` there anyway.

Evidence:

- **CI error context** (`playwright-report` artifact of run 37736469429,
  `test-results/keyboard-void-strike-65-ke-f7f9c--start-button-into-the-game-firefox/error-context.md`
  and `…-firefox-retry1/error-context.md`, the same on both attempts). At the
  timeout, the page snapshot shows that the start button is gone, the game
  screen is `application … [active]`, and `status: Ready.`. `start()` got
  past step 1 but never reached step 4 ("Playing.") or the catch ("Sound
  could not start…").
- **CI trace** (`…-firefox/trace.zip` in the same artifact): across all 42
  DOM snapshots of the test, `#status` reads only "Loading…" and then
  "Ready.". It never changes after Enter, so `startAudio()` neither
  resolved nor rejected. The trace has no console messages and no page
  errors.
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
  Firefox (18.8 s each), and the owner's full local run on macOS passes
  11/11. The failure needs the runner's condition, which is no audio device.
- Limit: no Linux container was available on the development machine, so
  the hang was reproduced with Firefox's own no-device setting on macOS,
  not on Linux itself. The CI snapshots match it exactly (start button
  hidden, stage focused, status stuck at "Ready."). The fixed code's tests
  include that setting, so the next CI run checks it on Linux.

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

## Result

Fixed in `site/js/player.js` (`start()`, `bringUpSound()`,
`AUDIO_START_MS = 3000`). The notice is `#sound-retry` in the toolbar.
Tests are in `tests/audio-unavailable.spec.mjs`:

| test | main (RED) | fixed (GREEN) |
|---|---|---|
| resume() never settles (context kept suspended), Chromium | waitForFunction 15 s timeout | pass, 4.3 s |
| resume() never settles, Firefox | waitForFunction 15 s timeout | pass, 4.9 s |
| AudioContext throws, Chromium and Firefox | no `#sound-retry` notice (the game ran) | pass |
| Firefox with `media.cubeb.force_null_context` | waitForFunction 15 s timeout | pass, 5.2 s |
| "Sound unavailable" retry brings sound up, Chromium | no notice to click | pass |

The retry test is Chromium-only because the retry uses the real
AudioContext, which needs an audio device; headless Chromium has one, and
Firefox on CI does not. With sound working, `node scripts/check-realtime.mjs`
is unchanged: 49.85 Hz and 0 underruns in Chromium, Firefox and WebKit.
