window.MoguriaSaveTools = (() => {
  let panel;

  function enabled(){
    return Boolean(window.MoguriaSecurity?.isDevToolsAllowed?.());
  }

  function show(){
    if (!enabled()) {
      console.warn('[Moguria] save tools are disabled on this host.');
      return;
    }
    if (!panel) create();
    refresh();
    panel.classList.remove('hidden');
  }

  function create(){
    panel = document.createElement('div');
    panel.id = 'savePanel';
    panel.className = 'dev-panel hidden';
    panel.innerHTML = `
      <button type="button" data-close class="close" aria-label="閉じる">×</button>
      <h2>セーブ管理</h2>
      <p class="dev-warning">開発・調査用です。公開ホストでは表示されません。</p>
      <textarea id="saveText" spellcheck="false"></textarea>
      <div class="dev-actions">
        <button type="button" id="exportSave">再読み込み</button>
        <button type="button" id="importSave">読み込み</button>
        <button type="button" id="resetSave">初期化</button>
      </div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('[data-close]').onclick = () => panel.classList.add('hidden');
    panel.querySelector('#exportSave').onclick = refresh;
    panel.querySelector('#importSave').onclick = importSave;
    panel.querySelector('#resetSave').onclick = () => {
      if (confirm('セーブを初期化しますか？')) {
        backup('before-reset');
        window.MoguriaSave?.reset?.();
        location.reload();
      }
    };
  }

  function backup(reason = 'manual'){
    if (!enabled()) return { ok: false, reason: 'disabled' };
    try {
      const data = window.MoguriaSave?.load?.();
      const key = (window.MoguriaConfig?.storage?.backupPrefix || 'moguria.backup.') + reason + '.' + Date.now();
      localStorage.setItem(key, JSON.stringify(data));
      return { ok: true, key };
    } catch (error) {
      console.warn('[MoguriaSaveTools] backup failed', error);
      return { ok: false, error };
    }
  }

  function refresh(){
    const text = document.getElementById('saveText');
    if (!text) return;
    try {
      text.value = JSON.stringify(window.MoguriaSave?.load?.() || {}, null, 2);
    } catch (error) {
      text.value = JSON.stringify({ error: error.message }, null, 2);
    }
  }

  function importSave(){
    if (!enabled()) return;
    const text = document.getElementById('saveText');
    try {
      const parsed = JSON.parse(text.value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('セーブJSONの形式が不正です。');
      backup('before-import');
      const normalized = window.MoguriaSave.normalize(parsed);
      const result = window.MoguriaSave.save(normalized);
      if (!result.ok) throw result.error || new Error('保存に失敗しました。');
      alert('読み込みました。再読み込みします。');
      location.reload();
    } catch (error) {
      alert('読み込みに失敗しました: ' + error.message);
    }
  }

  return { show, backup, enabled };
})();
