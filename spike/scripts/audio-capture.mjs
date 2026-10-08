// Menu music, 10 s from the menu's first frame + 100, from each browser
// prototype (Chromium, manual stepping) next to the native atari800 WAV:
// spike/results/audio/*.flac (lossless, via ffmpeg) plus simple numbers (RMS, zero-crossing rate,
// correlation of the 20 ms loudness envelope with the native recording).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { serve } from "./serve.mjs";

const spike = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(spike, "results", "audio");
fs.mkdirSync(out, { recursive: true });

function readWav(file) {
  const b = fs.readFileSync(file);
  const channels = b.readUInt16LE(22);
  const rate = b.readUInt32LE(24);
  const bits = b.readUInt16LE(34);
  let off = 12;
  while (b.toString("ascii", off, off + 4) !== "data") off += 8 + b.readUInt32LE(off + 4);
  const len = b.readUInt32LE(off + 4);
  const data = b.subarray(off + 8, off + 8 + len);
  const n = len / (channels * bits / 8);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i += 1) s[i] = bits === 16 ? data.readInt16LE(i * channels * 2) / 32768 : (data[i * channels] - 128) / 128;
  return { rate, s };
}
function writeWav(file, s, rate) {
  const b = Buffer.alloc(44 + s.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + s.length * 2, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(s.length * 2, 40);
  for (let i = 0; i < s.length; i += 1) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, b);
}
function stats(s, rate) {
  let sum = 0; let mean = 0; let zc = 0;
  for (const v of s) mean += v;
  mean /= s.length;
  for (let i = 0; i < s.length; i += 1) { const v = s[i] - mean; sum += v * v; if (i && (s[i - 1] - mean) * v < 0) zc += 1; }
  const win = Math.round(rate / 50);
  const env = [];
  for (let i = 0; i + win <= s.length; i += win) { let e = 0; for (let j = i; j < i + win; j += 1) e += Math.abs(s[j] - mean); env.push(e / win); }
  return { seconds: +(s.length / rate).toFixed(2), rms: +Math.sqrt(sum / s.length).toFixed(4), zeroCrossingsPerSecond: Math.round(zc / (s.length / rate)), env };
}
function corr(a, b) {
  const n = Math.min(a.length, b.length);
  const ma = a.slice(0, n).reduce((x, y) => x + y, 0) / n;
  const mb = b.slice(0, n).reduce((x, y) => x + y, 0) / n;
  let num = 0; let da = 0; let db = 0;
  for (let i = 0; i < n; i += 1) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return +(num / Math.sqrt(da * db)).toFixed(3);
}

const native = readWav(path.join(spike, "results", "reference", "altirra-basic-off", "01-menu-music.wav"));
fs.copyFileSync(path.join(spike, "results", "reference", "altirra-basic-off", "01-menu-music.wav"), path.join(out, "atari800-native-menu.wav"));
const nativeStats = stats(native.s, native.rate);
const report = { "atari800-native": { rate: native.rate, ...nativeStats, env: undefined } };
const server = await serve(8777);
const browser = await chromium.launch();
for (const proto of ["atari800-wasm", "sfotty-pie"]) {
  const page = await browser.newPage();
  await page.goto(`http://localhost:8777/spike/prototypes/${proto}/?manual=1&fresh=1`);
  await page.waitForFunction(() => window.vs?.ready);
  const { rate, samples } = await page.evaluate(() => {
    window.vs.runScript("until 0x9A 1 1500");
    // The native WAV starts at the menu's first frame (+0) and runs 500 frames.
    window.vs.audioTap = [];
    window.vs.runScript("frames 500");
    const all = window.vs.audioTap.flatMap((c) => [...c]);
    return { rate: window.vs.audio.rate, samples: all };
  });
  const s = Float32Array.from(samples);
  writeWav(path.join(out, `${proto}-menu.wav`), s, rate);
  const st = stats(s, rate);
  report[proto] = { rate, ...st, envelopeCorrelationWithNative: corr(st.env, nativeStats.env), env: undefined };
  await page.close();
}
await browser.close();
server.close();
fs.writeFileSync(path.join(out, "audio.json"), JSON.stringify(report, null, 2) + "\n");
for (const wav of fs.readdirSync(out).filter((f) => f.endsWith(".wav"))) {
  const src = path.join(out, wav);
  const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", src, src.replace(/\.wav$/, ".flac")]);
  if (r.status === 0) fs.rmSync(src);
}
console.log(JSON.stringify(report, null, 2));
