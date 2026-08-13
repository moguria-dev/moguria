window.MoguriaUI = (() => {
  let initialized = false;
  let lastFocused = null;
  let noticeTimer = 0;
  let confirmRequest = null;
  let loadingFocused = null;
  let blockedAppState = null;

  const ENTITY = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ENTITY[ch]);
  const attr = esc;
  const asArray = (value) => Array.isArray(value) ? value : [];

  function canFocus(element){
    return Boolean(element && typeof element.focus === 'function');
  }

  function rememberFocusedElement(){
    const active = document.activeElement;
    return canFocus(active) ? active : null;
  }

  function overlayIsOpen(id){
    const element = document.getElementById(id);
    return Boolean(element && !element.classList.contains('hidden'));
  }

  function blockApplication(){
    const app = document.getElementById('app');
    if (!app || blockedAppState) return;
    blockedAppState = {
      inert: Boolean(app.inert || app.hasAttribute?.('inert')),
      ariaHidden: app.getAttribute?.('aria-hidden')
    };
    app.inert = true;
    app.setAttribute?.('inert', '');
    app.setAttribute?.('aria-hidden', 'true');
  }

  function releaseApplicationIfClear(){
    if (overlayIsOpen('confirmDialog') || overlayIsOpen('adventureLoading')) return;
    const app = document.getElementById('app');
    const previous = blockedAppState;
    blockedAppState = null;
    if (!app || !previous) return;
    app.inert = previous.inert;
    if (previous.inert) app.setAttribute?.('inert', '');
    else app.removeAttribute?.('inert');
    if (previous.ariaHidden == null) app.removeAttribute?.('aria-hidden');
    else app.setAttribute?.('aria-hidden', previous.ariaHidden);
  }

  function setDialogText(id, value){
    const element = document.getElementById(id);
    if (element) element.textContent = String(value ?? '');
  }

  function closeConfirmDialog(accepted){
    const request = confirmRequest;
    if (!request) return;
    confirmRequest = null;
    const dialog = document.getElementById('confirmDialog');
    if (dialog) dialog.classList.add('hidden');
    releaseApplicationIfClear();
    if (!accepted && canFocus(request.focused) && request.focused.isConnected !== false) request.focused.focus();
    else document.body?.focus?.();
    request.resolve(Boolean(accepted));
  }

  function confirmAction(options = {}){
    const dialog = document.getElementById('confirmDialog');
    const cancelButton = document.getElementById('confirmCancelBtn');
    const acceptButton = document.getElementById('confirmAcceptBtn');
    if (!dialog || !cancelButton || !acceptButton || confirmRequest) return Promise.resolve(false);

    const focused = rememberFocusedElement();
    setDialogText('confirmDialogEyebrow', options.eyebrow || 'CONFIRM');
    setDialogText('confirmDialogTitle', options.title || '確認');
    setDialogText('confirmDialogMessage', options.message || 'この操作を続けますか？');
    cancelButton.textContent = options.cancelLabel || 'やめる';
    acceptButton.textContent = options.confirmLabel || '続ける';
    dialog.dataset.tone = options.tone === 'danger' ? 'danger' : 'normal';
    dialog.classList.remove('hidden');
    blockApplication();

    return new Promise(resolve => {
      confirmRequest = { resolve, focused };
      cancelButton.onclick = () => closeConfirmDialog(false);
      acceptButton.onclick = () => closeConfirmDialog(true);
      requestAnimationFrame(() => cancelButton.focus());
    });
  }

  function showAdventureLoading(options = {}){
    const loading = document.getElementById('adventureLoading');
    const card = document.getElementById('adventureLoadingCard');
    if (!loading) return;
    if (loading.classList.contains('hidden')) loadingFocused = rememberFocusedElement();
    setDialogText('adventureLoadingTitle', options.title || (options.resume ? '冒険を再開中' : '冒険の準備中'));
    setDialogText('adventureLoadingCost', options.resume ? '続きから再開・おなか消費なし' : '新しい冒険・おなか 1消費');
    setDialogText('adventureLoadingStatus', options.message || (options.resume
      ? '続きの冒険を読み込んでいます…'
      : '戦闘データを読み込んでいます…'));
    loading.setAttribute('aria-busy', 'true');
    loading.classList.remove('hidden');
    blockApplication();
    requestAnimationFrame(() => card?.focus?.());
  }

  function updateAdventureLoading(message){
    setDialogText('adventureLoadingStatus', message);
  }

  function hideAdventureLoading(options = {}){
    const loading = document.getElementById('adventureLoading');
    if (loading) {
      loading.classList.add('hidden');
      loading.setAttribute('aria-busy', 'false');
    }
    releaseApplicationIfClear();
    const restore = loadingFocused;
    loadingFocused = null;
    if (options.focusTarget) {
      document.getElementById(options.focusTarget)?.focus?.();
    } else if (options.restoreFocus !== false && canFocus(restore) && restore.isConnected !== false) {
      restore.focus();
    }
  }

  function trapSystemDialogFocus(event, container){
    if (event.key !== 'Tab' || !container) return;
    const nodes = typeof container.querySelectorAll === 'function'
      ? [...container.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(canFocus)
      : [];
    if (!nodes.length) {
      event.preventDefault();
      container.focus?.();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const META_VIEWS = {
    dex: {
      title: 'Mogu図鑑',
      eyebrow: 'COLLECTION',
      subtitle: '見つけた光を、ここに残そう。',
      icon: 'assets/images/home-v2/icon_dex.png'
    },
    logs: {
      title: '冒険記録',
      eyebrow: 'JOURNEY LOG',
      subtitle: '小さな一歩も、星の記憶になる。',
      icon: 'assets/images/home-v2/icon_logs.png'
    },
    equipment: {
      title: '装備',
      eyebrow: 'WARDROBE',
      subtitle: '見つけた力を、Moguに結ぼう。',
      icon: 'assets/images/home-v2/icon_equip.png'
    },
    gacha: {
      title: 'もぐガチャ',
      eyebrow: 'STAR WELL',
      subtitle: '星の泉へ、ひとつ光を預けよう。',
      icon: 'assets/images/home-v2/icon_gacha.png'
    },
    outing: {
      title: 'おでかけ',
      eyebrow: 'EXPEDITION',
      subtitle: '今夜は、どの光を探しにいく？',
      icon: 'assets/images/home-v2/icon_outing.png'
    }
  };

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

  function coinMark(value, id = ''){
    return `<span class="meta-coin"${id ? ` id="${attr(id)}"` : ''}><img src="assets/images/home-v2/currency_coin.png" alt="" /><span>MoguCoin</span><b>${esc(value || 0)}</b></span>`;
  }

  function overlay(view, html){
    const config = META_VIEWS[view] || META_VIEWS.dex;
    const titleEl = document.getElementById('overlayTitle');
    const eyebrowEl = document.getElementById('overlayEyebrow');
    const subtitleEl = document.getElementById('overlaySubtitle');
    const iconEl = document.getElementById('overlayIcon');
    const bodyEl = document.getElementById('overlayBody');
    const overlayEl = document.getElementById('overlay');
    const noticeEl = document.getElementById('metaNotice');
    if (!titleEl || !bodyEl || !overlayEl) return;

    if (overlayEl.classList.contains('hidden')) lastFocused = rememberFocusedElement();
    titleEl.textContent = config.title;
    if (eyebrowEl) eyebrowEl.textContent = config.eyebrow;
    if (subtitleEl) subtitleEl.textContent = config.subtitle;
    if (iconEl) iconEl.src = config.icon;
    bodyEl.innerHTML = html;
    bodyEl.scrollTop = 0;
    overlayEl.dataset.view = view;
    overlayEl.classList.remove('hidden');
    if (noticeEl) {
      noticeEl.hidden = true;
      noticeEl.textContent = '';
      noticeEl.removeAttribute('data-tone');
    }
    requestAnimationFrame(() => document.getElementById('closeOverlay')?.focus());
  }

  function closeMetaOverlay(){
    const overlayEl = document.getElementById('overlay');
    if (!overlayEl || overlayEl.classList.contains('hidden')) return;
    overlayEl.classList.add('hidden');
    delete overlayEl.dataset.view;
    if (lastFocused?.isConnected) lastFocused.focus();
  }

  function showNotice(message, tone = 'info'){
    const noticeEl = document.getElementById('metaNotice');
    if (!noticeEl) return;
    window.clearTimeout(noticeTimer);
    noticeEl.textContent = message;
    noticeEl.dataset.tone = tone;
    noticeEl.hidden = false;
    noticeTimer = window.setTimeout(() => { noticeEl.hidden = true; }, 2800);
  }

  function rarityClass(r){
    return 'rarity-' + attr(r || 'common');
  }

  function rarityName(r){
    return window.MoguriaMeta?.RARITY_LABELS?.[r] || String(r || 'C').toUpperCase();
  }

  function emptyState(icon, title, text){
    return `<div class="meta-empty"><span aria-hidden="true">${esc(icon)}</span><b>${esc(title)}</b><p>${esc(text)}</p></div>`;
  }

  function formatRunDate(value){
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '日時不明';
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
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
    const artifactCount = artifacts.filter(a => (save.dex.artifacts || {})[a.id]).length;
    const skillCount = skills.filter(s => (save.dex.skills || {})[s.id]).length;
    const discovered = artifactCount + skillCount;
    const total = artifacts.length + skills.length;
    const progress = total ? Math.round(discovered / total * 100) : 0;
    const syn = Object.keys(save.dex.synergies || {});
    const titles = Object.keys(save.dex.titles || {});

    overlay('dex', `
      <section class="meta-dex__progress">
        <div class="meta-dex__progress-copy">
          <span>発見のきろく</span>
          <b>${discovered}<small> / ${total}</small></b>
        </div>
        <div class="meta-progress" aria-label="図鑑完成度 ${progress}%"><i style="width:${progress}%"></i></div>
        <strong>${progress}%</strong>
      </section>
      <nav class="meta-tabs" role="tablist" aria-label="図鑑の分類">
        <button type="button" role="tab" data-dex-tab="artifacts" aria-selected="true">遺物 <b>${artifactCount}</b></button>
        <button type="button" role="tab" data-dex-tab="foods" aria-selected="false">食べもの <b>${skillCount}</b></button>
        <button type="button" role="tab" data-dex-tab="synergies" aria-selected="false">シナジー <b>${syn.length}</b></button>
        <button type="button" role="tab" data-dex-tab="titles" aria-selected="false">二つ名 <b>${titles.length}</b></button>
      </nav>
      <section id="dexContent" class="meta-dex__content" role="tabpanel"></section>
    `);

    const content = document.getElementById('dexContent');
    const renderEntries = (entries, counts, unit) => `
      <div class="meta-dex-grid">
        ${entries.map(entry => {
          const count = Number(counts[entry.id] || 0);
          const found = count > 0;
          const tags = asArray(entry.tags).slice(0, 2).map(tag => `<span>${esc(tag)}</span>`).join('');
          return `<article class="meta-dex-card ${found ? 'is-found' : 'is-unknown'}">
            <div class="meta-dex-card__icon" aria-hidden="true">${found ? esc(entry.icon || '✦') : '？'}</div>
            <div class="meta-dex-card__copy">
              <small>${found ? `${count}${unit}` : '未発見'}</small>
              <b>${esc(entry.name)}</b>
              <div>${tags}</div>
            </div>
          </article>`;
        }).join('')}
      </div>
    `;

    const panes = {
      artifacts: () => renderEntries(artifacts, save.dex.artifacts || {}, '回獲得'),
      foods: () => renderEntries(skills, save.dex.skills || {}, '回食べた'),
      synergies: () => syn.length
        ? `<div class="meta-discovery-list">${syn.map(name => `<div><span>✦</span><b>${esc(name)}</b><small>発見済み</small></div>`).join('')}</div>`
        : emptyState('✧', 'まだ見つかっていません', '組み合わせを変えて、力のつながりを探してみよう。'),
      titles: () => titles.length
        ? `<div class="meta-title-list">${titles.map(name => `<span>${esc(name)}</span>`).join('')}</div>`
        : emptyState('☆', '最初の二つ名を待っています', '冒険のしかたが、やがてMoguの名前になります。')
    };

    const selectTab = (tab) => {
      document.querySelectorAll('[data-dex-tab]').forEach(button => {
        const selected = button.dataset.dexTab === tab;
        button.setAttribute('aria-selected', selected ? 'true' : 'false');
        button.tabIndex = selected ? 0 : -1;
      });
      if (content) {
        content.innerHTML = (panes[tab] || panes.artifacts)();
      }
    };

    document.querySelectorAll('[data-dex-tab]').forEach(button => {
      button.onclick = () => selectTab(button.dataset.dexTab);
    });
    selectTab('artifacts');
  }

  function showLogs(){
    const save = window.MoguriaSave.load();
    const runs = asArray(save.runs);
    const best = save.best || {};
    const html = runs.length
      ? runs.map((run, index) => {
          const artifacts = asArray(run.artifacts).map(a => a?.name || '').filter(Boolean);
          const fusionSkills = asArray(run.skills).filter(s => s?.fusion).map(s => '✦ ' + (s?.name || ''));
          const badges = [
            ...asArray(run.titles),
            ...asArray(run.synergies),
            ...artifacts,
            ...fusionSkills
          ].filter(Boolean);
          return `
            <article class="meta-log-card">
              <div class="meta-log-card__index"><span>#</span>${esc(runs.length - index)}</div>
              <div class="meta-log-card__main">
                <header>
                  <div><small>${esc(formatRunDate(run.date))}</small><h3>${esc(run.name || 'もぐもぐの旅')}</h3></div>
                  <span>Lv.${esc(run.lv || 1)}</span>
                </header>
                <div class="meta-log-card__stats">
                  <span><b>${esc(run.floor || run.wave || 1)}</b>到達</span>
                  <span><b>${esc(run.kills || 0)}</b>撃破</span>
                  <span><b>${esc(run.maxDamage || 0)}</b>最大DMG</span>
                </div>
                <p>${esc(run.comment || '今日の冒険を、星が静かに覚えています。')}</p>
                ${badges.length ? `<details class="meta-log-card__details"><summary>見つけた力 <b>${badges.length}</b></summary><div class="meta-chip-list">${badgeList(badges)}</div></details>` : ''}
              </div>
            </article>
          `;
        }).join('')
      : emptyState('✦', '最初の冒険を待っています', 'ダンジョンから帰ると、ここに旅の記憶が残ります。');

    overlay('logs', `
      <section class="meta-log-summary">
        <div><small>冒険した回数</small><b>${runs.length}</b></div>
        <div><small>最高到達</small><b>${esc(best.floor || 0)}<em>階</em></b></div>
        <div><small>最高ダメージ</small><b>${esc(best.damage || 0)}</b></div>
      </section>
      <section class="meta-section-head"><div><span>JOURNEYS</span><h3>星に残った足あと</h3></div><small>新しい順</small></section>
      <div class="meta-log-list">${html}</div>
    `);
  }

  function showEquipment(){
    const save = window.MoguriaMeta.load();
    const summary = window.MoguriaMeta.equipmentSummary();
    const equippedUids = new Set(summary.map(entry => entry.item?.uid).filter(Boolean));
    const equippedCount = summary.filter(entry => entry.item).length;
    const slots = summary.map(entry => `
      <div class="meta-equip-slot ${entry.item ? 'is-filled' : ''}">
        <span aria-hidden="true">${esc(entry.item?.icon || '✦')}</span>
        <small>${esc(entry.label)}</small>
        <b>${entry.item ? `Lv.${esc(entry.item.level || 1)}` : '未装備'}</b>
      </div>
    `).join('');
    const inventory = save.meta.inventory.length
      ? save.meta.inventory.map(item => {
          const equipped = equippedUids.has(item.uid);
          return `
            <article class="meta-equip-item ${rarityClass(item.rarity)} ${equipped ? 'is-equipped' : ''}">
              <div class="meta-equip-item__icon" aria-hidden="true">${esc(item.icon)}</div>
              <div class="meta-equip-item__copy">
                <div><span>${esc(rarityName(item.rarity))}</span><small>${esc(window.MoguriaMeta.SLOT_LABELS[item.slot])}</small></div>
                <h3>${esc(item.name)}</h3>
                <p>${esc(item.desc)}</p>
              </div>
              <strong>Lv.${esc(item.level || 1)}</strong>
              <div class="meta-equip-item__actions">
                <button type="button" data-equip="${attr(item.uid)}" ${equipped ? 'disabled' : ''}>${equipped ? '装備中' : '装備する'}</button>
                <button type="button" data-upgrade="${attr(item.uid)}" aria-label="${attr(item.name)}を強化">強化</button>
              </div>
            </article>
          `;
        }).join('')
      : emptyState('◇', '持ちものはまだ空っぽ', 'もぐガチャで、最初の装備を見つけよう。');

    overlay('equipment', `
      <section class="meta-equip-stage">
        <div class="meta-equip-stage__copy">
          <small>装備中</small>
          <b>${equippedCount}<span> / ${summary.length}</span></b>
          <p>小さな力も、組み合わせれば旅の個性になる。</p>
        </div>
        <div class="meta-equip-stage__mogu" aria-hidden="true">
          <i></i>
          <img src="assets/images/home-v2/mogu_home_idle.png" alt="" />
        </div>
        <div class="meta-equip-stage__wallet">${coinMark(save.meta.coins || 0)}</div>
      </section>
      <section class="meta-equip-slots" aria-label="装備部位">${slots}</section>
      <section class="meta-section-head"><div><span>INVENTORY</span><h3>持ちもの</h3></div><small>${save.meta.inventory.length}個</small></section>
      <div class="meta-equip-list">${inventory}</div>
    `);

    const body = document.getElementById('overlayBody');
    body.querySelectorAll('[data-equip]').forEach(button => {
      button.onclick = () => {
        const item = window.MoguriaMeta.equip(button.dataset.equip);
        if (!item) {
          showNotice('装備が見つかりませんでした。', 'error');
          return;
        }
        showEquipment();
        showNotice(`「${item.name}」を装備しました。`, 'success');
      };
    });
    body.querySelectorAll('[data-upgrade]').forEach(button => {
      button.onclick = async () => {
        const preview = window.MoguriaMeta.upgradePreview?.(button.dataset.upgrade);
        if (!preview?.ok) {
          showNotice(preview?.message || '強化に必要な素材を確認できませんでした。', 'error');
          return;
        }
        const currentLevel = Math.max(1, Number(preview.item.level) || 1);
        const materialLevel = Math.max(1, Number(preview.material.level) || 1);
        const equippedNote = preview.materialEquipped ? '\n装備中の素材は外れます。' : '';
        const accepted = await confirmAction({
          eyebrow: 'EQUIPMENT UPGRADE',
          title: '装備を強化する？',
          message: `「${preview.item.name}」をLv.${currentLevel + 1}へ強化します。\n素材として「${preview.material.name}」Lv.${materialLevel}を消費します。素材は元に戻せません。${equippedNote}`,
          confirmLabel: '素材を使って強化',
          cancelLabel: 'やめる',
          tone: 'danger'
        });
        if (!accepted) return;
        const res = window.MoguriaMeta.upgrade(button.dataset.upgrade, preview.material.uid, {
          targetLevel: currentLevel,
          materialLevel,
          materialEquipped: preview.materialEquipped
        });
        if (!res.ok) {
          showNotice(res.message, 'error');
          requestAnimationFrame(() => button.focus?.());
          return;
        }
        showEquipment();
        showNotice(`「${res.item.name}」がLv.${res.item.level}になりました。`, 'success');
        requestAnimationFrame(() => {
          const nextButton = [...document.querySelectorAll('[data-upgrade]')]
            .find(candidate => candidate.dataset.upgrade === res.item.uid);
          nextButton?.focus?.();
        });
      };
    });
  }

  function showGacha(){
    const save = window.MoguriaMeta.load();
    const items = window.MoguriaMeta.EQUIPMENT.map(item => `
      <article class="meta-gacha-item ${rarityClass(item.rarity)}">
        <span class="meta-gacha-item__rarity">${esc(rarityName(item.rarity))}</span>
        <div aria-hidden="true">${esc(item.icon)}</div>
        <b>${esc(item.name)}</b>
        <small>${esc(window.MoguriaMeta.SLOT_LABELS[item.slot])}</small>
      </article>
    `).join('');

    overlay('gacha', `
      <section class="meta-gacha-altar">
        <div class="meta-gacha-altar__stars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        <div class="meta-gacha-altar__machine" aria-hidden="true"><span></span><img src="assets/images/home-v2/icon_gacha.png" alt="" /></div>
        <p>深い泉へ光を預けると、<br />旅を助ける装備がひとつ浮かびます。</p>
        ${coinMark(save.meta.coins || 0, 'metaCoinValue')}
      </section>
      <section class="meta-gacha-action">
        <div><small>1回</small><b>${window.MoguriaMeta.GACHA_COST}<span> MC</span></b></div>
        <button id="pullGachaBtn" class="meta-primary" type="button"><span>星の泉にもぐる</span><small>装備をひとつ見つける</small></button>
      </section>
      <div id="gachaResult" class="meta-gacha-result" role="status" aria-live="polite"></div>
      <section class="meta-section-head"><div><span>DISCOVERIES</span><h3>泉から出るもの</h3></div><small>C · R · E</small></section>
      <div class="meta-gacha-grid">${items}</div>
    `);

    const pullButton = document.getElementById('pullGachaBtn');
    let pulling = false;
    pullButton.onclick = () => {
      if (pulling) return;
      pulling = true;
      pullButton.disabled = true;
      const res = window.MoguriaMeta.pull();
      const resultEl = document.getElementById('gachaResult');
      if (!res.ok) {
        showNotice(res.message, 'error');
        resultEl.innerHTML = `<div class="meta-gacha-result__message">星の泉は、もう少しMoguCoinを待っているみたい。</div>`;
        pulling = false;
        pullButton.disabled = false;
        return;
      }
      window.MoguriaAudio?.play?.('gacha');
      resultEl.innerHTML = `
        <article class="meta-gacha-reveal ${rarityClass(res.item.rarity)}">
          <span class="meta-gacha-reveal__light" aria-hidden="true"></span>
          <small>${esc(rarityName(res.item.rarity))} · NEW EQUIPMENT</small>
          <div aria-hidden="true">${esc(res.item.icon)}</div>
          <h3>${esc(res.item.name)}</h3>
          <p>${esc(res.item.desc)}</p>
        </article>
      `;
      const coinEl = document.getElementById('metaCoinValue');
      if (coinEl) coinEl.querySelector('b').textContent = res.coins;
      resultEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.MoguriaHome.update();
      window.setTimeout(() => {
        pulling = false;
        pullButton.disabled = false;
      }, 760);
    };
  }

  function showOuting(){
    const save = window.MoguriaMeta.load();
    const claimed = save.meta.claimedChallenges || {};
    const today = new Date().toISOString().slice(0, 10);
    const typeLabels = { daily: '日替わり', once: '一度きり', idle: '遠征' };
    const isClaimed = challenge => {
      const key = challenge.type === 'daily' ? today : challenge.id;
      return Boolean(claimed[challenge.id + ':' + key]);
    };
    const completed = window.MoguriaMeta.CHALLENGES.filter(isClaimed).length;
    const cards = window.MoguriaMeta.CHALLENGES.map((challenge, index) => {
      const done = isClaimed(challenge);
      return `
        <article class="meta-outing-card meta-outing-card--${index + 1} ${done ? 'is-complete' : ''}">
          <span class="meta-outing-card__number">0${index + 1}</span>
          <div class="meta-outing-card__icon" aria-hidden="true">${esc(challenge.icon)}</div>
          <div class="meta-outing-card__copy">
            <small>${esc(typeLabels[challenge.type] || 'おでかけ')}</small>
            <h3>${esc(challenge.name)}</h3>
            <p>${esc(challenge.desc)}</p>
            <span class="meta-outing-card__reward"><img src="assets/images/home-v2/currency_coin.png" alt="" />${esc(challenge.reward)} MC</span>
          </div>
          <button type="button" ${done ? 'disabled' : `data-claim="${attr(challenge.id)}"`}>
            <span>${done ? '受け取り済み' : '報酬を受け取る'}</span>
          </button>
        </article>
      `;
    }).join('');

    overlay('outing', `
      <section class="meta-outing-map">
        <div class="meta-outing-map__copy"><small>今夜の行き先</small><b>3つの光が<br />Moguを待っています。</b></div>
        <img src="assets/images/home-v2/expedition_mogu.png" alt="" />
        <div class="meta-outing-map__status"><span>完了</span><b>${completed} / ${window.MoguriaMeta.CHALLENGES.length}</b></div>
      </section>
      <div class="meta-outing-wallet">${coinMark(save.meta.coins || 0)}</div>
      <section class="meta-outing-list">${cards}</section>
    `);

    document.getElementById('overlayBody').querySelectorAll('[data-claim]').forEach(button => {
      button.onclick = () => {
        const res = window.MoguriaMeta.claimChallenge(button.dataset.claim);
        if (!res.ok) {
          showNotice(res.message, 'error');
          return;
        }
        showOuting();
        showNotice(`${res.amount} MoguCoinを受け取りました。`, 'success');
        window.MoguriaHome.update();
      };
    });
  }

  function init(){
    if (initialized) return;
    initialized = true;

    const againBtn = document.getElementById('againBtn');
    if (againBtn) againBtn.onclick = () => { show('home'); setTimeout(() => document.getElementById('startBtn')?.click(), 100); };

    const homeBtn = document.getElementById('homeBtn');
    if (homeBtn) homeBtn.onclick = () => show('home');

    const closeOverlay = document.getElementById('closeOverlay');
    if (closeOverlay) closeOverlay.onclick = closeMetaOverlay;

    const overlayEl = document.getElementById('overlay');
    if (overlayEl) overlayEl.addEventListener('click', event => {
      if (event.target.id === 'overlay') closeMetaOverlay();
    });

    document.addEventListener('keydown', event => {
      const confirmDialog = document.getElementById('confirmDialog');
      if (confirmRequest && confirmDialog && !confirmDialog.classList.contains('hidden')) {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeConfirmDialog(false);
        } else trapSystemDialogFocus(event, confirmDialog);
        return;
      }
      const loading = document.getElementById('adventureLoading');
      if (loading && !loading.classList.contains('hidden')) {
        if (event.key === 'Escape' || event.key === 'Tab') event.preventDefault();
        document.getElementById('adventureLoadingCard')?.focus?.();
        return;
      }
      if (event.key === 'Escape') closeMetaOverlay();
    });
  }

  return {
    init, show, showResult, showDex, showLogs, showEquipment, showGacha, showOuting,
    confirmAction, showAdventureLoading, updateAdventureLoading, hideAdventureLoading
  };
})();
