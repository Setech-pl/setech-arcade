// Extracts AltirraOS (XL/XE, 16 KB) and Altirra BASIC (8 KB) as plain ROM
// images from the C arrays in the atari800 7.2.1 source (src/roms/), for the
// emulators that load ROM files (jsA8E, Sfotty Pie's custom-ROM path).
// Licence: FSF all-permissive (the notice is copied next to the images).
//
//   node spike/scripts/extract-altirra-roms.mjs  ->  spike/vendor/roms/
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const spike = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(spike, ".cache", "build-native", "src", "roms");
const out = path.join(spike, "vendor", "roms");
fs.mkdirSync(out, { recursive: true });

function extract(file, size) {
  const text = fs.readFileSync(path.join(src, file), "utf8");
  const body = text.slice(text.indexOf("{") + 1, text.indexOf("};"));
  const bytes = Buffer.from([...body.matchAll(/0x([0-9a-fA-F]{2})/g)].map((m) => parseInt(m[1], 16)));
  if (bytes.length !== size) throw new Error(`${file}: ${bytes.length} bytes, expected ${size}`);
  return { bytes, notice: text.slice(0, text.indexOf("*/") + 2) };
}

const roms = [
  ["altirraos_xl.c", 0x4000, "ATARIXL.ROM", /3\.49/],
  ["altirra_basic.c", 0x2000, "ATARIBAS.ROM", /BASIC 1\.59/],
];
const manifest = {};
let notices = "";
for (const [file, size, name, version] of roms) {
  const { bytes, notice } = extract(file, size);
  if (!version.test(bytes.toString("latin1"))) throw new Error(`${file}: unexpected version`);
  fs.writeFileSync(path.join(out, name), bytes);
  manifest[name] = { from: `atari800 7.2.1 src/roms/${file}`, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
  notices += `${name}\n${notice}\n\n`;
}
fs.writeFileSync(path.join(out, "NOTICE.txt"),
  "AltirraOS 3.49 and Altirra BASIC 1.59 (C) Avery Lee, as compiled into atari800 7.2.1.\n" +
  "(atari800's file header still reads 'version 3.11'; the ROM's own version string reads 3.49.)\n\n" + notices);
fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(manifest);
