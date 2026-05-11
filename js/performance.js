(function(){
  const samples = [];
  let last = performance.now();
  let fps = 60;
  let quality = 'high';
  let enabled = true;

  function tick(){
    if(!enabled) return;
    const now = performance.now();
    const dt = now - last;
    last = now;
    if(dt > 0){
      samples.push(1000 / dt);
      if(samples.length > 45) samples.shift();
      fps = Math.round(samples.reduce((a,b)=>a+b,0) / samples.length);
      if(fps < 42) quality = 'low';
      else if(fps < 53) quality = 'medium';
      else quality = 'high';
    }
    requestAnimationFrame(tick);
  }

  function start(){
    last = performance.now();
    requestAnimationFrame(tick);
  }

  function getQuality(){ return quality; }
  function shouldReduceEffects(){ return quality !== 'high'; }
  function stats(){ return { fps, quality, reduceEffects: shouldReduceEffects() }; }

  window.MoguriaPerformance = { start, getQuality, shouldReduceEffects, stats };
})();
