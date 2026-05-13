window.MoguriaHome = (() => {
  let save;

  function init(){
    save = MoguriaSave.applyTimeRecovery(MoguriaSave.load());

    document.getElementById('startBtn').onclick = () => {
      save = MoguriaSave.applyTimeRecovery(MoguriaSave.load());
      if(save.belly <= 0){
        document.getElementById('homeLine').textContent = 'Mogu、今日はいっぱい食べたみたい…少し休ませてあげよう。';
        document.getElementById('homeMogu').classList.add('idle');
        return;
      }
      save.belly -= 1; save.lastBellyAt = save.lastBellyAt || Date.now(); MoguriaSave.save(save); update(); MoguriaUI.show('game'); MoguriaGame.start();
    };

    document.getElementById('snackBtn').onclick = () => {
      save = MoguriaSave.applyTimeRecovery(MoguriaSave.load());
      const now = Date.now();
      if(now - (save.snackAt||0) < 1000*60*60*6){
        document.getElementById('homeLine').textContent = 'おやつはさっき食べたみたい。今はすやすやしてる。';
      } else {
        save.snackAt = now; save.belly = Math.min(save.maxBelly, save.belly + 1); MoguriaSave.save(save);
        document.getElementById('homeLine').textContent = 'おやつをもぐもぐ。少し元気になったみたい。';
      }
      update();
    };

    document.getElementById('dexBtn').onclick = () => MoguriaUI.showDex();
    document.getElementById('logsBtn').onclick = () => MoguriaUI.showLogs();
    const equipBtn=document.getElementById('equipBtn'); if(equipBtn) equipBtn.onclick=()=>MoguriaUI.showEquipment();
    const gachaBtn=document.getElementById('gachaBtn'); if(gachaBtn) gachaBtn.onclick=()=>MoguriaUI.showGacha();
    const outingBtn=document.getElementById('outingBtn'); if(outingBtn) outingBtn.onclick=()=>MoguriaUI.showOuting();
    update(); setInterval(()=>{save=MoguriaSave.applyTimeRecovery(MoguriaSave.load()); update();}, 30000);
  }

  function renderStartButton(btn, canStart){
    if(!btn) return;
    btn.innerHTML = canStart
      ? '<span>🚪</span><b>ダンジョンへ</b><small>Wave 12</small>'
      : '<span>🌙</span><b>Moguを休ませる</b><small>おなかいっぱい</small>';
    btn.style.filter = canStart ? 'none' : 'grayscale(.25)';
    btn.setAttribute('aria-label', canStart ? 'ダンジョンへ Wave 12' : 'Moguを休ませる おなかいっぱい');
  }

  function update(){
    save = MoguriaSave.applyTimeRecovery(MoguriaSave.load());
    document.getElementById('bellyText').textContent = `${save.belly}/${save.maxBelly}`;
    document.getElementById('bellyBar').style.width = `${(save.belly/save.maxBelly)*100}%`;
    renderStartButton(document.getElementById('startBtn'), save.belly > 0);
    const coinEl=document.getElementById('coinText');
    if(coinEl){ const meta=(window.MoguriaMeta?MoguriaMeta.load():save).meta||{}; coinEl.textContent=`MoguCoin ${meta.coins||0}`; }
    const last = save.runs && save.runs[0];
    if(last) applyVisual(document.getElementById('homeMogu'), last.visual);
  }

  function applyVisual(el, visual={}){
    el.classList.remove('poison','fire','ice','guard','summon');
    const top = Object.entries(visual).sort((a,b)=>b[1]-a[1])[0];
    if(top && top[1]>0) el.classList.add(top[0]);
  }

  return { init, update, applyVisual };
})();
