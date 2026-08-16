# Moguria

Moguria is a mobile-first browser roguelite RPG about a small Mogu that eats powers, explores a star-lit dungeon, and grows into a build worth trying “one more time.” The application is static HTML/CSS/JavaScript with local browser persistence, an on-demand Phaser battle presentation layer, and a separately lazy-loaded Canvas2D/DOM story player.

The current machine-readable project state is `config/project-state.json`. Do not copy its branch, version, budget, or deployment values into new documents without also defining how they stay synchronized.

## Current baseline highlights

v3.4.0 publishes the approved four-motion Chapter 1 playable vertical slice. It is not a claim that every beat in the longer 7–9 minute Game Design v0.1 review draft is implemented; completion records the end of this versioned playable route.

- Phaser 4.2.1 is loaded only when battle is prepared. One battle Scene presents four depth-composited backgrounds and production atlases for Mogu, regular enemies, companions, and bosses.
- Companions follow and fire independently; boss actions use a telegraph → execute → recovery state sequence.
- The Chapter 1 playable vertical slice uses a full-screen Canvas2D visual layer with DOM dialogue and controls. Its player, animation projection, and four Story packs load only when the story is opened; the 17-asset Home critical set is unchanged.
- The Chapter 1 investigation is a dedicated four-wave, zero-belly, free-retry run profile. The normal 12-wave profile and its wave 3/7 artifacts and wave 7/12 boss semantics remain unchanged.
- Save payload version 4 keeps the existing `moguria.save.v2` storage key, adds normalized story state independent of ordinary progression, and retains active-run checkpoints, interrupted choice recovery, one-time `runId` settlement, and duplicate-reward prevention.
- Home gives a new player the Chapter 1 entry as the main action, keeps it optional for an existing player, and always prioritizes resuming an active run.
- All 15 equipment definitions apply level-scaled effects to battle parameters rather than display-only values.
- Startup and battle loading have timeouts and retry paths; automated coverage includes save/resume, renderer/DOM sizing, backgrounds, animation, assets, and system overlays.
- Public hosts cannot enable the development menu only by adding `#dev` or `?dev=1`.
- Save reads/writes are guarded; malformed JSON is quarantined under `moguria.corrupt.*` when browser storage permits.
- Service Worker registration is off and old `moguria-core-*` registrations/caches are cleaned by the current startup policy.
- Home initialization is guarded against duplicate execution, and the start control updates its label without replacing its icon markup.
- Dynamic values in meta screens are escaped before HTML insertion.
- Home includes lightweight cave light, lamp, particle, crystal, and Mogu breathing presentation with `prefers-reduced-motion` support.

## Run locally

Serve the repository root over HTTP:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/`.

Development helpers are intentionally local-only:

- `#debug` enables the FPS/asset debug panel.
- `#dev` or `?dev=1` enables the development menu only when the host is allowed by `MoguriaConfig.security`.
- The public GitHub Pages origin must not expose the development menu.

Do not open the application directly with `file://`; the supported development path is a local HTTP server.

## Test

Run the current complete Node test suite from the repository root:

```bash
node --test tests/*.test.js
```

Then perform the change-specific browser checks in `docs/TESTING.md`. A passing Node suite is not a substitute for visual or public-site QA.

## Runtime outline

- `index.html` loads classic scripts in dependency order; the project is not currently ESM-based.
- `js/main.js` coordinates startup and critical asset loading.
- `js/game.js` is authoritative for combat, waves, rewards, and checkpoints.
- `js/home.js` selects the new-user, existing-user, or active-run entry and loads the Chapter 1 player on demand.
- `js/story-ch01-player.js` owns Chapter 1 scene playback, Canvas2D composition, DOM interaction, pause/resume, and the handoff into and back from the investigation run.
- `js/battle-v3-loader.js` loads the vendored Phaser build, continuous Mogu rig, and battle scene only when battle is prepared.
- `js/battle-v3-scene.js` renders battle state without owning game progression.
- `js/save.js` normalizes save payloads to version 4 under the stable localStorage key and owns independent Chapter 1 progress plus bound story-run state.
- `assets/manifest.json` remains the manifest read by the current runtime.
- `assets/animations/story-ch01.json` is the Story animation projection at version 1; the Battle projection remains `assets/images/battle-v3/atlas.json` at version 2.

See `docs/ARCHITECTURE.md` for the full ownership map.

## Deployment

The public site is deployed to GitHub Pages from protected `main` by the manual-only `.github/workflows/deploy-pages.yml` workflow:

<https://moguria-dev.github.io/moguria/>

Pushing or merging does not publish the site. File editing, commit, push, merge, workflow dispatch, and publication are separate permissions. Follow `docs/DEPLOYMENT.md` before any release action.

Service Worker registration is currently disabled. Do not enable it merely as part of a version update; see `docs/DEPLOYMENT.md`.

## Documentation

- `AGENTS.md` — repository-wide operating and safety rules
- `docs/SOURCE_OF_TRUTH.md` — authority and synchronization rules
- `docs/CURRENT_STATE.md` — current supported state and known limitations
- `docs/ARCHITECTURE.md` — module ownership and runtime flow
- `docs/ASSETS.md` — canonical/runtime manifest relationship and asset lifecycle
- `docs/ANIMATION.md` — animation state contract and QA
- `docs/SAVE_SCHEMA.md` — save version 4 invariants and migration
- `docs/TESTING.md` — automated and manual verification
- `docs/DEPLOYMENT.md` — current GitHub Pages release path
- `docs/RECOVERY.md` — non-destructive diagnosis and recovery
- `docs/AGENT_ENVIRONMENT.md` — Codex, Skill, sandbox, network and connector boundaries
- `SECURITY.md` — client trust boundary and private vulnerability reporting

`CHANGELOG.md` and versioned release notes are historical records. They must not override the current project state, code, manifests, tests, or GitHub settings.
