(function(){
  const DEFAULT_TIMEOUT = 8000;

  async function fetchJson(url, options = {}){
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT);
    try{
      const res = await fetch(url, { cache: options.cache || 'no-cache', signal: controller.signal });
      if(!res.ok) throw new Error('HTTP ' + res.status);
      return { ok:true, data: await res.json() };
    }catch(err){
      return { ok:false, error: err.message };
    }finally{
      clearTimeout(timeout);
    }
  }

  function isOnline(){ return navigator.onLine !== false; }

  window.MoguriaNetwork = { fetchJson, isOnline };
})();
