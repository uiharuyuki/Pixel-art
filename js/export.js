// 小さな ImageData を拡大してキャンバスへ描画し、PNG として保存する。

/**
 * 小さい ImageData を scale 倍に nearest-neighbor 拡大したキャンバスを返す。
 * showGrid が true かつ scale が十分大きいときはセル境界に線を引く。
 */
export function renderToCanvas(smallImageData, scale, showGrid) {
  const w = smallImageData.width;
  const h = smallImageData.height;

  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  small.getContext("2d").putImageData(smallImageData, 0, 0);

  const out = document.createElement("canvas");
  out.width = w * scale;
  out.height = h * scale;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, out.width, out.height);

  if (showGrid && scale >= 4) {
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x++) {
      ctx.moveTo(x * scale + 0.5, 0);
      ctx.lineTo(x * scale + 0.5, h * scale);
    }
    for (let y = 0; y <= h; y++) {
      ctx.moveTo(0, y * scale + 0.5);
      ctx.lineTo(w * scale, y * scale + 0.5);
    }
    ctx.stroke();
  }

  return out;
}

/** キャンバスを PNG として保存する。 */
export function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
