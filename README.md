# Moguria v3.2.1 — battle-v3

スマホ向けブラウザローグライトRPG「Moguria」の `develop-homeui2` 戦闘刷新版です。

## この版の主な変更

- Phaser 4.2.1を戦闘開始時だけ読み込み、4枚のKV背景を継ぎ目なく奥行き合成し、アトラスアニメーションを単一Sceneで描画します。
- Mogu・通常敵・仲間・ボスを本番アトラスへ置換し、仲間は独立追従・独立射撃します。
- ボス行動を「予兆→攻撃→硬直」の状態機械に変更しました。
- save v3で途中再開、runId単位の原子的な報酬精算、二重付与防止に対応しました。
- 装備効果を実戦闘パラメータへ接続し、装備レベルを全効果へ反映します。
- 選択画面を含む途中再開、読込タイムアウト／再試行、PC表示幅、背景・キャラクター動作を `node --test` で検証できます。

- 公開GitHub Pagesでは `#dev` / `?dev=1` だけで開発メニューが出ないようにしました。
- セーブ保存・読み込みを `try/catch` で保護し、壊れたセーブJSONを `moguria.corrupt.*` に退避できるようにしました。
- 開発ブランチでは Service Worker を標準OFFにし、古い `moguria-core-*` キャッシュを起動時に掃除します。
- ホーム画面のスタートボタンを `innerHTML` 丸ごと差し替えず、アイコンを保持したまま文言だけ更新します。
- ホーム画面初期化の多重実行を防止しました。
- 図鑑・記録・装備・ガチャ・おでかけUIで、動的値をHTMLエスケープしてから描画します。
- ホーム背景にCSSベースの洞窟光、ランプ火、光粒子、鉱石きらめき、Mogu呼吸演出を追加しました。
- `prefers-reduced-motion` に対応しました。

## 起動方法

ローカルサーバー経由で開いてください。

```bash
python3 -m http.server 8000
```

その後、ブラウザで `http://localhost:8000/` を開きます。

## 開発メニュー

開発メニューは以下の条件をすべて満たす時だけ表示されます。

- `localhost` または `127.0.0.1` で開いている
- URL末尾に `#dev` または `?dev=1` がある
- `MoguriaConfig.security.devToolsEnabled` が `true`

公開URLでは `#dev` を付けても表示されません。

## Service Worker

`develop-homeui` ではキャッシュ事故を避けるため、`MoguriaConfig.assets.registerServiceWorker` を `false` にしています。
リリースで有効化する場合は、`service-worker.js` の `CACHE_NAME` と `CORE_ASSETS` を更新してください。
