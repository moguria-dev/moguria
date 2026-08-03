/* Moguria Keyvisual Asset-Rich Visual Refresh
   Visual-only enhancer for develop-homeui2.
   Adds UI decoration and an optional sprite overlay above the gameplay canvas.
   Does not read/write save data and does not change battle, data, or progression logic. */
(function () {
  "use strict";

  var TAU = Math.PI * 2;
  var ASSET_VERSION = "?v=20260613-asset-rich";
  var PLAY_ASSET_VERSION = "?v=20260803-play-ui-3";
  var SPRITE_BASE = "assets/images/kv-sprites/";
  var ICON_BASE = "assets/images/kv-icons/";

  var spriteNames = {
    mogu: "mogu_player.png",
    soft: "enemy_soft.png",
    bat: "enemy_bat.png",
    stone: "enemy_stone.png",
    ghost: "enemy_ghost.png",
    rare: "enemy_rare.png",
    bossMid: "boss_mid.png",
    bossFinal: "boss_final.png",
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
  var reduceMotion = false;
  var lastDecorate = 0;

  function loadImages() {
    Object.keys(spriteNames).forEach(function (key) {
      var img = new Image();
      img.src = key === "mogu"
        ? "assets/images/home-v2/mogu_home_idle.png" + PLAY_ASSET_VERSION
        : SPRITE_BASE + spriteNames[key] + ASSET_VERSION;
      sprites[key] = img;
    });

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

    ensureGameOverlay();
    decorateAll();
    observeUi();
    requestAnimationFrame(loop);
  }

  function ensureGameOverlay() {
    var game = document.getElementById("game");
    var baseCanvas = document.getElementById("gameCanvas");
    if (!game || !baseCanvas) return;
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

  function loop() {
    drawGameOverlay();
    requestAnimationFrame(loop);
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
    var t = reduceMotion ? 0 : (state.time || performance.now() / 1000);

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
      drawEnemySprite(ctx, e.x - camX, e.y - camY, e, t);
    });

    drawPlayerSprite(ctx, p.x - camX, p.y - camY, p, t);
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

  function drawEnemySprite(ctx, x, y, e, t) {
    var r = Math.max(10, e.r || 18);
    var isBoss = e.kind === "boss" || e.kind === "midBoss";
    var size = isBoss ? r * 3.35 : r * 3.0;
    var rot = reduceMotion ? 0 : Math.sin(t * (isBoss ? .55 : 1.1) + x * .02) * (isBoss ? .04 : .08);
    var img = enemySpriteFor(e);
    var alpha = e.hitFlash > 0 ? .72 : .96;
    drawSprite(ctx, img, x, y, size, rot, alpha);

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

  function drawPlayerSprite(ctx, x, y, p, t) {
    var bob = reduceMotion ? 0 : Math.sin(t * 3.0) * 1.2;

    if (p.auraRadius > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(154,238,183,.26)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, p.auraRadius, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    drawSprite(ctx, sprites.mogu, x, y + bob, 112, Math.sin(t * 1.8) * .03);
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
    decorateAll: decorateAll
  };
})();
