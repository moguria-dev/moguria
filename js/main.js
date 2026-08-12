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
  let retryBound = false;
  let serviceWorkerRegistrationStarted = false;

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

  function setLoaderProgress(progress = {}){
    const total = Math.max(0, Math.floor(Number(progress.total) || 0));
    const completed = Math.max(0, Math.min(total, Math.floor(Number(progress.completed) || 0)));
    const percent = total > 0 ? completed / total * 100 : 0;
    const bar = byId('startupProgressBar');
    const fill = byId('startupProgressFill');
    const status = byId('startupProgressText');

    if(fill) fill.style.width = `${percent}%`;
    if(bar){
      if(total > 0) bar.setAttribute('aria-valuemax', String(total));
      bar.setAttribute('aria-valuenow', String(completed));
      bar.setAttribute('aria-valuetext', total > 0 ? `${completed} / ${total} 完了` : 'データを確認中');
    }
    if(status) status.textContent = total > 0 ? `ホームを準備しています ${completed} / ${total}` : 'データを確認しています';
  }

  function beginLoaderAttempt(){
    const loader = byId('startupLoader');
    const retry = byId('startupRetryBtn');
    if(loader){
      loader.dataset.state = 'loading';
      loader.setAttribute('aria-busy', 'true');
    }
    if(retry){
      retry.hidden = true;
      retry.disabled = true;
    }
    setLoaderProgress({ total:18, completed:0 });
  }

  function showLoaderFailure(result = {}){
    const loader = byId('startupLoader');
    const retry = byId('startupRetryBtn');
    const status = byId('startupProgressText');
    const total = Math.max(0, Math.floor(Number(result.total) || 0));
    const loaded = Math.max(0, Math.floor(Number(result.loaded) || 0));
    if(loader){
      loader.dataset.state = 'error';
      loader.setAttribute('aria-busy', 'false');
    }
    if(status){
      status.textContent = total > 0
        ? `準備できなかったデータがあります（${loaded} / ${total}）`
        : 'データを読み込めませんでした。通信を確認してください。';
    }
    if(retry){
      retry.hidden = false;
      retry.disabled = false;
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
    if(app){
      app.inert = false;
      app.removeAttribute('inert');
      app.removeAttribute('aria-hidden');
    }
    document.body?.classList.remove('moguria-booting');
    if(loader){
      loader.setAttribute('aria-busy', 'false');
      loader.hidden = true;
    }
    applicationRevealed = true;
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
