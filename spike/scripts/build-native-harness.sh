#!/usr/bin/env bash
# Builds the reference harness: atari800 7.2.1 (the version installed by
# Homebrew on the owner's Mac) as libatari800, plus spike/harness/vs65-harness.c.
# Everything third-party lands in spike/.cache (git-ignored).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
cache="$here/.cache"
version=7.2.1
mkdir -p "$cache"
tarball="$cache/atari800-$version.tar.gz"
if [ ! -f "$tarball" ]; then
  curl -sSL -o "$tarball" \
    "https://github.com/atari800/atari800/releases/download/ATARI800_${version//./_}/atari800-$version-src.tgz"
fi
src="$cache/build-native"
if [ ! -f "$src/src/libatari800.a" ]; then
  rm -rf "$src" && mkdir -p "$src"
  tar xzf "$tarball" -C "$src" --strip-components=1
  (cd "$src" && ./configure --target=libatari800 >/dev/null)
  # Apple clang turns the ULONG redefinition between libatari800.h and atari.h
  # into an error under the default -Werror.
  (cd "$src" && make -j8 CFLAGS="-g -O2 -DNETSIO -Wno-macro-redefined" >/dev/null)
fi
mkdir -p "$here/bin"
cc -O2 -Wall -Wno-macro-redefined -I"$src/src" -o "$here/bin/vs65-harness" \
  "$here/harness/vs65-harness.c" "$src/src/libatari800.a" -lz -lm -lpthread
echo "built $here/bin/vs65-harness (atari800 $version, libatari800)"
