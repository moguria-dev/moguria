window.addEventListener('DOMContentLoaded', async () => {
  MoguriaErrorLog?.install?.();
  MoguriaPlatform?.init?.();
  MoguriaSecurity?.init?.();
  MoguriaDebug?.init();
  MoguriaPerformance?.start();
  await MoguriaAssets?.loadManifest?.();
  await MoguriaAssets?.preloadCritical?.();

  const validation = MoguriaValidator?.validate?.();
  if(validation && !validation.ok){
    MoguriaDebug?.warn('validation failed', validation.errors);
  }
  MoguriaUI.init();
  MoguriaGame.init();
  MoguriaHome.init();
  MoguriaCheatMenu?.init?.();

  if(MoguriaConfig?.assets?.registerServiceWorker && 'serviceWorker' in navigator && location.protocol.startsWith('http')){
    navigator.serviceWorker.register('./service-worker.js').catch(err => MoguriaDebug?.warn?.('service worker failed', err.message));
  }
});
