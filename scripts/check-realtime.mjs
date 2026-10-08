// Real-time check of the built site in each browser: click Start, play 30 s
// of the menu and the loader, and report pacing and the audio queue.
//   node scripts/check-realtime.mjs [chromium firefox webkit]
import { chromium, firefox, webkit } from "@playwright/test";
import { serveDist } from "./serve.mjs";

const engines = { chromium, firefox, webkit };
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(engines);
const server = await serveDist({ port: 4174 });
for (const name of wanted) {
  const browser = await engines[name].launch({ args: name === "chromium" ? ["--autoplay-policy=no-user-gesture-required"] : [] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:4174/setech-arcade/play/void-strike-65/?fresh=1");
  await page.waitForFunction(() => window.arcade?.ready);
  await page.click("#start");
  const t0 = Date.now();
  await page.waitForFunction(() => window.arcade.peek(0x9a) === 1, null, { timeout: 30000 });
  const menuMs = Date.now() - t0;
  const p0 = await page.evaluate(() => window.arcade.pacing);
  await page.waitForTimeout(20000);
  const r = await page.evaluate(() => ({ pacing: window.arcade.pacing, audio: window.arcade.audio }));
  const frames = r.pacing.frames - p0.frames;
  console.log(JSON.stringify({
    browser: `${name} ${browser.version()}`, clickToMenuMs: menuMs,
    framesIn20s: frames, rateHz: +(frames / 20).toFixed(2), fellBehind: r.pacing.behind - p0.behind,
    stepMsAvg: +((r.pacing.stepMsTotal - p0.stepMsTotal) / frames).toFixed(2), stepMsMax: +r.pacing.stepMsMax.toFixed(1),
    audio: r.audio, errors,
  }));
  await browser.close();
}
server.close();
