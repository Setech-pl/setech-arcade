# Third-party notices

The Setech Arcade site is MIT-licensed (LICENSE). It ships the following
third-party works, each under its own licence.

## atari800 7.2.1 — GPL-2.0-or-later

The Atari 8-bit emulator by the Atari800 Development Team,
<https://atari800.github.io/>, <https://github.com/atari800/atari800>.

The site runs it compiled to WebAssembly (`emulator/atari800.js`,
`emulator/atari800.wasm`). Its corresponding source is published with the
site next to the emulator:

- `emulator/atari800-7.2.1-src.tgz` — the exact release tarball the build
  used (SHA-256 `b05b7b0932a19754eef42839aa0f04aa8a5ec1e55f51054ef3f802d83c7362f7`,
  from <https://github.com/atari800/atari800/releases/tag/ATARI800_7_2_1>);
- `emulator/wasm-glue.c` and `emulator/build.sh` — this repository's glue and
  build script (also in `emulator/atari800/` here), built with Emscripten 6.0.11.

Licence text: `emulator/COPYING.txt` on the site, `emulator/atari800/COPYING`
here. atari800 is free software; you can redistribute it and/or modify it
under the terms of the GNU General Public License as published by the Free
Software Foundation; either version 2 of the License, or (at your option) any
later version.

## Emscripten runtime — MIT / University of Illinois NCSA

Parts of the generated `emulator/atari800.js` come from Emscripten,
<https://github.com/emscripten-core/emscripten>. Licence text:
`emulator/EMSCRIPTEN-LICENSE.txt` on the site, `emulator/atari800/EMSCRIPTEN-LICENSE` here.

## AltirraOS 3.49 and Altirra BASIC 1.59 — FSF all-permissive

The replacement Atari OS and BASIC ROMs by Avery Lee, part of Altirra
(<https://www.virtualdub.org/altirra.html>), compiled into atari800 and so
into `emulator/atari800.wasm`. Notice, as in atari800's `src/roms/` files:

    Altirra - Atari 800/800XL emulator
    Kernel ROM replacement
    Copyright (C) 2008-2018 Avery Lee
    (Altirra BASIC: Copyright (C) 2008-2022 Avery Lee)

    Copying and distribution of this file, with or without modification,
    are permitted in any medium without royalty provided the copyright
    notice and this notice are preserved.  This file is offered as-is,
    without any warranty.

(atari800's header for the OS still reads "version 3.11"; the ROM's own
version string reads 3.49.)

## Games

Each game keeps its own licence; `games/<id>.json` records it and the game's
page shows it.

### Void Strike 65

(C) 2026 Setech Game Studio, Marcin Krzetowski. Source and releases:
<https://github.com/Setech-pl/void-strike-65>.

- The disk image (`disks/void-strike-65-*.atr`, release v0.3.0, unmodified)
  as a whole, and its screenshots (`games/media/void-strike-65/`): Creative
  Commons Attribution-NonCommercial-ShareAlike 4.0 International,
  <https://creativecommons.org/licenses/by-nc-sa/4.0/>.
- The game's code: MIT (<https://github.com/Setech-pl/void-strike-65/blob/main/LICENSE>).
- "Void Strike 65", the Setech Game Studio name and the Setech Game Studio
  logo are not licensed under either: all rights reserved.

## Development tools (not shipped)

Playwright (Apache-2.0), pngjs (MIT) and pixelmatch (ISC) are used by the
tests only.

Atari is a trademark of its owner. This site is not affiliated with or
endorsed by Atari.

## NEON SHIFT 65 v1.0.1

© 2026 Marcin Krzetowski / Setech Game Studio. The game is loaded from the
normal ATR at https://github.com/Setech-pl/neon-shift-65/releases/tag/v1.0.1,
SHA-256 `a22992f1c4350d0e5c72150c6902aefdd2f485c3be5979f9da2a7bc2d32f3407`.
Code: MIT License. Creative content, screenshots and complete disk:
Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
(CC BY-NC-SA 4.0). Service Current retains CC0; linked cc65 and adapted Void
Strike components retain their notices. Names and marks reserved.
Full scope and original component terms:
https://github.com/Setech-pl/neon-shift-65/blob/v1.0.1/LICENSE-ASSETS and
https://github.com/Setech-pl/neon-shift-65/blob/v1.0.1/THIRD_PARTY_NOTICES.md.
