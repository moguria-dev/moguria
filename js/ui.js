window.MoguriaUI = (() => {
  function show(id){ document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); document.getElementById(id).classList.add('active'); if(id==='home') MoguriaHome.update(); }
  function showResult(run){
    document.getElementById('resultTitle').textContent = run.name;
    document.getElementById('resultComment').textContent = run.comment;
    MoguriaHome.applyVisual(document.getElementById('resultMogu'), run.visual);
    document.getElementById('resultStats').innerHTML = [
      ['到達階層', run.floor], ['レベル', run.lv], ['撃破数', run.kills], ['最大DMG', run.maxDamage], ['獲得MC', run.coins||0], ['DPS', run.dps], ['最大連鎖', run.bestCombo||0], ['爆発回数', run.explosions], ['会心率', run.critRate+'%'], ['回避率', run.dodgeRate+'%']
    ].map(([k,v])=>`<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
    document.getElementById('resultBadges').innerHTML = [...run.titles, ...(run.artifacts||[]).map(a=>'🏺 '+a.name), ...(run.skills||[]).filter(s=>s.fusion).map(s=>'✦ '+s.name), ...run.synergies].map(x=>`<span class="badge">${x}</span>`).join('');
    show('result');
  }
  function overlay(title, html){
    document.getElementById('overlayTitle').textContent=title; document.getElementById('overlayBody').innerHTML=html; document.getElementById('overlay').classList.remove('hidden');
  }
  function showDex(){
    const save=MoguriaSave.load();
    const artifactItems = (MoguriaSkills.artifacts||[]).map(a=>`<div class="item"><b>${(save.dex.artifacts||{})[a.id]? '✓ ' : '？ '}${a.name}</b><small>${(save.dex.artifacts||{})[a.id]||0}回獲得 / ${a.tags.join('・')}</small></div>`).join('');
    const skillItems = MoguriaSkills.skills.map(s=>`<div class="item"><b>${save.dex.skills[s.id]? '✓ ' : '？ '}${s.name}</b><small>${save.dex.skills[s.id]||0}回食べた / ${s.tags.join('・')}</small></div>`).join('');
    const syn = Object.keys(save.dex.synergies||{}); const title = Object.keys(save.dex.titles||{});
    overlay('Mogu図鑑', `<h3>アーティファクト</h3><div class="list">${artifactItems}</div><h3>食べ物</h3><div class="list">${skillItems}</div><h3>発見シナジー</h3><div class="list">${syn.length?syn.map(x=>`<div class="item"><b>${x}</b><small>発見済み</small></div>`).join(''):'<div class="item">まだ未発見。いろいろ食べてみよう。</div>'}</div><h3>二つ名</h3><div class="badges">${title.length?title.map(x=>`<span class="badge">${x}</span>`).join(''):'<span class="badge">小さな冒険者</span>'}</div>`);
  }
  function showLogs(){
    const save=MoguriaSave.load();
    const html = save.runs && save.runs.length ? save.runs.map((r,i)=>`<div class="item"><b>#${save.runs.length-i} ${r.name}</b><small>${new Date(r.date).toLocaleString()} / Lv.${r.lv} / ${r.kills}撃破 / 最大DMG ${r.maxDamage}</small><small>${(r.artifacts||[]).map(a=>'🏺'+a.name).join(' / ')}</small><small>${(r.skills||[]).filter(s=>s.fusion).map(s=>'✦ '+s.name).join(' / ')}</small><small>${r.comment}</small><div class="badges">${[...r.titles,...(r.artifacts||[]).map(a=>'🏺 '+a.name),...(r.skills||[]).filter(s=>s.fusion).map(s=>'✦ '+s.name),...r.synergies].map(x=>`<span class="badge">${x}</span>`).join('')}</div></div>`).join('') : '<div class="item">まだ冒険記録はありません。</div>';
    overlay('冒険記録', `<div class="list">${html}</div>`);
  }

  function rarityClass(r){ return 'rarity-'+(r||'common'); }
  function showEquipment(){
    const save=MoguriaMeta.load();
    const slots=MoguriaMeta.equipmentSummary().map(x=>`<div class="item equip-slot"><b>${x.label}</b><small>${x.item?`${x.item.icon} ${x.item.name} Lv.${x.item.level||1} / ${MoguriaMeta.RARITY_LABELS[x.item.rarity]}`:'未装備'}</small></div>`).join('');
    const inv=save.meta.inventory.length ? save.meta.inventory.map(it=>`<div class="item equip-item ${rarityClass(it.rarity)}"><b>${it.icon} ${it.name} Lv.${it.level||1}</b><small>${MoguriaMeta.SLOT_LABELS[it.slot]} / ${MoguriaMeta.RARITY_LABELS[it.rarity]} / ${it.desc}</small><div class="row-actions"><button data-equip="${it.uid}">装備</button><button data-upgrade="${it.uid}">強化</button></div></div>`).join('') : '<div class="item">まだ装備はありません。もぐガチャで集めよう。</div>';
    overlay('装備', `<div class="meta-head"><b>MoguCoin ${save.meta.coins||0}</b><small>装備は5部位。強化は同じ部位の装備を素材にします。</small></div><h3>装備中</h3><div class="list">${slots}</div><h3>持ちもの</h3><div class="list">${inv}</div>`);
    const body=document.getElementById('overlayBody');
    body.querySelectorAll('[data-equip]').forEach(b=>b.onclick=()=>{ MoguriaMeta.equip(b.dataset.equip); showEquipment(); });
    body.querySelectorAll('[data-upgrade]').forEach(b=>b.onclick=()=>{ const res=MoguriaMeta.upgrade(b.dataset.upgrade); if(!res.ok) alert(res.message); showEquipment(); });
  }
  function showGacha(){
    const save=MoguriaMeta.load();
    overlay('もぐガチャ', `<div class="meta-head"><b>MoguCoin ${save.meta.coins||0}</b><small>1回 ${MoguriaMeta.GACHA_COST} MC。ハズレ装備も強化素材になります。</small></div><button id="pullGachaBtn" class="primary">1回もぐる</button><div id="gachaResult" class="gacha-result"></div><h3>出るもの</h3><div class="list">${MoguriaMeta.EQUIPMENT.map(e=>`<div class="item ${rarityClass(e.rarity)}"><b>${e.icon} ${e.name}</b><small>${MoguriaMeta.SLOT_LABELS[e.slot]} / ${MoguriaMeta.RARITY_LABELS[e.rarity]} / ${e.desc}</small></div>`).join('')}</div>`);
    document.getElementById('pullGachaBtn').onclick=()=>{ const res=MoguriaMeta.pull(); const el=document.getElementById('gachaResult'); if(!res.ok){ el.innerHTML=`<div class="item">${res.message}</div>`; return; } MoguriaAudio?.play('gacha'); el.innerHTML=`<div class="gacha-orb ${res.item.rarity}">✦</div><div class="item ${rarityClass(res.item.rarity)} gacha-pop"><b>${res.item.icon} ${res.item.name}</b><small>${res.item.desc}</small></div>`; MoguriaHome.update(); };
  }
  function showOuting(){
    const save=MoguriaMeta.load();
    const html=MoguriaMeta.CHALLENGES.map(c=>`<div class="item challenge"><b>${c.icon} ${c.name}</b><small>${c.desc}</small><small>報酬 ${c.reward} MC</small><button data-claim="${c.id}">報酬テスト受け取り</button></div>`).join('');
    overlay('おでかけ', `<div class="meta-head"><b>MoguCoin ${save.meta.coins||0}</b><small>今はサブコンテンツの入口と報酬基盤です。後で特殊ステージ化します。</small></div><div class="list">${html}</div>`);
    document.getElementById('overlayBody').querySelectorAll('[data-claim]').forEach(b=>b.onclick=()=>{ const res=MoguriaMeta.claimChallenge(b.dataset.claim); if(!res.ok) alert(res.message); showOuting(); MoguriaHome.update(); });
  }

  function init(){
    document.getElementById('againBtn').onclick=()=>{ show('home'); setTimeout(()=>document.getElementById('startBtn').click(),100); };
    document.getElementById('homeBtn').onclick=()=>show('home');
    document.getElementById('closeOverlay').onclick=()=>document.getElementById('overlay').classList.add('hidden');
    document.getElementById('overlay').addEventListener('click',e=>{ if(e.target.id==='overlay') e.currentTarget.classList.add('hidden'); });
  }
  return { init, show, showResult, showDex, showLogs, showEquipment, showGacha, showOuting };
})();
