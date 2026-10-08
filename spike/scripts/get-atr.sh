#!/usr/bin/env bash
# Downloads the Void Strike 65 v0.2.2 release ATR into spike/assets and
# verifies it. Every run works on a COPY: the game writes its best score
# (sector 599) to its own disk.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
want=19b82947a3b280e05040d8200d96de81e2ae79b504e6d7f2c010579a4604c4d4
mkdir -p "$here/assets"
[ -f "$here/assets/void-strike-65.atr" ] || gh release download v0.2.2 --repo Setech-pl/void-strike-65 --pattern '*.atr' --dir "$here/assets/"
got=$(shasum -a 256 "$here/assets/void-strike-65.atr" | cut -d' ' -f1)
[ "$got" = "$want" ] || { echo "SHA-256 mismatch: $got" >&2; exit 1; }
echo "void-strike-65.atr v0.2.2 OK ($want)"
