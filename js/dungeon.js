window.MoguriaDungeon = (() => {
  function create(seed){
    const rooms=[];
    for(let i=0;i<14;i++) rooms.push({x:(Math.random()-.5)*1600,y:(Math.random()-.5)*1600,w:220+Math.random()*160,h:160+Math.random()*150});
    rooms.push({x:0,y:0,w:260,h:220});
    return { seed, floor:1, rooms };
  }
  function colorForTime(t){
    const k=Math.min(1,t/240);
    return { bg:`rgb(${34-k*18},${43-k*18},${45-k*8})`, ground:`rgb(${79-k*25},${107-k*35},${75-k*22})` };
  }
  return { create, colorForTime };
})();
