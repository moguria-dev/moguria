window.MoguriaSave = (() => {
  const cfg = window.MoguriaConfig || {};
  const KEY = cfg.storage?.key || 'moguria.save.v2';
  const LEGACY_KEYS = cfg.storage?.legacyKeys || ['moguria.prototype.save.v1'];
  // Keep the existing storage key so v2 users migrate in place. The payload
  // itself is always normalized to v3, even while an older config is cached.
  const SAVE_VERSION = 3;
  const MAX_RUN_LOG = cfg.security?.maxRunLog || 20;
  const MAX_SETTLED_RUN_IDS = Math.max(40, MAX_RUN_LOG * 4);
  const BACKUP_PREFIX = cfg.storage?.backupPrefix || 'moguria.backup.';
  const CORRUPT_PREFIX = cfg.storage?.corruptPrefix || 'moguria.corrupt.';
  let lastSaveResult = { ok: true, error: null };

  const now = () => Date.now();

  const fresh = () => ({
    saveVersion: SAVE_VERSION,
    belly: cfg.belly?.max || 3,
    maxBelly: cfg.belly?.max || 3,
    lastBellyAt: now(),
    snackAt: 0,
    runs: [],
    activeRun: null,
    settledRunIds: [],
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
    return { ...active, runId, startedAt, updatedAt };
  }

  function normalize(data){
    const base = fresh();
    const out = { ...base, ...plainObject(data) };
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
        const migrated = normalize(JSON.parse(raw));
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
    if (raw) {
      try {
        return normalize(JSON.parse(raw));
      } catch (error) {
        warn('save load failed; using fresh save', error);
        backupRaw(CORRUPT_PREFIX, raw);
        return fresh();
      }
    }

    const migrated = migrateLegacy();
    if (migrated) return migrated;
    return fresh();
  }

  function save(data){
    const normalized = normalize(data);
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
    const requestedId = normalizeRunId(plainObject(initial).runId);

    if (data.activeRun) {
      if (requestedId && requestedId === data.activeRun.runId) {
        return { ok: true, reused: true, runId: requestedId, activeRun: data.activeRun, data };
      }
      return { ok: false, reason: 'active-run-exists', runId: data.activeRun.runId, activeRun: data.activeRun };
    }

    const runId = requestedId || createRunId();
    if (data.settledRunIds.includes(runId) || data.runs.some(entry => entry.runId === runId)) {
      return { ok: false, reason: 'already-settled', alreadySettled: true, runId };
    }

    // Starting a new run and consuming one belly are a single transaction.
    // A resumed run returns above, so it never consumes belly twice.
    if (data.belly <= 0) return { ok: false, reason: 'no-belly', runId };
    data.belly -= 1;
    data.lastBellyAt = data.lastBellyAt || now();

    const timestamp = now();
    data.activeRun = normalizeActiveRun({ ...plainObject(initial), runId, startedAt: timestamp, updatedAt: timestamp });
    const result = save(data);
    if (!result.ok) return { ok: false, reason: 'save-failed', runId, error: result.error };
    return { ok: true, runId, activeRun: result.data.activeRun, data: result.data };
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

    if (data.settledRunIds.includes(runId) || data.runs.some(entry => entry.runId === runId)) {
      return { ok: false, reason: 'already-settled', alreadySettled: true, runId, data };
    }
    if (activeId && activeId !== runId) {
      return { ok: false, reason: 'run-id-mismatch', runId, activeRunId: activeId };
    }

    const coinAmount = Math.max(0, Math.floor(finiteNumber(options.coins, finiteNumber(run.coins, 0))));
    data.meta = { ...plainObject(data.meta) };
    data.meta.coins = Math.max(0, Math.floor(finiteNumber(data.meta.coins, 0) + coinAmount));

    const settledAt = now();
    const safeRun = recordRun(data, {
      ...run,
      runId,
      coins: coinAmount,
      startedAt: finiteNumber(run.startedAt, data.activeRun?.startedAt || run.date || settledAt),
      settledAt
    });
    data.settledRunIds = [runId, ...data.settledRunIds].slice(0, MAX_SETTLED_RUN_IDS);
    if (activeId === runId) data.activeRun = null;

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
    addRun,
    normalize,
    fresh,
    backupCurrent,
    status
  };
})();
