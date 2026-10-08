// Per-frame emulation cost under Chromium CPU throttling (a rough stand-in
// for phones): 1x, 4x, 6x, 600 menu/gameplay frames in manual stepping.
// -> spike/results/prototypes/throttle.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { serve } from "./serve.mjs";

const spike = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = await serve(8779);
const browser = await chromium.launch();
const results = {};
for (const proto of ["atari800-wasm", "sfotty-pie"]) {
  results[proto] = {};
  for (const rate of [1, 4, 6]) {
    const page = await browser.newPage();
    const cdp = await page.context().newCDPSession(page);
    await page.goto(`http://localhost:8779/spike/prototypes/${proto}/?manual=1&fresh=1`);
    await page.waitForFunction(() => window.vs?.ready);
    await page.evaluate(() => window.vs.runScript("until 0x9A 1 1500"));
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    const ms = await page.evaluate(() => {
      const t = performance.now();
      window.vs.runScript("frames 25\nfire 1\nframes 4\nfire 0\nframes 350\nfire 1\nframes 4\nfire 0\nframes 217");
      return (performance.now() - t) / 600;
    });
    results[proto][`${rate}x`] = { msPerFrame: +ms.toFixed(2), budgetShare: `${Math.round((ms / 20) * 100)}%` };
    await page.close();
  }
}
await browser.close();
server.close();
fs.writeFileSync(path.join(spike, "results", "prototypes", "throttle.json"), JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify(results, null, 2));
