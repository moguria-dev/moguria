window.MoguriaSecurity = (() => {
  function config(){
    return window.MoguriaConfig?.security || {};
  }

  function hasDevFlag(){
    const hash = String(location.hash || '').toLowerCase();
    const devInHash = /(^|[#&?])dev($|[=&])/i.test(hash) || hash === '#dev';
    let devInSearch = false;
    try {
      const params = new URLSearchParams(location.search || '');
      const value = params.get('dev');
      devInSearch = value === '1' || value === 'true' || value === '';
    } catch (_) {
      devInSearch = /[?&]dev(=1|=true|&|$)/i.test(location.search || '');
    }
    return devInHash || devInSearch;
  }

  function isLocalDevHost(){
    const allowed = config().allowDevToolsOnHosts || ['localhost', '127.0.0.1', ''];
    return allowed.includes(location.hostname);
  }

  function isDevToolsAllowed(){
    return Boolean(config().devToolsEnabled && isLocalDevHost() && hasDevFlag());
  }

  function init(){
    // ブラウザ単体ゲームなので完全なチート防止は不可。公開時の事故を減らすための軽い保護を行う。
    if (location.protocol === 'http:' && location.hostname && !isLocalDevHost()) {
      console.warn('[Moguria] HTTPSでの公開を推奨します。');
    }
    if (hasDevFlag() && !isDevToolsAllowed()) {
      console.warn('[Moguria] DEVフラグは検出されましたが、公開ホストでは開発メニューを無効化しています。');
    }
  }

  function makeRunSignature(run){
    // 改ざん防止ではなく、破損・簡易検証用の軽い署名。
    const src = JSON.stringify({ t: run.time, k: run.kills, d: run.maxDamage, w: run.floor });
    let h = 2166136261;
    for (let i = 0; i < src.length; i += 1) {
      h ^= src.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  return { init, hasDevFlag, isLocalDevHost, isDevToolsAllowed, makeRunSignature };
})();
