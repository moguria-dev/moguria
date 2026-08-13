# Animation contract

Moguria battle motion combines semantic sprite animation with continuous presentation motion. The goal is not merely a higher frame count: adjacent poses, timing, state transitions, anchors, facing, and reduced-motion behavior must read as one living action at the actual mobile size.

## Sources and projections

- `config/animation-manifest.json` is the canonical machine-readable animation inventory and target contract.
- `assets/images/battle-v3/atlas.json` is the current renderer-compatible projection.
- `config/project-state.json.validation.animationSource` names the canonical source, and `validation.animationRuntimeOutput` / `generated.animationManifest` name the compatibility output.
- `js/battle-v3-scene.js` defines renderer behavior and temporary compatibility defaults.
- `js/mogu-rig.js` defines deterministic continuous Mogu body poses and state blending.

The canonical timing, transition, and event-marker fields are currently an audited backfill of renderer behavior, not runtime-consumed configuration. This is recorded as `runtimeContract.implementationStatus: audited-backfill` and `runtimeConsumed: false`. The runtime remains authoritative until those fields are deliberately integrated and tested; do not claim that editing them alone changes gameplay presentation.

Until a generator exists, update shared image/grid/frame fields in the canonical manifest and renderer projection together. When renderer timing or semantic composition changes, update the audited contract in the same change and run the schema/projection validator plus renderer behavior tests. This coverage does not deep-compare the backfilled timing, transition, or marker values with the hardcoded `DEFAULT_LAYOUTS`; semantic parity therefore remains an explicit review obligation. Do not hide a manifest discrepancy by adding another fallback table in code.

## Simulation and presentation boundary

`MoguriaGame` remains authoritative for attacks, hits, boss actions, movement, defeat, rewards, and checkpoints. The renderer consumes explicit state/timers or derives a presentation state without changing gameplay timing.

Presentation latches may keep a very short core event visible long enough to complete a readable motion. They must not create an extra attack, hit, invulnerability period, cooldown, collision, reward, or state transition.

## Semantic states

| Role | Required/current semantic states | Notes |
| --- | --- | --- |
| Mogu | `idle`, `move`, `attack`, `hurt`, `skill`, `defeat` | `skill` may share source frames with attack, but remains a semantic state. |
| Regular enemy | `idle`, `move`, `attack`, `hurt` | Each variant requires an explicit frame map or an approved composed sequence. |
| Companion | `idle`, `move`, `attack`, `hurt`, `celebrate` | Attack must be tied to the companion's own action, not only player action. |
| Boss | `idle`, `move`, `telegraph`, `attack`, `hurt`, `recover` | `windup`, `slam`, `burst`, and `enraged` map into the semantic sequence as declared. |

Aliases are compatibility input, not new canonical states. For example `hit` maps to `hurt`, `windup` to `telegraph`, and `slam`/`burst` to `attack`.

## Current atlas baseline

- Mogu: 6×4 cells at 256×256; idle 6, move 6, attack 8, hit 2, defeat 2 source frames.
- Regular enemies: 6×4 cells at 192×192; soft, bat, stone, and ghost variants.
- Companion: 4×2 cells at 256×256.
- Boss: 8×2 cells at 256×256; mid-boss and final-boss regions.

These are current renderer facts, not permanent limits. Canonical animation data should record image size, grid/cell data, role, variant, state frames, fps, repeat behavior, anchor/origin, presentation duration, and optional transition information.

## Motion quality rules

- An action must include anticipation, release/impact, and recovery when the action calls for them.
- Do not represent a meaningful attack as an instantaneous switch to one unrelated image.
- Adjacent frames must keep identity, volume, lighting, and contact points coherent.
- State changes blend without a one-frame pose cut. Repeated attacks in the same state require a serial/event key that restarts presentation.
- Sprite origin, collision center, shadow, glow, and facing must remain stable unless their movement is intentional.
- Close-range velocity jitter must not make enemies repeatedly flip direction. Actions lock facing through their readable release.
- Display scale and squash/stretch are presentation-only; gameplay collision remains core-owned.
- Pause freezes the deterministic presentation clock. Resume must not skip directly to a different semantic state.

## Continuous motion rig

`js/mogu-rig.js` is engine-independent and deterministic. It samples a pose from semantic state and elapsed visual time, blends transitions, and applies position, rotation, scale, glow, shadow, and facing to the sprite.

The rig currently supports `idle`, `move`, `attack`, `hurt`, and `defeat`. It may enrich atlas motion, but it cannot substitute for missing semantic source poses when an action needs distinct art.

The battle scene owns elapsed presentation time. Core simulation delta must not be reused as a second animation clock.

## Reduced motion and adaptive quality

- `prefers-reduced-motion: reduce` trims ambient drift, shake, and zoom.
- It must retain readable attack, hurt, telegraph, release, recovery, and defeat meaning.
- Low quality may reduce particles, effect budgets, DPR, and background-layer intensity.
- Low quality must not slow or skip combat frames in a way that changes the perceived action window.
- World movement and player-linked parallax remain legible under reduced motion.

## Adding or changing animation

1. Define role, variant, semantic states, timing, loop behavior, anchor and transition needs.
2. Produce coherent transparent atlas art; do not extract it from a mockup or key visual.
3. Update `config/animation-manifest.json` and the runtime atlas projection together.
4. Update state emission or renderer mapping only where necessary; keep core/render ownership intact.
5. Add/adjust tests for manifest frames, action restart, latching, facing, pause/resume, reduced motion and low quality.
6. Inspect at 390×844 actual size, including idle→move, move→attack, attack→idle/recover, hit interruption, defeat, repeated attacks, overlap and frame pacing.
7. Check that the same entity does not rotate or flip unexpectedly and that anchors do not jump.

Relevant automated coverage is in `tests/mogu-rig.test.js`, `tests/battle-v3-scene.test.js`, `tests/battle-v3-loader.test.js`, and `tests/game-resume.test.js`.
