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
- **A 60 Hz display shows one PAL frame in five twice** (the game runs at its
  real 49.86 Hz). This slight judder in smooth scrolling is inherent; 100 Hz
  and variable-refresh displays are smooth.

## Not verifiable in automated tests

Headless browsers cannot judge these; they belong to the owner's smoke test:
audio by ear (Safari's real output device), judder on a real display, a real
gamepad (the Gamepad API mapping is the standard one), touch controls on a
real phone, and long play sessions.
