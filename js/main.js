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

window.addEventListener('DOMContentLoaded', async () => {
  window.MoguriaErrorLog?.install?.();
  window.MoguriaPlatform?.init?.();
  window.MoguriaSecurity?.init?.();
  window.MoguriaDebug?.init?.();
  window.MoguriaPerformance?.start?.();

  await moguriaCleanupOldServiceWorker();

  try {
    await window.MoguriaAssets?.loadManifest?.();
    await window.MoguriaAssets?.preloadCritical?.();
  } catch (error) {
    window.MoguriaDebug?.warn?.('asset preload failed', error.message);
  }

  const validation = window.MoguriaValidator?.validate?.();
  if (validation && !validation.ok) {
    window.MoguriaDebug?.warn?.('validation failed', validation.errors);
  }

  window.MoguriaUI?.init?.();
  window.MoguriaGame?.init?.();
  window.MoguriaHome?.init?.();
  window.MoguriaCheatMenu?.init?.();

  if (window.MoguriaConfig?.assets?.registerServiceWorker && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./service-worker.js').catch(err => window.MoguriaDebug?.warn?.('service worker failed', err.message));
  }
});
