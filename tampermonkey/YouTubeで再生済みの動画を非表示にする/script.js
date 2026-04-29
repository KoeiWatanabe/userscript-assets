// ==UserScript==
// @name         YouTubeで再生済みの動画を非表示にする
// @namespace    https://tampermonkey.net/
// @version      1.0.1
// @description  チャンネルの /videos /streams /shorts で再生済み動画をトグルで非表示化。Alt+Hでも切替可能。
// @match        https://www.youtube.com/*
// @run-at       document-end
// @grant        none
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeで再生済みの動画を非表示にする/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeで再生済みの動画を非表示にする/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeで再生済みの動画を非表示にする/icon_128.png
// ==/UserScript==

(() => {
  'use strict';

  if (window.top !== window.self) return;

  const STYLE_ID = 'hide-watched-yt-styles';
  const CHIP_ID = 'hide-watched-yt-chip';
  const HTML_ATTR = 'hideWatchedYt';
  const CHANNEL_TAB_RE = /^\/(?:@[^/]+|c\/[^/]+|channel\/[^/]+|user\/[^/]+)\/(videos|streams|shorts)\/?$/;

  const state = { hideWatched: false };

  function getActiveTab() {
    const m = location.pathname.match(CHANNEL_TAB_RE);
    return m ? m[1] : null;
  }

  function isTyping(el) {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.isContentEditable) return true;
    return !!el.closest?.('[contenteditable="true"]');
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      html[data-hide-watched-yt="1"] ytd-rich-item-renderer:has(yt-thumbnail-overlay-progress-bar-view-model),
      html[data-hide-watched-yt="1"] ytd-rich-item-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer) {
        display: none !important;
      }
      html[data-hide-watched-yt="1"] ytm-shorts-lockup-view-model:has(yt-thumbnail-overlay-progress-bar-view-model),
      html[data-hide-watched-yt="1"] ytm-shorts-lockup-view-model-v2:has(yt-thumbnail-overlay-progress-bar-view-model),
      html[data-hide-watched-yt="1"] ytm-shorts-lockup-view-model:has(ytd-thumbnail-overlay-resume-playback-renderer),
      html[data-hide-watched-yt="1"] ytm-shorts-lockup-view-model-v2:has(ytd-thumbnail-overlay-resume-playback-renderer),
      html[data-hide-watched-yt="1"] ytd-rich-item-renderer:has(ytm-shorts-lockup-view-model #progress),
      html[data-hide-watched-yt="1"] ytd-rich-item-renderer:has(ytm-shorts-lockup-view-model-v2 #progress) {
        display: none !important;
      }

      #${CHIP_ID} {
        display: inline-flex;
        align-items: center;
        height: 32px;
        padding: 0 12px;
        margin: 0 8px 0 0;
        font: 500 14px/20px "Roboto", "Noto Sans JP", sans-serif;
        color: var(--yt-spec-text-primary, #0f0f0f);
        background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.05));
        border: 1px solid transparent;
        border-radius: 8px;
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
        flex: 0 0 auto;
      }
      #${CHIP_ID}[aria-pressed="true"] {
        background: var(--yt-spec-text-primary, #0f0f0f);
        color: var(--yt-spec-text-primary-inverse, #fff);
      }
      #${CHIP_ID}:hover {
        filter: brightness(0.95);
      }
      #${CHIP_ID}[data-floating="1"] {
        position: fixed;
        top: 72px;
        right: 24px;
        z-index: 2200;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function apply() {
    document.documentElement.dataset[HTML_ATTR] = state.hideWatched ? '1' : '';
    const chip = document.getElementById(CHIP_ID);
    if (chip) chip.setAttribute('aria-pressed', String(state.hideWatched));
  }

  function toggle() {
    state.hideWatched = !state.hideWatched;
    apply();
  }

  function findChipContainer() {
    const newBar = document.querySelector('chip-bar-view-model > div');
    if (newBar && newBar.offsetParent !== null) return newBar;
    const legacyBar = document.querySelector('ytd-feed-filter-chip-bar-renderer #chips');
    if (legacyBar && legacyBar.offsetParent !== null) return legacyBar;
    return null;
  }

  function makeChip(floating) {
    const chip = document.createElement('button');
    chip.id = CHIP_ID;
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(state.hideWatched));
    chip.title = '再生済みの動画を非表示 (Alt+H)';
    chip.textContent = '再生済みを隠す';
    chip.addEventListener('click', toggle);
    if (floating) chip.dataset.floating = '1';
    return chip;
  }

  function injectChip() {
    if (!getActiveTab()) return false;
    const existing = document.getElementById(CHIP_ID);
    const bar = findChipContainer();
    if (existing) {
      // Re-home if the existing placement no longer matches reality
      const isFloating = existing.dataset.floating === '1';
      if (bar && isFloating) {
        existing.remove();
      } else if (!bar && !isFloating) {
        existing.remove();
      } else if (bar && existing.parentElement !== bar) {
        bar.appendChild(existing);
        return true;
      } else {
        return true;
      }
    }
    if (bar) {
      bar.appendChild(makeChip(false));
      return true;
    }
    document.body.appendChild(makeChip(true));
    return true;
  }

  let rafScheduled = false;
  function scheduleInject() {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      injectChip();
    });
  }

  injectStyle();
  apply();
  injectChip();

  const observer = new MutationObserver(scheduleInject);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('yt-navigate-finish', () => {
    state.hideWatched = false;
    apply();
    scheduleInject();
  });

  window.addEventListener('keydown', (e) => {
    if (!e.altKey || e.code !== 'KeyH') return;
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (isTyping(document.activeElement)) return;
    if (!getActiveTab()) return;
    e.preventDefault();
    e.stopPropagation();
    toggle();
  }, true);
})();
