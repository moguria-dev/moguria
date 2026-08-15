# Architecture

Moguria is a static browser application with classic scripts, DOM/CSS screens, a local game simulation, and an on-demand Phaser battle renderer. The architectural boundary that matters most is: the core game owns truth; the renderer owns presentation.

## Startup flow

```text
index.html
  -> ordered global scripts
  -> js/main.js environment initialization
  -> assets/manifest.json load
  -> critical Home assets load + decode
  -> Home becomes interactive
  -> idle/quiet-time fetch-only battle prewarm (when policy allows)
  -> player starts/resumes a run
  -> visible adventure preparation reports real step progress
  -> battle-v3 pack preparation reuses any HTTP-cache hits
  -> Phaser + Mogu rig + battle scene load
  -> MoguriaGame core steps, Phaser presents state
```

`js/main.js` keeps the initial loading surface visible until critical assets are ready and reports determinate progress instead of presenting an unchanging wait state. Failures remain retryable and must not initialize Home twice. `js/loading-experience.js` gives startup and adventure one progress frontier: the fill tip, carried starlight, and small flying child Mogu move from the same real value, stop horizontally on plateaus, and complete only in the arrival → contact → complete order. A loading session samples five unique, safe world Tips; one appears at a time after the initial delay and changes automatically or by an explicit tap without impersonating loading progress. Reduced motion removes decorative movement and automatic Tip changes without hiding progress or manual access.

## Ownership map

| Area | Primary files | Ownership |
| --- | --- | --- |
| Static composition | `index.html`, `style.css`, `css/*.css` | Screen markup, DOM HUD, overlays and visual layers. |
| Startup | `js/main.js`, `js/assetManager.js` | Environment setup, critical preload, retry, reveal, optional SW registration. |
| Configuration | `config/project-state.json`, `js/config.js` | Project/deployment metadata in project-state; runtime values in config until migrated or generated. |
| Home/meta UI | `js/home.js`, `js/meta.js`, `js/ui.js` | Home flow, equipment/gacha/challenges, DOM state and user actions. |
| Core run | `js/game.js`, `js/player.js`, `js/enemies.js`, `js/dungeon.js`, `js/skills.js` | Authoritative movement, combat, waves, skills, choices, rewards and checkpoint snapshots. |
| Battle loading | `js/battle-v3-loader.js` | Loads Phaser, `mogu-rig.js`, scene code and battle pack; owns timeout/retry boundary. |
| Battle presentation | `js/battle-v3-scene.js`, `js/mogu-rig.js` | Canvas rendering, sprites, parallax, semantic animation, cues and adaptive effects. Does not award rewards or advance waves independently. |
| Persistence | `js/save.js`, `js/saveTools.js` | Save v3 normalization, migration, backups, active run and atomic settlement. |
| Results | `js/result.js`, `js/meta.js` | Result presentation and reward calculation/settlement entry point. |
| Performance | `js/performance.js`, project-state budgets | Runtime quality monitoring and repository asset budgets. |
| Security/debug | `js/security.js`, `js/debug.js`, `js/cheatMenu.js`, `js/errorLog.js` | Local-only helpers, diagnostics and the client trust boundary. |
| Offline cache | `service-worker.js` | Currently disabled. Not part of the active runtime contract. |

## Core/render bridge

`MoguriaGame` is authoritative for:

- player and enemy positions and collisions;
- combat timing and damage;
- wave progression and boss actions;
- drops, choices and acquired powers;
- checkpoint state, run results and settlement.

The Phaser scene may:

- invoke the registered core step once per rendered frame;
- sample current game state;
- infer or consume semantic presentation states;
- render actors, backgrounds, projectiles, effects and guidance;
- maintain presentation-only latches so short core events remain readable.

It must not create a second reward ledger, wave counter, save format, collision model, or damage simulation. Display scale and motion offsets are presentation-only and must not change collision radii.

## Asset flow

`js/assetManager.js` loads first-party relative paths from the runtime manifest. Assets are grouped as:

- `critical`: required before Home is revealed;
- `lazy`: optional later-use assets;
- `packs`: coherent screen/stage/audio groups loaded before use.

The battle loader prepares the `battle-v3` pack, then loads the vendored engine and renderer scripts. After Home is interactive, it may prewarm the battle scripts and pack during a quiet window. Pack warming is fetch-only: it can populate the browser HTTP cache but does not decode images, instantiate Phaser, create a Canvas, or start a second renderer. It is skipped or cancelled when the document is hidden, the browser reports offline/Data Saver/very slow connectivity, or foreground adventure work begins. Foreground preparation remains authoritative and reports progress across script, pack, renderer, save, and visible-layout readiness. Canonical/runtime manifest relationships are documented in `docs/ASSETS.md`.

## Persistence flow

```text
Home start
  -> prepare battle
  -> MoguriaSave.startRun() [belly + activeRun in one write]
  -> MoguriaGame.start()
  -> periodic/event checkpoint
  -> result
  -> MoguriaSave.settleRun() [coins + run log + dex + activeRun removal in one write]
```

Reload resumes the same `runId` and does not consume belly again. `settledRunIds` is the idempotency ledger. See `docs/SAVE_SCHEMA.md`.

## Global-script constraint

The current application depends on script order in `index.html` and APIs attached to `window`. A conversion to ESM or bundling is a shared-foundation migration, not a local cleanup. It requires an explicit plan covering startup, tests, Pages paths, cache behavior and rollback.

## Configuration boundaries

- Use `config/project-state.json` for repository/deployment/version/budget/validation metadata.
- Use canonical manifests for inventories and contracts.
- Keep runtime-only tuning in runtime config unless and until generation is implemented.
- Avoid repeating mutable values across prose. Link to their owning machine-readable field instead.
