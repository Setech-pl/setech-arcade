// A browser prototype in real browsers via Playwright.
//
//   node spike/scripts/prototype-measure.mjs <atari800-wasm|sfotty-pie> [chromium|firefox|webkit ...]
//
// 1. Deterministic: the reference scenario (spike/scripts/lib/scenario.mjs)
//    runs inside the page frame by frame; every checkpoint is compared pixel
//    for pixel with the native atari800 reference (AltirraOS, BASIC off).
// 2. Persistence: the best-score write reaches sector 599 of the in-browser
//    disk and IndexedDB; a reload restores it.
// 3. Real time: click to start, wall-clock time to the main menu, and frame
//    pacing over ten seconds of the menu.
// Output: spike/results/prototypes/<prototype>/<browser>/ and results.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "@playwright/test";
import { PNG } from "pngjs";
import { serve } from "./serve.mjs";
import { crop, diff, hstack, readPng, writePng } from "./lib/png-tools.mjs";
import { scenario } from "./lib/scenario.mjs";

const spike = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [prototype, ...browserArgs] = process.argv.slice(2);
const outRoot = path.join(spike, "results", "prototypes", prototype);
const referenceDir = path.join(spike, "results", "reference", "altirra-basic-off");
const PORT = 8766;
const URL_BASE = `http://localhost:${PORT}/spike/prototypes/${prototype}/`;
// Sfotty Pie renders through atari800's palette for the pixel comparison.
const EXTRA = prototype === "sfotty-pie" ? "&palette=/spike/results/reference/altirra-basic-off/atari800-pal.palette" : "";
const engines = { chromium, firefox, webkit };
const wanted = browserArgs.length ? browserArgs : ["chromium", "firefox", "webkit"];

const server = await serve(PORT);
const results = {};
for (const name of wanted) {
  const out = path.join(outRoot, name);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await engines[name].launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  const r = { browser: `${name} ${browser.version()}` };

  // 1. deterministic run
  await page.goto(`${URL_BASE}?manual=1&fresh=1${EXTRA}`);
  await page.waitForFunction(() => window.vs?.ready, null, { timeout: 30000 });
  r.loadMs = await page.evaluate(() => window.vs.loadMs);
  const t = Date.now();
  const run = await page.evaluate((text) => window.vs.runScript(text), scenario());
  r.scenarioWallMs = Date.now() - t;
  r.scenarioFrames = run.frame;
  r.marks = run.marks;
  const nativeLog = fs.readFileSync(path.join(referenceDir, "harness.log"), "utf8");
  r.nativeMarks = Object.fromEntries([...nativeLog.matchAll(/^(\d+) mark (\S+)/gm)].map((m) => [m[2], Number(m[1])]));
  r.checkpoints = {};
  for (const [shot, dataUrl] of Object.entries(run.shots)) {
    const browserPng = PNG.sync.read(Buffer.from(dataUrl.split(",")[1], "base64"));
    const nativePng = crop(readPng(path.join(referenceDir, `${shot}.png`)), 24, 0, 336, 240);
    const d = diff(nativePng, browserPng);
    r.checkpoints[shot] = d.count;
    writePng(path.join(out, `${shot}.png`), hstack([nativePng, browserPng, d.image]));
  }
  // 2. persistence
  r.sector599AfterRun = Buffer.from(await page.evaluate(() => window.vs.diskSector(599))).toString("hex").slice(0, 16);
  await page.evaluate(() => window.vs.persistDisk());
  await page.goto(`${URL_BASE}?manual=1${EXTRA}`);
  await page.waitForFunction(() => window.vs?.ready);
  r.restoredFromSaveAfterReload = await page.evaluate(() => window.vs.restoredFromSave);
  r.sector599AfterReload = Buffer.from(await page.evaluate(() => window.vs.diskSector(599))).toString("hex").slice(0, 16);

  // 3. real time: load -> click -> menu, then 10 s of pacing on the menu
  await page.goto(`${URL_BASE}?fresh=1`);
  const navStart = Date.now();
  await page.waitForFunction(() => window.vs?.ready, null, { timeout: 30000 });
  r.realtimeReadyMs = Date.now() - navStart;
  await page.click("#start");
  const clickAt = Date.now();
  await page.waitForFunction(() => window.vs.peek(0x9a) === 1, null, { timeout: 60000, polling: 50 });
  r.realtimeClickToMenuMs = Date.now() - clickAt;
  r.realtimeFramesToMenu = await page.evaluate(() => window.vs.frame);
  const p0 = await page.evaluate(() => window.vs.pacing);
  await page.waitForTimeout(10000);
  const p1 = await page.evaluate(() => window.vs.pacing);
  r.pacing10s = {
    emulatedFrames: p1.frames - p0.frames, rafCallbacks: p1.rafs - p0.rafs, fellBehind: p1.behind - p0.behind,
    stepMsAvg: +((p1.stepMsTotal - p0.stepMsTotal) / Math.max(1, p1.frames - p0.frames)).toFixed(2), stepMsMax: +p1.stepMsMax.toFixed(2),
  };
  r.audio = await page.evaluate(() => window.vs.audio);
  await page.screenshot({ path: path.join(out, "page.png") });
  r.pageErrors = consoleErrors;
  results[name] = r;
  console.log(JSON.stringify(r));
  await browser.close();
}
server.close();
fs.writeFileSync(path.join(outRoot, "results.json"), JSON.stringify(results, null, 2) + "\n");
