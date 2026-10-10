# Known issues

Owner decision (2026-10-08): Chrome and Firefox are the required browsers. A
Safari problem that cannot be fixed with reasonable effort is listed here,
shown to Safari users on the play page (`SAFARI_NOTE` in
`site/js/player.js`), and its WebKit test is marked with
`knownWebkitIssue()` (`tests/helpers.mjs`). WebKit test failures do not
block the deploy; the workflow reports them.

## Open

**None found so far.** As of 2026-10-08, with Playwright's WebKit 27.2
(macOS), every test passes, and a 20-second real-time run paced at 49.85 Hz
with no audio underruns, the same as Chromium 156 and Firefox 157
(`node scripts/check-realtime.mjs`).

## Platform limits (not bugs, nothing to fix here)

- **iPhone Safari has no element fullscreen.** The page hides the Fullscreen
  button where `document.fullscreenEnabled` is false. On an iPhone, landscape
  orientation gives the largest picture.
- **Safari moves between buttons with Option+Tab** (plain Tab skips buttons
  unless "Press Tab to highlight each item" is on in Safari's settings). The
  keyboard test does the same in WebKit.
- **Sound starts on the click** of "Start game" (browsers block audio before
  a user gesture). Nothing plays before it.
- **No audio device, no sound.** If sound cannot start within 3 seconds of
  the click, for example with no output device (Firefox then waits forever,
  docs/fixes/firefox-keyboard-start.md), the game runs silently. A small
  "Sound unavailable — click to retry" button then appears below the
  screen. Before this fix, the game did not start at all in that case.
- **A 60 Hz display shows one PAL frame in five twice** (the game runs at its
  real 49.86 Hz). This slight judder in smooth scrolling is inherent; 100 Hz
  and variable-refresh displays are smooth.

## Disk loading (SIO patch on)

The site's emulator loads disks with atari800's **SIO patch on**, its
default: `vs_init` in `emulator/atari800/wasm-glue.c` passes no `-nopatch`,
and `site/js/atari800-core.js` gives it an empty config file. The patch
answers the OS disk routine directly instead of emulating the serial
transfer, so the game is in its menu within 12 seconds of emulated time
(the menu test's frame 600) instead of the ~30 seconds a real Atari takes
at standard SIO speed.

The pinned Void Strike 65 **v0.2.3** also boots and plays on real hardware
(a PAL 65XE/800XL from an SIO2SD or a disk drive), with its full sound.
Every earlier ATR, up to v0.2.2, stopped on a red screen on a real Atari
and loaded only in emulators with the SIO patch on.

## Not verifiable in automated tests

Headless browsers cannot judge these; they belong to the owner's smoke test:
audio by ear (Safari's real output device), judder on a real display, a real
gamepad (the Gamepad API mapping is the standard one), touch controls on a
real phone, and long play sessions.
