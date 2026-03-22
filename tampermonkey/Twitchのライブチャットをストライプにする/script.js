// ==UserScript==
// @name         Twitchのライブチャットをストライプにする
// @namespace    twcs
// @version      1.0.0
// @description  Twitchライブチャットをストライプで読みやすく
// @match        https://www.twitch.tv/*
// @run-at       document-idle
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Twitchのライブチャットをストライプにする/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Twitchのライブチャットをストライプにする/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Twitchのライブチャットをストライプにする/icon_128.png
// ==/UserScript==

(() => {
  "use strict";

  /**********************
   * Settings
   **********************/
  const LIGHT_STRIPE = "rgba(0, 0, 0, 0.05)";
  const DARK_STRIPE = "rgba(255, 255, 255, 0.1)";
  const RADIUS_PX = "6px";

  /**********************
   * Theme Logic
   **********************/
  function prefersDarkOS() {
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  }
  function isTwitchDarkTheme() {
    // Twitch sets data-a-page-loaded-name or theme class on body/html
    const html = document.documentElement;
    const body = document.body;
    // Twitch dark theme: body has class containing "dark" or theme attribute
    if (html.classList.contains("tw-root--theme-dark") || body.classList.contains("tw-root--theme-dark")) return true;
    if (html.getAttribute("data-color-mode") === "dark") return true;
    // Fallback: check computed background color
    const bg = getComputedStyle(body).backgroundColor;
    if (bg) {
      const match = bg.match(/\d+/g);
      if (match && match.length >= 3) {
        const brightness = (parseInt(match[0]) + parseInt(match[1]) + parseInt(match[2])) / 3;
        if (brightness < 128) return true;
      }
    }
    return false;
  }
  function isDark() {
    return prefersDarkOS() || isTwitchDarkTheme();
  }
  function isDarkReaderPresent() {
    if (document.documentElement.classList.contains("darkreader")) return true;
    if (document.querySelector("style.darkreader, link.darkreader")) return true;
    return false;
  }

  /**********************
   * CSS Management (GM_addStyle版)
   **********************/
  function updateCss() {
    const color = isDark() ? DARK_STRIPE : LIGHT_STRIPE;
    const root = document.documentElement;
    root.style.setProperty("--twcs-stripe-color", color);

    if (isDarkReaderPresent()) {
      root.setAttribute("data-twcs-darkreader", "1");
    } else {
      root.removeAttribute("data-twcs-darkreader");
    }
  }

  GM_addStyle(`
    :root:not([data-twcs-darkreader]) [data-twcs-s="1"] {
      background-color: var(--twcs-stripe-color) !important;
      border-radius: ${RADIUS_PX} !important;
    }
    :root[data-twcs-darkreader] [data-twcs-s="1"] {
      background-color: transparent !important;
      box-shadow: inset 0 0 0 9999px rgba(127,127,127,0.08) !important;
      border-radius: ${RADIUS_PX} !important;
    }
  `);

  /**********************
   * Optimized Marking Logic
   **********************/
  let isStripeTurn = false;
  let currentObservedItem = null;

  function isTargetMessage(node) {
    if (node.nodeType !== 1) return false;
    // Direct child wrappers that contain actual chat messages
    if (node.querySelector(".chat-line__message")) return true;
    if (node.querySelector(".chat-line__status")) return true;
    return false;
  }

  const observerCallback = (mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length === 0) continue;
      for (const node of mutation.addedNodes) {
        if (!isTargetMessage(node)) continue;
        if (node.hasAttribute("data-twcs-done")) continue;
        node.setAttribute("data-twcs-done", "1");
        if (isStripeTurn) {
          node.setAttribute("data-twcs-s", "1");
        }
        isStripeTurn = !isStripeTurn;
      }
    }
  };

  const observer = new MutationObserver(observerCallback);

  function startObserving() {
    const container = document.querySelector(".chat-scrollable-area__message-container");

    if (container && container !== currentObservedItem) {
      console.log("[TWCS] Chat container detected/changed. Attaching observer...");

      observer.disconnect();
      currentObservedItem = container;

      // 既存メッセージの一括処理
      isStripeTurn = false;
      for (const child of container.children) {
        if (!isTargetMessage(child)) continue;
        if (child.hasAttribute("data-twcs-done")) continue;
        child.setAttribute("data-twcs-done", "1");
        if (isStripeTurn) child.setAttribute("data-twcs-s", "1");
        isStripeTurn = !isStripeTurn;
      }

      observer.observe(container, { childList: true, subtree: false });
    }
  }

  /**********************
   * Init
   **********************/
  function init() {
    updateCss();
    startObserving();

    const themeObs = new MutationObserver(updateCss);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-color-mode"] });
    themeObs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener("change", updateCss);

    // Twitchはページ遷移がSPAなのでコンテナが差し替わることがある
    setInterval(() => {
      startObserving();
    }, 2000);
  }

  // Twitchはページ読み込みが遅いので少し待つ
  if (document.querySelector(".chat-scrollable-area__message-container")) {
    init();
  } else {
    const waitInterval = setInterval(() => {
      if (document.querySelector(".chat-scrollable-area__message-container")) {
        clearInterval(waitInterval);
        init();
      }
    }, 1000);
  }
})();
