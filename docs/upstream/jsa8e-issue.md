# Draft issue for AnimaInCorpore/A8E (jsA8E)

For the owner to file at <https://github.com/AnimaInCorpore/A8E/issues>.
Attach `sio-read-test.atr` and `make-disk.py` from
[docs/upstream/sio-read-test/](sio-read-test/) (our own MIT test disk). Do
**not** attach Void Strike 65's ATR; link its public release instead, if at all.

---

**Title:** Only the first of several consecutive SIOV disk reads delivers data

**Version:** jsA8E at commit `ea88454` (main, 2026-09-22; v1.3.0 + later
commits), served locally from the repository, Chromium 156, macOS.

### What happens

When a program calls the OS `SIOV` routine (`$E459`) several times in a row
to read consecutive 128-byte sectors (advancing `DBUFLO/HI` by `$80` and
`DAUX1/2` by one between calls), only the **first** call puts data in
memory. Every later call returns success: `Y` is positive, `DSTATS` is `$01`,
and the program goes on. But nothing is written, neither at the new `DBUF`
nor over the previous buffer. A single read works.

It happens with AltirraOS 3.49 and with the original Atari XL OS rev. 2
(and, checked with the game below, with SIO Turbo on and off). atari800 7.2.1 and Sfotty Pie (main) read the same disk
correctly.

### How to reproduce

1. Load `sio-read-test.atr` (attached) in jsA8E as D1: and boot it with the
   default settings.
2. After about two seconds the screen colour shows the result: **green** = all
   44 sectors arrived intact; **red** = some did not; **orange** = `SIOV`
   reported an error.

jsA8E shows **red**. atari800 7.2.1 and Sfotty Pie show green.

The disk's two boot sectors read 44 sectors (4–47) into `$4000-$55FF` with
one `SIOV` call each, then check them. Every byte of data sector *n* holds the
value *n*. Results in RAM: `$0600` = sectors intact, `$0601` = 1 when
finished (`$FF` after an SIO error). `make-disk.py COUNT FIRST BUFFER` builds
variants. Automated results (jsA8E's `A8EAutomation`, 300 frames after boot):

| OS | reads | intact | DCB after the last call (`$0300-$030B`) |
|---|---|---|---|
| AltirraOS 3.49 | 1 (sector 5) | **1** | `31 01 52 01 80 40 0F 00 80 00 06 00` |
| AltirraOS 3.49 | 2 (sectors 4–5) | **1** | `31 01 52 01 00 41 0F 00 80 00 06 00` |
| AltirraOS 3.49 | 44 (sectors 4–47) | **1** | `31 01 52 01 00 56 0F 00 80 00 30 00` |
| Atari XL OS rev. 2 | 1 / 2 / 44 | **1 / 1 / 1** | same as above |
| atari800 7.2.1 (reference) | 1 / 2 / 44 | 1 / 2 / 44 | — |

So the first sector always arrives, and nothing after it does. The DCB shows
the program advancing the buffer and sector numbers as intended, and the
status byte reports success.

### Where we found it

A game (Void Strike 65, <https://github.com/Setech-pl/void-strike-65/releases/tag/v0.2.2>)
whose second-stage loader reads a 44-sector chunk this way stops on its
own error screen in jsA8E: the chunk's CRC fails, because after the 44 calls
its staging area (`$8100-$96FF`) holds only 126 non-zero bytes, no sector of
the chunk matches the disk, and none appears anywhere else in RAM.

### Expected

Each `SIOV` read transfers its sector to `DBUF`, as on hardware and in
atari800 / Altirra.

Thank you for jsA8E and its automation API: it made this easy to pin down.
