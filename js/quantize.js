// 減色（メディアンカット）と、パレットへのマッピング。

/** パレット中で (r,g,b) に最も近い色を返す（RGB ユークリッド距離）。 */
export function nearestColor(r, g, b, palette) {
  let best = palette[0];
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const dr = r - p[0];
    const dg = g - p[1];
    const db = b - p[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function channelRanges(box) {
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  for (let i = 0; i < box.length; i++) {
    const p = box[i];
    if (p[0] < rMin) rMin = p[0];
    if (p[0] > rMax) rMax = p[0];
    if (p[1] < gMin) gMin = p[1];
    if (p[1] > gMax) gMax = p[1];
    if (p[2] < bMin) bMin = p[2];
    if (p[2] > bMax) bMax = p[2];
  }
  return { r: rMax - rMin, g: gMax - gMin, b: bMax - bMin };
}

function averageColor(box) {
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < box.length; i++) {
    r += box[i][0];
    g += box[i][1];
    b += box[i][2];
  }
  const n = box.length;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/**
 * メディアンカットで maxColors 色のパレットを生成する。
 * 返り値は [R,G,B] の配列。
 */
export function medianCut(imageData, maxColors) {
  const data = imageData.data;
  const pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (pixels.length === 0) return [[0, 0, 0]];

  let boxes = [pixels];
  while (boxes.length < maxColors) {
    // 範囲が最大のボックスを選ぶ
    let target = -1;
    let maxRange = -1;
    for (let k = 0; k < boxes.length; k++) {
      if (boxes[k].length < 2) continue;
      const r = channelRanges(boxes[k]);
      const m = Math.max(r.r, r.g, r.b);
      if (m > maxRange) {
        maxRange = m;
        target = k;
      }
    }
    if (target < 0) break; // これ以上分割できない

    const box = boxes[target];
    const r = channelRanges(box);
    const ch = r.r >= r.g && r.r >= r.b ? 0 : r.g >= r.b ? 1 : 2;
    box.sort((a, b) => a[ch] - b[ch]);
    const mid = box.length >> 1;
    boxes.splice(target, 1, box.slice(0, mid), box.slice(mid));
  }

  return boxes.map(averageColor);
}

/** ディザなしでパレットへ量子化（破壊的）。 */
export function applyPalette(imageData, palette) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const c = nearestColor(data[i], data[i + 1], data[i + 2], palette);
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
  }
  return imageData;
}
