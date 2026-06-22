import { test } from "node:test";
import assert from "node:assert";
import { srgbToOklab, oklabToSrgb } from "../js/worker/color.js";

test("sRGB→OKLab→sRGB ラウンドトリップ誤差が小さい", () => {
  const lab = [0, 0, 0];
  const rgb = [0, 0, 0];
  const samples = [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255], [123, 45, 200], [10, 200, 90]];
  for (const [r, g, b] of samples) {
    srgbToOklab(r, g, b, lab);
    oklabToSrgb(lab[0], lab[1], lab[2], rgb);
    assert.ok(Math.abs(rgb[0] - r) <= 1, `r ${r}->${rgb[0]}`);
    assert.ok(Math.abs(rgb[1] - g) <= 1, `g ${g}->${rgb[1]}`);
    assert.ok(Math.abs(rgb[2] - b) <= 1, `b ${b}->${rgb[2]}`);
  }
});

test("白の方が黒よりOKLab Lが大きい", () => {
  const w = [0, 0, 0], k = [0, 0, 0];
  srgbToOklab(255, 255, 255, w);
  srgbToOklab(0, 0, 0, k);
  assert.ok(w[0] > k[0]);
});
