// 設定state・プリセット(localStorage)・Undo/Redo・URLハッシュ。

export const DEFAULTS = {
  resample: { width: 64, method: "average", offsetX: 0, offsetY: 0, autoGrid: false },
  preprocess: { brightness: 0, contrast: 0, saturation: 100 },
  quantize: { space: "oklab", mode: "auto", K: 16, preset: "pico8", imported: [], locked: [], algo: "kmeans", iterations: 8 },
  dither: { type: "none", strength: 100, serpentine: false, matrix: 4 },
  cleanup: {
    despeckle: false, mergeThreshold: 0,
    outline: { on: false, color: [0, 0, 0], width: 1 },
    transparency: { mode: "keep", key: [255, 255, 255], tolerance: 10, defringe: false },
  },
  export: { scale: 8, grid: false, format: "png" },
};

const PRESET_KEY = "pixelart.presets";

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

function getByPath(obj, path) {
  if (!path) return obj;
  return path.split(".").reduce((o, k) => o[k], obj);
}

export function createStore() {
  let settings = clone(DEFAULTS);
  const listeners = new Set();
  const undoStack = [];
  const redoStack = [];

  function notify() {
    for (const fn of listeners) fn(settings);
  }

  function pushHistory() {
    undoStack.push(clone(settings));
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
  }

  return {
    get: () => settings,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    set(path, patch, { history = true } = {}) {
      if (history) pushHistory();
      Object.assign(getByPath(settings, path), patch);
      notify();
    },

    replace(next, { history = true } = {}) {
      if (history) pushHistory();
      settings = clone(next);
      notify();
    },

    undo() {
      if (!undoStack.length) return;
      redoStack.push(clone(settings));
      settings = undoStack.pop();
      notify();
    },
    redo() {
      if (!redoStack.length) return;
      undoStack.push(clone(settings));
      settings = redoStack.pop();
      notify();
    },

    // --- プリセット ---
    listPresets() {
      try { return JSON.parse(localStorage.getItem(PRESET_KEY) || "{}"); }
      catch { return {}; }
    },
    savePreset(name) {
      const all = this.listPresets();
      all[name] = clone(settings);
      localStorage.setItem(PRESET_KEY, JSON.stringify(all));
    },
    loadPreset(name) {
      const all = this.listPresets();
      if (all[name]) this.replace(all[name]);
    },
    deletePreset(name) {
      const all = this.listPresets();
      delete all[name];
      localStorage.setItem(PRESET_KEY, JSON.stringify(all));
    },

    // --- URLハッシュ ---
    toHash() {
      try { location.hash = "s=" + encodeURIComponent(JSON.stringify(settings)); } catch {}
    },
    fromHash() {
      const m = /s=([^&]+)/.exec(location.hash);
      if (!m) return false;
      try { this.replace(JSON.parse(decodeURIComponent(m[1])), { history: false }); return true; }
      catch { return false; }
    },
  };
}
