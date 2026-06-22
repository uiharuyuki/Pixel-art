// プレビュー表示: ズーム/パン・元画像比較・ピクセルinspector。

const ZOOM_LEVELS = ["fit", 1, 2, 4, 8, 16, 32];

export function createViewer({ stage, canvas, original, showOriginalEl, inspectorEl, zoomInEl, zoomOutEl, zoomFitEl, zoomLabel }) {
  let zi = 0; // ZOOM_LEVELS index

  function applyZoom() {
    const z = ZOOM_LEVELS[zi];
    for (const el of [canvas, original]) {
      if (z === "fit") {
        el.classList.add("fit");
        el.style.width = el.style.height = "";
      } else {
        el.classList.remove("fit");
        const w = canvas.width || 1;
        el.style.width = w * z + "px";
        el.style.height = "auto";
      }
    }
    if (zoomLabel) zoomLabel.textContent = z === "fit" ? "Fit" : z + "x";
  }

  function setIndex(i) {
    zi = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, i));
    applyZoom();
  }

  zoomInEl?.addEventListener("click", () => setIndex(zi + 1));
  zoomOutEl?.addEventListener("click", () => setIndex(zi - 1));
  zoomFitEl?.addEventListener("click", () => setIndex(0));

  stage.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return; // Ctrl+ホイールでズーム
    e.preventDefault();
    setIndex(zi + (e.deltaY < 0 ? 1 : -1));
  }, { passive: false });

  showOriginalEl?.addEventListener("change", () => {
    const on = showOriginalEl.checked;
    canvas.style.display = on ? "none" : "";
    original.style.display = on ? "" : "none";
  });

  // inspector: カーソル下の変換後ピクセル色。
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.addEventListener("mousemove", (e) => {
    if (!inspectorEl || !canvas.width) return;
    const rect = canvas.getBoundingClientRect();
    const px = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
    const py = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);
    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return;
    const d = ctx.getImageData(px, py, 1, 1).data;
    const hex = d[3] === 0 ? "透明" : "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
    inspectorEl.textContent = `(${px}, ${py}) ${d[3] === 0 ? "透明" : `rgb(${d[0]},${d[1]},${d[2]}) ${hex}`}`;
  });
  canvas.addEventListener("mouseleave", () => { if (inspectorEl) inspectorEl.textContent = ""; });

  return { applyZoom, refresh: applyZoom };
}
