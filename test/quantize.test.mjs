import { test } from "node:test";
import assert from "node:assert";
import { collectSamples, kmeans, medianCut, paletteFromRGB } from "../js/worker/quantize.js";

// 赤・緑・青・白が均等に並ぶ 2x2 画像。
function rgbwImage() {
  return new Uint8ClampedArray([
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 255, 255,
  ]);
}

test("collectSamples は不透明色を数える", () => {
  const s = collectSamples(rgbwImage());
  assert.equal(s.length, 4);
});

test("collectSamples は透明を除外", () => {
  const data = new Uint8ClampedArray([255, 0, 0, 0, 0, 255, 0, 255]);
  assert.equal(collectSamples(data).length, 1);
});

test("kmeans は4クラスタを分離する", () => {
  const s = collectSamples(rgbwImage());
  const pal = kmeans(s, 4, [], 10, 1);
  assert.equal(pal.length, 4);
  // 各入力色に十分近いパレット色が存在する。
  for (const [r, g, b] of [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]]) {
    const ok = pal.some((c) => Math.abs(c.r - r) < 30 && Math.abs(c.g - g) < 30 && Math.abs(c.b - b) < 30);
    assert.ok(ok, `近い色が無い: ${r},${g},${b}`);
  }
});

test("kmeans はロック色を保持する", () => {
  const s = collectSamples(rgbwImage());
  const locked = paletteFromRGB([[255, 0, 0]]);
  const pal = kmeans(s, 4, locked, 10, 1);
  assert.ok(pal.some((c) => c.r === 255 && c.g === 0 && c.b === 0));
});

test("medianCut は指定数以下のパレットを返す", () => {
  const s = collectSamples(rgbwImage());
  const pal = medianCut(s, 3);
  assert.ok(pal.length <= 3 && pal.length >= 1);
});
