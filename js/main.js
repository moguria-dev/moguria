async function moguriaCleanupOldServiceWorker(){
  const cfg = window.MoguriaConfig?.assets || {};
  if (cfg.registerServiceWorker || !cfg.cleanupOldServiceWorker) return;

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(reg => reg.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k.startsWith('moguria-core-')).map(k => caches.delete(k)));
    }
  } catch (error) {
    window.MoguriaDebug?.warn?.('service worker cleanup failed', error.message);
  }
}

(function(){
  let environmentInitialized = false;
  let applicationInitialized = false;
  let applicationRevealed = false;
  let startupPromise = null;
  let startupProgress = 0;
  let retryBound = false;
  let serviceWorkerRegistrationStarted = false;
  let battleWarmupScheduled = false;
  let startupExperience = null;

  const byId = id => document.getElementById(id);

  function initializeEnvironment(){
    if(environmentInitialized) return;
    environmentInitialized = true;
    window.MoguriaErrorLog?.install?.();
    window.MoguriaPlatform?.init?.();
    window.MoguriaSecurity?.init?.();
    window.MoguriaDebug?.init?.();

    // Removing an obsolete worker/cache is maintenance, not a prerequisite for
    // displaying Home. Let it finish in the background instead of holding the
    // startup screen on slow Cache Storage implementations.
    void moguriaCleanupOldServiceWorker();

    const retry = byId('startupRetryBtn');
    if(retry && !retryBound){
      retryBound = true;
      retry.addEventListener('click', () => {
        if(retry.disabled || applicationRevealed) return;
        void startStartup();
      });
    }
  }

  function startupPhaseMessage(progress, percent){
    const phase = String(progress.phase || '');
    if(phase === 'manifest') return 'データを確認しています';
    if(phase === 'ready') return 'ホームの準備ができました';
    return 'ホームの景色を読み込んでいます';
  }

  function ensureStartupExperience(){
    if(startupExperience) return startupExperience;
    const loader = byId('startupLoader');
    const create = window.MoguriaLoadingExperience?.create;
    if(!loader || typeof create !== 'function') return null;
    startupExperience = create(loader, {
      contactPhase:'星灯りがホームへ届きました',
      completeTitle:'ホームの準備ができました',
      completePhase:'ホームへ戻ります'
    });
    return startupExperience;
  }

  function setLoaderProgress(progress = {}, options = {}){
    const total = Math.max(0, Math.floor(Number(progress.total) || 0));
    const completed = Math.max(0, Math.min(total, Math.floor(Number(progress.completed) || 0)));
    const reportedPercent = Number(progress.percent);
    const candidate = Number.isFinite(reportedPercent)
      ? Math.max(0, Math.min(100, reportedPercent))
      : total > 0 ? completed / total * 100 : 0;
    startupProgress = options.reset ? candidate : Math.max(startupProgress, candidate);
    const ready = String(progress.phase || '') === 'ready';
    const visibleProgress = ready ? startupProgress : Math.min(startupProgress, 99);
    const rounded = Math.round(visibleProgress);
    const bar = byId('startupProgressBar');
    const fill = byId('startupProgressFill');
    const percent = byId('startupProgressPercent');
    const status = byId('startupProgressText');

    if(fill) fill.style.width = `${visibleProgress}%`;
    if(percent) percent.textContent = `${rounded}%`;
    if(bar){
      bar.setAttribute('aria-valuenow', String(rounded));
      bar.setAttribute('aria-valuetext', `${rounded}% 準備完了`);
    }
    const phaseMessage = startupPhaseMessage(progress, visibleProgress);
    if(status && status.textContent !== phaseMessage) status.textContent = phaseMessage;
    const experience = ensureStartupExperience();
    if(experience){
      return experience.advance(visibleProgress, {
        phase:phaseMessage,
        valueText:`${rounded}% 準備完了`,
        contactPhase:'星灯りがホームへ届きました',
        completeTitle:'ホームの準備ができました',
        completePhase:'ホームへ戻ります'
      });
    }
    return Promise.resolve();
  }

  function beginLoaderAttempt(){
    const loader = byId('startupLoader');
    const bar = byId('startupProgressBar');
    const retry = byId('startupRetryBtn');
    if(loader){
      loader.dataset.state = 'loading';
    }
    if(bar) bar.setAttribute('aria-busy', 'true');
    if(retry){
      retry.hidden = true;
      retry.disabled = true;
    }
    const experience = ensureStartupExperience();
    experience?.start?.({
      progress:0,
      title:'ホームを準備中',
      phase:'データを確認しています'
    });
    void setLoaderProgress({ total:0, completed:0, phase:'manifest' }, { reset:true });
  }

  function showLoaderFailure(result = {}){
    const loader = byId('startupLoader');
    const bar = byId('startupProgressBar');
    const retry = byId('startupRetryBtn');
    const status = byId('startupProgressText');
    const total = Math.max(0, Math.floor(Number(result.total) || 0));
    const loaded = Math.max(0, Math.floor(Number(result.loaded) || 0));
    void setLoaderProgress({ total, completed:loaded }, { reset:true });
    const failureMessage = total > 0
      ? `準備できなかったデータがあります（${loaded} / ${total}）`
      : 'データを読み込めませんでした。通信を確認してください。';
    ensureStartupExperience()?.error?.({
      title:'ホームを準備できませんでした',
      phase:failureMessage
    });
    if(loader){
      loader.dataset.state = 'error';
    }
    if(bar) bar.setAttribute('aria-busy', 'false');
    if(status){
      status.textContent = failureMessage;
    }
    if(retry){
      retry.hidden = false;
      retry.disabled = false;
      window.requestAnimationFrame?.(() => retry.focus?.());
    }
  }

  function initializeApplication(){
    if(applicationInitialized) return;
    window.MoguriaUI?.init?.();
    window.MoguriaGame?.init?.();
    window.MoguriaHome?.init?.();
    window.MoguriaCheatMenu?.init?.();
    applicationInitialized = true;
  }

  function nextFrame(){
    if(typeof window.requestAnimationFrame !== 'function') return Promise.resolve();
    return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
  }

  async function revealApplication(){
    if(applicationRevealed) return;
    window.MoguriaUI?.show?.('home');
    await nextFrame();

    const app = byId('app');
    const loader = byId('startupLoader');
    const bar = byId('startupProgressBar');
    if(app){
      app.inert = false;
      app.removeAttribute('inert');
      app.removeAttribute('aria-hidden');
    }
    document.body?.classList.remove('moguria-booting');
    if(loader){
      loader.hidden = true;
    }
    if(bar) bar.setAttribute('aria-busy', 'false');
    applicationRevealed = true;
    scheduleBattleWarmup();
  }

  function scheduleBattleWarmup(){
    if(battleWarmupScheduled) return;
    const schedule = window.MoguriaBattleV3Loader?.scheduleWarmup;
    if(typeof schedule !== 'function') return;
    battleWarmupScheduled = true;
    try{
      const warmup = schedule.call(window.MoguriaBattleV3Loader);
      void Promise.resolve(warmup?.promise).catch(error => {
        window.MoguriaDebug?.warn?.('battle warmup failed', error?.message || String(error));
      });
    }catch(error){
      window.MoguriaDebug?.warn?.('battle warmup failed', error?.message || String(error));
    }
  }

  function registerServiceWorker(){
    if(serviceWorkerRegistrationStarted) return;
    if(!window.MoguriaConfig?.assets?.registerServiceWorker) return;
    if(!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
    serviceWorkerRegistrationStarted = true;
    navigator.serviceWorker.register('./service-worker.js').catch(err => window.MoguriaDebug?.warn?.('service worker failed', err.message));
  }

  function startStartup(){
    initializeEnvironment();
    if(applicationRevealed) return Promise.resolve({ ok:true, reused:true });
    if(startupPromise) return startupPromise;

    beginLoaderAttempt();
    const attempt = (async () => {
      try{
        const assets = window.MoguriaAssets;
        if(!assets?.preloadCritical) throw new Error('asset manager unavailable');
        const result = await assets.preloadCritical({ onProgress:setLoaderProgress });
        if(!result?.ok){
          showLoaderFailure(result);
          return result || { ok:false, reason:'asset-preload-failed' };
        }
        await setLoaderProgress({ percent:100, phase:'ready' });

        const validation = window.MoguriaValidator?.validate?.();
        if(validation && !validation.ok) window.MoguriaDebug?.warn?.('validation failed', validation.errors);

        initializeApplication();
        await revealApplication();
        registerServiceWorker();
        return result;
      }catch(error){
        window.MoguriaDebug?.warn?.('startup failed', error.message);
        const result = { ok:false, reason:'startup-failed', total:0, loaded:0, failed:['startup'], error };
        showLoaderFailure(result);
        return result;
      }
    })();

    startupPromise = attempt;
    attempt.finally(() => {
      if(startupPromise === attempt) startupPromise = null;
    });
    return attempt;
  }

  window.MoguriaStartup = {
    start:startStartup,
    isReady:() => applicationRevealed
  };

  window.addEventListener('DOMContentLoaded', () => {
    initializeEnvironment();
    void startStartup();
  });
})();
