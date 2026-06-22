// ディザリング & パレットマッピング（OKLab上）。
// 出力は indices(Int16Array, -1=透明) と alpha(Uint8ClampedArray)。

import { srgbToOklab } from "./color.js";

const ALPHA_THRESHOLD = 8;

const BAYER = {
  2: [0, 2, 3, 1],
  4: [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5],
  8: [
    0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
    12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
  ],
};

// Interleaved Gradient Noise（ブルーノイズ風・タイル不要）。0..1 を返す。
function ign(x, y) {
  const v = 52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1);
  return v % 1;
}

function buildLabPalette(palette) {
  const lab = new Float32Array(palette.length * 3);
  for (let k = 0; k < palette.length; k++) {
    lab[k * 3] = palette[k].L;
    lab[k * 3 + 1] = palette[k].A;
    lab[k * 3 + 2] = palette[k].B;
  }
  return lab;
}

function nearest(L, a, b, labPal, K) {
  let best = 0, bd = Infinity;
  for (let k = 0; k < K; k++) {
    const o = k * 3;
    const dL = L - labPal[o], da = a - labPal[o + 1], db = b - labPal[o + 2];
    const d = dL * dL + da * da + db * db;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

/**
 * small {width,height,data(RGBA)} を palette へ量子化（任意でディザ）。
 * settings: { type, strength(0..100), serpentine, matrix }
 */
export function ditherImage(small, palette, settings) {
  const { width, height, data } = small;
  const K = palette.length;
  const labPal = buildLabPalette(palette);
  const indices = new Int16Array(width * height);
  const alpha = new Uint8ClampedArray(width * height);
  const type = settings.type || "none";
  const strength = (settings.strength ?? 100) / 100;

  // 画素OKLabバッファ（誤差拡散で書き換えるため可変）。
  const lab = new Float32Array(width * height * 3);
  const tmp = [0, 0, 0];
  for (let p = 0, i = 0; p < width * height; p++, i += 4) {
    alpha[p] = data[i + 3];
    if (data[i + 3] < ALPHA_THRESHOLD) { indices[p] = -1; continue; }
    srgbToOklab(data[i], data[i + 1], data[i + 2], tmp);
    lab[p * 3] = tmp[0]; lab[p * 3 + 1] = tmp[1]; lab[p * 3 + 2] = tmp[2];
  }

  if (type === "floyd") {
    floyd(lab, indices, width, height, labPal, K, strength, !!settings.serpentine);
  } else if (type === "bayer" || type === "bluenoise") {
    const m = settings.matrix || 4;
    const amp = strength * 0.12; // L方向の閾値振幅（OKLab）
    for (let p = 0; p < width * height; p++) {
      if (indices[p] === -1) continue;
      const x = p % width, y = (p / width) | 0;
      let t;
      if (type === "bayer") {
        const size = m;
        const mat = BAYER[size] || BAYER[4];
        const v = mat[(y % size) * size + (x % size)] / (size * size);
        t = (v - 0.5) * amp;
      } else {
        t = (ign(x, y) - 0.5) * amp;
      }
      indices[p] = nearest(lab[p * 3] + t, lab[p * 3 + 1] + t * 0.3, lab[p * 3 + 2] + t * 0.3, labPal, K);
    }
  } else {
    for (let p = 0; p < width * height; p++) {
      if (indices[p] === -1) continue;
      indices[p] = nearest(lab[p * 3], lab[p * 3 + 1], lab[p * 3 + 2], labPal, K);
    }
  }

  return { indices, alpha };
}

function floyd(lab, indices, width, height, labPal, K, strength, serpentine) {
  const add = (p, eL, ea, eb, f) => {
    if (indices[p] === -1) return;
    lab[p * 3] += eL * f;
    lab[p * 3 + 1] += ea * f;
    lab[p * 3 + 2] += eb * f;
  };
  for (let y = 0; y < height; y++) {
    const ltr = !serpentine || y % 2 === 0;
    const xStart = ltr ? 0 : width - 1;
    const xEnd = ltr ? width : -1;
    const step = ltr ? 1 : -1;
    for (let x = xStart; x !== xEnd; x += step) {
      const p = y * width + x;
      if (indices[p] === -1) continue;
      const L = lab[p * 3], a = lab[p * 3 + 1], b = lab[p * 3 + 2];
      const k = nearest(L, a, b, labPal, K);
      indices[p] = k;
      const eL = (L - labPal[k * 3]) * strength;
      const ea = (a - labPal[k * 3 + 1]) * strength;
      const eb = (b - labPal[k * 3 + 2]) * strength;
      const fwd = step;
      if (x + fwd >= 0 && x + fwd < width) add(p + fwd, eL, ea, eb, 7 / 16);
      if (y + 1 < height) {
        if (x - fwd >= 0 && x - fwd < width) add(p + width - fwd, eL, ea, eb, 3 / 16);
        add(p + width, eL, ea, eb, 5 / 16);
        if (x + fwd >= 0 && x + fwd < width) add(p + width + fwd, eL, ea, eb, 1 / 16);
      }
    }
  }
}

// indices+alpha+palette → RGBA。
export function renderIndices(width, height, indices, alpha, palette) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let p = 0, i = 0; p < width * height; p++, i += 4) {
    const idx = indices[p];
    if (idx < 0 || alpha[p] < ALPHA_THRESHOLD) {
      out[i + 3] = 0;
      continue;
    }
    const c = palette[idx];
    out[i] = c.r; out[i + 1] = c.g; out[i + 2] = c.b; out[i + 3] = alpha[p];
  }
  return out;
}
