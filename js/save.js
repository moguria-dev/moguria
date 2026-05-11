window.MoguriaSave = (() => {
  const cfg = window.MoguriaConfig || {};
  const KEY = cfg.storage?.key || 'moguria.save.v2';
  const LEGACY_KEYS = cfg.storage?.legacyKeys || ['moguria.prototype.save.v1'];
  const SAVE_VERSION = cfg.saveVersion || 2;
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
  function normalize(data){
    const base = fresh();
    const out = { ...base, ...(data || {}) };
    out.saveVersion = SAVE_VERSION;
    out.maxBelly = out.maxBelly || base.maxBelly;
    out.belly = Math.max(0, Math.min(out.maxBelly, Number.isFinite(out.belly) ? out.belly : base.belly));
    out.runs = Array.isArray(out.runs) ? out.runs.slice(0, 20) : [];
    out.dex = { ...base.dex, ...(out.dex || {}) };
    out.dex.skills = out.dex.skills || {};
    out.dex.artifacts = out.dex.artifacts || {};
    out.dex.synergies = out.dex.synergies || {};
    out.dex.titles = out.dex.titles || {};
    out.best = { ...base.best, ...(out.best || {}) };
    out.lastBellyAt = out.lastBellyAt || now();
    return out;
  }
  function migrateLegacy(){
    for(const key of LEGACY_KEYS){
      const raw = localStorage.getItem(key);
      if(!raw) continue;
      try {
        const migrated = normalize(JSON.parse(raw));
        save(migrated);
        return migrated;
      } catch(e){ console.warn('[Moguria] legacy save migration failed', key, e); }
    }
    return null;
  }
  function load(){
    try {
      const raw = localStorage.getItem(KEY);
      if(raw) return normalize(JSON.parse(raw));
      const migrated = migrateLegacy();
      if(migrated) return migrated;
      return fresh();
    } catch(e){
      console.warn('[Moguria] save load failed; using fresh save', e);
      return fresh();
    }
  }
  function save(data){ localStorage.setItem(KEY, JSON.stringify(normalize(data))); }
  function reset(){ const data=fresh(); save(data); return data; }
  function applyTimeRecovery(data){
    const interval = 1000 * 60 * (cfg.belly?.recoveryMinutes || 45);
    const elapsed = now() - (data.lastBellyAt || now());
    const gained = Math.floor(elapsed / interval);
    if (gained > 0) {
      data.belly = Math.min(data.maxBelly, data.belly + gained);
      data.lastBellyAt = (data.lastBellyAt || now()) + gained * interval;
      save(data);
    }
    return data;
  }
  function addRun(data, run){
    data = normalize(data);
    data.runs = [run, ...(data.runs || [])].slice(0, 20);
    data.best.floor = Math.max(data.best.floor || 0, run.floor || 0);
    data.best.damage = Math.max(data.best.damage || 0, run.maxDamage || 0);
    data.best.kills = Math.max(data.best.kills || 0, run.kills || 0);
    data.best.dps = Math.max(data.best.dps || 0, run.dps || 0);
    for (const s of run.skills || []) data.dex.skills[s.id] = (data.dex.skills[s.id] || 0) + 1;
    data.dex.artifacts = data.dex.artifacts || {};
    for (const a of run.artifacts || []) data.dex.artifacts[a.id] = (data.dex.artifacts[a.id] || 0) + 1;
    for (const s of run.synergies || []) data.dex.synergies[s] = true;
    for (const t of run.titles || []) data.dex.titles[t] = true;
    save(data);
  }
  return { load, save, reset, applyTimeRecovery, addRun, normalize };
})();
