window.MoguriaHome = (() => {
  let save;
  let initialized = false;
  let recoveryTimer = null;

  const $ = (id) => document.getElementById(id);

  function loadSave(){
    save = window.MoguriaSave.applyTimeRecovery(window.MoguriaSave.load());
    return save;
  }

  function setText(id, text){
    const el = $(id);
    if (el) el.textContent = text;
  }

  function init(){
    if (initialized) return;
    initialized = true;
    loadSave();

    const startBtn = $('startBtn');
    if (startBtn) {
      startBtn.onclick = () => {
        loadSave();
        if (save.belly <= 0) {
          setText('homeLine', 'Mogu、今日はいっぱい食べたみたい…少し休ませてあげよう。');
          $('homeMogu')?.classList.add('idle');
          renderStartButton(startBtn, false);
          return;
        }
        save.belly -= 1;
        save.lastBellyAt = save.lastBellyAt || Date.now();
        window.MoguriaSave.save(save);
        update();
        window.MoguriaUI.show('game');
        window.MoguriaGame.start();
      };
    }

    const snackBtn = $('snackBtn');
    if (snackBtn) {
      snackBtn.onclick = () => {
        loadSave();
        const now = Date.now();
        if (now - (save.snackAt || 0) < 1000 * 60 * 60 * 6) {
          setText('homeLine', 'おやつはさっき食べたみたい。今はすやすやしてる。');
        } else {
          save.snackAt = now;
          save.belly = Math.min(save.maxBelly, save.belly + 1);
          window.MoguriaSave.save(save);
          setText('homeLine', 'おやつをもぐもぐ。少し元気になったみたい。');
        }
        update();
      };
    }

    const dexBtn = $('dexBtn');
    if (dexBtn) dexBtn.onclick = () => window.MoguriaUI.showDex();
    const logsBtn = $('logsBtn');
    if (logsBtn) logsBtn.onclick = () => window.MoguriaUI.showLogs();
    const equipBtn = $('equipBtn');
    if (equipBtn) equipBtn.onclick = () => window.MoguriaUI.showEquipment();
    const gachaBtn = $('gachaBtn');
    if (gachaBtn) gachaBtn.onclick = () => window.MoguriaUI.showGacha();
    const outingBtn = $('outingBtn');
    if (outingBtn) outingBtn.onclick = () => window.MoguriaUI.showOuting();

    update();
    if (!recoveryTimer) {
      recoveryTimer = setInterval(() => {
        loadSave();
        update();
      }, 30000);
    }
  }

  function renderStartButton(btn, canStart){
    if (!btn) return;
    const label = btn.querySelector('b');
    const sub = btn.querySelector('small');
    if (label) label.textContent = canStart ? 'ダンジョンへ' : 'Moguを休ませる';
    if (sub) sub.textContent = canStart ? `Wave ${window.MoguriaConfig?.run?.maxWave || 12}` : 'おなかいっぱい';
    btn.style.filter = canStart ? 'none' : 'grayscale(.25)';
    btn.setAttribute('aria-disabled', canStart ? 'false' : 'true');
    btn.setAttribute('aria-label', canStart ? `ダンジョンへ Wave ${window.MoguriaConfig?.run?.maxWave || 12}` : 'Moguを休ませる おなかいっぱい');
  }

  function update(){
    loadSave();

    const bellyText = $('bellyText');
    if (bellyText) bellyText.textContent = `${save.belly}/${save.maxBelly}`;

    const bellyBar = $('bellyBar');
    if (bellyBar) bellyBar.style.width = `${Math.max(0, Math.min(100, (save.belly / save.maxBelly) * 100))}%`;

    renderStartButton($('startBtn'), save.belly > 0);

    const coinEl = $('coinText');
    if (coinEl) {
      const meta = (window.MoguriaMeta ? window.MoguriaMeta.load() : save).meta || {};
      coinEl.textContent = `MoguCoin ${meta.coins || 0}`;
    }

    const last = save.runs && save.runs[0];
    if (last) applyVisual($('homeMogu'), last.visual);
  }

  function applyVisual(el, visual = {}){
    if (!el) return;
    el.classList.remove('poison', 'fire', 'ice', 'guard', 'summon');
    const entries = Object.entries(visual || {}).filter(([, value]) => Number(value) > 0);
    const top = entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    if (top && top[1] > 0) el.classList.add(top[0]);
  }

  return { init, update, applyVisual };
})();
