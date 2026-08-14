# Asset system

This document defines asset ownership, loading classes, lifecycle, and the relationship between canonical and runtime manifests. Visual direction and workflow approval gates remain in the Moguria project rules; this file describes repository implementation.

## Manifest relationship

| File | Role |
| --- | --- |
| `config/project-state.json` | Names sources/outputs under `validation`, compatibility outputs under `generated`, plus versions, budgets, and validation commands. |
| `config/asset-manifest.json` | Canonical inventory and metadata for production assets. |
| `assets/manifest.json` | Compatibility projection consumed by `js/assetManager.js` today. |
| `config/animation-manifest.json` | Canonical semantic animation contract. |
| `assets/images/battle-v3/atlas.json` | Compatibility projection consumed by the Phaser renderer today. |

Generation is not installed in the current baseline. Edit a canonical manifest and its runtime projection together, then run the validator declared by project-state. Validation must fail on missing files, duplicate IDs, unsafe URLs, version mismatch, group mismatch, or divergent animation frame maps.

Do not store the full inventory in `project-state`; it should point to manifests and budgets rather than becoming a third copy.

## Runtime loading classes

- `critical`: files that must load and decode before Home is usable.
- `lazy`: optional files that can load after first interaction.
- `packs`: coherent groups loaded before a screen, stage, battle renderer, event, or audio set is used.

At the loading-feedback baseline, Home uses 16 critical image assets and battle is the `battle-v3` pack. The sixteenth critical item is the existing active production asset `home_v2_expedition_mogu`, reused on startup and adventure loading surfaces so normal critical loading tracks and decodes the same wait character used by both presentations. No new artwork is introduced, and reuse does not elevate the catalog's existing `audit-backfill-unknown` approval status. Assets used only after opening a secondary screen stay out of `critical`, even when they remain in the shared image registry. Battle assets do not belong in `critical` merely because they are visually important.

After Home becomes interactive, eligible browsers may fetch the battle scripts and `battle-v3` URLs at low concurrency during idle or conservative quiet time. This is a fetch-only HTTP-cache warmup, not a second loading class: it does not decode pack images, boot Phaser, create a renderer, or move battle assets into `critical`. Data Saver, offline/very-slow connections, hidden documents, and foreground adventure preparation suppress or cancel speculative work. Exact manifest URLs, including cache tokens, must be used so a warm response can be reused by the real loader.

All runtime asset URLs must remain first-party relative paths below the approved asset tree. Remote URLs and path traversal are rejected by policy and tests.

## Budget ownership

Numeric budgets live only in `config/project-state.json.performanceBudgets`, including:

- `criticalTransferBytes` and `criticalDecodedBytes`;
- `battlePackTransferBytes`;
- `singleRuntimeAssetBytes`;
- `initialStylesheetBytes` and `initialScriptBytes`;
- `dynamicBattleScriptBytes`.

The asset manifest records files and groups; this document explains the budget; neither should invent a competing number. If a desired visual exceeds a budget, measure on target devices and make an explicit quality/performance decision rather than silently raising or ignoring the limit.

## Active asset families

The following paths are active at the audited baseline:

| Path | Current use |
| --- | --- |
| `assets/images/home-v2/` | Home background, Mogu, companion, logo, frames, controls, currency and Home navigation. |
| `assets/images/battle-v3/` | Four background layers, actor atlases and runtime atlas projection. |
| `assets/images/skill-icons/` | Production skill icon atlases used by choice and owned-power UI. |
| `vendor/phaser/` | Vendored Phaser browser build and license. |

Other image families such as `battle-v2`, `home`, `home-icons`, `kv-*`, and `play-ui` may still be referenced by legacy or fallback layers. They are not approved for deletion based on naming alone.

## Lifecycle labels

Every canonical asset entry should have, directly or through its group:

- stable ID and relative path;
- type and screen/role;
- status: `active`, `fallback`, `legacy`, or `candidate`;
- intended display size or atlas cell size;
- critical/lazy/pack ownership;
- animation state or static purpose when applicable;
- source/provenance and license information;
- replacement/supersession link when not active.

`legacy` means “not selected for new work,” not “safe to delete.” Removal requires a reference scan across HTML, CSS, JavaScript, JSON, Service Worker lists and tests, followed by affected visual QA.

## Production visual requirements

- Use independent production assets; do not crop or trace key visuals, screenshots, screen mockups, composite review sheets, or asset contact sheets.
- Character, enemy, boss, chest, and dense effects should normally be transparent PNG/WebP art with enough painted information at actual size.
- SVG is suitable for scalable frames, masks, decorative lines, and small symbols when it does not become thin, flat placeholder art.
- Icons require transparent backgrounds, centered readable silhouettes, consistent optical scale/lighting/material, and verification at the smallest production size.
- UI plates should normally exclude baked text. Keep labels and variable values in HTML/CSS.
- Separate Home, battle, and result assets when their poses, lighting, framing, or animation requirements differ.
- Store only final runtime assets in production paths. Keep prompts, generators, previews, QA sheets, and raw mockups outside production changes.

## Adding or replacing an asset

1. Confirm the target screen, actual display size, states, and pack.
2. Confirm the approved visual source and whether the work is a new direction or an approved replacement.
3. Create an independent final asset with correct transparency and padding.
4. Add or update the canonical asset entry.
5. Update the runtime projection in the same change until generation exists.
6. Update code/CSS references; do not add a second unexplained fallback path.
7. Run manifest/path/budget validation and the relevant tests.
8. Inspect transparency, white/black backgrounds when relevant, smallest display size, baseline device viewport, and affected interaction states.
9. Classify the replaced file. Do not delete it until references and rollback needs are resolved.

## Service Worker boundary

The Service Worker is currently disabled and its core list is not a canonical asset inventory. Do not add every asset to `CORE_ASSETS`, and do not enable registration until:

- every listed path exists;
- install succeeds atomically;
- cache versioning and update behavior are tested;
- runtime and asset-manifest versions are coherent;
- offline behavior is an explicit product/deployment decision.
