window.MoguriaPlayer = (() => {
  const NUMBER_KEYS = [
    'x','y','r','lv','exp','nextExp','hp','maxHp','speed','armor','dodge','crit',
    'attackRate','attackCd','attackRange','summonRange','baseDamage','poisonChance','poisonPower',
    'killExplodeChance','explosionRadius','explosionPower','pierce','auraDamage','auraRadius','auraTick',
    'meteorCd','meteorRate','lightningCd','lightningRate','lightningJumps','orbitDamage','orbitRadius','orbitTick',
    'mineCd','mineRate','freezeChance','lifesteal','magnetRadius','bossDamageBonus','regen','expDiscount','xpBonus',
    'thorns','shield','summons','summonRate','summonCd','invuln'
  ];
  const BOOLEAN_KEYS = [
    'poisonCloud','toxicBurst','chainExplosion','dodgeShot','dodgeBomb','splitShot','fanShot','meteor','lightning',
    'mine','shieldBurst','summonExplode','hungryFang','critChain','devInvincible'
  ];

  function create(){
    return { x: 0, y: 0, r: 15, lv:1, exp:0, nextExp:16, hp:100, maxHp:100, speed:150, armor:0, dodge:.03, crit:.05,
      attackRate:.65, attackCd:0, attackRange:245, summonRange:275, baseDamage:10, poisonChance:0, poisonPower:2, poisonCloud:false, toxicBurst:false,
      killExplodeChance:0, explosionRadius:54, explosionPower:20, chainExplosion:false, dodgeShot:false, dodgeBomb:false,
      pierce:0, splitShot:false, fanShot:false, auraDamage:0, auraRadius:0, auraTick:0, meteor:false, meteorCd:0, meteorRate:4.8, lightning:false, lightningCd:0, lightningRate:3.8, lightningJumps:2, orbitDamage:0, orbitRadius:0, orbitTick:0, mine:false, mineCd:0, mineRate:3.4, freezeChance:0, lifesteal:0, magnetRadius:82, bossDamageBonus:0, regen:0, expDiscount:0, xpBonus:0,
      thorns:0, shield:0, shieldBurst:false, summons:0, summonRate:1.1, summonCd:0, summonExplode:false, hungryFang:false, critChain:false,
      skills:[], skillLevels:{}, fusedSkills:[], artifacts:[], visual:{poison:0,fire:0,ice:0,guard:0,summon:0,star:0}, invuln:0 };
  }
  function damageMultiplier(p){
    let m=1;
    if(p.hungryFang) m += (1 - p.hp / p.maxHp) * 1.2;
    return m;
  }

  function plainObject(value){
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function idList(value){
    if(!Array.isArray(value)) return [];
    return [...new Set(value.map(entry => typeof entry === 'string' ? entry : entry?.id).filter(id => typeof id === 'string' && id))];
  }

  function snapshot(p){
    const source=plainObject(p);
    const numbers={};
    const flags={};
    for(const key of NUMBER_KEYS){ const value=Number(source[key]); if(Number.isFinite(value)) numbers[key]=value; }
    for(const key of BOOLEAN_KEYS) flags[key]=Boolean(source[key]);

    const skillLevels={};
    for(const [id,value] of Object.entries(plainObject(source.skillLevels))){
      const level=Number(value);
      if(id && Number.isFinite(level) && level>0) skillLevels[id]=Math.floor(level);
    }
    const visual={};
    for(const [key,value] of Object.entries(plainObject(source.visual))){
      const amount=Number(value);
      if(Number.isFinite(amount)) visual[key]=amount;
    }

    return {
      version:1,
      numbers,
      flags,
      skillLevels,
      skills:idList(source.skills),
      artifacts:idList(source.artifacts),
      fusedSkills:idList(source.fusedSkills),
      visual,
      equipmentVisual:{...plainObject(source.equipmentVisual)}
    };
  }

  function restore(saved, target=create()){
    const data=plainObject(saved);
    const p=target && typeof target === 'object' ? target : create();
    // Accept the structured v1 snapshot and a flat early-checkpoint shape.
    const numbers=Object.keys(plainObject(data.numbers)).length ? plainObject(data.numbers) : data;
    const flags=Object.keys(plainObject(data.flags)).length ? plainObject(data.flags) : data;
    for(const key of NUMBER_KEYS){ const value=Number(numbers[key]); if(Number.isFinite(value)) p[key]=value; }
    for(const key of BOOLEAN_KEYS){ if(Object.prototype.hasOwnProperty.call(flags,key)) p[key]=Boolean(flags[key]); }

    const skillDefs=window.MoguriaSkills?.skills || [];
    const artifactDefs=window.MoguriaSkills?.artifacts || [];
    const fusionDefs=window.MoguriaSkills?.fusions || [];
    const skillIdsAllowed=new Set(skillDefs.map(def=>def.id));
    p.skillLevels={};
    for(const [id,value] of Object.entries(plainObject(data.skillLevels))){
      const level=Number(value);
      if(skillIdsAllowed.has(id) && Number.isFinite(level) && level>0) p.skillLevels[id]=Math.floor(level);
    }

    const skillsById=new Map([...skillDefs,...fusionDefs].map(def=>[def.id,def]));
    const fusionsById=new Map(fusionDefs.map(def=>[def.id,def]));
    const artifactsById=new Map(artifactDefs.map(def=>[def.id,def]));
    const skillIds=idList(data.skills);
    const fusionIds=[...new Set([...idList(data.fusedSkills),...skillIds.filter(id=>fusionsById.has(id))])];
    p.skills=[...new Set([...skillIds,...fusionIds])].map(id=>{
      const def=skillsById.get(id);
      return fusionsById.has(id) && def ? {...def,rarity:'fusion',fusion:true} : def;
    }).filter(Boolean);
    p.artifacts=idList(data.artifacts).map(id=>artifactsById.get(id)).filter(Boolean);
    p.fusedSkills=fusionIds.filter(id=>skillsById.has(id));
    p.visual={...p.visual,...plainObject(data.visual)};
    p.equipmentVisual={...plainObject(data.equipmentVisual)};
    return p;
  }

  return { create, damageMultiplier, snapshot, restore };
})();
