window.MoguriaResult = (() => {
  function dominant(run){
    const counts={};
    for(const s of run.skills||[]) for(const t of s.tags) counts[t]=(counts[t]||0)+1;
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
  }
  function buildName(run){
    const d=dominant(run); const first=d[0]||'もぐもぐ'; const second=d[1]||'冒険';
    const map={毒:'紫煙',爆発:'花火',回避:'ひらり',防御:'まもり',召喚:'こもぐ',会心:'星屑',攻撃:'牙',速度:'風',領域:'月輪',自動:'星雨',設置:'罠',氷:'ひんやり',回復:'いのち'};
    const tail={毒:'暴食者',爆発:'まつり',回避:'影走り',防御:'不沈の子',召喚:'行進',会心:'きらめき',攻撃:'はらぺこ',速度:'追い風',領域:'まもり円',自動:'空の番人',設置:'花畑',氷:'足どめ',回復:'しぶとい子'};
    return `${map[first]||first}の${tail[second]||tail[first]||'旅'}`;
  }
  function comment(run){
    if(run.cleared) return '最後まで潜って帰ってきたね。Mogu、ちょっと誇らしそう。';
    if(run.synergies.includes('びりびり連鎖')) return '今日は空までびりびりしてたね。Mogu、ちょっと得意げ。';
    if(run.synergies.includes('逃げる花畑')) return '逃げてるだけのはずが、後ろが大変なことになってたね…';
    if(run.synergies.includes('近づくだけで危険')) return '今日は近づくだけで危ないMoguだったね…';
    if(run.synergies.includes('むらさき連鎖地獄')) return '今日は、森が少しだけ紫になりすぎたね…';
    if((run.bestCombo||0)>=30) return 'ひかりがずっとつながっていたね。Mogu、少し光ってるみたい。';
    if(run.maxDamage>250) return 'すごい一撃だったね。Moguもびっくりしてるみたい。';
    if(run.explosions>30) return 'ずいぶん、ぽふぽふ弾ける冒険だったね…';
    if(run.dodgeRate>35) return '今日はひらりひらり。つかまらなかったね。';
    if(run.kills<15) return 'ちょっと早く眠くなっちゃったみたい。また行こう。';
    return '今日はよく食べて、よく潜ったね…';
  }
  function titles(run){
    const t=[];
    if(run.maxDamage>=300) t.push('星砕き');
    if(run.explosions>=40) t.push('花火職人');
    if(run.dodgeRate>=35) t.push('ひらり名人');
    if(run.kills>=120) t.push('森の掃除屋');
    if(run.synergies.length>=3) t.push('シナジー好き');
    if((run.bestCombo||0)>=30) t.push('ひかりつなぎ');
    if(run.synergies.includes('びりびり連鎖')) t.push('雷もぐ');
    if(run.synergies.includes('逃げる花畑')) t.push('罠師Mogu');
    if(run.synergies.includes('近づくだけで危険')) t.push('危険なまんまる');
    if(run.survived>=180) t.push('長旅Mogu');
    return t.length?t:['小さな冒険者'];
  }
  return { buildName, comment, titles, dominant };
})();
