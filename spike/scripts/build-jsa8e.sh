#!/usr/bin/env bash
# Fetches prototype P2: jsA8E (GPL-2.0, AnimaInCorpore/A8E) at a pinned
# commit into spike/.cache/a8e and gives it the AltirraOS / Altirra BASIC
# images (it auto-loads ../ATARIXL.ROM and ../ATARIBAS.ROM).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
commit=ea884548ef53e52674533656139125b87ebb22bf # main, 2026-09-22 (after v1.3.0)
repo="$here/.cache/a8e"
if [ ! -d "$repo" ]; then git clone -q https://github.com/AnimaInCorpore/A8E.git "$repo"; fi
git -C "$repo" fetch -q origin
git -C "$repo" checkout -q "$commit"
[ -f "$here/vendor/roms/ATARIXL.ROM" ] || node "$here/scripts/extract-altirra-roms.mjs" >/dev/null
cp "$here/vendor/roms/ATARIXL.ROM" "$here/vendor/roms/ATARIBAS.ROM" "$repo/"
echo "jsA8E at $commit: http://localhost:8765/spike/.cache/a8e/jsA8E/?a8e_worker=0"
