window.MoguriaValidator = (() => {
  const errors = [];
  const warnings = [];
  function uniqueIds(items, label){
    const seen = new Set();
    for(const item of items || []){
      if(!item || !item.id){ errors.push(`${label}: id missing`); continue; }
      if(seen.has(item.id)) errors.push(`${label}: duplicate id '${item.id}'`);
      seen.add(item.id);
    }
  }
  function requiredFields(items, label, fields){
    for(const item of items || []){
      for(const f of fields){
        if(item[f] === undefined || item[f] === null || item[f] === '') errors.push(`${label}:${item.id || '?'} missing ${f}`);
      }
      if(!Array.isArray(item.tags)) warnings.push(`${label}:${item.id || '?'} tags should be array`);
      if(typeof item.apply !== 'function') errors.push(`${label}:${item.id || '?'} apply must be function`);
    }
  }
  function validate(){
    errors.length = 0; warnings.length = 0;
    const skills = window.MoguriaSkills?.skills || [];
    const artifacts = window.MoguriaSkills?.artifacts || [];
    uniqueIds(skills, 'skill');
    uniqueIds(artifacts, 'artifact');
    requiredFields(skills, 'skill', ['id','name','rarity','desc']);
    requiredFields(artifacts, 'artifact', ['id','name','weight','desc']);
    if(!window.MoguriaConfig) errors.push('MoguriaConfig missing');
    if(!window.MoguriaSave) errors.push('MoguriaSave missing');
    if(errors.length || warnings.length){
      console.group('Moguria startup validation');
      for(const e of errors) console.error(e);
      for(const w of warnings) console.warn(w);
      console.groupEnd();
    } else {
      window.MoguriaDebug?.log('startup validation ok');
    }
    return { ok: errors.length === 0, errors: [...errors], warnings: [...warnings] };
  }
  return { validate };
})();
