# Moguria Asset Pipeline（互換ポインタ）

このファイルは旧ドキュメントへのリンクを壊さないために残しています。現在の素材運用は次を正本とします。

- 素材の源泉・lifecycle・hash・使用箇所: `config/asset-manifest.json`
- ランタイム互換出力: `assets/manifest.json`
- 素材制作・更新・廃止手順: `docs/ASSETS.md`
- 容量上限: `config/project-state.json#/performanceBudgets`
- 検証: `npm run validate:assets`、公開前は `npm run ci`

`assets/manifest.json`だけを単独更新しないでください。正本とランタイム互換出力は同じ変更で更新し、parity検証を通します。
