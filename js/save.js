window.MoguriaSave = (() => {
  const cfg = window.MoguriaConfig || {};
  const KEY = cfg.storage?.key || 'moguria.save.v2';
  const LEGACY_KEYS = cfg.storage?.legacyKeys || ['moguria.prototype.save.v1'];
  // The storage key stays stable while the normalized payload advances.
  const SAVE_VERSION = 4;
  const MAX_RUN_LOG = cfg.security?.maxRunLog || 20;
  const MAX_SETTLED_RUN_IDS = Math.max(40, MAX_RUN_LOG * 4);
  const BACKUP_PREFIX = cfg.storage?.backupPrefix || 'moguria.backup.';
  const CORRUPT_PREFIX = cfg.storage?.corruptPrefix || 'moguria.corrupt.';
  const NORMAL_PROFILE_ID = 'normal-v1';
  const STORY_PROFILE_ID = 'story-c1-investigation-v1';
  const STORY_NODES = new Set(['c1_available','c1_seat','c1_return_lamp','c1_shard','c1_investigation_ready','c1_investigation_active','c1_return_pending','c1_record_signal','c1_complete']);
  const STORY_EVENTS = new Set(['c1-seat-plate','c1-seat-bag','c1-seat-return-light']);
  const STORY_KNOWLEDGE = new Set(['return-light-seen','shared-lamp-seen','damaged-fragment-seen','old-record-responded']);
  const STORY_REPLAYS = new Set(['c1-seat','c1-return-lamp','c1-shard','c1-record-signal']);
  const STORY_TRANSITIONS = Object.freeze({
    c1_available: Object.freeze({ next:'c1_seat', id:'c1-enter-seat' }),
    c1_seat: Object.freeze({ next:'c1_return_lamp', id:'c1-seat-complete' }),
    c1_return_lamp: Object.freeze({ next:'c1_shard', id:'c1-return-lamp-complete' }),
    c1_shard: Object.freeze({ next:'c1_investigation_ready', id:'c1-shard-complete' }),
    c1_investigation_ready: Object.freeze({ next:'c1_investigation_active', id:'c1-investigation-started', owner:'startRun' }),
    c1_investigation_active: Object.freeze({ next:'c1_return_pending', id:'c1-investigation-settled', owner:'settleRun' }),
    c1_return_pending: Object.freeze({ next:'c1_record_signal', id:'c1-record-opened' }),
    c1_record_signal: Object.freeze({ next:'c1_complete', id:'c1-chapter-complete', owner:'completeStoryChapter' })
  });
  const STORY_TRANSITION_IDS = new Set(Object.values(STORY_TRANSITIONS).map(item => item.id));
  const STORY_PROTECTED_FIELDS = Object.freeze([
    'schemaVersion','contentVersion','entryMode','currentChapterId',
    'currentNodeId','transitionIds','completedChapterIds','boundRun'
  ]);
  let lastSaveResult = { ok: true, error: null };

  const now = () => Date.now();

  const freshStory = (entryMode = 'new') => ({
    schemaVersion: 1,
    contentVersion: 'c1-v1',
    entryMode: entryMode === 'existing' ? 'existing' : 'new',
    currentChapterId: 'c1',
    currentNodeId: 'c1_available',
    completedChapterIds: [],
    seenEventIds: [],
    transitionIds: [],
    replayUnlockIds: [],
    knowledgeFlags: [],
    worldFlags: {},
    keyItems: {},
    boundRun: null
  });

  const fresh = () => ({
    saveVersion: SAVE_VERSION,
    belly: cfg.belly?.max || 3,
    maxBelly: cfg.belly?.max || 3,
    lastBellyAt: now(),
    snackAt: 0,
    runs: [],
    activeRun: null,
    settledRunIds: [],
    story: freshStory('new'),
    dex: { skills: {}, artifacts: {}, synergies: {}, titles: {} },
    best: { floor: 0, damage: 0, kills: 0, dps: 0 }
  });

  function warn(message, error){
    console.warn('[MoguriaSave] ' + message, error || '');
  }

  function safeGetItem(key){
    try {
      return localStorage.getItem(key);
    } catch (error) {
      warn('localStorage getItem failed: ' + key, error);
      return null;
    }
  }

  function safeSetItem(key, value){
    try {
      localStorage.setItem(key, value);
      return { ok: true, error: null };
    } catch (error) {
      warn('localStorage setItem failed: ' + key, error);
      return { ok: false, error };
    }
  }

  function safeRemoveItem(key){
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      warn('localStorage removeItem failed: ' + key, error);
      return false;
    }
  }

  function finiteNumber(value, fallback = 0){
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function plainObject(value){
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function normalizeRunId(value){
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    return String(value).trim().slice(0, 128);
  }

  function allowedList(value, allow, max = 64){
    return Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string' && allow.has(id)))].slice(0, max) : [];
  }

  function transitionIdsThrough(nodeId){
    const ids = [];
    let node = 'c1_available';
    while (node !== nodeId) {
      const transition = STORY_TRANSITIONS[node];
      if (!transition) return null;
      ids.push(transition.id);
      node = transition.next;
    }
    return ids;
  }

  function transitionLedgerSupports(nodeId, ids){
    const required = transitionIdsThrough(nodeId);
    return Boolean(required && required.every(id => ids.includes(id)));
  }

  function protectedStoryField(value){
    const source = plainObject(value);
    return STORY_PROTECTED_FIELDS.find(key => Object.prototype.hasOwnProperty.call(source, key)) || '';
  }

  function transitionInto(nodeId){
    return Object.values(STORY_TRANSITIONS).find(transition => transition.next === nodeId) || null;
  }

  function normalizeBoundRun(value){
    const run = plainObject(value);
    const runId = normalizeRunId(run.runId);
    if (!runId || run.profileId !== STORY_PROFILE_ID) return null;
    return { runId, chapterId: 'c1', encounterId: 'c1-investigation', profileId: STORY_PROFILE_ID, objectiveVersion: 1 };
  }

  function normalizeStory(value, fallbackEntryMode = 'existing'){
    const source = plainObject(value);
    const entryMode = source.entryMode === 'new' || source.entryMode === 'existing' ? source.entryMode : fallbackEntryMode;
    const completedChapterIds = allowedList(source.completedChapterIds, new Set(['c1']), 8);
    const suppliedTransitionIds = allowedList(source.transitionIds, STORY_TRANSITION_IDS, STORY_TRANSITION_IDS.size);
    const knownContent = source.contentVersion === 'c1-v1';
    const chapterComplete = completedChapterIds.includes('c1');
    const requestedNodeId = knownContent && STORY_NODES.has(source.currentNodeId) && source.currentNodeId !== 'c1_complete'
      ? source.currentNodeId
      : 'c1_available';
    const requiredTransitionIds = transitionIdsThrough(requestedNodeId);
    const ledgerValid = Boolean(requiredTransitionIds && requiredTransitionIds.every((id, index) => suppliedTransitionIds[index] === id));
    const currentNodeId = chapterComplete ? 'c1_complete' : ledgerValid ? requestedNodeId : 'c1_available';
    // The ledger is an ordered prefix, not an unordered bag. Dropping future or
    // out-of-order IDs prevents corrupt data from falsely skipping a transition.
    const transitionIds = chapterComplete
      ? transitionIdsThrough('c1_complete')
      : ledgerValid ? requiredTransitionIds : [];
    const world = plainObject(source.worldFlags);
    const keyItems = plainObject(source.keyItems);
    const replayUnlockIds = allowedList(source.replayUnlockIds, STORY_REPLAYS);
    const knowledgeFlags = allowedList(source.knowledgeFlags, STORY_KNOWLEDGE);
    if (chapterComplete) {
      for (const id of STORY_REPLAYS) if (!replayUnlockIds.includes(id)) replayUnlockIds.push(id);
      for (const id of STORY_KNOWLEDGE) if (!knowledgeFlags.includes(id)) knowledgeFlags.push(id);
    }
    const worldFlags = {
      ...(typeof world.c1InvitationSeen === 'boolean' ? { c1InvitationSeen: world.c1InvitationSeen } : {}),
      ...(typeof world.c1SharedLampRestored === 'boolean' ? { c1SharedLampRestored: world.c1SharedLampRestored } : {}),
      ...(typeof world.c1OldRecordResponded === 'boolean' ? { c1OldRecordResponded: world.c1OldRecordResponded } : {}),
      ...(typeof world.c1InvestigationComplete === 'boolean' ? { c1InvestigationComplete: world.c1InvestigationComplete } : {})
    };
    if (chapterComplete) Object.assign(worldFlags, { c1InvitationSeen:true, c1SharedLampRestored:true, c1OldRecordResponded:true, c1InvestigationComplete:true });
    return {
      ...freshStory(entryMode),
      currentNodeId,
      completedChapterIds,
      seenEventIds: allowedList(source.seenEventIds, STORY_EVENTS),
      transitionIds,
      replayUnlockIds,
      knowledgeFlags,
      worldFlags,
      keyItems: chapterComplete || keyItems.purpleScarf === 'story-present-unexplained' ? { purpleScarf:'story-present-unexplained' } : {},
      boundRun: normalizeBoundRun(source.boundRun)
    };
  }

  function createRunId(){
    try {
      if (window.crypto?.randomUUID) return 'run_' + window.crypto.randomUUID();
    } catch (error) {
      warn('crypto.randomUUID failed; using fallback run id', error);
    }
    return 'run_' + now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
  }

  function normalizeRun(run){
    const r = plainObject(run);
    const out = {
      ...r,
      titles: Array.isArray(r.titles) ? r.titles : [],
      skills: Array.isArray(r.skills) ? r.skills : [],
      artifacts: Array.isArray(r.artifacts) ? r.artifacts : [],
      synergies: Array.isArray(r.synergies) ? r.synergies : [],
      visual: plainObject(r.visual)
    };
    const runId = normalizeRunId(r.runId);
    if (runId) out.runId = runId;
    else delete out.runId;
    return out;
  }

  function normalizeActiveRun(activeRun){
    const active = plainObject(activeRun);
    const runId = normalizeRunId(active.runId);
    if (!runId) return null;
    const startedAt = Math.max(0, Math.floor(finiteNumber(active.startedAt, now())));
    const updatedAt = Math.max(startedAt, Math.floor(finiteNumber(active.updatedAt, startedAt)));
    const profileId = active.profileId === STORY_PROFILE_ID ? STORY_PROFILE_ID : NORMAL_PROFILE_ID;
    return { ...active, runId, startedAt, updatedAt, profileId, runKind: profileId === STORY_PROFILE_ID ? 'story' : 'normal' };
  }

  function normalize(data, options = {}){
    const base = fresh();
    const source = plainObject(data);
    const out = { ...base, ...source };
    out.saveVersion = SAVE_VERSION;
    out.maxBelly = Math.max(1, Math.floor(finiteNumber(out.maxBelly, base.maxBelly)));
    out.belly = Math.max(0, Math.min(out.maxBelly, Math.floor(finiteNumber(out.belly, base.belly))));
    out.snackAt = Math.max(0, Math.floor(finiteNumber(out.snackAt, 0)));
    out.lastBellyAt = Math.max(0, Math.floor(finiteNumber(out.lastBellyAt, now())));
    out.runs = Array.isArray(out.runs) ? out.runs.slice(0, MAX_RUN_LOG).map(normalizeRun) : [];
    out.settledRunIds = Array.isArray(out.settledRunIds)
      ? [...new Set(out.settledRunIds.map(normalizeRunId).filter(Boolean))].slice(0, MAX_SETTLED_RUN_IDS)
      : [];
    out.activeRun = normalizeActiveRun(out.activeRun);
    if (out.activeRun && out.settledRunIds.includes(out.activeRun.runId)) out.activeRun = null;
    const migrated = finiteNumber(source.saveVersion, 0) > 0 && finiteNumber(source.saveVersion, 0) < SAVE_VERSION;
    out.story = normalizeStory(source.story, migrated || options.existingRecord ? 'existing' : 'new');
    if (out.activeRun?.profileId === STORY_PROFILE_ID) {
      out.story.boundRun = normalizeBoundRun(out.story.boundRun) || normalizeBoundRun(out.activeRun);
      out.story.currentNodeId = 'c1_investigation_active';
      out.story.transitionIds = transitionIdsThrough('c1_investigation_active');
    } else out.story.boundRun = null;
    out.dex = { ...base.dex, ...plainObject(out.dex) };
    out.dex.skills = plainObject(out.dex.skills);
    out.dex.artifacts = plainObject(out.dex.artifacts);
    out.dex.synergies = plainObject(out.dex.synergies);
    out.dex.titles = plainObject(out.dex.titles);
    out.best = { ...base.best, ...plainObject(out.best) };
    out.best.floor = Math.max(0, finiteNumber(out.best.floor, 0));
    out.best.damage = Math.max(0, finiteNumber(out.best.damage, 0));
    out.best.kills = Math.max(0, finiteNumber(out.best.kills, 0));
    out.best.dps = Math.max(0, finiteNumber(out.best.dps, 0));
    return out;
  }

  function backupRaw(prefix, raw){
    if (!raw) return { ok: false, error: null };
    return safeSetItem(prefix + now(), raw);
  }

  function backupCurrent(reason = 'manual'){
    const raw = safeGetItem(KEY);
    return backupRaw(BACKUP_PREFIX + reason + '.', raw);
  }

  function migrateLegacy(){
    for (const key of LEGACY_KEYS) {
      const raw = safeGetItem(key);
      if (!raw) continue;
      try {
        const migrated = normalize(JSON.parse(raw), { existingRecord: true });
        save(migrated);
        return migrated;
      } catch (error) {
        warn('legacy save migration failed: ' + key, error);
        backupRaw(CORRUPT_PREFIX + 'legacy.' + key + '.', raw);
      }
    }
    return null;
  }

  function load(){
    const raw = safeGetItem(KEY);
    if (raw != null) {
      try {
        return normalize(JSON.parse(raw), { existingRecord: true });
      } catch (error) {
        warn('save load failed; using fresh save', error);
        backupRaw(CORRUPT_PREFIX, raw);
        const recovered = fresh();
        // The presence of a current-key record is the only durable entry-mode
        // signal we need. Quarantining corrupt JSON must not turn an existing
        // player into a forced first-run Story entry.
        recovered.story = freshStory('existing');
        return recovered;
      }
    }

    const migrated = migrateLegacy();
    if (migrated) return migrated;
    return fresh();
  }

  function save(data){
    const normalized = normalize(data, { existingRecord: true });
    lastSaveResult = safeSetItem(KEY, JSON.stringify(normalized));
    return { ...lastSaveResult, data: normalized };
  }

  function reset(){
    const data = fresh();
    save(data);
    return data;
  }

  function clear(){
    return safeRemoveItem(KEY);
  }

  function applyTimeRecovery(data = load()){
    data = normalize(data);
    const interval = 1000 * 60 * (cfg.belly?.recoveryMinutes || 45);
    const baseTime = data.lastBellyAt || now();
    const elapsed = Math.max(0, now() - baseTime);
    const gained = Math.floor(elapsed / interval);

    if (gained > 0) {
      data.belly = Math.min(data.maxBelly, data.belly + gained);
      data.lastBellyAt = baseTime + gained * interval;
      save(data);
    }
    return data;
  }

  function recordRun(data, run){
    const safeRun = normalizeRun(run);
    data.runs = [safeRun, ...(data.runs || [])].slice(0, MAX_RUN_LOG);
    data.best.floor = Math.max(data.best.floor || 0, finiteNumber(safeRun.floor, finiteNumber(safeRun.wave, 0)));
    data.best.damage = Math.max(data.best.damage || 0, finiteNumber(safeRun.maxDamage, 0));
    data.best.kills = Math.max(data.best.kills || 0, finiteNumber(safeRun.kills, 0));
    data.best.dps = Math.max(data.best.dps || 0, finiteNumber(safeRun.dps, 0));

    for (const s of safeRun.skills || []) {
      if (s && s.id) data.dex.skills[s.id] = (data.dex.skills[s.id] || 0) + 1;
    }
    for (const a of safeRun.artifacts || []) {
      if (a && a.id) data.dex.artifacts[a.id] = (data.dex.artifacts[a.id] || 0) + 1;
    }
    for (const s of safeRun.synergies || []) data.dex.synergies[String(s)] = true;
    for (const t of safeRun.titles || []) data.dex.titles[String(t)] = true;
    return safeRun;
  }

  /**
   * Atomically opens one resumable run. An existing different active run is
   * preserved and rejected so callers cannot silently destroy a checkpoint.
   */
  function startRun(initial = {}){
    const data = load();
    const requested = plainObject(initial);
    const requestedId = normalizeRunId(requested.runId);
    const profileId = requested.profileId === STORY_PROFILE_ID ? STORY_PROFILE_ID : NORMAL_PROFILE_ID;
    const storyRun = profileId === STORY_PROFILE_ID;

    if (data.activeRun) {
      if (requestedId && requestedId === data.activeRun.runId) {
        return { ok: true, reused: true, runId: requestedId, activeRun: data.activeRun, data };
      }
      return { ok: false, reason: 'active-run-exists', runId: data.activeRun.runId, activeRun: data.activeRun };
    }

    if (storyRun && (data.story.currentNodeId !== 'c1_investigation_ready'
      || data.story.completedChapterIds.includes('c1')
      || !transitionLedgerSupports('c1_investigation_ready', data.story.transitionIds))) {
      return { ok:false, reason:'story-not-ready', currentNodeId:data.story.currentNodeId };
    }

    const runId = requestedId || createRunId();
    if (data.settledRunIds.includes(runId) || data.runs.some(entry => entry.runId === runId)) {
      return { ok: false, reason: 'already-settled', alreadySettled: true, runId };
    }

    // Only the explicit Chapter 1 story profile receives the zero-cost rule.
    if (!storyRun && data.belly <= 0) return { ok: false, reason: 'no-belly', runId };
    if (!storyRun) {
      data.belly -= 1;
      data.lastBellyAt = data.lastBellyAt || now();
    }

    const timestamp = now();
    data.activeRun = normalizeActiveRun({ ...requested, runId, profileId, startedAt: timestamp, updatedAt: timestamp });
    if (storyRun) {
      data.story.currentNodeId = 'c1_investigation_active';
      data.story.transitionIds = [...data.story.transitionIds, STORY_TRANSITIONS.c1_investigation_ready.id];
      data.story.boundRun = normalizeBoundRun({ runId, profileId });
    }
    const result = save(data);
    if (!result.ok) return { ok: false, reason: 'save-failed', runId, error: result.error };
    return { ok: true, runId, activeRun: result.data.activeRun, data: result.data };
  }

  function updateStory(patch = {}){
    const data = load();
    const next = plainObject(patch);
    const protectedKey = protectedStoryField(next);
    if (protectedKey) return { ok:false, reason:'protected-story-field', field:protectedKey };
    data.story = { ...data.story, ...next };
    const result = save(data);
    return result.ok ? { ok: true, story: result.data.story, data: result.data } : { ok: false, reason: 'save-failed', error: result.error };
  }

  function transitionStory(nextNodeId, patch = {}){
    const data = load();
    const next = plainObject(patch);
    const protectedKey = protectedStoryField(next);
    if (protectedKey) return { ok:false, reason:'protected-story-field', field:protectedKey };
    if (data.activeRun) return { ok:false, reason:'active-run-exists' };
    const currentNodeId = data.story.currentNodeId;
    const appliedTransition = transitionInto(nextNodeId);
    if (appliedTransition && data.story.transitionIds.includes(appliedTransition.id)) {
      return { ok:true, alreadyApplied:true, transitionId:appliedTransition.id, story:data.story, data };
    }
    const transition = STORY_TRANSITIONS[currentNodeId];
    if (!transition || transition.next !== nextNodeId || transition.owner) {
      return { ok:false, reason:'story-transition-not-allowed', currentNodeId, nextNodeId };
    }
    data.story = {
      ...data.story,
      ...next,
      currentNodeId:nextNodeId,
      transitionIds:[...data.story.transitionIds, transition.id]
    };
    const result = save(data);
    return result.ok
      ? { ok:true, transitionId:transition.id, story:result.data.story, data:result.data }
      : { ok:false, reason:'save-failed', error:result.error };
  }

  function completeStoryChapter(){
    const data = load();
    if (data.activeRun) return { ok: false, reason: 'active-run-exists' };
    const story = data.story;
    if (story.currentNodeId === 'c1_complete' && story.completedChapterIds.includes('c1')) {
      return { ok: true, alreadyCompleted: true, story, data };
    }
    if (story.currentNodeId !== 'c1_record_signal') {
      return { ok: false, reason: 'story-node-mismatch', currentNodeId: story.currentNodeId };
    }
    if (!transitionLedgerSupports('c1_record_signal', story.transitionIds)
      || story.worldFlags.c1InvestigationComplete !== true
      || !story.knowledgeFlags.includes('old-record-responded')) {
      return { ok:false, reason:'story-prerequisite-missing' };
    }
    story.currentNodeId = 'c1_complete';
    story.transitionIds = [...story.transitionIds, STORY_TRANSITIONS.c1_record_signal.id];
    story.completedChapterIds = [...story.completedChapterIds, 'c1'];
    story.replayUnlockIds = [...story.replayUnlockIds, ...STORY_REPLAYS];
    story.knowledgeFlags = [...story.knowledgeFlags, ...STORY_KNOWLEDGE];
    story.worldFlags = { ...story.worldFlags, c1InvitationSeen:true, c1SharedLampRestored:true, c1OldRecordResponded:true, c1InvestigationComplete:true };
    story.keyItems = { ...story.keyItems, purpleScarf: 'story-present-unexplained' };
    const result = save(data);
    return result.ok ? { ok: true, story: result.data.story, data: result.data } : { ok: false, reason: 'save-failed', error: result.error };
  }

  /**
   * Replaces/merges the checkpoint for the matching active run in one save.
   * A stale or foreign runId is rejected without changing persistent data.
   */
  function updateCheckpoint(runId, checkpoint = {}){
    const id = normalizeRunId(runId);
    const data = load();
    if (!data.activeRun) return { ok: false, reason: 'no-active-run', runId: id };
    if (!id || data.activeRun.runId !== id) {
      return { ok: false, reason: 'run-id-mismatch', runId: id, activeRunId: data.activeRun.runId };
    }

    data.activeRun = normalizeActiveRun({
      ...data.activeRun,
      ...plainObject(checkpoint),
      runId: id,
      startedAt: data.activeRun.startedAt,
      updatedAt: now()
    });
    const result = save(data);
    if (!result.ok) return { ok: false, reason: 'save-failed', runId: id, error: result.error };
    return { ok: true, runId: id, activeRun: result.data.activeRun, data: result.data };
  }

  /**
   * Finalizes MC, run log, best records and dex in one localStorage write.
   * settledRunIds is the idempotency ledger: the same runId never pays twice.
   */
  function settleRun(run, options = {}){
    if (!run || typeof run !== 'object' || Array.isArray(run)) {
      return { ok: false, reason: 'invalid-run' };
    }

    const data = load();
    const activeId = data.activeRun?.runId || '';
    const runId = normalizeRunId(run.runId) || activeId || createRunId();
    try { run.runId = runId; } catch (error) { warn('could not attach runId to result object', error); }

    const previous = data.runs.find(entry => entry.runId === runId);
    const activeProfileId = data.activeRun?.runId === runId ? data.activeRun.profileId : '';
    const profileId = (previous?.profileId || activeProfileId || run.profileId) === STORY_PROFILE_ID ? STORY_PROFILE_ID : NORMAL_PROFILE_ID;
    const storyRun = profileId === STORY_PROFILE_ID;
    if (data.settledRunIds.includes(runId) || previous) {
      if (storyRun) return { ok: true, alreadySettled: true, runId, amount: Math.max(0, finiteNumber(previous?.coins, 0)), data };
      return { ok: false, reason: 'already-settled', alreadySettled: true, runId, data };
    }
    if (activeId && activeId !== runId) {
      return { ok: false, reason: 'run-id-mismatch', runId, activeRunId: activeId };
    }
    if (storyRun) {
      if (!activeId || data.activeRun?.profileId !== STORY_PROFILE_ID || data.story.boundRun?.runId !== runId) {
        return { ok: false, reason: 'story-run-mismatch', runId };
      }
      if (data.story.currentNodeId !== 'c1_investigation_active'
        || !transitionLedgerSupports('c1_investigation_active', data.story.transitionIds)) {
        return { ok:false, reason:'story-transition-mismatch', runId, currentNodeId:data.story.currentNodeId };
      }
      if (!run.cleared || run.giveup) return { ok: false, reason: 'story-objective-incomplete', runId };
    }

    const coinAmount = storyRun ? 0 : Math.max(0, Math.floor(finiteNumber(options.coins, finiteNumber(run.coins, 0))));
    data.meta = { ...plainObject(data.meta) };
    data.meta.coins = Math.max(0, Math.floor(finiteNumber(data.meta.coins, 0) + coinAmount));

    const settledAt = now();
    const safeRun = recordRun(data, {
      ...run,
      runId,
      profileId,
      runKind: storyRun ? 'story' : 'normal',
      coins: coinAmount,
      startedAt: finiteNumber(run.startedAt, data.activeRun?.startedAt || run.date || settledAt),
      settledAt
    });
    data.settledRunIds = [runId, ...data.settledRunIds].slice(0, MAX_SETTLED_RUN_IDS);
    if (activeId === runId) data.activeRun = null;
    if (storyRun) {
      data.story.boundRun = null;
      data.story.currentNodeId = 'c1_return_pending';
      data.story.transitionIds = [...data.story.transitionIds, STORY_TRANSITIONS.c1_investigation_active.id];
      data.story.worldFlags = { ...data.story.worldFlags, c1InvestigationComplete: true };
    }

    const result = save(data);
    if (!result.ok) {
      return { ok: false, reason: 'save-failed', runId, amount: coinAmount, error: result.error };
    }
    return {
      ok: true,
      runId,
      amount: coinAmount,
      coins: result.data.meta.coins,
      run: safeRun,
      data: result.data
    };
  }

  function addRun(data, run){
    data = normalize(data);
    const safeRun = normalizeRun(run);
    // Legacy v2 runs had no runId. A v3 run must use settleRun so rewards and
    // records cannot be split across separate writes.
    if (safeRun.runId) {
      const alreadySettled = data.settledRunIds.includes(safeRun.runId) || data.runs.some(entry => entry.runId === safeRun.runId);
      return { ok: false, reason: alreadySettled ? 'already-settled' : 'requires-settlement', alreadySettled, runId: safeRun.runId };
    }
    recordRun(data, safeRun);
    return save(data);
  }

  function status(){
    return { ...lastSaveResult };
  }

  return {
    SAVE_VERSION,
    load,
    save,
    reset,
    clear,
    applyTimeRecovery,
    startRun,
    updateCheckpoint,
    settleRun,
    updateStory,
    transitionStory,
    completeStoryChapter,
    addRun,
    normalize,
    fresh,
    backupCurrent,
    status,
    STORY_PROFILE_ID,
    NORMAL_PROFILE_ID
  };
})();
