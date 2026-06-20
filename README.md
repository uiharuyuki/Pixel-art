# ドット絵変換ツール

画像をドット絵に変換する、自分用のブラウザツールです。**画像の処理はすべてブラウザ内（クライアントサイド）で完結**し、画像がサーバに送られることはありません。ビルド不要・依存ゼロの Vanilla JS + Canvas で動きます。

## 機能

- 画像読み込み（ファイル選択 / ドラッグ&ドロップ）
- ピクセル化（出力セル数を指定して縮小、アスペクト比は自動維持）
- 減色
  - 自動（メディアンカット、色数を指定）
  - 固定パレット（ゲームボーイ / PICO-8 / NES）
- ディザリング（なし / Floyd–Steinberg / Bayer）
- 前処理（明るさ / コントラスト / 彩度）
- **リアルタイムプレビュー**（パラメータ変更が即反映）
- PNG 書き出し（拡大倍率、グリッド線あり/なし）

## 使い方（ローカル）

ES Modules を使っているため、`index.html` を直接ダブルクリック（`file://`）では動きません。簡易サーバ経由で開いてください。

```bash
python3 -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```

## GitHub Pages で公開する

このリポジトリは静的ファイルのみなので、そのまま GitHub Pages で公開できます。

1. リポジトリの **Settings → Pages** を開く
2. **Build and deployment → Source** を **GitHub Actions** にする
   （`.github/workflows/deploy-pages.yml` が用意済みで、デフォルトブランチへの push 時に自動デプロイされます）
3. 表示された URL にアクセス

> 別ブランチで開発中の場合は、デフォルトブランチ（`main` 等）にマージすると公開されます。

## ファイル構成

```
index.html        UI レイアウト
css/style.css     スタイル
js/main.js        UI 配線・リアルタイムプレビュー統括
js/pipeline.js    前処理 / ピクセル化
js/quantize.js    メディアンカット減色・パレットマッピング
js/dither.js      Floyd–Steinberg / Bayer
js/palettes.js    固定パレット定義
js/export.js      PNG 書き出し
```

## 今後の拡張候補

- 変換後の手描き修正エディタ（ペン / Undo・Redo）
- 自作パレットの登録・保存
- アニメフレーム / スプライトシート出力
