# Moguria recovery guide (moved)

The canonical recovery procedure is now `docs/RECOVERY.md`.

The prior revision of this file contained broad worktree restore/cleanup examples and referenced a superseded branch. Those instructions are retired because they could remove uncommitted or untracked user work.

Recovery now follows these rules:

- inspect status, branch, head, diff and logs before changing anything;
- preserve all user and unrelated work;
- identify the exact affected path and hunk;
- use a minimal reviewed inverse patch or an authorized revert commit;
- treat rollback publication as a separately authorized deployment;
- never rewrite public history or erase the worktree as a recovery shortcut.

Use `docs/RECOVERY.md` for diagnosis, save-data incidents, committed regressions, rollbacks and the escalation template.
