window.MoguriaCheatMenu = (() => {
  let panel;
  function enabled(){ return location.hash.includes('dev') || location.search.includes('dev=1'); }
  function init(){ if(!enabled()) return; createButton(); }
  function createButton(){
    const btn=document.createElement('button'); btn.id='devOpenBtn'; btn.textContent='DEV'; btn.onclick=show; document.body.appendChild(btn);
  }
  function show(){ if(!panel) create(); refreshSelects(); panel.classList.remove('hidden'); }
  function create(){
    panel=document.createElement('div'); panel.id='cheatPanel'; panel.className='dev-panel hidden';
    panel.innerHTML=`<div class="dev-panel-card"><button class="close-dev" data-close="cheatPanel">×</button><h2>開発メニュー</h2><p>テストプレイ短縮用。公開時はURLから #dev を外します。</p><div class="dev-grid"><button id="devExp">経験値+次Lv分</button><button id="devHeal">全回復</button><button id="devInv">無敵切替</button><button id="devErrors">エラーログ</button><button id="devSave">セーブ管理</button></div><label>Waveへ移動 <input id="devWave" type="number" min="1" max="12" value="7"><button id="devGoWave">移動</button></label><label>スキル追加 <select id="devSkill"></select><button id="devAddSkill">追加</button></label><label>アーティファクト追加 <select id="devArtifact"></select><button id="devAddArtifact">追加</button></label></div>`;
    document.body.appendChild(panel);
    panel.querySelector('[data-close]').onclick=()=>panel.classList.add('hidden');
    panel.querySelector('#devExp').onclick=()=>MoguriaGame.devAddExp?.();
    panel.querySelector('#devHeal').onclick=()=>MoguriaGame.devHeal?.();
    panel.querySelector('#devInv').onclick=()=>alert('無敵: '+(MoguriaGame.devToggleInvincible?.()?'ON':'OFF'));
    panel.querySelector('#devErrors').onclick=()=>MoguriaErrorLog.show();
    panel.querySelector('#devSave').onclick=()=>MoguriaSaveTools.show();
    panel.querySelector('#devGoWave').onclick=()=>MoguriaGame.devGoWave?.(panel.querySelector('#devWave').value);
    panel.querySelector('#devAddSkill').onclick=()=>MoguriaGame.devAddSkill?.(panel.querySelector('#devSkill').value);
    panel.querySelector('#devAddArtifact').onclick=()=>MoguriaGame.devAddArtifact?.(panel.querySelector('#devArtifact').value);
  }
  function refreshSelects(){
    const sk=panel?.querySelector('#devSkill'), ar=panel?.querySelector('#devArtifact'); if(!sk||!ar) return;
    sk.innerHTML=MoguriaSkills.skills.map(s=>`<option value="${s.id}">${s.icon||''} ${s.name}</option>`).join('');
    ar.innerHTML=MoguriaSkills.artifacts.map(a=>`<option value="${a.id}">${a.icon||''} ${a.name}</option>`).join('');
  }
  return { init, show };
})();
