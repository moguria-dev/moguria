# Moguria

Moguria is a mobile-first browser roguelite RPG about a small Mogu that eats powers, explores a star-lit dungeon, and grows into a build worth trying “one more time.” The application is currently static HTML/CSS/JavaScript with a Phaser-powered battle presentation layer and local browser persistence.

The current machine-readable project state is `config/project-state.json`. Do not copy its branch, version, budget, or deployment values into new documents without also defining how they stay synchronized.

## Current baseline highlights

- Phaser 4.2.1 is loaded only when battle is prepared. One battle Scene presents four depth-composited backgrounds and production atlases for Mogu, regular enemies, companions, and bosses.
- Companions follow and fire independently; boss actions use a telegraph → execute → recovery state sequence.
- Save payload version 3 supports active-run checkpoints, interrupted choice recovery, one-time `runId` settlement, and duplicate-reward prevention.
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
- `js/battle-v3-loader.js` loads the vendored Phaser build, continuous Mogu rig, and battle scene only when battle is prepared.
- `js/battle-v3-scene.js` renders battle state without owning game progression.
- `js/save.js` normalizes save payloads to version 3 in localStorage.
- `assets/manifest.json` remains the manifest read by the current runtime.

See `docs/ARCHITECTURE.md` for the full ownership map.

## Deployment

The public site is currently served by GitHub Pages from `develop-homeui2` at repository root:

<https://moguria-dev.github.io/moguria/>

In this configuration, pushing or merging to the Pages source branch publishes the site. File editing, commit, push, merge, and publication are not interchangeable permissions. Follow `docs/DEPLOYMENT.md` before any release action.

Service Worker registration is currently disabled. Do not enable it merely as part of a version update; see `docs/DEPLOYMENT.md`.

## Documentation

- `AGENTS.md` — repository-wide operating and safety rules
- `docs/SOURCE_OF_TRUTH.md` — authority and synchronization rules
- `docs/CURRENT_STATE.md` — current supported state and known limitations
- `docs/ARCHITECTURE.md` — module ownership and runtime flow
- `docs/ASSETS.md` — canonical/runtime manifest relationship and asset lifecycle
- `docs/ANIMATION.md` — animation state contract and QA
- `docs/SAVE_SCHEMA.md` — save version 3 invariants and migration
- `docs/TESTING.md` — automated and manual verification
- `docs/DEPLOYMENT.md` — current GitHub Pages release path
- `docs/RECOVERY.md` — non-destructive diagnosis and recovery
- `docs/AGENT_ENVIRONMENT.md` — Codex, Skill, sandbox, network and connector boundaries
- `SECURITY.md` — client trust boundary and private vulnerability reporting

`CHANGELOG.md` and versioned release notes are historical records. They must not override the current project state, code, manifests, tests, or GitHub settings.
