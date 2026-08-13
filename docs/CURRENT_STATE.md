# Current state

This snapshot was prepared from `moguria-dev/moguria`, protected branch `main`, at commit `120c33b118940174bb0046dc42eedfcefe6c97d3` on 2026-08-14. `config/project-state.json` is the ongoing machine-readable source and must be updated when this snapshot becomes stale.

Workflow/approval guidance was checked against `moguria-development-rules` version `3.0.0`, effective `2026-08-14`, SHA-256 `9950741898d91396543bc6f76653e1ec39d42c9a9f6418e39d8f04232288d817`. The authoritative rule metadata is maintained by the Moguria Development Skill; this snapshot is a review anchor, not a second rule source.

## Supported product state

- Mobile-first, portrait browser game served as static files.
- Baseline design viewport: `390×844`.
- Compact vertical regression viewport: `375×667` when bottom fit is affected.
- Home and meta screens use DOM/CSS plus production image assets.
- Battle uses a single Phaser 4.2.1 scene loaded on demand, with a DOM HUD aligned to the rendered Canvas.
- Battle progression currently targets 12 waves.
- Battle presentation includes four non-repeating parallax layers, player/enemy/companion/boss atlases, semantic state animation, continuous body motion, status cues, off-screen guidance, drops, projectiles, and effects.
- Skills and artifacts support rerolls, persisted choices, eligibility rules, owned-power inspection, and skill icon atlases.
- Meta progression includes MoguCoin, five equipment slots, inventory, gacha, upgrades, and challenge/reward entry points.
- Saves use a version 3 payload in localStorage and support active-run checkpoints, reload recovery, one-time settlement, and corruption quarantine.

## Runtime and publication

- Entry point: `index.html`.
- Module mode: classic ordered scripts attached to `window`.
- Current Pages URL: <https://moguria-dev.github.io/moguria/>.
- Current Pages mode: GitHub Actions (`build_type: workflow`).
- Release source: protected `main`; publication requires an authorized manual `workflow_dispatch` of `.github/workflows/deploy-pages.yml`.
- A push or merge does not publish.
- First Actions deployment: run `31750308477`, successful from 2026-08-14 07:31:34 to 07:32:56 JST for full SHA `120c33b118940174bb0046dc42eedfcefe6c97d3`; the resulting `github-pages` deployment `5897163613` records the same SHA and `main` ref. Post-deployment public QA passed at the Pages URL.
- Service Worker registration is off in `MoguriaConfig.assets.registerServiceWorker`.
- The vendored Phaser browser build is under `vendor/phaser/` and is loaded only for battle.

Values above must match `config/project-state.json`; the JSON wins for automation once validated against current GitHub settings.

## Current manifest state

- The runtime reads `assets/manifest.json`.
- At the audited commit, it declares 18 Home critical assets, an empty `lazy` group, and a `battle-v3` pack.
- The audited critical Home files total approximately 3.35 MiB on disk. The old runtime manifest declares a 4 MiB critical budget; the prior prose performance document stated 2 MB. The replacement single budget source is `config/project-state.json.performanceBudgets`.
- Battle atlas metadata currently lives in `assets/images/battle-v3/atlas.json`.
- Canonical inventory/state files are introduced under `config/`; see `docs/SOURCE_OF_TRUTH.md` before editing either side of a manifest pair.

## Known limitations and risks

- The game is client-only. localStorage and JavaScript can be changed by the player; competitive results are not trustworthy without server validation.
- `main` is covered by active ruleset `Moguria main protection` (`20819854`): pull requests are required, deletion and non-fast-forward updates are blocked, and `Dependency-free preflight` is a strict required status check.
- The live ruleset requires zero approving reviews and does not require review-thread resolution. This accurately supports the current single-maintainer flow, but unresolved review conversations are not technically blocked from merge.
- GitHub's Pages API still reports the historical `source.branch` value `develop-homeui2` alongside `build_type: workflow`. Actual release evidence is the successful Actions run and latest `github-pages` deployment on `main`; do not infer an active branch-publishing path from that retained source metadata.
- No tag or GitHub Release existed at the audited commit, so the human version label did not uniquely identify every published change.
- Multiple prior-generation asset and CSS layers remain in the repository. Their presence does not prove they are unused; removal requires a reference and visual regression audit.
- `service-worker.js` is disabled and stale. At the audited commit, 51 `CORE_ASSETS` entries referenced absent `assets/images/moguria-final/**` files. Enabling it without repair would risk installation failure.
- Historical `DESIGN_NOTES.md`, release notes, and upload instructions contain superseded statements and are not current specifications.

## Near-term maintenance goals

1. Decide whether review-thread resolution should become mandatory. Keep the approval count at zero unless an independent reviewer is available, to avoid blocking the single-maintainer release path.
2. Classify active, fallback, source-only, and legacy assets before deleting anything; require reference and visual-regression evidence for removal.
3. Establish repeatable browser smoke QA and a real-device performance/interaction baseline, including compact iPhone Safari coverage or an equivalent device farm, and link the resulting gates from project-state validation.
4. Keep `docs/CURRENT_STATE.md` concise; put history in the changelog/releases and durable decisions in ADRs.
