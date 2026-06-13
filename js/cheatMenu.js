window.MoguriaCheatMenu = (() => {
  let panel;
  let openButton;

  function enabled(){
    if (window.MoguriaSecurity?.isDevToolsAllowed) return MoguriaSecurity.isDevToolsAllowed();
    return false;
  }

  function init(){
    if (!enabled()) return;
    createButton();
  }

  function createButton(){
    if (openButton || document.getElementById('devOpenBtn')) return;
    openButton = document.createElement('button');
    openButton.id = 'devOpenBtn';
    openButton.type = 'button';
    openButton.textContent = 'DEV';
    openButton.onclick = show;
    document.body.appendChild(openButton);
  }

  function show(){
    if (!enabled()) {
      console.warn('[Moguria] dev menu is disabled on this host.');
      return;
    }
    if (!panel) create();
    refreshSelects();
    panel.classList.remove('hidden');
  }

  function addOptions(select, items){
    if (!select) return;
    select.textContent = '';
    for (const item of items || []) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.icon || ''} ${item.name || item.id}`.trim();
      select.appendChild(option);
    }
  }

  function create(){
    panel = document.createElement('div');
    panel.id = 'cheatPanel';
    panel.className = 'dev-panel hidden';
    panel.innerHTML = `
      <button type="button" data-close class="close" aria-label="閉じる">×</button>
      <h2>開発メニュー</h2>
      <p class="dev-warning">localhost / 127.0.0.1 かつ URL末尾 <code>#dev</code> または <code>?dev=1</code> の時だけ有効です。公開GitHub Pagesでは表示されません。</p>
      <div class="dev-actions">
        <button type="button" id="devExp">経験値+次Lv分</button>
        <button type="button" id="devHeal">全回復</button>
        <button type="button" id="devInv">無敵切替</button>
        <button type="button" id="devErrors">エラーログ</button>
        <button type="button" id="devSave">セーブ管理</button>
      </div>
      <div class="dev-grid">
        <label class="dev-row"><span>Waveへ移動</span><input id="devWave" type="number" min="1" max="99" value="1"></label>
        <button type="button" id="devGoWave">移動</button>
        <label class="dev-row"><span>スキル追加</span><select id="devSkill"></select></label>
        <button type="button" id="devAddSkill">追加</button>
        <label class="dev-row"><span>アーティファクト追加</span><select id="devArtifact"></select></label>
        <button type="button" id="devAddArtifact">追加</button>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('[data-close]').onclick = () => panel.classList.add('hidden');
    panel.querySelector('#devExp').onclick = () => window.MoguriaGame?.devAddExp?.();
    panel.querySelector('#devHeal').onclick = () => window.MoguriaGame?.devHeal?.();
    panel.querySelector('#devInv').onclick = () => alert('無敵: ' + (window.MoguriaGame?.devToggleInvincible?.() ? 'ON' : 'OFF'));
    panel.querySelector('#devErrors').onclick = () => window.MoguriaErrorLog?.show?.();
    panel.querySelector('#devSave').onclick = () => window.MoguriaSaveTools?.show?.();
    panel.querySelector('#devGoWave').onclick = () => window.MoguriaGame?.devGoWave?.(panel.querySelector('#devWave').value);
    panel.querySelector('#devAddSkill').onclick = () => window.MoguriaGame?.devAddSkill?.(panel.querySelector('#devSkill').value);
    panel.querySelector('#devAddArtifact').onclick = () => window.MoguriaGame?.devAddArtifact?.(panel.querySelector('#devArtifact').value);
  }

  function refreshSelects(){
    if (!panel) return;
    addOptions(panel.querySelector('#devSkill'), window.MoguriaSkills?.skills || []);
    addOptions(panel.querySelector('#devArtifact'), window.MoguriaSkills?.artifacts || []);
  }

  return { init, show, enabled };
})();
