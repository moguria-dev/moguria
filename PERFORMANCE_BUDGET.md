# Moguria Performance Budget（互換ポインタ）

数値上限の唯一の正本は `config/project-state.json#/performanceBudgets` です。旧版に記載されていた2MB目標は、現行のcritical素材と矛盾するため規範値として使用しません。

- 自動測定: `npm run validate:assets`
- 総合gate: `npm run ci`
- 実機・代表高負荷scene: `docs/TESTING.md`
- 素材別の扱い: `docs/ASSETS.md`

数値を変更する場合は、測定根拠と対象端末・sceneを記録し、`project-state`だけを更新して検証を通します。

v3.4.0 の measured budget revision は `docs/ASSETS.md` と `RELEASE_NOTES_v3.4.0.md` に根拠を記録済みですが、現在の数値上限の正本は引き続き `config/project-state.json#/performanceBudgets` です。
