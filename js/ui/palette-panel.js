// 編集可能パレットパネル。スウォッチの再着色/ロック/削除。

function hex([r, g, b]) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function renderPalette(container, palette, handlers) {
  container.innerHTML = "";
  palette.forEach((c, i) => {
    const sw = document.createElement("div");
    sw.className = "swatch";
    sw.style.background = `rgb(${c.r},${c.g},${c.b})`;
    sw.title = `${hex([c.r, c.g, c.b])} — クリック:再着色 / L:ロック / 右クリック:削除`;

    // クリックで再着色
    sw.addEventListener("click", () => {
      const picker = document.createElement("input");
      picker.type = "color";
      picker.value = hex([c.r, c.g, c.b]);
      picker.style.position = "absolute";
      picker.style.opacity = "0";
      document.body.appendChild(picker);
      picker.addEventListener("change", () => {
        const m = /#(..)(..)(..)/.exec(picker.value);
        handlers.onRecolor(i, [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]);
        picker.remove();
      });
      picker.click();
    });

    // ロック
    const lock = document.createElement("button");
    lock.className = "swatch-lock";
    lock.textContent = "🔒";
    lock.title = "この色をロック（再変換でも保持）";
    lock.addEventListener("click", (e) => {
      e.stopPropagation();
      handlers.onLock([c.r, c.g, c.b]);
    });
    sw.appendChild(lock);

    // 削除（右クリック）
    sw.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      handlers.onDelete(i);
    });

    container.appendChild(sw);
  });

  const info = document.createElement("div");
  info.className = "palette-count";
  info.textContent = `${palette.length} 色`;
  container.appendChild(info);
}
