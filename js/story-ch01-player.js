(function(){
  'use strict';

  const API_NAME = 'MoguriaStoryChapter01';
  const STORY_PROFILE_ID = 'story-c1-investigation-v1';
  const CORE_PACK = 'story-ch01-core';
  const LOGICAL_WIDTH = 390;
  const LOGICAL_HEIGHT = 844;
  const DPR_CAP = 2;
  const STORY_MANIFEST_ID = 'story_ch01_animation_manifest';
  const STORY_NODE_ORDER = ['c1_available','c1_seat','c1_return_lamp','c1_shard','c1_investigation_ready','c1_investigation_active','c1_return_pending','c1_record_signal','c1_complete'];
  const STORY_NODE_SCENES = Object.freeze({
    c1_available:0,
    c1_seat:0,
    c1_return_lamp:1,
    c1_shard:2,
    c1_investigation_ready:2,
    c1_investigation_active:2,
    c1_return_pending:3,
    c1_record_signal:3,
    c1_complete:3
  });

  const SCENES = [
    {
      id:'return-light', pack:'story-ch01-return-hall', animation:'returnLightFlicker',
      eyebrow:'THE RETURN LIGHT', title:'帰り灯',
      text:'いつもと同じはずの灯りが、一度だけ細く揺れた。',
      completeText:'消えはしない。それでも、戻った光はまだ少し不安定だった。',
      next:'記憶の奥へ'
    },
    {
      id:'reverse-rescue', pack:'story-ch01-return-hall', animation:'reverseCrackRescue',
      eyebrow:'A MEMORY IN REVERSE', title:'逆流と救助',
      text:'流れが先に逆さまになり、そのあとで夜に裂け目が走った。',
      completeText:'異変は幼いもぐより先に始まっていた。星の守り手は、救うことを選んだ。',
      next:'現在へ戻る'
    },
    {
      id:'fragment-chamber', pack:'story-ch01-fragment-chamber', animation:'fragmentConsumeStumble',
      eyebrow:'THE DAMAGED FRAGMENT', title:'損傷片',
      text:'通常の星の実でも、星の相棒でもない。損傷片が、共同灯のそばで脈打っている。',
      completeText:'共同灯は戻った。けれど、もぐは痛みを隠すように笑った。',
      next:'異変を追う'
    },
    {
      id:'archive-ledger', pack:'story-ch01-archive', animation:'ledgerBrokenPulse',
      eyebrow:'THE OLD RETURN LEDGER', title:'途切れた応答',
      text:'古い帰還記録に帰り灯を重ねると、一本の線がかすかに応えた。',
      completeText:'応答は一度だけ途切れ、弱く続いて、やがて沈黙した。誰のものかは、まだ分からない。',
      next:'今回の記録を閉じる'
    }
  ];

  const state = {
    phase:'idle', open:false, opening:null, generation:0, sceneIndex:0,
    sceneTime:0, postTime:0, completed:false, contract:null,
    currentPack:'', requestedPack:'', raf:0, lastNow:null, paused:false, hiddenPaused:false,
    trigger:null, reducedMotion:false, fired:new Set(), listeners:[], observer:null,
    hold:{ active:false, elapsed:0, committed:false, pointerId:null, alternativeArmed:false },
    ctx:null, width:LOGICAL_WIDTH, height:LOGICAL_HEIGHT, dpr:1,
    completionBlocked:false, replay:false, transitioning:false, loadController:null, testOverrides:null
  };

  const $ = id => document.getElementById(id);
  const now = () => window.performance?.now?.() ?? Date.now();
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const lerp = (a, b, amount) => a + (b - a) * clamp(amount, 0, 1);
  const ease = amount => {
    const t = clamp(amount, 0, 1);
    return t * t * (3 - 2 * t);
  };

  function animationFor(scene = SCENES[state.sceneIndex]){
    return state.contract?.storyAnimations?.[scene.animation] || null;
  }

  function sceneIndexForNode(value){
    const node = String(value || '').toLowerCase();
    if (hasOwn(STORY_NODE_SCENES, node)) return STORY_NODE_SCENES[node];
    if (node.includes('record') || node.includes('return_pending') || node.includes('complete') || node.includes('ledger') || node.includes('archive')) return 3;
    if (node.includes('investigation') || node.includes('shard') || node.includes('fragment')) return 2;
    if (node.includes('return_lamp') || node.includes('rescue') || node.includes('past')) return 1;
    return 0;
  }

  function isInvestigationBoundary(value){
    return value === 'c1_investigation_ready' || value === 'c1_investigation_active';
  }

  function readCurrentNode(payload = {}){
    const direct = payload.currentNodeId || payload.currentNode;
    const settlement = payload.settlement || {};
    const run = payload.run || {};
    if (direct) return direct;
    const candidates = [
      settlement.data?.story?.currentNodeId,
      settlement.story?.currentNodeId,
      run.story?.currentNodeId,
      run.currentNodeId
    ];
    try { candidates.push(window.MoguriaSave?.load?.()?.story?.currentNodeId); }
    catch (error) { /* Save access failure must not strand the post-run return. */ }
    return candidates.find(Boolean) || 'c1_return_pending';
  }

  function appendUnique(list, value){
    const values = Array.isArray(list) ? list.slice() : [];
    if (!values.includes(value)) values.push(value);
    return values;
  }

  function persistProgress(sceneIndex, complete = false){
    if (state.replay) return true;
    const saveApi = window.MoguriaSave;
    if (!saveApi?.load || !saveApi?.transitionStory || !saveApi?.updateStory) return false;
    try {
      const data = saveApi.load();
      const story = data.story && typeof data.story === 'object' ? data.story : {};
      const worldFlags = { ...(story.worldFlags || {}), c1InvitationSeen:true };
      const knowledgeFlags = Array.isArray(story.knowledgeFlags) ? story.knowledgeFlags.slice() : [];
      const replayUnlockIds = Array.isArray(story.replayUnlockIds) ? story.replayUnlockIds.slice() : [];
      let nextNodeId = story.currentNodeId;
      let patch = { worldFlags };
      if (sceneIndex === 0) {
        nextNodeId = complete ? 'c1_return_lamp' : 'c1_seat';
        if (complete) {
          patch.knowledgeFlags = appendUnique(knowledgeFlags, 'return-light-seen');
          patch.replayUnlockIds = appendUnique(replayUnlockIds, 'c1-return-lamp');
        }
      } else if (sceneIndex === 1) {
        nextNodeId = complete ? 'c1_shard' : 'c1_return_lamp';
      } else if (sceneIndex === 2) {
        nextNodeId = complete ? 'c1_investigation_ready' : 'c1_shard';
        if (complete) {
          patch.knowledgeFlags = appendUnique(appendUnique(knowledgeFlags, 'shared-lamp-seen'), 'damaged-fragment-seen');
          patch.replayUnlockIds = appendUnique(replayUnlockIds, 'c1-shard');
          patch.worldFlags = { ...worldFlags, c1SharedLampRestored:true };
        }
      } else if (sceneIndex === 3) {
        nextNodeId = 'c1_record_signal';
        if (complete) {
          if (story.currentNodeId === 'c1_return_pending') {
            const boundary = saveApi.transitionStory('c1_record_signal', patch);
            if (boundary?.ok === false) return false;
          } else if (story.currentNodeId !== 'c1_record_signal' && story.currentNodeId !== 'c1_complete') {
            return false;
          }
          const currentStory = saveApi.load()?.story || story;
          const updated = saveApi.updateStory({
            knowledgeFlags:appendUnique(currentStory.knowledgeFlags, 'old-record-responded'),
            replayUnlockIds:appendUnique(currentStory.replayUnlockIds, 'c1-record-signal'),
            worldFlags:{ ...(currentStory.worldFlags || {}), c1InvitationSeen:true, c1OldRecordResponded:true, c1InvestigationComplete:true }
          });
          if (updated?.ok === false || typeof saveApi.completeStoryChapter !== 'function') return false;
          const completion = saveApi.completeStoryChapter();
          return completion?.ok !== false;
        }
      }

      const currentRank = STORY_NODE_ORDER.indexOf(story.currentNodeId);
      const nextRank = STORY_NODE_ORDER.indexOf(nextNodeId);
      if (nextNodeId === story.currentNodeId) {
        if (Object.keys(patch).length === 1 && patch.worldFlags.c1InvitationSeen === story.worldFlags?.c1InvitationSeen) return true;
        return saveApi.updateStory(patch)?.ok !== false;
      }
      if (nextRank < currentRank) return true;
      return saveApi.transitionStory(nextNodeId, patch)?.ok !== false;
    } catch (error) {
      console.warn('[MoguriaStoryChapter01] story progress could not be saved', error);
      return false;
    }
  }

  function announce(message){
    const status = $('storyChapter01Status');
    if (status) status.textContent = String(message || '');
  }

  function setText(id, value){
    const element = $(id);
    if (element) element.textContent = String(value || '');
  }

  function setSceneUi(){
    const scene = SCENES[state.sceneIndex];
    const section = $('storyChapter01');
    if (section) section.dataset.storyScene = scene.id;
    setText('storyChapter01Count', `${state.sceneIndex + 1} / ${SCENES.length}`);
    $('storyChapter01Count')?.setAttribute?.('aria-label', `${SCENES.length}場面中${state.sceneIndex + 1}場面目`);
    setText('storyChapter01Eyebrow', scene.eyebrow);
    setText('storyChapter01SceneTitle', scene.title);
    setText('storyChapter01SceneText', state.completed ? scene.completeText : scene.text);
    const steps = $('storyChapter01Steps')?.querySelectorAll?.('i') || [];
    [...steps].forEach((step, index) => step.classList.toggle('active', index === state.sceneIndex));

    const hold = $('storyChapter01Hold');
    const holdAlternative = $('storyChapter01HoldAlternative');
    const next = $('storyChapter01Next');
    const closeButton = $('storyChapter01Close');
    const closeAllowed = canCloseScene();
    if (closeButton) {
      closeButton.disabled = !closeAllowed;
      closeButton.setAttribute('aria-disabled', closeAllowed ? 'false' : 'true');
      closeButton.setAttribute('aria-label', closeAllowed
        ? '物語を閉じてホームへ戻る'
        : 'この場面が終わるまでホームへ戻れません');
    }
    const holdAvailable = state.sceneIndex === 2 && state.sceneTime >= 700 && !state.hold.committed;
    if (hold) hold.hidden = !holdAvailable;
    if (section) section.dataset.storyHold = holdAvailable ? 'true' : 'false';
    if (holdAlternative) {
      holdAlternative.hidden = !holdAvailable;
      holdAlternative.textContent = state.hold.alternativeArmed
        ? 'もう一度押して光片に触れる'
        : '長押しが難しい方はこちら';
    }
    if (next) {
      next.hidden = !state.completed;
      next.disabled = false;
      next.setAttribute('aria-busy', 'false');
      next.textContent = state.completionBlocked ? '記録を保存する' : scene.next;
    }
  }

  function canCloseScene(){
    if (state.phase === 'error' || state.phase === 'idle') return true;
    return state.sceneIndex === 0
      || (state.sceneIndex === 1 && state.completed)
      || (state.sceneIndex === 2 && (!state.hold.committed || state.completed))
      || (state.sceneIndex === 3 && state.completed);
  }

  function resizeCanvas(){
    const canvas = $('storyChapter01Canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect?.() || { width:window.innerWidth || LOGICAL_WIDTH, height:window.innerHeight || LOGICAL_HEIGHT };
    const width = Math.max(1, Number(rect.width) || LOGICAL_WIDTH);
    const height = Math.max(1, Number(rect.height) || LOGICAL_HEIGHT);
    const dpr = Math.min(DPR_CAP, Math.max(1, Number(window.devicePixelRatio) || 1));
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    state.width = width;
    state.height = height;
    state.dpr = dpr;
    state.ctx = canvas.getContext?.('2d', { alpha:false, desynchronized:true }) || null;
    state.ctx?.setTransform?.(dpr, 0, 0, dpr, 0, 0);
  }

  function image(id){ return window.MoguriaAssets?.getImage?.(id) || null; }

  function drawImageSafe(ctx, source, sx, sy, sw, sh, dx, dy, dw, dh){
    if (!source) return false;
    try {
      if (arguments.length === 10) ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
      else ctx.drawImage(source, sx, sy, sw, sh);
      return true;
    } catch (error) { return false; }
  }

  function drawCover(ctx, source){
    if (!source) return;
    const iw = Number(source.naturalWidth || source.width) || LOGICAL_WIDTH;
    const ih = Number(source.naturalHeight || source.height) || LOGICAL_HEIGHT;
    const scale = Math.max(LOGICAL_WIDTH / iw, LOGICAL_HEIGHT / ih);
    const sw = LOGICAL_WIDTH / scale;
    const sh = LOGICAL_HEIGHT / scale;
    drawImageSafe(ctx, source, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  }

  function drawProp(ctx, id, x, y, displayHeight, options = {}){
    const source = image(id);
    if (!source) return;
    const iw = Number(source.naturalWidth || source.width) || displayHeight;
    const ih = Number(source.naturalHeight || source.height) || displayHeight;
    const height = displayHeight;
    const width = height * iw / ih;
    ctx.save();
    ctx.globalAlpha *= options.alpha == null ? 1 : options.alpha;
    ctx.translate(x, y);
    if (options.rotate) ctx.rotate(options.rotate);
    const scale = options.scale == null ? 1 : options.scale;
    ctx.scale(scale, scale);
    drawImageSafe(ctx, source, -width * (options.pivotX ?? .5), -height * (options.pivotY ?? .5), width, height);
    ctx.restore();
  }

  function drawAtlas(ctx, atlasName, poseName, x, y, displayHeight, options = {}){
    const atlas = state.contract?.poseAtlases?.[atlasName];
    const source = image(atlas?.assetId);
    const frame = atlas?.states?.[poseName];
    if (!source || !atlas || !Number.isInteger(frame)) return;
    const columns = atlas.columns || 1;
    const cellWidth = atlas.cell?.width || 1;
    const cellHeight = atlas.cell?.height || 1;
    const sx = frame % columns * cellWidth;
    const sy = Math.floor(frame / columns) * cellHeight;
    const width = displayHeight * cellWidth / cellHeight;
    const pivot = atlas.pivot || { x:.5, y:1 };
    ctx.save();
    ctx.globalAlpha *= options.alpha == null ? 1 : options.alpha;
    ctx.translate(x, y);
    if (options.rotate) ctx.rotate(options.rotate);
    const scale = options.scale == null ? 1 : options.scale;
    ctx.scale(options.flipX ? -scale : scale, scale);
    drawImageSafe(ctx, source, sx, sy, cellWidth, cellHeight, -width * pivot.x, -displayHeight * pivot.y, width, displayHeight);
    ctx.restore();
  }

  function glow(ctx, x, y, radius, color, alpha){
    const gradient = ctx.createRadialGradient?.(x, y, 0, x, y, radius);
    if (!gradient) return;
    gradient.addColorStop(0, color.replace('ALPHA', String(alpha)));
    gradient.addColorStop(.42, color.replace('ALPHA', String(alpha * .38)));
    gradient.addColorStop(1, color.replace('ALPHA', '0'));
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function drawWorldFlow(ctx, time, reversed, riftAmount, reversalMix = reversed ? 1 : 0){
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    if (state.reducedMotion) {
      const drawStaticDirection = (direction, alpha, color) => {
        if (alpha <= 0) return;
        ctx.globalAlpha = .34 * alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        for (const [x, y, length] of [[82, 190, 42], [265, 250, 50], [105, 338, 46], [282, 430, 40]]) {
          const start = direction > 0 ? x : x + length;
          const end = direction > 0 ? x + length : x;
          ctx.beginPath();
          ctx.moveTo(start, y);
          ctx.lineTo(end, y);
          ctx.lineTo(end - direction * 7, y - 4);
          ctx.moveTo(end, y);
          ctx.lineTo(end - direction * 7, y + 4);
          ctx.stroke();
        }
      };
      drawStaticDirection(1, 1 - reversalMix, '#ffe5a0');
      drawStaticDirection(-1, reversalMix, '#c5a8ff');
    } else {
      for (let i = 0; i < 18; i += 1) {
        const seed = i * 31.7;
        const direction = reversed ? -1 : 1;
        const x = ((seed + direction * time * .035) % 460 + 460) % 460 - 35;
        const y = 145 + (i * 83 % 380) + Math.sin(time * .002 + i) * 9;
        ctx.globalAlpha = .16 + (i % 4) * .05;
        ctx.fillStyle = i % 3 === 0 ? '#ffe6a0' : '#a789ff';
        ctx.beginPath();
        ctx.arc(x, y, 1.3 + i % 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (riftAmount > 0) {
      ctx.globalAlpha = .85 * riftAmount;
      ctx.strokeStyle = '#c9b0ff';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = '#8c5cff';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(196, 210);
      ctx.lineTo(184, 272);
      ctx.lineTo(205, 322);
      ctx.lineTo(190, 382);
      ctx.lineTo(211, 438);
      ctx.stroke();
    }
    ctx.restore();
  }

  function returnLightLevel(time){
    const t = Math.max(0, Number(time) || 0);
    if (state.reducedMotion) {
      if (t < 2260) return .96;
      if (t < 2400) return lerp(.96, .42, ease((t - 2260) / 140));
      if (t < 3320) return .42;
      if (t < 3460) return lerp(.42, .72, ease((t - 3320) / 140));
      return .72;
    }
    if (t < 1480) return .98 + Math.sin(t * .004) * .02;
    if (t < 2260) return lerp(.98, .68, ease((t - 1480) / 780));
    if (t < 2860) return lerp(.68, .38, ease((t - 2260) / 600));
    if (t < 3320) return lerp(.38, .72, ease((t - 2860) / 460));
    if (t < 4380) return .72 + Math.sin((t - 3320) * .012) * .1;
    return .67 + Math.sin((t - 4380) * .017) * .08;
  }

  function drawReturnLight(ctx, time){
    drawCover(ctx, image('story_ch01_bg_return_hall'));
    const light = returnLightLevel(time);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    glow(ctx, 195, 365, 118 + light * 35, 'rgba(255,220,125,ALPHA)', .25 + light * .32);
    ctx.restore();
    drawProp(ctx, 'story_ch01_return_light', 195, 367, 156, { alpha:.48 + light * .52, scale:.94 + light * .06 });
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    glow(ctx, 195, 365, 48, 'rgba(255,250,212,ALPHA)', .42 + light * .36);
    ctx.restore();
  }

  function rescuePoses(t){
    if (t < 900) return ['calm', 'watch'];
    if (t < 2550) return ['startled', 'watch'];
    if (t < 3100) return ['caught', 'watch'];
    if (t < 3375) return ['caught', 'commit'];
    if (t < 3650) return ['lifted', 'lunge'];
    if (t < 4450) return ['reachRescuer', 'contact'];
    return ['safeHuddle', 'protect'];
  }

  function drawRescue(ctx, time){
    drawCover(ctx, image('story_ch01_bg_return_hall'));
    const t = Math.max(0, Number(time) || 0);
    const reversed = t >= 900;
    const reversalMix = state.reducedMotion ? ease((t - 900) / 140) : (reversed ? 1 : 0);
    const rift = state.reducedMotion
      ? (t < 1550 ? 0 : t < 1690 ? ease((t - 1550) / 140) : t < 4450 ? 1 : 1 - ease((t - 4450) / 140))
      : (t < 1550 ? 0 : t < 2250 ? ease((t - 1550) / 700) : t < 4450 ? 1 : 1 - ease((t - 4450) / 500));
    drawWorldFlow(ctx, t, reversed, rift, reversalMix);
    drawProp(ctx, 'story_ch01_return_light', 195, 168, 88, { alpha:.78 });
    const [youngPose, guardianPose] = rescuePoses(t);
    const positionTime = state.reducedMotion
      ? (t < 2550 ? 900 : t < 3100 ? 2550 : t < 3650 ? 3100 : t < 4450 ? 3650 : 5200)
      : t;
    const caughtLift = positionTime >= 2550 && positionTime < 4450 ? -Math.sin(clamp((positionTime - 2550) / 1900, 0, 1) * Math.PI) * 52 : 0;
    const guardianX = positionTime < 3100 ? 296 : positionTime < 3650 ? lerp(296, 244, ease((positionTime - 3100) / 550)) : 244;
    const crossedBoundaries = [900, 2550, 3100, 3375, 3650, 4450].filter(at => at <= t);
    const boundary = crossedBoundaries[crossedBoundaries.length - 1];
    const poseMix = state.reducedMotion && boundary != null && t < boundary + 140
      ? ease((t - boundary) / 140)
      : 1;
    if (poseMix < 1) {
      const [previousYoung, previousGuardian] = rescuePoses(Math.max(0, boundary - 1));
      drawAtlas(ctx, 'youngMogu', previousYoung, 151, 548 + caughtLift, 154, { alpha:1 - poseMix });
      drawAtlas(ctx, 'starGuardianCandidate', previousGuardian, guardianX, 552, 224, { alpha:1 - poseMix, flipX:true });
    }
    drawAtlas(ctx, 'youngMogu', youngPose, 151, 548 + caughtLift, 154, { alpha:poseMix, rotate:state.reducedMotion ? 0 : Math.sin(t * .01) * .012 });
    drawAtlas(ctx, 'starGuardianCandidate', guardianPose, guardianX, 552, 224, { alpha:poseMix, flipX:true });
  }

  function fragmentPoses(t, committed){
    if (!committed) return ['reach', 'idle'];
    if (t < 650) return ['reach', 'notice'];
    if (t < 1500) return ['consumed', 'worry'];
    if (t < 2150) return ['bodyInterference', 'worry'];
    if (t < 2450) return ['stumble', 'worry'];
    if (t < 3000) return ['stumble', 'approach'];
    if (t < 3750) return ['stumble', 'concern'];
    return ['maskingSmile', 'stayNear'];
  }

  function reducedFragmentSnapshot(postTime){
    if (postTime < 1050) return 350;
    if (postTime < 2450) return 1200;
    if (postTime < 3750) return 3400;
    return 4000;
  }

  function drawFragmentLayer(ctx, preTime, t, committed, alpha = 1){
    ctx.save();
    ctx.globalAlpha *= alpha;
    const restored = committed && t >= 1050;
    const fragmentVisible = !committed || t < 650;
    const lampLevel = restored ? .95 : .35;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    glow(ctx, 294, 374, 86 + lampLevel * 42, 'rgba(255,214,119,ALPHA)', .16 + lampLevel * .35);
    ctx.restore();
    drawProp(ctx, 'story_ch01_community_lamp', 294, 400, 174, { alpha:.58 + lampLevel * .42 });
    if (fragmentVisible) {
      const pulse = state.reducedMotion ? 1 : .93 + Math.sin((committed ? t : preTime) * .012) * .07;
      drawProp(ctx, 'story_ch01_damaged_fragment', 200, 456, 92, { scale:pulse });
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      glow(ctx, 200, 456, 58, 'rgba(170,119,255,ALPHA)', .34);
      ctx.restore();
    }
    const [moguPose, companionPose] = fragmentPoses(t, committed);
    const stumble = committed && t >= 1500 && t < 3000 && !state.reducedMotion;
    const moguX = 145 + (stumble ? Math.sin(t * .036) * 4 : 0);
    const moguRotation = stumble ? Math.sin(t * .041) * .035 : (moguPose === 'stumble' ? -.035 : 0);
    const companionX = committed && t >= 2450 ? lerp(302, 257, ease((t - 2450) / 900)) : 302;
    drawAtlas(ctx, 'currentMogu', moguPose, moguX, 603, 220, { rotate:moguRotation });
    drawAtlas(ctx, 'starCompanion', companionPose, companionX, 534, 88, { rotate:state.reducedMotion ? 0 : Math.sin((t + 400) * .006) * .035 });
    ctx.restore();
  }

  function drawFragment(ctx, preTime, postTime){
    drawCover(ctx, image('story_ch01_bg_fragment_chamber'));
    const committed = state.hold.committed;
    if (!state.reducedMotion || !committed) {
      drawFragmentLayer(ctx, preTime, postTime, committed);
      return;
    }
    const boundaries = [
      { at:1050, from:350, to:1200 },
      { at:2450, from:1200, to:3400 },
      { at:3750, from:3400, to:4000 }
    ];
    const transition = boundaries.find(item => postTime >= item.at && postTime < item.at + 140);
    if (transition) {
      const mix = ease((postTime - transition.at) / 140);
      drawFragmentLayer(ctx, preTime, transition.from, true, 1 - mix);
      drawFragmentLayer(ctx, preTime, transition.to, true, mix);
      return;
    }
    drawFragmentLayer(ctx, preTime, reducedFragmentSnapshot(postTime), true);
  }

  function ledgerPulse(time){
    if (time < 1450 || time >= 3350) return 0;
    if (state.reducedMotion) {
      if (time < 1590) return ease((time - 1450) / 140);
      if (time < 2210) return 1;
      if (time < 2350) return 1 - ease((time - 2210) / 140);
      if (time < 2670) return 0;
      if (time < 2810) return .38 * ease((time - 2670) / 140);
      if (time < 3210) return .38;
      return .38 * (1 - ease((time - 3210) / 140));
    }
    if (time < 2350) return ease((time - 1450) / 380);
    if (time < 2670) return 0;
    if (time < 2940) return .38 * ease((time - 2670) / 270);
    return .38 * (1 - ease((time - 2940) / 410));
  }

  function drawLedger(ctx, time){
    drawCover(ctx, image('story_ch01_bg_archive'));
    drawProp(ctx, 'story_ch01_return_ledger', 195, 455, 250, { pivotY:.5 });
    const overlap = time >= 850 && time < 4200 ? 1 : time >= 4200 ? Math.max(0, 1 - (time - 4200) / 500) : 0;
    drawProp(ctx, 'story_ch01_return_light', 195, 310, 102, { alpha:.45 + overlap * .48 });
    const pulse = ledgerPulse(time);
    if (pulse > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = `rgba(196,166,255,${.35 + pulse * .55})`;
      ctx.lineWidth = 2 + pulse * 1.5;
      ctx.shadowColor = '#b389ff';
      ctx.shadowBlur = 16 * pulse;
      ctx.beginPath();
      ctx.moveTo(105, 476);
      ctx.bezierCurveTo(140, 448, 155, 494, 187, 466);
      ctx.bezierCurveTo(210, 446, 224, 486, 282, 459);
      ctx.stroke();
      glow(ctx, 246, 459, 42, 'rgba(201,170,255,ALPHA)', .2 + pulse * .32);
      ctx.restore();
    }
  }

  function render(){
    const ctx = state.ctx;
    if (!ctx) return;
    ctx.setTransform?.(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.fillStyle = '#060716';
    ctx.fillRect(0, 0, state.width, state.height);
    const scale = Math.max(state.width / LOGICAL_WIDTH, state.height / LOGICAL_HEIGHT);
    const offsetX = (state.width - LOGICAL_WIDTH * scale) / 2;
    const offsetY = (state.height - LOGICAL_HEIGHT * scale) / 2;
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    if (state.sceneIndex === 0) drawReturnLight(ctx, state.sceneTime);
    else if (state.sceneIndex === 1) drawRescue(ctx, state.sceneTime);
    else if (state.sceneIndex === 2) drawFragment(ctx, state.sceneTime, state.postTime);
    else drawLedger(ctx, state.sceneTime);
    ctx.restore();
  }

  function markerMessage(id){
    return ({
      reverse_begin:'光の流れが逆さまになった。', crack_begin:'夜に裂け目が走った。',
      mogu_caught:'幼いもぐが流れに捕まった。', guardian_commit:'星の守り手が救助へ踏み出した。',
      rescue_clear:'幼いもぐは守られている。', hold_available:'光へ手を伸ばせます。',
      consumed:'傷ついた光片を取り込んだ。', community_light_restored:'共同灯が戻った。',
      body_interference:'もぐの身体に異変が走った。', companion_approach:'星の相棒がそばへ寄った。',
      pulse_begin:'古い記録が一度だけ応えた。', gap_begin:'応答が途切れた。', silence:'応答は沈黙した。'
    })[id] || '';
  }

  function fireMarkers(animation, currentTime, clock){
    for (const marker of animation?.eventMarkers || []) {
      if ((marker.clock || 'scene') !== clock) continue;
      const key = `${state.sceneIndex}:${clock}:${marker.id}`;
      if (state.fired.has(key) || currentTime < Number(marker.atMs || 0)) continue;
      state.fired.add(key);
      const message = markerMessage(marker.id);
      if (message) announce(message);
    }
  }

  function finishScene(){
    if (state.completed) return;
    const saved = persistProgress(state.sceneIndex, true);
    state.completed = true;
    state.completionBlocked = !saved;
    setSceneUi();
    announce(state.completionBlocked
      ? '場面は終わりましたが、記録を保存できませんでした。'
      : `${SCENES[state.sceneIndex].title}。${SCENES[state.sceneIndex].completeText}`);
    window.requestAnimationFrame?.(() => $('storyChapter01Next')?.focus?.({ preventScroll:true }));
  }

  function advance(delta){
    if (state.completed) return;
    const animation = animationFor();
    if (state.sceneIndex === 2) {
      if (!state.hold.committed) {
        state.sceneTime = Math.min(Number(animation?.preCommitLogicalTimeMs) || 700, state.sceneTime + delta);
        fireMarkers(animation, state.sceneTime, 'pre-commit');
        if (state.sceneTime >= 700) setSceneUi();
        if (state.hold.active) {
          state.hold.elapsed = Math.min(850, state.hold.elapsed + delta);
          const progress = $('storyChapter01HoldProgress');
          if (progress) progress.style.width = `${state.hold.elapsed / 850 * 100}%`;
          $('storyChapter01HoldTrack')?.setAttribute?.('aria-valuenow', String(Math.round(state.hold.elapsed / 8.5)));
          if (state.hold.elapsed >= 850) commitHold();
        }
      } else {
        state.postTime += delta;
        fireMarkers(animation, state.postTime, 'post-commit');
        if (state.postTime >= (Number(animation?.nominalDurationMsAfterHoldConfirmed) || 5250)) finishScene();
      }
      return;
    }

    state.sceneTime += delta;
    fireMarkers(animation, state.sceneTime, 'scene');
    const duration = Number(animation?.durationMs) || (state.sceneIndex === 1 ? 6400 : 5400);
    if (state.sceneTime >= duration) finishScene();
  }

  function tick(timestamp){
    state.raf = 0;
    if (!state.open) return;
    const section = $('storyChapter01');
    if (!section?.classList?.contains('active')) return;
    const current = Number(timestamp) || now();
    if (state.lastNow == null) state.lastNow = current;
    const delta = Math.max(0, Math.min(100, current - state.lastNow));
    state.lastNow = current;
    if (!state.paused && !state.hiddenPaused && state.phase === 'running') advance(delta);
    render();
    state.raf = window.requestAnimationFrame?.(tick) || 0;
  }

  function startLoop(){
    if (!state.open || state.raf) return;
    state.lastNow = now();
    state.raf = window.requestAnimationFrame?.(tick) || 0;
    if (!state.raf) render();
  }

  function stopLoop(){
    if (state.raf) window.cancelAnimationFrame?.(state.raf);
    state.raf = 0;
    state.lastNow = null;
  }

  function beginHold(event){
    if (!state.open || state.paused || state.hiddenPaused || state.sceneIndex !== 2 || state.sceneTime < 700 || state.hold.committed) return;
    event?.preventDefault?.();
    state.hold.active = true;
    state.hold.alternativeArmed = false;
    state.hold.pointerId = Number.isFinite(event?.pointerId) ? event.pointerId : null;
    if (state.hold.pointerId != null) event?.currentTarget?.setPointerCapture?.(state.hold.pointerId);
    const hold = $('storyChapter01Hold');
    if (hold) {
      hold.dataset.holding = 'true';
      hold.setAttribute('aria-pressed', 'true');
    }
    announce('光へ手を伸ばしています。');
  }

  function cancelHold(event){
    if (!state.hold.active || state.hold.committed) return;
    if (state.hold.pointerId != null && Number.isFinite(event?.pointerId) && event.pointerId !== state.hold.pointerId) return;
    state.hold.active = false;
    state.hold.pointerId = null;
    state.hold.elapsed = 0;
    const hold = $('storyChapter01Hold');
    if (hold) {
      hold.dataset.holding = 'false';
      hold.setAttribute('aria-pressed', 'false');
    }
    $('storyChapter01HoldTrack')?.setAttribute?.('aria-valuenow', '0');
    const progress = $('storyChapter01HoldProgress');
    if (progress) progress.style.width = '0%';
    announce('手を離しました。失敗にはなりません。もう一度ゆっくり押せます。');
  }

  function commitHold(){
    if (state.hold.committed) return;
    state.hold.committed = true;
    state.hold.active = false;
    state.hold.pointerId = null;
    state.postTime = 0;
    state.fired.add(`${state.sceneIndex}:post-commit:hold_confirmed`);
    const hold = $('storyChapter01Hold');
    if (hold) {
      hold.hidden = true;
      hold.dataset.holding = 'false';
      hold.setAttribute('aria-pressed', 'false');
    }
    $('storyChapter01HoldTrack')?.setAttribute?.('aria-valuenow', '100');
    setSceneUi();
    announce('光片に触れました。');
  }

  function useHoldAlternative(){
    if (!state.open || state.paused || state.hiddenPaused || state.sceneIndex !== 2 || state.sceneTime < 700 || state.hold.committed) return;
    if (!state.hold.alternativeArmed) {
      state.hold.alternativeArmed = true;
      setSceneUi();
      announce('長押しの代わりに、もう一度押すと光片へ触れます。');
      return;
    }
    commitHold();
  }

  function togglePause(){
    if (state.paused) resume();
    else pause();
  }

  function onHoldKeyDown(event){
    if (event.key !== ' ' && event.key !== 'Enter') return;
    if (event.repeat) return;
    beginHold(event);
  }

  function onHoldKeyUp(event){
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault?.();
    cancelHold(event);
  }

  function bind(target, type, handler, options){
    target?.addEventListener?.(type, handler, options);
    state.listeners.push(() => target?.removeEventListener?.(type, handler, options));
  }

  function bindRuntime(){
    if (state.listeners.length) return;
    bind($('storyChapter01Close'), 'click', () => { void close(); });
    bind($('storyChapter01Pause'), 'click', togglePause);
    bind($('storyChapter01Next'), 'click', () => { void goNext(); });
    const hold = $('storyChapter01Hold');
    bind(hold, 'pointerdown', beginHold);
    bind(hold, 'pointerup', cancelHold);
    bind(hold, 'pointercancel', cancelHold);
    bind(hold, 'lostpointercapture', cancelHold);
    bind(hold, 'keydown', onHoldKeyDown);
    bind(hold, 'keyup', onHoldKeyUp);
    bind($('storyChapter01HoldAlternative'), 'click', useHoldAlternative);
    bind(document, 'visibilitychange', () => {
      state.hiddenPaused = document.hidden === true || document.visibilityState === 'hidden';
      if (state.hiddenPaused) {
        cancelHold();
        stopLoop();
      }
      state.lastNow = now();
      if (!state.hiddenPaused) startLoop();
    });
    bind(window, 'blur', () => cancelHold());
    bind(document, 'keydown', event => {
      if (!state.open || !$('storyChapter01')?.classList?.contains('active')) return;
      if (event.key === 'Escape' && !$('storyChapter01Close')?.disabled) {
        event.preventDefault?.();
        void close();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = [
        $('storyChapter01Close'), $('storyChapter01Pause'), $('storyChapter01Hold'),
        $('storyChapter01HoldAlternative'), $('storyChapter01Next')
      ].filter(element => element && !element.hidden && !element.disabled);
      event.preventDefault?.();
      if (!focusables.length) {
        $('storyChapter01')?.focus?.({ preventScroll:true });
        return;
      }
      const currentIndex = focusables.indexOf(document.activeElement);
      const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? focusables.length - 1 : currentIndex - 1)
        : (currentIndex < 0 || currentIndex === focusables.length - 1 ? 0 : currentIndex + 1);
      focusables[nextIndex]?.focus?.({ preventScroll:true });
    });
    bind(window, 'pagehide', event => {
      if (!state.open) return;
      const reopen = Boolean(event?.persisted);
      const reopenReplay = state.replay;
      const reopenSceneIndex = state.sceneIndex;
      void teardown({ showHome:false, restoreFocus:false });
      if (reopen) {
        window.addEventListener?.('pageshow', () => {
          const currentNodeId = window.MoguriaSave?.load?.()?.story?.currentNodeId;
          void open({
            ...(reopenReplay ? { sceneIndex:reopenSceneIndex, replay:true } : { currentNodeId }),
            trigger:$('storyBtn') || $('startBtn')
          }).catch(error => {
            console.error('[MoguriaStoryChapter01] bfcache restore failed', error);
            const notice = $('homeNotice');
            if (notice) {
              notice.textContent = '物語の復帰に失敗しました。ホームからもう一度ためしてください。';
              notice.dataset.tone = 'error';
              notice.setAttribute('role', 'alert');
              notice.hidden = false;
            }
          });
        }, { once:true });
      }
    });
    bind(window, 'resize', resizeCanvas, { passive:true });
    if (typeof ResizeObserver === 'function') {
      state.observer = new ResizeObserver(() => { resizeCanvas(); render(); });
      state.observer.observe?.($('storyChapter01'));
    }
  }

  function unbindRuntime(){
    for (const remove of state.listeners.splice(0)) remove();
    state.observer?.disconnect?.();
    state.observer = null;
  }

  function nextLoadController(){
    state.loadController?.abort?.();
    state.loadController = typeof AbortController === 'function' ? new AbortController() : null;
    return state.loadController;
  }

  async function loadScenePack(index, token, signal){
    const assets = window.MoguriaAssets;
    if (!assets?.loadPack || !assets?.getImage) throw new Error('asset manager unavailable');
    const nextPack = SCENES[index].pack;
    if (state.currentPack === nextPack) return;
    state.requestedPack = nextPack;
    const loadingText = $('storyChapter01LoadingText');
    if (loadingText) loadingText.textContent = index === 3 ? '古い記録をひらいています…' : '場面の灯りを集めています…';
    const loaded = await assets.loadPack(nextPack, signal ? { signal } : {});
    if (token !== state.generation) {
      if (!state.open || state.requestedPack !== nextPack) assets.releasePack?.(nextPack);
      return;
    }
    if (!loaded?.ok) throw new Error(`story scene pack failed: ${nextPack}`);
    const previous = state.currentPack;
    state.currentPack = nextPack;
    state.requestedPack = '';
    if (previous && previous !== nextPack) assets.releasePack?.(previous);
  }

  async function enterScene(index, token = state.generation, options = {}){
    const next = clamp(Math.floor(index), 0, SCENES.length - 1);
    const section = $('storyChapter01');
    if (section) {
      section.dataset.storyState = 'loading';
      section.setAttribute('aria-busy', 'true');
    }
    section?.focus?.({ preventScroll:true });
    state.phase = 'loading';
    const closeButton = $('storyChapter01Close');
    if (closeButton) {
      closeButton.disabled = true;
      closeButton.setAttribute('aria-disabled', 'true');
    }
    const loading = $('storyChapter01Loading');
    if (loading) loading.hidden = false;
    const nextButton = $('storyChapter01Next');
    if (nextButton) {
      nextButton.disabled = true;
      nextButton.setAttribute('aria-busy', 'true');
    }
    stopLoop();
    const loadController = nextLoadController();
    try {
      await loadScenePack(next, token, loadController?.signal);
    } finally {
      if (state.loadController === loadController) state.loadController = null;
    }
    if (token !== state.generation || !state.open) return;
    state.sceneIndex = next;
    state.sceneTime = 0;
    state.postTime = 0;
    state.completed = false;
    state.completionBlocked = false;
    state.fired = new Set();
    state.hold = { active:false, elapsed:0, committed:false, pointerId:null, alternativeArmed:false };
    if (options.completedBoundary && next === 2) {
      state.sceneTime = 700;
      state.postTime = Number(animationFor(SCENES[next])?.nominalDurationMsAfterHoldConfirmed) || 5250;
      state.completed = true;
      state.hold.committed = true;
      state.hold.elapsed = 850;
    }
    const progress = $('storyChapter01HoldProgress');
    if (progress) progress.style.width = '0%';
    $('storyChapter01HoldTrack')?.setAttribute?.('aria-valuenow', '0');
    if (!options.skipProgress) persistProgress(next, false);
    setSceneUi();
    resizeCanvas();
    render();
    if (loading) loading.hidden = true;
    if (section) {
      section.dataset.storyState = 'running';
      section.setAttribute('aria-busy', 'false');
    }
    state.phase = 'running';
    announce(`${SCENES[next].title}。${SCENES[next].text}`);
    startLoop();
    window.requestAnimationFrame?.(() => {
      const closeButton = $('storyChapter01Close');
      (closeButton && !closeButton.disabled ? closeButton : section)?.focus?.({ preventScroll:true });
    });
  }

  async function recoverFromSceneFailure(error){
    console.warn('[MoguriaStoryChapter01] scene transition failed', error);
    const notice = $('homeNotice');
    if (notice) {
      notice.textContent = '物語の続きを開けませんでした。「物語」からもう一度ためしてください。';
      notice.hidden = false;
      notice.dataset.tone = 'error';
      notice.setAttribute('role', 'alert');
    }
    await teardown({ showHome:true, restoreFocus:true });
    return { ok:false, reason:'scene-load-failed', error };
  }

  async function goNext(){
    if (!state.open || state.phase !== 'running' || !state.completed || state.transitioning) return { ok:false, reason:'not-ready' };
    state.transitioning = true;
    const transitionButton = $('storyChapter01Next');
    if (transitionButton) {
      transitionButton.disabled = true;
      transitionButton.setAttribute('aria-busy', 'true');
    }
    try {
      if (state.completionBlocked) {
        if (!persistProgress(state.sceneIndex, true)) {
          announce('記録を保存できませんでした。空き容量を確認して、もう一度ためしてください。');
          return { ok:false, reason:'save-failed' };
        }
        state.completionBlocked = false;
        setSceneUi();
      }
      if (state.sceneIndex < 2) {
        await enterScene(state.sceneIndex + 1, state.generation, { skipProgress:state.replay });
        return { ok:true };
      }
      if (state.sceneIndex === 2) {
        if (state.replay) {
          await enterScene(3, state.generation, { skipProgress:true });
          return { ok:true };
        }
        const button = $('storyChapter01Next');
        if (button) {
          button.textContent = '探索を準備中…';
        }
        const begin = window.MoguriaHome?.beginStoryInvestigation;
        if (typeof begin !== 'function') {
          setSceneUi();
          announce('探索の準備ができませんでした。もう一度ためしてください。');
          return { ok:false, reason:'investigation-unavailable' };
        }
        const result = await begin(button);
        if (result?.ok) {
          await teardown({ showHome:false, restoreFocus:false });
        } else {
          await teardown({ showHome:true, restoreFocus:false });
        }
        return result || { ok:false, reason:'investigation-failed' };
      }
      await close();
      return { ok:true };
    } catch (error) {
      return recoverFromSceneFailure(error);
    } finally {
      state.transitioning = false;
      if (state.open && state.phase === 'running') setSceneUi();
    }
  }

  async function open(options = {}){
    if (state.opening) return state.opening;
    if (state.open && state.phase === 'running') {
      const requestedNode = options.currentNodeId || options.currentNode;
      const requestedIndex = requestedNode ? sceneIndexForNode(requestedNode) : state.sceneIndex;
      if (hasOwn(options, 'replay')) state.replay = Boolean(options.replay);
      window.MoguriaUI?.show?.('storyChapter01');
      state.hiddenPaused = document.hidden === true || document.visibilityState === 'hidden';
      if (state.paused) resume();
      if (requestedIndex !== state.sceneIndex) {
        try {
          await enterScene(requestedIndex, state.generation, {
            completedBoundary:isInvestigationBoundary(requestedNode),
            skipProgress:state.replay || isInvestigationBoundary(requestedNode)
          });
          return { ok:true, reused:true, sceneIndex:state.sceneIndex, rerouted:true };
        } catch (error) {
          return recoverFromSceneFailure(error);
        }
      }
      startLoop();
      const closeButton = $('storyChapter01Close');
      (closeButton && !closeButton.disabled ? closeButton : $('storyChapter01'))?.focus?.({ preventScroll:true });
      return { ok:true, reused:true, sceneIndex:state.sceneIndex };
    }
    const token = ++state.generation;
    state.open = true;
    state.phase = 'loading';
    state.paused = false;
    state.hiddenPaused = false;
    state.replay = Boolean(options.replay);
    state.transitioning = false;
    state.trigger = options.trigger || document.activeElement || $('storyBtn') || $('startBtn');
    state.reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    const section = $('storyChapter01');
    if (!section || !$('storyChapter01Canvas')) {
      state.open = false;
      state.phase = 'idle';
      throw new Error('story player DOM is unavailable');
    }
    section.dataset.storyState = 'loading';
    section.setAttribute('aria-busy', 'true');
    $('storyChapter01Loading') && ($('storyChapter01Loading').hidden = false);
    window.MoguriaUI?.show?.('storyChapter01');
    section.focus?.({ preventScroll:true });
    bindRuntime();
    state.hiddenPaused = document.hidden === true || document.visibilityState === 'hidden';

    state.opening = (async () => {
      const assets = window.MoguriaAssets;
      if (!assets?.loadPack) throw new Error('asset manager unavailable');
      const coreController = nextLoadController();
      let core;
      try {
        core = await assets.loadPack(CORE_PACK, coreController?.signal ? { signal:coreController.signal } : {});
      } finally {
        if (state.loadController === coreController) state.loadController = null;
      }
      if (token !== state.generation) {
        if (!state.open) assets.releasePack?.(CORE_PACK);
        return { ok:false, reason:'cancelled' };
      }
      if (!core?.ok) throw new Error('story core pack failed');
      state.contract = assets.getJson?.(STORY_MANIFEST_ID);
      if (!state.contract?.storyAnimations || !state.contract?.poseAtlases) throw new Error('story animation contract is invalid');
      const currentNodeId = options.currentNodeId || options.currentNode;
      const index = Number.isFinite(options.sceneIndex)
        ? options.sceneIndex
        : sceneIndexForNode(currentNodeId);
      await enterScene(index, token, {
        completedBoundary:isInvestigationBoundary(currentNodeId),
        skipProgress:state.replay || isInvestigationBoundary(currentNodeId)
      });
      if (token !== state.generation) return { ok:false, reason:'cancelled' };
      return { ok:true, sceneIndex:state.sceneIndex };
    })().catch(error => {
      if (token === state.generation) {
        state.phase = 'error';
        section.dataset.storyState = 'error';
        const loading = $('storyChapter01Loading');
        if (loading) loading.hidden = true;
        setText('storyChapter01Eyebrow', 'MEMORY UNAVAILABLE');
        setText('storyChapter01SceneTitle', '物語を開けませんでした');
        setText('storyChapter01SceneText', '通信を確認して、ホームからもう一度ためしてください。');
        announce('物語を開けませんでした。');
        void teardown({ showHome:true, restoreFocus:true });
      }
      throw error;
    }).finally(() => {
      if (token === state.generation) state.opening = null;
    });
    return state.opening;
  }

  async function teardown(options = {}){
    if (!state.open && state.phase === 'idle') return { ok:true, reused:true };
    ++state.generation;
    state.open = false;
    state.phase = 'idle';
    state.opening = null;
    stopLoop();
    unbindRuntime();
    state.loadController?.abort?.();
    state.loadController = null;
    const assets = window.MoguriaAssets;
    if (state.currentPack) assets?.releasePack?.(state.currentPack);
    if (state.requestedPack && state.requestedPack !== state.currentPack) assets?.releasePack?.(state.requestedPack);
    assets?.releasePack?.(CORE_PACK);
    state.currentPack = '';
    state.requestedPack = '';
    state.contract = null;
    state.replay = false;
    state.transitioning = false;
    state.paused = false;
    state.hiddenPaused = false;
    state.fired.clear();
    state.hold = { active:false, elapsed:0, committed:false, pointerId:null, alternativeArmed:false };
    const section = $('storyChapter01');
    if (section) {
      section.dataset.storyState = 'idle';
      section.dataset.storyPaused = 'false';
      section.setAttribute('aria-busy', 'false');
    }
    const pauseButton = $('storyChapter01Pause');
    if (pauseButton) {
      pauseButton.setAttribute('aria-pressed', 'false');
      pauseButton.setAttribute('aria-label', '物語を一時停止');
      const pauseLabel = pauseButton.querySelector?.('small');
      if (pauseLabel) pauseLabel.textContent = '止める';
    }
    if (options.showHome !== false) window.MoguriaUI?.show?.('home');
    const focusTarget = state.trigger || $('storyBtn') || $('startBtn');
    state.trigger = null;
    if (options.restoreFocus !== false) window.requestAnimationFrame?.(() => focusTarget?.focus?.({ preventScroll:true }));
    return { ok:true };
  }

  function close(options = {}){
    if (state.open && !options.force && !canCloseScene()) return Promise.resolve({ ok:false, reason:'scene-noninterruptible' });
    return teardown({ showHome:options.showHome !== false, restoreFocus:options.restoreFocus !== false });
  }

  function pause(){
    state.paused = true;
    stopLoop();
    $('storyChapter01')?.setAttribute?.('data-story-paused', 'true');
    const button = $('storyChapter01Pause');
    if (button) {
      button.setAttribute('aria-pressed', 'true');
      button.setAttribute('aria-label', '物語を再開');
      const label = button.querySelector?.('small');
      if (label) label.textContent = '再開';
    }
    announce('物語を一時停止しました。');
    return true;
  }

  function resume(){
    if (!state.open) return false;
    state.paused = false;
    state.lastNow = now();
    $('storyChapter01')?.setAttribute?.('data-story-paused', 'false');
    const button = $('storyChapter01Pause');
    if (button) {
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', '物語を一時停止');
      const label = button.querySelector?.('small');
      if (label) label.textContent = '止める';
    }
    announce('物語を再開しました。');
    startLoop();
    return true;
  }

  function resumeAfterRun(payload = {}){
    const profileId = payload.profileId || payload.run?.profileId || payload.settlement?.run?.profileId || payload.settlement?.data?.runs?.[0]?.profileId;
    if (profileId && profileId !== STORY_PROFILE_ID) return Promise.resolve({ ok:false, reason:'not-story-run' });
    let savedStory = null;
    try { savedStory = window.MoguriaSave?.load?.()?.story || null; }
    catch (error) { /* readCurrentNode retains the post-run fallback path. */ }
    const alreadyComplete = savedStory?.currentNodeId === 'c1_complete' || savedStory?.completedChapterIds?.includes?.('c1');
    return open({
      currentNodeId:alreadyComplete ? 'c1_complete' : readCurrentNode(payload),
      replay:alreadyComplete,
      trigger:$('storyBtn') || $('startBtn')
    });
  }

  function getHealth(){
    return {
      ok:Boolean(state.open && state.phase === 'running' && state.contract && state.ctx),
      phase:state.phase,
      open:state.open,
      sceneIndex:state.sceneIndex,
      sceneId:SCENES[state.sceneIndex]?.id || null,
      sceneTimeMs:Math.round(state.sceneTime),
      postTimeMs:Math.round(state.postTime),
      completed:state.completed,
      completionBlocked:state.completionBlocked,
      replay:state.replay,
      holding:state.hold.active,
      holdCommitted:state.hold.committed,
      reducedMotion:state.reducedMotion,
      pack:state.currentPack,
      dpr:state.dpr
    };
  }

  function verificationAllowed(){
    const hostname = String(window.location?.hostname || '').toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  }

  async function seekForVerification(options = {}){
    if (!verificationAllowed() || !state.open) return { ok:false, reason:'unavailable' };
    pause();
    const index = clamp(Math.floor(Number(options.sceneIndex) || 0), 0, SCENES.length - 1);
    if (index !== state.sceneIndex) {
      await loadScenePack(index, state.generation);
      state.sceneIndex = index;
    }
    state.sceneTime = Math.max(0, Number(options.sceneTimeMs) || 0);
    state.postTime = Math.max(0, Number(options.postTimeMs) || 0);
    state.completed = Boolean(options.completed);
    state.completionBlocked = false;
    state.hold = {
      active:false,
      elapsed:options.holdCommitted ? 850 : 0,
      committed:Boolean(options.holdCommitted),
      pointerId:null,
      alternativeArmed:false
    };
    setSceneUi();
    resizeCanvas();
    render();
    return { ok:true, ...getHealth() };
  }

  function getVerification(){
    if (!verificationAllowed()) return null;
    let semanticPoses = null;
    if (state.sceneIndex === 1) {
      const [youngMogu, starGuardianCandidate] = rescuePoses(state.sceneTime);
      semanticPoses = { youngMogu, starGuardianCandidate };
    } else if (state.sceneIndex === 2) {
      const fragmentTime = state.reducedMotion && state.hold.committed
        ? reducedFragmentSnapshot(state.postTime)
        : state.postTime;
      const [currentMogu, starCompanion] = fragmentPoses(fragmentTime, state.hold.committed);
      semanticPoses = { currentMogu, starCompanion };
    }
    return { logicalViewport:{ width:LOGICAL_WIDTH, height:LOGICAL_HEIGHT }, dprCap:DPR_CAP, semanticPoses, ...getHealth() };
  }

  function onRunSettled(event){ void resumeAfterRun(event?.detail || {}); }
  window.addEventListener?.('moguria:story-run-settled', onRunSettled);

  const api = { open, close, pause, resume, resumeAfterRun, getHealth };
  if (verificationAllowed()) Object.assign(api, { seekForVerification, getVerification });
  window[API_NAME] = api;
})();
