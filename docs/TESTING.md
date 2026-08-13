# Testing and QA

Run only the verification needed for the change, but never omit a test that protects the touched contract. `config/project-state.json.validation` is the machine-readable source for commands, canonical/runtime manifest paths, dynamic battle scripts, existing tests, required files, asset policy, and preflight requirements.

Current command keys are:

| Key | Command | Use |
| --- | --- | --- |
| `validation.commands.project` | `npm run validate:project` | project-state/schema/version/path consistency |
| `validation.commands.assets` | `npm run validate:assets` | canonical/runtime asset and animation parity plus budgets |
| `validation.commands.serviceWorker` | `npm run validate:service-worker` | registration state and cache-path safety |
| `validation.commands.html` | `npm run validate:html` | markup references, duplicate IDs and production HTML contract |
| `validation.commands.tests` | `node --test` | automated behavior tests |
| `validation.commands.preflight` | `npm run ci` | complete publication gate |

## Automated baseline

From the repository root:

```bash
node --test tests/*.test.js
```

Run a focused file while iterating, then the complete applicable suite before handoff or publication:

```bash
node --test tests/save-v3.test.js
node --test tests/battle-v3-scene.test.js
```

Use the exact Node version declared by `config/project-state.json.runtime.nodeVersion`. `.nvmrc`, package metadata, local validation, and CI must agree with that value.

Do not say “tests pass” unless the command completed successfully in the current branch/worktree. Record skipped, unavailable, flaky, or unperformed checks separately.

## Test ownership

| File | Main contracts |
| --- | --- |
| `tests/asset-manager.test.js` | critical decode/progress, timeout/retry, safe paths, Home manifest scope |
| `tests/main-startup.test.js` | blocking startup, accessible failure/retry, one-time initialization |
| `tests/battle-v3-loader.test.js` | Phaser/rig/scene load order, timeout, fallback health and retry |
| `tests/battle-v3-scene.test.js` | viewport/DOM alignment, atlas integrity, semantic animation, rig, facing, scale, cues and quality |
| `tests/mogu-rig.test.js` | authored curves, blending, repeat attack restart, deterministic clock and reduced motion |
| `tests/game-resume.test.js` | choice/reward/gameplay checkpoints, collect-all, defeat/give-up, prerequisite skills and exact reroll state |
| `tests/save-v3.test.js` | migration, single belly consumption, active run, checkpoint, atomic settlement and write failure |
| `tests/skill-icon-assets.test.js` | unique atlas cells, alpha/size, CSS mapping and small-size legibility |
| `tests/system-overlays.test.js` | accessible confirmation/loading overlays and exact equipment mutation |
| `tests/development-environment.test.js` | project-state, workflow, documentation, ownership and repository-governance contracts |

Manifest/project-state validation should additionally check:

- project-state schema and required paths;
- canonical/runtime manifest parity;
- every referenced file exists;
- stable unique asset IDs and animation states;
- declared version consistency;
- compressed/decoded/pack/per-asset budgets;
- Service Worker core paths if and only if Service Worker registration is enabled;
- no production reference to QA/mock/source-only files.

## Local browser checks

Start a local server:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/`. Use `#debug` for FPS/asset diagnostics and `#dev` only for local development functions.

Baseline viewport matrix:

| Viewport | When required |
| --- | --- |
| 390×844 | Every layout or visual change |
| 375×667 | Bottom controls, vertical fit, modal sheets, choice cards, pause/result or safe-area-sensitive changes |
| Wide desktop | Canvas/DOM synchronization, max-width, centering or background scaling changes |

Change-type checks:

- CSS/visual: clipping, overlap, readable contrast, tap target, focus visibility and interaction blocking.
- DOM/JavaScript: affected navigation, state transitions, focus restoration, Escape behavior and duplicate input.
- Save/progression: start, write failure, reload, resume, exact checkpoint, settlement and duplicate prevention.
- Animation: start, loop, same-state restart, completion, transition, pause/resume, facing, overlap, reduced motion and low quality.
- Assets: loading/decode failure, manifest grouping, actual-size legibility, alpha/padding and missing paths.

## Pre-publication gate

The current publication path keeps source integration and release authorization separate:

- Changes move from a task branch through a pull request and required CI to protected `main`.
- Publication then requires a separately authorized manual `workflow_dispatch` of `.github/workflows/deploy-pages.yml`.
- `develop-homeui2` is retained only as a recoverable legacy branch and must not receive automatic merges.

For either path:

1. Verify repository, source branch, intended target, and full commit SHA.
2. Inspect unstaged and staged scope; include no unrelated files or QA artifacts.
3. Run project-state validation and the complete applicable Node suite.
4. Complete the viewport and flow checks above.
5. Run the additional checks required by save, manifest, animation, Service Worker, or deployment changes.
6. Record skipped or unavailable checks and obtain the authority required by `docs/DEPLOYMENT.md`.

Merge authorization and deployment-dispatch authorization are separate. Writing to the retained legacy branch does not use the approved release path and requires an explicit recovery decision.

After publication, verify the Actions run or legacy Pages build, deployed full SHA, public URL, affected screen/flow, changed-file HTTP status, and major console errors. Record public QA as unverified when browser access is unavailable.
