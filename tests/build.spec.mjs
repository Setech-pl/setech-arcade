// The build refuses a disk whose SHA-256 differs from its data file, and a
// data file that does not pin one release.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { ROOT } from "./helpers.mjs";

function tamperedGames(edit) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arcade-games-"));
  fs.cpSync(path.join(ROOT, "games"), dir, { recursive: true });
  const file = path.join(dir, "void-strike-65.json");
  const game = JSON.parse(fs.readFileSync(file, "utf8"));
  edit(game);
  fs.writeFileSync(file, JSON.stringify(game, null, 2));
  return dir;
}
function build(gamesDir) {
  const out = path.join(gamesDir, "dist");
  return spawnSync(process.execPath, [path.join(ROOT, "scripts", "build.mjs"), "--games", gamesDir, "--out", out], { encoding: "utf8", timeout: 600_000 });
}

test("a wrong ATR hash fails the build", async () => {
  const dir = tamperedGames((g) => {
    const flipped = g.disk.sha256[0] === "0" ? "1" : "0";
    g.disk.sha256 = flipped + g.disk.sha256.slice(1);
  });
  const r = build(dir);
  expect(r.status, r.stdout + r.stderr).toBe(1);
  expect(r.stderr).toMatch(/SHA-256 mismatch/);
  expect(fs.existsSync(path.join(dir, "dist", "index.html")), "no site is written").toBe(false);
});

test('a disk pinned to "latest" fails the build', async () => {
  const r = build(tamperedGames((g) => { g.disk.tag = "latest"; }));
  expect(r.status).toBe(1);
  expect(r.stderr).toMatch(/never "latest"/);
});
