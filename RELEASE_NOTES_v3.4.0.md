# Moguria v3.4.0 — 第1章「帰り灯」プレイアブル・バーティカルスライス

> この文書は v3.4.0 のソースリリース内容を記録します。CI、protected `main` への統合、手動 Pages 配信、公開後 QA の完了証明ではありません。公開状態は GitHub の実行・deployment 記録と公開 URL で確認してください。

今回の公開範囲は、承認済みの4モーション構成と11点の本番画像を接続したプレイアブル・バーティカルスライスです。Game Design v0.1 のreview draftにある7〜9分版の全ビートを実装済みとするものではなく、セーブ上の完了はこのバージョンで公開するルートの終端を表します。

## 今回の追加

- フルスクリーンの第1章ストーリープレイヤーを追加しました。背景・小道具・キャラクター・光の演出は Canvas2D、台詞・見出し・操作・状態通知は DOM が担当します。
- プレイヤー本体とストーリー素材は物語を開くときに読み込みます。11点の承認済み画像を4つの遅延パックへ分け、ホーム起動時の critical 17点は増やしていません。
- v3.4.0 の最終asset検証時点で、初期 script は384,026 bytes（約375 KiB）でした。この実測に基づき `initialScriptBytes` を358,400 bytesから393,216 bytesへ明示的に改定しました。Story player は初期読み込みへ移さず、131,072-byteの動的 script 枠を別管理します。Story pack 枠は1,048,576 bytes、初期 stylesheet 枠と critical 構成は据え置きです。
- Story 専用アニメーション projection v1 を `assets/animations/story-ch01.json` として追加しました。既存 Battle projection は v2 のままです。
- 帰り灯の異常、逆流と亀裂、星守りの救助、損傷片への意図的な長押し、4 Wave の調査、帰還、古い記録の不完全な応答、この縦切りルートの完了からホームまでを接続しました。
- 損傷片の操作には時間制限・失敗・QTE・分岐がありません。850 ms の長押し成立後、共同灯の回復、Moguの干渉とよろめき、そばに残る星の子、隠すような笑顔の順で進みます。
- 古い記録は一度だけ曖昧に応答し、正確な320 msの途切れを挟んで沈黙します。生存・人物・星守りの印・待つ者・アイテム獲得は確定しません。

## ゲームとセーブ

- 第1章調査用に `story-c1-investigation-v1` を追加しました。4 Wave、消費おなか0、再挑戦無料です。
- 通常冒険は12 Waveのままです。Wave 3/7のアーティファクト、Wave 7/12のボスを含む既存ルールは変更しません。
- セーブ payload を v4 に更新しました。localStorage key は `moguria.save.v2` のままで、通常進行とは独立して正規化される `story` 領域を追加しています。
- 新規プレイヤーは第1章がホームの主導線、既存プレイヤーは任意導線です。通常・物語を問わず `activeRun` があれば再開を最優先します。
- 調査終了だけでは公開ルートを完了扱いにしません。帰還と古い記録を再生し、この縦切りルートの完了を保存してからホームへ戻ります。

## 操作と表示

- `390×844` を基準、`375×667` をコンパクト回帰サイズとして、safe area、下部操作、台詞、長押しを確認対象にしています。
- pause、resume、ページの非表示/再表示で時計を飛ばさず、未発火の一回限りイベントを保持します。
- `prefers-reduced-motion` では装飾的な揺れ・粒子・ズームを抑えつつ、異常・救助・長押し・320 msの途切れという意味順序を残します。

## リリース前後の確認

- Canonical/runtime manifest parity、save v4 migration、通常/物語 run profile、4つの遅延パック、11画像、critical不変を自動検証します。
- Chromium / WebKit で `390×844` と `375×667` のHome入口、遅延読込、0報酬Story runの開始・精算・ledger復帰、6つの代表Story状態、4モーション計14枚のmarker前後Canvas証跡を確認します。DOM/Canvas整列、素材読込、safe area、長押し表示、reduced motion、console/network異常も同じrunnerで監査します。戦闘そのものは擬似実行せず、4 Wave profile、checkpoint、再挑戦、通常run不変、回想不変条件はNodeの契約テストで別に確認します。
- 4演出の runtime video と pivot overlay は静止画とは別の必要証跡です。
- 実機 iPhone Safari は **required-pending** です。実施されるまで、WebKitエミュレーションを実機確認済みとは扱いません。
- 公開は task branch → pull request → protected `main` → 承認済み手動 `.github/workflows/deploy-pages.yml` → GitHub Pages の順です。mergeだけでは公開されません。
