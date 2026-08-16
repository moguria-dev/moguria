# Current state

This document describes the v3.4.0 Chapter 1 playable-vertical-slice source candidate. Its approved release scope is the four authored motion directions and 11 production images connected through the isolated investigation run. It does not claim every beat in the longer 7–9 minute Game Design v0.1 review draft. `config/project-state.json` is the machine-readable source for versions, branches, deployment mode, budgets, and validation paths. This page is not a CI result, merge receipt, deployment receipt, or statement that v3.4.0 is already live.

Workflow and approval guidance is pinned through project-state to `moguria-development-rules` version `3.0.0`, effective `2026-08-14`. Do not duplicate a mutable release commit SHA here; verify the exact branch, full SHA, checks, and Pages deployment at release time.

## Supported product state

- Mobile-first, portrait browser game served as static files.
- Baseline design viewport: `390×844`.
- Compact vertical regression viewport: `375×667` when bottom fit is affected.
- Home and meta screens use DOM/CSS plus production image assets.
- Battle uses one Phaser 4.2.1 Scene loaded on demand, with a DOM HUD aligned to its Canvas.
- The normal run profile remains 12 waves, with artifacts at waves 3 and 7, the mid-boss at wave 7, and the final boss at wave 12.
- Chapter 1 adds a dedicated four-wave investigation profile. It consumes zero belly, permits free retry, has no artifact or boss waves, and does not alter normal-run semantics.
- Chapter 1 uses a full-screen story player: Canvas2D owns painted visual composition and procedural effects; DOM owns headings, dialogue, status, hold interaction, controls, focus, and accessibility.
- The story player and four Story packs (one shared core plus three scene-specific packs) are lazy-loaded when Chapter 1 is opened. Story assets are not part of startup readiness and Phaser is not loaded for story playback.
- The published vertical-slice route proceeds through the Return Light memory, reverse flow/crack/rescue, damaged-fragment commitment, a four-wave investigation, return, one incomplete ledger response, route completion, and Home. The current `c1_complete` marker means completion of this versioned route, not implementation of every review-draft beat.
- The damaged-fragment interaction is a deliberate hold with no timeout, failure state, quick-time score, or branching choice.
- Save payloads normalize to version 4 under the unchanged `moguria.save.v2` key. Story progress is a separate normalized area and a Chapter 1 run is bound by profile/run ID without replacing ordinary progression data.
- Home makes Chapter 1 the main action for a fresh player, keeps story optional for an existing player, and gives any active run resume priority.
- Story and battle pause/resume preserve their current progress. Reduced motion retains semantic state changes while removing or reducing decorative movement.

## Runtime and publication

- Entry point: `index.html`.
- Module mode: classic ordered scripts attached to `window`.
- Public URL: <https://moguria-dev.github.io/moguria/>.
- Pages mode: GitHub Actions (`build_type: workflow`).
- Release source: protected `main`.
- Publication requires a separately authorized manual `workflow_dispatch` of `.github/workflows/deploy-pages.yml`; a push or merge does not publish.
- Service Worker registration remains disabled.
- The vendored Phaser browser build remains battle-only.

The v3.4.0 pull-request checks, merge, Pages dispatch, deployed SHA, and public QA must be verified from live GitHub and the public origin. None should be inferred from this source document.

## Current manifest state

- The runtime reads `assets/manifest.json`.
- Home startup remains at 17 critical assets; Chapter 1 adds no critical item.
- Chapter 1 contributes 11 approved production image assets under `assets/images/story/ch01/`, divided among four lazy packs: `story-ch01-core`, `story-ch01-return-hall`, `story-ch01-fragment-chamber`, and `story-ch01-archive`.
- The core pack also carries the Story runtime animation projection so the player can load one coherent story contract before scene-specific art.
- `config/animation-manifest.json` remains canonical. Battle continues to use `assets/images/battle-v3/atlas.json` at runtime version 2; Story uses the separate `assets/animations/story-ch01.json` projection at version 1.
- Canonical inventory/state files live under `config/`; update canonical files and runtime projections together until generation is installed.

## Known limitations and release gates

- The game is client-only. localStorage and JavaScript can be changed by the player; competitive results are not trustworthy without server validation.
- `main` is protected by pull-request and required-check rules. Do not bypass protection, force-push, or use the retained legacy branch as an integration or publication path.
- GitHub's Pages API can retain historical branch-source metadata even while workflow deployment is active. Use the workflow run and Pages deployment record for release evidence.
- Multiple prior-generation asset and CSS layers remain in the repository. Their presence does not prove they are unused; removal requires a reference and visual-regression audit.
- `service-worker.js` is disabled and stale. Do not enable it as part of the Chapter 1 release without a separate cache-path/update/rollback review.
- Chromium and WebKit emulation at `390×844` and `375×667` are repeatable browser-QA gates, not substitutes for hardware testing.
- A real iPhone Safari pass covering story entry, hold interaction, pause/resume, four-wave handoff, return/ledger completion, safe areas, memory, and touch response is **required-pending** until actually performed.
- v3.4.0 CI, protected-main integration, manual Pages deployment, and post-deployment public QA remain unverified until their respective commands and provider records complete successfully.

## Near-term maintenance goals

1. Complete the v3.4.0 automated, browser, protected-main, and public-release gates and record the resulting evidence outside mutable architectural prose.
2. Complete the required-pending real-device iPhone Safari pass.
3. Keep Story and Battle animation projections independent while validating both from the shared canonical manifest.
4. Classify active, fallback, source-only, and legacy assets before deleting anything; require reference and visual-regression evidence for removal.
