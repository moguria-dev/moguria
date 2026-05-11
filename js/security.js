window.MoguriaSecurity = (() => {
  function init(){
    // ブラウザ単体ゲームなので完全なチート防止は不可。ここでは公開時の事故を減らす軽い保護と運用メモを提供する。
    if(location.protocol === 'http:' && location.hostname && location.hostname !== '127.0.0.1' && location.hostname !== 'localhost'){
      console.warn('[Moguria] HTTPSでの公開を推奨します。');
    }
    if(location.hash.includes('dev')) console.warn('[Moguria] DEVモード中です。公開URLでは #dev を外してください。');
  }
  function makeRunSignature(run){
    // 改ざん防止ではなく、破損・簡易検証用の軽い署名。
    const src=JSON.stringify({t:run.time,k:run.kills,d:run.maxDamage,w:run.floor});
    let h=2166136261; for(let i=0;i<src.length;i++){h^=src.charCodeAt(i); h=Math.imul(h,16777619);} return (h>>>0).toString(16);
  }
  return { init, makeRunSignature };
})();
