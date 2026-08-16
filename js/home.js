window.MoguriaHome = (() => {
  let save;
  let initialized = false;
  let recoveryTimer = null;
  let homeNoticeTimer = null;
  let startPending = false;
  let adventureErrorKeysBound = false;
  let storyScriptPromise = null;
  let storyStylePromise = null;
  let storyOpenPending = false;
  let storySettlementBridgeBound = false;
  let lastAdventureOptions = {};

  const STORY_PROFILE_ID = 'story-c1-investigation-v1';
  const STORY_SCRIPT_SRC = 'js/story-ch01-player.js?v=20260816-story-ch01-1';
  const STORY_STYLE_SRC = 'css/moguria-story-ch01.css?v=20260816-story-ch01-1';

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
      void beginAdventure($('startBtn'), lastAdventureOptions);
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

  function isFreshStoryEntry(data = save){
    return !data?.activeRun
      && data?.story?.entryMode === 'new'
      && (!data.story.currentNodeId || data.story.currentNodeId === 'c1_available');
  }

  function loadStoryPlayer(){
    if (window.MoguriaStoryChapter01?.open) return Promise.resolve(window.MoguriaStoryChapter01);
    if (storyScriptPromise) return storyScriptPromise;
    storyScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector?.('script[data-moguria-story-ch01]');
      const script = existing || document.createElement('script');
      let settled = false;
      let timeoutId = null;
      const fail = message => {
        if (settled) return;
        settled = true;
        if (timeoutId != null) clearTimeout(timeoutId);
        script.dataset.moguriaStoryState = 'error';
        script.remove?.();
        script.parentNode?.removeChild?.(script);
        reject(new Error(message));
      };
      const finish = () => {
        if (settled) return;
        if (window.MoguriaStoryChapter01?.open) {
          settled = true;
          if (timeoutId != null) clearTimeout(timeoutId);
          script.dataset.moguriaStoryState = 'loaded';
          resolve(window.MoguriaStoryChapter01);
        } else fail('story player API was not registered');
      };
      script.addEventListener?.('load', finish, { once:true });
      script.addEventListener?.('error', () => fail('story player failed to load'), { once:true });
      if (!existing) {
        script.src = STORY_SCRIPT_SRC;
        script.async = true;
        script.dataset.moguriaStoryCh01 = 'true';
        (document.head || document.body).appendChild(script);
      } else if (window.MoguriaStoryChapter01?.open) finish();
      else if (existing.dataset?.moguriaStoryState === 'loaded' || existing.dataset?.moguriaStoryState === 'error') fail('stale story player script');
      if (!settled) timeoutId = setTimeout(() => fail('story player load timed out'), 20000);
    }).catch(error => {
      storyScriptPromise = null;
      throw error;
    });
    return storyScriptPromise;
  }

  function loadStoryStyles(){
    const loaded = document.querySelector?.('link[data-moguria-story-ch01-style="loaded"]');
    if (loaded) return Promise.resolve(loaded);
    if (storyStylePromise) return storyStylePromise;
    storyStylePromise = new Promise((resolve, reject) => {
      const existing = document.querySelector?.('link[data-moguria-story-ch01-style]');
      const link = existing || document.createElement('link');
      let settled = false;
      let timeoutId = null;
      const fail = message => {
        if (settled) return;
        settled = true;
        if (timeoutId != null) clearTimeout(timeoutId);
        link.dataset.moguriaStoryCh01Style = 'error';
        link.remove?.();
        link.parentNode?.removeChild?.(link);
        reject(new Error(message));
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timeoutId != null) clearTimeout(timeoutId);
        link.dataset.moguriaStoryCh01Style = 'loaded';
        resolve(link);
      };
      link.addEventListener?.('load', finish, { once:true });
      link.addEventListener?.('error', () => fail('story stylesheet failed to load'), { once:true });
      if (!existing) {
        link.rel = 'stylesheet';
        link.href = STORY_STYLE_SRC;
        link.dataset.moguriaStoryCh01Style = 'loading';
        (document.head || document.body).appendChild(link);
      } else if (existing.dataset?.moguriaStoryCh01Style === 'loaded') finish();
      else if (existing.dataset?.moguriaStoryCh01Style === 'error') fail('stale story stylesheet');
      if (!settled) timeoutId = setTimeout(() => fail('story stylesheet load timed out'), 20000);
    }).catch(error => {
      storyStylePromise = null;
      throw error;
    });
    return storyStylePromise;
  }

  async function openStory(trigger, options = {}){
    if (storyOpenPending) return { ok:false, reason:'pending' };
    storyOpenPending = true;
    trigger?.setAttribute?.('aria-busy', 'true');
    if (trigger) trigger.disabled = true;
    window.MoguriaBattleV3Loader?.cancelWarmup?.('story');
    try {
      const [player] = await Promise.all([loadStoryPlayer(), loadStoryStyles()]);
      await player.open({
        trigger,
        currentNodeId:options.currentNodeId || loadSave()?.story?.currentNodeId,
        replay:Boolean(options.replay)
      });
      return { ok:true };
    } catch (error) {
      console.warn('[MoguriaHome] story preparation failed', error);
      showHomeNotice('物語を開けませんでした。通信を確認して、もう一度ためしてね。', { error:true, persistent:true });
      return { ok:false, reason:'story-load-failed', error };
    } finally {
      storyOpenPending = false;
      trigger?.setAttribute?.('aria-busy', 'false');
      update();
    }
  }

  function handlePrimaryAction(trigger){
    loadSave();
    if (save.activeRun) return beginAdventure(trigger);
    if (isFreshStoryEntry(save)) return openStory(trigger, { currentNodeId:'c1_available' });
    return beginAdventure(trigger);
  }

  function handleStoryAction(trigger){
    loadSave();
    if (save.activeRun) {
      if (save.activeRun.profileId === STORY_PROFILE_ID) return beginAdventure(trigger);
      showHomeNotice('途中の冒険を先に再開してください。');
      $('startBtn')?.focus?.();
      return Promise.resolve({ ok:false, reason:'active-run-priority' });
    }
    const node = String(save.story?.currentNodeId || 'c1_available');
    if (node === 'c1_investigation_ready') return beginStoryInvestigation(trigger);
    if (node === 'c1_complete' || save.story?.completedChapterIds?.includes?.('c1')) {
      return openStory(trigger, { currentNodeId:'c1_available', replay:true });
    }
    return openStory(trigger, { currentNodeId:node });
  }

  function bindStorySettlementBridge(){
    if (storySettlementBridgeBound || typeof window.addEventListener !== 'function') return;
    storySettlementBridgeBound = true;
    window.addEventListener('moguria:story-run-settled', event => {
      const payload = event?.detail || {};
      window.MoguriaBattleV3Loader?.cancelWarmup?.('story-return');
      void Promise.all([loadStoryPlayer(), loadStoryStyles()]).then(([player]) => player.resumeAfterRun(payload)).catch(error => {
        console.warn('[MoguriaHome] story return failed', error);
        window.MoguriaUI?.show?.('home');
        showHomeNotice('物語の続きへ戻れませんでした。「物語」からもう一度ひらいてください。', { error:true, persistent:true });
      });
    });
  }

  function init(){
    if (initialized) return;
    initialized = true;
    loadSave();

    const startBtn = $('startBtn');
    if (startBtn) startBtn.onclick = () => handlePrimaryAction(startBtn);

    const storyBtn = $('storyBtn');
    if (storyBtn) storyBtn.onclick = () => handleStoryAction(storyBtn);

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
    bindStorySettlementBridge();

    update();
    if (!recoveryTimer) {
      recoveryTimer = setInterval(() => {
        loadSave();
        update();
      }, 30000);
    }
  }

  async function beginAdventure(startBtn, options = {}){
    if (startPending) return { ok:false, reason:'pending' };

    loadSave();
    const existingRun = save.activeRun || null;
    const requestedProfileId = typeof options.profileId === 'string' ? options.profileId : '';
    const isStoryRun = requestedProfileId === STORY_PROFILE_ID || existingRun?.profileId === STORY_PROFILE_ID;
    lastAdventureOptions = requestedProfileId ? { profileId:requestedProfileId } : {};
    if (!existingRun && !isStoryRun && save.belly <= 0) {
      showHomeNotice('Mogu、今日はいっぱい食べたみたい…少し休ませてあげよう。');
      $('homeMogu')?.classList.add('idle');
      renderStartButton(startBtn, false, false);
      return { ok:false, reason:'no-belly' };
    }

    startPending = true;
    renderStartButton(startBtn, true, Boolean(existingRun), true);
    let gameOpened = false;
    let adventureStarted = false;
    let failureMessage = '';
    resetAdventureError();
    window.MoguriaUI?.showAdventureLoading?.({ resume: Boolean(existingRun), percent:2 });
    setText('adventureLoadingCost', isStoryRun
      ? '物語の探索・おなか消費なし'
      : existingRun ? '続きから再開・おなか追加消費なし'
      : '新しい冒険・おなか 1消費');

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
          return { ok:false, reason:'prepare-failed' };
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
        : { engine:'battle-v3', ...(requestedProfileId ? { profileId:requestedProfileId } : {}) });

      if (!session?.ok) {
        if (session?.reason === 'no-belly') {
          failureMessage = 'Mogu、今日はいっぱい食べたみたい…少し休ませてあげよう。';
        } else if (session?.reason === 'save-failed') {
          failureMessage = '冒険の準備を保存できませんでした。空き容量を確認して、もう一度ためしてね。';
        } else {
          failureMessage = '冒険を始められませんでした。もう一度ためしてね。';
        }
        return { ok:false, reason:session?.reason || 'start-run-failed' };
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
      const profileId = activeRun?.profileId || requestedProfileId || undefined;
      const started = await Promise.resolve(window.MoguriaGame.start({ runId: session.runId, activeRun, resume, ...(profileId ? { profileId } : {}) }));
      if (started === false) {
        window.MoguriaUI.show('home');
        failureMessage = window.MoguriaGame?.getStartError?.() || '戦闘画面を開始できませんでした。もう一度ためしてね。';
        return { ok:false, reason:'game-start-failed' };
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
      return { ok:true, runId:session.runId, activeRun, profileId:profileId || null, resume };
    } catch (error) {
      console.warn('[MoguriaHome] battle preparation failed', error);
      if (gameOpened) window.MoguriaUI?.show?.('home');
      failureMessage = '冒険の準備に失敗しました。通信を確認して、もう一度ためしてね。';
      return { ok:false, reason:'exception', error };
    } finally {
      startPending = false;
      update();
      if (!adventureStarted) {
        showAdventureError(failureMessage || '冒険を始められませんでした。もう一度ためしてね。');
      } else {
        const battleMode = window.MoguriaGame?.getState?.()?.mode;
        const focusTarget = battleMode === 'choice' ? 'levelModal'
          : battleMode === 'artifact' ? 'artifactModal'
          : 'pauseBtn';
        window.MoguriaUI?.hideAdventureLoading?.({
          restoreFocus: false,
          focusTarget,
          endSession:true
        });
      }
    }
  }

  function renderStartButton(btn, canStart, canResume = false, loading = false, storyEntry = false){
    if (!btn) return;
    const label = btn.querySelector('b');
    const sub = btn.querySelector('small');
    const maxWave = window.MoguriaConfig?.run?.maxWave || 12;
    const buttonLabel = loading ? (storyEntry ? '物語を準備中…' : '読み込み中…')
      : canResume ? '冒険を続ける'
      : storyEntry ? '物語をはじめる'
      : canStart ? 'ダンジョンへ' : 'Moguを休ませる';
    const buttonSub = loading ? '準備しています'
      : canResume ? '途中から再開'
      : storyEntry ? '帰り灯の夜'
      : canStart ? `Wave ${maxWave}` : 'おなかいっぱい';
    if (label) label.textContent = buttonLabel;
    if (sub) sub.textContent = buttonSub;
    btn.disabled = loading;
    btn.style.filter = canStart || canResume || storyEntry ? 'none' : 'grayscale(.25)';
    btn.setAttribute('aria-disabled', loading || (!canStart && !canResume && !storyEntry) ? 'true' : 'false');
    btn.setAttribute('aria-busy', loading ? 'true' : 'false');
    btn.setAttribute('aria-label', loading ? (storyEntry ? '物語を読み込み中' : '冒険を読み込み中')
      : canResume ? '冒険を続ける 途中から再開'
      : storyEntry ? '物語をはじめる 帰り灯の夜'
      : canStart ? `ダンジョンへ Wave ${maxWave}` : 'Moguを休ませる おなかいっぱい');
  }

  function renderStoryButton(btn, data = save){
    if (!btn) return;
    const label = btn.querySelector('small');
    const node = String(data?.story?.currentNodeId || 'c1_available');
    const completed = node === 'c1_complete' || data?.story?.completedChapterIds?.includes?.('c1');
    const started = node !== 'c1_available';
    const storyRun = data?.activeRun?.profileId === STORY_PROFILE_ID;
    const text = storyRun ? '続きへ' : completed ? '回想' : started ? '物語の続き' : '物語';
    if (label) label.textContent = text;
    btn.disabled = startPending || storyOpenPending;
    btn.setAttribute('aria-busy', storyOpenPending ? 'true' : 'false');
    btn.setAttribute('aria-label', storyRun ? '物語の冒険を続ける'
      : completed ? '第1章 帰り灯を回想する'
      : started ? '第1章 帰り灯の続きをひらく'
      : '物語 第1章をひらく');
  }

  function update(){
    loadSave();

    const bellyText = $('bellyText');
    if (bellyText) bellyText.textContent = `${save.belly}/${save.maxBelly}`;

    const bellyBar = $('bellyBar');
    if (bellyBar) bellyBar.style.width = `${Math.max(0, Math.min(100, (save.belly / save.maxBelly) * 100))}%`;

    const storyEntry = isFreshStoryEntry(save);
    renderStartButton($('startBtn'), storyEntry || save.belly > 0, Boolean(save.activeRun), startPending || storyOpenPending, storyEntry);
    renderStoryButton($('storyBtn'), save);

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

  function beginStoryInvestigation(trigger){
    return beginAdventure($('startBtn') || trigger, { profileId:STORY_PROFILE_ID });
  }

  return { init, update, applyVisual, beginStoryInvestigation };
})();
