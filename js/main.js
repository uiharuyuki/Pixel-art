// メインスレッド: Worker統括・画像入力・UI配線・書き出し。

import { createStore } from "./state.js";
import { bindControls } from "./ui/controls.js";
import { renderPalette } from "./ui/palette-panel.js";
import { createViewer } from "./ui/compare.js";
import * as exp from "./export.js";

const $ = (id) => document.getElementById(id);

const store = createStore();
const worker = new Worker(new URL("./worker/pipeline.worker.js", import.meta.url), { type: "module" });

let reqId = 0;
let currentPalette = [];
let hasSource = false;

const previewCanvas = $("previewCanvas");
const pctx = previewCanvas.getContext("2d", { willReadFrequently: true });
const originalImg = $("originalImg");
const placeholder = $("placeholder");
const paletteList = $("paletteList");

const controls = bindControls(store);
createViewer({
  stage: $("stage"), canvas: previewCanvas, original: originalImg,
  showOriginalEl: $("showOriginal"), inspectorEl: $("inspector"),
  zoomInEl: $("zoomIn"), zoomOutEl: $("zoomOut"), zoomFitEl: $("zoomFit"), zoomLabel: $("zoomLabel"),
});

const paletteHandlers = {
  onRecolor(i, rgb) {
    currentPalette[i] = { r: rgb[0], g: rgb[1], b: rgb[2] };
    renderPalette(paletteList, currentPalette, paletteHandlers);
    worker.postMessage({ type: "recolor", palette: currentPalette, id: ++reqId });
  },
  onLock(rgb) {
    const q = store.get().quantize;
    store.set("quantize", { mode: "auto", locked: [...q.locked, rgb] });
  },
  onDelete() {
    const q = store.get().quantize;
    store.set("quantize", { K: Math.max(2, q.K - 1) });
  },
};

// --- Worker メッセージ ---
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === "result") drawResult(m);
  else if (m.type === "gridSuggestion" && m.width) store.set("resample", { width: m.width });
};

function drawResult(m) {
  previewCanvas.width = m.width;
  previewCanvas.height = m.height;
  pctx.putImageData(new ImageData(new Uint8ClampedArray(m.buffer), m.width, m.height), 0, 0);
  placeholder.hidden = true;
  previewCanvas.hidden = false;
  currentPalette = m.palette;
  renderPalette(paletteList, currentPalette, paletteHandlers);
  $("e_export").disabled = false;
  $("info").textContent = `${m.width} × ${m.height} px / ${m.palette.length} 色`;
}

// --- 処理スケジューリング ---
let timer;
function schedule() {
  if (!hasSource) return;
  clearTimeout(timer);
  timer = setTimeout(() => worker.postMessage({ type: "process", settings: store.get(), id: ++reqId }), 80);
}

store.subscribe((settings) => {
  controls.apply(settings);
  store.toHash();
  schedule();
});

// --- 画像入力 ---
function loadImage(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    const id = c.getContext("2d").getImageData(0, 0, c.width, c.height);
    const buf = id.data.buffer;
    worker.postMessage({ type: "source", buffer: buf, width: c.width, height: c.height }, [buf]);
    originalImg.src = url;
    hasSource = true;
    worker.postMessage({ type: "process", settings: store.get(), id: ++reqId });
  };
  img.src = url;
}

$("fileInput").addEventListener("change", (e) => loadImage(e.target.files[0]));
window.addEventListener("paste", (e) => {
  const item = [...(e.clipboardData?.items || [])].find((it) => it.type.startsWith("image/"));
  if (item) loadImage(item.getAsFile());
});

const dz = $("dropzone");
["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("dragover"); }));
["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("dragover"); }));
dz.addEventListener("drop", (e) => loadImage(e.dataTransfer.files[0]));

// --- ボタン類 ---
$("r_autodetect").addEventListener("click", () => worker.postMessage({ type: "detectGrid", id: ++reqId }));
$("p_reset").addEventListener("click", () => store.set("preprocess", { brightness: 0, contrast: 0, saturation: 100 }));
$("undo").addEventListener("click", () => store.undo());
$("redo").addEventListener("click", () => store.redo());

$("q_import").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const colors = await exp.parsePaletteFile(file);
  if (colors.length) store.set("quantize", { mode: "imported", imported: colors });
});

$("e_export").addEventListener("click", () => {
  const s = store.get().export;
  const canvas = exp.renderScaled(previewCanvas, s.scale, s.grid);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  exp.downloadCanvas(canvas, `pixelart_${stamp}.png`);
});
$("e_paletteHex").addEventListener("click", () => exp.exportPaletteHex(currentPalette));
$("e_paletteGpl").addEventListener("click", () => exp.exportPaletteGPL(currentPalette));
$("e_palettePng").addEventListener("click", () => exp.exportPalettePNG(currentPalette));
$("e_copy").addEventListener("click", async () => {
  const s = store.get().export;
  const ok = await exp.copyCanvas(exp.renderScaled(previewCanvas, s.scale, false));
  $("e_copy").textContent = ok ? "コピーしました" : "コピー失敗";
  setTimeout(() => ($("e_copy").textContent = "クリップボードへコピー"), 1500);
});

// --- プリセット ---
function refreshPresetList() {
  const sel = $("presetSelect");
  const names = Object.keys(store.listPresets());
  sel.innerHTML = names.map((n) => `<option>${n}</option>`).join("");
}
$("presetSave").addEventListener("click", () => {
  const name = $("presetName").value.trim();
  if (!name) return;
  store.savePreset(name);
  refreshPresetList();
});
$("presetSelect").addEventListener("change", (e) => store.loadPreset(e.target.value));
$("presetDelete").addEventListener("click", () => {
  const name = $("presetSelect").value;
  if (name) { store.deletePreset(name); refreshPresetList(); }
});

// --- 初期化 ---
store.fromHash();
controls.apply(store.get());
refreshPresetList();
