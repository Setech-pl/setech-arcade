#!/usr/bin/env bash
# Builds atari800 7.2.1 (its libatari800 target) to WebAssembly with a pinned
# Emscripten, from the release tarball checked against a pinned SHA-256.
#
#   emulator/atari800/build.sh [output dir]      (default: build/emulator)
#
# Output: atari800.js, atari800.wasm and the exact source used:
# atari800-7.2.1-src.tgz (GPL-2.0-or-later; published next to the emulator).
# Everything downloaded or installed goes to .cache/ (git-ignored); a second
# run with nothing changed reuses the previous build.
set -euo pipefail
ATARI800_VERSION=7.2.1
ATARI800_SHA256=b05b7b0932a19754eef42839aa0f04aa8a5ec1e55f51054ef3f802d83c7362f7
ATARI800_URL="https://github.com/atari800/atari800/releases/download/ATARI800_7_2_1/atari800-7.2.1-src.tgz"
EMSDK_VERSION=6.0.11

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
cache="$root/.cache"
out="${1:-$root/build/emulator}"
mkdir -p "$cache" "$out"

sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

tarball="$cache/atari800-$ATARI800_VERSION-src.tgz"
if [ ! -f "$tarball" ] || [ "$(sha256 "$tarball")" != "$ATARI800_SHA256" ]; then
  echo "atari800: downloading $ATARI800_VERSION"
  curl -fsSL -o "$tarball.part" "$ATARI800_URL"
  mv "$tarball.part" "$tarball"
fi
got="$(sha256 "$tarball")"
if [ "$got" != "$ATARI800_SHA256" ]; then
  echo "atari800: SHA-256 mismatch for $tarball: $got (want $ATARI800_SHA256)" >&2
  exit 1
fi

stamp="$ATARI800_SHA256 $EMSDK_VERSION $(sha256 "$here/wasm-glue.c") $(sha256 "$here/build.sh")"
if [ -f "$out/atari800.wasm" ] && [ -f "$out/.stamp" ] && [ "$(cat "$out/.stamp")" = "$stamp" ]; then
  echo "atari800: up to date ($out)"
  cp "$tarball" "$out/atari800-$ATARI800_VERSION-src.tgz"
  exit 0
fi

emsdk="$cache/emsdk"
if [ ! -d "$emsdk" ]; then git clone -q https://github.com/emscripten-core/emsdk.git "$emsdk"; fi
if [ ! -f "$emsdk/.installed-$EMSDK_VERSION" ]; then
  echo "atari800: installing Emscripten $EMSDK_VERSION"
  (cd "$emsdk" && git pull -q && ./emsdk install "$EMSDK_VERSION" >"$cache/emsdk-install.log" 2>&1 && ./emsdk activate "$EMSDK_VERSION" >>"$cache/emsdk-install.log" 2>&1) \
    || { tail -20 "$cache/emsdk-install.log" >&2; exit 1; }
  touch "$emsdk/.installed-$EMSDK_VERSION"
fi
# shellcheck disable=SC1091
source "$emsdk/emsdk_env.sh" >/dev/null 2>&1
emcc --version | head -1 | grep -q " $EMSDK_VERSION " || { echo "atari800: emcc is not $EMSDK_VERSION" >&2; exit 1; }

src="$cache/atari800-$ATARI800_VERSION-wasm"
rm -rf "$src" && mkdir -p "$src"
tar xzf "$tarball" -C "$src" --strip-components=1
echo "atari800: configuring and compiling libatari800"
# The R: device needs a host serial port and sockets; NetSIO needs sockets.
# emar/emranlib: the host's ar would write an archive wasm-ld cannot read.
(cd "$src" && AR=emar RANLIB=emranlib emconfigure ./configure --target=libatari800 \
    --host=wasm32-unknown-emscripten --disable-netsio --disable-monitorbreak \
    --disable-videorecording --disable-audiorecording --disable-pbi_xld --disable-voicebox \
    --disable-riodevice --disable-rnetwork --disable-rserial >"$cache/atari800-configure.log" 2>&1)
# Only the library: the bundled test programs do not link under wasm-ld.
(cd "$src" && emmake make -j"$(getconf _NPROCESSORS_ONLN)" -C src libatari800.a \
    AR=emar RANLIB=emranlib CFLAGS="-O3 -Wno-macro-redefined" >"$cache/atari800-make.log" 2>&1)
emcc -O3 -I"$src/src" "$here/wasm-glue.c" "$src/src/libatari800.a" \
  -o "$out/atari800.js" \
  -s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORT_NAME=createAtari800 -s ENVIRONMENT=web \
  -s ALLOW_MEMORY_GROWTH=1 -s FORCE_FILESYSTEM=1 \
  -s EXPORTED_RUNTIME_METHODS='["FS","HEAPU8","HEAP32"]' \
  -s EXPORTED_FUNCTIONS='["_malloc","_free"]'
cp "$tarball" "$out/atari800-$ATARI800_VERSION-src.tgz"
echo "$stamp" > "$out/.stamp"
echo "atari800: built $out/atari800.wasm ($(wc -c < "$out/atari800.wasm") bytes)"
