// Screenshots of the built site for docs/screenshots/: the index and the
// play page (with the game running) at desktop and phone width.
//   npm run build && node scripts/screenshots.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices, webkit } from "@playwright/test";
import { serveDist } from "./serve.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = (f) => path.join(root, "docs", "screenshots", f);
const server = await serveDist({ port: 4175 });
const base = "http://localhost:4175/setech-arcade/";

async function shoot(browserType, contextOptions, prefix) {
  const browser = await browserType.launch();
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.goto(base);
  await page.screenshot({ path: out(`${prefix}-index.png`), fullPage: true });
  await page.goto(`${base}play/void-strike-65/?fresh=1`);
  await page.waitForFunction(() => window.arcade?.ready);
  await page.screenshot({ path: out(`${prefix}-play-ready.png`), fullPage: true });
  await page.click("#start");
  await page.waitForFunction(() => window.arcade.peek(0x9a) === 1, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out(`${prefix}-play-menu.png`), fullPage: true });
  await browser.close();
}
await shoot(chromium, { viewport: { width: 1280, height: 860 } }, "desktop");
await shoot(webkit, { ...devices["iPhone 15"] }, "phone");
server.close();
console.log("docs/screenshots: desktop-*, phone-*");
