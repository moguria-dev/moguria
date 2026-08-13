# Moguria Security and Cheat Policy（互換ポインタ）

現行の報告窓口とclient trust boundaryは `SECURITY.md`、実装上の責任分界は `docs/ARCHITECTURE.md` を正本とします。

Moguriaは現時点で静的・localStorage中心のクライアントゲームです。ユーザー端末上の値やJavaScriptを競争結果の真正性として信用しません。ランキングや共有報酬を導入する場合は、server-side validation、認証、replay耐性、rate limit、監査ログを別途設計します。

公開時のセキュリティ確認は `npm run ci` と `docs/DEPLOYMENT.md` に従います。Service Workerは現在OFFです。
