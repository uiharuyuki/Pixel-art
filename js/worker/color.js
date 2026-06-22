// 色科学: sRGB ⇄ linear ⇄ OKLab と距離。DOM非依存（Worker/Node両用）。

// sRGB(0..255) → linear(0..1) の逆ガンマLUT。
const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function srgbToLinear(c8) {
  return SRGB_TO_LINEAR[c8];
}

function linearToSrgb8(c) {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  const n = Math.round(v * 255);
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

// linear RGB(0..1) → OKLab。out=[L,a,b] に書き込む。
export function linToOklab(r, g, b, out) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  out[0] = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  out[1] = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  out[2] = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  return out;
}

// OKLab → linear RGB(0..1)。out=[r,g,b]。
export function oklabToLin(L, a, b, out) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  out[0] = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  out[1] = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  out[2] = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return out;
}

const _lin = [0, 0, 0];

export function srgbToOklab(r8, g8, b8, out) {
  return linToOklab(SRGB_TO_LINEAR[r8], SRGB_TO_LINEAR[g8], SRGB_TO_LINEAR[b8], out);
}

export function oklabToSrgb(L, a, b, out) {
  oklabToLin(L, a, b, _lin);
  out[0] = linearToSrgb8(_lin[0]);
  out[1] = linearToSrgb8(_lin[1]);
  out[2] = linearToSrgb8(_lin[2]);
  return out;
}

// OKLab 2点間の二乗距離（ΔEok^2）。
export function labDist2(L1, a1, b1, L2, a2, b2) {
  const dL = L1 - L2;
  const da = a1 - a2;
  const db = b1 - b2;
  return dL * dL + da * da + db * db;
}
