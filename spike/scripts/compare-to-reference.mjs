// Side-by-side [atari800 reference | candidate | exact diff] for every
// checkpoint a candidate run produced (336x240 views).
//
//   node spike/scripts/compare-to-reference.mjs <candidate dir> <output dir>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crop, diff, hstack, readPng, resizeNearest, writePng } from "./lib/png-tools.mjs";

const spike = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [candidateDir, outDir] = process.argv.slice(2).map((p) => path.resolve(p));
const referenceDir = path.join(spike, "results", "reference", "altirra-basic-off");
const report = {};
for (const name of fs.readdirSync(candidateDir).filter((f) => /^\d\d[a-z]?-.*\.png$/.test(f)).sort()) {
  const ref = path.join(referenceDir, name);
  if (!fs.existsSync(ref)) continue;
  const left = crop(readPng(ref), 24, 0, 336, 240);
  let right = readPng(path.join(candidateDir, name));
  if (right.width !== 336 || right.height !== 240) right = resizeNearest(right, 336, 240);
  const d = diff(left, right);
  report[name.replace(/\.png$/, "")] = d.count;
  writePng(path.join(outDir, name), hstack([left, right, d.image]));
}
fs.writeFileSync(path.join(outDir, "diff.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
