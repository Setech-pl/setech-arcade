#!/usr/bin/env bash
# Builds prototype P3's core: Sfotty Pie's @sfotty-pie/a8 from source at a
# pinned commit (the npm 0.3.0 release predates real POKEY-serial SIO, which
# Void Strike 65's in-game sector reader needs), bundled with its
# dependencies into one ES module: spike/prototypes/sfotty-pie/a8.bundle.js.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
cache="$here/.cache"
commit=7eda66e5590c7cbd604eda8350ce509de7443daf # main, 2026-08-13 (last feature commit)
repo="$cache/sfotty-pie"
if [ ! -d "$repo" ]; then git clone -q https://github.com/cyco130/sfotty-pie.git "$repo"; fi
git -C "$repo" fetch -q origin
git -C "$repo" checkout -q "$commit"
(cd "$repo" && npx -y pnpm@10 install --frozen-lockfile >/dev/null 2>&1)
(cd "$repo" && npx -y pnpm@10 -r --filter "@sfotty-pie/a8..." run build >/dev/null)
npx -y esbuild@0.25 "$repo/packages/a8/dist/index.js" --bundle --format=esm --minify \
  --outfile="$here/prototypes/sfotty-pie/a8.bundle.js" --log-level=warning
ls -la "$here/prototypes/sfotty-pie/a8.bundle.js"
