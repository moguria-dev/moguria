window.MoguriaPlayer = (() => {
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
  return { create, damageMultiplier };
})();
