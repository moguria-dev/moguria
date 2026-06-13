window.MoguriaSave = (() => {
  const cfg = window.MoguriaConfig || {};
  const KEY = cfg.storage?.key || 'moguria.save.v2';
  const LEGACY_KEYS = cfg.storage?.legacyKeys || ['moguria.prototype.save.v1'];
  const SAVE_VERSION = cfg.saveVersion || 2;
  const MAX_RUN_LOG = cfg.security?.maxRunLog || 20;
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

  function normalizeRun(run){
    const r = plainObject(run);
    return {
      ...r,
      titles: Array.isArray(r.titles) ? r.titles : [],
      skills: Array.isArray(r.skills) ? r.skills : [],
      artifacts: Array.isArray(r.artifacts) ? r.artifacts : [],
      synergies: Array.isArray(r.synergies) ? r.synergies : [],
      visual: plainObject(r.visual)
    };
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

  function addRun(data, run){
    data = normalize(data);
    const safeRun = normalizeRun(run);
    data.runs = [safeRun, ...(data.runs || [])].slice(0, MAX_RUN_LOG);
    data.best.floor = Math.max(data.best.floor || 0, safeRun.floor || safeRun.wave || 0);
    data.best.damage = Math.max(data.best.damage || 0, safeRun.maxDamage || 0);
    data.best.kills = Math.max(data.best.kills || 0, safeRun.kills || 0);
    data.best.dps = Math.max(data.best.dps || 0, safeRun.dps || 0);

    for (const s of safeRun.skills || []) {
      if (s && s.id) data.dex.skills[s.id] = (data.dex.skills[s.id] || 0) + 1;
    }
    for (const a of safeRun.artifacts || []) {
      if (a && a.id) data.dex.artifacts[a.id] = (data.dex.artifacts[a.id] || 0) + 1;
    }
    for (const s of safeRun.synergies || []) data.dex.synergies[String(s)] = true;
    for (const t of safeRun.titles || []) data.dex.titles[String(t)] = true;
    return save(data);
  }

  function status(){
    return { ...lastSaveResult };
  }

  return { load, save, reset, clear, applyTimeRecovery, addRun, normalize, fresh, backupCurrent, status };
})();
