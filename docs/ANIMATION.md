# Animation contract

Moguria battle motion combines semantic sprite animation with continuous presentation motion. The goal is not merely a higher frame count: adjacent poses, timing, state transitions, anchors, facing, and reduced-motion behavior must read as one living action at the actual mobile size.

## Sources and projections

- `config/animation-manifest.json` is the canonical machine-readable animation inventory and target contract.
- `assets/images/battle-v3/atlas.json` is the current renderer-compatible projection.
- `config/project-state.json.validation.animationSource` names the canonical source, and `validation.animationRuntimeOutput` / `generated.animationManifest` name the compatibility output.
- `js/battle-v3-scene.js` defines the per-actor renderer bridge, stable atlas-cell policy, companion formation, and temporary compatibility defaults.
- `js/mogu-rig.js` defines deterministic Motion Rig 2 poses and state blending for Mogu, regular enemies, and companions. Bosses retain their reviewed atlas sequences.

The canonical timing, transition, and event-marker fields are currently an audited backfill of renderer behavior, not runtime-consumed configuration. This is recorded as `runtimeContract.implementationStatus: audited-backfill` and `runtimeConsumed: false`. The runtime remains authoritative until those fields are deliberately integrated and tested; do not claim that editing them alone changes gameplay presentation.

Update shared image/grid/frame fields and `runtimeVersion` in the canonical manifest and renderer projection together. Motion Rig 2 changes renderer behavior and audited canonical metadata, but not the projected image/grid/frame object, so the compatibility projection remains byte-identical at runtime version 2. When renderer timing or semantic composition changes, update the audited contract in the same change and run the schema/projection validator plus renderer behavior tests. This coverage does not deep-compare the backfilled timing, transition, rig-profile, or marker values with the hardcoded implementation; semantic parity therefore remains an explicit review obligation. Do not hide a manifest discrepancy by adding another fallback table in code.

## Simulation and presentation boundary

`MoguriaGame` remains authoritative for attacks, hits, boss actions, movement, defeat, rewards, and checkpoints. The renderer consumes explicit state/timers or derives a presentation state without changing gameplay timing.

Presentation latches may keep a very short core event visible long enough to complete a readable motion. They must not create an extra attack, hit, invulnerability period, cooldown, collision, reward, or state transition.

## Semantic states

| Role | Required/current semantic states | Notes |
| --- | --- | --- |
| Mogu | `idle`, `move`, `attack`, `hurt`, `skill`, `consume`, `celebrate`, `defeat` | `skill` aliases the attack rig; `consume` and `celebrate` use frame 0 plus continuous presentation poses. |
| Regular enemy | `idle`, `move`, `attack`, `hurt`, `defeat` | Each variant holds its front-neutral painting for locomotion/attack/defeat and uses the variant hit cell for `hurt`. |
| Companion | `idle`, `move`, `attack`, `hurt`, `celebrate` | Attack must be tied to the companion's own action, not only player action. |
| Boss | `idle`, `move`, `telegraph`, `attack`, `hurt`, `recover` | `windup`, `slam`, `burst`, and `enraged` map into the semantic sequence as declared. |

Aliases are compatibility input, not new canonical states. For example `hit` maps to `hurt`, `windup` to `telegraph`, and `slam`/`burst` to `attack`.

## Current atlas baseline

- Mogu: 6×4 cells at 256×256; idle 6, move 6, attack 8, hit 2, defeat 2 source frames.
- Regular enemies: 6×4 cells at 192×192; soft, bat, stone, and ghost variants.
- Companion: 4×2 cells at 256×256.
- Boss: 8×2 cells at 256×256; mid-boss and final-boss regions.

These are current renderer facts, not permanent limits. Canonical animation data should record image size, grid/cell data, role, variant, state frames, fps, repeat behavior, anchor/origin, presentation duration, and optional transition information.

Motion Rig 2 deliberately does not cycle every available painting. At phone size, several adjacent regular-enemy cells read as a body rotation rather than continuous locomotion. The stable runtime cell policy is:

| Role | Stable cells used by the rig | Cells intentionally excluded from looping |
| --- | --- | --- |
| Mogu | frame 0 for all rig states | all alternate cells; the continuous transform owns body motion |
| Regular enemy | soft 0, bat 6, stone 12, ghost 18; hit cells 5, 11, 17, 23 only during `hurt` | the side/diagonal move and attack paintings (+2, +3, +4 per row) |
| Companion | frame 0 normally, frame 2 only during attack release, frame 7 for celebration | frame 3 is not alternated with frame 2; move cells do not drive the rig |

Regular enemies are authored as front-facing characters. The renderer does not mirror them and forces rotation to zero; hurt displacement may move away from the incoming side without rotating the painting. Boss cells remain atlas-driven because their windup, release, and recovery sequence is coherent.

## Motion quality rules

- An action must include anticipation, release/impact, and recovery when the action calls for them.
- Do not represent a meaningful attack as an instantaneous switch to one unrelated image.
- Adjacent frames must keep identity, volume, lighting, and contact points coherent.
- State changes blend without a one-frame pose cut. Repeated attacks in the same state require a serial/event key that restarts presentation.
- Sprite origin, collision center, shadow, glow, and facing must remain stable unless their movement is intentional.
- Close-range velocity jitter must not make enemies repeatedly flip direction. Actions lock facing through their readable release.
- Display scale and squash/stretch are presentation-only; gameplay collision remains core-owned.
- Pause freezes the deterministic presentation clock. Resume must not skip directly to a different semantic state.

## Motion Rig 2

`js/mogu-rig.js` is engine-independent and deterministic. Each actor has its own controller, event serial, and elapsed visual time. It samples a pose from semantic state, blends transitions, and applies presentation-only position, rotation, scale, glow, shadow, and facing to the sprite.

The rig supports `idle`, `move`, `attack`, `hurt`, `consume`, `celebrate`, and `defeat`. State aliases such as `skill`, `telegraph`, and `hit` normalize to those states. A changed event serial restarts a repeated action even when its semantic state did not change.

The approved attack profiles are fixed contract values:

| Role | Anticipation | Release | Recoil | Recovery | Total | Core release marker |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Mogu | 0.14 s | 0.20 s | 0.22 s | 0.28 s | 0.84 s | 0.2666666667 |
| Regular enemy | 0.18 s | 0.14 s | 0.20 s | 0.26 s | 0.78 s | 0.3061538462 |
| Companion | 0.12 s | 0.13 s | 0.16 s | 0.17 s | 0.58 s | 0.3010344828 |

Anticipation, recoil, and recovery progress use smoothstep. Release uses the authored ease-out-back curve `1 + 2.70158(t − 1)³ + 1.70158(t − 1)²`; its transform overshoot is intentional. Recovery adds the damped settle `sin(2π × 1.2t) × exp(−3.4t)` with 1.2 px vertical, 0.012 rad rotation, +0.016 scale X, and −0.014 scale Y amplitudes.

Ambient idle periods are 1.42 s for Mogu/companions and 1.72 s for regular enemies. Move periods are 0.62 s for Mogu/enemies and 0.54 s for companions. Enemy rotation remains zero in every continuous pose.

## Projectile and formation ownership

The release marker is a presentation synchronization point, not a gameplay hit or collision marker. A target-confirmed visual windup may begin before the cooldown reaches zero. The real projectile keeps its core-owned spawn time, position, velocity, collision, damage, and action serial; its spawn must not restart the rig. An immediate shot enters at the release marker instead of delaying gameplay.

Presentation muzzle offsets are Mogu (+25, −13), companion (+18, −11), and regular enemy (−18, −5) pixels, mirrored only for actors whose painting supports facing. The displayed origin is (0.5, 0.62). These offsets may align effects, but they never replace core projectile coordinates.

Companions keep core-owned simulation coordinates. The renderer places up to six display sprites in rear slots, applies target delays from 0 to 0.15 s, and follows them with a critically damped spring at ω = 12 s⁻¹. Formation position, spring velocity, and size are renderer-only and never affect targeting, collision, cooldown, save data, or DPS.

The battle scene owns elapsed presentation time. Core simulation delta must not be reused as a second animation clock.

## Reduced motion and adaptive quality

- `prefers-reduced-motion: reduce` scales continuous ambient displacement to 0.48 and semantic combat displacement to 0.65; it also trims shake and zoom.
- It must retain readable attack, hurt, telegraph, release, recovery, and defeat meaning.
- Low quality may reduce particles, effect budgets, DPR, and background-layer intensity.
- Low quality may reduce ambient transform amplitude, but must not slow or skip combat states in a way that changes the perceived action window.
- World movement and player-linked parallax remain legible under reduced motion.

## Adding or changing animation

1. Define role, variant, semantic states, timing, loop behavior, anchor and transition needs.
2. Produce coherent transparent atlas art; do not extract it from a mockup or key visual.
3. Update `config/animation-manifest.json`. If a projected image/grid/frame field changes, also bump `runtimeVersion` and update `config/project-state.json.versions.animationManifest` plus the runtime atlas projection; renderer-only rig metadata does not require a projection bump.
4. Update state emission or renderer mapping only where necessary; keep core/render ownership intact.
5. Add/adjust tests for manifest frames, action restart, latching, facing, pause/resume, reduced motion and low quality.
6. Inspect at 390×844 and 375×667 actual size, including idle→move, move→attack, attack→idle/recover, hit interruption, consume/celebrate, defeat, repeated attacks, overlap and frame pacing.
7. Check projectile release alignment without changing its core spawn/collision path, and check renderer-only companion formation under rapid direction changes.
8. Check that the same entity does not rotate or flip unexpectedly and that anchors do not jump.

Relevant automated coverage is in `tests/mogu-rig.test.js`, `tests/battle-v3-scene.test.js`, `tests/battle-v3-loader.test.js`, and `tests/game-resume.test.js`.
