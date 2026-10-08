import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The games as built (dist/games/<id>.json), so the tests follow the build.
export function builtGames() {
  const dir = path.join(ROOT, "dist", "games");
  if (!fs.existsSync(dir)) throw new Error("dist/ is missing: run npm run build first");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}

// Optional per-game test knowledge: tests/games/<id>.mjs
export async function gameModule(id) {
  const file = path.join(ROOT, "tests", "games", `${id}.mjs`);
  return fs.existsSync(file) ? import(pathToFileURL(file).href) : null;
}

export async function openPlay(page, id, query = "") {
  await page.goto(`play/${id}/${query}`);
  await page.waitForFunction(() => window.arcade?.ready === true, null, { timeout: 30_000 });
}

export function pngFromDataUrl(dataUrl) {
  return PNG.sync.read(Buffer.from(dataUrl.split(",")[1], "base64"));
}

export function comparePng(actual, expectedFile) {
  const expected = PNG.sync.read(fs.readFileSync(expectedFile));
  if (actual.width !== expected.width || actual.height !== expected.height) {
    return { count: Infinity, diff: null, reason: `size ${actual.width}x${actual.height} vs ${expected.width}x${expected.height}` };
  }
  const diff = new PNG({ width: actual.width, height: actual.height });
  const count = pixelmatch(actual.data, expected.data, diff.data, actual.width, actual.height, { threshold: 0 });
  return { count, diff };
}

// Known WebKit problems are listed in docs/known-issues.md; a test marked
// with knownWebkitIssue() still runs, and is reported as an expected failure.
export function knownWebkitIssue(test, browserName, reason) {
  test.fail(browserName === "webkit", `Known WebKit issue (docs/known-issues.md): ${reason}`);
}
