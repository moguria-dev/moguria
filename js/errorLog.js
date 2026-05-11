window.MoguriaErrorLog = (() => {
  const logs=[]; const max=80; let panel;
  function push(type, args){
    const item={time:new Date().toISOString(), type, message: args.map(a=>{try{return typeof a==='string'?a:JSON.stringify(a)}catch(e){return String(a)}}).join(' ')};
    logs.unshift(item); logs.splice(max);
    if(panel && !panel.classList.contains('hidden')) render();
  }
  function install(){
    const oldError=console.error, oldWarn=console.warn;
    console.error=(...a)=>{push('error',a); oldError.apply(console,a);};
    console.warn=(...a)=>{push('warn',a); oldWarn.apply(console,a);};
    addEventListener('error', e=>push('window-error',[e.message, e.filename+':'+e.lineno]));
    addEventListener('unhandledrejection', e=>push('promise',[e.reason?.message || e.reason || 'unhandled rejection']));
    createPanel();
  }
  function createPanel(){
    panel=document.createElement('div'); panel.id='errorPanel'; panel.className='dev-panel hidden';
    panel.innerHTML='<div class="dev-panel-card"><button class="close-dev" data-close="errorPanel">×</button><h2>エラーログ</h2><p>実機で問題が出た時、この内容をコピーして共有できます。</p><textarea id="errorText" readonly></textarea><button id="copyErrors">コピー</button><button id="clearErrors">消す</button></div>';
    document.body.appendChild(panel);
    panel.querySelector('[data-close]').onclick=()=>panel.classList.add('hidden');
    panel.querySelector('#copyErrors').onclick=()=>navigator.clipboard?.writeText(format()).catch(()=>{});
    panel.querySelector('#clearErrors').onclick=()=>{logs.length=0;render();};
  }
  function format(){return logs.map(l=>`[${l.time}] ${l.type}: ${l.message}`).join('\n');}
  function render(){ const t=document.getElementById('errorText'); if(t) t.value=format() || 'ログはありません。'; }
  function show(){ if(!panel) createPanel(); render(); panel.classList.remove('hidden'); }
  return { install, push, show, get:()=>logs.slice() };
})();
