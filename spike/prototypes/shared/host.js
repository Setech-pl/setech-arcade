// The emulator-agnostic page host shared by the prototypes: picture, input
// (keyboard, gamepad, touch), audio, 50 Hz pacing, best-score persistence in
// IndexedDB, and an automation surface (window.vs) that runs the harness
// script language for Playwright.
//
// A core adapter (see ../atari800-wasm/core.js, ../sfotty-pie/core.js) is
//   createCore({ atr: Uint8Array, basic: boolean }) -> {
//     name, audioRate,
//     view: { width, height }, screen(): Uint32Array RGBA (view-sized),
//     frame({ joy, trig, keycode, consoleKeys, reset }),   one PAL frame
//     takeAudio(): Float32Array (mono, this frame's samples),
//     peek(addr), poke(addr, v), dlist(), coldstart(),
//     diskWrites(): number, diskBytes(): Uint8Array }
//
// Query parameters: ?atr=<url> ?basic=1 ?manual=1 (no real-time loop) ?fresh=1
const params = new URLSearchParams(location.search);
const MANUAL = params.has("manual");
const GAME_ID = "void-strike-65";

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- persistence: the whole written disk, per game and ATR identity --------
function idb() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("setech-arcade", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("disks");
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}
async function idbOp(mode, fn) {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const tx = db.transaction("disks", mode);
      const req = fn(tx.objectStore("disks"));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => resolve(undefined);
    });
  } catch { return undefined; } // private mode: the score lives until the tab closes
}

export async function startHost(createCore, { defaultAtr }) {
  const atrUrl = params.get("atr") ?? defaultAtr;
  const t0 = performance.now();
  const release = new Uint8Array(await (await fetch(atrUrl)).arrayBuffer());
  const saveKey = `${GAME_ID}:${await sha256(release)}`;
  const saved = params.has("fresh") ? undefined : await idbOp("readonly", (s) => s.get(saveKey));
  const core = await createCore({ atr: saved ?? release, basic: params.get("basic") === "1" });
  const loadMs = performance.now() - t0;

  const canvas = document.getElementById("screen");
  const ctx = canvas.getContext("2d", { alpha: false });
  canvas.width = core.view.width;
  canvas.height = core.view.height;
  const image = ctx.createImageData(core.view.width, core.view.height);
  const pixels = new Uint32Array(image.data.buffer);
  const render = () => { pixels.set(core.screen()); ctx.putImageData(image, 0, 0); };

  // ---- input ----
  const keys = new Set();
  const touch = { joy: 0, fire: 0 };
  const JOY = { ArrowUp: 1, KeyW: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 4, KeyA: 4, ArrowRight: 8, KeyD: 8 };
  const FIRE = ["KeyZ", "KeyX", "ControlLeft", "ControlRight", "AltLeft", "ShiftLeft"];
  const AKEY_SPACE = 0x21;
  const AKEY_ESCAPE = 0x1c;
  let resetPending = false;
  addEventListener("keydown", (e) => {
    if (e.code === "F5" && !e.ctrlKey && !e.metaKey) { resetPending = true; e.preventDefault(); return; }
    if (e.code in JOY || FIRE.includes(e.code) || e.code === "Space" || /^F[234]$/.test(e.code)) e.preventDefault();
    keys.add(e.code);
  });
  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("blur", () => keys.clear());
  function liveInput() {
    let joy = 0;
    let trig = 0;
    for (const k of keys) { if (k in JOY) joy |= JOY[k]; if (FIRE.includes(k)) trig = 1; }
    let keycode = keys.has("Space") ? AKEY_SPACE : keys.has("Escape") ? AKEY_ESCAPE : 0;
    const consoleKeys = (keys.has("F4") ? 1 : 0) | (keys.has("F3") ? 2 : 0) | (keys.has("F2") ? 4 : 0);
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue;
      const b = (i) => pad.buttons[i]?.pressed;
      const [ax = 0, ay = 0] = pad.axes;
      if (b(12) || ay < -0.5) joy |= 1;
      if (b(13) || ay > 0.5) joy |= 2;
      if (b(14) || ax < -0.5) joy |= 4;
      if (b(15) || ax > 0.5) joy |= 8;
      if (b(0) || b(1) || b(2) || b(3)) trig = 1;
      if (b(9)) keycode = AKEY_SPACE; // Start: pause
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
    el.addEventListener("pointerdown", (e) => { touch.joy |= bit; e.preventDefault(); });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) el.addEventListener(ev, () => { touch.joy &= ~bit; });
  }
  const fireButton = document.getElementById("touch-fire");
  fireButton?.addEventListener("pointerdown", (e) => { touch.fire = 1; e.preventDefault(); });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) fireButton?.addEventListener(ev, () => { touch.fire = 0; });

  // ---- audio ----
  let audio;
  let audioNode;
  const audioStats = { underruns: 0, dropped: 0, bufferedMs: 0 };
  async function startAudio() {
    audio = new AudioContext({ sampleRate: core.audioRate, latencyHint: "interactive" });
    await audio.audioWorklet.addModule(new URL("./audio-worklet.js", import.meta.url));
    audioNode = new AudioWorkletNode(audio, "vs-fifo", { outputChannelCount: [2] });
    audioNode.port.onmessage = (e) => Object.assign(audioStats, e.data);
    audioNode.connect(audio.destination);
  }

  // ---- stepping and saving ----
  let frame = 0;
  let lastWrites = 0;
  let saveTimer = 0;
  const vs = {};
  async function persistDisk() {
    await idbOp("readwrite", (s) => s.put(core.diskBytes(), saveKey));
    vs.savedAtFrame = frame;
  }
  function step(input) {
    core.frame(input);
    frame += 1;
    const samples = core.takeAudio();
    if (vs.audioTap) vs.audioTap.push(samples.slice()); // measurement: Playwright reads it
    if (audioNode && samples.length) audioNode.port.postMessage(samples, [samples.buffer]);
    const writes = core.diskWrites();
    if (writes !== lastWrites) {
      lastWrites = writes;
      clearTimeout(saveTimer); // a save is several sector writes: persist once it settles
      saveTimer = setTimeout(persistDisk, MANUAL ? 0 : 500);
    }
  }

  // ---- real time: PAL emulation on whatever the display refreshes at -------
  // A PAL frame is 312 lines x 114 cycles at 1.773447 MHz: 49.86 Hz. Stepping
  // at a flat 50 Hz would make the cores produce audio 0.28% faster than it
  // plays (latency creeps up, then a chunk is dropped about every minute).
  const FRAME_MS = 1000 / (1773447 / (312 * 114));
  let acc = 0;
  let last = 0;
  let running = false;
  const pacing = { frames: 0, rafs: 0, behind: 0, stepMsMax: 0, stepMsTotal: 0 };
  function tick(now) {
    if (!running) return;
    acc += Math.min(100, now - (last || now));
    last = now;
    pacing.rafs += 1;
    let n = 0;
    while (acc >= FRAME_MS && n < 4) {
      const s = performance.now();
      step(liveInput());
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
  async function start() {
    document.getElementById("start").hidden = true;
    if (MANUAL) return;
    await startAudio();
    running = true;
    requestAnimationFrame(tick);
  }
  document.getElementById("start").addEventListener("click", start);
  document.getElementById("fullscreen")?.addEventListener("click", () => document.getElementById("stage").requestFullscreen?.());
  document.getElementById("reset-score")?.addEventListener("click", async () => {
    if (!confirm("Forget the saved best score and restart the game?")) return;
    await idbOp("readwrite", (s) => s.delete(saveKey));
    location.search = "?fresh=1";
  });

  // ---- automation: the harness script language (spike/harness/vs65-harness.c)
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
      else if (cmd === "shot") { render(); shots[a] = canvas.toDataURL("image/png"); }
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
      else if (["watch", "watchdl", "wav", "wavstop", "shotevery", "peek", "palette"].includes(cmd)) { /* native-only */ }
      else throw new Error(`unknown command ${cmd}`);
    }
    render();
    return { frame, marks, shots };
  }

  // defineProperties, not Object.assign: assign would freeze the getters.
  Object.defineProperties(vs, Object.getOwnPropertyDescriptors({
    ready: true,
    core: core.name,
    loadMs,
    restoredFromSave: Boolean(saved),
    get frame() { return frame; },
    get pacing() { return { ...pacing }; },
    get audio() { return { ...audioStats, state: audio?.state, rate: core.audioRate }; },
    peek: (addr) => core.peek(addr),
    runScript,
    start,
    persistDisk,
    diskSector: (n) => [...core.diskBytes().subarray(16 + (n - 1) * 128, 16 + n * 128)],
  }));
  window.vs = vs;
  document.getElementById("status").textContent = `${core.name} · AltirraOS 3.49 · ready in ${loadMs.toFixed(0)} ms${saved ? " · saved disk restored" : ""}`;
  render();
  return vs;
}
