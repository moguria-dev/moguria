window.MoguriaHome = (() => {
  let save;
  let initialized = false;
  let recoveryTimer = null;
  let startPending = false;

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
    if (startBtn) startBtn.onclick = () => beginAdventure(startBtn);

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

  async function beginAdventure(startBtn){
    if (startPending) return;

    loadSave();
    const existingRun = save.activeRun || null;
    if (!existingRun && save.belly <= 0) {
      setText('homeLine', 'Mogu、今日はいっぱい食べたみたい…少し休ませてあげよう。');
      $('homeMogu')?.classList.add('idle');
      renderStartButton(startBtn, false, false);
      return;
    }

    startPending = true;
    renderStartButton(startBtn, true, Boolean(existingRun), true);
    let gameOpened = false;
    let adventureStarted = false;
    window.MoguriaUI?.showAdventureLoading?.({ resume: Boolean(existingRun) });

    try {
      window.MoguriaUI?.updateAdventureLoading?.(existingRun
        ? '続きの戦闘データを読み込んでいます…'
        : '戦闘データを読み込んでいます…');
      const loader = window.MoguriaBattleV3Loader;
      if (loader?.prepare) {
        const prepared = await loader.prepare();
        if (prepared?.ok === false) {
          setText('homeLine', '冒険の準備に失敗しました。通信を確認して、もう一度ためしてね。');
          return;
        }
      }

      // startRun consumes belly and creates activeRun in the same save. Passing
      // the stored id resumes an interrupted run without consuming it again.
      window.MoguriaUI?.updateAdventureLoading?.(existingRun
        ? '冒険の記録を確認しています…'
        : '新しい冒険を記録しています…');
      const session = window.MoguriaSave.startRun(existingRun
        ? { runId: existingRun.runId }
        : { engine: 'battle-v3' });

      if (!session?.ok) {
        if (session?.reason === 'no-belly') {
          setText('homeLine', 'Mogu、今日はいっぱい食べたみたい…少し休ませてあげよう。');
        } else if (session?.reason === 'save-failed') {
          setText('homeLine', '冒険の準備を保存できませんでした。もう一度ためしてね。');
        } else {
          setText('homeLine', '冒険を始められませんでした。もう一度ためしてね。');
        }
        return;
      }

      const activeRun = session.activeRun || session.data?.activeRun || existingRun;
      const resume = Boolean(session.reused || existingRun);
      window.MoguriaUI.show('game');
      gameOpened = true;
      window.MoguriaUI?.updateAdventureLoading?.('ダンジョンの入口を開いています…');
      const started = await Promise.resolve(window.MoguriaGame.start({ runId: session.runId, activeRun, resume }));
      if (started === false) {
        window.MoguriaUI.show('home');
        return;
      }
      adventureStarted = true;
    } catch (error) {
      console.warn('[MoguriaHome] battle preparation failed', error);
      if (gameOpened) window.MoguriaUI?.show?.('home');
      setText('homeLine', '冒険の準備に失敗しました。通信を確認して、もう一度ためしてね。');
    } finally {
      startPending = false;
      update();
      if (!adventureStarted) {
        window.MoguriaUI?.updateAdventureLoading?.(document.getElementById('homeLine')?.textContent || '冒険を始められませんでした。もう一度ためしてね。');
        await new Promise(resolve => setTimeout(resolve, 320));
      }
      const battleMode = window.MoguriaGame?.getState?.()?.mode;
      const focusTarget = !adventureStarted ? 'startBtn'
        : battleMode === 'choice' ? 'levelModal'
        : battleMode === 'artifact' ? 'artifactModal'
        : 'pauseBtn';
      window.MoguriaUI?.hideAdventureLoading?.({
        restoreFocus: false,
        focusTarget
      });
    }
  }

  function renderStartButton(btn, canStart, canResume = false, loading = false){
    if (!btn) return;
    const label = btn.querySelector('b');
    const sub = btn.querySelector('small');
    const maxWave = window.MoguriaConfig?.run?.maxWave || 12;
    const buttonLabel = loading ? '読み込み中…' : canResume ? '冒険を続ける' : canStart ? 'ダンジョンへ' : 'Moguを休ませる';
    const buttonSub = loading ? '準備しています' : canResume ? '途中から再開' : canStart ? `Wave ${maxWave}` : 'おなかいっぱい';
    if (label) label.textContent = buttonLabel;
    if (sub) sub.textContent = buttonSub;
    btn.disabled = loading;
    btn.style.filter = canStart || canResume ? 'none' : 'grayscale(.25)';
    btn.setAttribute('aria-disabled', loading || (!canStart && !canResume) ? 'true' : 'false');
    btn.setAttribute('aria-busy', loading ? 'true' : 'false');
    btn.setAttribute('aria-label', loading ? '冒険を読み込み中' : canResume ? '冒険を続ける 途中から再開' : canStart ? `ダンジョンへ Wave ${maxWave}` : 'Moguを休ませる おなかいっぱい');
  }

  function update(){
    loadSave();

    const bellyText = $('bellyText');
    if (bellyText) bellyText.textContent = `${save.belly}/${save.maxBelly}`;

    const bellyBar = $('bellyBar');
    if (bellyBar) bellyBar.style.width = `${Math.max(0, Math.min(100, (save.belly / save.maxBelly) * 100))}%`;

    renderStartButton($('startBtn'), save.belly > 0, Boolean(save.activeRun), startPending);

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
