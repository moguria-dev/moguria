# Non-destructive recovery

Recovery starts by preserving evidence and user work. This guide never authorizes a GitHub write, rollback, or publication.

## Stop and observe

Do not stack additional fixes on an unexplained failure. Capture:

```bash
git status --short --branch
git branch --show-current
git rev-parse HEAD
git remote -v
git diff --
git diff --cached --
git log --oneline -n 12
```

Also record:

- repository and expected branch;
- public/local URL and viewport;
- exact symptom and last known good behavior;
- console/network errors;
- Pages/build status when publication is involved;
- whether the worktree contained pre-existing or untracked user files;
- whether a save, manifest, Service Worker, or deployment setting changed.

These commands are diagnostic. Do not stage, stash, branch, tag, revert, merge, or push unless the relevant action is within explicit authority.

## Protect the worktree

- Treat every uncommitted and untracked file as user work until ownership is known.
- Identify exact affected paths and compare them individually.
- Do not discard the whole worktree or delete untracked files.
- Do not use broad restore, clean, reset, checkout-overwrite, or force operations.
- If a safe backup copy, patch, branch, or stash is desirable, explain what it will include and obtain authorization before creating it.
- When the user's change overlaps the requested target, stop and resolve ownership rather than overwriting it.

## Classify the failure

| Failure | First read-only checks |
| --- | --- |
| Local code regression | exact diff, script/style order, console stack, focused test |
| Missing asset | canonical/runtime manifests, exact path/case, network status, reference search |
| Animation regression | semantic state, atlas projection, anchor/facing, rig/scene tests, reduced-motion setting |
| Save/progression | current origin, save warning, runId/activeRun, save tests; preserve site data |
| Old public display | Pages source/head, build status, query strings, active SW registration/cache state |
| Failed publication | source branch/commit, Pages status, public response and changed-file 404s |

Do not assume every stale display is a Service Worker issue. Registration is currently disabled; verify actual registration and cache state before proposing cache action.

## Uncommitted local regression

1. Identify the exact file and the exact unwanted hunk.
2. Determine whether the hunk belongs to the current task or pre-existing user work.
3. Prepare a minimal inverse patch for only the confirmed unwanted hunk.
4. Show or review the patch before applying it when ownership is uncertain.
5. Re-run the failing focused check, then the affected suite.

Never solve an uncertain local regression by erasing all changes.

## Committed regression

1. Identify the exact bad commit and its dependencies using log/diff inspection.
2. Decide whether a forward fix or a revert commit is safer.
3. Creating a revert commit requires commit authorization.
4. Merging/pushing the revert requires the corresponding GitHub authority.
5. Determine whether the forward fix only needs a merge to protected `main` or also a separately authorized Pages workflow dispatch; under the current workflow configuration, the merge itself does not publish.
6. Test the result locally and verify the public result after an authorized publication.

Preserve history. Never rewrite the public branch to hide a bad release.

## Published regression recovery

The current Pages workflow publishes the checked-out `main` ref and rejects non-`main` refs. It does not accept an arbitrary historical SHA. Therefore the default rollback path is a reviewed forward fix or revert commit on a task branch, followed by a pull request to protected `main`.

1. Record the failing workflow run, deployment record, deployed full SHA, symptom, and last known good full SHA.
2. Prepare the smallest forward fix or revert on a task branch without rewriting shared history.
3. Run the canonical preflight and focused regression QA.
4. Obtain separate authorization for commit/push, pull request, and merge; satisfy the live `main` ruleset.
5. After the corrective commit is merged, record the new full `main` SHA and obtain separate deployment authorization.
6. Manually dispatch `.github/workflows/deploy-pages.yml` on `main` and verify the Actions run, `github-pages` deployment SHA, public URL, console, and affected critical flow.

Do not treat `develop-homeui2` as the default rollback path. Re-enabling branch publication, allowing a historical-SHA input, or otherwise changing the workflow is a distinct reviewed settings/workflow migration.

## Save-data incident

- Do not clear browser site data as a first response.
- Confirm the exact origin; localStorage is origin-scoped, so localhost cannot directly inspect the public origin's save.
- Capture the visible save warning and relevant console message without publishing personal data.
- The current loader quarantines malformed raw JSON under `moguria.corrupt.*` and starts from a normalized fresh payload.
- A manual backup uses `moguria.backup.*` when invoked by an available same-origin tool.
- Do not edit a user's save by hand unless the user explicitly requests recovery, a copy is preserved, and the migration is validated.
- Follow the schema and invariants in `docs/SAVE_SCHEMA.md`.

## Escalation template

```text
Repository:
Expected branch:
Current commit:
Local or public URL:
Last known good commit/build:

Symptom:
Reproduction:
Expected result:

git status --short --branch:
Relevant diff summary:
Console/network/Pages result:
Save/manifest/SW involvement:

Actions already taken:
Actions explicitly not yet authorized:
```
