window.MoguriaSkills = (() => {
  const skills = [
    {id:'poison_seed', icon:'🍄', name:'むらさきキノコ', rarity:'common', tags:['毒'], desc:'攻撃に毒を少し混ぜる。', apply:p=>{p.poisonChance+=.14;p.visual.poison++;}},
    {id:'poison_stack', icon:'🫐', name:'にがい実', rarity:'common', tags:['毒'], desc:'毒の痛みが強くなる。', apply:p=>{p.poisonPower+=3;p.visual.poison++;}},
    {id:'poison_cloud', icon:'🟣', name:'もやもやゼリー', rarity:'rare', tags:['毒','範囲'], desc:'毒の敵を倒すと毒もやを残す。', apply:p=>{p.poisonCloud=true;p.visual.poison+=2;}},
    {id:'toxic_burst', icon:'🎆', name:'どく花火', rarity:'legendary', tags:['毒','爆発'], desc:'毒の敵が爆発しやすくなる。', apply:p=>{p.toxicBurst=true;p.explosionPower+=12;p.visual.poison+=2;p.visual.fire++;}},

    {id:'spark_pop', icon:'🫘', name:'ぱちぱち豆', rarity:'common', tags:['爆発'], desc:'撃破時に小さく弾ける。', apply:p=>{p.killExplodeChance+=.18;p.visual.fire++;}},
    {id:'boom_cookie', icon:'🍪', name:'ふくらみクッキー', rarity:'rare', tags:['爆発'], desc:'爆発範囲が広がる。', apply:p=>{p.explosionRadius+=24;p.explosionPower+=8;p.visual.fire++;}},
    {id:'chain_pop', icon:'🍬', name:'れんさキャンディ', rarity:'legendary', tags:['爆発','連鎖'], desc:'爆発で倒すと、また爆発する。', apply:p=>{p.chainExplosion=true;p.visual.fire+=2;}},

    {id:'quick_berry', icon:'🫐', name:'すばしこベリー', rarity:'common', tags:['回避','速度'], desc:'移動と回避が少し上がる。', apply:p=>{p.speed+=18;p.dodge+=.06;p.visual.ice++;}},
    {id:'blink_mint', icon:'🌿', name:'ひらりミント', rarity:'rare', tags:['回避'], desc:'回避すると小さな弾を飛ばす。', apply:p=>{p.dodgeShot=true;p.dodge+=.08;p.visual.ice++;}},
    {id:'afterimage', icon:'🌙', name:'かげもち', rarity:'legendary', tags:['回避','爆発'], desc:'回避時にぽふっと爆発する。', apply:p=>{p.dodgeBomb=true;p.dodge+=.1;p.visual.ice+=2;}},

    {id:'guard_nut', icon:'🥜', name:'まもりナッツ', rarity:'common', tags:['防御'], desc:'最大HPと防御が上がる。', apply:p=>{p.maxHp+=20;p.hp+=20;p.armor+=2;p.visual.guard++;}},
    {id:'thorn_bun', icon:'🌵', name:'とげまんじゅう', rarity:'rare', tags:['防御','反撃'], desc:'受けた相手に反撃する。', apply:p=>{p.thorns+=8;p.visual.guard+=2;}},
    {id:'sleepy_shell', icon:'🐚', name:'ねむり貝', rarity:'legendary', tags:['防御','爆発'], desc:'シールドが割れると大爆発。', apply:p=>{p.shield+=45;p.shieldBurst=true;p.visual.guard+=2;}},

    {id:'mini_mogu', icon:'🥐', name:'こもぐパン', rarity:'common', tags:['召喚'], desc:'小さな仲間が一緒に攻撃する。', apply:p=>{p.summons+=1;p.visual.summon++;}},
    {id:'friend_jam', icon:'🍯', name:'なかよしジャム', rarity:'rare', tags:['召喚','速度'], desc:'仲間の攻撃が速くなる。', apply:p=>{p.summonRate*=.78;p.visual.summon++;}},
    {id:'bye_pop', icon:'🍿', name:'ばいばいポップ', rarity:'legendary', tags:['召喚','爆発'], desc:'仲間の弾がたまに爆発する。', apply:p=>{p.summonExplode=true;p.visual.summon+=2;}},



    {id:'pierce_skewer', icon:'🍡', name:'つきぬけ団子', rarity:'rare', tags:['攻撃','貫通'], desc:'もち弾が敵を貫通する。密集に強い。', apply:p=>{p.pierce+=1;p.visual.star++;}},
    {id:'split_mochi', icon:'🍘', name:'われもちせんべい', rarity:'rare', tags:['攻撃','分裂'], desc:'もち弾が当たると小さく分裂する。', apply:p=>{p.splitShot=true;p.visual.star++;}},
    {id:'mogu_field', icon:'🛡️', name:'ぽかぽか領域', rarity:'rare', tags:['防御','領域'], desc:'近づくだけで周囲の敵にじわじわダメージ。', apply:p=>{p.auraDamage+=5;p.auraRadius=Math.max(p.auraRadius,68);p.visual.guard++;}},
    {id:'big_field', icon:'🫧', name:'ふくらむ結界', rarity:'legendary', tags:['防御','領域'], desc:'領域が大きくなり、守りながら削れる。', apply:p=>{p.auraDamage+=4;p.auraRadius=Math.max(p.auraRadius+26,96);p.armor+=1;p.visual.guard+=2;}},
    {id:'star_meteor', icon:'☄️', name:'ほしあめ', rarity:'rare', tags:['攻撃','自動'], desc:'時間ごとに敵へ星が落ちる。', apply:p=>{p.meteor=true;p.meteorRate=Math.max(2.7,p.meteorRate-.55);p.visual.star++;}},
    {id:'meteor_party', icon:'🌠', name:'星ふりパーティ', rarity:'legendary', tags:['攻撃','自動','爆発'], desc:'ほしあめの頻度が上がり、落下地点が爆発する。', apply:p=>{p.meteor=true;p.meteorRate=Math.max(1.8,p.meteorRate-1.2);p.explosionPower+=10;p.visual.star+=2;}},
    {id:'fan_cookie', icon:'🥠', name:'ひろがりクッキー', rarity:'rare', tags:['攻撃','範囲'], desc:'もち弾を扇状に撃つ。正面制圧が強くなる。', apply:p=>{p.fanShot=true;p.attackRate*=1.08;p.visual.fire++;}},

    {id:'crit_sugar', icon:'✨', name:'きらめき砂糖', rarity:'common', tags:['会心'], desc:'クリティカル率が上がる。', apply:p=>{p.crit+=.08;}},
    {id:'hungry_fang', icon:'🦷', name:'はらぺこ牙', rarity:'rare', tags:['攻撃'], desc:'HPが低いほど攻撃が強くなる。', apply:p=>{p.hungryFang=true;}},
    {id:'star_drop', icon:'⭐', name:'星のしずく', rarity:'legendary', tags:['会心','攻撃'], desc:'クリティカルが連続で伸びる。', apply:p=>{p.critChain=true;p.crit+=.08;}}
,
    {id:'moon_orbit', icon:'🌕', name:'まわる月もち', rarity:'rare', tags:['攻撃','領域'], desc:'Moguの周囲を回る月もちが近くの敵を削る。', apply:p=>{p.orbitDamage+=8;p.orbitRadius=Math.max(p.orbitRadius,76);p.visual.star++;}},
    {id:'orbit_storm', icon:'🪐', name:'ぐるぐる星環', rarity:'legendary', tags:['攻撃','領域','連鎖'], desc:'周回ダメージが強くなり、領域ビルドが攻撃的になる。', apply:p=>{p.orbitDamage+=10;p.orbitRadius=Math.max(p.orbitRadius+26,108);p.auraDamage+=3;p.visual.star+=2;}},
    {id:'thunder_gum', icon:'⚡', name:'びりびりガム', rarity:'rare', tags:['攻撃','自動','連鎖'], desc:'時間ごとに近くの敵へ雷が跳ねる。', apply:p=>{p.lightning=true;p.lightningRate=Math.max(2.6,p.lightningRate-.75);p.lightningJumps+=1;p.visual.star++;}},
    {id:'storm_soda', icon:'🥤', name:'あらしソーダ', rarity:'legendary', tags:['攻撃','自動','連鎖'], desc:'雷の頻度と跳ねる回数が増える。', apply:p=>{p.lightning=true;p.lightningRate=Math.max(1.7,p.lightningRate-1.25);p.lightningJumps+=2;p.visual.star+=2;}},
    {id:'sleepy_mine', icon:'🥚', name:'ねむりたまご', rarity:'rare', tags:['爆発','設置'], desc:'時間ごとに小さな爆弾を置く。追われるほど強い。', apply:p=>{p.mine=true;p.mineRate=Math.max(2.4,p.mineRate-.7);p.visual.fire++;}},
    {id:'mine_garden', icon:'🌷', name:'ばくだん花畑', rarity:'legendary', tags:['爆発','設置','防御'], desc:'置き爆弾が増え、逃げ回るビルドが成立しやすい。', apply:p=>{p.mine=true;p.mineRate=Math.max(1.45,p.mineRate-1.4);p.explosionPower+=8;p.visual.fire+=2;}},
    {id:'ice_syrup', icon:'🍧', name:'ひんやりシロップ', rarity:'rare', tags:['氷','防御'], desc:'攻撃がたまに敵を遅くする。距離管理しやすい。', apply:p=>{p.freezeChance+=.18;p.visual.ice+=2;}},
    {id:'mogu_vamp', icon:'🩸', name:'あまい赤い実', rarity:'rare', tags:['回復','攻撃'], desc:'敵を倒すたび少し回復する。攻めながら粘れる。', apply:p=>{p.lifesteal+=2.8;p.visual.poison++;}},
    {id:'growth_honey', icon:'🍯', name:'そだつハチミツ', rarity:'common', tags:['経験値','成長'], desc:'星の実から得る経験値が少し増える。', apply:p=>{p.xpBonus+=.12;p.visual.star++;}},
    {id:'soft_step', icon:'🧦', name:'ふわふわ靴下', rarity:'common', tags:['移動','防御'], desc:'移動速度が上がり、接触ダメージを少し受けにくい。', apply:p=>{p.speed+=18;p.armor+=1;p.visual.ice++;}}

  ];

  const artifacts = [
    {id:'violet_engine', icon:'🟣', name:'むらさきエンジン', tags:['毒','爆発'], weight:2, desc:'毒と爆発を一気に軸へ。毒付与・毒威力・爆発力が上がる。', apply:p=>{p.poisonChance+=.22;p.poisonPower+=5;p.explosionPower+=12;p.toxicBurst=true;p.visual.poison+=2;p.visual.fire++;}},
    {id:'pop_crown', icon:'👑', name:'ぽふぽふ王冠', tags:['爆発','連鎖'], weight:2, desc:'撃破爆発と連鎖の軸。敵が弾けるたびに次が見える。', apply:p=>{p.killExplodeChance+=.28;p.chainExplosion=true;p.explosionRadius+=22;p.visual.fire+=2;}},
    {id:'runner_cloak', icon:'🪽', name:'ひらりマント', tags:['回避','速度'], weight:4, desc:'回避型の軸。速くなり、回避時に反撃しやすくなる。', apply:p=>{p.speed+=34;p.dodge+=.16;p.dodgeShot=true;p.visual.ice+=2;}},
    {id:'shell_heart', icon:'💚', name:'まもりの心臓', tags:['防御','反撃'], weight:4, desc:'防御型の軸。HP・防御・反撃がまとまって伸びる。', apply:p=>{p.maxHp+=45;p.hp+=45;p.armor+=4;p.thorns+=10;p.visual.guard+=2;}},
    {id:'little_parade', icon:'🐾', name:'こもぐ行進旗', tags:['召喚'], weight:4, desc:'召喚型の軸。子Moguが増えて、攻撃間隔も短くなる。', apply:p=>{p.summons+=2;p.summonRate*=.68;p.visual.summon+=2;}},
    {id:'star_orbit', icon:'🌠', name:'星まわりの石', tags:['自動','攻撃'], weight:3, desc:'自動攻撃の軸。星がよく落ち、近くの敵を勝手に削る。', apply:p=>{p.meteor=true;p.meteorRate=Math.max(1.8,p.meteorRate-1.8);p.visual.star+=2;}},
    {id:'field_core', icon:'🫧', name:'ぽかぽか核', tags:['領域','防御'], weight:3, desc:'領域型の軸。近づくだけで削れる範囲が大きくなる。', apply:p=>{p.auraDamage+=7;p.auraRadius=Math.max(p.auraRadius+38,112);p.armor+=2;p.visual.guard+=2;}},
    {id:'split_lens', icon:'🔆', name:'分裂レンズ', tags:['分裂','攻撃'], weight:3, desc:'攻撃が当たるたびに増える方向へ。分裂弾と会心が伸びる。', apply:p=>{p.splitShot=true;p.crit+=.08;p.baseDamage+=4;p.visual.star+=2;}},
    {id:'pierce_needle', icon:'🪡', name:'つらぬき針', tags:['貫通','攻撃'], weight:4, desc:'一直線に抜く軸。貫通回数と攻撃力が上がる。', apply:p=>{p.pierce+=2;p.baseDamage+=5;p.attackRange+=35;p.visual.star++;}},
    {id:'fan_shell', icon:'🪭', name:'ひろがり貝', tags:['範囲','攻撃'], weight:4, desc:'扇状攻撃の軸。正面に広く撃てる。', apply:p=>{p.fanShot=true;p.baseDamage+=3;p.attackRate*=.92;p.visual.fire++;}},
    {id:'hungry_moon', icon:'🌙', name:'はらぺこ月', tags:['攻撃','危険'], weight:2, desc:'HPが少ないほど強いロマン軸。火力と会心が伸びる。', apply:p=>{p.hungryFang=true;p.crit+=.12;p.baseDamage+=7;p.visual.star+=2;}},
    {id:'magnet_bell', icon:'🔔', name:'よびよせ鈴', tags:['救済','経験値'], weight:5, desc:'経験値を集めやすくする救済。星の実の吸い寄せ範囲が広がる。', apply:p=>{p.magnetRadius+=70;p.speed+=12;p.visual.star++;}},
    {id:'reroll_spoon', icon:'🥄', name:'選びなおしスプーン', tags:['救済'], weight:5, desc:'スキル運が悪い時の救済。リロール回数が増える。', apply:(p,state)=>{state.rerolls+=2;p.visual.star++;}},
    {id:'late_bloomer', icon:'🌱', name:'おそ咲きの種', tags:['成長','救済'], weight:3, desc:'ここから立て直す力。次の数レベルで必要経験値が少し軽くなる。', apply:p=>{p.expDiscount=Math.max(p.expDiscount||0,3);p.visual.guard++;}},
    {id:'boss_cookie', icon:'🍪', name:'ボス食べクッキー', tags:['ボス','攻撃'], weight:3, desc:'ボスとレア敵に強くなる。山場を突破しやすい。', apply:p=>{p.bossDamageBonus+=.35;p.visual.fire++;}},
    {id:'calm_blanket', icon:'🧣', name:'やすらぎ毛布', tags:['防御','回復'], weight:4, desc:'少しずつ回復する安全軸。事故りにくくなる。', apply:p=>{p.regen+=1.2;p.maxHp+=20;p.hp+=20;p.visual.guard++;}},
    {id:'double_bite', icon:'🍴', name:'ふたくちフォーク', tags:['攻撃','速度'], weight:2, desc:'攻撃テンポが劇的に上がるが、一撃は少し軽くなる。', apply:p=>{p.attackRate*=.62;p.baseDamage*=.78;p.visual.star+=2;}},
    {id:'glass_cannon', icon:'💎', name:'きらきら危険石', tags:['攻撃','危険'], weight:1, desc:'大当たり枠。火力は跳ねるが、防御が少し下がる。', apply:p=>{p.baseDamage+=16;p.crit+=.16;p.armor=Math.max(0,p.armor-2);p.maxHp=Math.max(60,p.maxHp-12);p.hp=Math.min(p.hp,p.maxHp);p.visual.star+=3;}},
    {id:'safe_pouch', icon:'🎒', name:'おまもりポーチ', tags:['防御','救済'], weight:5, desc:'運が悪い時の保険。シールドと回避が少し増える。', apply:p=>{p.shield+=55;p.dodge+=.06;p.visual.guard++;}},
    {id:'mystery_pot', icon:'🏺', name:'なぞの壺', tags:['変化'], weight:1, desc:'大当たり枠。今の主軸タグに合わせて大きく伸びる。', apply:(p,state)=>{const counts={}; for(const s of p.skills) for(const t of s.tags) counts[t]=(counts[t]||0)+1; const top=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'攻撃'; if(top==='毒'){p.poisonChance+=.25;p.poisonPower+=8;p.toxicBurst=true;p.visual.poison+=3;} else if(top==='爆発'){p.killExplodeChance+=.35;p.explosionRadius+=30;p.chainExplosion=true;p.visual.fire+=3;} else if(top==='防御'){p.maxHp+=60;p.hp+=60;p.armor+=5;p.auraDamage+=4;p.auraRadius=Math.max(p.auraRadius,90);p.visual.guard+=3;} else if(top==='召喚'){p.summons+=3;p.summonExplode=true;p.visual.summon+=3;} else if(top==='回避'){p.speed+=42;p.dodge+=.2;p.dodgeBomb=true;p.visual.ice+=3;} else {p.baseDamage+=12;p.crit+=.14;p.pierce+=1;p.visual.star+=3;} }}
,
    {id:'thunder_totem', icon:'⚡', name:'雷よびトーテム', tags:['自動','連鎖'], weight:2, desc:'雷ビルドの軸。自動で跳ねる攻撃が増え、敵の群れを崩しやすい。', apply:p=>{p.lightning=true;p.lightningRate=Math.max(1.65,p.lightningRate-1.9);p.lightningJumps+=3;p.visual.star+=3;}},
    {id:'moon_ring', icon:'🪐', name:'月輪のおまもり', tags:['領域','攻撃'], weight:3, desc:'周囲を削る軸。近接領域と周回ダメージをまとめて伸ばす。', apply:p=>{p.orbitDamage+=14;p.orbitRadius=Math.max(p.orbitRadius+34,116);p.auraDamage+=4;p.auraRadius=Math.max(p.auraRadius,96);p.visual.star+=2;p.visual.guard++;}},
    {id:'trap_lunchbox', icon:'🍱', name:'しかけ弁当', tags:['設置','爆発'], weight:3, desc:'置き爆弾の軸。逃げるほど戦場がMogu有利になる。', apply:p=>{p.mine=true;p.mineRate=Math.max(1.4,p.mineRate-1.55);p.explosionRadius+=18;p.explosionPower+=10;p.visual.fire+=2;}},
    {id:'cold_mirror', icon:'🪞', name:'こおり鏡', tags:['氷','防御'], weight:4, desc:'敵を遅くする救済軸。速い敵やボスへの事故を減らす。', apply:p=>{p.freezeChance+=.28;p.dodge+=.05;p.armor+=2;p.visual.ice+=3;}},
    {id:'life_jam', icon:'🍓', name:'いのちジャム', tags:['回復','攻撃'], weight:4, desc:'撃破回復で立て直す軸。火力不足でも粘りやすい。', apply:p=>{p.lifesteal+=4.2;p.regen+=.4;p.maxHp+=15;p.hp+=15;p.visual.poison++;}},
    {id:'study_notebook', icon:'📘', name:'もぐ研究ノート', tags:['成長','救済'], weight:3, desc:'経験値効率が上がり、悪い序盤から巻き返しやすい。', apply:p=>{p.xpBonus+=.28;p.magnetRadius+=34;p.visual.star+=2;}}

  ];
  function weightedArtifactChoices(count, owned){
    const taken = new Set((owned||[]).map(a=>a.id));
    const weighted=[];
    for(const a of artifacts){ if(taken.has(a.id)) continue; for(let i=0;i<(a.weight||3);i++) weighted.push(a); }
    const out=[];
    while(out.length<count && weighted.length){ const pick=weighted[Math.floor(Math.random()*weighted.length)]; if(!out.find(x=>x.id===pick.id)) out.push(pick); }
    return out;
  }

  const MAX_SKILL_LEVEL = 5;
  const fusions = [
    {id:'fusion_toxic_star_firework', icon:'🌌', name:'星毒の大花火', requires:{poison_seed:3,toxic_burst:2}, tags:['毒','爆発','連鎖'], desc:'毒と爆発が合体。毒の敵がより大きく光って弾ける。', apply:p=>{p.toxicBurst=true;p.poisonChance+=.18;p.poisonPower+=7;p.explosionRadius+=28;p.explosionPower+=20;p.chainExplosion=true;p.visual.poison+=3;p.visual.fire+=2;}},
    {id:'fusion_storm_orbit', icon:'⚡', name:'星雷の輪っか', requires:{thunder_gum:3,moon_orbit:2}, tags:['自動','連鎖','領域'], desc:'雷と周回攻撃が合体。近くの敵へ気持ちよく跳ねる。', apply:p=>{p.lightning=true;p.lightningRate=Math.max(1.35,p.lightningRate-1.3);p.lightningJumps+=3;p.orbitDamage+=14;p.orbitRadius=Math.max(p.orbitRadius+24,118);p.visual.star+=4;}},
    {id:'fusion_safe_flower_bomb', icon:'🌷', name:'まもり花火畑', requires:{mogu_field:3,sleepy_mine:2}, tags:['防御','設置','爆発'], desc:'領域と爆弾が合体。守りながら足元に花火を咲かせる。', apply:p=>{p.auraDamage+=8;p.auraRadius=Math.max(p.auraRadius+30,122);p.mine=true;p.mineRate=Math.max(1.3,p.mineRate-1.0);p.explosionPower+=14;p.visual.guard+=3;p.visual.fire+=2;}},
    {id:'fusion_little_meteor_parade', icon:'🐾', name:'こもぐ星ふり隊', requires:{mini_mogu:3,star_meteor:2}, tags:['召喚','自動','攻撃'], desc:'こもぐと星雨が合体。仲間たちが星を呼びやすくなる。', apply:p=>{p.summons+=2;p.summonRate*=.72;p.meteor=true;p.meteorRate=Math.max(1.55,p.meteorRate-1.2);p.visual.summon+=3;p.visual.star+=2;}}
  ];
  function skillLevel(pOrOwned, id){
    if(pOrOwned && pOrOwned.skillLevels) return pOrOwned.skillLevels[id]||0;
    const owned=Array.isArray(pOrOwned)?pOrOwned:[];
    return owned.filter(o=>o.id===id).length;
  }
  function weightedChoices(count, owned, banned){
    const levelMap = owned && owned.skillLevels ? owned.skillLevels : null;
    const list = levelMap ? skills.filter(s => (levelMap[s.id]||0) < MAX_SKILL_LEVEL) : skills.filter(s => (owned.filter(o=>o.id===s.id).length < MAX_SKILL_LEVEL));
    const ban = new Set(banned||[]);
    const pool = list.filter(s=>!ban.has(s.id));
    const weighted = [];
    for (const s of pool) {
      const lv = levelMap ? (levelMap[s.id]||0) : (Array.isArray(owned)?owned.filter(o=>o.id===s.id).length:0);
      const w = (s.rarity === 'legendary' ? 1 : s.rarity === 'rare' ? 3 : 7) + (lv>0 ? 2 : 0);
      for (let i=0;i<w;i++) weighted.push(s);
    }
    const out=[];
    while(out.length<count && weighted.length){
      const pick = weighted[Math.floor(Math.random()*weighted.length)];
      if(!out.find(x=>x.id===pick.id)) out.push(pick);
    }
    return out;
  }
  function checkFusions(p){
    p.fusedSkills = p.fusedSkills || [];
    const made=[];
    for(const f of fusions){
      if(p.fusedSkills.includes(f.id)) continue;
      const ok = Object.entries(f.requires).every(([id,lv])=>(p.skillLevels?.[id]||0)>=lv);
      if(ok){ p.fusedSkills.push(f.id); p.skills.push({...f, rarity:'fusion', fusion:true}); f.apply?.(p); made.push(f); }
    }
    return made;
  }
  function detectSynergies(p){
    const got = id => p.skills.some(s=>s.id===id);
    const s=[];
    if((got('poison_seed')||got('poison_stack')) && got('toxic_burst')) s.push('毒爆裂');
    if(got('afterimage') && got('spark_pop')) s.push('回避ボム');
    if(got('thorn_bun') && got('sleepy_shell')) s.push('とげシェル');
    if(got('mini_mogu') && got('bye_pop')) s.push('こもぐ爆弾隊');
    if(got('chain_pop') && got('toxic_burst')) s.push('むらさき連鎖地獄');
    if(got('star_drop') && got('hungry_fang')) s.push('飢えた星くず');
    if(got('pierce_skewer') && got('split_mochi')) s.push('つきぬけ分裂もち');
    if(got('mogu_field') && got('thorn_bun')) s.push('近づくな危険');
    if(got('star_meteor') && got('meteor_party')) s.push('星ふり地獄');
    if(got('fan_cookie') && got('chain_pop')) s.push('扇の花火');
    if(got('moon_orbit') && got('mogu_field')) s.push('近づくだけで危険');
    if(got('thunder_gum') && got('storm_soda')) s.push('びりびり連鎖');
    if(got('sleepy_mine') && got('mine_garden')) s.push('逃げる花畑');
    if(got('ice_syrup') && got('pierce_skewer')) s.push('凍るつらぬき');
    if(got('mogu_vamp') && got('hungry_fang')) s.push('はらぺこ吸収');
    return [...new Set(s)];
  }
  return { skills, artifacts, fusions, MAX_SKILL_LEVEL, weightedChoices, weightedArtifactChoices, checkFusions, detectSynergies };
})();
