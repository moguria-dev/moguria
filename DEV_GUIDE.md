# Moguria Dev Guide

## バージョン更新時

1. `js/config.js` の version を更新する。
2. `VERSION.txt` を更新する。
3. `CHANGELOG.md` に変更点を書く。
4. 必要に応じて `DESIGN_NOTES.md` を更新する。

## 素材追加時

1. 素材を `assets/` 配下に置く。
2. `assets/manifest.json` に登録する。
3. 初回必須なら `critical`、後読みなら `packs` に入れる。
4. `#debug` でasset量とFPSを見る。

## 重くなった時の確認

- FPSが42未満になっていないか。
- bullets / drops / enemies が増えすぎていないか。
- critical assetが増えすぎていないか。
- BGMや動画を初回ロードしていないか。

## 通信追加時

- `MoguriaNetwork.fetchJson()` を使う。
- 通信失敗時のfallbackを必ず用意する。
- プレイ中に必須通信を発生させない。


## v1.8 Meta Progression Foundation
- MoguCoin（通貨）基盤を追加。
- 5部位装備、インベントリ、簡易ガチャ、装備強化の基盤を追加。
- おでかけ/チャレンジ入口を追加。
- 本格育成・サブコンテンツ実装前の軽量な導線として追加。
