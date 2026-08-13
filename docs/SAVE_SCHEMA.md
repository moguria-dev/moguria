# Save schema and invariants

The save is client-side localStorage data. It provides continuity and corruption recovery, not server-grade trust or cheat resistance.

## Version and storage key

- Canonical payload version: `config/project-state.json.versions.saveSchema`.
- Current normalized payload: version 3.
- Current localStorage key: `moguria.save.v2`.
- Legacy key: `moguria.prototype.save.v1`.

The `v2` key is intentionally retained so existing users migrate in place. `MoguriaSave.normalize()` always writes a version 3 payload. Do not rename the key merely to match the payload number; a key migration requires explicit compatibility design and tests.

Executable ownership:

- `js/save.js`: base schema, normalization, migration, backup/quarantine, active run and settlement;
- `js/meta.js`: normalized `meta` extension and equipment/currency operations;
- `js/game.js`: checkpoint version 1 snapshot and restore behavior;
- `js/player.js`: player snapshot version 1 and definition reconnection by ID.

## Top-level payload

```text
saveVersion: 3
belly: number
maxBelly: number
lastBellyAt: epoch milliseconds
snackAt: epoch milliseconds
runs: Run[]
activeRun: ActiveRun | null
settledRunIds: string[]
dex:
  skills: object
  artifacts: object
  synergies: object
  titles: object
best:
  floor: number
  damage: number
  kills: number
  dps: number
meta:
  coins: number
  inventory: EquipmentItem[]
  equipped: { hat, body, hand, foot, charm }
  upgrades: object
  claimedChallenges: object
  daily: { key, claimed }
```

Normalization clamps numeric fields, repairs object/array shapes, limits run history, deduplicates settled IDs, and clears an `activeRun` whose ID is already settled.

Unknown top-level or run fields may currently survive object spread. That is compatibility behavior, not permission to add undocumented state. New durable fields require a default, normalization, migration behavior and tests.

## Active run

An active run contains at least:

```text
runId: non-empty string, at most 128 characters
startedAt: epoch milliseconds
updatedAt: epoch milliseconds >= startedAt
checkpoint: CheckpointV1 | absent
checkpointReason: string | absent
```

### Transaction invariants

1. `startRun()` consumes one belly and creates `activeRun` in one localStorage write.
2. Reusing the same active `runId` resumes without another write or belly consumption.
3. A different active run is rejected; it is not silently overwritten.
4. A run ID already found in the settlement ledger or run history cannot start again.
5. `updateCheckpoint()` accepts only the exact active `runId`.
6. `settleRun()` writes coins, run history, best values, dex, settlement ledger and active-run removal together.
7. A settled ID can never pay twice.
8. A write failure is returned as failure; UI must not claim completion or consumption.

Do not split these operations into independent saves.

## Checkpoint version 1

`js/game.js` currently snapshots:

```text
version: 1
savedAt
wave
floor
time
player: PlayerSnapshotV1
stats
rerolls
artifactRerolls
bans
bannedSkills
artifactWaves
choiceType
pendingChoice
collectAllSchedule
collectAllDrop
defeated
dungeon: { seed }
```

The checkpoint preserves exact pending skill/artifact cards, reroll counts including zero, bans, collect-all plan/live drop, and defeat state. Ordinary run checkpoints restart at the entrance of the current wave while preserving player progress and run stats. An artifact checkpoint resumes at the cleared wave so selection advances exactly once.

Player snapshot version 1 stores normalized numeric/boolean maps, skill levels, skill/artifact/fusion IDs, visual data, and equipment visuals. Restore reconnects durable IDs to current definitions; definitions themselves are not serialized as executable objects.

## Run history and settlement

Run history includes normalized arrays for titles, skills, artifacts, synergies, and visual data, plus result statistics supplied by `js/game.js`. The log is capped by `MoguriaConfig.security.maxRunLog`; the settlement ledger retains at least 40 entries and normally four times the run-log cap.

`MoguriaMeta.awardFromRun()` calculates the reward and delegates the single durable transaction to `MoguriaSave.settleRun()`. It must not award currency separately.

## Migration and corruption handling

- Existing JSON under `moguria.save.v2` is parsed and normalized to v3.
- If the current key is absent, legacy keys are checked and copied through normalization.
- Malformed current data is copied to `moguria.corrupt.<timestamp>` when possible, then a fresh payload is returned.
- Malformed legacy data is quarantined with a legacy-specific prefix.
- Manual backup uses `moguria.backup.<reason>.<timestamp>`.
- localStorage read/write/remove failures are caught and reported rather than crashing the application.

Browser storage is origin-scoped. A public save is not automatically available on localhost.

## Changing durable state

Any schema change must:

1. update `config/project-state.json.versions.saveSchema`;
2. define fresh defaults and normalization;
3. define migration from every supported prior payload;
4. preserve or explicitly retire active-run/checkpoint compatibility;
5. preserve atomic settlement and idempotency;
6. handle write failure and malformed input;
7. add tests to `tests/save-v3.test.js` and affected resume/meta tests;
8. document user-visible reset or incompatibility risk before implementation;
9. avoid publication until old-save, reload, resume, settlement and duplicate-prevention QA pass.
