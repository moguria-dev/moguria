window.MoguriaMeta = (() => {
  const SLOT_LABELS = { hat:'ぼうし', body:'ふく', hand:'て', foot:'あし', charm:'おまもり' };
  const RARITY_LABELS = { common:'C', rare:'R', epic:'E' };
  const RARITY_WEIGHT = { common: 78, rare: 19, epic: 3 };
  const GACHA_COST = 30;
  const EQUIPMENT = [
    {id:'hat_leaf', name:'木の葉ぼうし', slot:'hat', rarity:'common', icon:'🍃', stat:{hp:3}, desc:'HPがほんの少し増える'},
    {id:'hat_spore', name:'きのこベレー', slot:'hat', rarity:'rare', icon:'🍄', stat:{poison:1}, desc:'毒系を少し引きやすくする予定'},
    {id:'hat_star', name:'星くずフード', slot:'hat', rarity:'epic', icon:'🌟', stat:{crit:1}, desc:'会心の気配が少し増える'},
    {id:'body_cotton', name:'ふわふわ服', slot:'body', rarity:'common', icon:'🧶', stat:{hp:5}, desc:'HPが少し増える'},
    {id:'body_shell', name:'まもり貝の服', slot:'body', rarity:'rare', icon:'🐚', stat:{guard:1}, desc:'防御系の相性が少し良い'},
    {id:'body_moon', name:'月あかりケープ', slot:'body', rarity:'epic', icon:'🌙', stat:{aura:1}, desc:'領域系と相性が良い'},
    {id:'hand_seed', name:'どんぐりグローブ', slot:'hand', rarity:'common', icon:'🌰', stat:{atk:1}, desc:'攻撃が少し強くなる'},
    {id:'hand_spark', name:'びりびり手袋', slot:'hand', rarity:'rare', icon:'⚡', stat:{lightning:1}, desc:'雷連鎖と相性が良い'},
    {id:'hand_comet', name:'ほしふる手袋', slot:'hand', rarity:'epic', icon:'☄️', stat:{auto:1}, desc:'自動攻撃と相性が良い'},
    {id:'foot_clover', name:'クローバー靴', slot:'foot', rarity:'common', icon:'☘️', stat:{speed:1}, desc:'移動がほんの少し軽くなる'},
    {id:'foot_breeze', name:'そよ風ブーツ', slot:'foot', rarity:'rare', icon:'🌬️', stat:{dodge:1}, desc:'回避系と相性が良い'},
    {id:'foot_shadow', name:'かげふみ靴', slot:'foot', rarity:'epic', icon:'👣', stat:{speed:2}, desc:'逃げながら戦うビルド向き'},
    {id:'charm_cookie', name:'おやつチャーム', slot:'charm', rarity:'common', icon:'🍪', stat:{belly:1}, desc:'おなか周りの育成用'},
    {id:'charm_bomb', name:'ぽふぽふおまもり', slot:'charm', rarity:'rare', icon:'💥', stat:{boom:1}, desc:'爆発系と相性が良い'},
    {id:'charm_mogu', name:'こもぐのおまもり', slot:'charm', rarity:'epic', icon:'🐾', stat:{summon:1}, desc:'召喚系と相性が良い'}
  ];
  const CHALLENGES = [
    {id:'daily_mutation', name:'今日の変異ダンジョン', icon:'🌀', type:'daily', reward:80, desc:'日替わりルールで遊ぶ予定の枠。今は報酬設計のみ入っています。'},
    {id:'abyss_trial', name:'深淵チャレンジ', icon:'🌑', type:'once', reward:300, desc:'高難易度・一度きり報酬の特殊ステージ予定枠です。'},
    {id:'snack_walk', name:'おやつ遠征', icon:'🍱', type:'idle', reward:40, desc:'Moguを休ませながら小さな報酬を得るサブ枠です。'}
  ];
  function metaFresh(){ return { coins: 0, inventory: [], equipped: {hat:null,body:null,hand:null,foot:null,charm:null}, upgrades: {}, claimedChallenges: {}, daily: { key:'', claimed:false } }; }
  function normalize(data){
    data.meta = { ...metaFresh(), ...(data.meta||{}) };
    data.meta.equipped = { ...metaFresh().equipped, ...(data.meta.equipped||{}) };
    data.meta.inventory = Array.isArray(data.meta.inventory) ? data.meta.inventory : [];
    data.meta.upgrades = data.meta.upgrades || {};
    data.meta.claimedChallenges = data.meta.claimedChallenges || {};
    data.meta.daily = data.meta.daily || { key:'', claimed:false };
    return data;
  }
  function load(){ const s = normalize(MoguriaSave.load()); MoguriaSave.save(s); return s; }
  function save(data){ data=normalize(data); MoguriaSave.save(data); return data; }
  function todayKey(){ return new Date().toISOString().slice(0,10); }
  function addCoins(amount, reason=''){ const s=load(); s.meta.coins = Math.max(0, Math.floor((s.meta.coins||0)+amount)); save(s); return {coins:s.meta.coins, amount, reason}; }
  function runReward(run){ return Math.max(8, Math.floor(10 + (run.wave||run.floor||1)*4 + (run.kills||0)/6 + (run.cleared?70:0) + (run.titles||[]).length*6)); }
  function awardFromRun(run){ const amount=runReward(run); run.coins=amount; addCoins(amount,'run'); return amount; }
  function pickRarity(){ const total=Object.values(RARITY_WEIGHT).reduce((a,b)=>a+b,0); let r=Math.random()*total; for(const [k,w] of Object.entries(RARITY_WEIGHT)){ r-=w; if(r<=0) return k; } return 'common'; }
  function pull(){
    const s=load(); if((s.meta.coins||0)<GACHA_COST) return { ok:false, message:'MoguCoinが足りません。冒険やおでかけで少しずつ集めよう。' };
    const rarity=pickRarity(); const pool=EQUIPMENT.filter(e=>e.rarity===rarity); const base=pool[Math.floor(Math.random()*pool.length)] || EQUIPMENT[0];
    const item={...base, uid:'eq_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7), level:1, obtainedAt:Date.now()};
    s.meta.coins-=GACHA_COST; s.meta.inventory.unshift(item); save(s); return {ok:true,item,coins:s.meta.coins};
  }
  function equip(uid){ const s=load(); const item=s.meta.inventory.find(x=>x.uid===uid); if(!item) return null; s.meta.equipped[item.slot]=uid; save(s); return item; }
  function upgrade(uid){
    const s=load(); const item=s.meta.inventory.find(x=>x.uid===uid); if(!item) return {ok:false,message:'装備が見つかりません'};
    const mat=s.meta.inventory.find(x=>x.uid!==uid && x.slot===item.slot);
    if(!mat) return {ok:false,message:'同じ部位の装備が素材に必要です'};
    item.level=(item.level||1)+1; s.meta.inventory=s.meta.inventory.filter(x=>x.uid!==mat.uid); Object.keys(s.meta.equipped).forEach(slot=>{ if(s.meta.equipped[slot]===mat.uid) s.meta.equipped[slot]=null; }); save(s); return {ok:true,item,used:mat};
  }
  function claimChallenge(id){
    const s=load(); const c=CHALLENGES.find(x=>x.id===id); if(!c) return {ok:false,message:'チャレンジが見つかりません'};
    const key=c.type==='daily' ? todayKey() : id;
    const claimKey=c.id+':'+key;
    if(s.meta.claimedChallenges[claimKey]) return {ok:false,message:'この報酬は受け取り済みです'};
    s.meta.claimedChallenges[claimKey]=Date.now(); s.meta.coins=(s.meta.coins||0)+c.reward; save(s); return {ok:true,challenge:c,amount:c.reward,coins:s.meta.coins};
  }
  function equipmentSummary(){ const s=load(); return Object.entries(SLOT_LABELS).map(([slot,label])=>{ const uid=s.meta.equipped[slot]; const item=s.meta.inventory.find(x=>x.uid===uid); return {slot,label,item}; }); }
  function applyEquipmentToPlayer(p){
    const s=load(); const equipped=equipmentSummary().map(x=>x.item).filter(Boolean);
    for(const item of equipped){
      const lv=item.level||1; if(item.stat.hp) { p.maxHp += item.stat.hp*lv; p.hp += item.stat.hp*lv; }
      if(item.stat.atk) p.damage += item.stat.atk*lv;
      if(item.stat.speed) p.speed += 3*item.stat.speed;
      p.equipmentVisual = p.equipmentVisual || {}; p.equipmentVisual[item.slot]=item.icon;
    }
  }
  return { EQUIPMENT, CHALLENGES, SLOT_LABELS, RARITY_LABELS, GACHA_COST, normalize, load, save, addCoins, awardFromRun, pull, equip, upgrade, claimChallenge, equipmentSummary, applyEquipmentToPlayer };
})();
