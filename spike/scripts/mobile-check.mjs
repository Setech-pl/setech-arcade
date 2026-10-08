// Phone-sized check of the P1 page in WebKit (iPhone emulation): layout,
// touch controls, and that tapping FIRE starts a game.
// -> spike/results/prototypes/mobile/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { devices, webkit } from "@playwright/test";
import { serve } from "./serve.mjs";

const spike = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(spike, "results", "prototypes", "mobile");
fs.mkdirSync(out, { recursive: true });
const server = await serve(8780);
const browser = await webkit.launch();
const context = await browser.newContext({ ...devices["iPhone 15"] });
const page = await context.newPage();
await page.goto("http://localhost:8780/spike/prototypes/atari800-wasm/?fresh=1");
await page.waitForFunction(() => window.vs?.ready);
await page.tap("#start");
await page.waitForFunction(() => window.vs.peek(0x9a) === 1, null, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(out, "iphone15-menu.png") });
const touchVisible = await page.isVisible("#touch-fire");
// A touchscreen tap can be shorter than a frame; hold FIRE with pointer events.
const hold = async (ms) => {
  await page.dispatchEvent("#touch-fire", "pointerdown");
  await page.waitForTimeout(ms);
  await page.dispatchEvent("#touch-fire", "pointerup");
};
await hold(150);
await page.waitForTimeout(8000); // the loader, then PRESS FIRE
await hold(150);
let state;
try {
  await page.waitForFunction(() => window.vs.peek(0x9a) === 6, null, { timeout: 5000 });
  state = 6;
} catch { state = await page.evaluate(() => window.vs.peek(0x9a)); }
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(out, "iphone15-gameplay.png") });
const result = { device: "iPhone 15 (Playwright WebKit emulation)", touchControlsVisible: touchVisible, gameStateAfterTwoFireTaps: state, gameplayReached: state === 6 };
fs.writeFileSync(path.join(out, "mobile.json"), JSON.stringify(result, null, 2) + "\n");
console.log(result);
await browser.close();
server.close();
