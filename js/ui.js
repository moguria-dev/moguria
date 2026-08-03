window.MoguriaUI = (() => {
  let initialized = false;

  const ENTITY = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ENTITY[ch]);
  const attr = esc;
  const asArray = (value) => Array.isArray(value) ? value : [];

  function show(id){
    const target = document.getElementById(id);
    if (!target) return;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    target.classList.add('active');
    if (id === 'home') window.MoguriaHome?.update?.();
  }

  function badgeList(items){
    return asArray(items).map(x => `<span class="badge">${esc(x)}</span>`).join('');
  }

  function overlay(title, html){
    const titleEl = document.getElementById('overlayTitle');
    const bodyEl = document.getElementById('overlayBody');
    const overlayEl = document.getElementById('overlay');
    if (!titleEl || !bodyEl || !overlayEl) return;
    titleEl.textContent = title;
    bodyEl.innerHTML = html;
    overlayEl.classList.remove('hidden');
  }

  function rarityClass(r){
    return 'rarity-' + attr(r || 'common');
  }

  function showResult(run = {}){
    document.getElementById('resultTitle').textContent = run.name || 'もぐもぐの旅';
    document.getElementById('resultComment').textContent = run.comment || '今日はよくがんばったね…';
    window.MoguriaHome?.applyVisual?.(document.getElementById('resultMogu'), run.visual);

    const primaryStats = [
      ['到達階層', run.floor],
      ['撃破数', run.kills],
      ['獲得MC', run.coins || 0],
      ['レベル', run.lv]
    ];
    const detailStats = [
      ['最大DMG', run.maxDamage],
      ['DPS', run.dps],
      ['最大連鎖', run.bestCombo || 0],
      ['爆発回数', run.explosions],
      ['会心率', (run.critRate || 0) + '%'],
      ['回避率', (run.dodgeRate || 0) + '%']
    ];
    const primaryHtml = primaryStats.map(([k, v]) => `<div class="stat stat--primary"><b>${esc(v ?? 0)}</b><span>${esc(k)}</span></div>`).join('');
    const detailHtml = detailStats.map(([k, v]) => `<div class="stat stat--detail"><b>${esc(v ?? 0)}</b><span>${esc(k)}</span></div>`).join('');
    document.getElementById('resultStats').innerHTML = `<div class="result-primary-stats">${primaryHtml}</div><details class="result-detail"><summary>くわしい記録</summary><div class="result-detail-stats">${detailHtml}</div></details>`;

    const badges = [
      ...asArray(run.titles),
      ...asArray(run.artifacts).map(a => ' ' + (a?.name || '')),
      ...asArray(run.skills).filter(s => s?.fusion).map(s => '✦ ' + (s?.name || '')),
      ...asArray(run.synergies)
    ].filter(Boolean);
    document.getElementById('resultBadges').innerHTML = badgeList(badges);
    show('result');
  }

  function showDex(){
    const save = window.MoguriaSave.load();
    const artifacts = window.MoguriaSkills?.artifacts || [];
    const skills = window.MoguriaSkills?.skills || [];

    const artifactItems = artifacts.map(a => `<div class="item"><b>${esc((save.dex.artifacts || {})[a.id] ? '✓ ' : '？ ')}${esc(a.name)}</b><small>${esc((save.dex.artifacts || {})[a.id] || 0)}回獲得 / ${esc(asArray(a.tags).join('・'))}</small></div>`).join('');
    const skillItems = skills.map(s => `<div class="item"><b>${esc(save.dex.skills[s.id] ? '✓ ' : '？ ')}${esc(s.name)}</b><small>${esc(save.dex.skills[s.id] || 0)}回食べた / ${esc(asArray(s.tags).join('・'))}</small></div>`).join('');
    const syn = Object.keys(save.dex.synergies || {});
    const titles = Object.keys(save.dex.titles || {});

    overlay('Mogu図鑑', `<h3>アーティファクト</h3><div class="list">${artifactItems}</div><h3>食べ物</h3><div class="list">${skillItems}</div><h3>発見シナジー</h3><div class="list">${syn.length ? syn.map(x => `<div class="item"><b>${esc(x)}</b><small>発見済み</small></div>`).join('') : '<div class="item">まだ未発見。いろいろ食べてみよう。</div>'}</div><h3>二つ名</h3><div class="badges">${titles.length ? badgeList(titles) : '<span class="badge">小さな冒険者</span>'}</div>`);
  }

  function showLogs(){
    const save = window.MoguriaSave.load();
    const html = save.runs && save.runs.length
      ? save.runs.map((r, i) => {
          const artifacts = asArray(r.artifacts).map(a => a?.name || '').filter(Boolean).join(' / ');
          const fusionSkills = asArray(r.skills).filter(s => s?.fusion).map(s => '✦ ' + (s?.name || '')).join(' / ');
          const badges = [
            ...asArray(r.titles),
            ...asArray(r.artifacts).map(a => ' ' + (a?.name || '')),
            ...asArray(r.skills).filter(s => s?.fusion).map(s => '✦ ' + (s?.name || '')),
            ...asArray(r.synergies)
          ].filter(Boolean);
          return `<div class="item"><b>#${esc(save.runs.length - i)} ${esc(r.name || '冒険')}</b><small>${esc(new Date(r.date || Date.now()).toLocaleString())} / Lv.${esc(r.lv || 1)} / ${esc(r.kills || 0)}撃破 / 最大DMG ${esc(r.maxDamage || 0)}</small><small>${esc(artifacts)}</small><small>${esc(fusionSkills)}</small><small>${esc(r.comment || '')}</small><div class="badges">${badgeList(badges)}</div></div>`;
        }).join('')
      : '<div class="item">まだ冒険記録はありません。</div>';
    overlay('冒険記録', `<div class="list">${html}</div>`);
  }

  function showEquipment(){
    const save = window.MoguriaMeta.load();
    const slots = window.MoguriaMeta.equipmentSummary().map(x => `<div class="item equip-slot"><b>${esc(x.label)}</b><small>${x.item ? `${esc(x.item.icon)} ${esc(x.item.name)} Lv.${esc(x.item.level || 1)} / ${esc(window.MoguriaMeta.RARITY_LABELS[x.item.rarity])}` : '未装備'}</small></div>`).join('');
    const inv = save.meta.inventory.length
      ? save.meta.inventory.map(it => `<div class="item equip-item ${rarityClass(it.rarity)}"><b>${esc(it.icon)} ${esc(it.name)} Lv.${esc(it.level || 1)}</b><small>${esc(window.MoguriaMeta.SLOT_LABELS[it.slot])} / ${esc(window.MoguriaMeta.RARITY_LABELS[it.rarity])} / ${esc(it.desc)}</small><div class="row-actions"><button type="button" data-equip="${attr(it.uid)}">装備</button><button type="button" data-upgrade="${attr(it.uid)}">強化</button></div></div>`).join('')
      : '<div class="item">まだ装備はありません。もぐガチャで集めよう。</div>';

    overlay('装備', `<div class="meta-head"><b>MoguCoin ${esc(save.meta.coins || 0)}</b><small>装備は5部位。強化は同じ部位の装備を素材にします。</small></div><h3>装備中</h3><div class="list">${slots}</div><h3>持ちもの</h3><div class="list">${inv}</div>`);

    const body = document.getElementById('overlayBody');
    body.querySelectorAll('[data-equip]').forEach(b => b.onclick = () => { window.MoguriaMeta.equip(b.dataset.equip); showEquipment(); });
    body.querySelectorAll('[data-upgrade]').forEach(b => b.onclick = () => { const res = window.MoguriaMeta.upgrade(b.dataset.upgrade); if (!res.ok) alert(res.message); showEquipment(); });
  }

  function showGacha(){
    const save = window.MoguriaMeta.load();
    const items = window.MoguriaMeta.EQUIPMENT.map(e => `<div class="item ${rarityClass(e.rarity)}"><b>${esc(e.icon)} ${esc(e.name)}</b><small>${esc(window.MoguriaMeta.SLOT_LABELS[e.slot])} / ${esc(window.MoguriaMeta.RARITY_LABELS[e.rarity])} / ${esc(e.desc)}</small></div>`).join('');
    overlay('もぐガチャ', `<div class="meta-head"><b>MoguCoin ${esc(save.meta.coins || 0)}</b><small>1回 ${esc(window.MoguriaMeta.GACHA_COST)} MC。ハズレ装備も強化素材になります。</small></div><button id="pullGachaBtn" class="primary" type="button">1回もぐる</button><div id="gachaResult" class="gacha-result"></div><h3>出るもの</h3><div class="list">${items}</div>`);

    document.getElementById('pullGachaBtn').onclick = () => {
      const res = window.MoguriaMeta.pull();
      const el = document.getElementById('gachaResult');
      if (!res.ok) {
        el.innerHTML = `<div class="item">${esc(res.message)}</div>`;
        return;
      }
      window.MoguriaAudio?.play?.('gacha');
      el.innerHTML = `<div class="gacha-orb ${rarityClass(res.item.rarity)}">✦</div><div class="item ${rarityClass(res.item.rarity)} gacha-pop"><b>${esc(res.item.icon)} ${esc(res.item.name)}</b><small>${esc(res.item.desc)}</small></div>`;
      window.MoguriaHome.update();
    };
  }

  function showOuting(){
    const save = window.MoguriaMeta.load();
    const html = window.MoguriaMeta.CHALLENGES.map(c => `<div class="item challenge"><b>${esc(c.icon)} ${esc(c.name)}</b><small>${esc(c.desc)}</small><small>報酬 ${esc(c.reward)} MC</small><button type="button" data-claim="${attr(c.id)}">報酬を受け取る</button></div>`).join('');
    overlay('おでかけ', `<div class="meta-head"><b>MoguCoin ${esc(save.meta.coins || 0)}</b><small>特殊な遊びと報酬をまとめた入口です。</small></div><div class="list">${html}</div>`);
    document.getElementById('overlayBody').querySelectorAll('[data-claim]').forEach(b => b.onclick = () => { const res = window.MoguriaMeta.claimChallenge(b.dataset.claim); if (!res.ok) alert(res.message); showOuting(); window.MoguriaHome.update(); });
  }

  function init(){
    if (initialized) return;
    initialized = true;

    const againBtn = document.getElementById('againBtn');
    if (againBtn) againBtn.onclick = () => { show('home'); setTimeout(() => document.getElementById('startBtn')?.click(), 100); };

    const homeBtn = document.getElementById('homeBtn');
    if (homeBtn) homeBtn.onclick = () => show('home');

    const closeOverlay = document.getElementById('closeOverlay');
    if (closeOverlay) closeOverlay.onclick = () => document.getElementById('overlay')?.classList.add('hidden');

    const overlayEl = document.getElementById('overlay');
    if (overlayEl) overlayEl.addEventListener('click', e => { if (e.target.id === 'overlay') e.currentTarget.classList.add('hidden'); });
  }

  return { init, show, showResult, showDex, showLogs, showEquipment, showGacha, showOuting };
})();
