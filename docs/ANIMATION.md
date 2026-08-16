# Animation contract

Moguria uses two renderer-specific animation contracts. Battle combines semantic sprite states with a continuous presentation rig in Phaser. Chapter 1 uses fixed-cell key-pose atlases plus procedural Canvas2D effects and DOM interaction. In both systems, timing, state order, anchors, pause/resume, and reduced-motion behavior must remain readable at actual mobile size.

## Sources and projections

- `config/animation-manifest.json` is the canonical machine-readable animation inventory and target contract.
- `assets/images/battle-v3/atlas.json` is the Battle renderer-compatible projection at runtime version 2.
- `assets/animations/story-ch01.json` is the separate Story renderer-compatible projection at runtime version 1.
- `config/project-state.json.validation.animationSource` names the canonical source. `validation.animationRuntimeOutput` / `generated.animationManifest` name Battle output; `validation.storyAnimationRuntimeOutput` / `generated.storyAnimationManifest` name Story output.
- `js/battle-v3-scene.js` defines the per-actor renderer bridge, stable atlas-cell policy, companion formation, and temporary compatibility defaults.
- `js/mogu-rig.js` defines deterministic Motion Rig 2 poses and state blending for Mogu, regular enemies, and companions. Bosses retain their reviewed atlas sequences.
- `js/story-ch01-player.js` consumes the Story projection, advances its own deterministic presentation clock, draws Canvas2D visual layers, and coordinates DOM controls without depending on Phaser.

For Battle, the canonical timing, transition, and event-marker fields remain an audited backfill of renderer behavior rather than runtime-consumed configuration. This is recorded as `runtimeContract.implementationStatus: audited-backfill` and `runtimeConsumed: false`; editing those Battle fields alone does not change gameplay presentation. Chapter 1 is different: its player consumes the separate Story projection, while save/game state remains authoritative for progression.

Update shared image/grid/frame fields and the affected renderer version in the canonical manifest and its matching projection together. Motion Rig 2 changes renderer behavior and audited canonical metadata, but not the Battle projected image/grid/frame object, so Battle remains at runtime version 2. Chapter 1 additions use Story runtime version 1 and must not cause an unrelated Battle projection bump. When renderer timing or semantic composition changes, update the audited contract in the same change and run the schema/projection validator plus renderer behavior tests. Do not hide a manifest discrepancy by adding another fallback table in code.

## Chapter 1 Story contract

The Story projection declares four fixed-cell pose atlases, four scene motions, the logical `390×844` viewport, a DPR cap, the `375×667` minimum viewport, layer order, safe area, and lifecycle behavior. Text is never baked into painted assets: Canvas2D owns background/prop/actor/effect composition and DOM owns narrative copy, controls, focus, status announcements, and the deliberate hold.

| Motion | Contract | Canonical reading |
| --- | --- | --- |
| Return Light | 5,400 ms one-shot | Stable → narrow/tilt → one irregular weakening → minimum that never turns off → incomplete, unstable recovery. It must not read as an alarm, input failure, or regular heartbeat, and the weakening must not repeat while the player waits to continue. |
| Reverse/crack/rescue | 6,400 ms one-shot | Reverse begins before the crack and before young Mogu is caught. The Guardian chooses rescue and the scene exits with the child protected; the Star Companion is absent from the past. |
| Fragment commitment | 700 ms pre-commit, untimed wait, 850 ms deliberate hold, then 5,250 ms post-commit sequence | There is no timeout, failure, score, QTE, or branch. The fragment is consumed, the community lamp restores first, Mogu shows interference and stumbles, the companion stays near, then Mogu masks discomfort with a smile. |
| Ledger response | 5,400 ms one-shot | One ambiguous, incomplete pulse contains an exact 320 ms broken gap and ends in silence. It must not confirm survival, identity, a Guardian mark, “one awaiting return,” or an item acquisition. |

Every one-shot event marker fires at most once per playback. Duplicate starts are ignored while running. Document hiding or pause freezes the story clock and defers unfired markers; resume continues from frozen time without catch-up. Scene exit cancels timers/listeners/particles and releases scene textures. Actor atlases use the full declared cell, stable pivot, and `noAutoCrop` rule so differing alpha bounds cannot move the actor's feet or center.

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

## Loading Child Mogu flight motion

Startup and adventure loading use the dedicated active asset `loading_child_mogu_flight` and canonical animation entry `uiAnimations.loadingChildMoguFlight`. It is a 256×128 lossless WebP with two fixed 128×128 cells extracted deterministically from the approved `battle_v3_companions` production atlas: neutral is source frame 0 at cell 0, and complete is source frame 7 at cell 1. CSS uses `background-size: 200% 100%`, `background-position: 0 0` for neutral, and `100% 0` for complete. The battle atlas remains battle-pack-owned; loading never pulls the 1024×512 atlas into the critical set.

The render box is 64×64 CSS pixels on a fixed cell canvas. Automatic crop is prohibited. Measured at nonzero alpha, the neutral visual bounds are 98×84 source-cell pixels from `(15, 24)`, the complete bounds are 98×92 from `(7, 11)`, and their union is 106×97 from `(7, 11)`. The stable pivot is `(0.5, 0.78)` in normalized cell space. Keeping the full cell, pivot, fill tip and gate geometry stable prevents a visible jump when the art changes from neutral to complete.

The loading actor and determinate progress UI are one causal system:

- During a progress plateau its horizontal delta is exactly 0; only the `.54s` vertical hover continues.
- During an advance its horizontal position comes from the effective progress-fill tip and uses the same `.22s cubic-bezier(.22,.8,.3,1)` transition. It never advances on elapsed time or fabricated percentage.
- At 100%, arrival keeps the neutral cell until horizontal movement reaches the gate. Contact stops hover without changing horizontal position. Complete then selects the right-hand complete cell and holds it until the overlay exits.
- Pausing or hiding the presentation does not invent progress. Resume continues from the current effective progress value.

The bubble, status copy, Tips, progress value, bar, gate and delayed wait hint remain DOM content and are not baked into the image. Under `prefers-reduced-motion: reduce`, hover and decorative motion stop while progress-synchronized horizontal position, determinate status changes, and the neutral-to-complete frame change remain available.

## Reduced motion and adaptive quality

- `prefers-reduced-motion: reduce` scales continuous ambient displacement to 0.48 and semantic combat displacement to 0.65; it also trims shake and zoom.
- It must retain readable attack, hurt, telegraph, release, recovery, and defeat meaning.
- Low quality may reduce particles, effect budgets, DPR, and background-layer intensity.
- Low quality may reduce ambient transform amplitude, but must not slow or skip combat states in a way that changes the perceived action window.
- World movement and player-linked parallax remain legible under reduced motion.

For Story, reduced motion preserves the same causal order using short crossfades between semantic still states. It disables camera shake, rapid parallax, particle flow, and zoom where declared, but does not remove the deliberate hold, the fragment/lamp ordering, rescue causality, or the ledger's 320 ms gap. Pausing or backgrounding must not fabricate elapsed time in either motion mode.

## Adding or changing animation

1. Define role, variant, semantic states, timing, loop behavior, anchor and transition needs.
2. Produce coherent transparent atlas art; do not extract it from a mockup or key visual.
3. Update `config/animation-manifest.json`. If a projected image/grid/frame field changes, also bump `runtimeVersion` and update `config/project-state.json.versions.animationManifest` plus the runtime atlas projection; renderer-only rig metadata does not require a projection bump.
4. Update state emission or renderer mapping only where necessary; keep core/render ownership intact.
5. Add/adjust tests for manifest frames, action restart, latching, facing, pause/resume, reduced motion and low quality.
6. Inspect at 390×844 and 375×667 actual size, including idle→move, move→attack, attack→idle/recover, hit interruption, consume/celebrate, defeat, repeated attacks, overlap and frame pacing.
7. Check projectile release alignment without changing its core spawn/collision path, and check renderer-only companion formation under rapid direction changes.
8. Check that the same entity does not rotate or flip unexpectedly and that anchors do not jump.

For Chapter 1, additionally verify all four motions at `390×844` and `375×667`, normal and reduced motion, before/after pause, after document hide/resume, and at the earliest and delayed fragment hold commitment. Runtime video and a pivot-overlay inspection remain required release evidence; do not infer them from a manifest-only test.

Relevant automated coverage is in `tests/mogu-rig.test.js`, `tests/battle-v3-scene.test.js`, `tests/battle-v3-loader.test.js`, `tests/game-resume.test.js`, and `tests/story-ch01-manifest.test.js`. Renderer behavior still requires browser/video QA; projection validation alone is not a visual pass.
