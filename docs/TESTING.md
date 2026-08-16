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
| `validation.commands.browser` | `npm run qa:browser` | Chromium/WebKit mobile rendering, interaction and screenshot audit |
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
node --test tests/story-ch01-manifest.test.js
```

Use the exact Node version declared by `config/project-state.json.runtime.nodeVersion`. `.nvmrc`, package metadata, local validation, and CI must agree with that value.

Do not say “tests pass” unless the command completed successfully in the current branch/worktree. Record skipped, unavailable, flaky, or unperformed checks separately.

## Automated browser visual QA

`.github/workflows/browser-qa.yml` runs independently from the dependency-free preflight on pull requests to `main`, pushes to `main`, and manual dispatches. It installs the exact Playwright version from `package-lock.json`, then installs that version's Chromium or WebKit build in an isolated matrix job.

The runner uses only production public APIs plus version-4 local save/checkpoint fixtures; it does not add a production QA route. Each browser retains the Home/meta/normal-battle matrix and adds the real fresh-save Home entry plus six stable Chapter 1 visual states at both `390×844` (DPR 3) and `375×667` (DPR 2), with touch/mobile input, `ja-JP`, and `Asia/Tokyo`. It proves the player and stylesheet are absent before entry, load once on demand, then exercises the real save APIs through Story run start, zero-reward settlement, `return_pending` → `record_signal`, and ledger resume without showing numeric results. It also records 14 marker-adjacent Canvas frames across the four authored motions and checks their logical times against the Story projection. Separate normal and reduced/lifecycle continuous WebMs exercise all four motions, real pause/resume, actual hidden→visible `visibilitychange`, and early/delayed fragment holds; finalized videos are decoded by the same browser engine at eight points to verify duration, dimensions, nonblank content, and frame changes. Per-mode pivot overlays project every fixed atlas cell from the runtime manifest. Those captures audit the full-screen DOM/Canvas surface, asset requests, safe-area fit, close/hold boundaries, reduced motion, Canvas backing-store size, visual richness, causal visual states, and stable actor pivots. The runner deliberately does not simulate four waves of combat; wave/checkpoint/retry and replay invariants remain owned by the Node contract tests below. A fixed pseudo-random seed makes randomized choices in the stable-screen matrix reproducible; continuous replay evidence uses the production clock without a seed, seek, fixture, or verification hook.

Every run writes `qa-summary.json`, `qa-summary.md`, viewport screenshots, marker-adjacent PNGs, continuous WebMs, and pose-atlas pivot overlays to the ignored `browser-qa-output/` directory. CI uploads that directory even when an audit fails. The audit fails closed for setup/interaction failures, browser console errors, uncaught page errors, failed or HTTP-error same-origin requests, broken visible images, horizontal overflow, missing/undersized primary touch controls, a near-blank screenshot, incomplete lifecycle evidence, or a missing/invalid video or pivot overlay.

Run a single installed browser locally with:

```bash
npm ci --ignore-scripts
npx playwright install --with-deps chromium
npm run qa:browser -- --browser=chromium
```

Browser emulation is reproducible visual QA, not an iPhone Safari real-device pass. The Chapter 1 real-device Safari pass remains **required-pending** until actually performed; never relabel Chromium/WebKit emulation as that evidence.

## Test ownership

| File | Main contracts |
| --- | --- |
| `tests/asset-manager.test.js` | critical decode/progress, timeout/retry, safe paths, Home manifest scope |
| `tests/main-startup.test.js` | blocking startup, accessible failure/retry, one-time initialization |
| `tests/battle-v3-loader.test.js` | Phaser/rig/scene load order, timeout, fallback health and retry |
| `tests/battle-v3-scene.test.js` | viewport/DOM alignment, atlas integrity, semantic animation, rig, facing, scale, cues and quality |
| `tests/mogu-rig.test.js` | authored curves, blending, repeat attack restart, deterministic clock and reduced motion |
| `tests/game-resume.test.js` | choice/reward/gameplay checkpoints, collect-all, defeat/give-up, prerequisite skills, exact reroll state, and isolated normal/story run-profile semantics |
| `tests/save-v3.test.js` | Historical filename for save compatibility coverage: v1-v3 migration into v4, normal/story cost rules, story binding, active run, checkpoint, atomic settlement and write failure |
| `tests/story-ch01-manifest.test.js` | Four lazy packs, 11 approved story images, no critical-set growth, Story projection v1, pose atlases, event order, 850 ms hold and exact 320 ms ledger gap |
| `tests/skill-icon-assets.test.js` | unique atlas cells, alpha/size, CSS mapping and small-size legibility |
| `tests/system-overlays.test.js` | accessible confirmation/loading overlays and exact equipment mutation |
| `tests/development-environment.test.js` | project-state, workflow, documentation, ownership and repository-governance contracts |
| `tests/browser-qa-contract.test.js` | pinned Playwright lock/workflow, viewport/screen matrix, evidence isolation and runner audit contract |

Manifest/project-state validation should additionally check:

- project-state schema and required paths;
- canonical/runtime manifest parity;
- every referenced file exists;
- stable unique asset IDs and animation states;
- declared version consistency;
- independent Battle version-2 and Story version-1 animation projection parity;
- exactly four Chapter 1 lazy packs, 11 approved image records, and no Chapter 1 asset in `critical`;
- compressed/decoded/pack/per-asset budgets;
- the 1,048,576-byte Story pack limit and 131,072-byte dynamic Story script limit;
- the reviewed v3.4 initial-script baseline: measured at 384,026 bytes (about 375 KiB), capped at 393,216 bytes after an explicit increase from 358,400 bytes, with `initialStylesheetBytes` and the critical set unchanged;
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

## Chapter 1 release matrix

At both `390×844` and `375×667`, test at least:

1. Fresh save: the Home main action opens Chapter 1 without loading Phaser or consuming belly.
2. Migrated/existing save: normal adventure remains the main action and Story remains explicitly reachable.
3. Active normal or story run: resume wins over both new entry paths and does not consume belly again.
4. Story player: full-screen safe-area fit, DOM copy/focus/status, Return Light's one irregular weakening, reverse-before-crack rescue order, and no Star Companion in the past scene.
5. Fragment: no timeout/failure/branch, pointer cancellation before commit resets safely, 850 ms hold commits once, community lamp restores before Mogu interference/stumble, and the companion stays near.
6. Investigation: four waves, no artifact/boss wave, zero belly cost, free retry, checkpoint/reload/resume, and unchanged normal 12-wave behavior.
7. Return/ledger: the return scene precedes one ambiguous ledger response, the pulse contains the 320 ms gap, silence follows, chapter completion persists, and Home is restored.
8. Lifecycle: pause, resume, document hide/show, duplicate input, close/“あとで続ける”, repeated open, reduced motion, console errors, failed requests, memory/texture release, and focus restoration.
9. Loading/budgets: no Story image enters `critical`, the player script is absent before first Story open and loaded once on demand, each Story pack stays under its owned limit, and the measured initial-script set remains within the reviewed v3.4 budget.

For a real iPhone Safari pass, repeat the critical story path with touch input and safe areas, observe frame pacing/memory during scene changes and battle handoff, and verify that hold/pause/resume remain reliable after backgrounding. Until that hardware or device-farm pass is recorded, report it as required-pending.

## Pre-publication gate

The current publication path keeps source integration and release authorization separate:

- Changes move from a task branch through a pull request and required CI to protected `main`.
- Publication then requires a separately authorized manual `workflow_dispatch` of `.github/workflows/deploy-pages.yml`.
- `develop-homeui2` is retained only as a recoverable legacy branch and must not receive automatic merges.

For this path:

1. Verify repository, source branch, intended target, and full commit SHA.
2. Inspect unstaged and staged scope; include no unrelated files or QA artifacts.
3. Run project-state validation and the complete applicable Node suite.
4. Complete the viewport and flow checks above.
5. Capture Chapter 1 runtime motion/video and pivot-overlay evidence for all four story motions; a static contact sheet or manifest-only result is insufficient.
6. Run the additional checks required by save, manifest, animation, Service Worker, or deployment changes.
7. Record skipped or unavailable checks and obtain the authority required by `docs/DEPLOYMENT.md`.

Merge authorization and deployment-dispatch authorization are separate. Writing to the retained legacy branch does not use the approved release path and requires an explicit recovery decision.

After publication, verify the manual Pages Actions run, `github-pages` deployment record, deployed full SHA, public URL, affected screen/flow, changed-file HTTP status, and major console errors. Record public QA as unverified when browser access is unavailable. The retained legacy branch is not an alternate release path.

For v3.4.0 specifically, public QA must verify the story player script, Story projection, and representative files from all four story packs return HTTP 200; the fresh/existing/active-run Home rules; the four-wave handoff; return/ledger/vertical-slice-complete/Home; and no new console or same-origin request errors. Browser screenshot fixtures and Node state-machine tests must be reported as distinct evidence. Do not claim CI, merge, deployment, or public QA from repository contents alone.
