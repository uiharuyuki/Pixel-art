// 減色: OKLab上の重み付きk-means(++) と median-cut。色ロック対応・アルファ対応。
// パレット/サンプルとも sRGB は {r,g,b}、OKLab は {L,A,B} に格納（キー衝突回避）。

import { srgbToOklab, oklabToSrgb } from "./color.js";

// 決定的PRNG（テスト容易性のため）。
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 不透明画素の一意色＋出現数を収集し OKLab を付与。
export function collectSamples(data, alphaThreshold = 8) {
  const map = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < alphaThreshold) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    const e = map.get(key);
    if (e) e.count++;
    else map.set(key, { r: data[i], g: data[i + 1], b: data[i + 2], count: 1 });
  }
  const lab = [0, 0, 0];
  const samples = [];
  for (const e of map.values()) {
    srgbToOklab(e.r, e.g, e.b, lab);
    samples.push({ L: lab[0], A: lab[1], B: lab[2], r: e.r, g: e.g, b: e.b, count: e.count });
  }
  return samples;
}

function toPaletteEntry(L, A, B) {
  const rgb = [0, 0, 0];
  oklabToSrgb(L, A, B, rgb);
  return { r: rgb[0], g: rgb[1], b: rgb[2], L, A, B };
}

// k-means++ 播種（出現数で重み付け）。
function seedPlusPlus(samples, k, rng) {
  const n = samples.length;
  const centers = [];
  let total = 0;
  for (let i = 0; i < n; i++) total += samples[i].count;
  let r = rng() * total;
  let first = samples[0];
  for (let i = 0; i < n; i++) {
    r -= samples[i].count;
    if (r <= 0) { first = samples[i]; break; }
  }
  centers.push({ L: first.L, A: first.A, B: first.B });

  const d2 = new Float64Array(n).fill(Infinity);
  while (centers.length < k) {
    const c = centers[centers.length - 1];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      const dL = s.L - c.L, da = s.A - c.A, db = s.B - c.B;
      const dd = dL * dL + da * da + db * db;
      if (dd < d2[i]) d2[i] = dd;
      sum += d2[i] * s.count;
    }
    if (sum <= 0) break;
    let pick = rng() * sum;
    let chosen = samples[0];
    for (let i = 0; i < n; i++) {
      pick -= d2[i] * samples[i].count;
      if (pick <= 0) { chosen = samples[i]; break; }
    }
    centers.push({ L: chosen.L, A: chosen.A, B: chosen.B });
  }
  return centers;
}

/**
 * 重み付きk-means。lockedLab は固定中心（Lloydで更新しない）。
 * 返り値はパレット配列（locked先頭＋最適化された自由中心）。
 */
export function kmeans(samples, K, lockedLab = [], iterations = 8, seed = 1) {
  if (samples.length === 0) return lockedLab.slice();
  const rng = mulberry32(seed);
  const lockedN = lockedLab.length;
  const freeK = Math.max(0, Math.min(K - lockedN, samples.length));
  if (freeK === 0) return lockedLab.slice();

  let free = seedPlusPlus(samples, freeK, rng);

  for (let iter = 0; iter < iterations; iter++) {
    const sumL = new Float64Array(free.length);
    const sumA = new Float64Array(free.length);
    const sumB = new Float64Array(free.length);
    const sumW = new Float64Array(free.length);

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      let best = -1;
      let bd = Infinity;
      for (let k = 0; k < lockedN; k++) {
        const c = lockedLab[k];
        const dL = s.L - c.L, da = s.A - c.A, db = s.B - c.B;
        const d = dL * dL + da * da + db * db;
        if (d < bd) { bd = d; best = -1; }
      }
      for (let k = 0; k < free.length; k++) {
        const c = free[k];
        const dL = s.L - c.L, da = s.A - c.A, db = s.B - c.B;
        const d = dL * dL + da * da + db * db;
        if (d < bd) { bd = d; best = k; }
      }
      if (best >= 0) {
        sumL[best] += s.L * s.count;
        sumA[best] += s.A * s.count;
        sumB[best] += s.B * s.count;
        sumW[best] += s.count;
      }
    }
    for (let k = 0; k < free.length; k++) {
      if (sumW[k] > 0) {
        free[k] = { L: sumL[k] / sumW[k], A: sumA[k] / sumW[k], B: sumB[k] / sumW[k] };
      }
    }
  }

  const palette = lockedLab.slice();
  for (const c of free) palette.push(toPaletteEntry(c.L, c.A, c.B));
  return palette;
}

// median-cut（OKLab、簡易・高速経路）。
export function medianCut(samples, K) {
  if (samples.length === 0) return [];
  let boxes = [samples.slice()];
  while (boxes.length < K) {
    let target = -1, maxRange = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      const r = labRanges(boxes[i]);
      const m = Math.max(r.L, r.A, r.B);
      if (m > maxRange) { maxRange = m; target = i; }
    }
    if (target < 0) break;
    const box = boxes[target];
    const r = labRanges(box);
    const ch = r.L >= r.A && r.L >= r.B ? "L" : r.A >= r.B ? "A" : "B";
    box.sort((x, y) => x[ch] - y[ch]);
    const mid = box.length >> 1;
    boxes.splice(target, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.map((box) => {
    let L = 0, A = 0, B = 0, w = 0;
    for (const s of box) { L += s.L * s.count; A += s.A * s.count; B += s.B * s.count; w += s.count; }
    return toPaletteEntry(L / w, A / w, B / w);
  });
}

function labRanges(box) {
  let Lmin = Infinity, Lmax = -Infinity, amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
  for (const s of box) {
    if (s.L < Lmin) Lmin = s.L; if (s.L > Lmax) Lmax = s.L;
    if (s.A < amin) amin = s.A; if (s.A > amax) amax = s.A;
    if (s.B < bmin) bmin = s.B; if (s.B > bmax) bmax = s.B;
  }
  return { L: Lmax - Lmin, A: amax - amin, B: bmax - bmin };
}

// RGBリスト→パレット（preset/import/locked用）。
export function paletteFromRGB(rgbList) {
  const lab = [0, 0, 0];
  return rgbList.map(([r, g, b]) => {
    srgbToOklab(r, g, b, lab);
    return { r, g, b, L: lab[0], A: lab[1], B: lab[2] };
  });
}
