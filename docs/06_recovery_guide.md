# Moguria 復旧ガイド

## 壊れたと思った時に最初にやること

まず、すぐに追加修正を重ねないでください。原因が見えなくなります。

```bash
git status
git diff
```

この2つの結果と、画面の症状を控えます。

## 未commitの変更を戻す

特定ファイルだけ戻す場合です。

```bash
git restore path/to/file
```

未commitの変更を全部戻す場合です。

```bash
git restore .
```

新規作成した未追跡ファイルも消す場合は、実行前に必ず `git status` を確認します。

```bash
git clean -fd
```

## commit済みの変更を安全に戻す

履歴を消さずに戻す場合は `revert` を使います。

```bash
git log --oneline
git revert <commit-id>
```

`reset --hard` は強力なので、使う前に必ずバックアップブランチやタグを作ってください。

## 作業前の安全手順

```bash
git checkout develop-homeui
git pull
git checkout -b feature/作業名
git tag backup-before-作業名
```

## 相談テンプレ

```text
Moguriaで破綻した可能性があります。まだ戻していません。
基準ブランチは develop-homeui です。

症状：
ここに症状を書く

git status:
ここに結果を貼る

git diff:
ここに結果を貼る

原因切り分けと安全な復旧手順を提案してください。
```
