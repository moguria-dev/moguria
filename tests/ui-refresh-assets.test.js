'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function loadDefinitions(saveApi = null){
  const context = { console, Math, Date };
  context.window = context;
  context.MoguriaSave = saveApi || {
    fresh: () => ({}),
    load: () => ({}),
    save: data => ({ ok:true, data }),
    settleRun: () => ({ ok:true })
  };
  vm.createContext(context);
  for(const file of ['js/ui-assets.js','js/meta.js','js/skills.js']){
    vm.runInContext(read(file),context,{ filename:file });
  }
  return context;
}

test('the production UI registry provides one shared WebP path for every logical item', () => {
  const { MoguriaUIAssets: assets, MoguriaMeta: meta, MoguriaSkills: skills } = loadDefinitions();
  assert.equal(assets.version,'3.3.0-ui-consistency');
  assert.equal(Object.keys(assets.artifacts).length,26);
  assert.equal(Object.keys(assets.equipment).length,15);
  assert.equal(Object.keys(assets.outings).length,3);
  assert.equal(Object.keys(assets.slots).length,5);
  assert.equal(assets.headers.artifactCore.src,'assets/images/ui-refresh/artifacts/artifact-core.webp');
  assert.equal(assets.get('headers','artifact_core'),assets.headers.artifactCore);

  assert.deepEqual(
    new Set(Object.keys(assets.artifacts)),
    new Set(skills.artifacts.map(item=>item.id))
  );
  assert.deepEqual(
    new Set(Object.keys(assets.equipment)),
    new Set(meta.EQUIPMENT.map(item=>item.id))
  );
  assert.deepEqual(
    new Set(Object.keys(assets.outings)),
    new Set(meta.CHALLENGES.map(item=>item.id))
  );

  const all=assets.all;
  assert.equal(all.length,50);
  assert.equal(new Set(all.map(asset=>asset.src)).size,all.length);
  for(const asset of all){
    assert.match(asset.assetId,/^ui_refresh_[a-z0-9_]+$/);
    assert.match(asset.src,/^assets\/images\/ui-refresh\/(?:artifacts|equipment|outings|slots)\/[a-z0-9_-]+\.webp$/);
  }
});

test('all 50 production WebPs are present once and governed by the canonical/runtime manifests', async () => {
  const { gitBlobSha1, imageDimensions } = await import('../scripts/lib/validation.mjs');
  const { MoguriaUIAssets: assets } = loadDefinitions();
  const source = JSON.parse(read('config/asset-manifest.json'));
  const runtime = JSON.parse(read('assets/manifest.json'));
  const expectedPaths = Array.from(assets.all, asset => asset.src).sort();
  const expectedIds = Array.from(assets.all, asset => asset.assetId).sort();
  const uiPack = source.runtimeManifest.packs.find(pack => pack.id === 'ui-refresh');
  const runtimePack = runtime.packs.find(pack => pack.id === 'ui-refresh');
  const catalog = source.catalog.filter(record => record.path.startsWith('assets/images/ui-refresh/'));

  assert.ok(uiPack, 'canonical UI refresh pack is missing');
  assert.ok(runtimePack, 'runtime UI refresh pack is missing');
  assert.equal(source.runtimeManifest.version, '3.3.1-loading');
  assert.equal(runtime.version, source.runtimeManifest.version);
  assert.deepEqual(uiPack.assets.map(asset => asset.id).sort(), expectedIds);
  assert.deepEqual(uiPack.assets.map(asset => asset.src).sort(), expectedPaths);
  assert.deepEqual(runtimePack, uiPack);
  assert.deepEqual(Object.values(source.runtimeManifest.images).filter(src => src.includes('/ui-refresh/')).sort(), expectedPaths);
  assert.deepEqual(Object.values(runtime.images).filter(src => src.includes('/ui-refresh/')).sort(), expectedPaths);
  assert.equal(catalog.length, 50);
  assert.deepEqual(catalog.map(record => record.path).sort(), expectedPaths);
  assert.equal(new Set(catalog.map(record => record.sourceMasterId)).size, 50);

  for (const record of catalog) {
    const absolute = path.join(ROOT, record.path);
    const bytes = fs.readFileSync(absolute);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', `${record.logicalId} is not RIFF WebP`);
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', `${record.logicalId} is not WebP`);
    assert.deepEqual(imageDimensions(bytes, record.path), { width:256, height:256 });
    assert.equal(gitBlobSha1(bytes), record.integrity.value);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), record.integrity.sha256);
    assert.equal(record.approval.status, 'approved');
    assert.equal(record.approval.approvedAt, '2026-08-14');
    assert.equal(record.provenance.approvedDate, '2026-08-14');
    assert.equal(record.provenance.method, 'ai-generated-production-art');
    assert.match(record.sourceMasterId, /^openai-imagegen:exec-[a-f0-9-]+$/);
    assert.equal(record.transparency.hasAlpha, true);
  }
});

test('the shared registry is loaded before every definition that consumes it', () => {
  const html=read('index.html');
  const registry=html.indexOf('js/ui-assets.js');
  assert.ok(registry>=0);
  assert.ok(registry<html.indexOf('js/meta.js'));
  assert.ok(registry<html.indexOf('js/skills.js'));
  assert.match(html,/js\/config\.js\?v=20260814-ui-consistency-1/);
  assert.match(html,/moguria-meta-ui\.css\?v=20260814-ui-consistency-1/);
});

test('meta definitions no longer expose OS emoji as their production artwork', () => {
  const { MoguriaMeta: meta, MoguriaSkills: skills } = loadDefinitions();
  for(const item of meta.EQUIPMENT){
    assert.equal(Object.hasOwn(item,'icon'),false,`${item.id} still owns an emoji icon`);
    assert.equal(meta.iconVisualForEquipment(item)?.src,`assets/images/ui-refresh/equipment/${item.id}.webp`);
  }
  for(const challenge of meta.CHALLENGES){
    assert.equal(Object.hasOwn(challenge,'icon'),false,`${challenge.id} still owns an emoji icon`);
    assert.equal(meta.iconVisualForOuting(challenge)?.src,`assets/images/ui-refresh/outings/${challenge.id}.webp`);
  }
  for(const artifact of skills.artifacts){
    assert.equal(skills.iconVisualForArtifact(artifact)?.src,`assets/images/ui-refresh/artifacts/${artifact.id}.webp`);
  }
});

test('the refreshed UI uses production art, hides unknown dex identity, and names rarity in Japanese', () => {
  const source=read('js/ui.js');
  const css=read('css/moguria-meta-ui.css');
  assert.doesNotMatch(source,/esc\((?:entry\.item\?\.|item\.|res\.item\.|challenge\.)icon/);
  assert.match(source,/アーティファクト <b>\$\{artifactCount\}/);
  assert.match(source,/found\?esc\(entry\.name\):'？？？'/);
  assert.match(source,/コモン・レア・エピック/);
  assert.match(source,/collectionGroupsMarkup/);
  assert.match(source,/if\(tone!=='error'\) noticeTimer = window\.setTimeout/);
  assert.match(source,/<span>\$\{done \? '受け取り済み' : '準備中'\}<\/span>/);
  assert.doesNotMatch(source,/data-claim=/);
  assert.match(css,/\.meta-gacha-reveal__image/);
  assert.match(css,/\.meta-outing-card__image/);
  assert.match(css,/\.meta-dex-card__art\[data-skill-atlas="fusion"\]/);
});

test('meta mutations fail closed when durable save fails', () => {
  const freshState = () => ({
    schema:3,
    meta:{
      coins:100,
      inventory:[{ id:'hat_leaf',uid:'owned-hat',name:'木の葉ぼうし',slot:'hat',rarity:'common',stat:{hp:3},level:1 }],
      equipped:{hat:null,body:null,hand:null,foot:null,charm:null},
      upgrades:{},
      claimedChallenges:{},
      daily:{key:'',claimed:false}
    }
  });
  const saveApi={
    fresh:freshState,
    load:freshState,
    save:()=>({ok:false,reason:'storage-failed'}),
    settleRun:()=>({ok:false,reason:'storage-failed'})
  };
  const { MoguriaMeta:meta }=loadDefinitions(saveApi);
  for(const result of [
    meta.addCoins(10),
    meta.pull(),
    meta.equip('owned-hat'),
    meta.claimChallenge('daily_mutation')
  ]){
    assert.equal(result.ok,false);
    assert.equal(result.reason,'save-failed');
    assert.match(result.message,/保存/);
  }
});
