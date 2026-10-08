// Prototype P3 candidate check: Sfotty Pie's @sfotty-pie/a8 core, headless in
// Node, built from source at a pinned commit (the npm 0.3.0 release predates
// its real-SIO support and stops at START GAME with NO DRIVE).
//
//   node spike/scripts/p3-sfotty-run.mjs [path to packages/a8/dist/index.js]
//
// Runs the reference scenario (spike/scripts/lib/scenario.mjs) with the same
// script language as the atari800 harness, AltirraOS 3.49, BASIC off (OPTION
// held through boot), PAL 800XL. Output: spike/results/p3-sfotty-pie/node/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PNG } from "pngjs";
import { ATR_HEADER, SECTOR, scenario } from "./lib/scenario.mjs";

const spike = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = process.argv[2] ?? path.join(spike, ".cache", "sfotty-pie", "packages", "a8", "dist", "index.js");
const A8 = await import(pathToFileURL(dist).href);
const out = path.join(spike, "results", "p3-sfotty-pie", process.env.VS65_OWN_PALETTE ? "node-own-palette" : "node");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "boss"), { recursive: true });

const os = new Uint8Array(fs.readFileSync(path.join(spike, "vendor", "roms", "ATARIXL.ROM")));
const basic = new Uint8Array(fs.readFileSync(path.join(spike, "vendor", "roms", "ATARIBAS.ROM")));
const release = new Uint8Array(fs.readFileSync(path.join(spike, "assets", "void-strike-65.atr")));
const machine = new A8.Atari({ os, basic, xl: true, tvSystem: "pal" });
const disk = new A8.AtrImage(release.slice());
machine.insertDisk(disk);
const joy = new A8.Joystick(machine.joysticks[0]);
// Render through atari800's PAL palette when it is available, so pixels can
// be compared with the reference; the emulators' own palettes differ.
const refPalette = path.join(spike, "results", "reference", "altirra-basic-off", "atari800-pal.palette");
const ownPalette = A8.paletteFor("pal");
const palette = process.env.VS65_OWN_PALETTE || !fs.existsSync(refPalette)
  ? ownPalette
  : (() => {
      const rgb = fs.readFileSync(refPalette);
      return Uint32Array.from({ length: 256 }, (_, i) => rgb[i * 3] | (rgb[i * 3 + 1] << 8) | (rgb[i * 3 + 2] << 16) | 0xff000000);
    })();
const W = A8.FRAME_BUFFER_WIDTH;
const ag = machine.anticGtia;
const peek = (a) => machine.mmu.read(a & 0xffff, A8.PEEK ?? 1);
const poke = (a, v) => machine.mmu.write(a & 0xffff, v & 0xff, 0);

let frame = 0;
let lastFrame = new Uint8Array(machine.frame.length);
const log = [];
const say = (s) => { log.push(`${frame} ${s}`); };
const script = { joy: 0, fire: 0, holds: new Map(), sweep: 0, sweepExtra: 0, hunt: null, shotEvery: 0, shotPrefix: "", shotCount: 0, option: 0, start: 0 };
const DIRS = { c: 0, u: 1, d: 2, l: 4, r: 8, ul: 5, ur: 9, dl: 6, dr: 10 };

function applyInput() {
  for (const [a, v] of script.holds) poke(a, v);
  let j = script.joy;
  let t = script.fire;
  if (script.hunt) {
    const h = script.hunt;
    const x = peek(h.addr);
    if (h.dwell > 0) {
      j = script.sweepExtra;
      if (--h.dwell === 0) { h.step += 1; h.target = h.min + ((h.step * 37 + ((h.step * h.step) % 11)) % (h.max - h.min + 1)); }
    } else if (x < h.target - 2) j = 8 | script.sweepExtra;
    else if (x > h.target + 2) j = 4 | script.sweepExtra;
    else { j = script.sweepExtra; h.dwell = h.dwellFrames; }
    t = (frame >> 2) & 1;
  } else if (script.sweep > 0) {
    j = ((((frame / script.sweep) | 0) & 1) ? 8 : 4) | script.sweepExtra;
    t = (frame >> 2) & 1;
  }
  joy.direction = j;
  joy.trigger = Boolean(t);
  machine.console.option = Boolean(script.option);
  machine.console.start = Boolean(script.start);
}

// One frame: scanlines until vcount wraps to 0 (as apps/a8-web does).
function step() {
  applyInput();
  for (let guard = 0; guard < 400; guard += 1) {
    for (let c = 0; c < A8.CYCLES_PER_LINE; c += 1) {
      try { machine.cycle(); } catch { machine.cycle(); }
    }
    if (ag.vcount === 0) break;
  }
  lastFrame.set(machine.frame);
  frame += 1;
  if (script.shotEvery && frame % script.shotEvery === 0) shot(`${script.shotPrefix}${String(++script.shotCount).padStart(4, "0")}`);
}

// The 376-wide buffer starts 4 colour clocks left of atari800's 384: crop to
// atari800's 336-column view (x 24..359 there) for side-by-side comparison.
function shot(name) {
  const height = lastFrame.length / W;
  const top = height > 240 ? 8 : 0; // PAL buffer: rows 8..247 = atari800's 240
  const x0 = 20;
  const png = new PNG({ width: 336, height: 240 });
  for (let y = 0; y < 240; y += 1) {
    for (let x = 0; x < 336; x += 1) {
      const v = palette[lastFrame[(y + top) * W + x + x0]];
      const i = (y * 336 + x) * 4;
      png.data[i] = v & 255; png.data[i + 1] = (v >> 8) & 255; png.data[i + 2] = (v >> 16) & 255; png.data[i + 3] = 255;
    }
  }
  fs.writeFileSync(path.join(out, `${name}.png`), PNG.sync.write(png));
}

function run(text) {
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [cmd, a, b, c, d, e] = line.split(/\s+/);
    const num = Number;
    if (cmd === "frames") for (let i = 0; i < num(a); i += 1) step();
    else if (cmd === "joy") script.joy = DIRS[a];
    else if (cmd === "fire") script.fire = num(a);
    else if (cmd === "option" || cmd === "start") script[cmd] = num(a);
    else if (cmd === "reset") { machine.console.reset = true; step(); machine.console.reset = false; say("reset"); }
    else if (cmd === "coldstart") { machine.console.powerCycle(); say("coldstart"); }
    else if (cmd === "shot") shot(a);
    else if (cmd === "shotevery") { script.shotEvery = num(a); script.shotPrefix = b ?? ""; script.shotCount = 0; }
    else if (cmd === "hold") script.holds.set(num(a) & 0xffff, num(b));
    else if (cmd === "unhold") script.holds.delete(num(a) & 0xffff);
    else if (cmd === "until" || cmd === "untilne") {
      const want = num(b);
      const ok = () => (peek(num(a)) === want) === (cmd === "until");
      let i = 0;
      while (i < num(c) && !ok()) { step(); i += 1; }
      if (!ok()) { shot("timeout"); throw new Error(`TIMEOUT at frame ${frame}: ${line}`); }
    } else if (cmd === "untildl") {
      // atari800's ANTIC_dlist at frame end is the display list's start
      // (the JVB target); Sfotty Pie exposes the address ANTIC fetches next.
      const want = num(a) & 0xffff;
      let i = 0;
      const ok = () => ag.displayListAddress === want || ag.lastDisplayListAddress === want;
      while (i < num(b) && !ok()) { step(); i += 1; }
      if (!ok()) { shot("timeout"); throw new Error(`TIMEOUT at frame ${frame}: ${line} (dl ${ag.displayListAddress.toString(16)})`); }
    } else if (cmd === "sweep") { script.sweep = num(a); script.sweepExtra = b ? DIRS[b] : 0; }
    else if (cmd === "hunt") {
      if (a === "off") { script.hunt = null; script.sweepExtra = 0; }
      else { script.sweep = 0; script.sweepExtra = e ? DIRS[e] : 0; script.hunt = { addr: num(a) & 0xffff, min: num(b), max: num(c), dwellFrames: num(d), dwell: 0, step: 0, target: num(b) }; }
    } else if (cmd === "mark") say(`mark ${a}`);
    else if (["watch", "watchdl", "wav", "wavstop", "peek", "key", "select"].includes(cmd)) { /* not needed here */ }
    else throw new Error(`unknown command ${cmd}`);
  }
}

const t0 = Date.now();
let error = null;
try {
  // BASIC off as on the reference run: hold OPTION through the OS boot.
  script.option = 1;
  run("frames 150");
  script.option = 0;
  run(scenario());
} catch (err) {
  error = String(err.message ?? err);
}
const sector = (bytes, n) => Buffer.from(bytes.subarray(ATR_HEADER + (n - 1) * SECTOR, ATR_HEADER + n * SECTOR));
const after = disk.toBytes();
const changed = [];
for (let n = 1; n <= 720; n += 1) if (!sector(release, n).equals(sector(after, n))) changed.push(n);
const marks = Object.fromEntries(log.filter((l) => / mark /.test(l)).map((l) => { const [f, , m] = l.split(" "); return [m, Number(f)]; }));
const summary = { emulator: `Sfotty Pie @sfotty-pie/a8 from ${dist}`, frames: frame, hostMs: Date.now() - t0, error, marks, changedSectors: changed, sector599: sector(after, 599).toString("hex").slice(0, 16) };
fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
fs.writeFileSync(path.join(out, "run.log"), log.join("\n") + "\n");
console.log(JSON.stringify(summary));
