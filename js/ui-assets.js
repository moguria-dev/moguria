window.MoguriaUIAssets = (() => {
  'use strict';

  const BASE = 'assets/images/ui-refresh';
  const define = (category, ids) => Object.freeze(Object.fromEntries(ids.map(id => [id, Object.freeze({
    id,
    assetId: `ui_refresh_${category}_${id}`,
    src: `${BASE}/${category}/${id}.webp`
  })])));

  const artifacts = define('artifacts', [
    'violet_engine', 'pop_crown', 'runner_cloak', 'shell_heart', 'little_parade',
    'star_orbit', 'field_core', 'split_lens', 'pierce_needle', 'fan_shell',
    'hungry_moon', 'magnet_bell', 'reroll_spoon', 'late_bloomer', 'boss_cookie',
    'calm_blanket', 'double_bite', 'glass_cannon', 'safe_pouch', 'mystery_pot',
    'thunder_totem', 'moon_ring', 'trap_lunchbox', 'cold_mirror', 'life_jam',
    'study_notebook'
  ]);

  const equipment = define('equipment', [
    'hat_leaf', 'hat_spore', 'hat_star',
    'body_cotton', 'body_shell', 'body_moon',
    'hand_seed', 'hand_spark', 'hand_comet',
    'foot_clover', 'foot_breeze', 'foot_shadow',
    'charm_cookie', 'charm_bomb', 'charm_mogu'
  ]);

  const outings = define('outings', [
    'daily_mutation', 'abyss_trial', 'snack_walk'
  ]);

  const slots = define('slots', ['hat', 'body', 'hand', 'foot', 'charm']);
  const headers = Object.freeze({
    artifactCore: Object.freeze({
      id: 'artifact_core',
      assetId: 'ui_refresh_artifacts_artifact_core',
      src: `${BASE}/artifacts/artifact-core.webp`
    })
  });
  const groups = Object.freeze({ artifacts, equipment, outings, slots, headers });
  const all = Object.freeze([
    headers.artifactCore,
    ...Object.values(artifacts),
    ...Object.values(equipment),
    ...Object.values(outings),
    ...Object.values(slots)
  ]);

  function get(group, id){
    if(group === 'headers' && id === 'artifact_core') return headers.artifactCore;
    return groups[group]?.[id] || null;
  }

  function path(group, id){
    return get(group, id)?.src || '';
  }

  return Object.freeze({
    version: '3.3.0-ui-consistency',
    cacheToken: '20260814-ui-consistency-1',
    groups,
    artifacts,
    equipment,
    outings,
    slots,
    headers,
    all,
    get,
    path
  });
})();
