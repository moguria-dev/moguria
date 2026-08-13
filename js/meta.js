window.MoguriaMeta = (() => {
  const SLOT_LABELS = { hat: 'ぼうし', body: 'ふく', hand: 'て', foot: 'あし', charm: 'おまもり' };
  const RARITY_LABELS = { common: 'C', rare: 'R', epic: 'E' };
  const RARITY_WEIGHT = { common: 78, rare: 19, epic: 3 };
  const GACHA_COST = 30;

  const EQUIPMENT = [
    { id: 'hat_leaf', name: '木の葉ぼうし', slot: 'hat', rarity: 'common', icon: '🍃', stat: { hp: 3 }, desc: 'HPがほんの少し増える' },
    { id: 'hat_spore', name: 'きのこベレー', slot: 'hat', rarity: 'rare', icon: '🍄', stat: { poison: 1 }, desc: '毒系の力と少し相性が良い' },
    { id: 'hat_star', name: '星くずフード', slot: 'hat', rarity: 'epic', icon: '🌟', stat: { crit: 1 }, desc: '会心の気配が少し増える' },
    { id: 'body_cotton', name: 'ふわふわ服', slot: 'body', rarity: 'common', icon: '🧶', stat: { hp: 5 }, desc: 'HPが少し増える' },
    { id: 'body_shell', name: 'まもり貝の服', slot: 'body', rarity: 'rare', icon: '🐚', stat: { guard: 1 }, desc: '防御系の力と少し相性が良い' },
    { id: 'body_moon', name: '月あかりケープ', slot: 'body', rarity: 'epic', icon: '🌙', stat: { aura: 1 }, desc: '領域系の力と相性が良い' },
    { id: 'hand_seed', name: 'どんぐりグローブ', slot: 'hand', rarity: 'common', icon: '🌰', stat: { atk: 1 }, desc: '攻撃が少し強くなる' },
    { id: 'hand_spark', name: 'びりびり手袋', slot: 'hand', rarity: 'rare', icon: '⚡', stat: { lightning: 1 }, desc: '雷連鎖と相性が良い' },
    { id: 'hand_comet', name: 'ほしふる手袋', slot: 'hand', rarity: 'epic', icon: '☄️', stat: { auto: 1 }, desc: '自動攻撃と相性が良い' },
    { id: 'foot_clover', name: 'クローバー靴', slot: 'foot', rarity: 'common', icon: '☘️', stat: { speed: 1 }, desc: '移動がほんの少し軽くなる' },
    { id: 'foot_breeze', name: 'そよ風ブーツ', slot: 'foot', rarity: 'rare', icon: '🍃', stat: { dodge: 1 }, desc: '回避系の力と相性が良い' },
    { id: 'foot_shadow', name: 'かげふみ靴', slot: 'foot', rarity: 'epic', icon: '🌑', stat: { speed: 2 }, desc: '逃げながら戦うビルド向き' },
    { id: 'charm_cookie', name: 'おやつチャーム', slot: 'charm', rarity: 'common', icon: '🍪', stat: { belly: 1 }, desc: 'おなか周りの育成用' },
    { id: 'charm_bomb', name: 'ぽふぽふおまもり', slot: 'charm', rarity: 'rare', icon: '💣', stat: { boom: 1 }, desc: '爆発系の力と相性が良い' },
    { id: 'charm_mogu', name: 'こもぐのおまもり', slot: 'charm', rarity: 'epic', icon: '🐾', stat: { summon: 1 }, desc: '召喚系の力と相性が良い' }
  ];

  const CHALLENGES = [
    { id: 'daily_mutation', name: '今日の変異ダンジョン', icon: '🌀', type: 'daily', reward: 80, desc: '日替わりルールで腕試しする入口です。' },
    { id: 'abyss_trial', name: '深淵チャレンジ', icon: '🕳️', type: 'once', reward: 300, desc: '高難易度の一度きり報酬に挑戦します。' },
    { id: 'snack_walk', name: 'おやつ遠征', icon: '🍪', type: 'idle', reward: 40, desc: 'Moguを休ませながら小さな報酬を得ます。' }
  ];

  function metaFresh(){
    return {
      coins: 0,
      inventory: [],
      equipped: { hat: null, body: null, hand: null, foot: null, charm: null },
      upgrades: {},
      claimedChallenges: {},
      daily: { key: '', claimed: false }
    };
  }

  function normalize(data){
    data = data && typeof data === 'object' ? data : window.MoguriaSave.fresh();
    const fresh = metaFresh();
    data.meta = { ...fresh, ...(data.meta || {}) };
    data.meta.equipped = { ...fresh.equipped, ...(data.meta.equipped || {}) };
    data.meta.inventory = Array.isArray(data.meta.inventory) ? data.meta.inventory : [];
    data.meta.upgrades = data.meta.upgrades && typeof data.meta.upgrades === 'object' ? data.meta.upgrades : {};
    data.meta.claimedChallenges = data.meta.claimedChallenges && typeof data.meta.claimedChallenges === 'object' ? data.meta.claimedChallenges : {};
    data.meta.daily = data.meta.daily && typeof data.meta.daily === 'object' ? data.meta.daily : { key: '', claimed: false };
    return data;
  }

  function load(){
    return normalize(window.MoguriaSave.load());
  }

  function save(data){
    data = normalize(data);
    const result = window.MoguriaSave.save(data);
    return result && typeof result === 'object' && 'ok' in result
      ? result
      : { ok: true, data };
  }

  function todayKey(){
    return new Date().toISOString().slice(0, 10);
  }

  function addCoins(amount, reason = ''){
    const s = load();
    s.meta.coins = Math.max(0, Math.floor((s.meta.coins || 0) + Number(amount || 0)));
    save(s);
    return { coins: s.meta.coins, amount, reason };
  }

  function runReward(run){
    return Math.max(8, Math.floor(10 + (run.wave || run.floor || 1) * 4 + (run.kills || 0) / 6 + (run.cleared ? 70 : 0) + (run.titles || []).length * 6));
  }

  // Existing entry point used by the current battle. Unlike the v2 version,
  // the returned object reports persistence success and all records commit together.
  function awardFromRun(run){
    const amount = runReward(run);
    const result = window.MoguriaSave.settleRun(run, { coins: amount });
    if (result.ok) run.coins = amount;
    return { ...result, amount };
  }

  function pickRarity(){
    const total = Object.values(RARITY_WEIGHT).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [k, w] of Object.entries(RARITY_WEIGHT)) {
      r -= w;
      if (r <= 0) return k;
    }
    return 'common';
  }

  function pull(){
    const s = load();
    if ((s.meta.coins || 0) < GACHA_COST) return { ok: false, message: 'MoguCoinが足りません。冒険やおでかけで少しずつ集めよう。' };
    const rarity = pickRarity();
    const pool = EQUIPMENT.filter(e => e.rarity === rarity);
    const base = pool[Math.floor(Math.random() * pool.length)] || EQUIPMENT[0];
    const item = { ...base, uid: 'eq_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7), level: 1, obtainedAt: Date.now() };
    s.meta.coins -= GACHA_COST;
    s.meta.inventory.unshift(item);
    save(s);
    return { ok: true, item, coins: s.meta.coins };
  }

  function equip(uid){
    const s = load();
    const item = s.meta.inventory.find(x => x.uid === uid);
    if (!item) return null;
    s.meta.equipped[item.slot] = uid;
    save(s);
    return item;
  }

  function upgradePreview(uid){
    const s = load();
    const item = s.meta.inventory.find(x => x.uid === uid);
    if (!item) return { ok: false, message: '装備が見つかりません' };
    const material = s.meta.inventory.find(x => x.uid !== uid && x.slot === item.slot);
    if (!material) return { ok: false, message: '同じ部位の装備が素材に必要です' };
    const materialEquipped = Object.values(s.meta.equipped).includes(material.uid);
    return { ok: true, item, material, materialEquipped };
  }

  function upgrade(uid, materialUid = '', expected = null){
    const s = load();
    const item = s.meta.inventory.find(x => x.uid === uid);
    if (!item) return { ok: false, message: '装備が見つかりません' };
    const mat = materialUid
      ? s.meta.inventory.find(x => x.uid === materialUid && x.uid !== uid && x.slot === item.slot)
      : s.meta.inventory.find(x => x.uid !== uid && x.slot === item.slot);
    if (!mat) return { ok: false, message: materialUid ? '確認した強化素材が見つかりません。もう一度選び直してください。' : '同じ部位の装備が素材に必要です' };
    if (expected && typeof expected === 'object') {
      const targetLevel = Math.max(1, Number(item.level) || 1);
      const materialLevel = Math.max(1, Number(mat.level) || 1);
      const materialEquipped = Object.values(s.meta.equipped).includes(mat.uid);
      if (targetLevel !== Number(expected.targetLevel)
        || materialLevel !== Number(expected.materialLevel)
        || materialEquipped !== Boolean(expected.materialEquipped)) {
        return { ok: false, message: '確認後に装備の状態が変わりました。内容を確認して、もう一度強化してください。' };
      }
    }
    item.level = (item.level || 1) + 1;
    s.meta.inventory = s.meta.inventory.filter(x => x.uid !== mat.uid);
    Object.keys(s.meta.equipped).forEach(slot => {
      if (s.meta.equipped[slot] === mat.uid) s.meta.equipped[slot] = null;
    });
    const saved = save(s);
    if (!saved.ok) return { ok: false, message: '装備の強化を保存できませんでした。空き容量を確認して、もう一度ためしてください。', reason: 'save-failed' };
    return { ok: true, item, used: mat };
  }

  function claimChallenge(id){
    const s = load();
    const c = CHALLENGES.find(x => x.id === id);
    if (!c) return { ok: false, message: 'チャレンジが見つかりません' };
    const key = c.type === 'daily' ? todayKey() : id;
    const claimKey = c.id + ':' + key;
    if (s.meta.claimedChallenges[claimKey]) return { ok: false, message: 'この報酬は受け取り済みです' };
    s.meta.claimedChallenges[claimKey] = Date.now();
    s.meta.coins = (s.meta.coins || 0) + c.reward;
    save(s);
    return { ok: true, challenge: c, amount: c.reward, coins: s.meta.coins };
  }

  function equipmentSummary(){
    const s = load();
    return Object.entries(SLOT_LABELS).map(([slot, label]) => {
      const uid = s.meta.equipped[slot];
      const item = s.meta.inventory.find(x => x.uid === uid);
      return { slot, label, item };
    });
  }

  function applyEquipmentToPlayer(p){
    const equipped = equipmentSummary().map(x => x.item).filter(Boolean);
    for (const item of equipped) {
      const rawLevel = Number(item.level);
      const lv = Number.isFinite(rawLevel) ? Math.max(1, Math.floor(rawLevel)) : 1;
      const stat = item.stat && typeof item.stat === 'object' ? item.stat : {};
      const points = key => {
        const value = Number(stat[key]);
        return (Number.isFinite(value) ? Math.max(0, value) : 0) * lv;
      };
      const add = (key, amount) => { p[key] = (Number(p[key]) || 0) + amount; };

      // Every equipment stat scales with item level and targets properties the
      // current battle already consumes; no parallel, display-only stats.
      const hp = points('hp');
      if (hp) { add('maxHp', hp); add('hp', hp); }

      const attack = points('atk');
      if (attack) add('baseDamage', attack);

      const speed = points('speed');
      if (speed) add('speed', speed * 3);

      const dodge = Math.min(.18, points('dodge') * .015);
      if (dodge) add('dodge', dodge);

      const armor = points('armor') + points('guard');
      if (armor) add('armor', armor);

      const crit = Math.min(.2, points('crit') * .015);
      if (crit) add('crit', crit);

      const poison = points('poison');
      if (poison) { add('poisonChance', poison * .012); add('poisonPower', poison * .5); }

      const boom = points('boom');
      if (boom) {
        add('explosionPower', boom * 2);
        add('explosionRadius', boom * 3);
        add('killExplodeChance', Math.min(.12, boom * .01));
      }

      const summon = points('summon');
      if (summon) {
        add('summons', summon);
        p.summonRate = Math.max(.45, (Number(p.summonRate) || 1.1) * Math.pow(.98, summon));
      }

      const lightning = points('lightning');
      if (lightning) {
        add('lightningJumps', Math.ceil(lightning / 2));
        p.lightningRate = Math.max(2.2, (Number(p.lightningRate) || 3.8) - lightning * .08);
      }

      const auto = points('auto');
      if (auto) p.attackRate = Math.max(.2, (Number(p.attackRate) || .65) * Math.pow(.97, auto));

      const aura = points('aura');
      if (aura) { add('auraDamage', aura * .5); add('auraRadius', aura * 4); }

      const belly = points('belly');
      if (belly) {
        add('maxHp', belly * 2);
        add('hp', belly * 2);
        add('regen', Math.min(.5, belly * .04));
      }

      p.equipmentVisual = p.equipmentVisual || {};
      p.equipmentVisual[item.slot] = item.icon;
    }
  }

  return { EQUIPMENT, CHALLENGES, SLOT_LABELS, RARITY_LABELS, GACHA_COST, normalize, load, save, addCoins, runReward, awardFromRun, pull, equip, upgradePreview, upgrade, claimChallenge, equipmentSummary, applyEquipmentToPlayer };
})();
