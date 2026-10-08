// AltirraOS against the original XL OS (rev. 2), same atari800 7.2.1 core,
// same ATR copy, same scripted input: every checkpoint of the reference run
// as [AltirraOS | original OS | exact pixel diff].
//
//   node spike/scripts/compare-altirraos.mjs   (after reference-run.mjs)
//
// Output: spike/results/altirraos/basic-<on|off>/<checkpoint>.png and
//         spike/results/altirraos/diff.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diff, hstack, readPng, writePng } from "./lib/png-tools.mjs";

const spike = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reference = path.join(spike, "results", "reference");
const out = path.join(spike, "results", "altirraos");
const report = {};
for (const basic of ["off", "on"]) {
  const a = path.join(reference, `altirra-basic-${basic}`);
  const b = path.join(reference, `xl-basic-${basic}`);
  const names = fs.readdirSync(a).filter((f) => /^\d\d[a-z]?-.*\.png$/.test(f)).sort();
  report[`basic-${basic}`] = {};
  for (const name of names) {
    const left = readPng(path.join(a, name));
    const right = readPng(path.join(b, name));
    const d = diff(left, right);
    writePng(path.join(out, `basic-${basic}`, name), hstack([left, right, d.image]));
    report[`basic-${basic}`][name.replace(/\.png$/, "")] = d.count;
  }
}
fs.writeFileSync(path.join(out, "diff.json"), JSON.stringify({
  note: "differing pixels of 92160 (384x240) between AltirraOS and the original XL OS rev. 2; gameplay frames differ in content because the runs drift apart (boot timing, POKEY RANDOM), not in rendering",
  ...report,
}, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
