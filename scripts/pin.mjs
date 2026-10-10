// Pins a game to one GitHub release of its repo:
//   1. finds the release and its asset (never "latest"; a missing release or
//      asset stops here), downloads the asset and computes its SHA-256,
//   2. writes tag, asset and SHA-256 into games/<id>.json (and the version in
//      "status", if it names the old tag),
//   3. rebuilds, rewrites tests/reference/<id>-menu.png through the menu test
//      (UPDATE_REFERENCE=1, the same code that checks it) and shows how it
//      changed: build/pin/<id>/{previous,current,diff}.png,
//   4. runs the tests (build, Chromium, Firefox required; WebKit reported).
//
//   npm run pin -- <game-id> <tag> [--asset <file.atr>] [--expect-sha <prefix>]
//
// --asset        the release asset to pin (default: the file pinned now)
// --expect-sha   stop unless the download's SHA-256 starts with this
// --no-build     stop after writing the data file (steps 1-2 only)
// --games <dir>  the games directory (default games/; the tests use a copy)
// GITHUB_TOKEN or GH_TOKEN, if set, raises the GitHub API's rate limit.
// PIN_GITHUB_API replaces https://api.github.com (the tests' stand-in).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { sha256, validateGame } from "./lib/games.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flags = new Set(["--no-build"]);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--") && !flags.has(argv[i - 1])));
const api = (process.env.PIN_GITHUB_API ?? "https://api.github.com").replace(/\/$/, "");
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

function say(line) {
  process.stdout.write(`pin: ${line}\n`);
}
function refuse(msg) {
  process.stderr.write(`pin: refused: ${msg}\n`);
  process.exit(1);
}
function run(label, cmd, args, env = {}) {
  say(label);
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });
  return r.status === 0;
}

// Replaces the value of "key" inside text (the first match only), keeping
// the file's own layout.
function setValue(text, key, from, to) {
  const before = `"${key}": ${JSON.stringify(from)}`;
  const at = text.indexOf(before);
  if (at < 0) throw new Error(`cannot find ${before} in the data file`);
  return text.slice(0, at) + `"${key}": ${JSON.stringify(to)}` + text.slice(at + before.length);
}

async function main() {
  const [id, tag] = positional;
  if (positional.length !== 2) refuse("usage: npm run pin -- <game-id> <tag> [--asset <file.atr>] [--expect-sha <prefix>]");
  if (/^latest$/i.test(tag)) refuse('the tag must name one release, never "latest"');
  const gamesDir = path.resolve(opt("games") ?? path.join(root, "games"));
  const file = path.join(gamesDir, `${id}.json`);
  if (!fs.existsSync(file)) refuse(`${path.relative(root, file)} does not exist`);
  const text = fs.readFileSync(file, "utf8");
  const game = validateGame(JSON.parse(text), file);
  const old = game.disk;
  const assetName = opt("asset") ?? old.asset;
  const expect = opt("expect-sha")?.toLowerCase();
  if (expect !== undefined && !/^[0-9a-f]{1,64}$/.test(expect)) refuse("--expect-sha takes hex digits");

  // 1. the release and its asset
  const headers = { accept: "application/vnd.github+json", "user-agent": "setech-arcade-pin" };
  if (token) headers.authorization = `Bearer ${token}`;
  const releaseUrl = `${api}/repos/${old.repo}/releases/tags/${encodeURIComponent(tag)}`;
  const res = await fetch(releaseUrl, { headers });
  if (res.status === 404) refuse(`${old.repo} has no published release "${tag}"`);
  if (!res.ok) refuse(`${releaseUrl}: HTTP ${res.status}`);
  const release = await res.json();
  if (release.tag_name !== tag || release.draft) refuse(`${old.repo} has no published release "${tag}"`);
  const asset = (release.assets ?? []).find((a) => a.name === assetName);
  if (!asset) {
    const names = (release.assets ?? []).map((a) => a.name).join(", ") || "none";
    refuse(`release ${tag} of ${old.repo} has no asset "${assetName}" (assets: ${names})`);
  }
  if (!/\.atr$/i.test(asset.name)) refuse(`"${asset.name}" is not an .atr file`);
  say(`${old.repo} ${tag}${release.prerelease ? " (pre-release)" : ""}, ${release.published_at}: downloading ${asset.name}`);
  const dl = await fetch(asset.browser_download_url, { redirect: "follow", headers: { "user-agent": headers["user-agent"] } });
  if (!dl.ok) refuse(`${asset.browser_download_url}: HTTP ${dl.status}`);
  const bytes = Buffer.from(await dl.arrayBuffer());
  const hash = sha256(bytes);
  if (asset.size !== undefined && bytes.length !== asset.size) refuse(`downloaded ${bytes.length} bytes, the release lists ${asset.size}`);
  if (asset.digest && asset.digest !== `sha256:${hash}`) refuse(`SHA-256 mismatch: downloaded ${hash}, GitHub lists ${asset.digest}`);
  if (expect !== undefined && !hash.startsWith(expect)) refuse(`SHA-256 mismatch: downloaded ${hash}, expected it to start with ${expect}`);
  say(`${asset.name}: ${bytes.length} bytes, SHA-256 ${hash}`);

  // 2. the data file
  if (tag === old.tag && asset.name === old.asset && hash === old.sha256) {
    say(`${id} already pins ${tag} ${asset.name} ${hash}; nothing to change`);
    return 0;
  }
  let next = setValue(text, "tag", old.tag, tag);
  next = setValue(next, "asset", old.asset, asset.name);
  next = setValue(next, "sha256", old.sha256, hash);
  const status = game.status.includes(old.tag) ? game.status.replace(old.tag, tag) : game.status;
  if (status !== game.status) next = setValue(next, "status", game.status, status);
  const pinned = validateGame(JSON.parse(next), file);
  const expected = { ...game, status, disk: { ...old, tag, asset: asset.name, sha256: hash } };
  if (JSON.stringify(pinned) !== JSON.stringify(expected)) throw new Error("the edited data file does not read back as expected; nothing written");
  fs.writeFileSync(file, next);
  say(`${path.relative(root, file)}: ${old.tag} -> ${tag}, ${old.asset} -> ${asset.name}, ${old.sha256.slice(0, 8)} -> ${hash.slice(0, 8)}${status !== game.status ? `, status "${status}"` : ""}`);
  if (status === game.status) say(`note: "status" ("${game.status}") does not name ${old.tag}; check it by hand`);
  if (argv.includes("--no-build")) return 0;

  // 3. build, the menu reference and its difference
  if (!run("build", process.execPath, [path.join(root, "scripts", "build.mjs"), "--games", gamesDir])) {
    refuse(`the build failed; ${path.relative(root, file)} is already changed (git checkout -- it to undo)`);
  }
  const reference = path.join(root, "tests", "reference", `${id}-menu.png`);
  const previous = fs.existsSync(reference) ? fs.readFileSync(reference) : null;
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  if (!run("menu reference (UPDATE_REFERENCE=1, the menu test in Chromium)", npx, ["playwright", "test", "menu", "--project=chromium", "--grep", `${id}: boots`], { UPDATE_REFERENCE: "1" })) {
    refuse("the menu test could not write the reference image");
  }
  const review = path.join(root, "build", "pin", id); // not test-results/: step 4 empties it
  fs.rmSync(review, { recursive: true, force: true });
  fs.mkdirSync(review, { recursive: true });
  fs.copyFileSync(reference, path.join(review, "current.png"));
  if (!previous) {
    say(`no previous reference; review the new one: ${path.relative(root, reference)}`);
  } else {
    fs.writeFileSync(path.join(review, "previous.png"), previous);
    const { comparePng } = await import("../tests/helpers.mjs");
    const current = PNG.sync.read(fs.readFileSync(reference));
    const { count, diff, reason } = comparePng(current, path.join(review, "previous.png"));
    if (count === 0) {
      say(`menu reference: unchanged (frame ${pinned.tests.menuFrame} is identical with ${tag})`);
    } else {
      if (diff) fs.writeFileSync(path.join(review, "diff.png"), PNG.sync.write(diff));
      say(`menu reference: CHANGED, ${reason ?? `${count} of ${current.width * current.height} pixels differ`}`);
      say(`review before committing: ${path.relative(root, review)}/{previous,current,diff}.png`);
    }
  }

  // 4. the tests, as the workflow runs them
  const required = run("tests: build checks, Chromium, Firefox (required)", npx, ["playwright", "test", "--project=build", "--project=chromium", "--project=firefox"]);
  const webkit = run("tests: WebKit (reported, does not block)", npx, ["playwright", "test", "--project=webkit"]);
  say(`required tests ${required ? "passed" : "FAILED"}; WebKit ${webkit ? "passed" : "failed (informational)"}`);
  if (!required) return 1;
  say(`done. Review, then: git add ${path.relative(root, file)} ${path.relative(root, reference)} && git commit`);
  return 0;
}

main().then((code) => process.exit(code), (err) => {
  process.stderr.write(`pin: failed: ${err.message}\n`);
  process.exit(1);
});
