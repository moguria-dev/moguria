# Save schema and invariants

The save is client-side localStorage data. It provides continuity and corruption recovery, not server-grade trust or cheat resistance.

## Version and storage key

- Canonical payload version: `config/project-state.json.versions.saveSchema`.
- Current normalized payload: version 4.
- Current localStorage key: `moguria.save.v2`.
- Legacy key: `moguria.prototype.save.v1`.

The `v2` key is intentionally retained so existing users migrate in place. `MoguriaSave.normalize()` always returns a version 4 payload, which is persisted by the next save mutation rather than by a read-only load. Do not rename the key merely to match the payload number; a key migration requires explicit compatibility design and tests.

Executable ownership:

- `js/save.js`: base schema, normalization, migration, backup/quarantine, independent story state, active run and settlement;
- `js/meta.js`: normalized `meta` extension and equipment/currency operations;
- `js/game.js`: run-profile selection plus checkpoint version 1 snapshot and restore behavior;
- `js/player.js`: player snapshot version 1 and definition reconnection by ID.

## Top-level payload

```text
saveVersion: 4
belly: number
maxBelly: number
lastBellyAt: epoch milliseconds
snackAt: epoch milliseconds
runs: Run[]
activeRun: ActiveRun | null
settledRunIds: string[]
story:
  schemaVersion: 1
  contentVersion: "c1-v1"
  entryMode: "new" | "existing"
  currentChapterId: "c1"
  currentNodeId: StoryNodeId
  completedChapterIds: string[]
  seenEventIds: string[]
  transitionIds: string[]
  replayUnlockIds: string[]
  knowledgeFlags: string[]
  worldFlags: object
  keyItems: object
  boundRun: StoryBoundRun | null
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

Normalization clamps numeric fields, repairs object/array shapes, limits run history, deduplicates settled IDs, allow-lists Chapter 1 story IDs/flags, and clears an `activeRun` whose ID is already settled. Unknown or future story content falls back to the safe Chapter 1 available/complete node instead of trusting arbitrary node IDs. `story.transitionIds` is rebuilt as the canonical ordered prefix through the current node, so duplicate, future, and out-of-order IDs cannot skip a scene boundary.

Unknown top-level or run fields may currently survive object spread. That is compatibility behavior, not permission to add undocumented state. New durable fields require a default, normalization, migration behavior and tests.

## Active run

An active run contains at least:

```text
runId: non-empty string, at most 128 characters
startedAt: epoch milliseconds
updatedAt: epoch milliseconds >= startedAt
profileId: "normal-v1" | "story-c1-investigation-v1"
runKind: "normal" | "story"
checkpoint: CheckpointV1 | absent
checkpointReason: string | absent
```

### Transaction invariants

1. `startRun()` creates `activeRun` in one localStorage write. `normal-v1` consumes one belly in that write; the explicit `story-c1-investigation-v1` profile consumes zero.
2. Reusing the same active `runId` resumes without another write or belly consumption.
3. A different active run is rejected; it is not silently overwritten.
4. A run ID already found in the settlement ledger or run history cannot start again.
5. `updateCheckpoint()` accepts only the exact active `runId`.
6. `settleRun()` writes coins, run history, best values, dex, settlement ledger and active-run removal together.
7. A settled ID can never pay twice.
8. A write failure is returned as failure; UI must not claim completion or consumption.
9. A story run must match both the active profile/run ID and `story.boundRun`; it cannot settle through a normal or foreign run.
10. A failed/given-up Chapter 1 attempt does not complete its objective. Retry resets the bound checkpoint and consumes zero belly.
11. A new Chapter 1 story run can start only from `c1_investigation_ready`; `startRun()` records the corresponding transition in the same zero-cost write.

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

The run profile lives on `activeRun`, not in an untrusted checkpoint override. Restoring a Chapter 1 checkpoint therefore keeps the four-wave cap and its empty artifact/boss schedules; restoring a normal checkpoint keeps the 12-wave rules. Story and normal checkpoints share version 1 because their serialized combat shape is the same.

Player snapshot version 1 stores normalized numeric/boolean maps, skill levels, skill/artifact/fusion IDs, visual data, and equipment visuals. Restore reconnects durable IDs to current definitions; definitions themselves are not serialized as executable objects.

## Run history and settlement

Run history includes normalized arrays for titles, skills, artifacts, synergies, and visual data, plus result statistics supplied by `js/game.js`. The log is capped by `MoguriaConfig.security.maxRunLog`; the settlement ledger retains at least 40 entries and normally four times the run-log cap.

`MoguriaMeta.awardFromRun()` calculates the reward and delegates the single durable transaction to `MoguriaSave.settleRun()`. It must not award currency separately. A cleared bound Chapter 1 run is recorded idempotently, clears `story.boundRun`, and advances `story.currentNodeId` to `c1_return_pending`; it does not itself mark the chapter complete. Return and ledger playback precede `completeStoryChapter()`.

## Chapter 1 story state

The `story` object is normalized independently from belly, equipment, dex, best values, and ordinary run history. It currently recognizes only Chapter 1 nodes, replay IDs, knowledge flags, and its durable world/key-item fields.

For v3.4.0, `c1_complete` and the `c1` completion entry close the approved four-motion playable-vertical-slice route. They do not assert that every beat in the longer Game Design v0.1 review draft has shipped; any later expansion must use an explicit `contentVersion` migration instead of silently reinterpreting existing saves.

`story.boundRun` contains:

```text
runId
chapterId: "c1"
encounterId: "c1-investigation"
profileId: "story-c1-investigation-v1"
objectiveVersion: 1
```

The bound record prevents an unrelated active run from advancing the story. A fresh install receives `entryMode: "new"`; data migrated from an earlier payload receives `entryMode: "existing"`, keeping Chapter 1 optional rather than replacing the established player's normal main action. Any `activeRun` still has resume priority.

Ordinary scene boundaries advance through `transitionStory(nextNodeId, patch)`. Each approved one-way transition appends one known transition ID in the same write; a repeated delivery returns `alreadyApplied` without writing. `startRun()`, `settleRun()`, and `completeStoryChapter()` exclusively own the investigation-start, investigation-settlement, and chapter-completion transitions. `updateStory()` may update allow-listed scene knowledge and world state, but rejects structural fields including schema/content identity, entry mode, chapter/node identity, transition/completion ledgers, and the bound run. A `transitionStory()` patch is subject to the same structural-field protection; only the transition itself can move the node and ledger.

```text
c1_available             --c1-enter-seat-------------> c1_seat
c1_seat                  --c1-seat-complete----------> c1_return_lamp
c1_return_lamp           --c1-return-lamp-complete---> c1_shard
c1_shard                 --c1-shard-complete---------> c1_investigation_ready
c1_investigation_ready   --c1-investigation-started--> c1_investigation_active
c1_investigation_active  --c1-investigation-settled--> c1_return_pending
c1_return_pending        --c1-record-opened----------> c1_record_signal
c1_record_signal         --c1-chapter-complete-------> c1_complete
```

Chapter completion is a separate write after the return/ledger sequence. It requires `c1_record_signal`, the complete transition prefix through that node, a settled investigation flag, and `old-record-responded` knowledge. It then adds `c1` to completed chapters, unlocks the approved replay/knowledge flags, records the approved Chapter 1 world/key-item state, and sets `currentNodeId` to `c1_complete`. Arrays remain deduplicated by normalization, so replaying cannot multiply durable entries.

## Migration and corruption handling

- Existing JSON under `moguria.save.v2` is parsed and normalized to v4.
- A v1-v3 payload receives the v4 story defaults with `entryMode: "existing"`; ordinary belly, runs, meta, dex, best values, active run, and settlement IDs remain normalized in place.
- If the current key is absent, legacy keys are checked and copied through normalization.
- Malformed current data is copied to `moguria.corrupt.<timestamp>` when possible, then a fresh payload with `story.entryMode: "existing"` is returned. Even an empty corrupt current-key value does not become a forced first-run Story entry.
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
7. add tests to the save compatibility suite (currently named `tests/save-v3.test.js`), story tests, and affected resume/meta tests;
8. document user-visible reset or incompatibility risk before implementation;
9. avoid publication until old-save, reload, resume, settlement and duplicate-prevention QA pass.
