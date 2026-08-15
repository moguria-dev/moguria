window.MoguriaHome = (() => {
  let save;
  let initialized = false;
  let recoveryTimer = null;
  let homeNoticeTimer = null;
  let startPending = false;
  let adventureErrorKeysBound = false;

  const $ = (id) => document.getElementById(id);

  function loadSave(){
    save = window.MoguriaSave.applyTimeRecovery(window.MoguriaSave.load());
    return save;
  }

  function setText(id, text){
    const el = $(id);
    if (el) el.textContent = text;
  }

  function showHomeNotice(message, { error = false, persistent = false } = {}){
    const notice = $('homeNotice');
    if (!notice) return;
    if (homeNoticeTimer) clearTimeout(homeNoticeTimer);
    homeNoticeTimer = null;
    notice.textContent = String(message || '');
    notice.dataset.tone = error ? 'error' : 'info';
    notice.setAttribute('role', error ? 'alert' : 'status');
    notice.hidden = !message;
    if (message && !persistent) {
      homeNoticeTimer = setTimeout(() => {
        notice.hidden = true;
        homeNoticeTimer = null;
      }, 4600);
    }
  }

  function resetAdventureError(){
    const loading = $('adventureLoading');
    const actions = $('adventureLoadingActions');
    const progress = $('adventureLoadingProgress');
    const hint = $('adventureLoadingHint');
    if (loading) {
      loading.dataset.state = 'loading';
      loading.dataset.loadingState = 'loading';
    }
    progress?.setAttribute?.('aria-busy', 'true');
    if (actions) actions.hidden = true;
    if (hint) hint.textContent = 'そのまま少し待ってね';
  }

  function showAdventureError(message){
    const loading = $('adventureLoading');
    const actions = $('adventureLoadingActions');
    const progress = $('adventureLoadingProgress');
    const hint = $('adventureLoadingHint');
    if (!loading) return;
    const failurePhase = message || '通信と空き容量を確認して、もう一度ためしてね。';
    if (typeof window.MoguriaUI?.errorAdventureLoading === 'function') {
      window.MoguriaUI.errorAdventureLoading({
        title:'冒険を始められませんでした',
        phase:failurePhase
      });
    } else {
      setText('adventureLoadingTitle', '冒険を始められませんでした');
      setText('adventureLoadingStatus', failurePhase);
      window.MoguriaUI?.updateAdventureLoading?.({ stopWaiting:true, busy:false });
    }
    loading.dataset.state = 'error';
    loading.dataset.loadingState = 'error';
    progress?.setAttribute?.('aria-busy', 'false');
    setText('adventureLoadingCost', 'おなかは追加で消費されません');
    if (hint) hint.textContent = 'この案内は操作するまで消えません';
    if (actions) actions.hidden = false;
    window.requestAnimationFrame?.(() => $('adventureRetryBtn')?.focus?.());
  }

  function closeAdventureError(focusTarget = '', endSession = false){
    resetAdventureError();
    window.MoguriaUI?.hideAdventureLoading?.({
      restoreFocus: false,
      focusTarget,
      endSession
    });
  }

  function bindAdventureErrorActions(){
    const retry = $('adventureRetryBtn');
    if (retry) retry.onclick = () => {
      closeAdventureError();
      void beginAdventure($('startBtn'));
    };
    const home = $('adventureHomeBtn');
    if (home) home.onclick = () => {
      closeAdventureError('startBtn', true);
      window.MoguriaUI?.show?.('home');
    };
    if (adventureErrorKeysBound || typeof document.addEventListener !== 'function') return;
    adventureErrorKeysBound = true;
    document.addEventListener('keydown', event => {
      const loading = $('adventureLoading');
      if (!loading || loading.dataset.state !== 'error' || loading.classList.contains('hidden')) return;
      if (event.key !== 'Tab' && event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation?.();
      const first = $('adventureRetryBtn');
      const last = $('adventureHomeBtn');
      if (event.key === 'Escape') {
        first?.focus?.();
        return;
      }
      const active = document.activeElement;
      const next = event.shiftKey
        ? (active === first ? last : first)
        : (active === last ? first : last);
      next?.focus?.();
    }, true);
  }

  function battleLoadingMessage(progress = {}, existingRun = false){
    switch (progress.phase) {
      case 'scripts': return '冒険の道具をそろえています…';
      case 'assets': return 'ダンジョンの景色を読み込んでいます…';
      case 'renderer': return '星灯りをともしています…';
      case 'ready': return existingRun ? '続きの冒険を開いています…' : '冒険の入口を整えています…';
      default: return existingRun
        ? '続きの戦闘データを読み込んでいます…'
        : '戦闘データを読み込んでいます…';
    }
  }

  function battleLoadingPercent(progress = {}){
    const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
    return 2 + percent * .84;
  }

  function nextVisibleFrame(){
    if (typeof window.requestAnimationFrame !== 'function') return Promise.resolve();
    return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
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
          showHomeNotice('おやつはさっき食べたみたい。今はすやすやしてる。');
        } else {
          save.snackAt = now;
          save.belly = Math.min(save.maxBelly, save.belly + 1);
          const saved = window.MoguriaSave.save(save);
          if (saved?.ok === false) {
            showHomeNotice('おやつの記録を保存できませんでした。空き容量を確認して、もう一度ためしてね。', { error: true, persistent: true });
          } else {
            showHomeNotice('おやつをもぐもぐ。少し元気になったみたい。');
          }
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

    bindAdventureErrorActions();

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
      showHomeNotice('Mogu、今日はいっぱい食べたみたい…少し休ませてあげよう。');
      $('homeMogu')?.classList.add('idle');
      renderStartButton(startBtn, false, false);
      return;
    }

    startPending = true;
    renderStartButton(startBtn, true, Boolean(existingRun), true);
    let gameOpened = false;
    let adventureStarted = false;
    let failureMessage = '';
    resetAdventureError();
    window.MoguriaUI?.showAdventureLoading?.({ resume: Boolean(existingRun), percent:2 });

    try {
      window.MoguriaUI?.updateAdventureLoading?.({
        message:existingRun
          ? '続きの戦闘データを読み込んでいます…'
          : '戦闘データを読み込んでいます…',
        percent:2
      });
      const loader = window.MoguriaBattleV3Loader;
      if (loader?.prepare) {
        const prepared = await loader.prepare({
          onProgress(progress = {}) {
            window.MoguriaUI?.updateAdventureLoading?.({
              message:battleLoadingMessage(progress, Boolean(existingRun)),
              percent:battleLoadingPercent(progress)
            });
          }
        });
        if (prepared?.ok === false) {
          failureMessage = '冒険の準備に失敗しました。通信を確認して、もう一度ためしてね。';
          return;
        }
      }
      window.MoguriaUI?.updateAdventureLoading?.({
        message:existingRun ? '続きの冒険を確認しています…' : '冒険の道具がそろいました',
        percent:86
      });

      // startRun consumes belly and creates activeRun in the same save. Passing
      // the stored id resumes an interrupted run without consuming it again.
      window.MoguriaUI?.updateAdventureLoading?.({
        message:existingRun
          ? '冒険の記録を確認しています…'
          : '新しい冒険を記録しています…',
        percent:86
      });
      const session = window.MoguriaSave.startRun(existingRun
        ? { runId: existingRun.runId }
        : { engine: 'battle-v3' });

      if (!session?.ok) {
        if (session?.reason === 'no-belly') {
          failureMessage = 'Mogu、今日はいっぱい食べたみたい…少し休ませてあげよう。';
        } else if (session?.reason === 'save-failed') {
          failureMessage = '冒険の準備を保存できませんでした。空き容量を確認して、もう一度ためしてね。';
        } else {
          failureMessage = '冒険を始められませんでした。もう一度ためしてね。';
        }
        return;
      }

      window.MoguriaUI?.updateAdventureLoading?.({
        message:existingRun ? '冒険の記録を確認しました' : '新しい冒険を記録しました',
        percent:90
      });

      const activeRun = session.activeRun || session.data?.activeRun || existingRun;
      const resume = Boolean(session.reused || existingRun);
      window.MoguriaUI.show('game');
      gameOpened = true;
      window.MoguriaUI?.updateAdventureLoading?.({
        message:'ダンジョンの入口を開いています…',
        percent:95
      });
      const started = await Promise.resolve(window.MoguriaGame.start({ runId: session.runId, activeRun, resume }));
      if (started === false) {
        window.MoguriaUI.show('home');
        failureMessage = window.MoguriaGame?.getStartError?.() || '戦闘画面を開始できませんでした。もう一度ためしてね。';
        return;
      }
      adventureStarted = true;
      window.MoguriaUI?.updateAdventureLoading?.({
        message:'冒険へ出発！',
        percent:100,
        busy:false,
        stopWaiting:true
      });
      await window.MoguriaUI?.waitForAdventureLoadingExperience?.();
      await nextVisibleFrame();
    } catch (error) {
      console.warn('[MoguriaHome] battle preparation failed', error);
      if (gameOpened) window.MoguriaUI?.show?.('home');
      failureMessage = '冒険の準備に失敗しました。通信を確認して、もう一度ためしてね。';
    } finally {
      startPending = false;
      update();
      if (!adventureStarted) {
        showAdventureError(failureMessage || '冒険を始められませんでした。もう一度ためしてね。');
        return;
      }
      const battleMode = window.MoguriaGame?.getState?.()?.mode;
      const focusTarget = !adventureStarted ? 'startBtn'
        : battleMode === 'choice' ? 'levelModal'
        : battleMode === 'artifact' ? 'artifactModal'
        : 'pauseBtn';
      window.MoguriaUI?.hideAdventureLoading?.({
        restoreFocus: false,
        focusTarget,
        endSession:true
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
