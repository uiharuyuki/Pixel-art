// パイプライン統括（Worker）。ステージごとにキャッシュし変更箇所だけ再計算。

import { resample, preprocess, detectGridWidth } from "./resample.js";
import { collectSamples, kmeans, medianCut, paletteFromRGB } from "./quantize.js";
import { ditherImage, renderIndices } from "./dither.js";
import { cleanup } from "./cleanup.js";
import { PALETTES } from "../palettes.js";

let source = null; // {width,height,data}
const cache = {
  resampleKey: null, resampled: null,
  paletteKey: null, palette: null,
  ditherKey: null, mapped: null,
  cleanupKey: null, cleaned: null,
};

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "source") {
    source = { width: msg.width, height: msg.height, data: new Uint8ClampedArray(msg.buffer) };
    cache.resampleKey = cache.paletteKey = cache.ditherKey = cache.cleanupKey = null;
    return;
  }
  if (msg.type === "detectGrid") {
    const width = source ? detectGridWidth(source) : null;
    self.postMessage({ type: "gridSuggestion", id: msg.id, width });
    return;
  }
  if (msg.type === "recolor") {
    if (!cache.cleaned) return;
    const { width, height, indices, alpha } = cache.cleaned;
    const palette = msg.palette;
    const rgba = renderIndices(width, height, indices, alpha, palette);
    self.postMessage(
      { type: "result", id: msg.id, width, height, palette: pal2plain(palette), buffer: rgba.buffer },
      [rgba.buffer]
    );
    return;
  }
  if (msg.type === "process") {
    process(msg.settings, msg.id);
  }
};

function process(s, id) {
  if (!source) return;

  // --- resample + preprocess ---
  const gridW = Math.max(1, s.resample.width);
  const gridH = Math.max(1, Math.round(gridW * (source.height / source.width)));
  const rKey = JSON.stringify({ r: s.resample, p: s.preprocess, gw: gridW });
  if (rKey !== cache.resampleKey) {
    const small = resample(source, gridW, gridH, s.resample.method, s.resample.offsetX || 0, s.resample.offsetY || 0);
    preprocess(small, s.preprocess);
    cache.resampled = small;
    cache.resampleKey = rKey;
    cache.paletteKey = null;
  }
  const small = cache.resampled;

  // --- palette ---
  const qKey = cache.resampleKey + "|" + JSON.stringify(s.quantize);
  if (qKey !== cache.paletteKey) {
    cache.palette = buildPalette(small, s.quantize);
    cache.paletteKey = qKey;
    cache.ditherKey = null;
  }
  const palette = cache.palette;

  // --- dither/map ---
  const dKey = cache.paletteKey + "|" + JSON.stringify(s.dither);
  if (dKey !== cache.ditherKey) {
    cache.mapped = ditherImage(small, palette, s.dither);
    cache.ditherKey = dKey;
    cache.cleanupKey = null;
  }

  // --- cleanup（パレットを複製してから適用） ---
  const cKey = cache.ditherKey + "|" + JSON.stringify(s.cleanup);
  if (cKey !== cache.cleanupKey) {
    const st = {
      width: small.width, height: small.height,
      indices: cache.mapped.indices.slice(),
      alpha: cache.mapped.alpha.slice(),
      palette: palette.map((c) => ({ ...c })),
    };
    cleanup(st, s.cleanup);
    cache.cleaned = st;
    cache.cleanupKey = cKey;
  }

  const { width, height, indices, alpha } = cache.cleaned;
  const rgba = renderIndices(width, height, indices, alpha, cache.cleaned.palette);
  self.postMessage(
    { type: "result", id, width, height, palette: pal2plain(cache.cleaned.palette), buffer: rgba.buffer },
    [rgba.buffer]
  );
}

function buildPalette(small, q) {
  const pal = buildPaletteInner(small, q);
  return pal.length ? pal : paletteFromRGB([[0, 0, 0]]);
}

function buildPaletteInner(small, q) {
  if (q.mode === "preset") {
    const preset = PALETTES[q.preset];
    return paletteFromRGB(preset ? preset.colors : [[0, 0, 0], [255, 255, 255]]);
  }
  if (q.mode === "imported" && q.imported && q.imported.length) {
    return paletteFromRGB(q.imported);
  }
  // auto
  const samples = collectSamples(small.data);
  const lockedLab = (q.locked && q.locked.length) ? paletteFromRGB(q.locked) : [];
  if (q.algo === "wu" || q.algo === "fast") {
    const free = medianCut(samples, Math.max(1, q.K - lockedLab.length));
    return lockedLab.concat(free);
  }
  return kmeans(samples, q.K, lockedLab, q.iterations || 8, 1);
}

function pal2plain(palette) {
  return palette.map((c) => ({ r: c.r, g: c.g, b: c.b }));
}
