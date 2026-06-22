import { test } from "node:test";
import assert from "node:assert";
import { resample, preprocess, detectGridWidth } from "../js/worker/resample.js";

// 4x4、左半分黒・右半分白。
function halfImage() {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const i = (y * 4 + x) * 4;
      const v = x < 2 ? 0 : 255;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width: 4, height: 4, data };
}

test("average で 2x2 へ縮小すると左黒右白", () => {
  const out = resample(halfImage(), 2, 2, "average");
  assert.equal(out.width, 2);
  assert.equal(out.data[0], 0); // 左上=黒
  assert.equal(out.data[4], 255); // 右上=白
});

test("nearest でも左右の差が出る", () => {
  const out = resample(halfImage(), 2, 2, "nearest");
  assert.ok(out.data[0] < 128);
  assert.ok(out.data[4] > 128);
});

test("preprocess: 彩度0でグレースケール化", () => {
  const small = { width: 1, height: 1, data: new Uint8ClampedArray([200, 50, 50, 255]) };
  preprocess(small, { saturation: 0 });
  assert.equal(small.data[0], small.data[1]);
  assert.equal(small.data[1], small.data[2]);
});

test("detectGridWidth は周期的な縞でセル幅を推定", () => {
  // 8幅で2pxごとに反転する縞 → 周期2 → 推定幅≈4
  const w = 16, h = 4;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = Math.floor(x / 2) % 2 ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
    }
  const guess = detectGridWidth({ width: w, height: h, data });
  assert.ok(guess >= 4 && guess <= 12, `guess=${guess}`);
});
