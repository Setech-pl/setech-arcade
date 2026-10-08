// Core adapter for prototype P1: atari800 7.2.1 (libatari800) compiled to
// WebAssembly by spike/scripts/build-wasm.sh; AltirraOS is built in.
import createAtari800 from "./atari800.js";

const W = 384;
const H = 240;
// atari800's default visible PAL area: 336 of the 384 columns, 240 lines.
const VIEW_X = 24;
const VIEW_W = 336;

export async function createCore({ atr, basic }) {
  const mod = await createAtari800({ locateFile: (f) => new URL(f, import.meta.url).href });
  mod.FS.writeFile("/atari800.cfg", "");
  mod.FS.writeFile("/d1.atr", atr);
  if (!mod._vs_init(basic ? 1 : 0)) throw new Error("atari800 init failed");

  const palette = new Uint32Array(256);
  const table = mod.HEAP32.subarray(mod._vs_palette() >> 2, (mod._vs_palette() >> 2) + 256);
  for (let i = 0; i < 256; i += 1) {
    const rgb = table[i];
    palette[i] = 0xff000000 | ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff);
  }
  const out = new Uint32Array(VIEW_W * H);
  const mem = () => mod.HEAPU8.subarray(mod._vs_memory(), mod._vs_memory() + 0x10000);

  return {
    name: "atari800 7.2.1 (WASM)",
    audioRate: mod._vs_sound_rate(),
    view: { width: VIEW_W, height: H },
    screen() {
      const screen = mod.HEAPU8.subarray(mod._vs_screen(), mod._vs_screen() + W * H);
      for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < VIEW_W; x += 1) out[y * VIEW_W + x] = palette[screen[y * W + VIEW_X + x]];
      }
      return out;
    },
    frame({ joy, trig, keycode, consoleKeys, reset }) {
      const err = mod._vs_frame(joy, trig, keycode, consoleKeys, reset ? 2 : 0);
      if (err) console.warn("atari800 error", err);
    },
    takeAudio() {
      const len = mod._vs_sound_len();
      const channels = mod._vs_sound_channels();
      const size = mod._vs_sound_sample_size();
      const ptr = mod._vs_sound();
      const frames = len / (channels * size);
      const samples = new Float32Array(frames);
      if (size === 2) {
        const s16 = new Int16Array(mod.HEAPU8.buffer, ptr, len / 2);
        for (let i = 0; i < frames; i += 1) {
          let v = 0;
          for (let c = 0; c < channels; c += 1) v += s16[i * channels + c];
          samples[i] = v / (32768 * channels);
        }
      } else {
        const u8 = mod.HEAPU8.subarray(ptr, ptr + len);
        for (let i = 0; i < frames; i += 1) samples[i] = (u8[i * channels] - 128) / 128;
      }
      return samples;
    },
    peek: (addr) => mem()[addr & 0xffff],
    poke: (addr, v) => { mem()[addr & 0xffff] = v; },
    dlist: () => mod._vs_dlist(),
    coldstart: () => mod._vs_coldstart(),
    diskWrites: () => mod._vs_disk_writes(),
    diskBytes() { mod._vs_flush(); return mod.FS.readFile("/d1.atr"); },
  };
}
