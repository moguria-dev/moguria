/* Moguria home v2 visual bridge.
   It mirrors display text only and never replaces interactive DOM nodes. */
(function () {
  "use strict";

  function syncCoinValue() {
    var source = document.getElementById("coinText");
    var visible = document.getElementById("coinValue");
    var pill = document.getElementById("coinCurrency");
    if (!source || !visible) return;

    var match = String(source.textContent || "").match(/[\d,]+/g);
    var value = match && match.length ? match[match.length - 1] : "0";
    var numeric = Number(String(value).replace(/,/g, ""));
    var formatted = Number.isFinite(numeric) ? numeric.toLocaleString("ja-JP") : value;

    visible.textContent = formatted;
    if (pill) pill.setAttribute("aria-label", "MoguCoin " + formatted);
  }

  function init() {
    document.body.classList.add("moguria-final-home-ui");
    syncCoinValue();

    var source = document.getElementById("coinText");
    if (source && "MutationObserver" in window) {
      new MutationObserver(syncCoinValue).observe(source, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.MoguriaFinalUI = {
    init: init,
    syncCoinValue: syncCoinValue
  };
})();
