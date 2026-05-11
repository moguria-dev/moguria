(function(){
  const state = {
    manifest: null,
    images: new Map(),
    audio: new Map(),
    bytes: 0,
    ready: false,
    errors: []
  };

  const DEFAULT_MANIFEST = { version: 'inline', critical: [], lazy: [], packs: [] };

  function safeUrl(path){
    if(!path || typeof path !== 'string') return '';
    // Prevent accidental remote dependency in the offline prototype.
    if(/^https?:\/\//i.test(path)) return '';
    return path.replace(/^\.\//, '');
  }

  async function loadManifest(){
    try{
      const res = await fetch('assets/manifest.json', { cache: 'no-cache' });
      if(!res.ok) throw new Error('manifest not found');
      state.manifest = await res.json();
    }catch(err){
      state.manifest = DEFAULT_MANIFEST;
      state.errors.push('asset manifest fallback: ' + err.message);
    }
    return state.manifest;
  }

  function estimateBytes(w, h){ return Math.max(0, (w || 0) * (h || 0) * 4); }

  function loadImage(asset){
    return new Promise((resolve) => {
      const src = safeUrl(asset.src);
      if(!src) return resolve(null);
      if(state.images.has(asset.id)) return resolve(state.images.get(asset.id));
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        state.images.set(asset.id, img);
        state.bytes += estimateBytes(img.naturalWidth, img.naturalHeight);
        resolve(img);
      };
      img.onerror = () => {
        state.errors.push('image load failed: ' + asset.id);
        resolve(null);
      };
      img.src = src;
    });
  }

  function loadAudio(asset){
    const src = safeUrl(asset.src);
    if(!src || state.audio.has(asset.id)) return null;
    const a = new Audio();
    a.preload = asset.preload || 'metadata';
    a.src = src;
    state.audio.set(asset.id, a);
    return a;
  }

  async function preloadCritical(){
    const manifest = state.manifest || await loadManifest();
    const critical = manifest.critical || [];
    const tasks = critical.map(asset => {
      if(asset.type === 'image') return loadImage(asset);
      if(asset.type === 'audio') return Promise.resolve(loadAudio(asset));
      return Promise.resolve(null);
    });
    await Promise.all(tasks);
    state.ready = true;
    return stats();
  }

  function getImage(id){ return state.images.get(id) || null; }
  function getAudio(id){ return state.audio.get(id) || null; }

  async function loadPack(packId){
    const manifest = state.manifest || await loadManifest();
    const pack = (manifest.packs || []).find(p => p.id === packId);
    if(!pack) return { ok:false, reason:'pack not found' };
    const assets = pack.assets || [];
    await Promise.all(assets.map(asset => asset.type === 'image' ? loadImage(asset) : Promise.resolve(loadAudio(asset))));
    return { ok:true, stats: stats() };
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
