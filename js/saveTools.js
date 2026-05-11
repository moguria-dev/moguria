window.MoguriaSaveTools = (() => {
  let panel;
  function show(){ if(!panel) create(); refresh(); panel.classList.remove('hidden'); }
  function create(){
    panel=document.createElement('div'); panel.id='savePanel'; panel.className='dev-panel hidden';
    panel.innerHTML=`<div class="dev-panel-card"><button class="close-dev" data-close="savePanel">×</button><h2>セーブ管理</h2><p>アップデート前の退避や、バグ調査用です。</p><textarea id="saveText"></textarea><div class="dev-row"><button id="exportSave">書き出し</button><button id="importSave">読み込み</button><button id="resetSave">初期化</button></div><small>公開版では通常非表示。URL末尾に <b>#dev</b> を付けると表示できます。</small></div>`;
    document.body.appendChild(panel);
    panel.querySelector('[data-close]').onclick=()=>panel.classList.add('hidden');
    panel.querySelector('#exportSave').onclick=refresh;
    panel.querySelector('#importSave').onclick=importSave;
    panel.querySelector('#resetSave').onclick=()=>{ if(confirm('セーブを初期化しますか？')){ backup(); MoguriaSave.reset(); location.reload(); } };
  }
  function backup(){ try{ localStorage.setItem((MoguriaConfig.storage.backupPrefix||'moguria.backup.')+Date.now(), JSON.stringify(MoguriaSave.load())); }catch(e){} }
  function refresh(){ const t=document.getElementById('saveText'); if(t) t.value=JSON.stringify(MoguriaSave.load(), null, 2); }
  function importSave(){
    const t=document.getElementById('saveText');
    try{ const parsed=JSON.parse(t.value); backup(); MoguriaSave.save(MoguriaSave.normalize(parsed)); alert('読み込みました。再読み込みします。'); location.reload(); }
    catch(e){ alert('読み込みに失敗しました: '+e.message); }
  }
  return { show, backup };
})();
