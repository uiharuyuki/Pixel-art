// クリーンアップ/後処理: despeckle・merge・outline・transparency・defringe。
// state = { width, height, indices(Int16Array,-1=透明), alpha(Uint8ClampedArray), palette }

import { srgbToOklab, labDist2 } from "./color.js";

const ALPHA_THRESHOLD = 8;
const NB = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

export function cleanup(state, settings = {}) {
  if (settings.despeckle) despeckle(state);
  if (settings.mergeThreshold > 0) mergeColors(state, settings.mergeThreshold);
  const t = settings.transparency;
  if (t && t.mode && t.mode !== "keep") applyTransparency(state, t);
  if (settings.defringe) defringe(state);
  const o = settings.outline;
  if (o && o.on) addOutline(state, o);
  return state;
}

// 孤立ピクセル除去: 4近傍の有効画素が多数で別色なら多数色へ。
function despeckle(state) {
  const { width: w, height: h, indices } = state;
  const src = indices.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const cur = src[p];
      if (cur < 0) continue;
      const counts = new Map();
      let valid = 0;
      for (const [dx, dy] of NB) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const v = src[ny * w + nx];
        if (v < 0) continue;
        valid++;
        counts.set(v, (counts.get(v) || 0) + 1);
      }
      if (valid < 3) continue;
      let major = cur, mc = 0;
      for (const [v, c] of counts) if (c > mc) { mc = c; major = v; }
      if (major !== cur && mc >= 3) indices[p] = major;
    }
  }
}

// 近似パレット色をOKLab閾値で統合し、indicesを再マップ。
function mergeColors(state, threshold) {
  const pal = state.palette;
  const n = pal.length;
  const remap = new Int16Array(n);
  for (let i = 0; i < n; i++) remap[i] = -1;
  const newPal = [];
  const th2 = threshold * threshold;
  for (let i = 0; i < n; i++) {
    if (remap[i] >= 0) continue;
    const ni = newPal.length;
    remap[i] = ni;
    newPal.push(pal[i]);
    for (let j = i + 1; j < n; j++) {
      if (remap[j] >= 0) continue;
      if (labDist2(pal[i].L, pal[i].A, pal[i].B, pal[j].L, pal[j].A, pal[j].B) <= th2) {
        remap[j] = ni;
      }
    }
  }
  const idx = state.indices;
  for (let p = 0; p < idx.length; p++) if (idx[p] >= 0) idx[p] = remap[idx[p]];
  state.palette = newPal;
}

function applyTransparency(state, t) {
  const { width: w, height: h, indices, alpha, palette } = state;
  const lab = [0, 0, 0];
  srgbToOklab(t.key[0], t.key[1], t.key[2], lab);
  const tol2 = (t.tolerance / 100) * 1.0; // OKLab距離スケール
  const tol2sq = tol2 * tol2;
  const matchesKey = (p) => {
    const idx = indices[p];
    if (idx < 0) return true;
    const c = palette[idx];
    return labDist2(c.L, c.A, c.B, lab[0], lab[1], lab[2]) <= tol2sq;
  };

  if (t.mode === "colorkey") {
    for (let p = 0; p < indices.length; p++) {
      if (matchesKey(p)) { indices[p] = -1; alpha[p] = 0; }
    }
  } else if (t.mode === "edge") {
    // 外周からキー一致領域をflood。
    const visited = new Uint8Array(w * h);
    const stack = [];
    for (let x = 0; x < w; x++) { stack.push(x); stack.push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { stack.push(y * w); stack.push(y * w + w - 1); }
    while (stack.length) {
      const p = stack.pop();
      if (visited[p]) continue;
      visited[p] = 1;
      if (!matchesKey(p)) continue;
      indices[p] = -1; alpha[p] = 0;
      const x = p % w, y = (p / w) | 0;
      for (const [dx, dy] of NB) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) stack.push(ny * w + nx);
      }
    }
  }
}

// 半透明エッジの色を近傍の不透明色で置換（フリンジ補正）。
function defringe(state) {
  const { width: w, height: h, indices, alpha } = state;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (indices[p] < 0) continue;
      if (alpha[p] >= 250 || alpha[p] < ALPHA_THRESHOLD) continue;
      for (const [dx, dy] of NB) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (indices[q] >= 0 && alpha[q] >= 250) { indices[p] = indices[q]; break; }
      }
    }
  }
}

// 不透明領域の外側1px(×width)に縁取りを追加。
function addOutline(state, o) {
  const color = o.color || [0, 0, 0];
  const lab = [0, 0, 0];
  srgbToOklab(color[0], color[1], color[2], lab);
  // 縁取り色をパレットに追加（既存に近い色があれば再利用）。
  let outIdx = state.palette.findIndex(
    (c) => c.r === color[0] && c.g === color[1] && c.b === color[2]
  );
  if (outIdx < 0) {
    outIdx = state.palette.length;
    state.palette.push({ r: color[0], g: color[1], b: color[2], L: lab[0], A: lab[1], B: lab[2] });
  }
  const { width: w, height: h } = state;
  const width = Math.max(1, o.width || 1);
  for (let pass = 0; pass < width; pass++) {
    const toFill = [];
    const { indices, alpha } = state;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (indices[p] >= 0 && alpha[p] >= ALPHA_THRESHOLD) continue; // 既に不透明
        for (const [dx, dy] of NB) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (indices[q] >= 0 && indices[q] !== outIdx && alpha[q] >= ALPHA_THRESHOLD) { toFill.push(p); break; }
        }
      }
    }
    for (const p of toFill) { state.indices[p] = outIdx; state.alpha[p] = 255; }
  }
}
