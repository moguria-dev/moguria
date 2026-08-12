(function(){
  const state = {
    manifest: null,
    images: new Map(),
    imageLoads: new Map(),
    audio: new Map(),
    bytes: 0,
    ready: false,
    errors: []
  };

  const DEFAULT_ASSET_TIMEOUT_MS = 20000;

  function safeUrl(path){
    if(!path || typeof path !== 'string') return '';
    // Asset manifests are first-party and offline-capable. Reject every URL
    // form that can leave assets/, including browser-normalized control chars
    // and percent-encoded dot segments.
    if(/[\u0000-\u001f\u007f]/.test(path)) return '';
    const cleaned=path.trim().replace(/\\/g,'/');
    if(!cleaned || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(cleaned)) return '';
    const normalized=cleaned.replace(/^(?:\.\/)+/, '');
    const pathname=normalized.split(/[?#]/,1)[0];
    let decodedPath='';
    try{ decodedPath=decodeURIComponent(pathname); }
    catch(error){ return ''; }
    if(!decodedPath.startsWith('assets/')) return '';
    if(decodedPath.split('/').some(segment=>segment==='.'||segment==='..')) return '';
    return normalized;
  }

  function recordError(message){
    state.errors.push(message);
    if(state.errors.length > 50) state.errors.splice(0, state.errors.length - 50);
  }

  async function fetchJsonWithTimeout(src, timeoutMs, label){
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timeoutId = null;
    const request = (async () => {
      const res = await fetch(src, {
        cache:'no-cache',
        ...(controller ? { signal:controller.signal } : {})
      });
      if(!res.ok) throw new Error(`${label} HTTP ${res.status || 'error'}`);
      // Keep body parsing inside the raced operation. Receiving response
      // headers is not completion when a slow or interrupted body can stall.
      return await res.json();
    })();
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        controller?.abort?.();
        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    try{
      return await Promise.race([request, timeout]);
    }finally{
      if(timeoutId != null) clearTimeout(timeoutId);
    }
  }

  async function loadManifest(options = {}){
    if(state.manifest && !options.force) return state.manifest;
    const timeoutMs = Math.max(1, Number(options.timeoutMs) || DEFAULT_ASSET_TIMEOUT_MS);
    try{
      const manifest = await fetchJsonWithTimeout('assets/manifest.json', timeoutMs, 'manifest');
      if(!manifest || !Array.isArray(manifest.critical)) throw new Error('invalid manifest');
      state.manifest = manifest;
    }catch(err){
      state.manifest = null;
      recordError('asset manifest failed: ' + err.message);
      throw err;
    }
    return state.manifest;
  }

  function estimateBytes(w, h){ return Math.max(0, (w || 0) * (h || 0) * 4); }

  function loadImage(asset, options = {}){
    const src = safeUrl(asset?.src);
    const id = String(asset?.id || src);
    if(!src){
      recordError('image has no safe URL: ' + id);
      return Promise.resolve(null);
    }
    if(state.images.has(id)) return Promise.resolve(state.images.get(id));
    if(state.imageLoads.has(id)) return state.imageLoads.get(id);

    const timeoutMs = Math.max(1, Number(options.timeoutMs) || DEFAULT_ASSET_TIMEOUT_MS);
    const pending = new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      let settled = false;
      let timeoutId = null;

      const cleanup = () => {
        if(timeoutId != null) clearTimeout(timeoutId);
        img.onload = null;
        img.onerror = null;
      };

      const fail = (reason) => {
        if(settled) return;
        settled = true;
        cleanup();
        recordError(`image ${reason}: ${id}`);
        resolve(null);
      };

      img.onload = () => {
        Promise.resolve(typeof img.decode === 'function' ? img.decode() : null).then(() => {
          if(settled) return;
          if(!img.naturalWidth || !img.naturalHeight){
            fail('decoded without dimensions');
            return;
          }
          settled = true;
          cleanup();
          state.images.set(id, img);
          state.bytes += estimateBytes(img.naturalWidth, img.naturalHeight);
          resolve(img);
        }, () => fail('decode failed'));
      };
      img.onerror = () => fail('load failed');
      timeoutId = setTimeout(() => fail(`timed out after ${timeoutMs}ms`), timeoutMs);
      img.src = src;
    });

    const tracked = pending.finally(() => {
      if(state.imageLoads.get(id) === tracked) state.imageLoads.delete(id);
    });
    state.imageLoads.set(id, tracked);
    return tracked;
  }

  function loadAudio(asset){
    const src = safeUrl(asset.src);
    if(!src) return null;
    if(state.audio.has(asset.id)) return state.audio.get(asset.id);
    const a = new Audio();
    a.preload = asset.preload || 'metadata';
    a.src = src;
    state.audio.set(asset.id, a);
    return a;
  }

  async function loadJson(asset){
    const src = safeUrl(asset.src);
    if(!src) return null;
    const timeoutMs = Math.max(1, Number(asset?.timeoutMs) || DEFAULT_ASSET_TIMEOUT_MS);
    try{
      return await fetchJsonWithTimeout(src, timeoutMs, `json ${asset.id}`);
    }catch(err){
      recordError(`json load failed: ${asset.id} (${err.message})`);
      return null;
    }
  }

  function notifyProgress(listener, progress){
    if(typeof listener !== 'function') return;
    try{ listener(progress); }
    catch(err){ console.warn('[MoguriaAssets] progress listener failed', err); }
  }

  function loadAsset(asset, options = {}){
    if(asset.type === 'image') return loadImage(asset, options);
    if(asset.type === 'audio') return Promise.resolve(loadAudio(asset));
    if(asset.type === 'json') return loadJson({ ...asset, timeoutMs:options.timeoutMs ?? asset.timeoutMs });
    return Promise.resolve(null);
  }

  async function preloadCritical(options = {}){
    state.ready = false;
    let manifest;
    try{
      manifest = state.manifest || await loadManifest(options);
    }catch(error){
      const result = { ok:false, reason:'manifest-load-failed', total:0, completed:0, loaded:0, failed:['manifest'], stats:stats(), error };
      notifyProgress(options.onProgress, { total:0, completed:0, loaded:0, failed:1, assetId:'manifest', status:'failed' });
      return result;
    }

    const critical = manifest.critical || [];
    const total = critical.length;
    let completed = 0;
    let loaded = 0;
    const failed = [];
    notifyProgress(options.onProgress, { total, completed, loaded, failed:0, assetId:null, status:'loading' });

    await Promise.all(critical.map(async asset => {
      let value = null;
      try{ value = await loadAsset(asset, options); }
      catch(error){ recordError('critical asset failed: ' + (asset?.id || 'unknown')); }
      completed += 1;
      if(value) loaded += 1;
      else failed.push(String(asset?.id || asset?.src || 'unknown'));
      notifyProgress(options.onProgress, {
        total,
        completed,
        loaded,
        failed:failed.length,
        assetId:String(asset?.id || ''),
        status:value ? 'loaded' : 'failed'
      });
    }));

    state.ready = total > 0 && failed.length === 0;
    return {
      ok:state.ready,
      reason:state.ready ? null : 'critical-asset-load-failed',
      total,
      completed,
      loaded,
      failed,
      stats:stats()
    };
  }

  function getImage(id){ return state.images.get(id) || null; }
  function getAudio(id){ return state.audio.get(id) || null; }

  async function loadPack(packId, options = {}){
    let manifest;
    try{ manifest = state.manifest || await loadManifest(options); }
    catch(error){ return { ok:false, reason:'manifest-load-failed', error, stats:stats() }; }
    const pack = (manifest.packs || []).find(p => p.id === packId);
    if(!pack) return { ok:false, reason:'pack not found' };
    const assets = pack.assets || [];
    const results = await Promise.all(assets.map(asset => loadAsset(asset, options)));
    return results.some(value => !value)
      ? { ok:false, reason:'asset-load-failed', stats:stats() }
      : { ok:true, stats: stats() };
  }

  function stats(){
    return {
      ready: state.ready,
      images: state.images.size,
      audio: state.audio.size,
      approxMB: Math.round(state.bytes / 1024 / 1024 * 10) / 10,
      errors: state.errors.slice(-10)
    };
  }

  window.MoguriaAssets = { loadManifest, preloadCritical, loadPack, getImage, getAudio, stats };
})();
