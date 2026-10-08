// The atari800 reference run: boots a COPY of the v0.2.2 ATR in the scripted
// libatari800 harness and walks the whole game — menu, START GAME loader,
// gameplay, the capital corridor, the boss entry and fight, the level-end
// summary and its best-score write, a power cycle that must show the saved
// best, and RESET — under each OS / BASIC combination.
//
//   node spike/scripts/reference-run.mjs            all four combinations
//   node spike/scripts/reference-run.mjs altirra    AltirraOS only
//
// Screenshots: spike/results/reference/<os>-basic-<on|off>/
// Summary:     spike/results/reference/summary.json
//
// The original-OS runs need VS65_ROM_DIR (ATARIXL.ROM, ATARIBAS.ROM); they
// default to ~/rom. Those ROMs are never copied into this repository.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const spike = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const harness = path.join(spike, "bin", "vs65-harness");
const releaseAtr = path.join(spike, "assets", "void-strike-65.atr");
const resultsRoot = path.join(spike, "results", "reference");
const workRoot = path.join(spike, "work", "reference");
const RELEASE_SHA256 = "19b82947a3b280e05040d8200d96de81e2ae79b504e6d7f2c010579a4604c4d4";

import { ATR_HEADER, SECTOR, scenario, sectorBytes } from "./lib/scenario.mjs";

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function run(osName, basic) {
  const id = `${osName}-basic-${basic}`;
  const out = path.join(resultsRoot, id);
  const work = path.join(workRoot, id);
  fs.rmSync(out, { recursive: true, force: true });
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, "boss"), { recursive: true });
  fs.mkdirSync(work, { recursive: true });
  const disk = path.join(work, "void-strike-65.atr");
  fs.copyFileSync(releaseAtr, disk);
  const scriptPath = path.join(work, "scenario.txt");
  fs.writeFileSync(scriptPath, `palette ${path.join(out, "atari800-pal.palette")}\n` + scenario());
  const env = { ...process.env, VS65_ROM_DIR: process.env.VS65_ROM_DIR ?? path.join(os.homedir(), "rom") };
  const started = Date.now();
  const result = spawnSync(harness, ["--os", osName, "--basic", basic, "--atr", disk, "--script", scriptPath, "--out", out],
    { encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
  const log = (result.stdout ?? "") + (result.stderr ?? "");
  fs.writeFileSync(path.join(out, "harness.log"), log);
  const marks = Object.fromEntries([...log.matchAll(/^(\d+) mark (\S+)/gm)].map((m) => [m[2], Number(m[1])]));
  const before = fs.readFileSync(releaseAtr);
  const after = fs.readFileSync(disk);
  const changedSectors = [];
  for (let n = 1; n <= (before.length - ATR_HEADER) / SECTOR; n += 1) {
    if (!sectorBytes(before, n).equals(sectorBytes(after, n))) changedSectors.push(n);
  }
  return {
    id, os: osName, basic, exit: result.status, hostMs: Date.now() - started, marks,
    framesToMenu: marks.menu, changedSectors,
    sector599: sectorBytes(after, 599).toString("hex"),
    timeout: /TIMEOUT/.test(log) ? log.match(/^.*TIMEOUT.*$/m)[0] : null,
  };
}

if (sha256(fs.readFileSync(releaseAtr)) !== RELEASE_SHA256) throw new Error("spike/assets ATR is not v0.2.2");
const only = process.argv[2];
const combos = [["altirra", "off"], ["altirra", "on"], ["xl", "off"], ["xl", "on"]].filter(([o]) => !only || o === only);
const summary = combos.map(([o, b]) => {
  const r = run(o, b);
  console.log(JSON.stringify(r));
  return r;
});
fs.mkdirSync(resultsRoot, { recursive: true });
fs.writeFileSync(path.join(resultsRoot, "summary.json"), JSON.stringify({
  emulator: "atari800 7.2.1 (libatari800, spike/harness/vs65-harness.c)",
  machine: "800XL 64 KB, PAL",
  atr: { release: "v0.2.2", sha256: RELEASE_SHA256 },
  runs: summary,
}, null, 2) + "\n");
