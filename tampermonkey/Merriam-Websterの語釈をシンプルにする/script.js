// ==UserScript==
// @name         Merriam-Websterの語釈をシンプルにする
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Merriam-Websterで「Simple Definition」トグルがあれば自動的にONにする
// @match        https://www.merriam-webster.com/*
// @grant        none
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Merriam-Websterの語釈をシンプルにする/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Merriam-Websterの語釈をシンプルにする/script.js
// @icon         https://www.merriam-webster.com/favicon.svg
// ==/UserScript==

(function () {
  "use strict";

  const SELECTOR = "button.simple-definitions-toggle-btn";
  let lastUrl = "";
  let done = false;

  function tryToggle() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      done = false;
    }
    if (done) return;
    const btn = document.querySelector(SELECTOR);
    if (!btn) return;
    done = true;
    if (btn.getAttribute("aria-checked") !== "true") btn.click();
  }

  tryToggle();

  const observer = new MutationObserver(tryToggle);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // SPA 遷移（pushState/replaceState/popstate）を検知して再評価
  for (const method of ["pushState", "replaceState"]) {
    const orig = history[method];
    history[method] = function () {
      const result = orig.apply(this, arguments);
      tryToggle();
      return result;
    };
  }
  window.addEventListener("popstate", tryToggle);
})();
