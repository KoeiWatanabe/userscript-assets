// ==UserScript==
// @name         YTチャットをストライプにする
// @namespace    ytcs
// @version      5.0.0
// @description  YouTubeライブチャットを“到着順しましま”で読みやすく（Shadow DOM対応・軽量化）
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
    lightStripe: "rgba(0, 0, 0, 0.05)",
    darkStripe:  "rgba(255, 255, 255, 0.08)",
  };
  const KEY_LIGHT = "lightStripe";
  const KEY_DARK  = "darkStripe";

  // 重いと感じるなら false に（角丸を完全にやめる）
  const ENABLE_ROUNDED = false;
  const RADIUS_PX = "6px";

  const log = (...a) => console.log("[YTCS]", ...a);

  /**********************
   * Theme (cached)
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

  let cachedStripeColor = null;
  function computeStripeColor() {
    const light = GM_getValue(KEY_LIGHT, DEFAULTS.lightStripe);
    const dark  = GM_getValue(KEY_DARK,  DEFAULTS.darkStripe);
    return isDark() ? dark : light;
  }
  function updateStripeColorCache() {
    cachedStripeColor = computeStripeColor();
  }

  /**********************
   * “Row” selector
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

  const STRIPED_SELECTOR = `${ROW_SELECTOR}[data-ytcs-striped="1"]`;

  /**********************
   * Stripe assignment (no flicker)
   **********************/
  let nextStriped = false;

  function applyStripeStyle(el) {
    // 付与済み(縞)行だけ呼ばれる想定
    el.style.setProperty("background-color", cachedStripeColor, "important");
    if (ENABLE_ROUNDED) {
      el.style.setProperty("border-radius", RADIUS_PX, "important");
    } else {
      el.style.removeProperty("border-radius");
    }
  }

  function clearStripeStyle(el) {
    el.style.removeProperty("background-color");
    el.style.removeProperty("border-radius");
  }

  function markIfNeeded(el) {
    if (!(el instanceof Element)) return;
    if (!el.matches(ROW_SELECTOR)) return;
    if (el.dataset.ytcsDone === "1") return; // 二度触らない

    el.dataset.ytcsDone = "1";

    const striped = nextStriped;
    if (striped) el.dataset.ytcsStriped = "1";
    nextStriped = !nextStriped;

    if (striped) applyStripeStyle(el);
  }

  function markTree(node) {
    if (!(node instanceof Element)) return;

    // 自身
    markIfNeeded(node);

    // 子孫（追加ノードの範囲だけ）
    node.querySelectorAll?.(ROW_SELECTOR).forEach(markIfNeeded);
  }

  // テーマ切り替え時：縞の付いた行だけ色を更新（順序は触らない）
  function refreshStripedColorsEverywhere() {
    updateStripeColorCache();

    // document
    document.querySelectorAll?.(STRIPED_SELECTOR)?.forEach(applyStripeStyle);

    // shadow roots
    for (const root of observedRoots) {
      try {
        root.querySelectorAll?.(STRIPED_SELECTOR)?.forEach(applyStripeStyle);
      } catch {}
    }
  }

  /**********************
   * Shadow DOM aware observing (lighter)
   **********************/
  const observedRoots = new Set();     // Document / ShadowRoot
  const observedHosts = new WeakSet(); // shadowRoot持ち要素

  function observeRoot(root) {
    if (!root || observedRoots.has(root)) return;
    observedRoots.add(root);

    // 既存分を処理
    try {
      root.querySelectorAll?.(ROW_SELECTOR)?.forEach(markIfNeeded);
    } catch {}

    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          markTree(n);
          discoverShadowRootsInSubtree(n); // 追加分だけ探索
        }
      }
    });

    mo.observe(root, { childList: true, subtree: true });
  }

  // querySelectorAll("*") をやめて、追加されたサブツリーだけ TreeWalker で走査
  function discoverShadowRootsInSubtree(startNode) {
    const startEl =
      startNode instanceof Element ? startNode :
      (startNode instanceof Document ? startNode.documentElement : null);

    if (!startEl) return;

    // startEl 自身が host なら
    if (startEl.shadowRoot && !observedHosts.has(startEl)) {
      observedHosts.add(startEl);
      observeRoot(startEl.shadowRoot);
    }

    // 追加された範囲だけを走査
    const walker = document.createTreeWalker(
      startEl,
      NodeFilter.SHOW_ELEMENT,
      null
    );

    let cur = walker.currentNode;
    while (cur) {
      const el = /** @type {Element} */ (cur);
      if (el.shadowRoot && !observedHosts.has(el)) {
        observedHosts.add(el);
        observeRoot(el.shadowRoot);
      }
      cur = walker.nextNode();
    }
  }

  /**********************
   * Menu
   **********************/
  function promptColor(label, key, fallback) {
    const current = GM_getValue(key, fallback);
    const next = prompt(
      `${label} を入力してください（例: rgba(255,255,255,0.08)）\n現在: ${current}`,
      current
    );
    if (next == null) return;

    GM_setValue(key, next.trim());
    refreshStripedColorsEverywhere();
  }

  function registerMenu() {
    GM_registerMenuCommand("Stripe color (Light)…", () =>
      promptColor("ライト用ストライプ色", KEY_LIGHT, DEFAULTS.lightStripe)
    );
    GM_registerMenuCommand("Stripe color (Dark)…", () =>
      promptColor("ダーク用ストライプ色", KEY_DARK, DEFAULTS.darkStripe)
    );

    GM_registerMenuCommand("Clear YTCS styles (page)…", () => {
      // 今ページに付いた痕跡だけ消す（必要なら）
      document.querySelectorAll?.(`${ROW_SELECTOR}[data-ytcs-done="1"]`)?.forEach(el => {
        delete el.dataset.ytcsDone;
        delete el.dataset.ytcsStriped;
        clearStripeStyle(el);
      });
      nextStriped = false;
    });
  }

  /**********************
   * Init
   **********************/
  function init() {
    updateStripeColorCache();
    registerMenu();

    // document を監視
    observeRoot(document);

    // 初回だけ全体を一度スキャン（定期スキャンはしない）
    discoverShadowRootsInSubtree(document);

    // テーマ切り替えで色だけ更新
    window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", () => {
      refreshStripedColorsEverywhere();
    });

    // YouTube側の属性切り替えにも対応
    const themeWatcher = new MutationObserver(() => refreshStripedColorsEverywhere());
    themeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ["dark", "class"] });

    log("loaded:", location.href, "dark?", isDark());
  }

  init();
})();
