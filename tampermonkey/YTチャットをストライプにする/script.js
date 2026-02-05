// ==UserScript==
// @name         YTチャットをストライプにする
// @namespace    ytcs
// @version      6.3.0
// @description  YouTubeライブチャットを“到着順しましま”で読みやすく（ギフト通知ytdタグ対応版）
// @match        https://www.youtube.com/live_chat*
// @match        https://www.youtube.com/live_chat_replay*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YTチャットをストライプにする/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YTチャットをストライプにする/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YTチャットをストライプにする/icon_128.png
// ==/UserScript==

(() => {
  "use strict";

  /**********************
   * Settings
   **********************/
  const DEFAULTS = {
    lightStripe: "rgba(0, 0, 0, 0.035)",
    darkStripe:  "rgba(255, 255, 255, 0.01)",
  };

  const KEY_LIGHT = "lightStripe";
  const KEY_DARK  = "darkStripe";
  const KEY_ENABLE_ROUNDED = "enableRounded";
  const DEFAULT_ENABLE_ROUNDED = false;
  const RADIUS_PX = "6px";

  // 監視対象タグリスト（大文字指定）
  const TARGET_TAGS = new Set([
    // 標準的なチャット要素
    "YT-LIVE-CHAT-TEXT-MESSAGE-RENDERER",
    "YT-LIVE-CHAT-PAID-MESSAGE-RENDERER",
    "YT-LIVE-CHAT-PAID-STICKER-RENDERER",
    "YT-LIVE-CHAT-MEMBERSHIP-ITEM-RENDERER",
    "YT-LIVE-CHAT-MODE-CHANGE-MESSAGE-RENDERER",
    "YT-LIVE-CHAT-VIEWER-ENGAGEMENT-MESSAGE-RENDERER",
    "YT-LIVE-CHAT-BANNER-RENDERER",
    "YT-LIVE-CHAT-SPONSORSHIPS-HEADER-RENDERER",

    // 従来のギフト通知（念のため残存）
    "YT-LIVE-CHAT-SPONSORSHIPS-GIFT-PURCHASE-ANNOUNCEMENT-RENDERER",
    "YT-LIVE-CHAT-SPONSORSHIPS-GIFT-REDEMPTION-ANNOUNCEMENT-RENDERER",

    // ★今回追加した新しいギフト通知形式 (ytd- start)
    "YTD-SPONSORSHIPS-LIVE-CHAT-GIFT-REDEMPTION-ANNOUNCEMENT-RENDERER", // 受け取り
    "YTD-SPONSORSHIPS-LIVE-CHAT-GIFT-PURCHASE-ANNOUNCEMENT-RENDERER"    // 購入（恐らく対になるタグ）
  ]);

  /**********************
   * Theme Logic
   **********************/
  function prefersDarkOS() {
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  }
  function isYouTubeDarkTheme() {
    const html = document.documentElement;
    if (html.hasAttribute("dark")) return true;
    const app = document.querySelector("yt-live-chat-app");
    return app && (app.hasAttribute("dark-theme") || app.hasAttribute("dark"));
  }
  function isDark() {
    return prefersDarkOS() || isYouTubeDarkTheme();
  }
  function isDarkReaderPresent() {
    if (document.documentElement.classList.contains("darkreader")) return true;
    if (document.querySelector("style.darkreader, link.darkreader")) return true;
    return false;
  }

  /**********************
   * CSS Management
   **********************/
  let styleEl = null;

  function updateCss() {
    const light = GM_getValue(KEY_LIGHT, DEFAULTS.lightStripe);
    const dark  = GM_getValue(KEY_DARK,  DEFAULTS.darkStripe);
    const color = isDark() ? dark : light;

    const rounded = GM_getValue(KEY_ENABLE_ROUNDED, DEFAULT_ENABLE_ROUNDED);
    const radius = rounded ? RADIUS_PX : "0px";

    const root = document.documentElement;
    root.style.setProperty("--ytcs-stripe-color", color);
    root.style.setProperty("--ytcs-radius", radius);

    if (isDarkReaderPresent()) {
      root.setAttribute("data-ytcs-darkreader", "1");
    } else {
      root.removeAttribute("data-ytcs-darkreader");
    }

    if (!styleEl || !styleEl.isConnected) {
      styleEl = document.createElement("style");
      styleEl.textContent = `
        :root:not([data-ytcs-darkreader]) [data-ytcs-s="1"] {
          background-color: var(--ytcs-stripe-color) !important;
          border-radius: var(--ytcs-radius) !important;
        }
        :root[data-ytcs-darkreader] [data-ytcs-s="1"] {
          background-color: transparent !important;
          box-shadow: inset 0 0 0 9999px rgba(127,127,127,0.08) !important;
          border-radius: var(--ytcs-radius) !important;
        }
      `;
      document.head.appendChild(styleEl);
    }
  }

  /**********************
   * Optimized Marking Logic
   **********************/
  let isStripeTurn = false;

  const observerCallback = (mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length === 0) continue;

      for (const node of mutation.addedNodes) {
        // nodeType === 1 (Element) かつ 対象タグリストに含まれるか
        if (node.nodeType === 1 && TARGET_TAGS.has(node.tagName)) {
          if (node.hasAttribute("data-ytcs-done")) continue;

          node.setAttribute("data-ytcs-done", "1");

          if (isStripeTurn) {
            node.setAttribute("data-ytcs-s", "1");
          }
          isStripeTurn = !isStripeTurn;
        }
      }
    }
  };

  const observer = new MutationObserver(observerCallback);

  function startObserving() {
    let items = document.querySelector("#items.yt-live-chat-item-list-renderer");

    if (items) {
      // 既存ログの一括処理
      for (const child of items.children) {
        if (child.nodeType === 1 && TARGET_TAGS.has(child.tagName)) {
             if (!child.hasAttribute("data-ytcs-done")) {
                 child.setAttribute("data-ytcs-done", "1");
                 if (isStripeTurn) child.setAttribute("data-ytcs-s", "1");
                 isStripeTurn = !isStripeTurn;
             }
        }
      }
      observer.disconnect();
      // 直下のみ監視（軽量化）
      observer.observe(items, { childList: true, subtree: false });
    } else {
      setTimeout(startObserving, 1000);
    }
  }

  /**********************
   * Menu
   **********************/
  function promptColor(label, key, fallback) {
    const current = GM_getValue(key, fallback);
    const next = prompt(`Color for ${label}\nNow: ${current}`, current);
    if (next != null) {
      GM_setValue(key, next.trim());
      updateCss();
    }
  }

  function registerMenu() {
    GM_registerMenuCommand("Stripe color (Light)…", () => promptColor("Light", KEY_LIGHT, DEFAULTS.lightStripe));
    GM_registerMenuCommand("Stripe color (Dark)…", () => promptColor("Dark", KEY_DARK, DEFAULTS.darkStripe));
    GM_registerMenuCommand("Toggle rounded corners", () => {
      GM_setValue(KEY_ENABLE_ROUNDED, !GM_getValue(KEY_ENABLE_ROUNDED, DEFAULT_ENABLE_ROUNDED));
      updateCss();
    });
  }

  /**********************
   * Init
   **********************/
  function init() {
    updateCss();
    registerMenu();
    startObserving();

    const themeObs = new MutationObserver(updateCss);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["dark", "data-theme", "class"] });
    window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener("change", updateCss);

    // 監視要素がすり替わった時用
    setInterval(() => {
        const currentItems = document.querySelector("#items.yt-live-chat-item-list-renderer");
    }, 2000);
  }

  init();
})();