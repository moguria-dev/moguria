/* Moguria Keyvisual Visual Refresh
   Visual-only enhancer for develop-homeui2.
   It decorates UI DOM and draws an optional overlay canvas above the game canvas.
   It does not read/write save data and does not change battle, data, or progression logic. */
(function () {
  "use strict";

  var TAU = Math.PI * 2;
  var overlayCanvas = null;
  var overlayCtx = null;
  var reduceMotion = false;
  var lastDecorate = 0;

  function init() {
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
    if (/星|光|雷|会心|連鎖|star|light|crit|chain/i.test(text)) return "star";
    if (/召|仲間|summon/i.test(text)) return "summon";
    return "cave";
  }

  function decorateAll() {
    document.querySelectorAll(".skill-card,.pause-skill,.artifact-row").forEach(function (card) {
      if (!card.dataset.kvKind) card.dataset.kvKind = classifyText(card.textContent);
      var icon = card.querySelector(".skill-icon,.ico");
      if (icon && !icon.dataset.kvKind) icon.dataset.kvKind = card.dataset.kvKind;
    });

    document.querySelectorAll("#overlayBody .item").forEach(function (item) {
      if (item.classList.contains("kv-decorated")) return;
      item.classList.add("kv-decorated");
      var kind = classifyText(item.textContent);
      item.dataset.kvKind = kind;
      var mark = document.createElement("span");
      mark.className = "kv-item-mark";
      mark.textContent = iconForKind(kind);
      var b = item.querySelector("b");
      if (b) {
        b.insertBefore(mark, b.firstChild);
      } else {
        item.insertBefore(mark, item.firstChild);
      }
    });
  }

  function iconForKind(kind) {
    return {
      fire: "✦",
      ice: "❄",
      poison: "◆",
      guard: "◇",
      star: "✦",
      summon: "●",
      cave: "✧"
    }[kind] || "✧";
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
      drawMine(ctx, m.x - camX, m.y - camY, m, t);
    });

    (state.enemyBullets || []).forEach(function (b) {
      drawEnemyBullet(ctx, b.x - camX, b.y - camY, b, t);
    });

    (state.bullets || []).forEach(function (b) {
      drawBullet(ctx, b.x - camX, b.y - camY, b, t);
    });

    (state.enemies || []).forEach(function (e) {
      if (!e || e.hp <= 0) return;
      drawEnemy(ctx, e.x - camX, e.y - camY, e, t);
    });

    drawMogu(ctx, p.x - camX, p.y - camY, p, t);
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

    ctx.globalAlpha = .16;
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

  function glow(ctx, x, y, r, color) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  function star(ctx, cx, cy, r1, r2, points, rot) {
    ctx.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var a = rot + i * Math.PI / points;
      var r = i % 2 ? r2 : r1;
      var x = cx + Math.cos(a) * r;
      var y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function blob(ctx, cx, cy, rx, ry, phase) {
    ctx.beginPath();
    for (var i = 0; i < 18; i++) {
      var a = i * TAU / 18;
      var wob = 1 + Math.sin(a * 3 + phase) * .045 + Math.cos(a * 5 + phase * .7) * .030;
      var x = cx + Math.cos(a) * rx * wob;
      var y = cy + Math.sin(a) * ry * wob;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawDrop(ctx, x, y, d, t) {
    if (offscreen(x, y, 80)) return;
    var pulse = reduceMotion ? 0 : Math.sin(t * 6 + x * .03) * 1.2;
    ctx.save();
    ctx.translate(x, y);
    glow(ctx, 0, 0, d.kind === "heal" ? 34 : 38, d.kind === "heal" ? "rgba(145,240,170,.22)" : "rgba(255,222,125,.28)");
    ctx.rotate(Math.sin(t * 2.4 + y * .02) * .12);

    if (d.kind === "heal") {
      ctx.fillStyle = "rgba(154, 244, 177, .92)";
      ctx.shadowColor = "rgba(154,244,177,.70)";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(-5, -4, 6, 0, TAU);
      ctx.arc(5, -4, 6, 0, TAU);
      ctx.lineTo(0, 11 + pulse);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.86)";
      roundRect(ctx, -2, -8, 4, 14, 2, true);
      roundRect(ctx, -7, -3, 14, 4, 2, true);
    } else {
      ctx.shadowColor = "rgba(255,225,130,.78)";
      ctx.shadowBlur = d.rare ? 22 : 14;
      ctx.fillStyle = d.rare ? "rgba(255,218,112,.96)" : "rgba(255,238,162,.94)";
      star(ctx, 0, 0, d.rare ? 12 : 9, d.rare ? 5 : 4, 5, -Math.PI / 2 + pulse * .02);
      ctx.fill();
      ctx.strokeStyle = "rgba(137, 219, 255, .46)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, d.rare ? 16 : 13, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMine(ctx, x, y, m, t) {
    if (offscreen(x, y, 90)) return;
    ctx.save();
    ctx.translate(x, y);
    glow(ctx, 0, 0, 50, "rgba(255,172,84,.25)");
    ctx.rotate(t * .8);
    ctx.fillStyle = "rgba(255,193,100,.92)";
    star(ctx, 0, 0, m.r * .96, m.r * .46, 6, -Math.PI / 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,242,184,.52)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, m.r + 3 + Math.sin(t * 5) * 1.5, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawBullet(ctx, x, y, b, t) {
    if (offscreen(x, y, 80)) return;
    ctx.save();
    ctx.translate(x, y);
    var ang = Math.atan2(b.vy || 0, b.vx || 1);
    ctx.rotate(ang);
    glow(ctx, 0, 0, 34, b.pierce > 0 ? "rgba(139,226,255,.22)" : "rgba(255,222,130,.25)");
    ctx.shadowColor = b.pierce > 0 ? "rgba(139,226,255,.72)" : "rgba(255,221,133,.72)";
    ctx.shadowBlur = 14;
    var grad = ctx.createLinearGradient(-18, 0, 20, 0);
    grad.addColorStop(0, "rgba(255,255,255,.20)");
    grad.addColorStop(.52, "rgba(255,241,166,.95)");
    grad.addColorStop(1, b.split ? "rgba(188,158,255,.95)" : "rgba(255,191,104,.95)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, (b.r || 5) + 10, (b.r || 5) + 3, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemyBullet(ctx, x, y, b, t) {
    if (offscreen(x, y, 80)) return;
    ctx.save();
    ctx.translate(x, y);
    glow(ctx, 0, 0, 36, "rgba(180,120,255,.22)");
    ctx.rotate(t * 1.6);
    ctx.fillStyle = "rgba(180, 145, 225, .88)";
    star(ctx, 0, 0, (b.r || 5) + 7, (b.r || 5) + 2, 4, Math.PI / 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,246,220,.45)";
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
  }

  function drawEnemy(ctx, x, y, e, t) {
    var r = Math.max(8, e.r || 18);
    if (offscreen(x, y, r + 110)) return;

    var isBoss = e.kind === "boss" || e.kind === "midBoss";
    var isRare = e.kind === "rare";
    var phase = e.phase2 ? 1 : 0;
    var flash = e.hitFlash > 0;
    var name = String(e.name || "");

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = flash ? .98 : .92;

    if (isBoss) {
      drawBoss(ctx, r, t, phase, e.kind === "boss");
    } else if (isRare) {
      drawRareEnemy(ctx, r, t);
    } else if (/コウモリ/.test(name)) {
      drawBatEnemy(ctx, r, t, e.color);
    } else if (/とげ|石|かち/.test(name)) {
      drawStoneEnemy(ctx, r, t, e.color);
    } else if (/ゴースト/.test(name)) {
      drawGhostEnemy(ctx, r, t, e.color);
    } else {
      drawSoftEnemy(ctx, r, t, e.color);
    }

    if (e.poison > 0 || e.slow > 0) {
      ctx.strokeStyle = e.slow > 0 ? "rgba(137, 226, 255, .72)" : "rgba(196, 127, 255, .72)";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 10 + Math.sin(t * 5) * 2, 0, TAU);
      ctx.stroke();
    }

    ctx.restore();

    if (e.maxHp > 40) {
      var hp = Math.max(0, Math.min(1, e.hp / e.maxHp));
      ctx.save();
      roundRect(ctx, x - r, y - r - 18, r * 2, 6, 4, false);
      ctx.fillStyle = "rgba(7,6,18,.46)";
      ctx.fill();
      var hg = ctx.createLinearGradient(x - r, y, x + r, y);
      hg.addColorStop(0, isBoss ? "#c99bff" : "#ffe793");
      hg.addColorStop(1, isBoss ? "#ff9bd8" : "#7fe5ff");
      ctx.fillStyle = hg;
      roundRect(ctx, x - r, y - r - 18, r * 2 * hp, 6, 4, true);
      ctx.restore();
    }
  }

  function drawBoss(ctx, r, t, phase, isFinal) {
    glow(ctx, 0, 0, r * 3.0, phase ? "rgba(210,118,255,.25)" : "rgba(124,93,255,.20)");
    ctx.shadowColor = phase ? "rgba(233,135,255,.64)" : "rgba(153,120,255,.58)";
    ctx.shadowBlur = 28;

    var petals = isFinal ? 14 : 10;
    for (var i = 0; i < petals; i++) {
      var a = i * TAU / petals + Math.sin(t * .65) * .08;
      var grad = ctx.createLinearGradient(Math.cos(a) * -r, Math.sin(a) * -r, Math.cos(a) * r, Math.sin(a) * r);
      grad.addColorStop(0, phase ? "rgba(255,168,220,.86)" : "rgba(149,112,173,.82)");
      grad.addColorStop(1, phase ? "rgba(125,72,178,.86)" : "rgba(81,57,116,.88)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * r * .76, Math.sin(a) * r * .76, r * .54, r * .20, a, 0, TAU);
      ctx.fill();
    }

    var body = ctx.createRadialGradient(-r * .22, -r * .30, r * .10, 0, 0, r * 1.15);
    body.addColorStop(0, phase ? "#ffb4ef" : "#c6aeff");
    body.addColorStop(.34, phase ? "#8051a4" : "#6d538a");
    body.addColorStop(1, phase ? "#2c1a44" : "#241a38");
    ctx.fillStyle = body;
    blob(ctx, 0, 0, r * .96, r * .82, t * 1.2);
    ctx.fill();

    ctx.strokeStyle = phase ? "rgba(255,218,255,.70)" : "rgba(255,241,190,.52)";
    ctx.lineWidth = 2.4;
    ctx.stroke();

    ctx.fillStyle = phase ? "#ffe2ff" : "#fff1c5";
    ctx.beginPath();
    ctx.arc(-r * .25, -r * .10, phase ? 5.6 : 4.2, 0, TAU);
    ctx.arc(r * .18, -r * .18, phase ? 5.2 : 3.8, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "rgba(44,25,55,.92)";
    ctx.beginPath();
    ctx.arc(-r * .25, -r * .10, 1.7, 0, TAU);
    ctx.arc(r * .18, -r * .18, 1.7, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,238,190,.70)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, r * .18, r * .25, .05, Math.PI - .05);
    ctx.stroke();

    ctx.fillStyle = "#fff1a4";
    star(ctx, 0, -r * 1.18, r * .28, r * .12, 5, -Math.PI / 2 + t * .25);
    ctx.fill();

    ctx.font = "900 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,244,210,.92)";
    ctx.shadowBlur = 12;
    ctx.fillText(isFinal ? "BOSS" : "MID", 0, -r - 17);
  }

  function drawRareEnemy(ctx, r, t) {
    glow(ctx, 0, 0, r * 2.6, "rgba(255,226,124,.30)");
    ctx.shadowColor = "rgba(255,215,100,.70)";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "rgba(255,218,111,.95)";
    star(ctx, 0, 0, r * 1.22, r * .56, 5, -Math.PI / 2 + t * .55);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.72)";
    ctx.lineWidth = 2;
    ctx.stroke();
    drawEyes(ctx, r * .10);
  }

  function drawBatEnemy(ctx, r, t, color) {
    glow(ctx, 0, 0, r * 2.3, "rgba(132,107,255,.15)");
    ctx.fillStyle = color || "rgba(124, 104, 171, .94)";
    ctx.shadowColor = "rgba(50,38,92,.45)";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.ellipse(-r * .74, 0, r * .78, r * .38, -.28, 0, TAU);
    ctx.ellipse(r * .74, 0, r * .78, r * .38, .28, 0, TAU);
    ctx.fill();
    blob(ctx, 0, 0, r * .74, r * .66, t * 1.4);
    ctx.fill();
    drawHighlight(ctx, r);
    drawEyes(ctx);
  }

  function drawStoneEnemy(ctx, r, t, color) {
    glow(ctx, 0, 0, r * 2.0, "rgba(112,220,255,.12)");
    ctx.fillStyle = color || "rgba(116, 148, 162, .95)";
    ctx.shadowColor = "rgba(127,220,255,.32)";
    ctx.shadowBlur = 12;
    star(ctx, 0, 0, r * 1.16, r * .82, 7, t * .2);
    ctx.fill();
    ctx.strokeStyle = "rgba(245,255,255,.28)";
    ctx.lineWidth = 2;
    ctx.stroke();
    drawEyes(ctx);
  }

  function drawGhostEnemy(ctx, r, t, color) {
    glow(ctx, 0, 0, r * 2.4, "rgba(190,155,255,.18)");
    ctx.globalAlpha *= .88;
    ctx.fillStyle = color || "rgba(187, 165, 230, .90)";
    ctx.shadowColor = "rgba(185,145,255,.45)";
    ctx.shadowBlur = 16;
    blob(ctx, 0, 0, r * .92, r * 1.16, t);
    ctx.fill();
    drawHighlight(ctx, r);
    drawEyes(ctx);
  }

  function drawSoftEnemy(ctx, r, t, color) {
    glow(ctx, 0, 0, r * 2.0, "rgba(255,222,130,.12)");
    var body = ctx.createRadialGradient(-r * .25, -r * .28, r * .14, 0, 0, r * 1.08);
    body.addColorStop(0, "rgba(255,255,255,.62)");
    body.addColorStop(.28, color || "rgba(226, 151, 130, .95)");
    body.addColorStop(1, "rgba(78, 52, 88, .82)");
    ctx.fillStyle = body;
    ctx.shadowColor = "rgba(40,28,64,.34)";
    ctx.shadowBlur = 13;
    blob(ctx, 0, 0, r * 1.08, r * .90, t);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,240,208,.22)";
    ctx.lineWidth = 2;
    ctx.stroke();
    drawHighlight(ctx, r);
    drawEyes(ctx);
  }

  function drawHighlight(ctx, r) {
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.beginPath();
    ctx.arc(-r * .32, -r * .32, Math.max(3, r * .16), 0, TAU);
    ctx.fill();
  }

  function drawEyes(ctx, shift) {
    shift = shift || 0;
    ctx.fillStyle = "rgba(38,28,48,.88)";
    ctx.beginPath();
    ctx.arc(-4 - shift, 0, 1.9, 0, TAU);
    ctx.arc(5 + shift, 0, 1.9, 0, TAU);
    ctx.fill();
  }

  function drawMogu(ctx, x, y, p, t) {
    if (offscreen(x, y, 90)) return;

    var bob = reduceMotion ? 0 : Math.sin(t * 3.0) * 1.2;
    ctx.save();
    ctx.translate(x, y + bob);

    if (p.auraRadius > 0) {
      ctx.strokeStyle = "rgba(154,238,183,.26)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, p.auraRadius, 0, TAU);
      ctx.stroke();
    }

    glow(ctx, 0, 0, 60, "rgba(255,226,124,.22)");
    ctx.shadowColor = "rgba(255,226,124,.38)";
    ctx.shadowBlur = 18;

    ctx.fillStyle = "rgba(255,229,215,.96)";
    ctx.beginPath();
    ctx.arc(-14, -18, 9, 0, TAU);
    ctx.arc(14, -18, 9, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "rgba(255,249,238,.96)";
    ctx.beginPath();
    ctx.arc(-14, -18, 4.5, 0, TAU);
    ctx.arc(14, -18, 4.5, 0, TAU);
    ctx.fill();

    var body = ctx.createRadialGradient(-8, -10, 4, 0, 2, 30);
    body.addColorStop(0, "#ffffff");
    body.addColorStop(.50, "#fff8eb");
    body.addColorStop(1, "#efd6c5");
    ctx.fillStyle = body;
    blob(ctx, 0, 0, 25, 21, t * 1.4);
    ctx.fill();

    ctx.strokeStyle = "rgba(139,99,113,.20)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 25, 21, 0, 0, TAU);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,211,197,.52)";
    ctx.beginPath();
    ctx.arc(-12, 4, 5.2, 0, TAU);
    ctx.arc(12, 4, 5.2, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#3f2f41";
    ctx.beginPath();
    ctx.arc(-7, -3, 2.5, 0, TAU);
    ctx.arc(7, -3, 2.5, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "#3f2f41";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 3, 3.6, 0, Math.PI);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,236,139,.98)";
    star(ctx, 16, -12, 5.8, 2.6, 5, -Math.PI / 2 + t * .4);
    ctx.fill();

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r, fill) {
    var rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
    if (fill) ctx.fill();
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
