(function (global) {
  'use strict';

  const TIPS = Object.freeze([
    Object.freeze({ id: 'safe-01', text: 'ホームは、冒険から帰ってひと休みする場所。' }),
    Object.freeze({ id: 'safe-02', text: 'ダンジョンの奥では、星の光がいっそうよく見える。' }),
    Object.freeze({ id: 'safe-03', text: '冒険の外には、静かな夜と暖かな灯りがある。' }),
    Object.freeze({ id: 'safe-04', text: '星の実は、もぐの成長につながる小さな光。' }),
    Object.freeze({ id: 'safe-05', text: '同じ力を重ねると、できることも少しずつ変わる。' }),
    Object.freeze({ id: 'safe-06', text: '小さな星も、集めれば大きな力になる。' }),
    Object.freeze({ id: 'safe-07', text: 'もぐは、食べた力に合わせて戦い方を変える。' }),
    Object.freeze({ id: 'safe-08', text: 'おなかいっぱいのときは、休むのも冒険のうち。' }),
    Object.freeze({ id: 'safe-09', text: 'よく食べ、よく潜り、帰ったらよく休む。' }),
    Object.freeze({ id: 'safe-10', text: '子もぐは、歩くより飛ぶほうが得意。' }),
    Object.freeze({ id: 'safe-11', text: '子もぐは小さくても、いっしょに攻撃してくれる。' }),
    Object.freeze({ id: 'safe-12', text: '子もぐが増えると、冒険は少しにぎやかになる。' }),
    Object.freeze({ id: 'safe-13', text: '子もぐは、待っているあいだも星灯りを運んでいる。' }),
    Object.freeze({ id: 'safe-14', text: '食べる力の組み合わせは、冒険ごとに少しずつ違う。' }),
    Object.freeze({ id: 'safe-15', text: '一つの力を重ねる道も、力を組み合わせる道もある。' }),
    Object.freeze({ id: 'safe-16', text: '逃げることが、いちばん強い戦い方になる日もある。' }),
    Object.freeze({ id: 'safe-17', text: '途中で休めば、集めた力を休憩帳で確かめられる。' }),
    Object.freeze({ id: 'safe-18', text: '小さな光も、集まれば夜を照らすよ。' }),
    Object.freeze({ id: 'safe-19', text: '子もぐが運ぶ星灯りは、進んだ道だけを照らす。' }),
    Object.freeze({ id: 'safe-20', text: '深い影の中では、小さな灯りほどよく見える。' }),
    Object.freeze({ id: 'safe-21', text: '扉の灯りは、冒険の準備ができた合図。' }),
    Object.freeze({ id: 'safe-22', text: 'おやつを食べたあとは、少し休む時間も大切。' }),
    Object.freeze({ id: 'safe-23', text: '見つけた力は、図鑑に少しずつ残っていく。' }),
    Object.freeze({ id: 'safe-24', text: 'ホームは暖かく、冒険には深い影がある。' }),
    Object.freeze({ id: 'safe-25', text: '食べた星の力は、その冒険の力になる。' }),
    Object.freeze({ id: 'safe-26', text: '力を組み合わせると、新しい力になることも。' }),
    Object.freeze({ id: 'safe-27', text: '白くてまるいもぐは、深い影でもよく見える。' }),
    Object.freeze({ id: 'safe-28', text: '選ぶ力が変われば、今日のもぐも少し変わる。' }),
    Object.freeze({ id: 'safe-29', text: '子もぐは、もぐのそばを一生懸命飛んでいる。' }),
    Object.freeze({ id: 'safe-30', text: '深く潜るほど、出会う敵も少しずつ変わる。' }),
    Object.freeze({ id: 'safe-31', text: '通常の敵は、かわいくても油断できない。' }),
    Object.freeze({ id: 'safe-32', text: '深い場所の敵ほど、少し異質に見える。' }),
    Object.freeze({ id: 'safe-33', text: 'ボスは、怖さより少し不思議な気配をまとう。' }),
    Object.freeze({ id: 'safe-34', text: '大きな敵は、動き出す前に小さな合図を見せる。' }),
    Object.freeze({ id: 'safe-35', text: '星灯りが扉へ届くと、冒険の準備が整う。' }),
    Object.freeze({ id: 'safe-36', text: 'ホームのランプは、帰ったもぐを静かに照らす。' }),
    Object.freeze({ id: 'safe-37', text: 'ホームには、夜の窓とランプと星飾りがある。' }),
    Object.freeze({ id: 'safe-38', text: 'ぼうしも服も、冒険を助ける大切な装備。' })
  ]);

  const SELECTORS = Object.freeze({
    tipsPanel: '[data-loading-tips]',
    tipButton: '[data-loading-tip-button]',
    tipText: '[data-loading-tip-text]',
    announcement: '[data-loading-announcement], [data-loading-tip-announcement]',
    autoToggle: '[data-loading-auto-toggle], [data-loading-tip-auto-toggle]',
    progressbar: '[data-loading-progressbar], [data-loading-progress]',
    progressFill: '[data-loading-progress-fill], [data-loading-fill]',
    progressPercent: '[data-loading-progress-percent], [data-loading-percent]',
    phase: '[data-loading-phase]',
    title: '[data-loading-title]'
  });

  const DEFAULTS = Object.freeze({
    sampleSize: 5,
    revealMs: 1200,
    autoMs: 6000,
    debounceMs: 300,
    transitionMs: 120,
    quietMs: 700,
    arrivalMs: 240,
    contactMs: 220
  });

  function clampProgress(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(100, numeric));
  }

  function finiteDelay(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : fallback;
  }

  function uniqueTips(items) {
    const ids = new Set();
    const texts = new Set();
    const result = [];
    for (const candidate of Array.isArray(items) ? items : []) {
      const id = String(candidate?.id || '').trim();
      const text = String(candidate?.text || '').trim();
      if (!id || !text || ids.has(id) || texts.has(text)) continue;
      ids.add(id);
      texts.add(text);
      result.push(candidate);
    }
    return result;
  }

  function randomIndex(random, length) {
    const sampled = Number(random());
    const normalized = Number.isFinite(sampled)
      ? Math.max(0, Math.min(0.9999999999999999, sampled))
      : 0;
    return Math.floor(normalized * length);
  }

  function sampleTips(items = TIPS, count = DEFAULTS.sampleSize, random = Math.random) {
    const pool = uniqueTips(items);
    const size = Math.max(1, Math.floor(Number(count) || DEFAULTS.sampleSize));
    if (pool.length < size) throw new RangeError(`loading tip pool requires at least ${size} unique entries`);
    const bag = pool.slice();
    for (let index = bag.length - 1; index > 0; index -= 1) {
      const other = randomIndex(random, index + 1);
      const held = bag[index];
      bag[index] = bag[other];
      bag[other] = held;
    }
    return Object.freeze(bag.slice(0, size));
  }

  function create(root, options = {}) {
    if (!root || typeof root.querySelector !== 'function') {
      throw new TypeError('MoguriaLoadingExperience.create requires a loader root element');
    }

    root.moguriaLoadingExperience?.destroy?.();

    const view = options.window || global;
    const doc = options.document || root.ownerDocument || view.document;
    const timerSource = options.scheduler || {};
    const setTimer = timerSource.setTimeout
      ? timerSource.setTimeout.bind(timerSource)
      : view.setTimeout.bind(view);
    const clearTimerSource = timerSource.clearTimeout
      ? timerSource.clearTimeout.bind(timerSource)
      : view.clearTimeout.bind(view);
    const now = typeof timerSource.now === 'function'
      ? timerSource.now.bind(timerSource)
      : () => view.performance?.now?.() ?? Date.now();
    const media = options.reduceMotionQuery || view.matchMedia?.('(prefers-reduced-motion: reduce)') || {
      matches: false,
      addEventListener() {},
      removeEventListener() {}
    };
    const elements = {};

    for (const [key, fallbackSelector] of Object.entries(SELECTORS)) {
      const supplied = options.elements?.[key];
      const selector = options.selectors?.[key] || fallbackSelector;
      elements[key] = supplied || root.querySelector(selector) || null;
    }

    const timings = {
      revealMs: finiteDelay(options.revealMs, DEFAULTS.revealMs),
      autoMs: finiteDelay(options.autoMs, DEFAULTS.autoMs),
      debounceMs: finiteDelay(options.debounceMs, DEFAULTS.debounceMs),
      transitionMs: finiteDelay(options.transitionMs, DEFAULTS.transitionMs),
      quietMs: finiteDelay(options.quietMs, DEFAULTS.quietMs),
      arrivalMs: finiteDelay(options.arrivalMs, DEFAULTS.arrivalMs),
      contactMs: finiteDelay(options.contactMs, DEFAULTS.contactMs)
    };

    const tipPool = uniqueTips(options.tips || TIPS);
    const sessionTips = sampleTips(
      tipPool,
      options.sampleSize || DEFAULTS.sampleSize,
      options.random || Math.random
    );

    let selection = sessionTips;
    let currentIndex = 0;
    let state = 'idle';
    let progress = 0;
    let destroyed = false;
    let tipsVisible = false;
    let autoPaused = false;
    let focusPaused = false;
    let pointerInput = false;
    let nextAutoAt = 0;
    let quietUntil = 0;
    let tapLockedUntil = 0;
    let activeArrivalMs = timings.arrivalMs;
    let activeContactMs = timings.contactMs;
    let autoTimer = 0;
    let transitionTimer = 0;
    let quietTimer = 0;
    let revealTimer = 0;
    let contactTimer = 0;
    let completeTimer = 0;
    let pendingTipSwap = null;
    let pendingTipSource = '';
    let completionPromise = null;
    let resolveCompletion = null;
    let controller = null;

    function safeCall(callback, ...args) {
      if (typeof callback !== 'function') return;
      try {
        callback(...args);
      } catch (error) {
        view.console?.warn?.('[MoguriaLoadingExperience] hook failed', error);
      }
    }

    function clearTimer(timer) {
      if (timer) clearTimerSource(timer);
    }

    function setAttribute(element, name, value) {
      element?.setAttribute?.(name, String(value));
    }

    function setText(element, value) {
      if (element) element.textContent = String(value ?? '');
    }

    function setRootState(next) {
      state = next;
      setAttribute(root, 'data-state', next);
      setAttribute(root, 'data-loading-state', next);
      safeCall(options.onStateChange, next, getSnapshot());
    }

    function setBusy(busy) {
      setAttribute(elements.progressbar, 'aria-busy', busy ? 'true' : 'false');
    }

    function setPhaseLiveMode(errorMode) {
      if (!elements.phase) return;
      setAttribute(elements.phase, 'role', errorMode ? 'alert' : 'status');
      setAttribute(elements.phase, 'aria-live', errorMode ? 'assertive' : 'polite');
      setAttribute(elements.phase, 'aria-atomic', 'true');
    }

    function setCopy(details = {}) {
      if (details.title != null) setText(elements.title, details.title);
      if (details.phase != null) setText(elements.phase, details.phase);
    }

    function setProgress(next, details = {}) {
      progress = clampProgress(next);
      const rounded = Math.round(progress);
      root.style?.setProperty?.('--moguria-loading-progress', `${progress}%`);
      setAttribute(root, 'data-loading-progress', rounded);
      if (elements.progressFill?.style) elements.progressFill.style.width = `${progress}%`;
      setText(elements.progressPercent, `${rounded}%`);
      setAttribute(elements.progressbar, 'aria-valuenow', rounded);
      setAttribute(
        elements.progressbar,
        'aria-valuetext',
        typeof details.valueText === 'string' ? details.valueText : `${rounded}% 準備完了`
      );
      safeCall(options.onProgress, getSnapshot(), details);
    }

    function setTipsVisible(visible) {
      tipsVisible = Boolean(visible);
      setAttribute(elements.tipsPanel, 'data-visible', tipsVisible ? 'true' : 'false');
      setAttribute(elements.tipsPanel, 'aria-hidden', tipsVisible ? 'false' : 'true');
      if (elements.tipsPanel) {
        if (tipsVisible) elements.tipsPanel.removeAttribute?.('inert');
        else setAttribute(elements.tipsPanel, 'inert', '');
      }
      if (elements.tipButton) elements.tipButton.disabled = !tipsVisible || state !== 'loading';
      syncAutoToggle();
    }

    function setTip(tip, source) {
      if (!tip) return;
      setText(elements.tipText, tip.text);
      setAttribute(elements.tipText, 'data-tip-id', tip.id);
      setAttribute(elements.tipButton, 'aria-label', `次のヒント。現在のヒント：${tip.text}`);
      if (source === 'manual') {
        const announcement = `次のヒント。${tip.text}`;
        setText(elements.announcement, announcement);
        safeCall(options.onAnnounce, announcement, { kind: 'tip', tip, source });
      }
      safeCall(options.onTip, tip, { source, index: currentIndex, snapshot: getSnapshot() });
    }

    function setQuiet(quiet) {
      setAttribute(elements.tipsPanel, 'data-quiet', quiet ? 'true' : 'false');
    }

    function syncAutoToggle() {
      const toggle = elements.autoToggle;
      if (!toggle) return;
      if (media.matches) {
        toggle.disabled = true;
        setAttribute(toggle, 'aria-pressed', 'true');
        setText(toggle, '端末設定で自動停止中');
        return;
      }
      toggle.disabled = state !== 'loading' || !tipsVisible;
      setAttribute(toggle, 'aria-pressed', autoPaused ? 'true' : 'false');
      setText(toggle, autoPaused ? '自動切替を再開' : '自動切替を停止');
    }

    function isMounted() {
      if (destroyed) return false;
      if ('isConnected' in root && root.isConnected === false) {
        destroy();
        return false;
      }
      return true;
    }

    function canAutoAdvance() {
      return isMounted()
        && state === 'loading'
        && tipsVisible
        && !autoPaused
        && !focusPaused
        && !doc?.hidden
        && !media.matches;
    }

    function scheduleAuto() {
      clearTimer(autoTimer);
      autoTimer = 0;
      if (!canAutoAdvance()) return;
      const currentTime = now();
      const delay = Math.max(0, nextAutoAt - currentTime, quietUntil - currentTime);
      autoTimer = setTimer(() => {
        autoTimer = 0;
        if (!canAutoAdvance()) return;
        if (now() < quietUntil) {
          scheduleAuto();
          return;
        }
        changeTip('auto');
      }, delay);
    }

    function cancelTipTimers() {
      clearTimer(autoTimer);
      clearTimer(transitionTimer);
      autoTimer = 0;
      transitionTimer = 0;
      pendingTipSwap = null;
      pendingTipSource = '';
      elements.tipButton?.classList?.remove?.('is-leaving');
    }

    function changeTip(source) {
      if (!isMounted() || !selection.length || state !== 'loading' || !tipsVisible) return false;
      const manual = source === 'manual';
      if (manual && now() < tapLockedUntil) return false;
      if (manual) tapLockedUntil = now() + timings.debounceMs;

      clearTimer(autoTimer);
      clearTimer(transitionTimer);
      autoTimer = 0;
      transitionTimer = 0;
      pendingTipSwap = null;
      pendingTipSource = '';
      elements.tipButton?.classList?.add?.('is-leaving');

      const swap = () => {
        transitionTimer = 0;
        pendingTipSwap = null;
        pendingTipSource = '';
        if (!isMounted() || state !== 'loading') return;
        currentIndex = (currentIndex + 1) % selection.length;
        setTip(selection[currentIndex], source);
        elements.tipButton?.classList?.remove?.('is-leaving');
        nextAutoAt = now() + timings.autoMs;
        scheduleAuto();
      };

      pendingTipSwap = swap;
      pendingTipSource = source;
      if (media.matches || now() < quietUntil || timings.transitionMs === 0) swap();
      else transitionTimer = setTimer(swap, timings.transitionMs);
      return true;
    }

    function settleTipForProgress() {
      const manualSwap = pendingTipSource === 'manual' ? pendingTipSwap : null;
      cancelTipTimers();
      if (manualSwap) manualSwap();
      clearTimer(quietTimer);
      quietTimer = 0;
      setQuiet(true);
    }

    function beginQuietWindow() {
      settleTipForProgress();
      quietTimer = setTimer(() => {
        quietTimer = 0;
        if (!isMounted()) return;
        setQuiet(false);
        scheduleAuto();
      }, timings.quietMs);
    }

    function clearLifecycleTimers() {
      clearTimer(revealTimer);
      clearTimer(quietTimer);
      clearTimer(contactTimer);
      clearTimer(completeTimer);
      revealTimer = 0;
      quietTimer = 0;
      contactTimer = 0;
      completeTimer = 0;
    }

    function settleCompletion(reason) {
      if (!resolveCompletion) return;
      const resolve = resolveCompletion;
      resolveCompletion = null;
      resolve(Object.freeze({ ...getSnapshot(), reason }));
    }

    function resetCompletion() {
      settleCompletion('restarted');
      completionPromise = new Promise(resolve => {
        resolveCompletion = resolve;
      });
    }

    function transitionDelay(value) {
      return media.matches ? 0 : value;
    }

    function finishComplete(details = {}) {
      if (!isMounted() || state !== 'contact') return;
      completeTimer = 0;
      setRootState('complete');
      setCopy({
        title: details.completeTitle ?? options.completeTitle,
        phase: details.completePhase ?? options.completePhase
      });
      setBusy(false);
      setQuiet(false);
      if (elements.tipButton) elements.tipButton.disabled = true;
      syncAutoToggle();
      const snapshot = getSnapshot();
      safeCall(options.onComplete, snapshot, details);
      settleCompletion('complete');
    }

    function beginContact(details = {}) {
      if (!isMounted() || state !== 'arriving') return;
      contactTimer = 0;
      setRootState('contact');
      setProgress(100, details);
      if (details.contactPhase != null || options.contactPhase != null) {
        setCopy({ phase: details.contactPhase ?? options.contactPhase });
      }
      const snapshot = getSnapshot();
      safeCall(options.onContact, snapshot, details);
      completeTimer = setTimer(
        () => finishComplete(details),
        transitionDelay(activeContactMs)
      );
    }

    function beginArrival(details = {}) {
      clearTimer(revealTimer);
      clearTimer(quietTimer);
      revealTimer = 0;
      quietTimer = 0;
      cancelTipTimers();
      setQuiet(true);
      setRootState('arriving');
      if (elements.tipButton) elements.tipButton.disabled = true;
      syncAutoToggle();
      const snapshot = getSnapshot();
      safeCall(options.onArrival, snapshot, details);
      contactTimer = setTimer(
        () => beginContact(details),
        transitionDelay(activeArrivalMs)
      );
    }

    function getSnapshot() {
      const tip = selection[currentIndex] || null;
      return Object.freeze({
        state,
        progress,
        roundedProgress: Math.round(progress),
        tipsVisible,
        autoPaused,
        focusPaused,
        reducedMotion: Boolean(media.matches),
        currentTip: tip,
        sessionTips: Object.freeze(selection.slice())
      });
    }

    function start(details = {}) {
      if (destroyed) return getSnapshot();
      clearLifecycleTimers();
      cancelTipTimers();
      resetCompletion();
      currentIndex = 0;
      progress = 0;
      tipsVisible = false;
      autoPaused = false;
      focusPaused = false;
      nextAutoAt = 0;
      quietUntil = 0;
      tapLockedUntil = 0;
      activeArrivalMs = finiteDelay(details.arrivalMs, timings.arrivalMs);
      activeContactMs = finiteDelay(details.contactMs, timings.contactMs);
      setPhaseLiveMode(false);
      setRootState('loading');
      setQuiet(false);
      setCopy(details);
      setProgress(details.progress ?? 0, details);
      setBusy(true);
      setTip(selection[0], 'initial');
      setTipsVisible(false);
      safeCall(options.onStart, getSnapshot(), details);

      revealTimer = setTimer(() => {
        revealTimer = 0;
        if (!isMounted() || state !== 'loading') return;
        setTipsVisible(true);
        nextAutoAt = now() + timings.autoMs;
        scheduleAuto();
      }, finiteDelay(details.revealMs, timings.revealMs));
      return getSnapshot();
    }

    function advance(value, details = {}) {
      if (destroyed || state !== 'loading') return Promise.resolve(getSnapshot());
      const next = Math.max(progress, clampProgress(value));
      const moved = next > progress;
      if (details.phase != null || details.title != null) setCopy(details);
      if (moved) {
        quietUntil = now() + timings.quietMs;
        beginQuietWindow();
      }
      setProgress(next, details);
      if (next >= 100) {
        activeArrivalMs = finiteDelay(details.arrivalMs, activeArrivalMs);
        activeContactMs = finiteDelay(details.contactMs, activeContactMs);
        beginArrival(details);
        return completionPromise;
      }
      return Promise.resolve(getSnapshot());
    }

    function complete(details = {}) {
      if (state === 'loading') return advance(100, details);
      return completionPromise || Promise.resolve(getSnapshot());
    }

    function enterError(messageOrDetails = {}) {
      if (destroyed) return getSnapshot();
      const details = typeof messageOrDetails === 'string'
        ? { phase: messageOrDetails }
        : messageOrDetails || {};
      clearLifecycleTimers();
      cancelTipTimers();
      setQuiet(false);
      setPhaseLiveMode(true);
      setRootState('error');
      setCopy(details);
      setBusy(false);
      setTipsVisible(false);
      if (elements.tipButton) elements.tipButton.disabled = true;
      syncAutoToggle();
      if (details.phase) safeCall(options.onAnnounce, String(details.phase), { kind: 'error' });
      safeCall(options.onError, getSnapshot(), details);
      settleCompletion('error');
      return getSnapshot();
    }

    function resample() {
      if (destroyed) return getSnapshot();
      selection = sampleTips(
        options.tips || TIPS,
        options.sampleSize || DEFAULTS.sampleSize,
        options.random || Math.random
      );
      currentIndex = 0;
      tapLockedUntil = 0;
      cancelTipTimers();
      setTip(selection[0], 'initial');
      if (state === 'loading' && tipsVisible) {
        nextAutoAt = now() + timings.autoMs;
        scheduleAuto();
      }
      safeCall(options.onResample, getSnapshot());
      return getSnapshot();
    }

    function nextTip() {
      return changeTip('manual');
    }

    function pause() {
      if (destroyed) return getSnapshot();
      autoPaused = true;
      clearTimer(autoTimer);
      autoTimer = 0;
      syncAutoToggle();
      return getSnapshot();
    }

    function resume() {
      if (destroyed) return getSnapshot();
      autoPaused = false;
      nextAutoAt = now() + timings.autoMs;
      syncAutoToggle();
      scheduleAuto();
      return getSnapshot();
    }

    function handleTipClick(event) {
      event?.stopPropagation?.();
      nextTip();
      if (pointerInput) elements.tipButton?.blur?.();
      pointerInput = false;
    }

    function handlePointerDown() {
      pointerInput = true;
    }

    function handleToggleClick(event) {
      event?.stopPropagation?.();
      if (media.matches || state !== 'loading') return;
      if (autoPaused) resume();
      else pause();
    }

    function handleFocus() {
      focusPaused = true;
      clearTimer(autoTimer);
      autoTimer = 0;
    }

    function handleBlur() {
      focusPaused = false;
      nextAutoAt = now() + timings.autoMs;
      scheduleAuto();
    }

    function handleVisibility() {
      if (doc?.hidden) {
        settleTipForProgress();
        setQuiet(false);
        return;
      }
      quietUntil = 0;
      nextAutoAt = now() + timings.autoMs;
      scheduleAuto();
    }

    function handleMotionPreference() {
      settleTipForProgress();
      setQuiet(false);
      syncAutoToggle();
      if (!media.matches) {
        nextAutoAt = now() + timings.autoMs;
        scheduleAuto();
      }
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      clearLifecycleTimers();
      cancelTipTimers();
      elements.tipButton?.removeEventListener?.('pointerdown', handlePointerDown);
      elements.tipButton?.removeEventListener?.('click', handleTipClick);
      elements.tipButton?.removeEventListener?.('focus', handleFocus);
      elements.tipButton?.removeEventListener?.('blur', handleBlur);
      elements.autoToggle?.removeEventListener?.('click', handleToggleClick);
      doc?.removeEventListener?.('visibilitychange', handleVisibility);
      if (typeof media.removeEventListener === 'function') {
        media.removeEventListener('change', handleMotionPreference);
      } else {
        media.removeListener?.(handleMotionPreference);
      }
      state = 'destroyed';
      settleCompletion('destroyed');
      if (root.moguriaLoadingExperience === controller) {
        try {
          delete root.moguriaLoadingExperience;
        } catch (_) {
          root.moguriaLoadingExperience = null;
        }
      }
      safeCall(options.onDestroy, getSnapshot());
    }

    elements.tipButton?.addEventListener?.('pointerdown', handlePointerDown);
    elements.tipButton?.addEventListener?.('click', handleTipClick);
    elements.tipButton?.addEventListener?.('focus', handleFocus);
    elements.tipButton?.addEventListener?.('blur', handleBlur);
    elements.autoToggle?.addEventListener?.('click', handleToggleClick);
    doc?.addEventListener?.('visibilitychange', handleVisibility);
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleMotionPreference);
    } else {
      media.addListener?.(handleMotionPreference);
    }

    setAttribute(elements.announcement, 'role', 'status');
    setAttribute(elements.announcement, 'aria-live', 'polite');
    setAttribute(elements.announcement, 'aria-atomic', 'true');
    setAttribute(root, 'data-tip-pool-size', tipPool.length);
    setAttribute(root, 'data-tip-selection-size', selection.length);
    setAttribute(elements.tipsPanel, 'data-quiet', 'false');
    setTipsVisible(false);

    controller = Object.freeze({
      start,
      advance,
      complete,
      error: enterError,
      nextTip,
      pause,
      resume,
      resample,
      destroy,
      unmount: destroy,
      getSnapshot,
      whenComplete: () => completionPromise || Promise.resolve(getSnapshot())
    });
    root.moguriaLoadingExperience = controller;
    return controller;
  }

  global.MoguriaLoadingExperience = Object.freeze({
    TIPS,
    selectors: SELECTORS,
    defaults: DEFAULTS,
    sampleTips,
    create
  });
})(window);
