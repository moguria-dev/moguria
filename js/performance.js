(function(){
  const samples = [];
  let fps = 60;
  let quality = 'high';
  let enabled = false;
  let lowStreak = 0;
  let highStreak = 0;

  function sample(deltaMs){
    const dt = Number(deltaMs);
    if(!enabled || !Number.isFinite(dt) || dt <= 0) return;
    samples.push(1000 / dt);
    if(samples.length > 45) samples.shift();
    fps = Math.round(samples.reduce((a,b)=>a+b,0) / samples.length);
    if(fps < 42){ lowStreak++; highStreak=0; }
    else if(fps > 56){ highStreak++; lowStreak=0; }
    else { lowStreak=Math.max(0,lowStreak-1); highStreak=Math.max(0,highStreak-1); }
    if(lowStreak>=18) quality = 'low';
    else if(fps < 53 && lowStreak>=8) quality = 'medium';
    else if(highStreak>=28) quality = 'high';
  }

  function start(){
    if(enabled) return;
    enabled=true;
  }
  function stop(){ enabled=false; samples.length=0; lowStreak=highStreak=0; }

  function getQuality(){ return quality; }
  function shouldReduceEffects(){ return quality !== 'high'; }
  function stats(){ return { fps, quality, reduceEffects: shouldReduceEffects() }; }

  window.MoguriaPerformance = { start, stop, recordFrame:sample, getQuality, shouldReduceEffects, stats };
})();
