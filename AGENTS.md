# Moguria repository instructions

This file applies to the whole repository. It is an operating guide for people and coding agents; it does not grant GitHub write or release authority.

## Read first

1. Read `config/project-state.json` and verify that the repository, working branch, public URL, runtime entry point, Service Worker state, versions, budgets, validation commands, and manifest paths match the task.
2. Read `docs/AGENT_ENVIRONMENT.md` when work involves Codex permissions, connector capabilities, network access, sandboxing, or agent/Skill behavior.
3. Read only the documents relevant to the change:
   - current implementation: `docs/CURRENT_STATE.md` and `docs/ARCHITECTURE.md`
   - images and UI assets: `docs/ASSETS.md`
   - character or battle motion: `docs/ANIMATION.md`
   - persistence or progression: `docs/SAVE_SCHEMA.md`
   - verification: `docs/TESTING.md`
   - release or rollback: `docs/DEPLOYMENT.md` and `docs/RECOVERY.md`
4. Inspect the current branch and the affected code. Historical release notes and the changelog are context, not current specifications.

If a document conflicts with executable code, a checked-in manifest, or GitHub Pages settings, do not silently choose one. For a read-only task, report the mismatch. Before a risky change, stop and resolve it.

## Sources of truth

- The user's current instruction defines scope and authorization.
- The Moguria project workflow defines approval gates, visual quality gates, and minimum QA.
- `config/project-state.json` is the machine-readable source for repository/runtime/deployment state, versions, budgets, validation commands, and manifest relationships.
- `config/asset-manifest.json` is the canonical asset inventory. `assets/manifest.json` is the runtime-compatible projection consumed by the current application.
- `config/animation-manifest.json` is the canonical animation contract. `assets/images/battle-v3/atlas.json` is the current renderer-compatible projection.
- Code, configuration, and tests are the executable truth for behavior.
- GitHub settings are the truth for Pages source, protection, and publication state.

Until automated generation is installed, a change to a canonical manifest and its runtime projection must be made in the same commit and validated for parity. A path under `project-state.generated` is a compatibility output, not proof that an automatic generator ran.

## Change boundaries

- Make the smallest change that satisfies the request. Do not reformat, rename, remove legacy assets, update dependencies, or refactor unrelated code.
- Preserve user changes and unrelated working-tree changes. Stage only explicitly confirmed paths.
- Do not add previews, QA captures, source mockups, ZIPs, or task-specific upload READMEs to production changes.
- Do not extract production assets from key visuals, screenshots, mockups, or composite review sheets.
- Treat `assets/images/battle-v2`, `assets/images/home`, `assets/images/kv-*`, and other prior-generation paths as unclassified legacy until a reference audit proves whether each file is removable.
- New dependencies, save migrations, shared foundations, and deployment changes require an explicit decision before implementation when they materially expand risk or scope.

## Git and publication safety

- The repository is `moguria-dev/moguria`.
- The current Pages source is `develop-homeui2` at `/`. A push or merge to that source branch publishes the site; push and publication cannot be treated as independent operations in the current configuration.
- Stage, commit, push, PR creation, merge, deployment, release, and rollback are separate actions and each requires the authorization applicable to that action. A request to edit files authorizes none of them.
- Never force-push. Never discard the worktree wholesale. Never use broad restore, clean, or hard-reset operations.
- Diagnose with read-only commands first. Recovery must follow `docs/RECOVERY.md`.
- Before an authorized publication, re-check the source-branch head, exact diff, required validations, and public URL. If the head moved, inspect the semantic conflict once before continuing.

## Implementation invariants

- `MoguriaGame` owns movement, combat, waves, rewards, and checkpoint state. Phaser owns battle presentation and must not become a second game simulation.
- Preserve save compatibility. The localStorage key intentionally remains `moguria.save.v2` while the normalized payload is save version 3.
- A run consumes belly once, checkpoints only against its matching `runId`, and settles rewards once. Do not split run settlement across independent writes.
- Combat actions must remain semantically readable under reduced motion and low quality. Performance reductions may trim ambience, not remove attack, hurt, telegraph, recovery, or defeat meaning.
- Service Worker registration is currently off. Do not enable it until every core cache path is validated and the deployment decision is explicitly approved.

## Required verification

- Run the applicable commands under `config/project-state.json.validation.commands`: `project`, `assets`, `serviceWorker`, `html`, `tests`, and the full `preflight` gate before publication.
- The current baseline suite is `node --test tests/*.test.js` from the repository root.
- Use `390×844` for baseline mobile visual QA. Also use `375×667` when vertical fit or bottom controls may change, and a wide viewport when Canvas/DOM alignment may change.
- Verify only affected flows unless a shared foundation, save schema, renderer bridge, or deployment mechanism changes.
- Never report a test, device check, public check, or console check as passed unless it was actually performed.
