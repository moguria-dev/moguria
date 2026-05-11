# Moguria レンタルサーバー公開ガイド

## 基本
zipを展開し、`moguria` フォルダの中身をサーバーの公開ディレクトリに配置します。
`index.html` にアクセスできれば動作します。PHPやDBは不要です。

## 推奨
- HTTPS対応サーバーで公開。
- gzip / brotli 圧縮を有効化。
- 画像・音声・動画には長めのCache-Controlを設定。
- `index.html` は更新反映しやすいように短めのキャッシュ。

## アップデート時
- `VERSION.txt` を更新。
- `CHANGELOG.md` に変更点を追記。
- service-worker.js のキャッシュ名を更新。
- 可能なら旧バージョンzipを保管。

## よくある問題
- 古いJSが残る: ブラウザキャッシュまたはService Workerを更新。
- LocalStorageが壊れる: 開発メニューのセーブ管理でバックアップ/初期化。
- iPhoneで重い: PERFORMANCE_BUDGET.md に従って素材サイズと同時表示数を確認。
