// The five fixed points the spike brief names, side by side:
//   atari800 7.2.1 native | P1 atari800 WASM (Chromium) | P3 Sfotty Pie (Chromium,
//   atari800 palette) | P3 Sfotty Pie (its own PAL palette)
// -> spike/results/side-by-side/<point>.png  (each panel 336x240)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crop, hstack, readPng, writePng } from "./lib/png-tools.mjs";

const spike = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = (...p) => path.join(spike, "results", ...p);
const points = {
  "1-menu": "01-menu",
  "2-early-gameplay": "05-gameplay-early",
  "3-capital-ship": "06-capital-corridor",
  "4-boss-band-laser": "09b-boss-laser",
  "5-summary": "11-summary-press-fire",
};
fs.mkdirSync(r("side-by-side"), { recursive: true });
for (const [name, shot] of Object.entries(points)) {
  const native = crop(readPng(r("reference", "altirra-basic-off", `${shot}.png`)), 24, 0, 336, 240);
  // prototype-measure.mjs writes [native | browser | diff]: take the middle panel.
  const p1 = crop(readPng(r("prototypes", "atari800-wasm", "chromium", `${shot}.png`)), 340, 0, 336, 240);
  const p3 = crop(readPng(r("prototypes", "sfotty-pie", "chromium", `${shot}.png`)), 340, 0, 336, 240);
  const p3own = readPng(r("p3-sfotty-pie", "node-own-palette", `${shot}.png`));
  writePng(r("side-by-side", `${name}.png`), hstack([native, p1, p3, p3own]));
}
console.log(fs.readdirSync(r("side-by-side")));
