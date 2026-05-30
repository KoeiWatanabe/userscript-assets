// ==UserScript==
// @name         Merriam-Websterの語釈をシンプルにする
// @namespace    http://tampermonkey.net/
// @version      1.2.1
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
  const SWITCH_SELECTOR = "button.simple-definitions-toggle-btn, button[role=\"switch\"]";
  const DICTIONARY_PREFIX = "/dictionary/";
  const SIMPLE_PREFIX = "/simple/";
  const MANUAL_OFF_KEY = "mw-simple-definition-manual-off-url";
  let lastHandledUrl = "";

  function getCurrentUrlKey() {
    return location.pathname + location.search;
  }

  function getDictionaryUrlKeyFromSimplePage() {
    if (!location.pathname.startsWith(SIMPLE_PREFIX)) {
      return null;
    }

    return (
      DICTIONARY_PREFIX +
      location.pathname.slice(SIMPLE_PREFIX.length) +
      location.search
    );
  }

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

  function getManualOffUrlKey() {
    try {
      return sessionStorage.getItem(MANUAL_OFF_KEY);
    } catch (_) {
      return null;
    }
  }

  function setManualOffUrlKey(urlKey) {
    try {
      sessionStorage.setItem(MANUAL_OFF_KEY, urlKey);
    } catch (_) {
      // sessionStorage が使えない環境では通常の自動リダイレクトだけ行う。
    }
  }

  function clearManualOffUrlKey(urlKey) {
    try {
      if (!urlKey || sessionStorage.getItem(MANUAL_OFF_KEY) === urlKey) {
        sessionStorage.removeItem(MANUAL_OFF_KEY);
      }
    } catch (_) {
      // sessionStorage が使えない環境では無視する。
    }
  }

  function isSimpleOffSwitch(btn) {
    return (
      location.pathname.startsWith(SIMPLE_PREFIX) &&
      btn.matches(SWITCH_SELECTOR) &&
      btn.getAttribute("aria-checked") === "true" &&
      btn.getAttribute("aria-label") === "Show full definitions"
    );
  }

  function isDictionaryOnSwitch(btn) {
    return (
      location.pathname.startsWith(DICTIONARY_PREFIX) &&
      btn.matches(SWITCH_SELECTOR) &&
      btn.getAttribute("aria-checked") === "false" &&
      btn.getAttribute("aria-label") === "Show simplified definitions"
    );
  }

  function rememberManualOffFromEvent(event) {
    const btn = event.target.closest?.(SWITCH_SELECTOR);
    if (!btn) return;

    if (isSimpleOffSwitch(btn)) {
      const dictionaryUrlKey = getDictionaryUrlKeyFromSimplePage();
      if (dictionaryUrlKey) setManualOffUrlKey(dictionaryUrlKey);
      return;
    }

    if (isDictionaryOnSwitch(btn)) {
      clearManualOffUrlKey();
    }
  }

  function rememberManualOffFromKeyboard(event) {
    if (!["Enter", " ", "Space", "Spacebar"].includes(event.key)) return;
    rememberManualOffFromEvent(event);
  }

  function tryRedirect() {
    if (location.href === lastHandledUrl) return;

    const simpleUrl = getSimpleUrl();
    if (!simpleUrl) {
      lastHandledUrl = location.href;
      return;
    }

    const currentUrlKey = getCurrentUrlKey();
    if (getManualOffUrlKey() === currentUrlKey) {
      lastHandledUrl = location.href;
      return;
    }

    const btn = document.querySelector(SELECTOR);
    if (!btn) return;

    if (btn.getAttribute("aria-checked") === "true") {
      clearManualOffUrlKey();
      lastHandledUrl = location.href;
      return;
    }

    clearManualOffUrlKey();
    lastHandledUrl = location.href;
    location.assign(simpleUrl);
  }

  document.addEventListener("click", rememberManualOffFromEvent, true);
  document.addEventListener("keydown", rememberManualOffFromKeyboard, true);

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
