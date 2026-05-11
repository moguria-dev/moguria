
window.MoguriaAudio = (() => {
  let ctx = null;
  let unlocked = false;
  const volumes = { master: 0.18, se: 0.9 };
  const lastPlay = {};
  function can(name, gap=.035){ const t=performance.now(); if(lastPlay[name] && t-lastPlay[name]<gap*1000) return false; lastPlay[name]=t; return true; }
  function ensure(){
    if(!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      ctx = new AC();
    }
    if(ctx.state === 'suspended') ctx.resume().catch(()=>{});
    unlocked = true;
    return ctx;
  }
  function tone(freq=440, dur=.08, type='sine', gain=.08, slide=0){
    const c=ensure(); if(!c) return;
    const now=c.currentTime;
    const o=c.createOscillator(); const g=c.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,now);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(40,freq+slide), now+dur);
    g.gain.setValueAtTime(0,now); g.gain.linearRampToValueAtTime(gain*volumes.master*volumes.se, now+.01); g.gain.exponentialRampToValueAtTime(.0001, now+dur);
    o.connect(g); g.connect(c.destination); o.start(now); o.stop(now+dur+.02);
  }
  function noise(dur=.12,gain=.04){
    const c=ensure(); if(!c) return;
    const len=Math.max(1,Math.floor(c.sampleRate*dur));
    const buf=c.createBuffer(1,len,c.sampleRate); const data=buf.getChannelData(0);
    for(let i=0;i<len;i++) data[i]=(Math.random()*2-1)*(1-i/len);
    const src=c.createBufferSource(); src.buffer=buf;
    const g=c.createGain(); g.gain.value=gain*volumes.master*volumes.se;
    src.connect(g); g.connect(c.destination); src.start();
  }
  const api={
    unlock: ensure,
    play(name){
      if(!ensure()) return;
      if(name==='start'){ tone(392,.08,'sine',.06,120); setTimeout(()=>tone(523,.11,'sine',.07,180),85); }
      else if(name==='hit'){ tone(760,.035,'triangle',.035,-120); }
      else if(name==='kill'){ tone(520,.055,'sine',.045,220); }
      else if(name==='boom'){ noise(.13,.07); tone(120,.12,'sawtooth',.045,-50); }
      else if(name==='level'){ tone(523,.07,'sine',.06,180); setTimeout(()=>tone(784,.1,'sine',.07,160),70); }
      else if(name==='artifact'){ tone(330,.08,'triangle',.055,180); setTimeout(()=>tone(660,.15,'sine',.07,220),100); }
      else if(name==='boss'){ tone(100,.25,'sawtooth',.045,-20); setTimeout(()=>tone(72,.3,'sine',.04,0),130); }
      else if(name==='clear'){ tone(392,.08,'sine',.06,120); setTimeout(()=>tone(523,.08,'sine',.06,130),90); setTimeout(()=>tone(784,.14,'sine',.07,160),180); }
      else if(name==='rare'){ tone(880,.07,'sine',.055,140); setTimeout(()=>tone(1174,.1,'triangle',.055,80),90); }
      else if(name==='select'){ tone(440,.055,'triangle',.04,100); }
      else if(name==='eat'){ tone(330,.035,'triangle',.045,70); setTimeout(()=>tone(620,.07,'sine',.055,160),42); }
      else if(name==='chain'){ if(can('chain',.18)){ tone(740,.045,'triangle',.04,170); setTimeout(()=>tone(990,.055,'sine',.035,120),45); } }
      else if(name==='danger'){ if(can('danger',1.2)){ tone(92,.18,'sine',.04,0); setTimeout(()=>tone(72,.2,'sine',.035,0),160); } }
      else if(name==='phase'){ tone(144,.18,'sawtooth',.04,-40); setTimeout(()=>tone(288,.16,'triangle',.045,-80),120); }
      else if(name==='return'){ tone(392,.1,'sine',.045,80); setTimeout(()=>tone(523,.16,'sine',.05,110),110); }
      else if(name==='gacha'){ tone(523,.07,'triangle',.045,80); setTimeout(()=>tone(659,.08,'triangle',.045,120),75); setTimeout(()=>tone(784,.12,'sine',.055,160),150); }
      else if(name==='miss'){ if(can('miss',.55)){ tone(160,.06,'sine',.035,-30); } }
    }
  };
  window.addEventListener('pointerdown', ()=>{ if(!unlocked) ensure(); }, {once:true, passive:true});
  return api;
})();
