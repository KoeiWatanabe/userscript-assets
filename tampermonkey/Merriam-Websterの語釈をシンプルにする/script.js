// ==UserScript==
// @name         Merriam-Websterの語釈をシンプルにする
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  Merriam-WebsterでSimple Definitionがあれば対応する/simple/ページへ移動する
// @match        https://www.merriam-webster.com/*
// @grant        none
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Merriam-Websterの語釈をシンプルにする/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Merriam-Websterの語釈をシンプルにする/script.js
// @icon         https://www.merriam-webster.com/favicon.svg
// ==/UserScript==

(function () {
  "use strict";

  const SELECTOR = 'button[role="switch"][aria-label="Show simplified definitions"]';
  const DICTIONARY_PREFIX = "/dictionary/";
  const SIMPLE_PREFIX = "/simple/";
  let lastHandledUrl = "";

  function getSimpleUrl() {
    if (!location.pathname.startsWith(DICTIONARY_PREFIX)) {
      return null;
    }

    return (
      SIMPLE_PREFIX +
      location.pathname.slice(DICTIONARY_PREFIX.length) +
      location.search +
      location.hash
    );
  }

  function tryRedirect() {
    if (location.href === lastHandledUrl) return;

    const simpleUrl = getSimpleUrl();
    if (!simpleUrl) {
      lastHandledUrl = location.href;
      return;
    }

    const btn = document.querySelector(SELECTOR);
    if (!btn) return;

    if (btn.getAttribute("aria-checked") === "true") {
      lastHandledUrl = location.href;
      return;
    }

    lastHandledUrl = location.href;
    location.assign(simpleUrl);
  }

  tryRedirect();

  const observer = new MutationObserver(tryRedirect);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // SPA 遷移（pushState/replaceState/popstate）を検知して再評価
  for (const method of ["pushState", "replaceState"]) {
    const orig = history[method];
    history[method] = function () {
      const result = orig.apply(this, arguments);
      tryRedirect();
      return result;
    };
  }
  window.addEventListener("popstate", tryRedirect);
})();
