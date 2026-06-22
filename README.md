# ドット絵変換ツール

画像をドット絵に変換する、自分用のブラウザツール。**画像処理はすべてブラウザ内（クライアントサイド）で完結**し、画像が外部に送られることはありません。ビルド不要・依存ゼロの Vanilla JS + Canvas + Web Worker で動きます。

設計の詳細は [DESIGN.md](./DESIGN.md) を参照。

## 特長
- **OKLab（知覚均等色空間）ベースの高品質減色**（k-means++ / median-cut）。
- **ドット絵特化のリサンプル**: 平均 / 最頻色 / 中央値 / 最近傍、グリッドオフセット、グリッド自動検出。
- **ディザリング**: なし / Floyd–Steinberg / Bayer / ブルーノイズ風（強度・serpentine）。
- **透過対応**: アルファ保持、カラーキー/外周からの透過、フリンジ除去。
- **クリーンアップ**: 孤立ピクセル除去、近似色マージ、アウトライン。
- **編集可能パレット**: スウォッチをクリックで再着色、ロック（再変換でも保持）、削除。
- **ワークフロー**: リアルタイムプレビュー（Worker）、Undo/Redo、プリセット保存(localStorage)、URLハッシュ再現、ズーム/ピクセルinspector、元画像比較。
- **書き出し**: 拡大PNG（倍率/グリッド線）、パレット(.hex/.gpl/PNG列)、クリップボードコピー。

## 構成
```
index.html / css/style.css
js/
  main.js              メインスレッド統括（Worker・入力・書き出し）
  state.js             設定state・プリセット・Undo/Redo・URLハッシュ
  palettes.js          固定パレット定義
  export.js            書き出し・パレット読込
  ui/controls.js       入力⇄state バインド
  ui/palette-panel.js  編集可能パレット
  ui/compare.js        ズーム/パン・inspector・元画像比較
  worker/pipeline.worker.js  パイプライン統括・段ごとキャッシュ
  worker/color.js      sRGB⇄linear⇄OKLab・距離
  worker/resample.js   縮小（average/dominant/median/nearest）・グリッド検出・前処理
  worker/quantize.js   k-means(++)/median-cut・色ロック・アルファ対応
  worker/dither.js     FS/Bayer/ブルーノイズ・serpentine・描画
  worker/cleanup.js    despeckle/merge/outline/透過/defringe
test/                  Node実行の純関数テスト
```

## 開発・実行（ローカル）
ES Modules + Worker のため `file://` 直開きでは動きません。簡易サーバ経由で開きます。
```bash
python3 -m http.server 8000
# http://localhost:8000 を開く
```

テスト（DOM非依存の色計算・各アルゴリズム）:
```bash
node --test
```

## GitHub Pages で公開
静的ファイルのみなのでそのまま公開できます。
1. **Settings → Pages → Source** を **GitHub Actions** にする（`.github/workflows/deploy-pages.yml` 同梱）。
2. デフォルトブランチ（`main`）にマージすると自動デプロイ。

## 今後の拡張候補
WebGPUによる高速化、スプライトシート/Aseprite書き出し、変換後の手描き修正エディタ、アニメフレーム。
