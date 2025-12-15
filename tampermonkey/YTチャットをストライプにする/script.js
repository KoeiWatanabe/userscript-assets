// ==UserScript==
// @name         YTチャットをストライプにする
// @namespace    ytcs
// @version      5.2.0
// @description  YouTubeライブチャットを“到着順しましま”で読みやすく（省電力：#items直下監視 + CSS変数）
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
   * Settings (eye-friendly)
   **********************/
  const DEFAULTS = {
    // ライト：ほんのりグレー（白背景でチラつかない）
    lightStripe: "rgba(0, 0, 0, 0.035)",
    // ダーク：ほんのり白（黒背景で眩しすぎない）
    darkStripe:  "rgba(255, 255, 255, 0.01)",
  };

  const KEY_LIGHT = "lightStripe";
  const KEY_DARK  = "darkStripe";

  const DEFAULT_ENABLE_ROUNDED = false;
  const KEY_ENABLE_ROUNDED = "enableRounded";
  const RADIUS_PX = "6px";

  function isRoundedEnabled() {
    return GM_getValue(KEY_ENABLE_ROUNDED, DEFAULT_ENABLE_ROUNDED);
  }

  /**********************
   * Row selector
   **********************/
  const ROW_SELECTOR = [
    "yt-live-chat-text-message-renderer",
    "yt-live-chat-paid-message-renderer",
    "yt-live-chat-paid-sticker-renderer",
    "yt-live-chat-membership-item-renderer",
    "yt-live-chat-mode-change-message-renderer",
    "yt-live-chat-viewer-engagement-message-renderer",
    "yt-live-chat-banner-renderer",
    "yt-live-chat-sponsorships-header-renderer",
  ].join(",");

  /**********************
   * Theme detection
   **********************/
  function prefersDarkOS() {
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  }
  function isYouTubeDarkTheme() {
    const html = document.documentElement;
    if (html?.hasAttribute("dark")) return true;
    const app = document.querySelector("yt-live-chat-app");
    if (app?.hasAttribute("dark-theme") || app?.hasAttribute("dark")) return true;
    return false;
  }
  function isDark() {
    return prefersDarkOS() || isYouTubeDarkTheme();
  }

  function computeStripeColor() {
    const light = GM_getValue(KEY_LIGHT, DEFAULTS.lightStripe);
    const dark  = GM_getValue(KEY_DARK,  DEFAULTS.darkStripe);
    return isDark() ? dark : light;
  }

    function isDarkReaderPresent() {
  // 多くの環境で入るクラス/要素を軽く見る（失敗しても害なし）
  if (document.documentElement.classList.contains("darkreader")) return true;
  if (document.querySelector("style.darkreader, link.darkreader")) return true;
  if (document.querySelector("meta[name='darkreader']")) return true;
  return false;
}

  /**********************
   * CSS injection
   **********************/
  let styleEl = null;

  function ensureStyle() {
  if (styleEl && styleEl.isConnected) return;

  const selectors = ROW_SELECTOR
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(sel => `${sel}[data-ytcs-striped="1"]`)
    .join(",\n");

  styleEl = document.createElement("style");
  styleEl.textContent = `
/* 通常：背景ストライプ（読みやすさ最優先） */
:root:not([data-ytcs-darkreader]) ${selectors}{
  background-color: var(--ytcs-stripe-color) !important;
  border-radius: var(--ytcs-radius, 0px) !important;
}

/* DarkReaderあり：背景を避けて“境界線ストライプ”にする（非干渉寄り） */
:root[data-ytcs-darkreader] ${selectors}{
  background-color: transparent !important; /* 背景塗りはしない */
  border-radius: var(--ytcs-radius, 0px) !important;

  /* 行の内側にうっすら線。DarkReaderが補正しても破綻しにくい */
  box-shadow: inset 0 0 0 9999px rgba(127,127,127,0.08) !important;
}
  `;
  (document.head || document.documentElement).appendChild(styleEl);
}

  function updateCssVars() {
  ensureStyle();
  document.documentElement.style.setProperty("--ytcs-stripe-color", computeStripeColor());
  document.documentElement.style.setProperty("--ytcs-radius", isRoundedEnabled() ? RADIUS_PX : "0px");
  document.documentElement.toggleAttribute("data-ytcs-darkreader", isDarkReaderPresent());
}

  /**********************
   * Stripe assignment
   **********************/
  let nextStriped = false;

  function markIfNeeded(el) {
    if (!(el instanceof Element)) return;
    if (!el.matches(ROW_SELECTOR)) return;
    if (el.dataset.ytcsDone === "1") return;

    el.dataset.ytcsDone = "1";

    if (nextStriped) el.dataset.ytcsStriped = "1";
    nextStriped = !nextStriped;
  }

  function markTree(node) {
    if (!(node instanceof Element)) return;

    markIfNeeded(node);

    const list = node.querySelectorAll?.(ROW_SELECTOR);
    if (!list || list.length === 0) return;
    for (const el of list) markIfNeeded(el);
  }

  /**********************
   * Observe only #items
   **********************/
  let itemsObserver = null;
  let observedItems = null;

  function findItemsContainer() {
    let items = document.querySelector("yt-live-chat-item-list-renderer #items");
    if (items) return items;

    const app = document.querySelector("yt-live-chat-app");
    if (app?.shadowRoot) {
      items = app.shadowRoot.querySelector?.("yt-live-chat-item-list-renderer #items");
      if (items) return items;
    }
    return null;
  }

  function attachItemsObserver(items) {
    if (!items || items === observedItems) return;

    if (itemsObserver) itemsObserver.disconnect();
    observedItems = items;

    // 初期分（1回だけ）
    items.querySelectorAll?.(ROW_SELECTOR)?.forEach(markIfNeeded);

    itemsObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const n of m.addedNodes) markTree(n);
      }
    });

    // 直下だけ監視＝省電力
    itemsObserver.observe(items, { childList: true, subtree: false });
  }

  /**********************
   * Menu
   **********************/
  function promptColor(label, key, fallback) {
    const current = GM_getValue(key, fallback);
    const next = prompt(
      `${label} を入力してください（例: rgba(255,255,255,0.06)）\n現在: ${current}`,
      current
    );
    if (next == null) return;
    GM_setValue(key, next.trim());
    updateCssVars();
  }

  function registerMenu() {
    GM_registerMenuCommand("Stripe color (Light)…", () =>
      promptColor("ライト用ストライプ色", KEY_LIGHT, DEFAULTS.lightStripe)
    );
    GM_registerMenuCommand("Stripe color (Dark)…", () =>
      promptColor("ダーク用ストライプ色", KEY_DARK, DEFAULTS.darkStripe)
    );

    GM_registerMenuCommand("Toggle rounded corners", () => {
      const cur = GM_getValue(KEY_ENABLE_ROUNDED, DEFAULT_ENABLE_ROUNDED);
      GM_setValue(KEY_ENABLE_ROUNDED, !cur);
      updateCssVars();
    });

    GM_registerMenuCommand("Reset colors to defaults", () => {
      GM_setValue(KEY_LIGHT, DEFAULTS.lightStripe);
      GM_setValue(KEY_DARK,  DEFAULTS.darkStripe);
      updateCssVars();
    });

    GM_registerMenuCommand("Clear YTCS marks (page)…", () => {
      document.querySelectorAll?.(`${ROW_SELECTOR}[data-ytcs-done="1"]`)?.forEach(el => {
        delete el.dataset.ytcsDone;
        delete el.dataset.ytcsStriped;
      });
      nextStriped = false;
    });
  }

  /**********************
   * Init
   **********************/
  function init() {
    updateCssVars();
    registerMenu();

    const tryAttach = () => {
      const items = findItemsContainer();
      if (items) attachItemsObserver(items);
    };

    tryAttach();
    // VODで #items が差し替わるケース用（document全体監視より省電力）
    setInterval(tryAttach, 1200);

    // OSテーマ変更（低頻度）→ CSS変数だけ更新
    window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", updateCssVars);

    // YouTube側の属性変化にも対応（低頻度）
    const themeWatcher = new MutationObserver(updateCssVars);
    themeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ["dark", "class"] });
  }

  init();
})();
