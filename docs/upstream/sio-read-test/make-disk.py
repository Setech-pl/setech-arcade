#!/usr/bin/env python3
"""Builds sio-read-test.atr: a minimal public test disk (MIT) for the jsA8E
SIO report. Its boot sector reads COUNT consecutive sectors through the OS
SIOV call into $4000, one 128-byte sector per call, then checks them. Every
byte of data sector n holds the value n.

Result: background green ($C8) = all sectors arrived intact; red ($34) =
some did not; orange ($28) = SIOV returned an error. RAM $0600 = sectors
intact, $0601 = 1 when finished ($FF on an SIO error).

    python3 make-disk.py [COUNT] [FIRST_SECTOR] [BUFFER_HEX]   (default 44 4 4000)
"""
import struct, sys

COUNT = int(sys.argv[1]) if len(sys.argv) > 1 else 44
FIRST = int(sys.argv[2]) if len(sys.argv) > 2 else 4
BUF = int(sys.argv[3], 16) if len(sys.argv) > 3 else 0x4000
ORG = 0x0700

OPS = {  # mnemonic, mode -> opcode
    ("LDA", "imm"): 0xA9, ("LDA", "abs"): 0xAD, ("LDA", "absx"): 0xBD, ("LDA", "zp"): 0xA5, ("LDA", "indy"): 0xB1,
    ("STA", "abs"): 0x8D, ("STA", "absx"): 0x9D, ("STA", "zp"): 0x85,
    ("LDX", "imm"): 0xA2, ("LDY", "imm"): 0xA0, ("INX", ""): 0xE8, ("INY", ""): 0xC8,
    ("CPX", "imm"): 0xE0, ("CPY", "imm"): 0xC0, ("CMP", "imm"): 0xC9, ("CMP", "zp"): 0xC5,
    ("BNE", "rel"): 0xD0, ("BEQ", "rel"): 0xF0, ("BMI", "rel"): 0x30, ("BCC", "rel"): 0x90,
    ("JSR", "abs"): 0x20, ("JMP", "abs"): 0x4C, ("TYA", ""): 0x98, ("CLC", ""): 0x18, ("RTS", ""): 0x60,
    ("ADC", "imm"): 0x69, ("ADC", "zp"): 0x65, ("INC", "abs"): 0xEE, ("INC", "zp"): 0xE6, ("DEC", "zp"): 0xC6,
}
SIZE = {"": 1, "imm": 2, "zp": 2, "indy": 2, "rel": 2, "abs": 3, "absx": 3}
SIOV, DCB, COLOR2, COLOR4 = 0xE459, 0x0300, 0x02C6, 0x02C8
CNT, PTR, EXP, GOOD = 0xCB, 0xCC, 0xCE, 0xCF

prog = [
    ("start", None, None),                     # the OS continues the boot at load address + 6
    ("LDX", "imm", 0),
    ("dcb", None, None),
    ("LDA", "absx", "dcbtab"), ("STA", "absx", DCB), ("INX", "", None),
    ("CPX", "imm", 12), ("BNE", "rel", "dcb"),
    ("LDA", "imm", COUNT), ("STA", "zp", CNT),
    ("read", None, None),
    ("JSR", "abs", SIOV), ("TYA", "", None), ("BMI", "rel", "sioerr"),
    ("CLC", "", None), ("LDA", "abs", DCB + 4), ("ADC", "imm", 0x80), ("STA", "abs", DCB + 4),
    ("BCC", "rel", "nohi"), ("INC", "abs", DCB + 5),
    ("nohi", None, None),
    ("INC", "abs", DCB + 10), ("BNE", "rel", "noaux"), ("INC", "abs", DCB + 11),
    ("noaux", None, None),
    ("DEC", "zp", CNT), ("BNE", "rel", "read"),
    # check: every byte of the sector read for n must be n
    ("LDA", "imm", BUF & 0xFF), ("STA", "zp", PTR), ("LDA", "imm", BUF >> 8), ("STA", "zp", PTR + 1),
    ("LDA", "imm", FIRST & 0xFF), ("STA", "zp", EXP), ("LDA", "imm", 0), ("STA", "zp", GOOD),
    ("sector", None, None),
    ("LDY", "imm", 0),
    ("byte", None, None),
    ("LDA", "indy", PTR), ("CMP", "zp", EXP), ("BNE", "rel", "next"),
    ("INY", "", None), ("CPY", "imm", 0x80), ("BNE", "rel", "byte"),
    ("INC", "zp", GOOD),
    ("next", None, None),
    ("CLC", "", None), ("LDA", "zp", PTR), ("ADC", "imm", 0x80), ("STA", "zp", PTR),
    ("BCC", "rel", "noptr"), ("INC", "zp", PTR + 1),
    ("noptr", None, None),
    ("INC", "zp", EXP), ("LDA", "zp", EXP), ("CMP", "imm", (FIRST + COUNT) & 0xFF), ("BNE", "rel", "sector"),
    ("LDA", "zp", GOOD), ("STA", "abs", 0x0600), ("LDA", "imm", 1), ("STA", "abs", 0x0601),
    ("LDA", "zp", GOOD), ("CMP", "imm", COUNT), ("BEQ", "rel", "ok"),
    ("LDA", "imm", 0x34), ("JMP", "abs", "show"),
    ("ok", None, None),
    ("LDA", "imm", 0xC8),
    ("show", None, None),
    ("STA", "abs", COLOR2), ("STA", "abs", COLOR4),
    ("hang", None, None),
    ("JMP", "abs", "hang"),
    ("sioerr", None, None),
    ("LDA", "imm", 0xFF), ("STA", "abs", 0x0601), ("LDA", "imm", 0x28), ("JMP", "abs", "show"),
    ("init", None, None),                      # DOSINI target: just RTS
    ("RTS", "", None),
    ("dcbtab", None, None),
]
dcbtab = bytes([0x31, 0x01, 0x52, 0x40, BUF & 0xFF, BUF >> 8, 0x0F, 0x00, 0x80, 0x00, FIRST & 0xFF, FIRST >> 8])

def assemble():
    labels, pc = {}, ORG + 6
    for op, mode, _ in prog:
        if mode is None: labels[op] = pc
        else: pc += SIZE[mode]
    out, pc = bytearray(), ORG + 6
    for op, mode, arg in prog:
        if mode is None: continue
        val = labels[arg] if isinstance(arg, str) else arg
        out.append(OPS[(op, mode)])
        if mode == "rel":
            off = val - (pc + 2)
            assert -128 <= off <= 127, (op, arg, off)
            out.append(off & 0xFF)
        elif SIZE[mode] == 2: out.append(val & 0xFF)
        elif SIZE[mode] == 3: out += struct.pack("<H", val)
        pc += SIZE[mode]
    return labels, bytes(out) + dcbtab

labels, code = assemble()
# the boot header: flags, boot sector count, load address, DOSINI
boot = bytes([0x00, 0x02]) + struct.pack("<HH", ORG, labels["init"]) + code
assert len(boot) <= 256, len(boot)
boot = boot.ljust(256, b"\0")
sectors = [boot[:128], boot[128:], bytes(128)]
sectors += [bytes([n & 0xFF]) * 128 for n in range(4, 721)]
data = b"".join(sectors)
header = struct.pack("<HHHH", 0x0296, (len(data) // 16) & 0xFFFF, 128, len(data) // 16 >> 16) + bytes(8)
open("sio-read-test.atr", "wb").write(header + data)
print(f"sio-read-test.atr: boot code {len(boot)} bytes, start ${labels['start']:04X}, reads {COUNT} sectors from {FIRST} into ${BUF:04X}")
