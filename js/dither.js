// ディザリング: Floyd–Steinberg（誤差拡散）と Bayer（オーダード）。

import { nearestColor } from "./quantize.js";

function clamp(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function spreadError(data, width, height, x, y, er, eg, eb, factor) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const idx = (y * width + x) * 4;
  data[idx] = clamp(data[idx] + er * factor);
  data[idx + 1] = clamp(data[idx + 1] + eg * factor);
  data[idx + 2] = clamp(data[idx + 2] + eb * factor);
}

/** Floyd–Steinberg 誤差拡散（破壊的）。 */
export function floydSteinberg(imageData, palette) {
  const { width, height, data } = imageData;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const oldR = data[idx];
      const oldG = data[idx + 1];
      const oldB = data[idx + 2];
      const nc = nearestColor(oldR, oldG, oldB, palette);
      data[idx] = nc[0];
      data[idx + 1] = nc[1];
      data[idx + 2] = nc[2];

      const er = oldR - nc[0];
      const eg = oldG - nc[1];
      const eb = oldB - nc[2];

      spreadError(data, width, height, x + 1, y, er, eg, eb, 7 / 16);
      spreadError(data, width, height, x - 1, y + 1, er, eg, eb, 3 / 16);
      spreadError(data, width, height, x, y + 1, er, eg, eb, 5 / 16);
      spreadError(data, width, height, x + 1, y + 1, er, eg, eb, 1 / 16);
    }
  }
  return imageData;
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Bayer 4x4 オーダードディザ（破壊的）。 */
export function bayer(imageData, palette) {
  const { width, height, data } = imageData;
  const spread = 48; // 閾値のばらつき量
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const t = (BAYER4[y & 3][x & 3] / 16 - 0.5) * spread;
      const r = clamp(data[idx] + t);
      const g = clamp(data[idx + 1] + t);
      const b = clamp(data[idx + 2] + t);
      const nc = nearestColor(r, g, b, palette);
      data[idx] = nc[0];
      data[idx + 1] = nc[1];
      data[idx + 2] = nc[2];
    }
  }
  return imageData;
}
