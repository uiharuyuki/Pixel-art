// UI 配線・リアルタイムプレビュー統括。

import { pixelate, preprocess } from "./pipeline.js";
import { medianCut, applyPalette } from "./quantize.js";
import { floydSteinberg, bayer } from "./dither.js";
import { PALETTES } from "./palettes.js";
import { renderToCanvas, downloadCanvas } from "./export.js";

const $ = (id) => document.getElementById(id);

// 元画像を描画した作業用キャンバスと、直近の変換結果。
let sourceCanvas = null;
let lastSmall = null;

const els = {
  fileInput: $("fileInput"),
  dropzone: $("dropzone"),
  gridSize: $("gridSize"),
  gridSizeOut: $("gridSizeOut"),
  dimInfo: $("dimInfo"),
  paletteMode: $("paletteMode"),
  colorCount: $("colorCount"),
  colorCountOut: $("colorCountOut"),
  colorCountField: $("colorCountField"),
  dither: $("dither"),
  brightness: $("brightness"),
  brightnessOut: $("brightnessOut"),
  contrast: $("contrast"),
  contrastOut: $("contrastOut"),
  saturation: $("saturation"),
  saturationOut: $("saturationOut"),
  resetPre: $("resetPre"),
  exportScale: $("exportScale"),
  showGrid: $("showGrid"),
  exportBtn: $("exportBtn"),
  showOriginal: $("showOriginal"),
  paletteInfo: $("paletteInfo"),
  stage: $("stage"),
  placeholder: $("placeholder"),
  previewCanvas: $("previewCanvas"),
  originalImg: $("originalImg"),
};

function readParams() {
  return {
    gridSize: +els.gridSize.value,
    paletteMode: els.paletteMode.value,
    colorCount: +els.colorCount.value,
    dither: els.dither.value,
    brightness: +els.brightness.value,
    contrast: +els.contrast.value,
    saturation: +els.saturation.value,
  };
}

// スライダー横の数値表示を同期。
function syncOutputs() {
  els.gridSizeOut.value = els.gridSize.value;
  els.colorCountOut.value = els.colorCount.value;
  els.brightnessOut.value = els.brightness.value;
  els.contrastOut.value = els.contrast.value;
  els.saturationOut.value = els.saturation.value;
  // 自動パレットのときだけ色数スライダーを有効化。
  els.colorCountField.style.opacity = els.paletteMode.value === "auto" ? "1" : "0.4";
  els.colorCount.disabled = els.paletteMode.value !== "auto";
}

function process() {
  if (!sourceCanvas) return;
  const p = readParams();

  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;
  const gridW = Math.max(1, p.gridSize);
  const gridH = Math.max(1, Math.round(gridW * (srcH / srcW)));

  const img = pixelate(sourceCanvas, gridW, gridH);
  preprocess(img, p);

  let palette;
  if (p.paletteMode === "auto") {
    palette = medianCut(img, p.colorCount);
  } else {
    palette = PALETTES[p.paletteMode].colors;
  }

  if (p.dither === "floyd") floydSteinberg(img, palette);
  else if (p.dither === "bayer") bayer(img, palette);
  else applyPalette(img, palette);

  lastSmall = img;
  drawPreview(img);

  els.dimInfo.textContent = `${gridW} × ${gridH} px`;
  els.paletteInfo.textContent = `${gridW}×${gridH} / ${palette.length} 色`;
}

function drawPreview(img) {
  const c = els.previewCanvas;
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").putImageData(img, 0, 0);
  els.placeholder.hidden = true;
  c.hidden = els.showOriginal.checked;
  els.originalImg.hidden = !els.showOriginal.checked;
}

// 連続操作中の再計算を間引く。
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
const scheduleProcess = debounce(process, 80);

function onParamChange() {
  syncOutputs();
  scheduleProcess();
}

function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = img.naturalWidth;
    sourceCanvas.height = img.naturalHeight;
    sourceCanvas.getContext("2d").drawImage(img, 0, 0);
    els.originalImg.src = url; // 元画像表示用（URL は表示に使うので保持）
    els.exportBtn.disabled = false;
    process();
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

function exportPng() {
  if (!lastSmall) return;
  const scale = +els.exportScale.value;
  const canvas = renderToCanvas(lastSmall, scale, els.showGrid.checked);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  downloadCanvas(canvas, `pixelart_${stamp}.png`);
}

// --- イベント登録 ---
function init() {
  syncOutputs();

  // パラメータ系（リアルタイム反映）
  [
    "gridSize",
    "paletteMode",
    "colorCount",
    "dither",
    "brightness",
    "contrast",
    "saturation",
  ].forEach((id) => els[id].addEventListener("input", onParamChange));

  // 表示切替（再計算不要）
  els.showOriginal.addEventListener("change", () => {
    if (!sourceCanvas) return;
    els.previewCanvas.hidden = els.showOriginal.checked;
    els.originalImg.hidden = !els.showOriginal.checked;
  });

  els.resetPre.addEventListener("click", () => {
    els.brightness.value = 0;
    els.contrast.value = 0;
    els.saturation.value = 100;
    onParamChange();
  });

  els.fileInput.addEventListener("change", (e) => loadFile(e.target.files[0]));
  els.exportBtn.addEventListener("click", exportPng);

  // ドラッグ&ドロップ
  const dz = els.dropzone;
  ["dragenter", "dragover"].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.remove("dragover");
    })
  );
  dz.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    loadFile(file);
  });
}

init();
