// Core adapter for prototype P3: Sfotty Pie's @sfotty-pie/a8 (MIT, pure
// TypeScript), built from source at a pinned commit and bundled by
// spike/scripts/build-sfotty.sh into ./a8.bundle.js. ROMs: AltirraOS 3.49
// and Altirra BASIC 1.59 from spike/vendor/roms (extract-altirra-roms.mjs).
import * as A8 from "./a8.bundle.js";

const ROMS = new URL("../../vendor/roms/", import.meta.url);
const VIEW_W = 336;
const VIEW_H = 240;
const X0 = 20; // 376-wide buffer -> atari800's 336-column view
const Y0 = 8; // PAL rows 8..247, as atari800's 240 lines

export async function createCore({ atr, basic }) {
  const [os, basicRom] = await Promise.all(["ATARIXL.ROM", "ATARIBAS.ROM"].map(
    async (f) => new Uint8Array(await (await fetch(new URL(f, ROMS))).arrayBuffer())));
  const machine = new A8.Atari({ os, basic: basicRom, xl: true, tvSystem: "pal" });
  const disk = new A8.AtrImage(atr.slice());
  machine.insertDisk(disk);
  const joy = new A8.Joystick(machine.joysticks[0]);
  const ag = machine.anticGtia;
  const W = A8.FRAME_BUFFER_WIDTH;
  // ?palette=<768-byte RGB file>: measurement only, to compare pixels with
  // atari800 (the two emulators' PAL palettes differ).
  let palette = A8.paletteFor("pal");
  const palUrl = new URLSearchParams(location.search).get("palette");
  if (palUrl) {
    const rgb = new Uint8Array(await (await fetch(palUrl)).arrayBuffer());
    palette = Uint32Array.from({ length: 256 }, (_, i) => 0xff000000 | rgb[i * 3] | (rgb[i * 3 + 1] << 8) | (rgb[i * 3 + 2] << 16));
  }
  let finished = new Uint8Array(machine.frame.length);
  const out = new Uint32Array(VIEW_W * VIEW_H);

  // BASIC off = OPTION held through the OS boot, as on the real machine.
  let optionHoldFrames = basic ? 0 : 150;

  // Audio: the summed level (0..2) per machine cycle, box-averaged down to
  // 44.1 kHz and DC-blocked. Cheaper than a8-web's 16th-order anti-alias
  // filter; good enough to judge timing, not final quality.
  const audioRate = 44100;
  const cyclesPerSample = A8.PAL_CYCLES_PER_SECOND / audioRate;
  let phase = 0;
  let sum = 0;
  let count = 0;
  let dcIn = 0;
  let dcOut = 0;
  let pending = [];

  let writes = 0;
  const writeSector = disk.writeSector.bind(disk);
  disk.writeSector = (n, data) => { writes += 1; return writeSector(n, data); };

  function cycle() {
    try { machine.cycle(); } catch { machine.cycle(); }
    sum += machine.audio;
    count += 1;
    if (++phase >= cyclesPerSample) {
      phase -= cyclesPerSample;
      const v = (sum / count) * 0.25;
      sum = 0;
      count = 0;
      dcOut = v - dcIn + 0.995 * dcOut;
      dcIn = v;
      pending.push(dcOut);
    }
  }

  return {
    name: "Sfotty Pie (a8, main@7eda66e)",
    audioRate,
    view: { width: VIEW_W, height: VIEW_H },
    screen() {
      for (let y = 0; y < VIEW_H; y += 1) {
        for (let x = 0; x < VIEW_W; x += 1) out[y * VIEW_W + x] = palette[finished[(y + Y0) * W + x + X0]];
      }
      return out;
    },
    frame({ joy: dir, trig, keycode, consoleKeys, reset }) {
      joy.direction = dir;
      joy.trigger = Boolean(trig);
      machine.console.start = Boolean(consoleKeys & 1);
      machine.console.select = Boolean(consoleKeys & 2);
      machine.console.option = Boolean(consoleKeys & 4) || optionHoldFrames > 0;
      if (optionHoldFrames > 0) optionHoldFrames -= 1;
      machine.console.reset = Boolean(reset);
      if (keycode) machine.keyboard.pressKey(keycode); else machine.keyboard.releaseAll();
      for (let guard = 0; guard < 400; guard += 1) {
        for (let c = 0; c < A8.CYCLES_PER_LINE; c += 1) cycle();
        if (ag.vcount === 0) break;
      }
      machine.console.reset = false;
      finished.set(machine.frame);
    },
    takeAudio() {
      const samples = Float32Array.from(pending);
      pending = [];
      return samples;
    },
    peek: (addr) => machine.mmu.read(addr & 0xffff, 1),
    poke: (addr, v) => machine.mmu.write(addr & 0xffff, v & 0xff, 0),
    dlist: () => ag.displayListAddress,
    coldstart() { machine.console.powerCycle(); optionHoldFrames = basic ? 0 : 150; },
    diskWrites: () => writes,
    diskBytes: () => disk.toBytes(),
  };
}
