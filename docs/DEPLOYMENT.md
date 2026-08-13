# Deployment

Deployment is an explicit release action. Creating or editing files, opening a pull request, merging a pull request, and publishing GitHub Pages are separate authorities. The machine-readable branch and deployment state is `config/project-state.json`.

## Current migration state

| Item | Current value |
| --- | --- |
| Provider | GitHub Pages |
| Public URL | `https://moguria-dev.github.io/moguria/` |
| Mode | `legacy-branch` |
| Pages source | `develop-homeui2`, repository root |
| Publish trigger | Every push or merge to `develop-homeui2` |
| Migration status | `planned` |
| Service Worker | Disabled |

`develop-homeui2` is only the temporary legacy Pages source. It is not the development branch, integration branch, pull-request target, or release branch. `config/project-state.json.branches.legacyPagesBranch.automaticMergeAllowed` is `false`; do not automatically merge `main`, task branches, or the historical `develop` branch into it.

While legacy Pages remains active, any push or merge to `develop-homeui2` is a publication. It therefore requires both repository-write authority and explicit publication authority for that operation.

At the 2026-08-14 audit baseline, the Pages source was `develop-homeui2` at `/`, the branch was unprotected, and administrative Pages/branch-protection endpoints were unavailable to the configured GitHub connector (`403`). An authorized repository administrator must verify and change those settings through GitHub. This is an audit-time capability note, not a permanent connector limitation.

## Target release flow

The target flow is:

```text
task branch -> pull request -> protected main -> authorized workflow_dispatch -> GitHub Pages
```

Target values in `config/project-state.json` are:

| Item | Target value |
| --- | --- |
| Development and release branch | `main` |
| Mode | `github-actions` |
| Workflow | `.github/workflows/deploy-pages.yml` |
| Source branch | `main` |
| Trigger | `workflow_dispatch` |
| Publish on push | `false` |

Merging a pull request into `main` neither authorizes nor triggers deployment. A separately authorized actor must manually dispatch the Pages workflow for an approved full commit SHA. The workflow must deploy only the prepared artifact from `main` and must not mutate source branches.

Protect `main` with required CI and pull-request review. Disable force-push and branch deletion. Keep `develop-homeui2` isolated as a recoverable legacy source until migration has been verified; do not use it as an integration path.

## Migration procedure

An authorized repository administrator should perform and record these steps:

1. Confirm that `main` contains the reviewed runtime tree, validators, CI workflow, and Pages workflow.
2. Enable protection on `main`: required pull requests, required CI, no force-push, and no deletion.
3. Verify `.github/workflows/deploy-pages.yml` is manual-only and accepts publication from `main` only.
4. Change GitHub Pages build/deployment source from legacy branch publishing to GitHub Actions.
5. Dispatch the workflow for an approved full SHA on `main`.
6. Verify the workflow run, environment/deployment record, deployed full SHA, public URL, and critical user flow.
7. Only after successful verification, update `config/project-state.json.deployment.current` and `migrationStatus` to the observed settings.
8. Preserve the legacy branch until rollback and retention decisions are explicitly approved.

Do not claim the target state is active merely because workflow files exist in the repository.

## Settings verification

For both migration and periodic review, verify in GitHub:

- repository default branch is `main`;
- `main` protection has the expected required checks and review rules;
- force-push and deletion are disabled for `main`;
- Pages build/deployment source matches `deployment.current`;
- the Pages environment and most recent deployment point to the intended full SHA;
- the target workflow uses `workflow_dispatch`, not a push trigger;
- no automatic merge path targets `develop-homeui2`.

Record observed values and date in `docs/CURRENT_STATE.md` only when the audit baseline changes. Keep long-lived intended values in `config/project-state.json`.

## Authorization boundaries

| Action | Authority required |
| --- | --- |
| Edit or validate a worktree | Explicit task scope; no publication authority implied |
| Stage, commit, or push a task branch | Explicit authorization for each requested Git operation |
| Open or update a pull request | Explicit PR authorization |
| Merge to protected `main` | Explicit merge authorization and satisfied branch rules |
| Dispatch the target Pages workflow | Separate explicit deployment authorization |
| Push or merge to current `develop-homeui2` | Explicit write and publication authorization because it publishes immediately |
| Change Pages or branch-protection settings | Authorized repository administrator |

Never infer stage, commit, push, pull request, merge, release, workflow dispatch, or deployment permission from an implementation request.

## Target release procedure

After migration to the target state:

1. Confirm repository, task branch, target branch `main`, and exact full SHA.
2. Inspect staged and unstaged scope; exclude unrelated files, source-only art, debug output, and secrets.
3. Run `config/project-state.json.validation.commands.preflight` and required browser QA.
4. Open the pull request to `main` only when authorized.
5. Merge only when authorized and required CI/reviews pass.
6. Obtain separate deployment authorization for the merged full SHA.
7. Dispatch `.github/workflows/deploy-pages.yml` manually.
8. Verify the Actions run, Pages deployment record, public URL, changed asset paths, console, and critical flow.
9. Report branch, deployed full SHA, checks, public result, and any remaining uncertainty.

Until migration is complete, follow the current-state warning above: a write to `develop-homeui2` publishes immediately.

## Service Worker and rollback

Service Worker registration remains disabled. Enabling it is a distinct reviewed change requiring `validation.commands.serviceWorker`, offline/update testing, cache-version planning, and a rollback path.

For a target Actions deployment rollback, redeploy a previously verified full SHA through the authorized manual workflow. Do not rewrite shared history, force-push, use destructive clean/restore commands, or copy a broad directory over the repository. During the legacy phase, reverting or pushing `develop-homeui2` is itself a publication and needs explicit authorization.

After publication or rollback, report what was deployed, the full SHA, verification performed, and whether public QA was completed or remains unverified.
