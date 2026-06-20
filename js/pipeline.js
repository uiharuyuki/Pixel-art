// 前処理（明るさ/コントラスト/彩度）とピクセル化（縮小）。

function clamp(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * ソースを目標グリッドサイズへ縮小し、小さな ImageData を返す。
 * imageSmoothing を有効にして領域の代表色を平均化する。
 */
export function pixelate(sourceCanvas, gridW, gridH) {
  const off = document.createElement("canvas");
  off.width = gridW;
  off.height = gridH;
  const ctx = off.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sourceCanvas, 0, 0, gridW, gridH);
  return ctx.getImageData(0, 0, gridW, gridH);
}

/**
 * 明るさ・コントラスト・彩度を ImageData に適用（破壊的）。
 * brightness: -100..100, contrast: -100..100, saturation: 0..200(%)
 */
export function preprocess(imageData, { brightness = 0, contrast = 0, saturation = 100 }) {
  if (brightness === 0 && contrast === 0 && saturation === 100) return imageData;

  const data = imageData.data;
  const b = brightness * 2.55;
  const c = contrast * 2.55; // -255..255
  const cf = (259 * (c + 255)) / (255 * (259 - c));
  const s = saturation / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let bl = data[i + 2];

    // 明るさ
    r += b;
    g += b;
    bl += b;

    // コントラスト
    r = cf * (r - 128) + 128;
    g = cf * (g - 128) + 128;
    bl = cf * (bl - 128) + 128;

    // 彩度（グレースケールとの線形補間）
    const gray = 0.299 * r + 0.587 * g + 0.114 * bl;
    r = gray + (r - gray) * s;
    g = gray + (g - gray) * s;
    bl = gray + (bl - gray) * s;

    data[i] = clamp(r);
    data[i + 1] = clamp(g);
    data[i + 2] = clamp(bl);
  }
  return imageData;
}
