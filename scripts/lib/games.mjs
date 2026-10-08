// games/*.json: loading, validation against the rules of game.schema.json
// (checked here without a dependency), and the pinned disk download.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

const need = (cond, file, msg) => {
  if (!cond) throw new Error(`${file}: ${msg}`);
};

export function validateGame(g, file) {
  for (const key of ["id", "title", "tagline", "description", "studio", "year", "status", "screenshots", "disk", "machine", "saves", "controls", "links", "licence", "tests"]) {
    need(g[key] !== undefined, file, `missing "${key}"`);
  }
  need(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.id), file, `id "${g.id}" must be a lowercase slug`);
  need(path.basename(file) === `${g.id}.json`, file, `the file must be named ${g.id}.json`);
  need(typeof g.tagline === "string" && g.tagline.length <= 140, file, "tagline: one line, at most 140 characters");
  need(Number.isInteger(g.year), file, "year must be an integer");
  need(Array.isArray(g.screenshots) && g.screenshots.length > 0 && g.screenshots.every((s) => s.src && s.alt), file, "screenshots: at least one { src, alt }");
  const d = g.disk;
  need(/^[^/\s]+\/[^/\s]+$/.test(d.repo ?? ""), file, 'disk.repo must be "owner/name"');
  need(typeof d.tag === "string" && d.tag && d.tag !== "latest", file, "disk.tag must name one release (never \"latest\")");
  need(/\.atr$/i.test(d.asset ?? ""), file, "disk.asset must be an .atr file");
  need(/^[0-9a-f]{64}$/.test(d.sha256 ?? ""), file, "disk.sha256 must be 64 lowercase hex digits");
  need(g.machine.model === "800xl" && g.machine.video === "pal" && typeof g.machine.basic === "boolean", file, 'machine: { model: "800xl", video: "pal", basic: true|false }');
  need(["disk", "none"].includes(g.saves), file, 'saves must be "disk" or "none"');
  need(Array.isArray(g.controls) && g.controls.every((c) => c.action && c.atari), file, "controls: [{ action, atari }]");
  need(g.links.repo && g.links.releases, file, "links.repo and links.releases are required");
  need(g.licence.summary && g.licence.url && g.licence.credit, file, "licence: { summary, url, credit }");
  need(Number.isInteger(g.tests.menuFrame) && g.tests.menuFrame > 0, file, "tests.menuFrame must be a positive integer");
  return g;
}

export function loadGames(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".schema.json")).sort();
  if (!files.length) throw new Error(`${dir}: no games/*.json`);
  const games = files.map((f) => validateGame(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), path.join(dir, f)));
  for (const g of games) {
    for (const s of g.screenshots) need(fs.existsSync(path.join(dir, s.src)), `${g.id}.json`, `screenshot ${s.src} not found under ${dir}`);
  }
  return games;
}

export const diskUrl = (g) => `https://github.com/${g.disk.repo}/releases/download/${encodeURIComponent(g.disk.tag)}/${encodeURIComponent(g.disk.asset)}`;

// The pinned release asset, cached by hash. A download whose SHA-256 differs
// from the data file stops the build: a game changes only when its JSON does.
export async function fetchDisk(g, cacheDir) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const cached = path.join(cacheDir, `${g.disk.sha256}.atr`);
  if (fs.existsSync(cached) && sha256(fs.readFileSync(cached)) === g.disk.sha256) return fs.readFileSync(cached);
  const url = diskUrl(g);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${g.id}: ${url}: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const got = sha256(bytes);
  if (got !== g.disk.sha256) {
    throw new Error(`${g.id}: SHA-256 mismatch for ${g.disk.repo} ${g.disk.tag} ${g.disk.asset}: got ${got}, games/${g.id}.json pins ${g.disk.sha256}`);
  }
  fs.writeFileSync(cached, bytes);
  return bytes;
}
