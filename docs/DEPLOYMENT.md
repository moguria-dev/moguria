# Deployment

Deployment is an explicit release action. Creating or editing files, opening a pull request, merging a pull request, and publishing GitHub Pages are separate authorities. The machine-readable branch and deployment state is `config/project-state.json`.

## Current release state

| Item | Current value |
| --- | --- |
| Provider | GitHub Pages |
| Public URL | `https://moguria-dev.github.io/moguria/` |
| Mode | `github-actions` |
| Release source | protected `main` |
| Workflow | `.github/workflows/deploy-pages.yml` |
| Publish trigger | authorized manual `workflow_dispatch` |
| Publish on push | `false` |
| Migration status | `complete` |
| Service Worker | Disabled |

`develop-homeui2` is retained only as a recoverable legacy branch. It is not the development branch, integration branch, pull-request target, release branch, or active publication path. `config/project-state.json.branches.legacyPagesBranch.automaticMergeAllowed` is `false`; do not automatically merge `main`, task branches, or the historical `develop` branch into it.

The active release path is:

```text
task branch -> pull request -> protected main -> authorized workflow_dispatch -> GitHub Pages
```

Merging a pull request into `main` neither authorizes nor triggers deployment. A separately authorized actor must manually dispatch the Pages workflow for an approved full commit SHA. The workflow deploys only the prepared artifact from `main` and does not mutate source branches.

The migration was verified with workflow run `31750308477` from 2026-08-14 07:31:34 to 07:32:56 JST: both `Preflight release candidate` and `Deploy approved main artifact` succeeded for `120c33b118940174bb0046dc42eedfcefe6c97d3`. The latest resulting `github-pages` deployment record was `5897163613` on ref `main` at the same full SHA, and post-deployment public QA passed at the Pages URL.

Current values in `config/project-state.json` are:

| Item | Current value |
| --- | --- |
| Development and release branch | `main` |
| Mode | `github-actions` |
| Workflow | `.github/workflows/deploy-pages.yml` |
| Source branch | `main` |
| Trigger | `workflow_dispatch` |
| Publish on push | `false` |

The active `Moguria main protection` ruleset requires pull requests and the strict `Dependency-free preflight` check, and blocks deletion and non-fast-forward updates. Its approval count is zero and review-thread resolution is not required. Do not document either review setting as enabled unless the live ruleset changes. Keep `develop-homeui2` isolated as a recoverable legacy branch; do not use it as an integration path.

## Completed migration record

The migration completed these steps:

1. Confirm that `main` contains the reviewed runtime tree, validators, CI workflow, and Pages workflow.
2. Enable protection on `main`: required pull requests, required CI, no force-push, and no deletion.
3. Verify `.github/workflows/deploy-pages.yml` is manual-only and accepts publication from `main` only.
4. Change GitHub Pages build/deployment source from legacy branch publishing to GitHub Actions.
5. Dispatch the workflow for an approved full SHA on `main`.
6. Verify the workflow run, environment/deployment record, deployed full SHA, public URL, and critical user flow.
7. After successful verification, update `config/project-state.json.deployment.current` and `migrationStatus` to the observed settings.
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
| Write to legacy `develop-homeui2` | Explicit branch-write authorization; it is not an active publication path under the current workflow configuration |
| Change Pages or branch-protection settings | Authorized repository administrator |

Never infer stage, commit, push, pull request, merge, release, workflow dispatch, or deployment permission from an implementation request.

## Release procedure

1. Confirm repository, task branch, target branch `main`, and exact full SHA.
2. Inspect staged and unstaged scope; exclude unrelated files, source-only art, debug output, and secrets.
3. Run `config/project-state.json.validation.commands.preflight` and required browser QA.
4. Open the pull request to `main` only when authorized.
5. Merge only when authorized and required CI/reviews pass.
6. Obtain separate deployment authorization for the merged full SHA.
7. Dispatch `.github/workflows/deploy-pages.yml` manually.
8. Verify the Actions run, Pages deployment record, public URL, changed asset paths, console, and critical flow.
9. Report branch, deployed full SHA, checks, public result, and any remaining uncertainty.

Do not use `develop-homeui2` for ordinary releases. Any recovery that writes or redeploys legacy content requires explicit rollback and deployment authorization.

## Service Worker and rollback

Service Worker registration remains disabled. Enabling it is a distinct reviewed change requiring `validation.commands.serviceWorker`, offline/update testing, cache-version planning, and a rollback path.

For an Actions deployment rollback, prepare a reviewed forward fix or revert through protected `main`, then separately authorize and dispatch the manual workflow for the new merged full SHA. The current workflow checks out `main`, rejects non-`main` refs, and does not accept an arbitrary historical SHA. Do not rewrite shared history, force-push, use destructive clean/restore commands, or copy a broad directory over the repository. Re-activating or writing the retained legacy branch is a distinct recovery decision and needs explicit authorization.

After publication or rollback, report what was deployed, the full SHA, verification performed, and whether public QA was completed or remains unverified.
