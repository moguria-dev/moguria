/* Moguria Keyvisual Asset-Rich Visual Refresh
   Visual-only enhancer for develop-homeui2.
   Adds UI decoration and an optional sprite overlay above the gameplay canvas.
   Does not read/write save data and does not change battle, data, or progression logic. */
(function () {
  "use strict";

  var TAU = Math.PI * 2;
  var ASSET_VERSION = "?v=20260613-asset-rich";
  var PLAY_ASSET_VERSION = "?v=20260804-motion-artifact-1";
  var SPRITE_BASE = "assets/images/kv-sprites/";
  var BATTLE_SPRITE_BASE = "assets/images/battle-v2/";
  var ICON_BASE = "assets/images/kv-icons/";

  var battleSpriteNames = {
    mogu: "player_battle.webp",
    companion: "companion_mogu.webp",
    soft: "enemy_soft.webp",
    bat: "enemy_bat.webp",
    stone: "enemy_stone.webp",
    ghost: "enemy_ghost.webp",
    rare: "enemy_rare.webp",
    bossMid: "boss_mid.webp",
    bossFinal: "boss_final.webp"
  };

  var spriteNames = {
    dropStar: "drop_star.png",
    dropHeal: "drop_heal.png",
    bullet: "bullet_player.png",
    enemyBullet: "bullet_enemy.png",
    mine: "mine_star.png"
  };

  var iconNames = {
    fire: "skill_fire.png",
    ice: "skill_ice.png",
    poison: "skill_poison.png",
    guard: "skill_guard.png",
    star: "skill_star.png",
    summon: "skill_summon.png",
    cave: "skill_cave.png",
    artifact: "artifact_core.png"
  };

  var sprites = {};
  var icons = {};
  var overlayCanvas = null;
  var overlayCtx = null;
  var worldLayer = null;
  var reduceMotion = false;
  var lastDecorate = 0;
  var activeVisualState = null;
  var playerTrack = { x: 0, y: 0, sample: 0, vx: 0, vy: 0, facing: 1 };
  var enemyTracks = new WeakMap();
  var lastWorldTransform = "";

  function loadImages() {
    // Battle-v3 owns every combat image and loads its pack only on entry.
    // Keep this visual refresh focused on DOM UI decoration at startup.
    Object.keys(iconNames).forEach(function (key) {
      var img = new Image();
      img.src = ICON_BASE + iconNames[key] + ASSET_VERSION;
      icons[key] = img;
    });
  }

  function init() {
    loadImages();
    document.body.classList.add("kv-visual-refresh");

    var mq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotion = !!(mq && mq.matches);
    if (mq && mq.addEventListener) {
      mq.addEventListener("change", function (e) {
        reduceMotion = !!e.matches;
      });
    }

    decorateAll();
    observeUi();
  }

  function ensureGameOverlay() {
    var game = document.getElementById("game");
    var baseCanvas = document.getElementById("gameCanvas");
    if (!game || !baseCanvas) return;

    if (!worldLayer || !worldLayer.isConnected) {
      worldLayer = document.createElement("div");
      worldLayer.id = "kvBattleWorldLayer";
      worldLayer.setAttribute("aria-hidden", "true");
      game.insertBefore(worldLayer, baseCanvas);
    }

    if (overlayCanvas && overlayCanvas.isConnected) return;

    overlayCanvas = document.createElement("canvas");
    overlayCanvas.id = "kvGameVisualOverlay";
    overlayCanvas.setAttribute("aria-hidden", "true");
    game.insertBefore(overlayCanvas, baseCanvas.nextSibling);
    overlayCtx = overlayCanvas.getContext("2d");
    resizeOverlay();

    window.addEventListener("resize", resizeOverlay, { passive: true });
  }

  function resizeOverlay() {
    if (!overlayCanvas || !overlayCtx) return;
    var dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    var w = Math.max(1, window.innerWidth);
    var h = Math.max(1, window.innerHeight);
    overlayCanvas.width = Math.floor(w * dpr);
    overlayCanvas.height = Math.floor(h * dpr);
    overlayCanvas.style.width = w + "px";
    overlayCanvas.style.height = h + "px";
    overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function observeUi() {
    var obs = new MutationObserver(function () {
      var now = performance.now();
      if (now - lastDecorate < 80) return;
      lastDecorate = now;
      requestAnimationFrame(decorateAll);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function classifyText(text) {
    text = String(text || "");
    if (/火|炎|爆|メテオ|fire|burn/i.test(text)) return "fire";
    if (/氷|冷|スロー|ice|slow/i.test(text)) return "ice";
    if (/毒|poison/i.test(text)) return "poison";
    if (/守|盾|防|回避|guard|aura/i.test(text)) return "guard";
    if (/召|仲間|summon/i.test(text)) return "summon";
    if (/星|光|雷|会心|連鎖|star|light|crit|chain/i.test(text)) return "star";
    if (/アーティファクト|artifact/i.test(text)) return "artifact";
    return "cave";
  }

  function rarityText(text) {
    text = String(text || "");
    if (/伝説|legend|極|神/i.test(text)) return "legendary";
    if (/レア|rare|特別|紫/i.test(text)) return "rare";
    return "common";
  }

  function decorateAll() {
    document.querySelectorAll(".skill-card,.pause-skill,.artifact-row").forEach(function (card) {
      if (!card.dataset.kvKind) card.dataset.kvKind = classifyText(card.textContent);
      if (!card.dataset.kvRarity) card.dataset.kvRarity = rarityText(card.textContent);
      var icon = card.querySelector(".skill-icon,.ico");
      if (icon && !icon.dataset.kvKind) icon.dataset.kvKind = card.dataset.kvKind;

      if (!icon && !card.querySelector(".kv-card-icon")) {
        var mark = document.createElement("span");
        mark.className = "kv-card-icon";
        mark.dataset.kvKind = card.dataset.kvKind;
        card.insertBefore(mark, card.firstChild);
      }
    });

    document.querySelectorAll("#overlayBody .item").forEach(function (item) {
      if (item.classList.contains("kv-decorated")) return;
      item.classList.add("kv-decorated");
      var kind = classifyText(item.textContent);
      item.dataset.kvKind = kind;
      var mark = document.createElement("span");
      mark.className = "kv-item-mark";
      mark.dataset.kvKind = kind;
      var b = item.querySelector("b");
      if (b) b.insertBefore(mark, b.firstChild);
      else item.insertBefore(mark, item.firstChild);
    });
  }

  function drawGameOverlay() {
    ensureGameOverlay();
    if (!overlayCanvas || !overlayCtx) return;

    var ctx = overlayCtx;
    var w = window.innerWidth;
    var h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    var game = document.getElementById("game");
    if (!game || !game.classList.contains("active")) return;

    var state = window.MoguriaGame && window.MoguriaGame.getState && window.MoguriaGame.getState();
    if (!state || !state.p) return;

    var p = state.p;
    var camX = p.x - w / 2;
    var camY = p.y - h / 2;
    var now = performance.now() / 1000;
    var t = reduceMotion ? 0 : (Number.isFinite(state.time) ? state.time : now);
    var playerMotion = samplePlayerMotion(state, p, now);

    updateBattleWorld(state, p);

    drawCaveScreenWash(ctx, w, h, t);

    (state.drops || []).forEach(function (d) {
      drawDrop(ctx, d.x - camX, d.y - camY, d, t);
    });

    (state.mines || []).forEach(function (m) {
      drawSprite(ctx, sprites.mine, m.x - camX, m.y - camY, (m.r || 20) * 3.4, t * 0.8);
    });

    (state.enemyBullets || []).forEach(function (b) {
      drawSprite(ctx, sprites.enemyBullet, b.x - camX, b.y - camY, Math.max(34, (b.r || 6) * 6), t * 1.4);
    });

    (state.bullets || []).forEach(function (b) {
      var ang = Math.atan2(b.vy || 0, b.vx || 1);
      drawSprite(ctx, sprites.bullet, b.x - camX, b.y - camY, Math.max(36, (b.r || 6) * 7), ang);
    });

    (state.enemies || []).forEach(function (e) {
      if (!e || e.hp <= 0) return;
      drawEnemySprite(ctx, e.x - camX, e.y - camY, e, p, t, now);
    });

    drawCompanions(ctx, p.x - camX, p.y - camY, p, t, playerMotion, false);
    drawPlayerSprite(ctx, p.x - camX, p.y - camY, p, t, playerMotion);
    drawCompanions(ctx, p.x - camX, p.y - camY, p, t, playerMotion, true);
  }

  function samplePlayerMotion(state, p, now) {
    if (state !== activeVisualState) {
      activeVisualState = state;
      playerTrack = { x: p.x, y: p.y, sample: now, vx: 0, vy: 0, facing: 1 };
      enemyTracks = new WeakMap();
      lastWorldTransform = "";
    }

    var dt = Math.max(.001, Math.min(.08, now - playerTrack.sample));
    var rawVx = (p.x - playerTrack.x) / dt;
    var rawVy = (p.y - playerTrack.y) / dt;
    var blend = Math.min(1, dt * 12);
    playerTrack.vx += (rawVx - playerTrack.vx) * blend;
    playerTrack.vy += (rawVy - playerTrack.vy) * blend;
    if (Math.abs(playerTrack.vx) > 10) playerTrack.facing = playerTrack.vx < 0 ? -1 : 1;
    playerTrack.x = p.x;
    playerTrack.y = p.y;
    playerTrack.sample = now;

    var speed = Math.hypot(playerTrack.vx, playerTrack.vy);
    return {
      vx: playerTrack.vx,
      vy: playerTrack.vy,
      speed: speed,
      moving: speed > 14,
      facing: playerTrack.facing
    };
  }

  function sampleEnemyMotion(e, p, now) {
    var track = enemyTracks.get(e);
    if (!track) {
      track = {
        x: e.x,
        y: e.y,
        sample: now,
        vx: 0,
        vy: 0,
        facing: e.x > p.x ? -1 : 1
      };
      enemyTracks.set(e, track);
      return track;
    }

    var dt = Math.max(.001, Math.min(.08, now - track.sample));
    var rawVx = (e.x - track.x) / dt;
    var rawVy = (e.y - track.y) / dt;
    var blend = Math.min(1, dt * 10);
    track.vx += (rawVx - track.vx) * blend;
    track.vy += (rawVy - track.vy) * blend;
    if (Math.abs(track.vx) > 7) track.facing = track.vx < 0 ? -1 : 1;
    track.x = e.x;
    track.y = e.y;
    track.sample = now;
    return track;
  }

  function updateBattleWorld(state, p) {
    ensureGameOverlay();
    if (!worldLayer) return;

    var bounds = state.mapBounds || { minX: -760, maxX: 760, minY: -760, maxY: 760 };
    var maxX = Math.max(1, Math.max(Math.abs(bounds.minX || 0), Math.abs(bounds.maxX || 0)));
    var maxY = Math.max(1, Math.max(Math.abs(bounds.minY || 0), Math.abs(bounds.maxY || 0)));
    var motionFactor = reduceMotion ? .35 : 1;
    var x = Math.round(Math.max(-38, Math.min(38, -(p.x / maxX) * 38 * motionFactor)) * 2) / 2;
    var y = Math.round(Math.max(-44, Math.min(44, -(p.y / maxY) * 44 * motionFactor)) * 2) / 2;
    var transform = "translate3d(" + x + "px," + y + "px,0) scale(1.04)";

    if (transform === lastWorldTransform) return;
    lastWorldTransform = transform;
    worldLayer.style.transform = transform;
    var game = document.getElementById("game");
    if (game) {
      game.style.setProperty("--battle-glint-x", (x * 1.85).toFixed(1) + "px");
      game.style.setProperty("--battle-glint-y", (y * 1.85).toFixed(1) + "px");
    }
  }

  function offscreen(x, y, r) {
    return x < -r || y < -r || x > window.innerWidth + r || y > window.innerHeight + r;
  }

  function drawCaveScreenWash(ctx, w, h, t) {
    ctx.save();
    var g = ctx.createRadialGradient(w * .52, h * .38, 20, w * .52, h * .38, Math.max(w, h) * .72);
    g.addColorStop(0, "rgba(126, 217, 255, .045)");
    g.addColorStop(.42, "rgba(146, 106, 255, .035)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = .15;
    ctx.strokeStyle = "rgba(255, 223, 144, .20)";
    ctx.lineWidth = 1;
    for (var i = 0; i < 7; i++) {
      var x = (i * 97 + t * 9) % (w + 120) - 60;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.quadraticCurveTo(x + 18, h * .45, x - 12, h);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSprite(ctx, img, x, y, size, rotation, alpha) {
    if (!img || !img.complete || !img.naturalWidth) return;
    if (offscreen(x, y, size)) return;
    ctx.save();
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function drawAnimatedSprite(ctx, img, x, y, size, options) {
    options = options || {};
    if (!img || !img.complete || !img.naturalWidth) return;
    if (offscreen(x, y, size * 1.2)) return;
    ctx.save();
    ctx.translate(x, y);
    if (options.rotation) ctx.rotate(options.rotation);
    var scaleX = options.scaleX == null ? 1 : options.scaleX;
    var scaleY = options.scaleY == null ? 1 : options.scaleY;
    if (options.flip < 0) scaleX *= -1;
    ctx.scale(scaleX, scaleY);
    if (options.alpha != null) ctx.globalAlpha = options.alpha;
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function drawGroundShadow(ctx, x, y, width, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, .34);
    var g = ctx.createRadialGradient(0, 0, 1, 0, 0, width / 2);
    g.addColorStop(0, "rgba(1, 2, 12," + alpha + ")");
    g.addColorStop(1, "rgba(1, 2, 12,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, width / 2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawDrop(ctx, x, y, d, t) {
    var img = d.kind === "heal" ? sprites.dropHeal : sprites.dropStar;
    var size = d.rare ? 58 : 46;
    var bob = reduceMotion ? 0 : Math.sin(t * 4 + x * .03) * 2;
    drawSprite(ctx, img, x, y + bob, size, Math.sin(t * 1.4) * .12);
  }

  function enemySpriteFor(e) {
    var name = String(e.name || "");
    if (e.kind === "boss") return sprites.bossFinal;
    if (e.kind === "midBoss") return sprites.bossMid;
    if (e.kind === "rare") return sprites.rare;
    if (/コウモリ/.test(name)) return sprites.bat;
    if (/とげ|石|かち/.test(name)) return sprites.stone;
    if (/ゴースト/.test(name)) return sprites.ghost;
    return sprites.soft;
  }

  function drawEnemySprite(ctx, x, y, e, p, t, now) {
    var r = Math.max(10, e.r || 18);
    var isBoss = e.kind === "boss" || e.kind === "midBoss";
    var isRare = e.kind === "rare";
    var size = isBoss ? r * 3.35 : r * 3.0;
    var name = String(e.name || "");
    var type = /コウモリ/.test(name) ? "bat" : /とげ|石|かち/.test(name) ? "stone" : /ゴースト/.test(name) ? "ghost" : "soft";
    var seed = ((Number(e.id) || name.length * 17) % 29) * .43;
    var track = sampleEnemyMotion(e, p, now);
    var bob = 0;
    var scaleX = 1;
    var scaleY = 1;
    var rot = 0;
    var alpha = e.hitFlash > 0 ? .72 : (type === "ghost" ? .90 : .97);

    if (!reduceMotion) {
      if (isBoss) {
        var bossBreath = Math.sin(t * 1.75 + seed);
        bob = Math.sin(t * 1.15 + seed) * 1.7;
        scaleX = 1 + bossBreath * .018;
        scaleY = 1 - bossBreath * .014;
        rot = Math.sin(t * .68 + seed) * .025;
      } else if (isRare) {
        var rarePulse = Math.sin(t * 3.3 + seed);
        bob = rarePulse * 3.1;
        scaleX = 1 + rarePulse * .035;
        scaleY = 1 - rarePulse * .025;
        rot = Math.sin(t * 2.1 + seed) * .08;
      } else if (type === "bat") {
        var wing = Math.sin(t * 8.2 + seed);
        bob = Math.sin(t * 4.1 + seed) * 4.1;
        scaleX = 1 - wing * .035;
        scaleY = 1 + wing * .10;
        rot = Math.sin(t * 4.1 + seed) * .09;
      } else if (type === "ghost") {
        var float = Math.sin(t * 2.15 + seed);
        bob = float * 4.4;
        scaleX = 1 - float * .025;
        scaleY = 1 + float * .045;
        rot = Math.sin(t * 1.35 + seed) * .065;
      } else if (type === "stone") {
        var stomp = Math.abs(Math.sin(t * 3.1 + seed));
        bob = -stomp * 2.2;
        scaleX = 1 + (1 - stomp) * .035;
        scaleY = 1 - (1 - stomp) * .04;
        rot = Math.sin(t * 3.1 + seed) * .035;
      } else {
        var hop = Math.max(0, Math.sin(t * 4.5 + seed));
        bob = -hop * 4.2;
        scaleX = 1 + hop * .045;
        scaleY = 1 - hop * .055;
        rot = Math.sin(t * 2.25 + seed) * .045;
      }
    }

    if (e.hitFlash > 0) {
      scaleX *= 1.06;
      scaleY *= .94;
    }

    drawGroundShadow(ctx, x, y + size * .29, size * (isBoss ? .64 : .52), isBoss ? .28 : .20);
    var img = enemySpriteFor(e);
    drawAnimatedSprite(ctx, img, x, y + bob, size, {
      rotation: rot,
      scaleX: scaleX,
      scaleY: scaleY,
      flip: isBoss ? 1 : track.facing,
      alpha: alpha
    });

    if (e.maxHp > 40) {
      drawHpBar(ctx, x, y - size * .43, size * .62, Math.max(0, Math.min(1, e.hp / e.maxHp)), isBoss);
    }

    if (e.poison > 0 || e.slow > 0) {
      ctx.save();
      ctx.strokeStyle = e.slow > 0 ? "rgba(137, 226, 255, .72)" : "rgba(196, 127, 255, .72)";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(x, y, r + 12 + Math.sin(t * 5) * 2, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPlayerSprite(ctx, x, y, p, t, motion) {
    var bob = 0;
    var scaleX = 1;
    var scaleY = 1;
    var rotation = 0;

    if (!reduceMotion) {
      if (motion.moving) {
        var stride = Math.abs(Math.sin(t * 9.4));
        bob = -stride * 3.4;
        scaleX = 1 + stride * .04;
        scaleY = 1 - stride * .055;
        rotation = Math.max(-.09, Math.min(.09, motion.vx / 1600));
      } else {
        var breath = Math.sin(t * 2.45);
        bob = breath * 1.35;
        scaleX = 1 + breath * .012;
        scaleY = 1 - breath * .018;
        rotation = Math.sin(t * 1.35) * .018;
      }
    }

    if (p.auraRadius > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(154,238,183,.26)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, p.auraRadius, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    drawGroundShadow(ctx, x, y + 34, 70, .28);
    drawAnimatedSprite(ctx, sprites.mogu, x, y + bob, 96, {
      rotation: rotation,
      scaleX: scaleX,
      scaleY: scaleY,
      flip: motion.facing,
      alpha: p.invuln > 0 && !reduceMotion ? .72 + Math.sin(t * 18) * .18 : 1
    });
  }

  function drawCompanions(ctx, x, y, p, t, playerMotion, frontPass) {
    var count = Math.min(5, Math.max(0, Math.floor(Number(p.summons) || 0)));
    if (!count || !sprites.companion) return;

    for (var i = 0; i < count; i++) {
      var phase = (reduceMotion ? -.62 : t * .86) + i * TAU / count;
      var depth = Math.sin(phase);
      var isFront = depth >= 0;
      if (isFront !== frontPass) continue;

      var cx = x + Math.cos(phase) * 54;
      var cy = y + depth * 30;
      var bob = reduceMotion ? 0 : Math.sin(t * 4.6 + i * 1.7) * 1.8;
      var depthScale = .82 + (depth + 1) * .09;
      var flutter = reduceMotion ? 0 : Math.sin(t * 5.2 + i) * .055;
      var companionSize = 43 * depthScale;

      drawGroundShadow(ctx, cx, cy + 15, companionSize * .60, isFront ? .19 : .12);
      drawAnimatedSprite(ctx, sprites.companion, cx, cy + bob, companionSize, {
        rotation: flutter,
        scaleX: 1 + Math.abs(flutter) * .20,
        scaleY: 1 - Math.abs(flutter) * .12,
        flip: playerMotion.facing,
        alpha: isFront ? .98 : .82
      });
    }
  }

  function drawHpBar(ctx, x, y, w, pct, boss) {
    ctx.save();
    ctx.fillStyle = "rgba(7,6,18,.46)";
    roundRect(ctx, x - w / 2, y, w, 7, 4);
    ctx.fill();

    var g = ctx.createLinearGradient(x - w / 2, y, x + w / 2, y);
    if (boss) {
      g.addColorStop(0, "#c99bff");
      g.addColorStop(1, "#ff9bd8");
    } else {
      g.addColorStop(0, "#ffe793");
      g.addColorStop(1, "#7fe5ff");
    }
    ctx.fillStyle = g;
    roundRect(ctx, x - w / 2, y, w * pct, 7, 4);
    ctx.fill();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.MoguriaKVVisualRefresh = {
    init: init,
    decorateAll: decorateAll,
    setBattleOverlayEnabled: function (enabled) {
      // Legacy hook retained for callers; battle-v3 never re-enables it.
      if (overlayCanvas) overlayCanvas.remove();
      if (worldLayer) worldLayer.remove();
      overlayCanvas = overlayCtx = worldLayer = null;
    }
  };
})();
