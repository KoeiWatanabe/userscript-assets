// ==UserScript==
// @name         YouTubeのライブチャットをストライプにする
// @namespace    ytcs
// @version      6.3.3
// @description  YouTubeライブチャットを“到着順しましま”で読みやすく
// @match        https://www.youtube.com/live_chat*
// @match        https://www.youtube.com/live_chat_replay*
// @run-at       document-idle
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YTチャットをストライプにする/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YTチャットをストライプにする/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YTチャットをストライプにする/icon_128.png
// ==/UserScript==

(() => {
  "use strict";

  /**********************
   * Settings
   **********************/
  const LIGHT_STRIPE = "rgba(0, 0, 0, 0.05)";
  const DARK_STRIPE  = "rgba(255, 255, 255, 0.1)";
  const RADIUS_PX    = "6px";

  const TARGET_TAGS = new Set([
    "YT-LIVE-CHAT-TEXT-MESSAGE-RENDERER",
    "YT-LIVE-CHAT-PAID-MESSAGE-RENDERER",
    "YT-LIVE-CHAT-PAID-STICKER-RENDERER",
    "YT-LIVE-CHAT-MEMBERSHIP-ITEM-RENDERER",
    "YT-LIVE-CHAT-MODE-CHANGE-MESSAGE-RENDERER",
    "YT-LIVE-CHAT-VIEWER-ENGAGEMENT-MESSAGE-RENDERER",
    "YT-LIVE-CHAT-BANNER-RENDERER",
    "YT-LIVE-CHAT-SPONSORSHIPS-HEADER-RENDERER",
    "YT-LIVE-CHAT-SPONSORSHIPS-GIFT-PURCHASE-ANNOUNCEMENT-RENDERER",
    "YT-LIVE-CHAT-SPONSORSHIPS-GIFT-REDEMPTION-ANNOUNCEMENT-RENDERER",
    "YTD-SPONSORSHIPS-LIVE-CHAT-GIFT-REDEMPTION-ANNOUNCEMENT-RENDERER",
    "YTD-SPONSORSHIPS-LIVE-CHAT-GIFT-PURCHASE-ANNOUNCEMENT-RENDERER"
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
   * CSS Management (GM_addStyle版)
   **********************/
  // スタイル要素を自作せず、変数CSSの定義だけを行う
  function updateCss() {
    const color = isDark() ? DARK_STRIPE : LIGHT_STRIPE;

    const root = document.documentElement;
    root.style.setProperty("--ytcs-stripe-color", color);

    if (isDarkReaderPresent()) {
      root.setAttribute("data-ytcs-darkreader", "1");
    } else {
      root.removeAttribute("data-ytcs-darkreader");
    }
  }

  // 初回に一度だけスタイルを登録（GM_addStyleは強力なので消えにくい）
  GM_addStyle(`
    :root:not([data-ytcs-darkreader]) [data-ytcs-s="1"] {
      background-color: var(--ytcs-stripe-color) !important;
      border-radius: ${RADIUS_PX} !important;
    }
    :root[data-ytcs-darkreader] [data-ytcs-s="1"] {
      background-color: transparent !important;
      box-shadow: inset 0 0 0 9999px rgba(127,127,127,0.08) !important;
      border-radius: ${RADIUS_PX} !important;
    }
  `);

  /**********************
   * Optimized Marking Logic
   **********************/
  let isStripeTurn = false;
  let currentObservedItem = null; // ★現在監視している要素を記憶する変数

  const observerCallback = (mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length === 0) continue;
      for (const node of mutation.addedNodes) {
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

  // ★監視を開始・再開する関数（ロジックを修正）
  function startObserving() {
    const newItems = document.querySelector("#items.yt-live-chat-item-list-renderer");

    // 要素が存在し、かつ「前回監視していたものと違う」場合に付け替える
    if (newItems && newItems !== currentObservedItem) {
      console.log("[YTCS] Chat container detected/changed. Attaching observer...");

      // 古い監視を解除
      observer.disconnect();

      // 新しい要素を記憶
      currentObservedItem = newItems;

      // 既存ログの一括処理（チャット欄切り替え直後にあるログを処理）
      isStripeTurn = false; // ★切り替え時に縞々順序をリセット（お好みで削除可）
      for (const child of newItems.children) {
        if (child.nodeType === 1 && TARGET_TAGS.has(child.tagName)) {
             if (!child.hasAttribute("data-ytcs-done")) {
                 child.setAttribute("data-ytcs-done", "1");
                 if (isStripeTurn) child.setAttribute("data-ytcs-s", "1");
                 isStripeTurn = !isStripeTurn;
             }
        }
      }

      // 新しい要素を監視開始
      observer.observe(newItems, { childList: true, subtree: false });
    }
  }

  /**********************
   * Init
   **********************/
  function init() {
    updateCss();

    // 初回実行
    startObserving();

    const themeObs = new MutationObserver(updateCss);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["dark", "data-theme", "class"] });
    window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener("change", updateCss);

    // ★監視要素がすり替わった時用（ここが重要）
    setInterval(() => {
        // 定期的に関数を呼び出し、要素が変わっているかチェックさせる
        startObserving();
    }, 2000);
  }

  init();
})();