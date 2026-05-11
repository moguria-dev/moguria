# Moguria Asset Pipeline

## 基本方針
素材は「使う時に読む」。最初に全部読まない。

## ディレクトリ方針

```text
assets/
  manifest.json
  images/
    ui/
    characters/
    enemies/
    stages/
    effects/
  sounds/
    se/
  bgm/
  video/
```

## manifest運用
`assets/manifest.json` に素材を登録する。

- `critical`: 初回表示に必須
- `lazy`: 使う可能性はあるが初回不要
- `packs`: ステージ、イベント、音声セットなど単位別

## ステージ追加時
新ステージを追加する時は、ステージ突入前に該当packだけ読む。
ホーム表示時に全ステージ素材を読まない。

## 更新追加時
将来オンライン更新を行う場合は、manifestのversionを見て差分確認する。
失敗した場合は前回のローカルキャッシュで起動する。

## 禁止事項
- 画像をコードにbase64で直書きしない
- 使っていない素材をcriticalに入れない
- BGMを複数同時にpreloadしない
- 動画をゲーム中の必須演出にしない
