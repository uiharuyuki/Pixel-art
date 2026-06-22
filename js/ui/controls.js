// 値入力(slider/select/checkbox/color)を store にバインドする。

// [id, path, key, type]
const MAP = [
  ["r_width", "resample", "width", "int"],
  ["r_method", "resample", "method", "str"],
  ["r_offsetX", "resample", "offsetX", "int"],
  ["r_offsetY", "resample", "offsetY", "int"],
  ["p_brightness", "preprocess", "brightness", "int"],
  ["p_contrast", "preprocess", "contrast", "int"],
  ["p_saturation", "preprocess", "saturation", "int"],
  ["q_mode", "quantize", "mode", "str"],
  ["q_K", "quantize", "K", "int"],
  ["q_preset", "quantize", "preset", "str"],
  ["q_algo", "quantize", "algo", "str"],
  ["d_type", "dither", "type", "str"],
  ["d_strength", "dither", "strength", "int"],
  ["d_serpentine", "dither", "serpentine", "bool"],
  ["d_matrix", "dither", "matrix", "int"],
  ["c_despeckle", "cleanup", "despeckle", "bool"],
  ["c_merge", "cleanup", "mergeThreshold", "merge"],
  ["c_outline", "cleanup.outline", "on", "bool"],
  ["c_outline_color", "cleanup.outline", "color", "color"],
  ["c_outline_width", "cleanup.outline", "width", "int"],
  ["t_mode", "cleanup.transparency", "mode", "str"],
  ["t_key", "cleanup.transparency", "key", "color"],
  ["t_tolerance", "cleanup.transparency", "tolerance", "int"],
  ["c_defringe", "cleanup.transparency", "defringe", "bool"],
  ["e_scale", "export", "scale", "int"],
  ["e_grid", "export", "grid", "bool"],
];

function hexToRgb(hex) {
  const m = /#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}
function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function readValue(el, type) {
  switch (type) {
    case "int": return parseInt(el.value, 10) || 0;
    case "merge": return (parseInt(el.value, 10) || 0) / 100;
    case "bool": return el.checked;
    case "color": return hexToRgb(el.value);
    default: return el.value;
  }
}

function writeValue(el, type, val) {
  switch (type) {
    case "bool": el.checked = !!val; break;
    case "merge": el.value = Math.round(val * 100); break;
    case "color": el.value = rgbToHex(val); break;
    default: el.value = val;
  }
}

export function bindControls(store) {
  const byId = {};
  for (const [id, path, key, type] of MAP) {
    const el = document.getElementById(id);
    if (!el) continue;
    byId[id] = el;
    const ev = el.tagName === "SELECT" || el.type === "checkbox" || el.type === "color" ? "change" : "input";
    el.addEventListener(ev, () => store.set(path, { [key]: readValue(el, type) }));
  }

  // store → 各入力へ反映（undo/プリセット読込時）。
  function apply(settings) {
    for (const [id, path, key, type] of MAP) {
      const el = byId[id];
      if (!el) continue;
      const sec = path.split(".").reduce((o, k) => o[k], settings);
      writeValue(el, type, sec[key]);
    }
    syncOutputs(settings);
  }

  function syncOutputs(settings) {
    setText("r_widthOut", settings.resample.width);
    setText("q_KOut", settings.quantize.K);
    setText("d_strengthOut", settings.dither.strength);
    setText("p_brightnessOut", settings.preprocess.brightness);
    setText("p_contrastOut", settings.preprocess.contrast);
    setText("p_saturationOut", settings.preprocess.saturation);
    setText("t_toleranceOut", settings.cleanup.transparency.tolerance);
    setText("c_mergeOut", Math.round(settings.cleanup.mergeThreshold * 100));
    // モード依存の表示/無効化。
    toggle("q_KField", settings.quantize.mode === "auto");
    toggle("q_algoField", settings.quantize.mode === "auto");
    toggle("q_presetField", settings.quantize.mode === "preset");
    toggle("d_matrixField", settings.dither.type === "bayer");
    toggle("t_keyField", settings.cleanup.transparency.mode !== "keep");
  }

  return { apply, byId };
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}
function toggle(id, on) {
  const el = document.getElementById(id);
  if (el) el.style.display = on ? "" : "none";
}
