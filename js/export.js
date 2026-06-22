// 書き出し: 拡大PNG・パレット(.hex/.gpl/PNGストリップ)・クリップボード。パレット読込も。

export function renderScaled(srcCanvas, scale, showGrid) {
  const w = srcCanvas.width, h = srcCanvas.height;
  const out = document.createElement("canvas");
  out.width = w * scale;
  out.height = h * scale;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(srcCanvas, 0, 0, out.width, out.height);
  if (showGrid && scale >= 4) {
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x++) { ctx.moveTo(x * scale + 0.5, 0); ctx.lineTo(x * scale + 0.5, h * scale); }
    for (let y = 0; y <= h; y++) { ctx.moveTo(0, y * scale + 0.5); ctx.lineTo(w * scale, y * scale + 0.5); }
    ctx.stroke();
  }
  return out;
}

export function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => downloadBlob(blob, filename), "image/png");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadText(text, filename) {
  downloadBlob(new Blob([text], { type: "text/plain" }), filename);
}

export async function copyCanvas(canvas) {
  try {
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

function hex(c) {
  return "#" + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function exportPaletteHex(palette) {
  downloadText(palette.map(hex).join("\n") + "\n", "palette.hex");
}

export function exportPaletteGPL(palette) {
  let s = "GIMP Palette\nName: PixelArt\nColumns: 0\n#\n";
  for (const c of palette) {
    s += `${String(c.r).padStart(3)} ${String(c.g).padStart(3)} ${String(c.b).padStart(3)}\t${hex(c)}\n`;
  }
  downloadText(s, "palette.gpl");
}

export function exportPalettePNG(palette, cell = 16) {
  const c = document.createElement("canvas");
  c.width = palette.length * cell;
  c.height = cell;
  const ctx = c.getContext("2d");
  palette.forEach((p, i) => {
    ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
    ctx.fillRect(i * cell, 0, cell, cell);
  });
  downloadCanvas(c, "palette.png");
}

// .gpl / .hex(.txt) / 画像 からパレット(RGB配列)を読み込む。
export async function parsePaletteFile(file) {
  if (file.type.startsWith("image/")) return parsePaletteImage(file);
  const text = await file.text();
  const colors = [];
  if (/GIMP Palette/i.test(text)) {
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/.exec(line);
      if (m) colors.push([+m[1], +m[2], +m[3]]);
    }
  } else {
    for (const m of text.matchAll(/#?([0-9a-f]{6})/gi)) {
      const v = m[1];
      colors.push([parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]);
    }
  }
  return colors;
}

function parsePaletteImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const seen = new Set();
      const colors = [];
      for (let i = 0; i < d.length && colors.length < 256; i += 4) {
        if (d[i + 3] < 8) continue;
        const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        if (!seen.has(key)) { seen.add(key); colors.push([d[i], d[i + 1], d[i + 2]]); }
      }
      URL.revokeObjectURL(img.src);
      resolve(colors);
    };
    img.src = URL.createObjectURL(file);
  });
}
