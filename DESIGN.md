# ドット絵変換ツール — 実装設計書 (Redesign)

> この文書は実装に着手する前の設計合意用。既存の v1（RGBメディアンカット + バイリニア縮小）は本設計で **全面置換** する。

## 0. 背景と目的
- 画像をドット絵へ変換する、完全に自分用のブラウザツール。処理は **全てクライアントサイド**（画像は外部送信しない）。
- ベンチマークは Color Quantizer (raky.net) ＝「高品質な色削減」の定番。**その劣化版にしない**ことが要件。
- 勝ち筋（差別化テーゼ）: **「色削減品質で並び、ドット絵ネイティブな前後処理・作業性で上回る」**。
- 方針: 画質・ワークフロー双方を追求 / 透明(アルファ)対応は最初から設計に組込む / ビルド不要の Vanilla を維持しつつ性能は Web Worker で確保。

## 1. 設計思想
1. **知覚均等色空間 (OKLab) を全色処理の基準にする** — 距離計算・クラスタリング・ディザを OKLab で行う。RGB処理の「濁り」を根絶する最大の効きどころ。
2. **パイプラインを純関数のステージに分解** — 各段は入力→出力が決まる純関数。段ごとにキャッシュし、変更箇所だけ再計算。
3. **重処理は Worker、UIは即応** — ドラッグ中はプレビュー品質、操作が落ち着いたらフル品質（プログレッシブ）。
4. **設定は単一のシリアライズ可能 state** — プリセット保存・URL共有・Undo/Redo が自然に成立。
5. **インデックス(パレット番号)バッファを保持** — パレットの色編集は再マッピングのみで即反映（再量子化しない）。

## 2. 全体アーキテクチャ
```
[Main thread]                         [Worker thread]
 UI / events / state ──settings──▶  pipeline orchestrator
 source ImageData  ──(transfer)─▶  ├ resample
 palette panel編集 ───────────────▶  ├ quantize (OKLab, k-means/wu)
 canvas描画  ◀──result+palette───  ├ dither
 inspector/compare                  ├ cleanup
                                    └ stageキャッシュ
```
- **Main**: 入力イベント、state管理、source保持、結果の最終描画、パレットパネル操作、before/after・inspector。
- **Worker**: パイプライン実行。`new Worker(url, { type: "module" })` でES Module worker化。Transferable(ArrayBuffer) でゼロコピー受け渡し。
- **ステージ依存とキャッシュ**（変更箇所だけ再計算）:
  - resample ← (source, 出力幅/高, 方式, グリッドoffset, preprocess)
  - quantize ← (resampled, パレットmode/K/ロック色/色空間/algo)
  - dither ← (resampled, palette, dither設定)
  - cleanup ← (indexed, cleanup設定)
  - **パレット色の編集 ← indexedバッファの再マップのみ（最速）**

## 3. データモデル（state）
```js
settings = {
  resample:   { width, method:"average|dominant|median|nearest",
                offsetX, offsetY, autoGrid:bool },
  preprocess: { brightness, contrast, saturation, hue, sharpen },
  quantize:   { space:"oklab", mode:"auto|preset|imported",
                K, preset:"gameboy|pico8|nes|...", imported:[rgb],
                locked:[rgb], algo:"kmeans|wu" },
  dither:     { type:"none|floyd|bayer|bluenoise", strength,
                serpentine:bool, matrix:"2|4|8" },
  cleanup:    { despeckle:bool, mergeThreshold,
                outline:{on,color,width},
                transparency:{mode:"keep|colorkey|edge", key, tolerance, defringe} },
  export:     { scale, grid:bool, format:"png" }
}
```
- localStorage に名前付きプリセット保存（＝自分のレシピ）。
- `location.hash` に圧縮シリアライズして再現/共有。
- Undo/Redo は state スナップショットのスタック。

## 4. 色科学 (color.js)
- sRGB(0–255) → 正規化 → 逆ガンマ(linear) → OKLab。距離は OKLab ユークリッド(ΔEok)、必要に応じ L と ab に重み。
```
linearize: c<=0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4
linRGB→OKLab: Ottosson の行列 + 立方根（lms→l'm's'→Lab）
逆変換: OKLab→linRGB→ガンマ→sRGB （書き出し時）
```
- 最適化: 逆ガンマは 256要素LUT。立方根はホットパスなので必要なら高速近似。resample後の小画像(例 128×128)が対象のため Worker 上で十分軽い。
- Node テストで sRGB→OKLab→sRGB のラウンドトリップ誤差を検証。

## 5. パイプライン詳細

### 5.1 Decode / Load
- File / Drag&Drop / クリップボード貼付 → `createImageBitmap` → source ImageData。
- **アルファ保持**。完全透明画素は以降の統計から除外フラグ。

### 5.2 Preprocess
- 明るさ/コントラスト/彩度（v1の式を踏襲）＋ 任意で色相回転・軽いシャープ（縮小前のディテール保持）。

### 5.3 Resample（縮小）— ボケ対策
- 出力幅指定、高さはアスペクト比維持。各セル＝source領域を集約:
  - **average**: 面積平均（アルファ重み付き）。
  - **dominant(最頻色)**: 粗ビンで多数決。フラットな絵で最も綺麗。
  - **median**: チャンネル別中央値。ノイズに強い。
  - **nearest**: 中心画素。
- セル境界に対する **グリッド x/y ナッジ**。
- **ピクセルグリッド自動検出**（拡大済みドット絵の1:1復元）: 行/列の勾配強度信号の **自己相関のピーク** からセル周期と位相(offset)を推定。
- アルファ: 集約はアルファ重み付き、部分被覆はカバレッジとして alpha に反映。

### 5.4 Quantize（減色）— 画質の核
- **色空間 OKLab**。
- 主経路 **重み付き k-means**:
  1. resampled の一意色＋出現数を収集（不透明のみ）。
  2. **k-means++** で K 個を播種。
  3. **Lloyd 反復**（5–10回、出現数で重み付け）を OKLab で実行。
  4. centroid → sRGB へ逆変換しパレット化。
- 高速経路 **Wu（分散最小化）/ median-cut**: ドラッグ中プレビューや k-means の種に使用。
- **パレットmode**: auto(K色) / preset(GB・PICO-8・NES) / imported(.hex/.gpl/.pal/.png 読込)。
- **色ロック**: 指定色は centroid 固定（Lloydで更新しない）、残りを最適化。割当は全色から最近傍。
- アルファ対応: 透明画素は量子化対象外、結果でも透明維持。

### 5.5 Dither
- none / **Floyd–Steinberg**(誤差拡散) / **Bayer**(2/4/8) / **blue-noise**(void-and-cluster パターン)。
- **OKLab上で実行**（誤差・閾値とも知覚空間）。
- **strength** スライダー（誤差/閾値振幅のスケール）、**serpentine** 走査（方向性アーティファクト低減）。
- 出力は **indexed バッファ + palette**（後段の再マップ高速化）。

### 5.6 Cleanup / Postprocess — 差別化
- **despeckle**: 孤立1pxの除去（周囲多数色へ）。
- **merge**: 近似パレット色を閾値で統合。
- **outline**: スプライト外周に1px縁取り（色・幅指定）。
- **transparency**:
  - colorkey: 指定色±許容差(OKLab)を透明化（任意で外周からのflood限定）。
  - edge: 外周連結領域のみ透明化。
  - **defringe**: 半透明エッジのRGB汚染を近傍不透明色でブリード補正。

### 5.7 Render / Export (export.js)
- プレビュー: indexed→RGBA を canvas に putImageData、CSS `image-rendering:pixelated` で拡大表示。
- 書き出し: **原寸PNG** ＋ **拡大PNG**（nearest, 倍率/グリッド線）、**パレット書き出し**(.hex/.gpl/PNGストリップ)、**クリップボードコピー**。

## 6. パフォーマンス戦略
- Worker + Transferable でメインスレッド非ブロック。
- **プログレッシブ品質**: 操作中は Wu+ディザ簡略の即時プレビュー、idle(〜150ms)でフルk-means。
- ステージキャッシュ（§2）で部分再計算。
- パレット色編集は indexed 再マップのみ。
- 対象は resampled 後の小画像なので計算量は小さい（WebGPUは将来の任意高速化）。

## 7. ファイル構成
```
index.html
css/style.css
js/
  main.js               UIコントローラ
  state.js              settings/presets/undo/urlhash
  ui/controls.js        入力⇄state束ね
  ui/palette-panel.js   編集可能スウォッチ（recolor/lock/delete）
  ui/compare.js         before/after・ズーム/パン・inspector
  worker/pipeline.worker.js  ステージ統括・キャッシュ・transfer
  worker/color.js       sRGB⇄linear⇄OKLab・距離
  worker/resample.js    average/dominant/median/nearest・grid検出
  worker/quantize.js    kmeans(++)/wu・locked・alpha対応
  worker/dither.js      FS/bayer/bluenoise・serpentine・strength
  worker/cleanup.js     despeckle/merge/outline/transparency/defringe
  worker/blue-noise.js  void-and-cluster パターン生成
  export.js             png/palette/clipboard
test/                   Node実行の純関数テスト(color/quantize/resample/dither)
```

## 8. テスト戦略
- `node --test`（.mjs）で DOM 非依存の純関数を検証:
  - color: OKLab ラウンドトリップ誤差。
  - quantize: 分離可能な点群を正しくK分割／locked固定の確認。
  - resample: 既知小入力の集約結果。
  - dither: パレット帰属・誤差保存・serpentine。

## 9. 実装フェーズ（マイルストーン）
- **M0 基盤**: 骨組み、state、Worker土台、color.js + テスト。
- **M1 品質コア**: resample(average)→quantize(k-means/OKLab)→描画。Worker即応。← v1を即座に超える地点。
- **M2 パレット**: preset/import/locked + 編集可能パレットパネル（indexed再マップ）。
- **M3 ディザ**: FS/Bayer/blue-noise(OKLab)・strength・serpentine。
- **M4 ドット絵リサンプル**: dominant/median/nearest・grid offset・自動検出。
- **M5 アルファ&クリーンアップ**: 透過(colorkey/edge)・defringe・despeckle・merge・outline。
- **M6 ワークフロー**: before/after・inspector・プリセット・URLハッシュ・Undo/Redo・各種書き出し。
- **M7 仕上げ/任意**: バッチ変換、UI調整。

## 10. 将来拡張
- WebGPU でマッピング/ディザ高速化、スプライトシート/Aseprite書き出し、変換後の手描き修正エディタ、アニメフレーム。

## 11. 検証方法
1. `node --test` で色計算・各アルゴリズムの単体検証。
2. `python3 -m http.server` で起動し、写真/イラスト/既存ドット絵の3種で:
   - パラメータ変更が Worker 経由で即反映されUIが固まらない。
   - OKLab経路が RGB経路より色再現が良い（before/after・元画像比較）。
   - 透過PNGで背景透過・defringeが効く。
   - パレット色編集が即反映、プリセット保存/URL復元/Undoが動作。
3. GitHub Actions で main へ自動デプロイ（既存 workflow を踏襲）。
```
```
