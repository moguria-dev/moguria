'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Chapter 01 is a lazy Canvas2D screen with semantic DOM controls and release tokens', () => {
  const html = read('index.html');
  const home = read('js/home.js');
  const player = read('js/story-ch01-player.js');
  const css = read('css/moguria-story-ch01.css');

  assert.match(html, /<title>Moguria v3\.4\.0<\/title>/);
  assert.doesNotMatch(html, /css\/moguria-story-ch01\.css/, 'story styles must not join initial page loading');
  assert.match(html, /id="storyChapter01"[^>]*tabindex="-1"/);
  assert.match(html, /<canvas id="storyChapter01Canvas"/);
  assert.match(html, /id="storyChapter01SceneText"/);
  assert.match(html, /id="storyChapter01HoldTrack" role="progressbar"[^>]*aria-valuenow="0"/);
  assert.doesNotMatch(html, /<script[^>]+src="js\/story-ch01-player\.js/, 'story player must not join initial script loading');
  assert.match(home, /js\/story-ch01-player\.js\?v=20260816-story-ch01-1/);
  assert.match(home, /css\/moguria-story-ch01\.css\?v=20260816-story-ch01-1/);
  assert.match(home, /story player load timed out/);
  assert.match(home, /story stylesheet load timed out/);
  assert.match(home, /, 20000\)/, 'lazy resources use a bounded load timeout');
  assert.match(home, /story-c1-investigation-v1/);
  assert.match(home, /物語をはじめる/);
  assert.match(home, /帰り灯の夜/);
  assert.match(player, /getContext\?\.\('2d'/);
  assert.doesNotMatch(player, /Phaser|WebGL/);
  assert.match(player, /drawStaticDirection/, 'reduced motion keeps a static world-flow direction cue');
  assert.match(player, /t < 1690 \? ease\(\(t - 1550\) \/ 140\)/, 'reduced crack keeps its 140ms crossfade');
  assert.match(player, /postTime >= item\.at && postTime < item\.at \+ 140/, 'reduced fragment states crossfade rather than snap');
  assert.match(css, /@media \(max-height: 720px\)/);
  assert.match(css, /@media \(max-width: 380px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /env\(safe-area-inset-top/);
  assert.match(css, /story-ch01__pause \{\s*width: 44px;\s*min-height: 44px;/);
  assert.match(css, /story-ch01__hold-alternative \{[\s\S]*?min-height: 44px;/);
  assert.match(css, /max-height: 720px[\s\S]*?data-story-hold="true"[^\n]*\+ 175px/);
});

test('animation contract preserves all four approved causal sequences', () => {
  const contract = JSON.parse(read('assets/animations/story-ch01.json'));
  assert.equal(contract.version, 1);
  assert.equal(contract.renderContract.renderer, 'canvas-2d-keypose-atlas-with-continuous-rig');
  assert.equal(contract.renderContract.battlePhaserDependency, false);
  assert.deepEqual(contract.renderContract.logicalViewport, { width:390, height:844, unit:'css-px' });
  assert.deepEqual(contract.renderContract.minimumViewport, { width:375, height:667, unit:'css-px' });

  const animations = contract.storyAnimations;
  assert.deepEqual(Object.keys(animations), [
    'returnLightFlicker', 'reverseCrackRescue', 'fragmentConsumeStumble', 'ledgerBrokenPulse'
  ]);
  assert.equal(animations.returnLightFlicker.animationId, 'story-ch01.return-light-flicker');
  assert.equal(animations.returnLightFlicker.durationMs, 5400);
  assert.equal(animations.reverseCrackRescue.animationId, 'story-ch01.reverse-crack-rescue');
  assert.deepEqual(animations.reverseCrackRescue.requiredOrder, [
    'reverse_begin','crack_begin','mogu_caught','guardian_commit','guardian_contact'
  ]);
  assert.equal(animations.fragmentConsumeStumble.animationId, 'story-ch01.fragment-consume-stumble');
  assert.equal(animations.fragmentConsumeStumble.interaction.requiredHoldMs, 850);
  assert.equal(animations.fragmentConsumeStumble.interaction.qte, false);
  assert.equal(animations.fragmentConsumeStumble.interaction.choiceBranch, false);
  assert.deepEqual(animations.fragmentConsumeStumble.requiredOrder, [
    'consumed','community_light_restored','body_interference','stumble','companion_approach','masking_smile'
  ]);
  assert.equal(animations.ledgerBrokenPulse.animationId, 'story-ch01.ledger-broken-pulse');
  assert.equal(animations.ledgerBrokenPulse.exactGapDurationMs, 320);
  const gapStart = animations.ledgerBrokenPulse.eventMarkers.find(marker => marker.id === 'gap_begin').atMs;
  const gapEnd = animations.ledgerBrokenPulse.eventMarkers.find(marker => marker.id === 'gap_end').atMs;
  assert.equal(gapEnd - gapStart, 320);
});

test('story assets remain scene-lazy and outside the critical startup path', () => {
  const manifest = JSON.parse(read('assets/manifest.json'));
  assert.equal(manifest.critical.some(asset => asset.id.startsWith('story_ch01_')), false);
  const packs = Object.fromEntries(manifest.packs.filter(pack => pack.id.startsWith('story-ch01')).map(pack => [pack.id, pack]));
  assert.deepEqual(Object.keys(packs), [
    'story-ch01-core','story-ch01-return-hall','story-ch01-fragment-chamber','story-ch01-archive'
  ]);
  assert.equal(packs['story-ch01-core'].assets.some(asset => asset.id === 'story_ch01_animation_manifest' && asset.type === 'json'), true);
  assert.equal(packs['story-ch01-return-hall'].assets.some(asset => asset.id === 'story_ch01_star_companion_pose_atlas'), false, 'companion cannot appear in the past rescue');
  assert.equal(packs['story-ch01-fragment-chamber'].assets.some(asset => asset.id === 'story_ch01_star_companion_pose_atlas'), true);
});

test('post-run resume and chapter completion use the explicit save boundary', () => {
  const player = read('js/story-ch01-player.js');
  assert.match(player, /resumeAfterRun/);
  assert.match(player, /moguria:story-run-settled/);
  assert.match(player, /c1_return_pending/);
  assert.match(player, /saveApi\.transitionStory\(nextNodeId, patch\)/);
  assert.match(player, /nextNodeId = 'c1_record_signal'/);
  assert.match(player, /saveApi\.completeStoryChapter\(\)/);
  assert.doesNotMatch(player, /saveApi\.save\(/, 'protected story nodes must use transitionStory');
  assert.match(player, /if \(state\.replay\) return true/);
  assert.match(player, /if \(state\.replay\) \{\s*await enterScene\(3/);
  assert.doesNotMatch(player, /捕まるより先に救うことを選んだ/);
  assert.match(player, /pagehide/);
  assert.match(player, /pageshow/);
});
