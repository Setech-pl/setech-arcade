// The play page: one game, one emulator core, everything around it -
// picture, keyboard / gamepad / touch input, audio, PAL pacing, the best
// score kept in IndexedDB, and a small automation surface for the tests.
//
// The page embeds its game's data as <script type="application/json"
// id="game-data">; the build writes it from games/<id>.json.
//
// Query parameters (tests): ?manual=1 - no real-time loop, frames are stepped
// through window.arcade.runScript(); ?fresh=1 - ignore the saved disk.
import { createCore, PAL_FRAME_RATE } from "./atari800-core.js";

const params = new URLSearchParams(location.search);
const MANUAL = params.has("manual");
const game = JSON.parse(document.getElementById("game-data").textContent);
const $ = (id) => document.getElementById(id);

const ui = {
  player: $("player"),
  stage: $("stage"),
  canvas: $("screen"),
  start: $("start"),
  status: $("status"),
  saveStatus: $("save-status"),
  fullscreen: $("fullscreen"),
  resetScore: $("reset-score"),
  fire: $("touch-fire"),
};

// A note for Safari users, shown above the controls when set. Empty while
// no Safari problem is known (docs/known-issues.md).
const SAFARI_NOTE = "";
const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
if (SAFARI_NOTE && isSafari) {
  $("safari-note").textContent = `Safari: ${SAFARI_NOTE}; for the best experience use Chrome or Firefox.`;
  $("safari-note").hidden = false;
}

function say(text) {
  ui.status.textContent = text;
}

// ---- the best score: the whole written disk, per game and ATR hash --------
const SAVE_KEY = `${game.id}:${game.disk.sha256}`;
function db() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("setech-arcade", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("disks");
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}
async function store(mode, fn) {
  try {
    const d = await db();
    return await new Promise((resolve) => {
      const tx = d.transaction("disks", mode);
      const req = fn(tx.objectStore("disks"));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => resolve(undefined);
      tx.onabort = () => resolve(undefined);
    });
  } catch {
    return undefined; // no storage (private mode): the score lasts until the tab closes
  }
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- boot -------------------------------------------------------------------
say("Loading…");
const t0 = performance.now();
const diskUrl = new URL(document.getElementById("player").dataset.disk, location.href);
const release = new Uint8Array(await (await fetch(diskUrl)).arrayBuffer());
if ((await sha256(release)) !== game.disk.sha256) {
  say("The game disk did not load correctly. Reload the page to try again.");
  throw new Error("disk hash mismatch");
}
const saved = game.saves === "disk" && !params.has("fresh") ? await store("readonly", (s) => s.get(SAVE_KEY)) : undefined;
const core = await createCore({ disk: saved ?? release, basic: game.machine.basic });
const loadMs = performance.now() - t0;

const ctx = ui.canvas.getContext("2d", { alpha: false });
ui.canvas.width = core.view.width;
ui.canvas.height = core.view.height;
const image = ctx.createImageData(core.view.width, core.view.height);
const pixels = new Uint32Array(image.data.buffer);
function render() {
  pixels.set(core.screen());
  ctx.putImageData(image, 0, 0);
}

// ---- integer scaling, in device pixels ---------------------------------------
function fit() {
  const dpr = window.devicePixelRatio || 1;
  const box = ui.stage.getBoundingClientRect();
  const fullscreen = document.fullscreenElement === ui.player;
  const availW = box.width;
  const availH = fullscreen ? box.height : Math.max(240, window.innerHeight * 0.8);
  const k = Math.max(1, Math.floor(Math.min((availW * dpr) / core.view.width, (availH * dpr) / core.view.height)));
  ui.canvas.style.width = `${(core.view.width * k) / dpr}px`;
  ui.canvas.style.height = `${(core.view.height * k) / dpr}px`;
}
new ResizeObserver(fit).observe(ui.stage);
addEventListener("resize", fit);
document.addEventListener("fullscreenchange", fit);
fit();

// ---- input -----------------------------------------------------------------
// Game keys are taken only while the game screen has focus, so Tab, Space and
// Enter keep working on the page's buttons and links.
const keys = new Set();
const touch = { joy: 0, fire: 0 };
const JOY = { ArrowUp: 1, KeyW: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 4, KeyA: 4, ArrowRight: 8, KeyD: 8 };
const FIRE = ["KeyZ", "KeyX", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight"];
const AKEY = { Space: 0x21, Enter: 0x0c };
const CONSOLE = { F4: 1, F3: 2, F2: 4 };
let resetPending = false;
const gameKey = (code) => code in JOY || FIRE.includes(code) || code in AKEY || code in CONSOLE || code === "F5";
ui.stage.addEventListener("keydown", (e) => {
  // Only keys aimed at the game screen itself: Enter or Space on the start
  // button inside it must still press the button.
  if (e.target !== ui.stage) return;
  if (!gameKey(e.code) || e.metaKey || (e.ctrlKey && !FIRE.includes(e.code))) return;
  e.preventDefault();
  if (e.code === "F5") resetPending = true;
  else keys.add(e.code);
});
ui.stage.addEventListener("keyup", (e) => { if (e.target === ui.stage) keys.delete(e.code); });
ui.stage.addEventListener("blur", () => keys.clear());
addEventListener("blur", () => keys.clear());

function readInput() {
  let joy = 0;
  let trig = 0;
  let keycode = 0;
  let consoleKeys = 0;
  for (const k of keys) {
    if (k in JOY) joy |= JOY[k];
    if (FIRE.includes(k)) trig = 1;
    if (k in AKEY) keycode = AKEY[k];
    if (k in CONSOLE) consoleKeys |= CONSOLE[k];
  }
  for (const pad of navigator.getGamepads?.() ?? []) {
    if (!pad) continue;
    const b = (i) => pad.buttons[i]?.pressed;
    const [ax = 0, ay = 0] = pad.axes;
    if (b(12) || ay < -0.5) joy |= 1;
    if (b(13) || ay > 0.5) joy |= 2;
    if (b(14) || ax < -0.5) joy |= 4;
    if (b(15) || ax > 0.5) joy |= 8;
    if (b(0) || b(1) || b(2) || b(3)) trig = 1;
    if (b(9)) keycode = AKEY.Space; // Start: pause
  }
  joy |= touch.joy;
  trig |= touch.fire;
  if ((joy & 3) === 3) joy &= ~3; // opposite directions cancel, as on a stick
  if ((joy & 12) === 12) joy &= ~12;
  const reset = resetPending;
  resetPending = false;
  return { joy, trig, keycode, consoleKeys, reset };
}

for (const el of document.querySelectorAll("[data-joy]")) {
  const bit = Number(el.dataset.joy);
  el.addEventListener("pointerdown", (e) => { touch.joy |= bit; el.setPointerCapture?.(e.pointerId); e.preventDefault(); });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(ev, () => { touch.joy &= ~bit; });
}
ui.fire.addEventListener("pointerdown", (e) => { touch.fire = 1; ui.fire.setPointerCapture?.(e.pointerId); e.preventDefault(); });
for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) ui.fire.addEventListener(ev, () => { touch.fire = 0; });
for (const el of document.querySelectorAll(".touch button")) el.addEventListener("contextmenu", (e) => e.preventDefault());

// ---- audio ------------------------------------------------------------------
let audio;
let audioNode;
const audioStats = { underruns: 0, dropped: 0, bufferedMs: 0 };
async function startAudio() {
  // The context runs at the emulator's rate (44.1 kHz), so samples go out
  // unconverted; every current browser accepts a sampleRate here.
  audio = new AudioContext({ sampleRate: core.audioRate, latencyHint: "interactive" });
  await audio.audioWorklet.addModule(new URL("./audio-worklet.js", import.meta.url));
  audioNode = new AudioWorkletNode(audio, "arcade-fifo", { outputChannelCount: [2] });
  audioNode.port.onmessage = (e) => Object.assign(audioStats, e.data);
  audioNode.connect(audio.destination);
  if (audio.state !== "running") await audio.resume();
}

// ---- stepping and saving ----------------------------------------------------
let frame = 0;
let lastWrites = 0;
let saveTimer = 0;
const arcade = { savedAtFrame: null, audioTap: null };
async function persistDisk() {
  if (game.saves !== "disk") return;
  await store("readwrite", (s) => s.put(core.diskBytes(), SAVE_KEY));
  arcade.savedAtFrame = frame;
  ui.saveStatus.textContent = "Best score saved in this browser.";
}
function step(input) {
  core.frame(input);
  frame += 1;
  const samples = core.takeAudio();
  if (arcade.audioTap) arcade.audioTap.push(samples.slice());
  if (audioNode && samples.length) audioNode.port.postMessage(samples, [samples.buffer]);
  const writes = core.diskWrites();
  if (writes !== lastWrites) {
    lastWrites = writes;
    clearTimeout(saveTimer); // a save is several sector writes: persist once they settle
    saveTimer = setTimeout(persistDisk, MANUAL ? 0 : 500);
  }
}

// ---- real time: PAL frames on whatever the display refreshes at -------------
const FRAME_MS = 1000 / PAL_FRAME_RATE;
let acc = 0;
let last = 0;
let running = false;
let started = false;
const pacing = { frames: 0, rafs: 0, behind: 0, stepMsMax: 0, stepMsTotal: 0 };
function tick(now) {
  if (!running) return;
  acc += Math.min(100, now - (last || now));
  last = now;
  pacing.rafs += 1;
  let n = 0;
  while (acc >= FRAME_MS && n < 4) {
    const s = performance.now();
    step(readInput());
    const ms = performance.now() - s;
    pacing.stepMsTotal += ms;
    pacing.stepMsMax = Math.max(pacing.stepMsMax, ms);
    acc -= FRAME_MS;
    n += 1;
    pacing.frames += 1;
  }
  if (acc >= FRAME_MS) { pacing.behind += 1; acc = 0; }
  if (n) render();
  requestAnimationFrame(tick);
}
function resume() {
  if (running || !started) return;
  running = true;
  last = 0;
  acc = 0;
  audio?.resume();
  requestAnimationFrame(tick);
}
function pause() {
  running = false;
  keys.clear();
  audio?.suspend();
  audioNode?.port.postMessage("flush");
}
document.addEventListener("visibilitychange", () => (document.hidden ? pause() : resume()));

async function start() {
  if (started) return;
  started = true;
  ui.start.hidden = true;
  ui.stage.focus();
  if (MANUAL) return;
  try {
    await startAudio();
  } catch {
    say("Sound could not start in this browser; the game runs without it.");
  }
  running = true;
  requestAnimationFrame(tick);
  say(`Playing. ${saved ? "Your saved disk was restored." : ""}`.trim());
}
ui.start.addEventListener("click", start);
ui.fullscreen.addEventListener("click", async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await ui.player.requestFullscreen?.().catch(() => {});
  ui.stage.focus();
});
if (!document.fullscreenEnabled) ui.fullscreen.hidden = true;
ui.resetScore.hidden = game.saves !== "disk";
ui.resetScore.addEventListener("click", async () => {
  if (!confirm("Forget the best score saved in this browser and restart the game?")) return;
  clearTimeout(saveTimer);
  running = false;
  await store("readwrite", (s) => s.delete(SAVE_KEY));
  const url = new URL(location.href);
  url.searchParams.delete("fresh");
  location.replace(url);
});

// ---- automation for the tests: the spike's harness script language ---------
const script = { joy: 0, fire: 0, start: 0, select: 0, option: 0, key: 0, holds: new Map(), sweep: 0, sweepExtra: 0, hunt: null };
const DIRS = { c: 0, u: 1, d: 2, l: 4, r: 8, ul: 5, ur: 9, dl: 6, dr: 10 };
function scriptedInput(reset = false) {
  for (const [a, v] of script.holds) core.poke(a, v);
  let joy = script.joy;
  let trig = script.fire;
  if (script.hunt) {
    const h = script.hunt;
    const x = core.peek(h.addr);
    if (h.dwell > 0) {
      joy = script.sweepExtra;
      if (--h.dwell === 0) { h.step += 1; h.target = h.min + ((h.step * 37 + ((h.step * h.step) % 11)) % (h.max - h.min + 1)); }
    } else if (x < h.target - 2) joy = 8 | script.sweepExtra;
    else if (x > h.target + 2) joy = 4 | script.sweepExtra;
    else { joy = script.sweepExtra; h.dwell = h.dwellFrames; }
    trig = (frame >> 2) & 1;
  } else if (script.sweep > 0) {
    joy = ((((frame / script.sweep) | 0) & 1) ? 8 : 4) | script.sweepExtra;
    trig = (frame >> 2) & 1;
  }
  return { joy, trig, keycode: script.key, consoleKeys: script.start | (script.select << 1) | (script.option << 2), reset };
}
function runScript(text) {
  const marks = {};
  const shots = {};
  const waitFor = (ok, limit, line) => {
    let i = 0;
    while (i < limit && !ok()) { step(scriptedInput()); i += 1; }
    if (!ok()) throw new Error(`TIMEOUT at frame ${frame}: ${line}`);
  };
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [cmd, a, b, c, d, e] = line.split(/\s+/);
    const num = Number;
    if (cmd === "frames") for (let i = 0; i < num(a); i += 1) step(scriptedInput());
    else if (cmd === "joy") script.joy = DIRS[a];
    else if (cmd === "fire") script.fire = num(a);
    else if (cmd === "start" || cmd === "select" || cmd === "option") script[cmd] = num(a);
    else if (cmd === "key") script.key = a === "none" ? 0 : parseInt(a, 16);
    else if (cmd === "reset") step(scriptedInput(true));
    else if (cmd === "coldstart") core.coldstart();
    else if (cmd === "shot") { render(); shots[a] = ui.canvas.toDataURL("image/png"); }
    else if (cmd === "hold") script.holds.set(num(a) & 0xffff, num(b));
    else if (cmd === "unhold") script.holds.delete(num(a) & 0xffff);
    else if (cmd === "poke") core.poke(num(a), num(b));
    else if (cmd === "until") waitFor(() => core.peek(num(a)) === num(b), num(c), line);
    else if (cmd === "untilne") waitFor(() => core.peek(num(a)) !== num(b), num(c), line);
    else if (cmd === "untildl") waitFor(() => core.dlist() === (num(a) & 0xffff), num(b), line);
    else if (cmd === "sweep") { script.sweep = num(a); script.sweepExtra = b ? DIRS[b] : 0; }
    else if (cmd === "hunt") {
      if (a === "off") { script.hunt = null; script.sweepExtra = 0; }
      else { script.sweep = 0; script.sweepExtra = e ? DIRS[e] : 0; script.hunt = { addr: num(a) & 0xffff, min: num(b), max: num(c), dwellFrames: num(d), dwell: 0, step: 0, target: num(b) }; }
    } else if (cmd === "mark") marks[a] = frame;
    else if (["watch", "watchdl", "wav", "wavstop", "shotevery", "peek", "palette"].includes(cmd)) { /* native harness only */ }
    else throw new Error(`unknown command ${cmd}`);
  }
  render();
  return { frame, marks, shots };
}

Object.defineProperties(arcade, Object.getOwnPropertyDescriptors({
  ready: true,
  game: game.id,
  core: core.name,
  loadMs,
  restoredFromSave: Boolean(saved),
  get frame() { return frame; },
  get running() { return running; },
  get pacing() { return { ...pacing }; },
  get audio() { return { ...audioStats, state: audio?.state ?? null, rate: audio?.sampleRate ?? core.audioRate }; },
  peek: (addr) => core.peek(addr),
  runScript,
  persistDisk,
  diskSector: (n) => [...core.diskBytes().subarray(16 + (n - 1) * 128, 16 + n * 128)],
}));
window.arcade = arcade;
render();
ui.start.disabled = false;
say(saved ? "Ready. Your saved disk is loaded." : "Ready.");
