// The public SIO read test (docs/upstream/sio-read-test) in jsA8E: one, two
// and 44 consecutive SIOV sector reads, with AltirraOS (and the original XL
// ROM if VS65_ROM_DIR is set; it is never copied into the repo).
//   node spike/scripts/jsa8e-sio-check.mjs   (after build-jsa8e.sh)
// -> spike/results/prototypes/jsa8e/sio-read-test.json
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { serve } from "./serve.mjs";

const spike = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(spike, "..");
const work = path.join(spike, "work", "sio-read-test");
fs.mkdirSync(work, { recursive: true });
const variants = [[1, 5], [2, 4], [44, 4]];
for (const [count, first] of variants) {
  execFileSync("python3", [path.join(repo, "docs", "upstream", "sio-read-test", "make-disk.py"), String(count), String(first), "4000"], { cwd: work });
  fs.renameSync(path.join(work, "sio-read-test.atr"), path.join(work, `t-${count}-${first}.atr`));
}
let romUrl = null;
if (process.env.VS65_ROM_DIR) {
  const dir = path.join(work, "rom");
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ["ATARIXL.ROM", "ATARIBAS.ROM"]) fs.copyFileSync(path.join(process.env.VS65_ROM_DIR.replace(/^~/, os.homedir()), f), path.join(dir, f));
  romUrl = "/spike/work/sio-read-test/rom";
}
const server = await serve(8795);
const browser = await chromium.launch();
const results = [];
for (const rom of romUrl ? [null, romUrl] : [null]) {
  for (const [count, first] of variants) {
    const page = await browser.newPage();
    await page.goto("http://localhost:8795/spike/.cache/a8e/jsA8E/?a8e_worker=0");
    const r = await page.evaluate(async ({ disk, rom }) => {
      const api = await window.A8EAutomation.whenReady();
      if (rom) { await api.media.loadOsRomFromUrl(`${rom}/ATARIXL.ROM`); await api.media.loadBasicRomFromUrl(`${rom}/ATARIBAS.ROM`); }
      await api.media.mountDiskFromUrl(disk, { slot: 0 });
      await api.system.boot();
      await api.system.waitForFrames({ count: 300, timeoutMs: 30000 });
      return { intact: await api.debug.readMemory(0x600), done: await api.debug.readMemory(0x601), dcb: await api.debug.readRange(0x300, 12, { format: "hex" }) };
    }, { disk: `/spike/work/sio-read-test/t-${count}-${first}.atr`, rom });
    results.push({ os: rom ? "Atari XL OS rev. 2" : "AltirraOS 3.49", reads: count, firstSector: first, intact: r.intact, finished: r.done === 1, dcbAfter: r.dcb.replace(/\s/g, "") });
    await page.close();
  }
}
await browser.close();
server.close();
const out = path.join(spike, "results", "prototypes", "jsa8e", "sio-read-test.json");
fs.writeFileSync(out, JSON.stringify({ jsa8e: "AnimaInCorpore/A8E @ ea88454", browser: "Chromium (Playwright)", results }, null, 2) + "\n");
console.table(results);
