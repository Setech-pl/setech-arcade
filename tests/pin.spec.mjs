// npm run pin refuses "latest", a release or asset that does not exist and a
// download whose hash is not the expected one, and leaves the data file as it
// was; otherwise it writes the new pin and nothing else. GitHub is replaced
// by a local stand-in (PIN_GITHUB_API), so the tests need no network.
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { ROOT } from "./helpers.mjs";

const REPO = "Setech-pl/void-strike-65";
const DISK = Buffer.from("a stand-in disk image for the pin tests");
const DISK_SHA = crypto.createHash("sha256").update(DISK).digest("hex");

let server;
let api;
// tag -> { assets: [{ name, digest? }] }
const releases = {
  "v9.9.9": { assets: [{ name: "void-strike-65.atr", digest: `sha256:${DISK_SHA}` }] },
  "v9.9.8": { assets: [{ name: "void-strike-65-manual.pdf" }] },
  "v9.9.7": { assets: [{ name: "void-strike-65.atr", digest: `sha256:${"0".repeat(64)}` }] },
};

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const m = req.url.match(/^\/repos\/([^/]+\/[^/]+)\/releases\/tags\/([^/]+)$/);
    const tag = m && decodeURIComponent(m[2]);
    if (m && m[1] === REPO && releases[tag]) {
      const assets = releases[tag].assets.map((a) => ({ ...a, size: DISK.length, browser_download_url: `${api}/download/${tag}/${a.name}` }));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ tag_name: tag, draft: false, prerelease: true, published_at: "2026-10-10T00:00:00Z", assets }));
    } else if (req.url.startsWith("/download/")) {
      res.writeHead(200, { "content-type": "application/octet-stream" }).end(DISK);
    } else {
      res.writeHead(404).end(JSON.stringify({ message: "Not Found" }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  api = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(() => new Promise((resolve) => server.close(resolve)));

function gamesCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arcade-pin-"));
  fs.cpSync(path.join(ROOT, "games"), dir, { recursive: true });
  return dir;
}
function pin(gamesDir, ...args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(ROOT, "scripts", "pin.mjs"), ...args, "--games", gamesDir, "--no-build"],
      { env: { ...process.env, PIN_GITHUB_API: api, GITHUB_TOKEN: "", GH_TOKEN: "" }, timeout: 60_000 },
      (err, stdout, stderr) => resolve({ status: err ? err.code : 0, stdout, stderr }));
  });
}
const dataFile = (dir) => fs.readFileSync(path.join(dir, "void-strike-65.json"), "utf8");

test("pin writes the release's tag, asset and SHA-256, and nothing else", async () => {
  const dir = gamesCopy();
  const before = dataFile(dir);
  const old = JSON.parse(before);
  const r = await pin(dir, "void-strike-65", "v9.9.9", "--expect-sha", DISK_SHA.slice(0, 8));
  expect(r.status, r.stdout + r.stderr).toBe(0);
  const after = dataFile(dir);
  const g = JSON.parse(after);
  expect(g.disk).toEqual({ repo: REPO, tag: "v9.9.9", asset: "void-strike-65.atr", sha256: DISK_SHA });
  expect(g.status).toBe(old.status.replace(old.disk.tag, "v9.9.9"));
  // the file keeps its layout: only the changed lines differ
  const changed = after.split("\n").filter((line, i) => line !== before.split("\n")[i]);
  expect(changed.map((l) => l.trim().split(":")[0])).toEqual(['"status"', '"tag"', '"sha256"']);
});

test("pin refuses \"latest\"", async () => {
  const dir = gamesCopy();
  const before = dataFile(dir);
  const r = await pin(dir, "void-strike-65", "latest");
  expect(r.status).toBe(1);
  expect(r.stderr).toMatch(/never "latest"/);
  expect(dataFile(dir)).toBe(before);
});

test("pin refuses a release that does not exist", async () => {
  const dir = gamesCopy();
  const before = dataFile(dir);
  const r = await pin(dir, "void-strike-65", "v0.0.0-nope");
  expect(r.status).toBe(1);
  expect(r.stderr).toMatch(/has no published release "v0\.0\.0-nope"/);
  expect(dataFile(dir)).toBe(before);
});

test("pin refuses a release without the asset", async () => {
  const dir = gamesCopy();
  const before = dataFile(dir);
  const r = await pin(dir, "void-strike-65", "v9.9.8");
  expect(r.status).toBe(1);
  expect(r.stderr).toMatch(/has no asset "void-strike-65\.atr" \(assets: void-strike-65-manual\.pdf\)/);
  expect(dataFile(dir)).toBe(before);
});

test("pin refuses a download whose hash differs from GitHub's digest", async () => {
  const dir = gamesCopy();
  const before = dataFile(dir);
  const r = await pin(dir, "void-strike-65", "v9.9.7");
  expect(r.status).toBe(1);
  expect(r.stderr).toMatch(/SHA-256 mismatch: downloaded [0-9a-f]{64}, GitHub lists sha256:0{64}/);
  expect(dataFile(dir)).toBe(before);
});

test("pin refuses a download whose hash is not the expected one", async () => {
  const dir = gamesCopy();
  const before = dataFile(dir);
  const wrong = DISK_SHA[0] === "0" ? "1" : "0";
  const r = await pin(dir, "void-strike-65", "v9.9.9", "--expect-sha", wrong);
  expect(r.status).toBe(1);
  expect(r.stderr).toMatch(new RegExp(`SHA-256 mismatch: downloaded ${DISK_SHA}, expected it to start with ${wrong}`));
  expect(dataFile(dir)).toBe(before);
});
