import { test } from "node:test";
import assert from "node:assert";
import { ditherImage, renderIndices } from "../js/worker/dither.js";
import { paletteFromRGB } from "../js/worker/quantize.js";

const palette = paletteFromRGB([[0, 0, 0], [255, 255, 255]]);

function grayImage(v, alpha = 255) {
  return { width: 2, height: 2, data: new Uint8ClampedArray([v, v, v, alpha, v, v, v, alpha, v, v, v, alpha, v, v, v, alpha]) };
}

test("ディザなし: 明るい画素は白へ", () => {
  const { indices } = ditherImage(grayImage(240), palette, { type: "none" });
  assert.ok(indices.every((i) => i === 1));
});

test("ディザなし: 暗い画素は黒へ", () => {
  const { indices } = ditherImage(grayImage(20), palette, { type: "none" });
  assert.ok(indices.every((i) => i === 0));
});

test("透明画素は index -1", () => {
  const { indices } = ditherImage(grayImage(128, 0), palette, { type: "none" });
  assert.ok(indices.every((i) => i === -1));
});

test("Floyd: 中間調はパレット内のindexになる", () => {
  const { indices } = ditherImage(grayImage(128), palette, { type: "floyd", strength: 100 });
  assert.ok(indices.every((i) => i === 0 || i === 1));
});

test("renderIndices は透明を alpha 0 にする", () => {
  const img = grayImage(128, 0);
  const { indices, alpha } = ditherImage(img, palette, { type: "none" });
  const rgba = renderIndices(2, 2, indices, alpha, palette);
  for (let i = 3; i < rgba.length; i += 4) assert.equal(rgba[i], 0);
});
