// Small PNG helpers for the spike's comparisons (pngjs + pixelmatch).
import fs from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

export function writePng(file, png) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

// Nearest-neighbour resize, enough to bring a browser canvas capture to the
// reference size without inventing colours.
export function resizeNearest(png, width, height) {
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(png.height - 1, Math.floor((y * png.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(png.width - 1, Math.floor((x * png.width) / width));
      png.data.copy(out.data, (y * width + x) * 4, (sy * png.width + sx) * 4, (sy * png.width + sx) * 4 + 4);
    }
  }
  return out;
}

export function crop(png, x, y, width, height) {
  const out = new PNG({ width, height });
  for (let row = 0; row < height; row += 1) {
    png.data.copy(out.data, row * width * 4, ((y + row) * png.width + x) * 4, ((y + row) * png.width + x + width) * 4);
  }
  return out;
}

// Images side by side with a grey 4-pixel gutter; all must share a height.
export function hstack(images) {
  const gutter = 4;
  const height = Math.max(...images.map((i) => i.height));
  const width = images.reduce((sum, i) => sum + i.width, 0) + gutter * (images.length - 1);
  const out = new PNG({ width, height });
  out.data.fill(0x80);
  let x0 = 0;
  for (const image of images) {
    for (let y = 0; y < image.height; y += 1) {
      image.data.copy(out.data, (y * width + x0) * 4, y * image.width * 4, (y + 1) * image.width * 4);
    }
    x0 += image.width + gutter;
  }
  return out;
}

// Exact pixel difference (threshold 0): count and a diff picture.
export function diff(a, b) {
  const out = new PNG({ width: a.width, height: a.height });
  const count = pixelmatch(a.data, b.data, out.data, a.width, a.height, { threshold: 0, includeAA: true, alpha: 0.2 });
  return { count, image: out };
}
