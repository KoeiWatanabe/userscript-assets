// ==UserScript==
// @name         T3chatのカラーリングを調整
// @namespace    https://tampermonkey.net/
// @version      1.0.3
// @description  t3.chat の Boring Mode 時の配色を調整します
// @match        https://t3.chat/*
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/T3chatのカラーリングを調整/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/T3chatのカラーリングを調整/script.js
// @icon         https://t3.chat/favicon.ico
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const CLEANUP_KEY = '__codexT3BoringCleanup';
  const STYLE_ID = 'codex-t3-boring-style';
  const ACTIVE_ATTR = 'data-t3-boring-active';
  const CHIP_LABELS = new Set(['Create', 'Explore', 'Code', 'Learn']);

  const CSS_TEXT = `
html[${ACTIVE_ATTR}="1"] body {
  --wordmark-color: #ca0277;
}

html[${ACTIVE_ATTR}="1"] [data-t3-boring-logo="1"] {
  color: #ca0277 !important;
}

html.light[${ACTIVE_ATTR}="1"] [data-t3-boring-new-chat="1"] {
  background: #ffffff !important;
  color: #111111 !important;
  border: 1px solid rgba(0, 0, 0, 0.12) !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06) !important;
}

html.light[${ACTIVE_ATTR}="1"] [data-t3-boring-new-chat="1"]:hover,
html.light[${ACTIVE_ATTR}="1"] [data-t3-boring-new-chat="1"]:active {
  background: #f5f5f5 !important;
  color: #111111 !important;
}

html.dark[${ACTIVE_ATTR}="1"] [data-t3-boring-new-chat="1"] {
  background: #2f2f2f !important;
  color: #f2f2f2 !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  box-shadow: none !important;
}

html.dark[${ACTIVE_ATTR}="1"] [data-t3-boring-new-chat="1"]:hover,
html.dark[${ACTIVE_ATTR}="1"] [data-t3-boring-new-chat="1"]:active {
  background: #383838 !important;
  color: #f2f2f2 !important;
}

html[${ACTIVE_ATTR}="1"] [data-t3-boring-new-chat="1"]::before,
html[${ACTIVE_ATTR}="1"] [data-t3-boring-new-chat="1"]::after,
html[${ACTIVE_ATTR}="1"] [data-t3-boring-chip="1"]::before,
html[${ACTIVE_ATTR}="1"] [data-t3-boring-chip="1"]::after,
html[${ACTIVE_ATTR}="1"] [data-t3-boring-chat-form="1"]::before,
html[${ACTIVE_ATTR}="1"] [data-t3-boring-chat-form="1"]::after {
  opacity: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
}

html.light[${ACTIVE_ATTR}="1"] [data-t3-boring-chip="1"] {
  background: rgba(255, 255, 255, 0.72) !important;
  color: #222222 !important;
  outline: 1px solid rgba(0, 0, 0, 0.16) !important;
  outline-offset: 0 !important;
  border: 0 !important;
  box-shadow: none !important;
}

html.light[${ACTIVE_ATTR}="1"] [data-t3-boring-chip="1"]:hover,
html.light[${ACTIVE_ATTR}="1"] [data-t3-boring-chip="1"]:active {
  background: rgba(255, 255, 255, 0.86) !important;
  color: #222222 !important;
}

html.light[${ACTIVE_ATTR}="1"] [data-t3-boring-chat-form="1"],
html.dark[${ACTIVE_ATTR}="1"] [data-t3-boring-chat-form="1"] {
  outline: none !important;
  box-shadow: none !important;
}

html.light[${ACTIVE_ATTR}="1"] [data-t3-boring-chat-form="1"] {
  border: 1px solid rgba(0, 0, 0, 0.10) !important;
}

html.dark[${ACTIVE_ATTR}="1"] [data-t3-boring-chat-form="1"] {
  border: 1px solid rgba(255, 255, 255, 0.06) !important;
}

html.dark[${ACTIVE_ATTR}="1"] main ol li::marker,
html.dark[${ACTIVE_ATTR}="1"] main ul li::marker {
  color: #d5d5d5 !important;
}

html.dark[${ACTIVE_ATTR}="1"] main input[type="checkbox"] {
  accent-color: #6b6b6b !important;
}

html.dark[${ACTIVE_ATTR}="1"] main button[aria-label="Copy response to clipboard"],
html.dark[${ACTIVE_ATTR}="1"] main button[aria-label="Copy message"] {
  color: inherit !important;
}

html[${ACTIVE_ATTR}="1"] [data-t3-boring-avatar="1"] {
  border: 0 !important;
  outline: 0 !important;
  box-shadow: none !important;
}
`;

  let observer = null;
  let scheduled = false;
  let markedElements = [];

  if (typeof window[CLEANUP_KEY] === 'function') {
    window[CLEANUP_KEY]();
  }

  function normalizeText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function setFlag(element, attrName) {
    if (!element || element.getAttribute(attrName) === '1') {
      return;
    }
    element.setAttribute(attrName, '1');
    markedElements.push([element, attrName]);
  }

  function clearFlags() {
    for (const [element, attrName] of markedElements) {
      element.removeAttribute(attrName);
    }
    markedElements = [];
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS_TEXT;
    (document.head || document.documentElement).appendChild(style);
  }

  function isActiveTheme() {
    return document.body && document.body.classList.contains('theme-boring');
  }

  function markStaticTargets() {
    const homeLinks = Array.from(document.querySelectorAll('a[href="/"]'));
    for (const link of homeLinks) {
      const text = normalizeText(link.textContent);
      const svg = link.querySelector('svg');
      const svgClass = svg ? svg.getAttribute('class') || '' : '';
      if (svgClass.includes('text-(--wordmark-color)')) {
        setFlag(link, 'data-t3-boring-logo');
      }
      if (text === 'New Chat') {
        setFlag(link, 'data-t3-boring-new-chat');
      }
    }

    const buttons = Array.from(document.querySelectorAll('button'));
    for (const button of buttons) {
      const text = normalizeText(button.textContent);
      if (CHIP_LABELS.has(text)) {
        setFlag(button, 'data-t3-boring-chip');
      }
    }

    const input = document.querySelector('textarea[name="input"]');
    const form = input ? input.closest('form') : null;
    setFlag(form, 'data-t3-boring-chat-form');

    const avatarButton = document.querySelector('[data-sidebar="footer"] button[aria-label="User menu"]');
    setFlag(avatarButton ? avatarButton.querySelector('span[data-slot="avatar"]') : null, 'data-t3-boring-avatar');
  }

  function applyChanges() {
    scheduled = false;
    ensureStyle();

    if (!document.body) {
      scheduleApply();
      return;
    }

    const active = isActiveTheme();
    clearFlags();
    if (!active) {
      document.documentElement.removeAttribute(ACTIVE_ATTR);
      return;
    }

    document.documentElement.setAttribute(ACTIVE_ATTR, '1');
    markStaticTargets();
  }

  function scheduleApply() {
    if (scheduled) {
      return;
    }
    scheduled = true;
    requestAnimationFrame(applyChanges);
  }

  function startObserver() {
    if (observer) {
      return;
    }
    observer = new MutationObserver(() => {
      scheduleApply();
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'aria-expanded', 'data-state'],
    });
  }

  window[CLEANUP_KEY] = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    document.removeEventListener('DOMContentLoaded', scheduleApply);
    clearFlags();
    document.documentElement.removeAttribute(ACTIVE_ATTR);
    document.getElementById(STYLE_ID)?.remove();
    scheduled = false;
  };

  ensureStyle();
  startObserver();
  document.addEventListener('DOMContentLoaded', scheduleApply, { once: true });
  scheduleApply();
})();
