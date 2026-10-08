#!/usr/bin/env bash
# Builds prototype P1: atari800 7.2.1 (libatari800 target) compiled to
# WebAssembly with Emscripten, plus emulator/atari800/wasm-glue.c.
# Output: spike/prototypes/atari800-wasm/atari800.{js,wasm} (GPL-2.0-or-later;
# the corresponding source is the atari800 7.2.1 release tarball + this repo).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
cache="$here/.cache"
version=7.2.1
if [ ! -d "$cache/emsdk" ]; then
  git clone -q --depth 1 https://github.com/emscripten-core/emsdk.git "$cache/emsdk"
  (cd "$cache/emsdk" && ./emsdk install latest >/dev/null && ./emsdk activate latest >/dev/null)
fi
# shellcheck disable=SC1091
source "$cache/emsdk/emsdk_env.sh" >/dev/null 2>&1
tarball="$cache/atari800-$version.tar.gz"
[ -f "$tarball" ] || curl -sSL -o "$tarball" \
  "https://github.com/atari800/atari800/releases/download/ATARI800_${version//./_}/atari800-$version-src.tgz"
src="$cache/build-wasm"
if [ ! -f "$src/src/libatari800.a" ]; then
  rm -rf "$src" && mkdir -p "$src"
  tar xzf "$tarball" -C "$src" --strip-components=1
  (cd "$src" && AR=emar RANLIB=emranlib emconfigure ./configure --target=libatari800 --host=wasm32-unknown-emscripten \
      --disable-netsio --disable-monitorbreak --disable-videorecording --disable-audiorecording \
      --disable-pbi_xld --disable-voicebox --disable-riodevice --disable-rnetwork --disable-rserial >"$cache/wasm-configure.log" 2>&1)
  # Only the library: the bundled test programs do not link under wasm-ld.
  (cd "$src" && emmake make -j8 -C src libatari800.a AR=emar RANLIB=emranlib CFLAGS="-O3 -Wno-macro-redefined" >"$cache/wasm-make.log" 2>&1)
fi
out="$here/prototypes/atari800-wasm"
mkdir -p "$out"
emcc -O3 -I"$src/src" "$here/../emulator/atari800/wasm-glue.c" "$src/src/libatari800.a" \
  -o "$out/atari800.js" \
  -s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORT_NAME=createAtari800 -s ENVIRONMENT=web \
  -s ALLOW_MEMORY_GROWTH=1 -s FORCE_FILESYSTEM=1 \
  -s EXPORTED_RUNTIME_METHODS='["FS","HEAPU8","HEAP32"]' \
  -s EXPORTED_FUNCTIONS='["_malloc","_free"]'
ls -la "$out"/atari800.*
