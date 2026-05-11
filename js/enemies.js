window.MoguriaEnemies = (() => {
  let enemySeq = 1;
  const types = [
    {name:'ぷに虫', hp:22, speed:42, dmg:8, color:'#b5d58b', exp:4, r:13, behavior:'chase'},
    {name:'ころスライム', hp:34, speed:34, dmg:11, color:'#8dc7d6', exp:6, r:16, behavior:'chase'},
    {name:'とげもぐら', hp:45, speed:50, dmg:14, color:'#cf9b78', exp:8, r:15, behavior:'charge'},
    {name:'ねむコウモリ', hp:28, speed:68, dmg:10, color:'#9d8cc2', exp:7, r:12, behavior:'swarm'},
    {name:'ふわゴースト', hp:60, speed:30, dmg:18, color:'#ddd2ee', exp:12, r:18, behavior:'ranged'},
    {name:'ふたごぷに', hp:42, speed:38, dmg:12, color:'#c8df93', exp:10, r:17, behavior:'splitter', splitOnDeath:true},
    {name:'まもり石', hp:115, speed:18, dmg:20, color:'#b7a18c', exp:16, r:21, behavior:'tank'}
  ];
  function baseType(floor){
    return types[Math.min(types.length-1, Math.floor(Math.random()*Math.min(types.length, 2+Math.floor(floor/2))))];
  }
  function spawn(floor, w, h, around, opts={}){
    let t = baseType(floor);
    if(opts.boss) t = {name:'もりの大ボス', hp:620, speed:27, dmg:25, color:'#d88b71', exp:110, r:36, behavior:'boss'};
    else if(opts.midBoss) t = {name:'ねむり番長', hp:300, speed:34, dmg:20, color:'#b68bd6', exp:65, r:28, behavior:'ranged'};
    else if(opts.rare) t = {name:'金のぷに', hp:80, speed:44, dmg:0, color:'#ffd36b', exp:48, r:16, behavior:'wander'};
    else if(opts.event==='swarm') t = {name:'ちびぷに群れ', hp:14, speed:58, dmg:5, color:'#cfe89a', exp:2, r:10, behavior:'swarm'};
    else if(opts.event==='tank') t = {name:'かちかち石', hp:155, speed:16, dmg:18, color:'#b7a18c', exp:20, r:23, behavior:'tank'};
    else if(opts.event==='bats') t = {name:'ねむコウモリ', hp:22, speed:82, dmg:8, color:'#9d8cc2', exp:5, r:12, behavior:'swarm'};
    const a = Math.random()*Math.PI*2;
    const d = opts.boss || opts.midBoss ? 360 : 290 + Math.random()*310;
    const scale = opts.boss ? 1 : opts.midBoss ? 1 : opts.rare ? 1 : 1 + floor*.08;
    return { ...t, id:enemySeq++, maxHp:Math.floor(t.hp*scale), hp:Math.floor(t.hp*scale), x:around.x+Math.cos(a)*d, y:around.y+Math.sin(a)*d, poison:0, poisonTick:0, slow:0, attackCd:1+Math.random()*1.2, chargeCd:1.2+Math.random(), wanderAngle:Math.random()*Math.PI*2, wanderTurn:.6+Math.random()*1.3, hitFlash:0, kind: opts.boss?'boss':opts.midBoss?'midBoss':opts.rare?'rare':'normal' };
  }
  return { types, spawn };
})();
