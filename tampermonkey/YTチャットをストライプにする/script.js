// ==UserScript==
// @name         ライブチャットをストライプにする＋
// @namespace    lcs
// @version      7.0.0
// @description  YouTube・Twitchのライブチャットをストライプで読みやすく
// @match        https://www.youtube.com/live_chat*
// @match        https://www.youtube.com/live_chat_replay*
// @match        https://www.twitch.tv/*
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
  const PFX          = "lcs"; // CSS変数・data属性のプレフィックス

  /**********************
   * Platform Configs
   **********************/
  const YT_TARGET_TAGS = new Set([
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

  const PLATFORMS = {
    youtube: {
      isDarkTheme() {
        const html = document.documentElement;
        if (html.hasAttribute("dark")) return true;
        const app = document.querySelector("yt-live-chat-app");
        return !!(app && (app.hasAttribute("dark-theme") || app.hasAttribute("dark")));
      },
      isTarget(node) {
        return node.nodeType === 1 && YT_TARGET_TAGS.has(node.tagName);
      },
      findContainer() {
        return document.querySelector("#items.yt-live-chat-item-list-renderer");
      },
      setupThemeObserver(cb) {
        const obs = new MutationObserver(cb);
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ["dark", "data-theme", "class"] });
      },
      onReady(cb) { cb(); }
    },

    twitch: {
      isDarkTheme() {
        const html = document.documentElement;
        const body = document.body;
        if (html.classList.contains("tw-root--theme-dark") || body.classList.contains("tw-root--theme-dark")) return true;
        if (html.getAttribute("data-color-mode") === "dark") return true;
        const bg = getComputedStyle(body).backgroundColor;
        if (bg) {
          const m = bg.match(/\d+/g);
          if (m && m.length >= 3) {
            const brightness = (parseInt(m[0]) + parseInt(m[1]) + parseInt(m[2])) / 3;
            if (brightness < 128) return true;
          }
        }
        return false;
      },
      isTarget(node) {
        if (node.nodeType !== 1) return false;
        return !!(node.querySelector(".chat-line__message") ||
                  node.querySelector(".chat-line__status") ||
                  node.querySelector(".vod-message"));
      },
      findContainer() {
        return document.querySelector(".chat-scrollable-area__message-container") ||
               document.querySelector(".video-chat__message-list-wrapper ul");
      },
      setupThemeObserver(cb) {
        const obs = new MutationObserver(cb);
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-color-mode"] });
        obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
      },
      onReady(cb) {
        if (this.findContainer()) {
          cb();
        } else {
          const waitInterval = setInterval(() => {
            if (this.findContainer()) {
              clearInterval(waitInterval);
              cb();
            }
          }, 1000);
        }
      }
    }
  };

  const host = location.hostname;
  const platform = host.includes("youtube.com") ? PLATFORMS.youtube
                 : host.includes("twitch.tv")   ? PLATFORMS.twitch
                 : null;

  if (!platform) return;

  /**********************
   * Theme Logic
   **********************/
  function prefersDarkOS() {
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  }
  function isDark() {
    return prefersDarkOS() || platform.isDarkTheme();
  }
  function isDarkReaderPresent() {
    if (document.documentElement.classList.contains("darkreader")) return true;
    if (document.querySelector("style.darkreader, link.darkreader")) return true;
    return false;
  }

  /**********************
   * CSS Management
   **********************/
  function updateCss() {
    const root = document.documentElement;
    root.style.setProperty(`--${PFX}-stripe-color`, isDark() ? DARK_STRIPE : LIGHT_STRIPE);
    if (isDarkReaderPresent()) {
      root.setAttribute(`data-${PFX}-darkreader`, "1");
    } else {
      root.removeAttribute(`data-${PFX}-darkreader`);
    }
  }

  GM_addStyle(`
    :root:not([data-${PFX}-darkreader]) [data-${PFX}-s="1"] {
      background-color: var(--${PFX}-stripe-color) !important;
      border-radius: ${RADIUS_PX} !important;
    }
    :root[data-${PFX}-darkreader] [data-${PFX}-s="1"] {
      background-color: transparent !important;
      box-shadow: inset 0 0 0 9999px rgba(127,127,127,0.08) !important;
      border-radius: ${RADIUS_PX} !important;
    }
  `);

  /**********************
   * Stripe Logic
   **********************/
  let isStripeTurn = false;
  let currentObservedItem = null;

  const DONE_ATTR   = `data-${PFX}-done`;
  const STRIPE_ATTR = `data-${PFX}-s`;

  function markNode(node) {
    if (!platform.isTarget(node)) return;
    if (node.hasAttribute(DONE_ATTR)) return;
    node.setAttribute(DONE_ATTR, "1");
    if (isStripeTurn) node.setAttribute(STRIPE_ATTR, "1");
    isStripeTurn = !isStripeTurn;
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length === 0) continue;
      for (const node of mutation.addedNodes) markNode(node);
    }
  });

  function startObserving() {
    const container = platform.findContainer();
    if (!container || container === currentObservedItem) return;

    console.log("[LCS] Chat container detected/changed. Attaching observer...");
    observer.disconnect();
    currentObservedItem = container;

    isStripeTurn = false;
    for (const child of container.children) markNode(child);

    observer.observe(container, { childList: true, subtree: false });
  }

  /**********************
   * Init
   **********************/
  function init() {
    updateCss();
    startObserving();

    platform.setupThemeObserver(updateCss);
    window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener("change", updateCss);

    setInterval(startObserving, 2000);
  }

  platform.onReady(init);
})();
