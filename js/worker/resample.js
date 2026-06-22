// リサンプル（縮小）と前処理。DOM非依存。
// source/小画像とも {width,height,data(Uint8ClampedArray RGBA)}。

const ALPHA_THRESHOLD = 8;

function clamp8(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * source を gridW×gridH に縮小。method: average|dominant|median|nearest。
 * offsetX/Y は source画素単位のグリッドずらし。
 */
export function resample(source, gridW, gridH, method = "average", offsetX = 0, offsetY = 0) {
  const { width: sw, height: sh, data } = source;
  const out = new Uint8ClampedArray(gridW * gridH * 4);
  const sx = sw / gridW;
  const sy = sh / gridH;

  for (let gy = 0; gy < gridH; gy++) {
    const y0 = Math.floor(gy * sy + offsetY);
    const y1 = Math.max(y0 + 1, Math.floor((gy + 1) * sy + offsetY));
    for (let gx = 0; gx < gridW; gx++) {
      const x0 = Math.floor(gx * sx + offsetX);
      const x1 = Math.max(x0 + 1, Math.floor((gx + 1) * sx + offsetX));
      const o = (gy * gridW + gx) * 4;
      aggregate(data, sw, sh, x0, x1, y0, y1, method, out, o);
    }
  }
  return { width: gridW, height: gridH, data: out };
}

function aggregate(data, sw, sh, x0, x1, y0, y1, method, out, o) {
  if (method === "nearest") {
    const cx = Math.min(sw - 1, Math.max(0, (x0 + x1) >> 1));
    const cy = Math.min(sh - 1, Math.max(0, (y0 + y1) >> 1));
    const i = (cy * sw + cx) * 4;
    out[o] = data[i]; out[o + 1] = data[i + 1]; out[o + 2] = data[i + 2]; out[o + 3] = data[i + 3];
    return;
  }
  if (method === "median") {
    const rs = [], gs = [], bs = [], as = [];
    for (let y = y0; y < y1; y++) {
      if (y < 0 || y >= sh) continue;
      for (let x = x0; x < x1; x++) {
        if (x < 0 || x >= sw) continue;
        const i = (y * sw + x) * 4;
        rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]); as.push(data[i + 3]);
      }
    }
    out[o] = med(rs); out[o + 1] = med(gs); out[o + 2] = med(bs); out[o + 3] = med(as);
    return;
  }
  if (method === "dominant") {
    // 4bit/ch の粗ビンで最頻色を選ぶ。
    const hist = new Map();
    let aSum = 0, aCnt = 0;
    for (let y = y0; y < y1; y++) {
      if (y < 0 || y >= sh) continue;
      for (let x = x0; x < x1; x++) {
        if (x < 0 || x >= sw) continue;
        const i = (y * sw + x) * 4;
        aSum += data[i + 3]; aCnt++;
        if (data[i + 3] < ALPHA_THRESHOLD) continue;
        const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
        const e = hist.get(key);
        if (e) { e.c++; e.r += data[i]; e.g += data[i + 1]; e.b += data[i + 2]; }
        else hist.set(key, { c: 1, r: data[i], g: data[i + 1], b: data[i + 2] });
      }
    }
    let best = null;
    for (const e of hist.values()) if (!best || e.c > best.c) best = e;
    if (best) {
      out[o] = clamp8(best.r / best.c); out[o + 1] = clamp8(best.g / best.c); out[o + 2] = clamp8(best.b / best.c);
    }
    out[o + 3] = aCnt ? clamp8(aSum / aCnt) : 0;
    return;
  }
  // average（アルファ重み付き）。
  let r = 0, g = 0, b = 0, aSum = 0, w = 0, aCnt = 0;
  for (let y = y0; y < y1; y++) {
    if (y < 0 || y >= sh) continue;
    for (let x = x0; x < x1; x++) {
      if (x < 0 || x >= sw) continue;
      const i = (y * sw + x) * 4;
      const a = data[i + 3];
      r += data[i] * a; g += data[i + 1] * a; b += data[i + 2] * a;
      aSum += a; w += a; aCnt++;
    }
  }
  if (w > 0) { out[o] = clamp8(r / w); out[o + 1] = clamp8(g / w); out[o + 2] = clamp8(b / w); }
  out[o + 3] = aCnt ? clamp8(aSum / aCnt) : 0;
}

function med(arr) {
  if (arr.length === 0) return 0;
  arr.sort((a, b) => a - b);
  return arr[arr.length >> 1];
}

/** 明るさ/コントラスト/彩度を破壊的に適用。 */
export function preprocess(small, { brightness = 0, contrast = 0, saturation = 100 } = {}) {
  if (brightness === 0 && contrast === 0 && saturation === 100) return small;
  const data = small.data;
  const bAdd = brightness * 2.55;
  const c = contrast * 2.55;
  const cf = (259 * (c + 255)) / (255 * (259 - c));
  const s = saturation / 100;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    r += bAdd; g += bAdd; b += bAdd;
    r = cf * (r - 128) + 128; g = cf * (g - 128) + 128; b = cf * (b - 128) + 128;
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * s; g = gray + (g - gray) * s; b = gray + (b - gray) * s;
    data[i] = clamp8(r); data[i + 1] = clamp8(g); data[i + 2] = clamp8(b);
  }
  return small;
}

/**
 * 拡大済みドット絵のセル周期を推定（自己相関）。
 * 推奨の出力幅を返す（検出できなければ null）。
 */
export function detectGridWidth(source) {
  const { width: w, height: h, data } = source;
  const col = new Float64Array(w);
  for (let x = 1; x < w; x++) {
    let s = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      const j = (y * w + x - 1) * 4;
      s += Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]);
    }
    col[x] = s;
  }
  const period = bestPeriod(col);
  if (!period) return null;
  return Math.max(2, Math.round(w / period));
}

function bestPeriod(signal) {
  const n = signal.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += signal[i];
  mean /= n;
  let bestLag = 0, bestVal = 0;
  for (let lag = 2; lag < Math.min(64, n >> 1); lag++) {
    let acc = 0;
    for (let i = 0; i < n - lag; i++) acc += (signal[i] - mean) * (signal[i + lag] - mean);
    if (acc > bestVal) { bestVal = acc; bestLag = lag; }
  }
  return bestLag || null;
}
