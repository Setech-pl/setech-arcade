// Can a web page fetch the release ATR straight from GitHub? (Chromium,
// Firefox, WebKit; page origin http://localhost.) -> spike/results/cors.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "@playwright/test";
import { serve } from "./serve.mjs";

const spike = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const urls = {
  releaseDownload: "https://github.com/Setech-pl/void-strike-65/releases/download/v0.2.2/void-strike-65.atr",
  apiAsset: "https://api.github.com/repos/Setech-pl/void-strike-65/releases/assets/620334158",
  rawInRepo: "https://raw.githubusercontent.com/Setech-pl/void-strike-65/main/dist/void-strike-65.atr",
};
const server = await serve(8778);
const results = {};
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch();
  const page = await browser.newPage();
  await page.goto("http://localhost:8778/spike/assets/");
  results[name] = await page.evaluate(async (urls) => {
    const out = {};
    for (const [k, u] of Object.entries(urls)) {
      try {
        const r = await fetch(u, k === "apiAsset" ? { headers: { Accept: "application/octet-stream" } } : {});
        const b = await r.arrayBuffer();
        out[k] = `HTTP ${r.status}, ${b.byteLength} bytes`;
      } catch (e) { out[k] = `FAILED: ${e.message}`; }
    }
    return out;
  }, urls);
  await browser.close();
}
server.close();
fs.writeFileSync(path.join(spike, "results", "cors.json"), JSON.stringify({ checkedAt: new Date().toISOString(), urls, results }, null, 2) + "\n");
console.log(JSON.stringify(results, null, 2));
