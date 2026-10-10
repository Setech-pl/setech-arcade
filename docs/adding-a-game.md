# Adding a game

A game is one data file, a few screenshots and one reference image. The
site, the play page, the credits and the tests follow from them.

The games must run on what the site emulates: a **PAL Atari 800XL with
64 KB**, AltirraOS, booting **from D1:** (an `.atr` disk image), BASIC on or
off as the data file says.

## 1. Release the disk

Publish the ATR as an asset of a **GitHub release** in the game's own repo.
The site never takes "latest" or a branch file: it takes exactly the release
and the file you pin, and checks its SHA-256.

```bash
gh release view <tag> --repo Setech-pl/<game> --json assets \
  --jq '.assets[] | [.name, .digest] | @tsv'      # digest: sha256:...
# or download and hash it yourself:
gh release download <tag> --repo Setech-pl/<game> --pattern '*.atr' --dir /tmp/g && shasum -a 256 /tmp/g/*.atr
```

## 2. Write `games/<id>.json`

Copy `games/void-strike-65.json` and change everything. The schema is
`games/game.schema.json`; the build checks the rules and stops on the first
problem. The fields:

| Field | Meaning |
|---|---|
| `id` | URL slug (`a-z`, `0-9`, `-`); the file must be `games/<id>.json`; the page is `play/<id>/` |
| `title`, `tagline`, `description` | the card shows the tagline (one line, ≤ 140 characters); the play page shows the description |
| `studio`, `year`, `status` | shown on the card and the page (`status`, e.g. "Pre-release v0.3.0") |
| `screenshots` | `[{ src, alt }]` under `games/`; the first is the card picture |
| `disk` | `{ repo, tag, asset, sha256 }`: the pinned release asset |
| `machine` | `{ model: "800xl", video: "pal", basic: false }` |
| `saves` | `"disk"` if the game writes to its own disk (the site then keeps that disk per hash and shows "Reset best score"), else `"none"` |
| `controls` | `[{ action, atari }]`: what each Atari control does in this game; `atari` is one of `Joystick`, `Fire`, `Space`, `Return`, `START`, `SELECT`, `OPTION`. The page fills in the keyboard, gamepad and touch columns. |
| `links` | `{ repo, releases, howToPlay? }` |
| `licence` | `{ summary, url, credit }`: shown on the page and the credits page; also add the game to `THIRD_PARTY_NOTICES.md` |
| `tests.menuFrame` | frames after power-on at which the game's menu is on screen (§4) |

## 3. Screenshots

PNG, the 336×240 picture scaled ×2 with nearest neighbour (672×480), in
`games/media/<id>/`. Any capture of the game works. For exactly what the site
shows: open `play/<id>/?manual=1&fresh=1`, press Start, and in the browser
console `(await window.arcade.runScript("frames 600\nshot s")).shots.s` gives
the frame as a 336×240 PNG data URL (double it with nearest-neighbour
scaling, e.g. `ffmpeg -i s.png -vf scale=672:480:flags=neighbor out.png`).

## 4. Build and make the reference image

```bash
npm run build
npm run serve            # check the card and the play page by hand
```

Pick `tests.menuFrame`: a frame number when the menu is fully drawn (Void
Strike 65's menu appears at frame 499; it uses 600). The emulator is
deterministic, so that frame is identical in every browser and on every run.
Write the reference image once, look at it, and commit it:

```bash
UPDATE_REFERENCE=1 npx playwright test menu --project=chromium
open tests/reference/<id>-menu.png
```

## 5. Optional: deeper tests

`tests/games/<id>.mjs` can teach the tests about the game (see
`tests/games/void-strike-65.mjs`):

- `inMenu`, `inGameplay` (`{ addr, value }`): RAM checks the keyboard test
  uses to confirm that FIRE starts the game;
- `toSummaryScript` and `SAVE_SECTOR`: a script (the harness language from
  `site/js/player.js`, `runScript`) that plays until the game has saved, so
  the save test can check the reload and "Reset best score".

Without that file the tests still check the boot, the menu frame and the
keyboard path; the save test is skipped for the game.

## 6. Test and commit

```bash
npm test
git add games/<id>.json games/media/<id> tests/reference/<id>-menu.png THIRD_PARTY_NOTICES.md
```

When the change reaches `main`, the workflow downloads the pinned disk,
checks it, tests and deploys.

## Updating a game

```bash
npm run pin -- <id> <tag>          # e.g. npm run pin -- void-strike-65 v0.2.3
```

`scripts/pin.mjs` downloads the release asset, checks it, writes
`disk.tag`, `disk.asset`, `disk.sha256` (and the version in `status`),
rebuilds, rewrites the menu reference through the menu test, shows the old
and new reference and their difference in `test-results/pin/<id>/`, and
runs the tests. Look at the difference before committing
`games/<id>.json` and `tests/reference/<id>-menu.png` (README,
"Maintenance"). If the game's RAM layout moved, `tests/games/<id>.mjs`
needs the new addresses.

A new disk has a new hash, so players start with a fresh disk: the
best scores saved for the old version are not carried over.
