// Prototype P2: does jsA8E boot Void Strike 65? (Chromium, Playwright,
// jsA8E's own automation API.) Boots the v0.2.2 ATR with AltirraOS 3.49,
// screenshots every second, and if the game's stage-2 loader stops on its
// error screen (boot_stage2_error, PC $2617/$2625 in v0.2.2), records where
// the sector data went wrong.
//   node spike/scripts/jsa8e-check.mjs   (after build-jsa8e.sh)
// -> spike/results/prototypes/jsa8e/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { serve } from "./serve.mjs";
import { hstack, readPng, writePng } from "./lib/png-tools.mjs";

const spike = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(spike, "results", "prototypes", "jsa8e");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const atr = fs.readFileSync(path.join(spike, "assets", "void-strike-65.atr"));
const sector = (n) => atr.subarray(16 + (n - 1) * 128, 16 + n * 128);
const STAGE2_ERROR = 0x2617;

const server = await serve(8781);
const browser = await chromium.launch();
const result = { jsa8e: "AnimaInCorpore/A8E @ ea88454 (jsA8E v1.3.0+)", browser: `chromium ${browser.version()}`, os: "AltirraOS 3.49" };

// 1. timeline: twelve seconds, a screenshot per second
let page = await browser.newPage();
await page.goto("http://localhost:8781/spike/.cache/a8e/jsA8E/?a8e_worker=0");
const timeline = await page.evaluate(async () => {
  const api = await window.A8EAutomation.whenReady();
  await api.media.mountDiskFromUrl("/spike/assets/void-strike-65.atr", { slot: 0 });
  await api.system.boot();
  const shots = [];
  for (let i = 0; i < 12; i += 1) {
    await api.system.waitForFrames({ count: 50, timeoutMs: 20000 });
    const s = await api.artifacts.captureScreenshot();
    shots.push({ state: await api.debug.readMemory(0x9a), pc: (await api.debug.getDebugState()).pc, b64: s.base64 });
  }
  return shots;
});
const pngs = timeline.map((t, i) => {
  const file = path.join(out, `t${String(i + 1).padStart(2, "0")}s.png`);
  fs.writeFileSync(file, Buffer.from(t.b64, "base64"));
  return readPng(file);
});
writePng(path.join(out, "timeline-1-6s.png"), hstack(pngs.slice(0, 6)));
writePng(path.join(out, "timeline-7-12s.png"), hstack(pngs.slice(6)));
result.timeline = timeline.map((t, i) => ({ second: i + 1, gameState: t.state, pc: `$${t.pc.toString(16)}` }));
result.reachedMenu = timeline.some((t) => t.state === 1);
await page.close();

// 2. diagnosis: stop at the stage-2 error and find which sectors arrived
page = await browser.newPage();
await page.goto("http://localhost:8781/spike/.cache/a8e/jsA8E/?a8e_worker=0");
const diag = await page.evaluate(async (bp) => {
  const api = await window.A8EAutomation.whenReady();
  await api.media.mountDiskFromUrl("/spike/assets/void-strike-65.atr", { slot: 0 });
  await api.debug.setBreakpoints([bp]);
  await api.system.boot();
  const stop = await api.debug.waitForBreakpoint({ timeoutMs: 30000 });
  return {
    hit: stop?.debugState?.pc ?? stop?.pc ?? null,
    y: (await api.debug.getDebugState()).y,
    dcb: await api.debug.readRange(0x300, 12, { format: "hex" }),
    ram: await api.debug.readRange(0, 0x10000, { format: "hex" }),
  };
}, STAGE2_ERROR);
const ram = Buffer.from(diag.ram.replace(/\s/g, ""), "hex");
const dcb = Buffer.from(diag.dcb.replace(/\s/g, ""), "hex");
const lastSector = dcb.readUInt16LE(10) - 1;
const buf = dcb.readUInt16LE(4);
const count = (buf - 0x8100) / 128;
const arrived = [];
const foundElsewhere = {};
let nonZero = 0;
for (let i = 0; i < count; i += 1) {
  const n = lastSector - count + 1 + i;
  const slot = ram.subarray(0x8100 + i * 128, 0x8200 + i * 128);
  arrived.push(slot.equals(sector(n)));
  nonZero += slot.filter((b) => b !== 0).length;
  const at = ram.indexOf(sector(n));
  if (at >= 0 && at !== 0x8100 + i * 128) foundElsewhere[n] = `$${at.toString(16)}`;
}
result.stage2Error = {
  breakpointHit: diag.hit === STAGE2_ERROR,
  failedCheck: diag.y === 0x0a ? "CRC of the chunk (ldy #$0A; cmp; STAGE2_FAIL_NE)" : `Y=${diag.y}`,
  chunk: `sectors ${lastSector - count + 1}-${lastSector} into $8100-$${(buf - 1).toString(16)} through OS SIOV`,
  sectorsMatchingDisk: arrived.filter(Boolean).length,
  sectorsWrong: arrived.filter((x) => !x).length,
  firstWrongSector: lastSector - count + 1 + arrived.indexOf(false),
  nonZeroBytesInStaging: nonZero,
  expectedSectorsFoundElsewhereInRam: foundElsewhere,
};
await browser.close();
server.close();
fs.writeFileSync(path.join(out, "result.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
