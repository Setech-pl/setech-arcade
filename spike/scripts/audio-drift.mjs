// Real-time audio queue over 60 s (Chromium, P1 and P3 pages): with pacing at
// the PAL frame rate the queue depth should stay flat and nothing should be
// dropped. -> spike/results/prototypes/audio-drift.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { serve } from "./serve.mjs";

const spike = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = await serve(8782);
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const results = {};
for (const proto of ["atari800-wasm", "sfotty-pie"]) {
  const page = await browser.newPage();
  await page.goto(`http://localhost:8782/spike/prototypes/${proto}/?fresh=1`);
  await page.waitForFunction(() => window.vs?.ready);
  await page.click("#start");
  const samples = [];
  for (let s = 0; s <= 60; s += 10) {
    if (s) await page.waitForTimeout(10000);
    samples.push({ s, ...(await page.evaluate(() => ({ ...window.vs.audio, frame: window.vs.frame }))) });
  }
  results[proto] = samples;
  await page.close();
}
await browser.close();
server.close();
fs.writeFileSync(path.join(spike, "results", "prototypes", "audio-drift.json"), JSON.stringify(results, null, 2) + "\n");
for (const [k, v] of Object.entries(results)) console.log(k, v.map((x) => `${x.s}s:${x.bufferedMs}ms/u${x.underruns}/d${x.dropped}/f${x.frame}`).join("  "));
