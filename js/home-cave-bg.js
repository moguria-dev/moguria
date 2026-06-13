/* Moguria Home Cave Background Loader
   Visual-only DOM layer for the home screen. */
(function () {
  "use strict";

  function particleHTML() {
    var particles = [
      ["9%", "66%", ".9", "0s", "11px"],
      ["17%", "46%", ".7", "1.2s", "-8px"],
      ["27%", "71%", "1", "2.4s", "14px"],
      ["38%", "36%", ".66", ".7s", "-10px"],
      ["49%", "61%", ".9", "1.8s", "12px"],
      ["58%", "42%", ".64", "2.9s", "-12px"],
      ["68%", "68%", "1.05", ".4s", "10px"],
      ["76%", "37%", ".72", "3.3s", "-9px"],
      ["85%", "58%", ".86", "1.5s", "13px"],
      ["93%", "44%", ".58", "2.1s", "-10px"],
      ["44%", "78%", ".62", "4.2s", "8px"],
      ["63%", "23%", ".56", "5s", "-7px"]
    ];

    return particles.map(function (p) {
      return '<i style="--x:' + p[0] + '; --y:' + p[1] + '; --s:' + p[2] + '; --d:' + p[3] + '; --dx:' + p[4] + ';"></i>';
    }).join("");
  }

  function crystalHTML() {
    var crystals = [
      ["8%", "64%", ".72", "-12deg", "0s"],
      ["18%", "39%", ".42", "8deg", "2.2s"],
      ["72%", "30%", ".48", "-16deg", "1.4s"],
      ["86%", "60%", ".66", "12deg", "3.1s"],
      ["60%", "67%", ".38", "-8deg", "4s"]
    ];

    return crystals.map(function (c) {
      return '<i style="--x:' + c[0] + '; --y:' + c[1] + '; --s:' + c[2] + '; --r:' + c[3] + '; --d:' + c[4] + ';"></i>';
    }).join("");
  }

  function createScene() {
    var bg = document.querySelector("#home .home-bg.kv-world");
    if (!bg) return;
    if (bg.querySelector(".home-cave-scene")) return;

    var scene = document.createElement("div");
    scene.className = "home-cave-scene";
    scene.setAttribute("aria-hidden", "true");
    scene.innerHTML = [
      '<div class="home-cave-keyvisual-wash"></div>',
      '<div class="home-cave-ambient"></div>',
      '<div class="home-cave-depth"></div>',
      '<div class="home-cave-moonbeam"></div>',
      '<div class="home-cave-lamp home-cave-lamp-left"></div>',
      '<div class="home-cave-lamp home-cave-lamp-right"></div>',
      '<div class="home-cave-crystals">' + crystalHTML() + '</div>',
      '<div class="home-cave-particles">' + particleHTML() + '</div>',
      '<div class="home-cave-vignette"></div>'
    ].join("");

    bg.insertBefore(scene, bg.firstChild);
  }

  function init() {
    createScene();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.MoguriaHomeCaveBg = { init: init };
})();
