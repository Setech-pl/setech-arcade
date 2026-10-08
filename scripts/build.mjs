// Builds the whole site into dist/:
//   1. atari800 7.2.1 -> WebAssembly (emulator/atari800/build.sh; cached),
//   2. every pinned game disk, downloaded and checked against its SHA-256,
//   3. the pages, assets, the emulator with its source tarball, the notices.
//
//   npm run build                     (node scripts/build.mjs)
//   node scripts/build.mjs --games <dir> --out <dir>
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchDisk, loadGames, sha256 } from "./lib/games.mjs";
import { creditsPage, indexPage, playPage } from "./lib/pages.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? path.resolve(process.argv[i + 1]) : fallback;
};
const gamesDir = arg("games", path.join(root, "games"));
const out = arg("out", path.join(root, "dist"));
const cache = path.join(root, ".cache");
const emulatorBuild = path.join(root, "build", "emulator");

function step(label) {
  process.stdout.write(`build: ${label}\n`);
}
function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

try {
  step(`games from ${path.relative(root, gamesDir) || "."}`);
  const games = loadGames(gamesDir);

  step("emulator");
  const em = spawnSync("bash", [path.join(root, "emulator", "atari800", "build.sh"), emulatorBuild], { stdio: "inherit" });
  if (em.status !== 0) throw new Error("the emulator build failed");
  const buildSh = fs.readFileSync(path.join(root, "emulator", "atari800", "build.sh"), "utf8");
  const emulator = {
    version: buildSh.match(/^ATARI800_VERSION=(\S+)/m)[1],
    sha256: buildSh.match(/^ATARI800_SHA256=(\S+)/m)[1],
    emsdk: buildSh.match(/^EMSDK_VERSION=(\S+)/m)[1],
  };
  emulator.tarball = `atari800-${emulator.version}-src.tgz`;

  step("disks (pinned releases, SHA-256 checked)");
  const disks = {};
  for (const g of games) {
    const bytes = await fetchDisk(g, path.join(cache, "disks"));
    disks[g.id] = { bytes, file: `${g.id}-${g.disk.sha256.slice(0, 8)}.atr` };
    step(`  ${g.id}: ${g.disk.repo} ${g.disk.tag} ${g.disk.asset} ok`);
  }

  step(`site -> ${path.relative(root, out)}`);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, ".nojekyll"), "");
  copy(path.join(root, "site", "favicon.svg"), path.join(out, "favicon.svg"));
  for (const f of fs.readdirSync(path.join(root, "site", "css"))) copy(path.join(root, "site", "css", f), path.join(out, "assets", "css", f));
  for (const f of fs.readdirSync(path.join(root, "site", "js"))) copy(path.join(root, "site", "js", f), path.join(out, "assets", "js", f));

  // the emulator and everything GPL section 3 asks to publish with it
  for (const f of ["atari800.js", "atari800.wasm", emulator.tarball]) copy(path.join(emulatorBuild, f), path.join(out, "emulator", f));
  if (sha256(fs.readFileSync(path.join(out, "emulator", emulator.tarball))) !== emulator.sha256) throw new Error("the published atari800 tarball does not match its pinned SHA-256");
  copy(path.join(root, "emulator", "atari800", "COPYING"), path.join(out, "emulator", "COPYING.txt"));
  copy(path.join(root, "emulator", "atari800", "EMSCRIPTEN-LICENSE"), path.join(out, "emulator", "EMSCRIPTEN-LICENSE.txt"));
  copy(path.join(root, "emulator", "atari800", "wasm-glue.c"), path.join(out, "emulator", "wasm-glue.c"));
  copy(path.join(root, "emulator", "atari800", "build.sh"), path.join(out, "emulator", "build.sh"));
  copy(path.join(root, "LICENSE"), path.join(out, "LICENSE.txt"));
  copy(path.join(root, "THIRD_PARTY_NOTICES.md"), path.join(out, "THIRD_PARTY_NOTICES.md"));

  // games: data, media, disks, pages
  for (const g of games) {
    for (const s of g.screenshots) copy(path.join(gamesDir, s.src), path.join(out, "games", s.src));
    fs.writeFileSync(path.join(out, "games", `${g.id}.json`), JSON.stringify(g, null, 2) + "\n");
    fs.mkdirSync(path.join(out, "disks"), { recursive: true });
    fs.writeFileSync(path.join(out, "disks", disks[g.id].file), disks[g.id].bytes);
    fs.mkdirSync(path.join(out, "play", g.id), { recursive: true });
    fs.writeFileSync(path.join(out, "play", g.id, "index.html"), playPage(g, `../../disks/${disks[g.id].file}`));
  }
  fs.writeFileSync(path.join(out, "index.html"), indexPage(games));
  fs.mkdirSync(path.join(out, "credits"), { recursive: true });
  fs.writeFileSync(path.join(out, "credits", "index.html"), creditsPage(games, emulator));

  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } };
  walk(out);
  const bytes = files.reduce((n, f) => n + fs.statSync(f).size, 0);
  const info = { builtAt: new Date().toISOString(), emulator, games: games.map((g) => ({ id: g.id, disk: g.disk })), files: files.length, bytes };
  fs.writeFileSync(path.join(out, "build-info.json"), JSON.stringify(info, null, 2) + "\n");
  step(`done: ${files.length} files, ${(bytes / 1024).toFixed(0)} KB`);
} catch (err) {
  process.stderr.write(`build failed: ${err.message}\n`);
  process.exit(1);
}
