window.MoguriaDebug = (() => {
  let enabled = false;
  let panel = null;
  function init(){
    enabled = !!(window.MoguriaConfig && window.MoguriaConfig.debug) || location.hash.includes('debug');
    if(!enabled) return;
    panel = document.createElement('div');
    panel.id = 'debugPanel';
    panel.className = 'debug-panel';
    panel.textContent = 'debug ready';
    document.body.appendChild(panel);
  }
  function update(state){
    if(!enabled || !panel || !state) return;
    const p = state.p || {};
    panel.innerHTML = [
      `<b>Moguria ${window.MoguriaConfig?.version || ''}</b>`,
      `mode: ${state.mode}`,
      `wave: ${state.wave}/${state.maxWave}`,
      `enemies: ${state.enemies?.length || 0}`,
      `bullets: ${state.bullets?.length || 0}`,
      `drops: ${state.drops?.length || 0}`,
      `lv: ${p.lv} exp: ${Math.floor(p.exp || 0)}/${p.nextExp}`,
      `skills: ${(p.skills || []).length}`,
      `artifacts: ${(p.artifacts || []).length}`,
      `fps: ${window.MoguriaPerformance?.stats?.().fps || '-'} q:${window.MoguriaPerformance?.stats?.().quality || '-'}`,
      `assets: ${window.MoguriaAssets?.stats?.().approxMB ?? 0}MB img:${window.MoguriaAssets?.stats?.().images ?? 0} aud:${window.MoguriaAssets?.stats?.().audio ?? 0}`
    ].join('<br>');
  }
  function log(...args){ if(enabled) console.log('[Moguria]', ...args); }
  function warn(...args){ console.warn('[Moguria]', ...args); }
  return { init, update, log, warn, get enabled(){ return enabled; } };
})();
