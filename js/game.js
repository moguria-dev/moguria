window.MoguriaGame = (() => {
  let canvas, ctx, state;
  let fxSerial=0;
  let lifecycleBound=false;
  const keys={};
  const input={x:0,y:0,active:false};
  const BOSS_PATTERNS={
    midBoss:[
      {id:'starVolley',telegraph:.72,duration:.72,recover:.82},
      {id:'dash',telegraph:.58,duration:.46,recover:.88}
    ],
    boss:[
      {id:'nova',telegraph:.88,duration:.9,recover:.78},
      {id:'slam',telegraph:1.02,duration:.24,recover:1.0},
      {id:'dash',telegraph:.64,duration:.54,recover:.78}
    ]
  };
  const LEVEL_UP_CUE_SECONDS=.75;
  const DEFEAT_CUE_SECONDS=.58;
  const COLLECT_ALL_DROP_CHANCES=Object.freeze({normal:.0015,rare:.01,midBoss:.03,boss:.03});
  function init(){
    canvas=document.getElementById('gameCanvas'); ctx=canvas.getContext('2d'); resize();
    setupStick(); document.getElementById('giveupBtn').onclick=()=>endRun(true); document.getElementById('pauseBtn').onclick=()=>pauseRun(); document.getElementById('resumeBtn').onclick=()=>resumeRun(); document.getElementById('pauseGiveupBtn').onclick=()=>{ document.getElementById('pauseModal').classList.add('hidden'); endRun(true); };
    if(!lifecycleBound){
      lifecycleBound=true;
      document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') persistCheckpoint('visibility'); });
      addEventListener('pagehide',()=>persistCheckpoint('pagehide'));
    }
  }
  // battle-v3 owns the only full-size render surface. Keep the legacy canvas at
  // one pixel so older drawing helpers remain parse-compatible without a large
  // hidden DPR allocation.
  function resize(){ canvas.width=1; canvas.height=1; }
  function setupStick(){
    const game=document.getElementById('game'), stick=document.getElementById('stick'), knob=document.getElementById('knob');
    let activePointer=null;
    function centerKnob(){ const kx=(stick.clientWidth-knob.offsetWidth)/2, ky=(stick.clientHeight-knob.offsetHeight)/2; knob.style.left=kx+'px'; knob.style.top=ky+'px'; }
    function placeStick(cx,cy){
      const size=stick.offsetWidth||132;
      const edge=12;
      const safeBottom=parseFloat(getComputedStyle(game).getPropertyValue('--play-safe-bottom'))||0;
      const bottomGuard=safeBottom+58;
      const clampedX=Math.max(size/2+edge,Math.min(innerWidth-size/2-edge,cx));
      const clampedY=Math.max(size/2+edge,Math.min(innerHeight-size/2-bottomGuard,cy));
      stick.classList.add('floating');
      stick.style.left=(clampedX-size/2)+'px';
      stick.style.top=(clampedY-size/2)+'px';
      stick.style.opacity='1';
      centerKnob();
    }
    function move(cx,cy){
      const r=stick.getBoundingClientRect();
      const mx=cx-(r.left+r.width/2), my=cy-(r.top+r.height/2);
      const len=Math.hypot(mx,my)||1;
      const dead=6;
      const max=Math.max(34, stick.clientWidth*0.31);
      input.x=len>dead?mx/len:0; input.y=len>dead?my/len:0;
      const kx=(stick.clientWidth-knob.offsetWidth)/2, ky=(stick.clientHeight-knob.offsetHeight)/2;
      const clamp=Math.min(max,len);
      knob.style.left=(kx+(mx/len)*clamp)+'px';
      knob.style.top=(ky+(my/len)*clamp)+'px';
    }
    function shouldStart(e){
      if(!document.getElementById('game').classList.contains('active')) return false;
      if(e.target.closest('button,.modal,.overlay,.mini-stats')) return false;
      // 画面下側なら、スティックから多少ズレてもその位置を起点に操作開始できる。
      return e.clientY > innerHeight*0.48;
    }
    function start(e){
      if(!shouldStart(e) || input.active) return;
      e.preventDefault();
      input.active=true; activePointer=e.pointerId;
      game.setPointerCapture?.(e.pointerId);
      placeStick(e.clientX,e.clientY);
      move(e.clientX,e.clientY);
    }
    function drag(e){ if(!input.active || e.pointerId!==activePointer) return; e.preventDefault(); move(e.clientX,e.clientY); }
    function end(e){
      if(e && activePointer!==null && e.pointerId!==activePointer) return;
      input.x=0;input.y=0;input.active=false; activePointer=null; centerKnob();
      stick.classList.remove('floating'); stick.style.left=''; stick.style.top=''; stick.style.opacity='';
    }
    game.addEventListener('pointerdown',start,{passive:false});
    game.addEventListener('pointermove',drag,{passive:false});
    game.addEventListener('pointerup',end); game.addEventListener('pointercancel',end);
    centerKnob();
    addEventListener('keydown',e=>keys[e.key]=true); addEventListener('keyup',e=>keys[e.key]=false);
  }
  function start(options={}){
    window.MoguriaBattleV3?.stop?.();
    window.MoguriaPerformance?.start?.();
    const checkpoint=options.activeRun?.checkpoint && typeof options.activeRun.checkpoint==='object' ? options.activeRun.checkpoint : null;
    let player=MoguriaPlayer.create();
    if(checkpoint?.player) player=MoguriaPlayer.restore(checkpoint.player,player);
    else if(window.MoguriaMeta) MoguriaMeta.applyEquipmentToPlayer(player);
    state={ mode:'run', runId:String(options.runId||options.activeRun?.runId||''), startedAt:Number(options.activeRun?.startedAt)||Date.now(), p:player, enemies:[], bullets:[], enemyBullets:[], mines:[], fx:[], drops:[], companions:[], scheduled:[], dungeon:MoguriaDungeon.create(checkpoint?.dungeon?.seed||Date.now()), time:0, last:performance.now(), spawnCd:0, floor:1,
      wave:0, maxWave:MoguriaConfig.run.maxWave, timeLimit:MoguriaConfig.run.timeLimit||480, waveState:'ready', waveSpawned:0, waveTarget:0, waveClearTimer:0, cleared:false, timeout:false, introTimer:2.15, bossAlertTimer:0, clearTimer:0, mobEvent:null,
      stats:{kills:0,maxDamage:0,totalDamage:0,shots:0,crits:0,hitsTaken:0,dodges:0,explosions:0,poisonKills:0,rareKills:0,bossKills:0,combo:0,bestCombo:0}, rerolls:MoguriaConfig.run.rerolls, bans:2, bannedSkills:[], pendingChoice:null, levelUpCue:null, defeatCue:null, shake:0, hitStop:0, flash:0, particles:[], comboTimer:0, awakenTimer:0, dangerPulse:0, nearMissCd:0, bossPhaseTimer:0, artifactWaves:{}, mapBounds:{...MoguriaConfig.map}, depthCueShown:false, criticalCueCd:0, chainCueCd:0, returnGlow:0, checkpointElapsed:0, hudAt:0, finalizing:false };
    if(checkpoint) restoreCheckpoint(checkpoint);
    else { state.p.x=0; state.p.y=0; state.p.hp=state.p.maxHp; }
    if(state.pendingChoice) restorePendingChoice();
    MoguriaAudio?.play('start');
    pushFx({x:0,y:0,r:92,life:1.0,type:'startGlow'});
    if(options.resume && checkpoint) bigToast('冒険を再開','続きから、もぐろう');
    else bigToast('もぐ、いくよ','画面下をなぞって移動');
    updateHud(true);
    const renderer=window.MoguriaBattleV3;
    if(!renderer?.start) return failStartAfterSession('戦闘画面を開始できませんでした。');
    Promise.resolve(renderer.start(state,{step:battleStep})).then(()=>renderer.sync?.(state)).catch(error=>{
      console.error('[MoguriaGame] battle-v3 start failed',error);
      failStartAfterSession('戦闘画面を開始できませんでした。もう一度ためしてね。');
    });
  }
  function failStartAfterSession(message){
    persistCheckpoint('renderer-failed');
    window.MoguriaPerformance?.stop?.();
    window.MoguriaBattleV3?.stop?.();
    if(state) state.mode='pause';
    MoguriaUI?.show?.('home');
    const line=document.getElementById('homeLine'); if(line) line.textContent=message;
    return false;
  }

  function checkpointSnapshot(){
    if(!state?.p) return null;
    const pendingChoice=normalizePendingChoice(state.pendingChoice,state.mode);
    // A restored run waits briefly at the entrance with state.wave one behind
    // the wave it will restart. Persist the target wave during that window so
    // repeated pagehide/reload cycles cannot walk progress backwards.
    const entranceWave=state.introTimer>0&&state.waveState==='ready'?Math.min(state.maxWave,(Number(state.wave)||0)+1):state.wave;
    const checkpointWave=pendingChoice?.wave??entranceWave;
    return {
      version:1,
      savedAt:Date.now(),
      wave:Math.max(0,Math.min(state.maxWave,checkpointWave||0)),
      floor:Math.max(1,Math.min(state.maxWave,state.floor||1)),
      time:Math.max(0,state.time||0),
      player:MoguriaPlayer.snapshot(state.p),
      stats:{...state.stats},
      rerolls:state.rerolls,
      bans:state.bans,
      bannedSkills:[...(state.bannedSkills||[])],
      artifactWaves:{...(state.artifactWaves||{})},
      choiceType:pendingChoice?.type||null,
      pendingChoice,
      defeated:state.mode==='defeat'||(Number(state.p.hp)||0)<=0,
      dungeon:{seed:state.dungeon?.seed||0}
    };
  }
  function persistCheckpoint(reason='interval'){
    if(!state?.runId || !state.p || ['ended','finalizing','settlementError'].includes(state.mode)) return {ok:false,reason:'not-active'};
    const checkpoint=checkpointSnapshot();
    if(!checkpoint) return {ok:false,reason:'no-state'};
    const result=window.MoguriaSave?.updateCheckpoint?.(state.runId,{checkpoint,checkpointReason:reason});
    if(result?.ok) state.checkpointElapsed=0;
    else if(result?.reason==='save-failed') state.saveWarning=true;
    return result||{ok:false,reason:'save-api-missing'};
  }
  function restoreCheckpoint(checkpoint){
    if(!state || !checkpoint || Number(checkpoint.version)!==1) return false;
    state.time=Math.max(0,Number(checkpoint.time)||0);
    const savedWave=Math.max(0,Math.min(state.maxWave,Math.floor(Number(checkpoint.wave)||0)));
    state.stats={...state.stats,...(checkpoint.stats&&typeof checkpoint.stats==='object'?checkpoint.stats:{})};
    const savedRerolls=Number(checkpoint.rerolls);
    if(Number.isFinite(savedRerolls)) state.rerolls=Math.max(0,Math.floor(savedRerolls));
    state.bans=Math.max(0,Math.floor(Number(checkpoint.bans) || 0));
    state.bannedSkills=Array.isArray(checkpoint.bannedSkills)?checkpoint.bannedSkills.filter(x=>typeof x==='string'):[];
    state.artifactWaves=checkpoint.artifactWaves&&typeof checkpoint.artifactWaves==='object'?{...checkpoint.artifactWaves}:{};
    state.pendingChoice=normalizePendingChoice(checkpoint.pendingChoice,checkpoint.choiceType);
    if(!state.pendingChoice) state.pendingChoice=inferLegacyPendingChoice(checkpoint,savedWave);
    const pendingWave=Math.max(0,Math.min(state.maxWave,Math.floor(Number(state.pendingChoice?.wave)||savedWave)));
    if(checkpoint.defeated || (Number(state.p.hp)||0)<=0){
      state.p.hp=0;
      state.wave=savedWave;
      state.floor=Math.max(1,savedWave||1);
      state.introTimer=0;
      state.mode='defeat';
      state.defeatCue={remaining:DEFEAT_CUE_SECONDS,duration:DEFEAT_CUE_SECONDS};
      state.pendingChoice=null;
    } else if(state.pendingChoice?.type==='artifact'){
      // The artifact modal opens only after this wave is cleared. Resume at the
      // cleared wave so choosing an artifact advances exactly once.
      state.wave=pendingWave;
      state.floor=Math.max(1,pendingWave||1);
      state.introTimer=0;
      state.mode='artifact';
      delete state.artifactWaves[pendingWave];
    } else {
      // Ordinary checkpoints (including a pending level-up) restart the current
      // wave from its entrance. Player progress and run stats remain retained.
      const restartWave=state.pendingChoice?.type==='skill'?pendingWave:savedWave;
      state.wave=Math.max(0,restartWave-1);
      state.floor=Math.max(1,restartWave||1);
      state.introTimer=.72;
      if(state.pendingChoice?.type==='skill') state.mode='choice';
    }
    state.p.x=Math.max(state.mapBounds.minX+state.p.r,Math.min(state.mapBounds.maxX-state.p.r,Number(state.p.x)||0));
    state.p.y=Math.max(state.mapBounds.minY+state.p.r,Math.min(state.mapBounds.maxY-state.p.r,Number(state.p.y)||0));
    return true;
  }
  function normalizePendingChoice(value,fallbackType=''){
    const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    let type=source.type||fallbackType;
    if(type==='choice') type='skill';
    if(type!=='skill'&&type!=='artifact') return null;
    const rawIds=Array.isArray(source.choiceIds)?source.choiceIds:(Array.isArray(source.choices)?source.choices:[]);
    const choiceIds=[...new Set(rawIds.map(entry=>typeof entry==='string'?entry:entry?.id).filter(id=>typeof id==='string'&&id))].slice(0,3);
    const wave=Math.max(0,Math.min(state?.maxWave||MoguriaConfig.run.maxWave||12,Math.floor(Number(source.wave)||Number(state?.wave)||0)));
    const pending={type,wave,choiceIds};
    if(type==='skill'){
      pending.level=Math.max(1,Math.floor(Number(source.level)||Number(state?.p?.lv)||1));
      pending.exp=Math.max(0,Number.isFinite(Number(source.exp))?Number(source.exp):(Number(state?.p?.exp)||0));
      pending.nextExp=Math.max(1,Number.isFinite(Number(source.nextExp))?Number(source.nextExp):(Number(state?.p?.nextExp)||1));
    }
    return pending;
  }
  function inferLegacyPendingChoice(checkpoint,savedWave){
    // v3 checkpoints created before pendingChoice existed can still be repaired.
    // At each artifact gate the old code marked the wave before the player chose.
    const artifactTarget=savedWave===3?1:savedWave===7?2:0;
    if(artifactTarget && checkpoint.artifactWaves?.[savedWave] && (state.p.artifacts?.length||0)<artifactTarget){
      return normalizePendingChoice({type:'artifact',wave:savedWave});
    }
    // Every completed level after Lv.1 grants exactly one skill level. A deficit
    // means the snapshot was taken after leveling but before the card was chosen.
    const selectedLevels=Object.values(state.p.skillLevels||{}).reduce((sum,value)=>sum+Math.max(0,Math.floor(Number(value)||0)),0);
    if(selectedLevels<Math.max(0,(Number(state.p.lv)||1)-1)){
      return normalizePendingChoice({type:'skill',wave:savedWave,level:state.p.lv,exp:state.p.exp,nextExp:state.p.nextExp});
    }
    return null;
  }
  function rememberPendingChoice(type,wave,choices){
    state.pendingChoice=normalizePendingChoice({
      type,
      wave,
      choiceIds:(choices||[]).map(choice=>choice?.id).filter(Boolean),
      level:state.p?.lv,
      exp:state.p?.exp,
      nextExp:state.p?.nextExp
    });
    return state.pendingChoice;
  }
  function restorePendingChoice(){
    const pending=normalizePendingChoice(state?.pendingChoice);
    if(!pending) return false;
    state.pendingChoice=pending;
    if(pending.type==='artifact') openArtifactChoice(pending.wave,pending.choiceIds);
    else levelUp({resume:true,choiceIds:pending.choiceIds,wave:pending.wave});
    return true;
  }
  function scheduleAction(delay,fn){
    if(!state || typeof fn!=='function') return;
    state.scheduled.push({remaining:Math.max(0,Number(delay)||0),runId:state.runId,fn});
  }
  function updateScheduled(dt){
    if(!state?.scheduled?.length) return;
    const pending=[];
    for(const item of state.scheduled){
      item.remaining-=dt;
      if(item.remaining<=0){
        if(item.runId===state.runId && state.mode==='run') item.fn();
      } else pending.push(item);
    }
    state.scheduled=pending;
  }

  function pauseRun(){
    if(!state || state.mode!=='run') return;
    persistCheckpoint('pause'); state.mode='pause'; renderPause();
    const resume=document.getElementById('resumeBtn'); if(resume) resume.textContent='冒険に戻る';
    document.getElementById('pauseModal').classList.remove('hidden');
  }
  function resumeRun(){
    if(!state) return;
    if(state.mode==='settlementError'){
      document.getElementById('pauseModal').classList.add('hidden');
      settlePendingRun();
      return;
    }
    if(state.mode!=='pause') return;
    document.getElementById('pauseModal').classList.add('hidden'); state.mode='run'; state.last=performance.now();
  }
  function renderPause(){
    const p=state.p, wrap=document.getElementById('pauseSkills');
    document.getElementById('pauseSummary').textContent=`Wave ${Math.max(1,state.wave)}/${state.maxWave}｜Lv.${p.lv}｜HP ${Math.max(0,Math.floor(p.hp))}/${p.maxHp}`;
    const artHtml = p.artifacts && p.artifacts.length ? '<h3 class="pause-subhead">アーティファクト</h3>'+p.artifacts.map(a=>`<div class="pause-skill artifact-row"><span class="ico">${a.icon||'🏺'}</span><span><b>${a.name}</b><small>${a.tags.join(' / ')}｜${a.desc}</small></span></div>`).join('') : '';
    if(!p.skills.length){ wrap.innerHTML=artHtml+'<div class="item"><b>まだ何も食べていません</b><small>レベルアップで食べた力がここに並びます。</small></div>'; return; }
    wrap.innerHTML=artHtml+'<h3 class="pause-subhead">食べたスキル</h3>'+p.skills.map(s=>`<div class="pause-skill"><span class="ico">${s.icon||'🍽️'}</span><span><b>${s.name}${s.fusion?' ✦':` Lv.${p.skillLevels?.[s.id]||1}`}</b><small>${s.tags.join(' / ')}｜${s.desc}</small></span></div>`).join('');
  }
  function applyDamageToPlayer(rawDamage, invuln=.55){
    const p=state.p;
    if(p.devInvincible){ p.invuln=invuln; return 0; }
    const dmg=Math.max(1,(Number(rawDamage)||1)-p.armor);
    if(p.shield>0){
      const before=p.shield;
      p.shield=Math.max(0,p.shield-dmg);
      if(before>0 && p.shield<=0 && p.shieldBurst) explosion(p.x,p.y,p.explosionRadius*1.4,45,true);
    } else p.hp-=dmg;
    state.stats.hitsTaken++;
    p.invuln=invuln;
    return dmg;
  }
  function waveLabel(w){ if(w===7) return '中ボス'; if(w===12) return '大ボス'; return `Wave ${w}`; }
  function toast(text){
    const el=document.createElement('div'); el.className='wave-toast'; el.textContent=text; document.getElementById('game').appendChild(el); setTimeout(()=>el.remove(),1700);
  }
  function bigToast(text, sub=''){
    const el=document.createElement('div'); el.className='big-cue'; el.innerHTML=`<b>${text}</b>${sub?`<span>${sub}</span>`:''}`;
    document.getElementById('game').appendChild(el); setTimeout(()=>el.remove(),2200);
  }

  function perfQuality(){ return window.MoguriaPerformance?.getQuality?.() || 'high'; }
  function reduceFx(){ return !!(window.MoguriaPerformance?.shouldReduceEffects?.()); }
  function fxLimit(){ return MoguriaConfig.performance.maxFx || 70; }
  function pushFx(f){
    if(!state || !state.fx) return;
    if(reduceFx() && (f.type==='boom' || f.type==='waveClear' || f.type==='eatGlow') && Math.random()<.28) return;
    if(!f.id) f.id=`fx_${++fxSerial}`;
    if(!f.createdAt) f.createdAt=state.time||0;
    state.fx.push(f);
    if(state.fx.length>fxLimit()) state.fx.splice(0,state.fx.length-fxLimit());
  }
  function chooseMobEvent(wave){
    if(wave===7 || wave===12) return null;
    if(Math.random()>0.34) return null;
    // 序盤はビルドがまだ固まっていないため、硬すぎる敵など進行困難になりやすいイベントは出さない。
    const pool=[
      {id:'swarm', label:'ぷにぷに大行進', sub:'小さな敵がたくさん来るよ', extra:12, spawnMul:.55}
    ];
    if(wave>=3) pool.push({id:'bats', label:'ふわふわ夜風', sub:'すばしっこい敵が増えたよ', extra:7, spawnMul:.7});
    if(wave>=6) pool.push({id:'tank', label:'かちかち注意報', sub:'とても硬い敵が混ざったよ', extra:4, spawnMul:.95});
    return pool[Math.floor(Math.random()*pool.length)];
  }
  function startNextWave(){
    if(!state) return;
    state.wave++;
    if(state.wave>state.maxWave){
      state.wave=state.maxWave;
      state.cleared=true; state.clearTimer=2.1; state.returnGlow=2.1; MoguriaAudio?.play('return'); state.flash=Math.max(state.flash,.28); sparkleBurst(state.p.x,state.p.y,42,'#fff0a6'); bigToast('ふわっと帰還！','Mogu、無事に帰れそう…'); return;
    }
    state.waveSpawned=0; state.spawnCd=.2; state.waveClearTimer=0; state.mobEvent=null;
    if(state.wave===7 || state.wave===12){
      state.waveState='bossAlert'; state.bossAlertTimer=1.75; state.waveTarget=1;
      MoguriaAudio?.play('boss');
      state.flash=Math.max(state.flash,.22); state.shake=Math.max(state.shake,6);
      bigToast(state.wave===7?'何か大きい気配…':'森の奥がざわざわする…', state.wave===7?'中ボスが来るよ':'大ボスが来るよ');
      return;
    }
    state.waveState='spawning';
    state.mobEvent=chooseMobEvent(state.wave);
    const extra=state.mobEvent ? state.mobEvent.extra : 0;
    state.waveTarget = Math.min(44, 8 + state.wave*3 + extra);
    toast(`${waveLabel(state.wave)} はじまるよ`);
    if(state.mobEvent) setTimeout(()=>bigToast(state.mobEvent.label,state.mobEvent.sub),260);
  }
  function spawnEnemySafe(wave, opts={}){
    let e=null;
    for(let tries=0; tries<10; tries++){
      e=MoguriaEnemies.spawn(wave,canvas.width,canvas.height,state.p,opts);
      const ok=state.enemies.every(o=>Math.hypot(o.x-e.x,o.y-e.y)>(o.r+e.r+10));
      if(ok) break;
    }
    state.enemies.push(e);
    return e;
  }

  function updateWave(dt){
    if(state.clearTimer>0){ state.clearTimer-=dt; if(state.clearTimer<=0) endRun(false); return; }
    if(state.introTimer>0){ state.introTimer-=dt; if(state.introTimer<=0){ startNextWave(); } return; }
    if(state.waveState==='bossAlert'){
      state.bossAlertTimer-=dt;
      if(state.bossAlertTimer<=0){
        state.waveState='spawning';
        spawnEnemySafe(state.wave,state.wave===7?{midBoss:true}:{boss:true});
      }
      return;
    }
    if(state.wave===7 || state.wave===12){
      if(state.enemies.length===0){ state.waveClearTimer+=dt; if(state.waveClearTimer>.9) afterWaveClear(); }
      return;
    }
    state.spawnCd-=dt;
    if(state.spawnCd<=0 && state.waveSpawned<state.waveTarget){
      const mul=state.mobEvent ? state.mobEvent.spawnMul : 1;
      state.spawnCd=Math.max(.16,.75-state.wave*.025)*mul;
      const rare=Math.random()<.055;
      const opts=rare ? {rare} : (state.mobEvent ? {event:state.mobEvent.id} : {});
      const spawned=spawnEnemySafe(state.wave,opts);
      state.waveSpawned++;
      if(rare){ MoguriaAudio?.play('rare'); sparkleBurst(spawned.x,spawned.y,24,'#ffd15c'); pushFx({x:spawned.x,y:spawned.y,r:58,life:1.0,type:'rarePulse'}); toast('金のぷにが出た！'); }
    }
    if(state.waveSpawned>=state.waveTarget && state.enemies.length===0){ state.waveClearTimer+=dt; if(state.waveClearTimer>.75) afterWaveClear(); }
  }


  function afterWaveClear(){
    if(!state || state.mode!=='run') return;
    pushFx({x:state.p.x,y:state.p.y,r:96,life:.72,type:'waveClear'}); sparkleBurst(state.p.x,state.p.y,20,'#fff0a6');
    if((state.wave===3 || state.wave===7) && !state.artifactWaves[state.wave]){
      openArtifactChoice(state.wave);
      return;
    }
    startNextWave();
    persistCheckpoint('wave');
  }
  function openArtifactChoice(wave,savedChoiceIds=[]){
    state.mode='artifact';
    const available=new Map(MoguriaSkills.artifacts.filter(a=>!state.p.artifacts.some(owned=>owned.id===a.id)).map(a=>[a.id,a]));
    const choices=[];
    for(const id of savedChoiceIds||[]){ const choice=available.get(id); if(choice&&!choices.some(a=>a.id===id)) choices.push(choice); }
    for(const choice of MoguriaSkills.weightedArtifactChoices(3,state.p.artifacts)){
      if(choices.length>=3) break;
      if(!choices.some(a=>a.id===choice.id)) choices.push(choice);
    }
    rememberPendingChoice('artifact',wave,choices);
    const wrap=document.getElementById('artifactChoices');
    wrap.innerHTML='';
    for(const a of choices){
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='skill-card artifact-choice';
      const visualKind=visualKindForArtifact(a);
      btn.dataset.artifactId=a.id;
      btn.dataset.kvKind=visualKind;
      btn.setAttribute('aria-label',`${a.name}を選ぶ。${a.desc}`);
      btn.innerHTML=`<div class="skill-head"><span class="skill-icon" data-kv-kind="${visualKind}" aria-hidden="true"></span><b>${a.name}</b></div><span>${a.desc}</span><em>${a.tags.map(t=>`<i class="tag ${tagClass(t)}">${t}</i>`).join('')}</em><strong class="artifact-choice__pick" aria-hidden="true">選ぶ</strong>`;
      let chosen=false;
      const choose=(ev)=>{
        if(ev){ev.preventDefault();ev.stopPropagation();}
        if(chosen || !state || state.mode!=='artifact') return;
        chosen=true;
        MoguriaAudio?.play('artifact');
        state.p.artifacts.push(a);
        a.apply(state.p,state);
        state.artifactWaves[wave]=true;
        state.pendingChoice=null;
        state.flash=Math.max(state.flash,.18); sparkleBurst(state.p.x,state.p.y,34,'#ffe27c');
        document.getElementById('artifactModal').classList.add('hidden');
        toast(`${a.name}を手に入れた！`);
        state.mode='run'; state.last=performance.now();
        startNextWave();
        persistCheckpoint('artifact');
        window.MoguriaBattleV3?.sync?.(state);
      };
      btn.addEventListener('click', choose, {passive:false});
      wrap.appendChild(btn);
    }
    window.MoguriaKVVisualRefresh?.decorateAll?.();
    const title=document.getElementById('artifactTitle');
    if(title) title.textContent = wave===3 ? '前半のアーティファクト' : '中盤のアーティファクト';
    document.getElementById('artifactModal').classList.remove('hidden');
  }

  function battleStep(dt){
    if(!state) return state;
    window.MoguriaPerformance?.recordFrame?.(dt*1000);
    dt=Math.max(0,Math.min(.033,Number(dt)||0));
    if(state.mode==='levelup'){
      updateLevelUpCue(dt);
      return state;
    }
    if(state.mode==='defeat'){
      if(state.defeatCue){
        state.defeatCue.remaining=Math.max(0,(Number(state.defeatCue.remaining)||0)-dt);
        if(state.defeatCue.remaining<=0){ state.defeatCue=null; endRun(false); }
      } else endRun(false);
      return state;
    }
    if(state.mode!=='run') return state;
    if(state.hitStop>0){ state.hitStop=Math.max(0,state.hitStop-dt); return state; }
    state.time+=dt;
    state.checkpointElapsed=(state.checkpointElapsed||0)+dt;
    updateScheduled(dt);
    update(dt);
    if(state && state.mode==='run' && state.checkpointElapsed>=(MoguriaConfig.performance.checkpointSeconds||20)) persistCheckpoint('interval');
    return state;
  }
  // Compatibility hook for old modal callbacks. Phaser remains the sole frame
  // owner; this only asks the Scene to reflect the latest state immediately.
  function loop(){
    window.MoguriaBattleV3?.sync?.(state);
  }
  function update(dt){
    const p=state.p;
    let ix=input.x + (keys.ArrowRight||keys.d?1:0) - (keys.ArrowLeft||keys.a?1:0);
    let iy=input.y + (keys.ArrowDown||keys.s?1:0) - (keys.ArrowUp||keys.w?1:0);
    const il=Math.hypot(ix,iy)||1; if(Math.hypot(ix,iy)>0){ix/=il;iy/=il;}
    p.x += ix*p.speed*dt; p.y += iy*p.speed*dt;
    const mb=state.mapBounds; p.x=Math.max(mb.minX+p.r,Math.min(mb.maxX-p.r,p.x)); p.y=Math.max(mb.minY+p.r,Math.min(mb.maxY-p.r,p.y));
    p.invuln=Math.max(0,p.invuln-dt); p.attackCd-=dt; p.attackAnimTimer=Math.max(0,(p.attackAnimTimer||0)-dt);
    state.awakenTimer=Math.max(0,(state.awakenTimer||0)-dt);
    state.dangerPulse=Math.max(0,(state.dangerPulse||0)-dt); state.nearMissCd=Math.max(0,(state.nearMissCd||0)-dt); state.bossPhaseTimer=Math.max(0,(state.bossPhaseTimer||0)-dt); state.criticalCueCd=Math.max(0,(state.criticalCueCd||0)-dt); state.chainCueCd=Math.max(0,(state.chainCueCd||0)-dt); state.returnGlow=Math.max(0,(state.returnGlow||0)-dt);
    if(p.hp/p.maxHp<.28 && state.dangerPulse<=0){ state.dangerPulse=.75; state.flash=Math.max(state.flash,.08); } p.summonCd-=dt; if(p.regen>0) p.hp=Math.min(p.maxHp,p.hp+p.regen*dt);
    state.floor = state.wave || 1;
    if(state.timeLimit && state.time>=state.timeLimit && !state.cleared){
      state.timeout=true;
      bigToast('時間切れ…','Mogu、今日はここまでみたい');
      endRun(false);
      return;
    }
    updateWave(dt);
    if(state.mode!=='run') return;
    if(state.introTimer>0 || state.bossAlertTimer>0 || state.clearTimer>0) { updateHud(); return; }
    if(!state.depthCueShown && state.wave>=9){ state.depthCueShown=true; bigToast('光が少し遠い…','深く潜りすぎている'); state.flash=Math.max(state.flash,.12); }
    updateSpecialAttacks(dt);
    updateCompanions(dt);
    for(const e of state.enemies){
      const dx=p.x-e.x, dy=p.y-e.y, l=Math.hypot(dx,dy)||1;
      const slowMul = e.slow>0 ? .48 : 1;
      e.slow=Math.max(0,(e.slow||0)-dt);
      if((e.kind==='boss'||e.kind==='midBoss') && !e.phase2 && e.hp/e.maxHp<.5){
        e.phase2=true; e.speed*=1.18; e.dmg=Math.ceil(e.dmg*1.2); state.bossPhaseTimer=2.2; state.shake=Math.max(state.shake,8); state.flash=Math.max(state.flash,.16); sparkleBurst(e.x,e.y,34,'#d9b3ff'); pushFx({x:e.x,y:e.y,r:e.r*2.4,life:.9,type:'bossPhase'}); bigToast('空気が変わった…','ボスが光をゆがめている'); MoguriaAudio?.play('phase');
      }
      const bossHandled=(e.kind==='boss'||e.kind==='midBoss') ? updateBossAction(e,p,dt) : false;
      if(bossHandled){
        // The boss state machine owns movement and attacks for this frame.
      } else if(e.kind==='rare'){
        // レア敵はMoguから逃げ続けず、ふらふら自由に動く。端に張り付いた時だけ中央へ戻る。
        e.wanderTurn=(e.wanderTurn||.8)-dt;
        if(e.wanderTurn<=0){ e.wanderTurn=.45+Math.random()*1.1; e.wanderAngle=(e.wanderAngle||0)+(Math.random()-.5)*1.9; }
        const mb=state.mapBounds;
        const margin=170;
        let steerX=0, steerY=0;
        if(e.x<mb.minX+margin) steerX+=1;
        if(e.x>mb.maxX-margin) steerX-=1;
        if(e.y<mb.minY+margin) steerY+=1;
        if(e.y>mb.maxY-margin) steerY-=1;
        const sx=Math.cos(e.wanderAngle||0)+steerX*1.35;
        const sy=Math.sin(e.wanderAngle||0)+steerY*1.35;
        const sl=Math.hypot(sx,sy)||1;
        e.x+=sx/sl*e.speed*slowMul*dt; e.y+=sy/sl*e.speed*slowMul*dt;
      } else if(e.behavior==='ranged'){
        // 遠距離敵は距離を取りながら小さな弾を撃つ。
        if(l<260){ e.x-=dx/l*e.speed*.75*slowMul*dt; e.y-=dy/l*e.speed*.75*slowMul*dt; }
        else if(l>360){ e.x+=dx/l*e.speed*.55*slowMul*dt; e.y+=dy/l*e.speed*.55*slowMul*dt; }
        e.attackCd=(e.attackCd||1)-dt;
        if(e.attackCd<=0 && l<520){ e.attackCd=e.kind==='midBoss'?1.15:2.1; e.attackVisualTimer=.3; addEnemyBullet(e.x,e.y,-dx/l*160,-dy/l*160,e.kind==='midBoss'?12:7); }
      } else if(e.behavior==='charge'){
        e.chargeCd=(e.chargeCd||1)-dt;
        const boost=e.chargeCd<.42?2.15:1;
        if(e.chargeCd<=0) e.chargeCd=1.55+Math.random()*.6;
        e.x+=dx/l*e.speed*boost*slowMul*dt; e.y+=dy/l*e.speed*boost*slowMul*dt;
      } else if(e.behavior==='swarm'){
        const wiggle=Math.sin(state.time*5+e.id)*.55;
        e.x+=(dx/l+Math.cos(wiggle)*.32)*e.speed*slowMul*dt; e.y+=(dy/l+Math.sin(wiggle)*.32)*e.speed*slowMul*dt;
      } else {
        e.x+=dx/l*e.speed*slowMul*dt; e.y+=dy/l*e.speed*slowMul*dt;
      }
      const mb=state.mapBounds; e.x=Math.max(mb.minX+e.r,Math.min(mb.maxX-e.r,e.x)); e.y=Math.max(mb.minY+e.r,Math.min(mb.maxY-e.r,e.y));
      const contactDist=Math.hypot(p.x-e.x,p.y-e.y);
      e.hitFlash=Math.max(0,e.hitFlash-dt);
      e.attackVisualTimer=Math.max(0,(Number(e.attackVisualTimer)||0)-dt);
      if(e.hitFlash>0 && !e.bossAction) e.visualState='hurt';
      else if(!e.bossAction && e.visualState==='hurt') e.visualState='';
      if(e.poison>0){ e.poison-=dt; e.poisonTick-=dt; if(e.poisonTick<=0){ e.poisonTick=.5; hurtEnemy(e,p.poisonPower,false,'poison'); } }
      if(contactDist>=e.r+p.r && contactDist<e.r+p.r+10 && p.invuln<=0 && state.nearMissCd<=0){
        state.nearMissCd=.9; state.hitStop=Math.max(state.hitStop,.018); addFx(p.x,p.y-22,'ぎりっ','#fff0a6'); MoguriaAudio?.play('miss'); pushFx({x:p.x,y:p.y,r:42,life:.26,type:'nearMiss'});
      }
      if(contactDist<e.r+p.r && p.invuln<=0){
        if(Math.random()<p.dodge){ state.stats.dodges++; p.invuln=.45; if(p.dodgeShot) shootAtNearest(7,true); if(p.dodgeBomb) explosion(p.x,p.y,p.explosionRadius*.8,18,true); }
        else { applyDamageToPlayer(e.dmg,.55); if(p.thorns) hurtEnemy(e,p.thorns,false,'thorn'); }
        e.attackVisualTimer=.3;
      }
    }
    separateEnemies(dt);
    if(p.attackCd<=0){ p.attackCd=p.attackRate; if(shootAtNearest(p.baseDamage*MoguriaPlayer.damageMultiplier(p),false)) p.attackAnimTimer=.38; }
    for(const b of state.bullets){ b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt; }
    for(const eb of state.enemyBullets||[]){ eb.x+=eb.vx*dt; eb.y+=eb.vy*dt; eb.life-=dt; if(Math.hypot(eb.x-p.x,eb.y-p.y)<p.r+eb.r && p.invuln<=0){ if(Math.random()<p.dodge){ state.stats.dodges++; p.invuln=.35; } else applyDamageToPlayer(eb.dmg,.45); eb.dead=true; } }
    for(const eb of state.enemyBullets||[]){
      if(!eb.dead && state.nearMissCd<=0 && p.invuln<=0){
        const nd=Math.hypot(eb.x-p.x,eb.y-p.y);
        if(nd>=p.r+eb.r && nd<p.r+eb.r+12){ state.nearMissCd=.9; addFx(p.x,p.y-24,'ひやっ','#fff0a6'); MoguriaAudio?.play('miss'); pushFx({x:p.x,y:p.y,r:44,life:.26,type:'nearMiss'}); }
      }
    }
    state.enemyBullets=(state.enemyBullets||[]).filter(b=>b.life>0&&!b.dead);
    for(const b of state.bullets){
      if(b.dead) continue;
      for(const e of state.enemies){
        if(e.hp>0 && !b.hitIds.includes(e.id) && Math.hypot(e.x-b.x,e.y-b.y)<e.r+b.r){
          b.hitIds.push(e.id);
          const crit=Math.random()<p.crit;
          let dmg=b.dmg*(crit?2.1:1);
          if(crit){state.stats.crits++; if(p.critChain) p.crit=Math.min(.7,p.crit+.006);}
          hurtEnemy(e,dmg,crit,b.summon?'summon':'shot');
          if(Math.random()<p.poisonChance){e.poison=3.5;e.poisonTick=.1;}
          if(p.freezeChance && Math.random()<p.freezeChance){ e.slow=1.35; addFx(e.x,e.y,'slow','#bfefff'); }
          if(b.split && b.splitDepth<1){
            const base=Math.atan2(b.vy,b.vx);
            for(const a of [base+1.05, base-1.05]) addBullet(e.x,e.y,Math.cos(a)*300,Math.sin(a)*300,b.dmg*.52,4,false,{splitDepth:b.splitDepth+1});
          }
          if(b.summon && p.summonExplode && Math.random()<.28) explosion(e.x,e.y,p.explosionRadius*.75,14,true);
          if(b.pierce>0){ b.pierce--; } else { b.dead=true; }
          break;
        }
      }
    }
    state.bullets=state.bullets.filter(b=>b.life>0&&!b.dead);
    updateDrops(dt);
    state.drops=state.drops.filter(d=>!d.dead).slice(-(MoguriaConfig.performance.maxDrops||120));
    state.enemies=state.enemies.filter(e=>e.hp>0 && Math.hypot(e.x-p.x,e.y-p.y)<1800);
    while(p.exp>=p.nextExp){ p.exp-=p.nextExp; levelUp(); return; }
    for(const f of state.fx) f.life-=dt; state.fx=state.fx.filter(f=>f.life>0); if(state.fx.length>fxLimit()) state.fx.splice(0,state.fx.length-fxLimit());
    state.shake=Math.max(0,state.shake-dt*18); state.flash=Math.max(0,state.flash-dt*1.6); state.comboTimer=Math.max(0,(state.comboTimer||0)-dt); if(state.comboTimer<=0) state.stats.combo=0;
    for(const pp of state.particles||[]){ pp.x+=pp.vx*dt; pp.y+=pp.vy*dt; pp.vx*=Math.pow(.06,dt); pp.vy*=Math.pow(.06,dt); pp.life-=dt; }
    state.particles=(state.particles||[]).filter(pp=>pp.life>0).slice(-MoguriaConfig.performance.maxParticles);
    if(p.hp>0 && p.hp/p.maxHp<.18 && state.criticalCueCd<=0){ state.criticalCueCd=5.5; state.hitStop=Math.max(state.hitStop,.035); state.dangerPulse=.8; MoguriaAudio?.play('danger'); pushFx({x:p.x,y:p.y,r:74,life:.5,type:'criticalRing'}); }
    if(p.hp<=0 && state.mode==='run'){
      p.hp=0;
      state.mode='defeat';
      state.defeatCue={remaining:DEFEAT_CUE_SECONDS,duration:DEFEAT_CUE_SECONDS};
      state.shake=Math.max(state.shake,4);
      state.flash=Math.max(state.flash,.12);
      persistCheckpoint('defeat');
    }
    updateHud();
  }
  function chooseBossPattern(e){
    const pool=BOSS_PATTERNS[e.kind]||BOSS_PATTERNS.boss;
    const cursor=Math.max(0,Math.floor(e.patternCursor||0));
    e.patternCursor=cursor+1;
    return pool[cursor%pool.length];
  }
  function startBossAction(e,p){
    const pattern=chooseBossPattern(e);
    const phaseMul=e.phase2?.82:1;
    e.bossAction={...pattern,stage:'telegraph',timer:pattern.telegraph*phaseMul,elapsed:0,fired:false,targetX:p.x,targetY:p.y,telegraphFxId:null};
    e.visualState='telegraph';
    const telegraphRadius=pattern.id==='slam'?e.r*4.1:pattern.id==='nova'?e.r*3.4:e.r*2.3;
    const telegraphFx={x:e.x,y:e.y,tx:p.x,ty:p.y,r:telegraphRadius,life:pattern.telegraph*phaseMul,maxLife:pattern.telegraph*phaseMul,type:'bossTelegraph',pattern:pattern.id};
    pushFx(telegraphFx);
    e.bossAction.telegraphFxId=telegraphFx.id;
  }
  function updateBossAction(e,p,dt){
    if(!e.bossAction){
      e.bossCooldown=(Number(e.bossCooldown)||1.25)-dt;
      if(e.bossCooldown<=0) startBossAction(e,p);
      return false;
    }
    const action=e.bossAction;
    action.timer-=dt; action.elapsed+=dt;
    if(action.stage==='telegraph'){
      e.visualState='telegraph';
      if(action.pattern==='dash'||action.id==='dash'){
        action.targetX=p.x; action.targetY=p.y;
        const telegraphFx=state.fx.find(f=>f.id===action.telegraphFxId);
        if(telegraphFx){ telegraphFx.x=e.x; telegraphFx.y=e.y; telegraphFx.tx=p.x; telegraphFx.ty=p.y; }
      }
      if(action.timer<=0){
        action.stage='execute'; action.timer=action.duration; action.elapsed=0; action.fired=false; e.visualState='attack';
        MoguriaAudio?.play('boss'); state.shake=Math.max(state.shake,4);
      }
      return true;
    }
    if(action.stage==='execute'){
      e.visualState='attack';
      executeBossPattern(e,p,action,dt);
      if(action.timer<=0){ action.stage='recover'; action.timer=action.recover; action.elapsed=0; e.visualState='recover'; }
      return true;
    }
    e.visualState='recover';
    if(action.timer<=0){ e.bossAction=null; e.bossCooldown=(e.kind==='boss'?1.28:1.62)*(e.phase2?.82:1); e.visualState='move'; }
    return true;
  }
  function executeBossPattern(e,p,action,dt){
    const id=action.id||action.pattern;
    if(id==='dash'){
      const dx=action.targetX-e.x,dy=action.targetY-e.y,l=Math.hypot(dx,dy)||1;
      e.x+=dx/l*e.speed*5.4*dt; e.y+=dy/l*e.speed*5.4*dt;
      if(!action.fired && action.timer<action.duration*.48){ action.fired=true; pushFx({x:e.x,y:e.y,r:e.r*1.5,life:.28,type:'bossImpact'}); }
      return;
    }
    if(id==='starVolley' && !action.fired){
      action.fired=true;
      const base=Math.atan2(p.y-e.y,p.x-e.x);
      for(const offset of [-.44,-.22,0,.22,.44]) addEnemyBullet(e.x,e.y,Math.cos(base+offset)*185,Math.sin(base+offset)*185,e.phase2?13:10);
      return;
    }
    if(id==='nova' && !action.fired){
      action.fired=true;
      const count=e.phase2?16:12;
      for(let i=0;i<count;i++){ const a=i*Math.PI*2/count+(e.phase2?.16:0); addEnemyBullet(e.x,e.y,Math.cos(a)*155,Math.sin(a)*155,e.phase2?15:12); }
      pushFx({x:e.x,y:e.y,r:e.r*3.4,life:.5,type:'bossImpact'});
      return;
    }
    if(id==='slam' && !action.fired){
      action.fired=true;
      const radius=e.r*4.1;
      pushFx({x:e.x,y:e.y,r:radius,life:.48,type:'bossImpact'});
      if(Math.hypot(p.x-e.x,p.y-e.y)<radius+p.r && p.invuln<=0){
        applyDamageToPlayer(e.dmg,.65); state.shake=Math.max(state.shake,9);
      }
    }
  }
  function separateEnemies(dt){
    // 敵が重なると見た目も当たり判定も分かりにくくなるため、軽い押し出しで密集をほぐす。
    const enemies=state.enemies;
    const maxChecks=260;
    let checks=0;
    for(let i=0;i<enemies.length;i++){
      const a=enemies[i];
      if(a.hp<=0) continue;
      for(let j=i+1;j<enemies.length;j++){
        if(++checks>maxChecks) return;
        const b=enemies[j];
        if(b.hp<=0) continue;
        const dx=b.x-a.x, dy=b.y-a.y;
        const dist=Math.hypot(dx,dy)||0.001;
        const min=(a.r+b.r)*0.92;
        if(dist<min){
          const push=(min-dist)*0.5;
          const nx=dx/dist, ny=dy/dist;
          const aHeavy=(a.kind==='boss'||a.kind==='midBoss'||a.behavior==='tank')?0.55:1;
          const bHeavy=(b.kind==='boss'||b.kind==='midBoss'||b.behavior==='tank')?0.55:1;
          a.x-=nx*push*bHeavy; a.y-=ny*push*bHeavy;
          b.x+=nx*push*aHeavy; b.y+=ny*push*aHeavy;
        }
      }
    }
  }

  function updateCompanions(dt){
    const p=state.p;
    const count=Math.max(0,Math.min(6,Math.floor(Number(p.summons)||0)));
    while(state.companions.length<count){
      const index=state.companions.length;
      state.companions.push({id:`friend_${index}_${state.runId}`,x:p.x+(index%2?30:-30),y:p.y+24,r:10,attackCd:index*.12,attackFlash:0,visualState:'move'});
    }
    if(state.companions.length>count) state.companions.length=count;
    const cadence=Math.max(.22,(p.summonRate||1.1)/Math.max(1,count*.75));
    for(let i=0;i<state.companions.length;i++){
      const friend=state.companions[i];
      const angle=state.time*1.35+i*Math.PI*2/Math.max(1,count);
      const targetX=p.x+Math.cos(angle)*(38+Math.min(20,count*3));
      const targetY=p.y+24+Math.sin(angle)*22;
      const follow=1-Math.exp(-dt*7.5);
      friend.x+=(targetX-friend.x)*follow;
      friend.y+=(targetY-friend.y)*follow;
      friend.attackCd-=dt;
      friend.attackFlash=Math.max(0,(friend.attackFlash||0)-dt);
      friend.visualState=friend.attackFlash>0?'attack':'move';
      if(friend.attackCd<=0){
        friend.attackCd+=cadence;
        if(shootAtNearest(6+count*2,true,friend)){ friend.attackFlash=.18; friend.visualState='attack'; }
      }
    }
  }

  function shootAtNearest(dmg,summon,origin){
    const p=state.p, source=origin||p; let best=null, bd=999999;
    const range = summon ? (p.summonRange||MoguriaConfig.combat.summonRange) : (p.attackRange||MoguriaConfig.combat.attackRange);
    for(const e of state.enemies){
      if(e.kind==='rare' && (e.fleeLife||9)<.15) continue;
      const d=(e.x-source.x)**2+(e.y-source.y)**2;
      if(d<bd){bd=d;best=e;}
    }
    // 画面外や遠すぎる敵を無意識に倒さないよう、Moguが認知できる距離だけ攻撃する。
    if(!best || bd>range*range) return false;
    const dx=best.x-source.x, dy=best.y-source.y, l=Math.hypot(dx,dy)||1;
    const speed=summon?330:380;
    if(!summon && p.fanShot){
      const base=Math.atan2(dy,dx);
      for(const a of [base-.28, base, base+.28]){
        addBullet(source.x,source.y,Math.cos(a)*speed,Math.sin(a)*speed,dmg*.86,6,false,{pierce:p.pierce,split:p.splitShot});
      }
    } else {
      addBullet(source.x,source.y,dx/l*speed,dy/l*speed,dmg,summon?5:6,summon,{pierce:summon?0:p.pierce,split:(!summon&&p.splitShot),sourceId:source.id});
    }
    return true;
  }
  function addBullet(x,y,vx,vy,dmg,r,summon,opts={}){
    if(state.bullets.length > (MoguriaConfig.performance.maxProjectiles||80)) return;
    state.bullets.push({x,y,vx,vy,r,dmg,life:1.7,summon,sourceId:opts.sourceId||'',pierce:opts.pierce||0,split:!!opts.split,splitDepth:opts.splitDepth||0,hitIds:[]});
    state.stats.shots++;
  }
  function addEnemyBullet(x,y,vx,vy,dmg){
    if(!state.enemyBullets) state.enemyBullets=[];
    if(state.enemyBullets.length>36) return;
    state.enemyBullets.push({x,y,vx,vy,dmg,r:5,life:3.2});
  }
  function updateSpecialAttacks(dt){
    const p=state.p;
    if(p.auraDamage>0 && p.auraRadius>0){
      p.auraTick-=dt;
      if(p.auraTick<=0){
        p.auraTick=.28;
        for(const e of state.enemies){
          if(e.hp>0 && Math.hypot(e.x-p.x,e.y-p.y)<p.auraRadius+e.r){
            hurtEnemy(e,p.auraDamage,false,'aura');
          }
        }
        pushFx({x:p.x,y:p.y,r:p.auraRadius,life:.22,type:'auraPulse'});
      }
    }
    if(p.meteor){
      p.meteorCd-=dt;
      if(p.meteorCd<=0){
        p.meteorCd=p.meteorRate;
        const candidates=state.enemies.filter(e=>e.hp>0 && Math.hypot(e.x-p.x,e.y-p.y)<560);
        if(candidates.length){
          const e=candidates[Math.floor(Math.random()*candidates.length)];
          pushFx({x:e.x,y:e.y-130,tx:e.x,ty:e.y,life:.38,type:'meteor'});
          scheduleAction(.22,()=>explosion(e.x,e.y,state.p.explosionRadius*.95,24+state.p.explosionPower*.35,true));
        }
      }
    }
    if(p.lightning){
      p.lightningCd-=dt;
      if(p.lightningCd<=0){
        p.lightningCd=p.lightningRate;
        const cfg = MoguriaConfig.combat || {};
        const startRange = cfg.lightningStartRange || 320;
        const chainRange = cfg.lightningChainRange || 175;
        const playerLimit = cfg.lightningPlayerLimit || 390;
        const used = new Set();
        let last = {x:p.x,y:p.y};
        for(let jump=0; jump<Math.max(1,p.lightningJumps); jump++){
          const range = jump===0 ? startRange : chainRange;
          const next = state.enemies
            .filter(e=>e.hp>0 && !used.has(e) && Math.hypot(e.x-last.x,e.y-last.y)<range && Math.hypot(e.x-p.x,e.y-p.y)<playerLimit)
            .sort((a,b)=>Math.hypot(a.x-last.x,a.y-last.y)-Math.hypot(b.x-last.x,b.y-last.y))[0];
          if(!next) break;
          used.add(next);
          pushFx({x:last.x,y:last.y,tx:next.x,ty:next.y,life:.22,type:'lightning'});
          hurtEnemy(next,14+p.baseDamage*.45,false,'lightning');
          last=next;
        }
      }
    }
    if(p.orbitDamage>0 && p.orbitRadius>0){
      p.orbitTick-=dt;
      if(p.orbitTick<=0){
        p.orbitTick=.34;
        for(const e of state.enemies){ if(e.hp>0 && Math.hypot(e.x-p.x,e.y-p.y)<p.orbitRadius+e.r) hurtEnemy(e,p.orbitDamage,false,'orbit'); }
      }
    }
    if(p.mine){
      p.mineCd-=dt;
      if(p.mineCd<=0){ p.mineCd=p.mineRate; state.mines=state.mines||[]; if(state.mines.length<18) state.mines.push({x:p.x,y:p.y,r:19,life:8}); }
    }
    for(const m of state.mines||[]){
      m.life-=dt;
      for(const e of state.enemies){ if(!m.dead && e.hp>0 && Math.hypot(e.x-m.x,e.y-m.y)<m.r+e.r){ m.dead=true; explosion(m.x,m.y,state.p.explosionRadius*.95,22+state.p.explosionPower*.35,true); break; } }
    }
    state.mines=(state.mines||[]).filter(m=>m.life>0&&!m.dead);
  }
  function hurtEnemy(e,dmg,crit,source){
    if((e.kind==='boss'||e.kind==='midBoss'||e.kind==='rare') && state.p.bossDamageBonus) dmg*=1+state.p.bossDamageBonus;
    e.hp-=dmg; e.hitFlash=.08; state.stats.totalDamage+=dmg; state.stats.maxDamage=Math.max(state.stats.maxDamage,Math.floor(dmg));
    if(dmg>10){ state.hitStop=Math.max(state.hitStop, Math.min(.045, dmg/2400)); }
    if(Math.random()<.55) MoguriaAudio?.play('hit');
    addImpact(e.x,e.y,crit?'#ffe27c':(source==='poison'?'#b68ad7':source==='lightning'?'#bfefff':'#fff0a6'), crit?9:5);
    addFx(e.x,e.y,Math.floor(dmg)+(crit?'!':''),crit?'#ffe27c':'#fff');
    if(e.hp<=0) killEnemy(e,source);
  }
  function collectAllDropChance(kind){
    return COLLECT_ALL_DROP_CHANCES[kind]??COLLECT_ALL_DROP_CHANCES.normal;
  }
  function maybeDropCollectAll(e){
    if(!state || state.drops.some(drop=>drop.kind==='collectAll'&&!drop.dead)) return false;
    if(Math.random()>=collectAllDropChance(e?.kind)) return false;
    state.drops.push({x:e.x+(Math.random()*24-12),y:e.y+(Math.random()*24-12),kind:'collectAll',rare:true});
    return true;
  }
  function collectDrop(drop,p){
    if(drop.kind==='collectAll'){
      drop.dead=true;
      for(const other of state.drops){
        if(other!==drop&&!other.dead&&(other.kind==='exp'||other.kind==='heal')) other.forceMagnet=true;
      }
      state.flash=Math.max(state.flash,.18);
      sparkleBurst(drop.x,drop.y,34,'#c9f7ff');
      pushFx({x:drop.x,y:drop.y,r:110,life:.72,type:'waveClear'});
      addFx(drop.x,drop.y,'ぜんぶあつまれ！','#dffcff');
      MoguriaAudio?.play('rare');
      return;
    }
    if(drop.kind==='heal'){
      const heal=Math.max(0,Number(drop.heal)||18);
      p.hp=Math.min(p.maxHp,p.hp+heal);
      drop.dead=true;
      addFx(drop.x,drop.y,'+'+heal+'HP','#9be58b');
      MoguriaAudio?.play('eat');
      return;
    }
    if(drop.kind==='exp'){
      const baseExp=Math.max(0,Number(drop.exp)||0);
      const gain=baseExp*(1+(Number(p.xpBonus)||0));
      if(Number.isFinite(gain)) p.exp+=gain;
      drop.dead=true;
      if(gain>0) addFx(drop.x,drop.y,'+EXP','#fff0a6');
      return;
    }
    // Unknown runtime drops must never poison EXP with undefined/NaN values.
    drop.dead=true;
  }
  function updateDrops(dt){
    const p=state.p;
    for(const drop of state.drops){
      if(drop.dead) continue;
      const dx=p.x-drop.x, dy=p.y-drop.y;
      const dist=Math.hypot(dx,dy);
      const attractRadius=p.magnetRadius||82;
      const forceMagnet=!!drop.forceMagnet&&(drop.kind==='exp'||drop.kind==='heal');
      if(dist>0.001&&(forceMagnet||dist<attractRadius)){
        drop.magnet=true;
        const pull=forceMagnet?Math.min(2200,900+dist*4):Math.min(760,170+(attractRadius-dist)*7.2);
        const travel=Math.min(dist,pull*dt);
        drop.x+=dx/dist*travel;
        drop.y+=dy/dist*travel;
      }
      if(Math.hypot(p.x-drop.x,p.y-drop.y)<30) collectDrop(drop,p);
    }
  }
  function killEnemy(e,source){
    const p=state.p; state.stats.kills++; state.stats.combo=(state.stats.combo||0)+1; state.stats.bestCombo=Math.max(state.stats.bestCombo||0,state.stats.combo||0); state.comboTimer=1.55; MoguriaAudio?.play('kill'); if(source==='poison') state.stats.poisonKills++; if(e.kind==='rare'){ state.stats.rareKills++; pushFx({x:e.x,y:e.y,r:82,life:.9,type:'rareBurst'}); sparkleBurst(e.x,e.y,38,'#ffd15c'); }
    if((state.stats.combo>=10 && state.stats.combo%10===0) && state.chainCueCd<=0){ state.chainCueCd=.9; MoguriaAudio?.play('chain'); pushFx({x:p.x,y:p.y,r:92+state.stats.combo*2.2,life:.52,type:'megaChain'}); }
    if(state.stats.combo===12 || state.stats.combo===24 || state.stats.combo===40){ state.awakenTimer=2.2; state.flash=Math.max(state.flash,.2); state.shake=Math.max(state.shake,5); sparkleBurst(p.x,p.y,42,'#fff0a6'); pushFx({x:p.x,y:p.y,r:130,life:.8,type:'chainBurst'}); bigToast('もぐ覚醒！', `${state.stats.combo}連鎖のひかり`); }
    if(e.kind==='boss'||e.kind==='midBoss'){ state.stats.bossKills++; pushFx({x:e.x,y:e.y,r:e.r*3.2,life:1.05,type:'bossFade'}); state.shake=Math.max(state.shake,9); sparkleBurst(e.x,e.y,48,'#d9b3ff'); }
    state.drops.push({x:e.x,y:e.y,exp:e.exp,rare:e.kind==='rare'||e.kind==='boss'||e.kind==='midBoss',kind:'exp'});
    pushFx({x:e.x,y:e.y,tx:p.x,ty:p.y,life:.42,type:'absorb'});
    if(Math.random()<((e.kind==='boss'||e.kind==='midBoss') ? .75 : e.kind==='rare' ? .45 : .075)){
      state.drops.push({x:e.x+(Math.random()*32-16),y:e.y+(Math.random()*32-16),kind:'heal',heal:e.kind==='normal'?18:34,rare:e.kind!=='normal'});
    }
    maybeDropCollectAll(e);
    if(p.lifesteal) p.hp=Math.min(p.maxHp,p.hp+p.lifesteal);
    if(e.splitOnDeath && e.kind==='normal'){ for(let i=0;i<2;i++){ const child={...e,id:Date.now()+Math.random(),name:'ちびぷに',maxHp:18,hp:18,r:10,dmg:6,exp:3,speed:58,splitOnDeath:false,behavior:'swarm',x:e.x+(i?18:-18),y:e.y+(Math.random()*16-8),kind:'normal',poison:0,poisonTick:0,slow:0,hitFlash:0}; state.enemies.push(child); } }
    if(Math.random()<p.killExplodeChance || (p.toxicBurst && e.poison>0)){ explosion(e.x,e.y,p.explosionRadius,p.explosionPower,true); }
    if(p.poisonCloud && e.poison>0){ for(const o of state.enemies){ if(o!==e && Math.hypot(o.x-e.x,o.y-e.y)<90){o.poison=3;o.poisonTick=.1;} } }
  }
  function explosion(x,y,r,dmg,chain){
    state.stats.explosions++; MoguriaAudio?.play('boom'); state.shake=Math.max(state.shake,Math.min(10,r/18)); state.hitStop=Math.max(state.hitStop,.025); pushFx({x,y,r,life:.38,type:'boom'}); sparkleBurst(x,y,Math.min(26,Math.floor(r/5)),'#ffcf80');
    for(const e of state.enemies){ if(e.hp>0 && Math.hypot(e.x-x,e.y-y)<r){ const was=e.hp; hurtEnemy(e,dmg,false,'explosion'); if(was>0 && e.hp<=0 && chain && state.p.chainExplosion) scheduleAction(.035,()=>explosion(e.x,e.y,r*.82,dmg*.62,false)); } }
  }
  function addFx(x,y,text,color){ pushFx({x,y,text,color,life:.55,type:'text'}); }
  function updateLevelUpCue(dt){
    const cue=state?.levelUpCue;
    const pending=normalizePendingChoice(state?.pendingChoice);
    if(pending?.type!=='skill'){
      state.levelUpCue=null;
      state.mode='run';
      state.last=performance.now();
      return;
    }
    if(!cue){
      levelUp({resume:true,choiceIds:pending.choiceIds,wave:pending.wave});
      return;
    }
    cue.remaining=Math.max(0,(Number(cue.remaining)||0)-dt);
    if(cue.remaining>0) return;
    state.levelUpCue=null;
    levelUp({resume:true,choiceIds:pending.choiceIds,wave:pending.wave});
  }
  function levelUp(options={}){
    const resume=!!options.resume;
    if(!resume){
      state.p.lv++;
      // レベルアップ頻度は少し重めに。1回の「食べる」に価値を出す。
      state.p.nextExp = Math.floor(MoguriaConfig.exp.base + Math.pow(state.p.lv, MoguriaConfig.exp.power) * MoguriaConfig.exp.scale); if(state.p.expDiscount>0){ state.p.nextExp=Math.floor(state.p.nextExp*MoguriaConfig.exp.discountRate); state.p.expDiscount--; }
    }
    updateHud();
    const available=new Map(MoguriaSkills.skills.filter(s=>(state.p.skillLevels?.[s.id]||0)<(MoguriaSkills.MAX_SKILL_LEVEL||5)&&!state.bannedSkills.includes(s.id)).map(s=>[s.id,s]));
    let choices=[];
    for(const id of options.choiceIds||[]){ const choice=available.get(id); if(choice&&!choices.some(s=>s.id===id)) choices.push(choice); }
    for(const choice of MoguriaSkills.weightedChoices(3,state.p,state.bannedSkills)){
      if(choices.length>=3) break;
      if(!choices.some(s=>s.id===choice.id)) choices.push(choice);
    }
    rememberPendingChoice('skill',options.wave??state.wave,choices);
    if(!resume){
      state.mode='levelup';
      state.levelUpCue={remaining:LEVEL_UP_CUE_SECONDS,duration:LEVEL_UP_CUE_SECONDS,level:state.p.lv};
      updateHud();
      // Persist the incremented level and exact cards before the celebratory gap.
      // A reload during the cue restores the modal directly without replaying it.
      persistCheckpoint('levelup');
      MoguriaAudio?.play('level');
      state.flash=Math.max(state.flash,.22);
      state.shake=Math.max(state.shake,3);
      sparkleBurst(state.p.x,state.p.y,42,'#fff0a6');
      pushFx({x:state.p.x,y:state.p.y,r:118,life:.75,type:'waveClear'});
      bigToast('LEVEL UP!',`Lv.${state.p.lv} ひかりが満ちた`);
      return;
    }
    state.mode='choice';
    state.levelUpCue=null;
    const wrap=document.getElementById('skillChoices');
    const rerollBtn=document.getElementById('rerollBtn');
    const rerollCount=document.getElementById('rerollCount');
    function renderChoices(){
      wrap.innerHTML='';
      if(rerollCount) rerollCount.textContent=state.rerolls;
      if(rerollBtn) rerollBtn.disabled=state.rerolls<=0;
      for(const s of choices){
        const btn=document.createElement('div');
        btn.className='skill-card '+s.rarity;
        const visualKind=visualKindForSkill(s);
        btn.dataset.skillId=s.id;
        btn.dataset.kvKind=visualKind;
        const currentLv = state.p.skillLevels?.[s.id] || 0;
        btn.innerHTML=`<div class="skill-head"><span class="skill-icon" data-kv-kind="${visualKind}" aria-hidden="true">${s.icon||'🍽️'}</span><b>${s.name}<small class="skill-lv">Lv.${currentLv}→${currentLv+1}</small></b></div><span>${s.desc}</span><em>${s.tags.map(t=>`<i class="tag ${tagClass(t)}">${t}</i>`).join('')}</em><button class="ban-skill" type="button">封印 ${state.bans}</button>`;
        const banBtn=btn.querySelector('.ban-skill');
        if(banBtn){ banBtn.disabled=state.bans<=0; banBtn.addEventListener('click',(ev)=>{ ev.preventDefault(); ev.stopPropagation(); if(!state||state.mode!=='choice'||state.bans<=0) return; state.bans--; state.bannedSkills.push(s.id); MoguriaAudio?.play('select'); choices=MoguriaSkills.weightedChoices(3,state.p,state.bannedSkills); rememberPendingChoice('skill',state.pendingChoice?.wave??state.wave,choices); renderChoices(); }); }
        let chosen=false;
        const choose=(ev)=>{
          if(ev){ ev.preventDefault(); ev.stopPropagation(); }
          if(chosen || !state || state.mode!=='choice') return;
          chosen=true;
          MoguriaAudio?.play('eat');
          state.p.skillLevels = state.p.skillLevels || {};
          state.p.skillLevels[s.id]=(state.p.skillLevels[s.id]||0)+1;
          if(!state.p.skills.find(x=>x.id===s.id)) state.p.skills.push(s);
          s.apply(state.p);
          state.pendingChoice=null;
          const fused = MoguriaSkills.checkFusions?.(state.p) || [];
          state.flash=Math.max(state.flash,.18); sparkleBurst(state.p.x,state.p.y,26,s.rarity==='legendary'?'#ffd15c':s.rarity==='rare'?'#d9b3ff':'#fff0a6');
          pushFx({x:state.p.x,y:state.p.y,r:72,life:.48,type:'eatGlow'});
          pushFx({x:state.p.x,y:state.p.y,r:96,life:.56,type:'waveClear'});
          if(fused.length){ state.flash=Math.max(state.flash,.34); state.shake=Math.max(state.shake,7); bigToast('スキル合体！', fused[0].name); sparkleBurst(state.p.x,state.p.y,58,'#ffe27c'); pushFx({x:state.p.x,y:state.p.y,r:150,life:.9,type:'megaChain'}); }
          document.getElementById('levelModal').classList.add('hidden');
          state.mode='run';
          state.last=performance.now();
          persistCheckpoint('skill');
          loop(state.last);
        };
        btn.addEventListener('click', choose);
        wrap.appendChild(btn);
      }
      window.MoguriaKVVisualRefresh?.decorateAll?.();
    }
    if(rerollBtn){
      rerollBtn.onclick=(ev)=>{
        ev.preventDefault(); ev.stopPropagation();
        if(!state || state.mode!=='choice' || state.rerolls<=0) return;
        state.rerolls--;
        choices=MoguriaSkills.weightedChoices(3,state.p,state.bannedSkills);
        rememberPendingChoice('skill',state.pendingChoice?.wave??state.wave,choices);
        renderChoices();
      };
    }
    renderChoices();
    document.getElementById('levelModal').classList.remove('hidden');
  }
  function endRun(giveup){
    if(!state || state.finalizing || state.mode==='ended') return;
    state.finalizing=true; state.mode='finalizing';
    const p=state.p, synergies=MoguriaSkills.detectSynergies(p);
    const run={ runId:state.runId, startedAt:state.startedAt, date:Date.now(), floor:Math.min(state.maxWave,Math.max(1,state.floor||state.wave||1)), wave:Math.min(state.maxWave,Math.max(1,state.wave||1)), cleared:state.cleared, lv:p.lv, survived:Math.floor(state.time), kills:state.stats.kills, maxDamage:state.stats.maxDamage, totalDamage:Math.floor(state.stats.totalDamage), dps:Math.floor(state.stats.totalDamage/Math.max(1,state.time)), critRate:Math.floor((state.stats.crits/Math.max(1,state.stats.shots))*100), dodgeRate:Math.floor((state.stats.dodges/Math.max(1,state.stats.dodges+state.stats.hitsTaken))*100), explosions:state.stats.explosions, bestCombo:state.stats.bestCombo||0, timeout:state.timeout, skills:p.skills.map(s=>({id:s.id,name:s.name,tags:s.tags,rarity:s.rarity,level:p.skillLevels?.[s.id]||1,fusion:!!s.fusion})), artifacts:(p.artifacts||[]).map(a=>({id:a.id,name:a.name,tags:a.tags})), synergies, visual:p.visual, giveup };
    run.name=MoguriaResult.buildName(run); run.comment=giveup?'今日は無理せず帰ってきたね。こういう日も大事。':(run.timeout?'時間いっぱいまでよく潜ったね。次はもっと早く強くなれそう。':MoguriaResult.comment(run)); run.titles=MoguriaResult.titles(run);
    state.pendingRun=run;
    settlePendingRun();
  }
  function settlePendingRun(){
    if(!state?.pendingRun) return false;
    state.mode='finalizing'; state.finalizing=true;
    const result=window.MoguriaMeta?.awardFromRun?.(state.pendingRun);
    if(result?.ok || result?.alreadySettled){
      if(result.amount!=null) state.pendingRun.coins=result.amount;
      state.mode='ended'; state.finalizing=false;
      const resume=document.getElementById('resumeBtn'); if(resume) resume.textContent='冒険に戻る';
      window.MoguriaPerformance?.stop?.();
      window.MoguriaBattleV3?.stop?.({preserveFrame:true});
      MoguriaUI.showResult(state.pendingRun);
      return true;
    }
    state.mode='settlementError'; state.finalizing=false;
    const summary=document.getElementById('pauseSummary');
    if(summary) summary.textContent='冒険記録を保存できませんでした。空き容量を確認して、保存を再試行してください。';
    const resume=document.getElementById('resumeBtn');
    if(resume) resume.textContent='保存を再試行';
    document.getElementById('pauseModal')?.classList.remove('hidden');
    return false;
  }
  function updateHud(force=false){
    const now=performance.now();
    if(!force && now<(state.hudAt||0)) return;
    state.hudAt=now+90;
    const p=state.p, game=document.getElementById('game');
    document.getElementById('lv').textContent=p.lv;
    document.getElementById('hp').textContent=Math.max(0,Math.floor(p.hp));
    document.getElementById('exp').textContent=Math.floor(p.exp);
    document.getElementById('nextExp').textContent=p.nextExp;
    if(game){
      const hpRatio=Math.max(0,Math.min(1,p.hp/Math.max(1,p.maxHp)));
      const expRatio=Math.max(0,Math.min(1,p.exp/Math.max(1,p.nextExp)));
      game.style.setProperty('--play-hp-ratio',`${(hpRatio*100).toFixed(2)}%`);
      game.style.setProperty('--play-exp-ratio',`${(expRatio*100).toFixed(2)}%`);
    }
    const remain=Math.max(0,Math.ceil((state.timeLimit||0)-state.time));
    const m=Math.floor(remain/60),s=(remain%60).toString().padStart(2,'0');
    document.getElementById('timer').textContent=`${m}:${s}`;
    const waveEl=document.getElementById('wave');
    if(waveEl) waveEl.textContent=Math.max(1,state.wave);
    document.getElementById('miniStats').innerHTML=`残り ${m}:${s}<br>最大DMG ${state.stats.maxDamage}<br>撃破 ${state.stats.kills}<br>爆発 ${state.stats.explosions}`;
  }
  function draw(){
    const w=innerWidth,h=innerHeight,p=state.p; const camX=p.x-w/2,camY=p.y-h/2; const col=MoguriaDungeon.colorForTime(state.time);
    drawAtmosphere(w,h,col);
    const sx=(Math.random()*2-1)*(state.shake||0), sy=(Math.random()*2-1)*(state.shake||0);
    ctx.save(); ctx.translate(sx,sy); ctx.translate(-camX,-camY);
    ctx.fillStyle=col.ground; for(const r of state.dungeon.rooms){ roundRect(r.x-r.w/2,r.y-r.h/2,r.w,r.h,34,true); }
    ctx.strokeStyle='rgba(255,242,199,.14)'; ctx.lineWidth=5; for(let i=1;i<state.dungeon.rooms.length;i++){ const a=state.dungeon.rooms[i-1],b=state.dungeon.rooms[i]; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }
    const mb=state.mapBounds; ctx.strokeStyle='rgba(255,244,205,.28)'; ctx.lineWidth=8; ctx.setLineDash([18,16]); ctx.strokeRect(mb.minX,mb.minY,mb.maxX-mb.minX,mb.maxY-mb.minY); ctx.setLineDash([]);
    for(const d of state.drops) drawDrop(d);
    for(const e of state.enemies) drawEnemy(e);
    for(const m of state.mines||[]) drawMine(m);
    for(const b of state.bullets) drawBullet(b);
    for(const eb of state.enemyBullets||[]) drawEnemyBullet(eb);
    for(const pp of state.particles||[]) drawParticle(pp);
    for(const f of state.fx){
      if(f.type==='boom'){ ctx.strokeStyle=`rgba(255,190,100,${f.life/.38})`; ctx.lineWidth=8; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(1-f.life/.38),0,7); ctx.stroke(); }
      if(f.type==='auraPulse'){ ctx.strokeStyle=`rgba(150,225,170,${f.life/.22*.35})`; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,7); ctx.stroke(); }
      if(f.type==='meteor'){ const t=1-f.life/.38; ctx.strokeStyle='rgba(255,230,130,.78)'; ctx.lineWidth=5; ctx.beginPath(); ctx.moveTo(f.x,f.y); ctx.lineTo(f.x+(f.tx-f.x)*t,f.y+(f.ty-f.y)*t); ctx.stroke(); ctx.fillStyle='#fff0a6'; ctx.beginPath(); ctx.arc(f.x+(f.tx-f.x)*t,f.y+(f.ty-f.y)*t,7,0,7); ctx.fill(); }
      if(f.type==='lightning'){ ctx.strokeStyle=`rgba(188,230,255,${Math.max(.05,f.life/.22)})`; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(f.x,f.y); ctx.lineTo(f.tx,f.ty); ctx.stroke(); }
      if(f.type==='rarePulse'){ const a=f.life/1.0; ctx.strokeStyle=`rgba(255,211,92,${a*.75})`; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(1.2-a*.2),0,7); ctx.stroke(); ctx.fillStyle=`rgba(255,244,180,${a*.18})`; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(1-a*.35),0,7); ctx.fill(); }
      if(f.type==='rareBurst'){ const a=f.life/.9; ctx.strokeStyle=`rgba(255,211,92,${a})`; ctx.lineWidth=6; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(1-a*.55),0,7); ctx.stroke(); }
      if(f.type==='waveClear'){ const a=f.life/.72; ctx.strokeStyle=`rgba(255,240,166,${a*.85})`; ctx.lineWidth=5; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(1.15-a*.15),0,7); ctx.stroke(); }
      if(f.type==='eatGlow'){ const a=f.life/.48; ctx.fillStyle=`rgba(255,238,166,${a*.20})`; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(1.05-a*.1),0,7); ctx.fill(); ctx.strokeStyle=`rgba(255,250,220,${a*.65})`; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(.65+(1-a)*.45),0,7); ctx.stroke(); }
      if(f.type==='bossFade'){ const a=f.life/1.05; ctx.strokeStyle=`rgba(185,139,214,${a*.82})`; ctx.lineWidth=8; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(1.1-a*.35),0,7); ctx.stroke(); ctx.fillStyle=`rgba(51,36,68,${a*.16})`; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(.75-a*.18),0,7); ctx.fill(); }
      if(f.type==='bossPhase'){ const a=f.life/.9; ctx.strokeStyle=`rgba(209,150,255,${a*.72})`; ctx.lineWidth=7; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(1.25-a*.25),0,7); ctx.stroke(); ctx.fillStyle=`rgba(70,30,86,${a*.12})`; ctx.fillRect(f.x-f.r,f.y-f.r,f.r*2,f.r*2); }
      if(f.type==='chainBurst'){ const a=f.life/.8; ctx.strokeStyle=`rgba(255,242,166,${a*.8})`; ctx.lineWidth=6; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(1.18-a*.18),0,7); ctx.stroke(); }
      if(f.type==='nearMiss'){ const a=f.life/.26; ctx.strokeStyle=`rgba(255,246,205,${a*.8})`; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(1.1-a*.2),0,7); ctx.stroke(); }
      if(f.type==='absorb'){ const a=f.life/.42; ctx.strokeStyle=`rgba(255,240,166,${a*.45})`; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(f.x,f.y); ctx.lineTo(f.tx+(f.x-f.tx)*a,f.ty+(f.y-f.ty)*a); ctx.stroke(); }
      if(f.type==='startGlow'){ const a=f.life/1.2; ctx.strokeStyle=`rgba(255,242,180,${a*.45})`; ctx.lineWidth=6; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(1.05-a*.22),0,7); ctx.stroke(); }
      if(f.type==='megaChain'){ const a=f.life/.52; ctx.strokeStyle=`rgba(255,246,185,${a*.82})`; ctx.lineWidth=5; ctx.setLineDash([10,8]); ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(1.05-a*.2),0,7); ctx.stroke(); ctx.setLineDash([]); }
      if(f.type==='criticalRing'){ const a=f.life/.5; ctx.strokeStyle=`rgba(255,120,140,${a*.72})`; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(1.15-a*.2),0,7); ctx.stroke(); }
      if(f.type==='depthRipple'){ const a=f.life/.9; ctx.strokeStyle=`rgba(190,165,255,${a*.45})`; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*(1.1-a*.1),0,7); ctx.stroke(); }
    }
    drawMogu(p.x,p.y,p); for(const f of state.fx){ if(f.type==='text'){ ctx.fillStyle=f.color; ctx.font='bold 13px sans-serif'; ctx.fillText(f.text,f.x,f.y-(1-f.life/.55)*28); } }
    ctx.restore();
    drawTargetArrows(camX,camY,w,h); drawCombo(w,h); drawEmotionalOverlays(w,h); drawFlash(w,h); drawRunOverlay(w,h); MoguriaDebug?.update(state);
  }

  function drawRunOverlay(w,h){
    if(!state) return;
    let title='', sub='';
    if(state.introTimer>0){
      if(document.body.classList.contains('kv-visual-refresh')) return;
      title='もぐ、いくよ'; sub='画面下をなぞって移動';
    }
    else if(state.bossAlertTimer>0){ title=state.wave===12?'大きな足音…':'ざわざわ…'; sub=state.wave===12?'大ボスが近づいている':'中ボスが近づいている'; }
    else if(state.clearTimer>0){ title='ただいま'; sub='ほしの光を抱えて、帰ろう'; }
    if(!title) return;
    ctx.save(); ctx.fillStyle='rgba(20,16,34,.10)'; ctx.fillRect(0,0,w,h);
    ctx.textAlign='center'; ctx.fillStyle='#fff4dc'; ctx.shadowColor='rgba(0,0,0,.28)'; ctx.shadowBlur=12;
    ctx.font='900 26px sans-serif'; ctx.fillText(title,w/2,h*.40);
    ctx.fillStyle='rgba(255,240,211,.80)'; ctx.font='800 12px sans-serif'; ctx.fillText(sub,w/2,h*.40+25);
    ctx.restore();
  }


  function drawEmotionalOverlays(w,h){
    if(!state || !state.p) return;
    const hpRatio=state.p.hp/state.p.maxHp;
    if(hpRatio<.28){
      const pulse=(Math.sin(state.time*9)+1)/2;
      ctx.save();
      ctx.globalAlpha=.10+pulse*.08;
      ctx.strokeStyle='rgba(255,110,130,.85)';
      ctx.lineWidth=10+pulse*8;
      ctx.strokeRect(7,7,w-14,h-14);
      ctx.fillStyle='rgba(70,20,45,.08)';
      ctx.fillRect(0,0,w,h);
      ctx.restore();
    }
    if((state.awakenTimer||0)>0){
      const a=Math.min(1,state.awakenTimer/2.2);
      ctx.save();
      ctx.globalAlpha=.18*a;
      const g=ctx.createRadialGradient(w/2,h/2,20,w/2,h/2,Math.max(w,h)*.62);
      g.addColorStop(0,'rgba(255,245,180,.92)');
      g.addColorStop(1,'rgba(255,245,180,0)');
      ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
      ctx.textAlign='center'; ctx.font='900 18px sans-serif'; ctx.fillStyle='rgba(255,246,200,.95)';
      ctx.shadowColor='rgba(0,0,0,.25)'; ctx.shadowBlur=12;
      ctx.fillText('もぐ覚醒',w/2,92);
      ctx.restore();
    }
    if((state.bossPhaseTimer||0)>0){
      const a=Math.min(1,state.bossPhaseTimer/2.2);
      ctx.save(); ctx.globalAlpha=.12*a; ctx.fillStyle='rgba(75,32,92,.9)'; ctx.fillRect(0,0,w,h); ctx.restore();
    }
    if((state.returnGlow||0)>0){
      const a=Math.min(1,state.returnGlow/2.1); ctx.save();
      const g=ctx.createRadialGradient(w/2,h*.42,20,w/2,h*.42,Math.max(w,h)*.7);
      g.addColorStop(0,`rgba(255,246,195,${.28*a})`); g.addColorStop(1,'rgba(255,246,195,0)');
      ctx.fillStyle=g; ctx.fillRect(0,0,w,h); ctx.restore();
    }
  }

  function drawTargetArrows(camX,camY,w,h){
    const drawArrow=(e,kind)=>{
      const sx=e.x-camX, sy=e.y-camY;
      const margin = kind==='boss' ? 56 : 20;
      if(sx>-margin && sx<w+margin && sy>-margin && sy<h+margin) return;
      const cx=w/2, cy=h/2, ang=Math.atan2(sy-cy,sx-cx);
      const pad = kind==='boss' ? 42 : 28;
      const bottomPad = kind==='boss' ? 106 : 86;
      const x=Math.min(w-pad,Math.max(pad,cx+Math.cos(ang)*(w/2-pad-4)));
      const y=Math.min(h-bottomPad,Math.max(72,cy+Math.sin(ang)*(h/2-bottomPad)));
      ctx.save(); ctx.translate(x,y); ctx.rotate(ang);
      if(kind==='boss'){
        const pulse=.82+Math.sin(state.time*8)*.18;
        ctx.shadowColor='rgba(199,107,255,.95)'; ctx.shadowBlur=20;
        ctx.fillStyle=`rgba(96,48,122,${.86+pulse*.1})`;
        ctx.beginPath(); ctx.moveTo(23,0); ctx.lineTo(-13,-15); ctx.lineTo(-7,0); ctx.lineTo(-13,15); ctx.closePath(); ctx.fill();
        ctx.strokeStyle='rgba(255,224,255,.92)'; ctx.lineWidth=2.4; ctx.stroke();
        ctx.rotate(-ang); ctx.textAlign='center'; ctx.font='800 12px sans-serif';
        ctx.fillStyle='rgba(255,235,255,.96)'; ctx.fillText(e.kind==='boss'?'BOSS':'MID',0,-23);
        ctx.strokeStyle='rgba(199,107,255,.58)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,25+pulse*3,0,Math.PI*2); ctx.stroke();
      } else {
        ctx.shadowColor='#ffd15c'; ctx.shadowBlur=14;
        ctx.fillStyle='rgba(255,214,92,.95)'; ctx.beginPath(); ctx.moveTo(15,0); ctx.lineTo(-9,-10); ctx.lineTo(-5,0); ctx.lineTo(-9,10); ctx.closePath(); ctx.fill();
        ctx.rotate(-ang); ctx.fillStyle='#fff7c7'; ctx.font='13px sans-serif'; ctx.textAlign='center'; ctx.fillText('★',0,-18);
      }
      ctx.restore();
    };
    for(const e of state.enemies){
      if(e.hp<=0) continue;
      if(e.kind==='boss' || e.kind==='midBoss') drawArrow(e,'boss');
    }
    for(const e of state.enemies){
      if(e.hp<=0) continue;
      if(e.kind==='rare') drawArrow(e,'rare');
    }
  }


  function sparkleBurst(x,y,count=14,color='#fff0a6'){
    if(!state || !state.particles) return;
    if(reduceFx()) count=Math.max(3,Math.floor(count*.45));
    const max=MoguriaConfig.performance.maxParticles||140;
    if(state.particles.length>max) return;
    count=Math.min(count, max-state.particles.length);
    for(let i=0;i<count;i++){
      const a=Math.random()*Math.PI*2, sp=45+Math.random()*210;
      state.particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,r:1.5+Math.random()*3.5,life:.28+Math.random()*.45,color,kind:Math.random()<.25?'star':'dot'});
    }
  }
  function addImpact(x,y,color,count=6){ sparkleBurst(x,y,count,color); }
  function drawAtmosphere(w,h,col){
    const depth=Math.min(1, Math.max(0, ((state.wave||1)-1)/Math.max(1,(state.maxWave||12)-1)));
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0, depth>.62 ? '#17182f' : '#27304a');
    g.addColorStop(.38, depth>.55 ? '#322448' : '#354663');
    g.addColorStop(.72, depth>.42 ? '#3b2f50' : '#5a5369');
    g.addColorStop(1, depth>.58 ? '#161527' : '#211d33');
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    // soft aurora / key visual light
    ctx.save();
    let rg=ctx.createRadialGradient(w*.48,h*.18,8,w*.48,h*.18,Math.max(w,h)*.55);
    rg.addColorStop(0,`rgba(255,226,124,${.28-depth*.10})`);
    rg.addColorStop(.38,`rgba(183,156,232,${.16+depth*.06})`);
    rg.addColorStop(1,'rgba(183,156,232,0)');
    ctx.fillStyle=rg; ctx.fillRect(0,0,w,h);
    ctx.globalAlpha=.22 + depth*.18;
    for(let i=0;i<(reduceFx()?12:28);i++){
      const x=(i*83 + Math.sin(state.time*.16+i)*42)%w;
      const y=(i*47 + Math.cos(state.time*.11+i)*28)%h;
      ctx.fillStyle=i%4===0?'rgba(205,186,255,.62)':'rgba(255,235,168,.72)';
      if(i%5===0){ starShape(x,y,2.8,1.2,5,state.time*.35+i); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(x,y,1.1+(i%3)*.5,0,7); ctx.fill(); }
    }
    ctx.restore();
    // room depth texture: drifting strange waves
    if(depth>.30){
      ctx.save(); ctx.globalAlpha=(depth-.30)*.18; ctx.strokeStyle='rgba(214,184,255,.42)'; ctx.lineWidth=1.2;
      for(let i=0;i<6;i++){ const yy=(h*((i*.19+state.time*.012)%1)); ctx.beginPath(); ctx.moveTo(0,yy); for(let x=0;x<=w;x+=26){ ctx.lineTo(x, yy+Math.sin(x*.023+state.time*.52+i)*9*depth); } ctx.stroke(); }
      ctx.restore();
    }
    // vignette with warm center and deep shadow
    const vign=ctx.createRadialGradient(w*.5,h*.45,Math.min(w,h)*.14,w*.5,h*.52,Math.max(w,h)*.78);
    vign.addColorStop(0,'rgba(255,240,188,0)'); vign.addColorStop(.62,`rgba(49,36,70,${.10+depth*.10})`); vign.addColorStop(1,`rgba(12,10,24,${.45+depth*.20})`);
    ctx.fillStyle=vign; ctx.fillRect(0,0,w,h);
  }
  function drawParticle(pp){
    ctx.save(); ctx.globalAlpha=Math.max(0,pp.life/.55); ctx.fillStyle=pp.color;
    if(pp.kind==='star'){
      ctx.translate(pp.x,pp.y); ctx.rotate(state.time*2+pp.x*.01); ctx.beginPath();
      for(let i=0;i<10;i++){ const a=i*Math.PI/5, rr=i%2?pp.r*.45:pp.r*1.2; ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr); }
      ctx.closePath(); ctx.fill();
    } else { ctx.beginPath(); ctx.arc(pp.x,pp.y,pp.r,0,7); ctx.fill(); }
    ctx.restore();
  }
  function drawFlash(w,h){
    if(!state.flash) return;
    ctx.save(); ctx.globalAlpha=Math.min(.24,state.flash); ctx.fillStyle='#fff0c4'; ctx.fillRect(0,0,w,h); ctx.restore();
  }
  function drawCombo(w,h){
    const c=state.stats.combo||0; if(c<6 || state.comboTimer<=0) return;
    ctx.save(); ctx.textAlign='right'; ctx.shadowColor='rgba(0,0,0,.25)'; ctx.shadowBlur=8;
    ctx.fillStyle='rgba(255,242,178,.94)'; ctx.font=c>=30?'900 24px sans-serif':'900 18px sans-serif'; ctx.fillText(`${c} もぐ連鎖`,w-18,112); if(c>=18){ ctx.font='900 12px sans-serif'; ctx.fillStyle='rgba(255,255,255,.88)'; ctx.fillText(c>=30?'ひかりがあふれてる':'ひかりがつながる',w-18,c>=30?136:130); }
    ctx.restore();
  }


  function starShape(cx,cy,r1,r2,points=5,rot=-Math.PI/2){
    ctx.beginPath();
    for(let i=0;i<points*2;i++){ const a=rot+i*Math.PI/points; const r=i%2?r2:r1; const x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
    ctx.closePath();
  }
  function softBlob(cx,cy,rx,ry,phase=0){
    ctx.beginPath();
    for(let i=0;i<18;i++){ const a=i*Math.PI*2/18; const wob=1+Math.sin(a*3+phase)*.055+Math.cos(a*5+phase*.7)*.035; const x=cx+Math.cos(a)*rx*wob, y=cy+Math.sin(a)*ry*wob; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
    ctx.closePath();
  }
  function kvGlow(x,y,r,color='rgba(255,226,124,.35)'){
    const g=ctx.createRadialGradient(x,y,0,x,y,r); g.addColorStop(0,color); g.addColorStop(1,'rgba(255,226,124,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
  }

  function drawDrop(d){
    const t=state.time, pulse = Math.sin(t*7+d.x*.03)*1.4;
    const isHeal=d.kind==='heal';
    ctx.save();
    if(d.magnet){
      ctx.strokeStyle=isHeal?'rgba(163,238,150,.30)':'rgba(255,235,151,.28)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(d.x,d.y,15+pulse,0,7); ctx.stroke();
      ctx.strokeStyle=isHeal?'rgba(163,238,150,.14)':'rgba(204,180,255,.13)'; ctx.beginPath(); ctx.arc(d.x,d.y,26+pulse*1.6,0,7); ctx.stroke();
    }
    kvGlow(d.x,d.y,isHeal?28:32,isHeal?'rgba(158,232,143,.20)':'rgba(255,226,124,.24)');
    ctx.translate(d.x,d.y); ctx.rotate(Math.sin(t*3+d.y*.02)*0.15);
    if(isHeal){
      ctx.fillStyle='#9be58b'; ctx.shadowColor='rgba(155,229,139,.72)'; ctx.shadowBlur=12;
      ctx.beginPath(); ctx.arc(-5,-3,6,0,7); ctx.arc(5,-3,6,0,7); ctx.lineTo(0,10+pulse*.3); ctx.closePath(); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.85)'; ctx.fillRect(-1.5,-7,3,12); ctx.fillRect(-6,-2,12,3);
    } else {
      ctx.shadowColor='rgba(255,226,124,.75)'; ctx.shadowBlur=d.rare?18:11;
      ctx.fillStyle=d.rare?'#ffd76d':'#ffed9a'; starShape(0,0,d.rare?10:8,d.rare?4.4:3.8,5,-Math.PI/2+pulse*.03); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.76)'; ctx.beginPath(); ctx.arc(-2.5,-3,2.2,0,7); ctx.fill();
      ctx.strokeStyle='rgba(183,156,232,.50)'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.arc(0,0,d.rare?13:11,0,7); ctx.stroke();
    }
    ctx.restore();
  }
  function drawEnemy(e){
    const t=state.time, flash=e.hitFlash>0;
    ctx.save(); ctx.translate(e.x,e.y);
    const isBoss=e.kind==='boss'||e.kind==='midBoss', isRare=e.kind==='rare';
    ctx.shadowColor=isBoss?'rgba(172,116,228,.55)':isRare?'rgba(255,215,100,.62)':'rgba(20,18,38,.24)';
    ctx.shadowBlur=isBoss?26:isRare?18:8;
    if(isBoss){
      const phase=e.phase2?1:0; kvGlow(0,0,e.r*2.4,phase?'rgba(183,126,255,.22)':'rgba(110,76,150,.22)');
      const petals=e.kind==='boss'?12:9;
      for(let i=0;i<petals;i++){
        const a=i*Math.PI*2/petals+Math.sin(t*.65)*.08;
        ctx.fillStyle=i%2? (phase?'#7e4f96':'#6b4d78') : (phase?'#b46da4':'#8b658d');
        ctx.beginPath(); ctx.ellipse(Math.cos(a)*e.r*.74,Math.sin(a)*e.r*.74,e.r*.50,e.r*.20,a,0,7); ctx.fill();
      }
      ctx.fillStyle=flash?'#fff':(phase?'#51305f':'#5a4267'); softBlob(0,0,e.r*.86,e.r*.76,t*1.2); ctx.fill();
      ctx.strokeStyle=phase?'rgba(255,195,255,.62)':'rgba(255,238,190,.42)'; ctx.lineWidth=2.2; ctx.stroke();
      // unsettling offset eyes
      ctx.fillStyle=phase?'#ffd5ff':'#fff0c2'; ctx.beginPath(); ctx.arc(-e.r*.25,-e.r*.08,phase?5:3.6,0,7); ctx.arc(e.r*.18,-e.r*.16,phase?4.7:3.3,0,7); ctx.fill();
      ctx.fillStyle='rgba(55,31,66,.92)'; ctx.beginPath(); ctx.arc(-e.r*.25,-e.r*.08,1.5,0,7); ctx.arc(e.r*.18,-e.r*.16,1.5,0,7); ctx.fill();
      ctx.strokeStyle='rgba(255,238,190,.58)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,e.r*.16,e.r*.24,.05,Math.PI-.05); ctx.stroke();
      if(phase){ ctx.strokeStyle='rgba(217,179,255,.55)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,e.r*.98+Math.sin(t*5)*3,0,7); ctx.stroke(); }
    } else if(isRare){
      kvGlow(0,0,42,'rgba(255,226,124,.33)');
      ctx.fillStyle=flash?'#fff':'#ffd66f'; starShape(0,0,e.r*1.18,e.r*.56,5,-Math.PI/2+t*.6); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.70)'; ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle='#6b4b34'; ctx.beginPath(); ctx.arc(-4,2,1.7,0,7); ctx.arc(5,1,1.7,0,7); ctx.fill();
    } else {
      // cute normal enemies: soft, readable silhouettes
      ctx.fillStyle=flash?'#fff':e.color; ctx.strokeStyle='rgba(62,43,60,.18)'; ctx.lineWidth=2;
      if(e.name.includes('コウモリ')){
        ctx.beginPath(); ctx.ellipse(-e.r*.70,0,e.r*.70,e.r*.38,-.25,0,7); ctx.ellipse(e.r*.70,0,e.r*.70,e.r*.38,.25,0,7); ctx.fill();
        ctx.beginPath(); ctx.arc(0,0,e.r*.70,0,7); ctx.fill(); ctx.stroke();
      } else if(e.name.includes('とげ') || e.name.includes('石') || e.name.includes('かち')){
        ctx.beginPath(); for(let i=0;i<10;i++){ const a=i*Math.PI/5; const rr=i%2?e.r*.86:e.r*1.12; ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr); } ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if(e.name.includes('ゴースト')){
        ctx.globalAlpha=.86; softBlob(0,0,e.r*.88,e.r*1.12,t+e.id); ctx.fill(); ctx.stroke(); ctx.globalAlpha=1;
      } else {
        softBlob(0,0,e.r*1.05,e.r*.88,t+e.id); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle='rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(-e.r*.30,-e.r*.32,Math.max(2.5,e.r*.18),0,7); ctx.fill();
      ctx.fillStyle='rgba(50,37,45,.78)'; ctx.beginPath(); ctx.arc(-4,0,1.8,0,7); ctx.arc(5,0,1.8,0,7); ctx.fill();
    }
    if(e.poison>0){ctx.strokeStyle='#a36ad1';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,e.r+5,0,7);ctx.stroke();}
    if(e.slow>0){ctx.strokeStyle='#9fe5ff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,e.r+8,0,7);ctx.stroke();}
    if(isBoss){ctx.fillStyle='rgba(255,239,211,.86)';ctx.font='900 12px sans-serif';ctx.textAlign='center';ctx.fillText(e.kind==='boss'?'BOSS':'MID',0,-e.r-13);}
    ctx.restore();
    // soft HP bar
    if(e.maxHp>40){
      ctx.fillStyle='rgba(18,15,28,.35)'; roundRect(e.x-e.r,e.y-e.r-12,e.r*2,4,3,true);
      ctx.fillStyle=isBoss?'#d9b3ff':'#fff0a6'; roundRect(e.x-e.r,e.y-e.r-12,e.r*2*Math.max(0,e.hp/e.maxHp),4,3,true);
    }
  }
  function drawMine(m){
    ctx.save(); ctx.translate(m.x,m.y);
    kvGlow(0,0,m.r*2.1,'rgba(255,166,88,.18)');
    ctx.fillStyle='rgba(255,184,94,.90)'; starShape(0,0,m.r*.95,m.r*.48,6,state.time*.5); ctx.fill();
    ctx.strokeStyle='rgba(255,238,180,.48)'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,0,m.r+Math.sin(state.time*5)*2,0,7); ctx.stroke();
    ctx.fillStyle='#6c4a37'; ctx.font='900 11px sans-serif'; ctx.textAlign='center'; ctx.fillText('×',0,4);
    ctx.restore();
  }
  function drawEnemyBullet(b){
    ctx.save(); ctx.translate(b.x,b.y);
    kvGlow(0,0,b.r+16,'rgba(183,156,232,.18)');
    ctx.fillStyle='rgba(172,146,205,.90)'; starShape(0,0,b.r+4,b.r+1,4,state.time*1.2); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.42)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,b.r+6,0,7); ctx.stroke();
    ctx.restore();
  }
  function drawBullet(b){
    ctx.save(); ctx.translate(b.x,b.y);
    const ang=Math.atan2(b.vy,b.vx); ctx.rotate(ang);
    if(b.summon){
      ctx.shadowColor='rgba(255,207,140,.55)'; ctx.shadowBlur=10;
      ctx.fillStyle='#ffd28c'; ctx.beginPath(); ctx.arc(0,0,b.r+3,0,7); ctx.fill();
      ctx.fillStyle='#6c4a37'; ctx.font='9px sans-serif'; ctx.textAlign='center'; ctx.fillText('•',0,3);
    } else {
      ctx.shadowColor=b.pierce>0?'rgba(180,230,255,.60)':'rgba(255,226,124,.55)'; ctx.shadowBlur=12;
      const grad=ctx.createLinearGradient(-b.r-8,0,b.r+10,0); grad.addColorStop(0,'rgba(255,255,255,.30)'); grad.addColorStop(.55,'#fff0a6'); grad.addColorStop(1,b.split?'#d8c2ff':'#ffd483');
      ctx.fillStyle=grad; ctx.beginPath(); ctx.ellipse(0,0,b.r+7,b.r+2,0,0,7); ctx.fill();
      ctx.strokeStyle=b.pierce>0?'rgba(190,230,255,.75)':'rgba(255,210,120,.52)'; ctx.lineWidth=b.split?3:2; ctx.beginPath(); ctx.arc(0,0,b.r+7,0,7); ctx.stroke();
      if(b.split){ ctx.fillStyle='rgba(255,255,255,.65)'; ctx.beginPath(); ctx.arc(4,-2,2,0,7); ctx.fill(); }
    }
    ctx.restore();
  }

  function drawMogu(x,y,p){
    if(p.auraRadius>0){ctx.strokeStyle='rgba(160,232,172,.24)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,p.auraRadius,0,7);ctx.stroke();}
    if(p.orbitRadius>0){ctx.strokeStyle='rgba(255,226,124,.26)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,p.orbitRadius,0,7);ctx.stroke(); for(let i=0;i<2;i++){const a=state.time*2.4+i*Math.PI; ctx.fillStyle='#ffe27c'; starShape(x+Math.cos(a)*p.orbitRadius,y+Math.sin(a)*p.orbitRadius,6,3,5,a);ctx.fill();}}
    if(p.visual.poison) aura(x,y,'#a473c8',p.visual.poison); if(p.visual.fire) aura(x,y,'#ff8d61',p.visual.fire); if(p.visual.ice) aura(x,y,'#8fd4f0',p.visual.ice); if(p.visual.guard) aura(x,y,'#8fd18c',p.visual.guard); if(p.visual.star) aura(x,y,'#ffe27c',p.visual.star);
    kvGlow(x,y,52,'rgba(255,226,124,.18)');
    if((state.awakenTimer||0)>0){ ctx.fillStyle='rgba(255,240,166,.20)'; ctx.beginPath(); ctx.arc(x,y,48+Math.sin(state.time*8)*5,0,7); ctx.fill(); }
    if(p.hp/p.maxHp<.18){ ctx.strokeStyle='rgba(255,120,140,.48)'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(x,y,35+Math.sin(state.time*10)*3,0,7); ctx.stroke(); }
    // ears behind body
    ctx.save(); ctx.shadowColor='rgba(255,226,124,.36)'; ctx.shadowBlur=18;
    // v2.9: fluffy white key-visual Mogu
    ctx.fillStyle='#ffe6d7'; ctx.beginPath(); ctx.arc(x-14,y-17,8.5,0,7); ctx.arc(x+14,y-17,8.5,0,7); ctx.fill();
    ctx.fillStyle='rgba(255,248,236,.95)'; ctx.beginPath(); ctx.arc(x-14,y-17,4.3,0,7); ctx.arc(x+14,y-17,4.3,0,7); ctx.fill();
    const body=ctx.createRadialGradient(x-8,y-10,4,x,y+2,28); body.addColorStop(0,'#ffffff'); body.addColorStop(.52,'#fff7ea'); body.addColorStop(1,'#f1d9c5'); ctx.fillStyle=body; softBlob(x,y,24,20,state.time*1.4); ctx.fill();
    ctx.strokeStyle='rgba(139,99,113,.18)'; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(x,y,24,20,0,0,7); ctx.stroke();
    ctx.fillStyle='rgba(255,211,197,.50)'; ctx.beginPath(); ctx.arc(x-12,y+4,5.2,0,7); ctx.arc(x+12,y+4,5.2,0,7); ctx.fill();
    ctx.fillStyle='#3f2f41'; ctx.beginPath(); ctx.arc(x-7,y-3,2.5,0,7); ctx.arc(x+7,y-3,2.5,0,7); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.72)'; ctx.beginPath(); ctx.arc(x-8,y-4,0.9,0,7); ctx.arc(x+6,y-4,0.9,0,7); ctx.fill();
    ctx.strokeStyle='#3f2f41'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(x,y+3,3.4,0,Math.PI); ctx.stroke();
    ctx.fillStyle='rgba(255,236,139,.98)'; starShape(x+16,y-12,5.5,2.6,5,state.time*.7); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.72)'; ctx.lineWidth=1.2; ctx.stroke();
    ctx.restore();
    // v3.0: combat HP is read where the player's eyes already are — above Mogu.
    const hpRatio=Math.max(0,Math.min(1,p.hp/p.maxHp));
    const bw=54,bh=7,by=y-40;
    ctx.save();
    ctx.fillStyle='rgba(8,8,18,.50)'; roundRect(x-bw/2,by,bw,bh,5,true);
    const hpGrad=ctx.createLinearGradient(x-bw/2,by,x+bw/2,by);
    hpGrad.addColorStop(0,hpRatio<.28?'#ff7b92':'#8fea9d'); hpGrad.addColorStop(1,hpRatio<.28?'#ffd28a':'#ffe986');
    ctx.fillStyle=hpGrad; roundRect(x-bw/2,by,bw*hpRatio,bh,5,true);
    ctx.strokeStyle='rgba(255,244,210,.48)'; ctx.lineWidth=1; roundRect(x-bw/2,by,bw,bh,5,false);
    if(hpRatio<.28){ ctx.strokeStyle='rgba(255,110,132,.55)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(x,y,34+Math.sin(state.time*9)*2,0,7); ctx.stroke(); }
    ctx.restore();
    if(p.shield>0){ctx.strokeStyle='rgba(180,245,190,.58)';ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y,28,0,7);ctx.stroke();}
    // The visual refresh supplies painterly companions. Keep the legacy dots
    // only as a fallback when that layer is unavailable.
    if(!document.body.classList.contains('kv-visual-refresh') && p.visual.summon){ for(let i=0;i<Math.min(5,p.summons);i++){ const a=state.time*2+i*6.28/Math.max(1,p.summons); ctx.fillStyle='#f8c994'; ctx.beginPath(); ctx.arc(x+Math.cos(a)*34,y+Math.sin(a)*25,6,0,7); ctx.fill(); ctx.fillStyle='#513b32'; ctx.beginPath(); ctx.arc(x+Math.cos(a)*34-1.5,y+Math.sin(a)*25,1,0,7); ctx.arc(x+Math.cos(a)*34+1.5,y+Math.sin(a)*25,1,0,7); ctx.fill(); } }
  }
  function aura(x,y,c,n){ ctx.fillStyle=c; ctx.globalAlpha=Math.min(.12+n*.025,.28); ctx.beginPath(); ctx.arc(x,y,28+n*2,0,7); ctx.fill(); ctx.globalAlpha=1; }
  function roundRect(x,y,w,h,r,fill){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill)ctx.fill();}

  function tagClass(t){
    const map={ '毒':'tag-poison','爆発':'tag-fire','連鎖':'tag-fire','回避':'tag-ice','速度':'tag-ice','防御':'tag-guard','反撃':'tag-guard','召喚':'tag-summon','会心':'tag-star','攻撃':'tag-star','範囲':'tag-poison','貫通':'tag-star','分裂':'tag-star','領域':'tag-guard','自動':'tag-star','氷':'tag-ice','設置':'tag-fire','回復':'tag-guard','経験値':'tag-star','成長':'tag-star','移動':'tag-ice' };
    return map[t] || '';
  }

  function visualKindForArtifact(artifact){
    const tags=new Set(artifact?.tags||[]);
    if(tags.has('毒')) return 'poison';
    if(tags.has('召喚')) return 'summon';
    if(tags.has('氷') || tags.has('回避') || tags.has('移動') || tags.has('速度')) return 'ice';
    if(tags.has('防御') || tags.has('反撃') || tags.has('回復') || tags.has('領域')) return 'guard';
    if(tags.has('爆発') || tags.has('設置')) return 'fire';
    if(tags.has('自動') || tags.has('攻撃') || tags.has('会心') || tags.has('連鎖') || tags.has('成長') || tags.has('経験値')) return 'star';
    return 'cave';
  }

  function visualKindForSkill(skill){
    const id=skill?.id||'';
    const kinds={
      poison_seed:'poison', poison_stack:'poison', poison_cloud:'poison', toxic_burst:'poison', mogu_vamp:'poison',
      spark_pop:'fire', boom_cookie:'fire', chain_pop:'fire', fan_cookie:'fire', sleepy_mine:'fire', mine_garden:'fire',
      quick_berry:'ice', blink_mint:'ice', afterimage:'ice', ice_syrup:'ice', soft_step:'ice',
      guard_nut:'guard', thorn_bun:'guard', sleepy_shell:'guard', mogu_field:'guard', big_field:'guard',
      mini_mogu:'summon', friend_jam:'summon', bye_pop:'summon',
      pierce_skewer:'star', split_mochi:'star', star_meteor:'star', meteor_party:'star', crit_sugar:'star',
      hungry_fang:'star', star_drop:'star', moon_orbit:'star', orbit_storm:'star', thunder_gum:'star',
      storm_soda:'star', growth_honey:'star'
    };
    return kinds[id]||'cave';
  }

  function getState(){ return state; }
  function devStep(seconds=.016){ return battleStep(Math.max(0,Math.min(.25,Number(seconds)||.016))); }
  function devAddExp(amount){ if(!state || !state.p) return false; state.p.exp += amount || state.p.nextExp || 50; return true; }
  function devHeal(){ if(!state || !state.p) return false; state.p.hp = state.p.maxHp; return true; }
  function devToggleInvincible(){ if(!state || !state.p) return false; state.p.devInvincible = !state.p.devInvincible; return state.p.devInvincible; }
  function devGoWave(w){ if(!state) return false; state.wave = Math.max(0, Math.min(state.maxWave, Number(w)||1)) - 1; state.enemies.length=0; state.drops.length=0; state.bullets.length=0; if(state.enemyBullets) state.enemyBullets.length=0; if(state.mines) state.mines.length=0; startNextWave(); return true; }
  function devAddSkill(id){ if(!state || !state.p) return false; const sk=MoguriaSkills.skills.find(s=>s.id===id) || MoguriaSkills.skills[0]; state.p.skillLevels=state.p.skillLevels||{}; state.p.skillLevels[sk.id]=(state.p.skillLevels[sk.id]||0)+1; if(!state.p.skills.find(x=>x.id===sk.id)) state.p.skills.push(sk); sk.apply?.(state.p, state); MoguriaSkills.checkFusions?.(state.p); return true; }
  function devAddArtifact(id){ if(!state || !state.p) return false; const art=MoguriaSkills.artifacts.find(a=>a.id===id) || MoguriaSkills.artifacts[0]; state.p.artifacts = state.p.artifacts || []; state.p.artifacts.push(art); art.apply?.(state.p, state); return true; }
  return { init, start, getState, devStep, pauseRun, resumeRun, endRun, persistCheckpoint, devAddExp, devHeal, devToggleInvincible, devGoWave, devAddSkill, devAddArtifact };
})();
