# Setech Arcade

Setech Game Studio's Atari 8-bit games, playable in the browser:
**<https://setech-pl.github.io/setech-arcade/>**

Each game runs from its released disk image (ATR) in
[atari800](https://atari800.github.io/) 7.2.1, compiled to WebAssembly for
this site, on an emulated PAL Atari 800XL with 64 KB and the open AltirraOS.
Nothing is installed and nothing leaves the browser; a game that saves (Void
Strike 65's best scores) keeps its written disk in the browser's IndexedDB.

Games today: **Void Strike 65** (pinned to release v0.2.3).

## How it works

- `games/<id>.json` describes a game: title, texts, screenshots, controls,
  licence, and the disk, **pinned** to one GitHub release by repo, tag, asset
  name and SHA-256. A game changes on the site only when its file changes.
- `npm run build` compiles atari800 7.2.1 to WebAssembly from its pinned,
  hash-checked release tarball (`emulator/atari800/build.sh`, pinned
  Emscripten), downloads every pinned disk and checks its hash (a mismatch
  fails the build), and writes the static site to `dist/`: the game list,
  one play page per game, a credits page, the emulator **with its exact
  source tarball** (GPL), and the notices.
- The play page (`site/js/player.js`) runs the emulator at the PAL rate
  (49.86 Hz) on any display, with click-to-start sound, keyboard, gamepad
  and touch controls, integer scaling, fullscreen and "Reset best score".
- GitHub Actions (`.github/workflows/deploy.yml`) builds, tests in Chromium,
  Firefox and WebKit, and deploys `main` to GitHub Pages.

Why atari800: [docs/spike-emulator.md](docs/spike-emulator.md) records the
evaluation (atari800 compiled to WebAssembly produced frames identical to
native atari800 for a whole playthrough; jsA8E failed to load the game;
Sfotty Pie is plan B).

## Build and test locally

Requirements: Node 24, npm, bash, curl, git and Python 3 (for Emscripten;
the first build installs Emscripten 6.0.11 into `.cache/`, about 1 GB, and
takes a few minutes; later builds reuse it).

```bash
npm ci
npm run build          # -> dist/
npm run serve          # http://localhost:8080/setech-arcade/
npx playwright install chromium firefox webkit   # once
npm test               # build checks + Chromium, Firefox, WebKit
```

The tests run against `dist/`, served under `/setech-arcade/` as on Pages:

- every game boots to its menu, and that frame matches
  `tests/reference/<id>-menu.png` exactly (the emulator is deterministic);
- the best score survives a reload, and "Reset best score" clears it;
- the play page works with the keyboard only;
- a wrong disk hash, or a disk pinned to "latest", fails the build;
- `npm run pin` refuses "latest", a missing release or asset and a wrong hash.

`node scripts/check-realtime.mjs` measures real-time pacing and audio in the
three browsers; `node scripts/screenshots.mjs` refreshes `docs/screenshots/`.

## Adding a game

Write `games/<id>.json` (pin the release and its SHA-256), add screenshots
under `games/media/<id>/`, build, create the menu reference image, test.
Step by step: [docs/adding-a-game.md](docs/adding-a-game.md).

## Maintenance

### Pinning a new game release

One command moves a game to another release of its repo:

```bash
npm run pin -- <game-id> <tag>                       # e.g. void-strike-65 v0.2.3
npm run pin -- <game-id> <tag> --expect-sha 75cf839c # also check the hash's start
npm run pin -- <game-id> <tag> --asset other.atr     # another asset of that release
```

It finds the release in the repo named in `games/<id>.json` (it refuses
"latest", a release that does not exist and a release without the asset),
downloads the asset and checks its SHA-256 against GitHub's digest, writes
`disk.tag`, `disk.asset`, `disk.sha256` (and the version in `status`) into
`games/<id>.json`, rebuilds, rewrites `tests/reference/<id>-menu.png`
through the menu test itself, and puts the old and new images and their
difference in `build/pin/<id>/` (`previous.png`, `current.png`,
`diff.png`) for review. Then it runs the tests as the workflow does. It
does not commit: look at the difference, then commit the data file and the
reference. `GITHUB_TOKEN` or `GH_TOKEN`, if set, raises the GitHub API's
rate limit.

### The CI runner

Both jobs of the workflow run on **`ubuntu-24.04`**, a fixed runner image,
not `ubuntu-latest`: GitHub moves `ubuntu-latest` to a new Ubuntu on its own
schedule (to Ubuntu 26 from 2026-10-19,
[actions/runner-images#14748](https://github.com/actions/runner-images/issues/14748)),
and a silent OS change could break the emulator build, the Playwright
browsers or the tests, and with them the next deploy.

To move to a newer runner later: change the `runs-on:` label of every job
in `.github/workflows/deploy.yml` on a branch, open a pull request (pull
requests build and test but do not deploy), watch the run, and merge only
when it is green. GitHub announces the end of support for a runner image
in the run's annotations.

## Repository layout

| Path | What |
|---|---|
| `games/` | one JSON per game, `game.schema.json`, screenshots in `media/` |
| `site/` | the static site: stylesheet, the player, the emulator adapter, the audio worklet |
| `scripts/` | `build.mjs`, `serve.mjs`, `pin.mjs`, page templates and game loading in `lib/` |
| `emulator/atari800/` | the WebAssembly build script, the C glue, atari800's `COPYING` (GPL) |
| `tests/` | Playwright tests, reference images, per-game test knowledge in `games/` |
| `docs/` | the emulator evaluation, adding a game, known issues, the upstream jsA8E report, screenshots |
| `spike/` | the Phase A evaluation: harness, prototypes, results (a record; not part of the site) |

## Licences

- This repository's own code and docs: [MIT](LICENSE).
- The emulator: atari800 is GPL-2.0-or-later. The site publishes the exact
  atari800 7.2.1 source tarball it was built from, plus our glue and build
  script, next to the emulator (`emulator/` on the site).
- AltirraOS and Altirra BASIC (inside atari800): FSF all-permissive, notice kept.
- Each game keeps its own licence. Void Strike 65: code MIT, the disk image
  as a whole and its screenshots CC BY-NC-SA 4.0, names and logo reserved;
  (C) 2026 Setech Game Studio, <https://github.com/Setech-pl/void-strike-65>.

Details: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Atari is a
trademark of its owner; this site is not affiliated with Atari.
