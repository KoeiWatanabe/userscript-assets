// ==UserScript==
// @name         T3chatのカラーリングを調整
// @namespace    https://tampermonkey.net/
// @version      1.0.0
// @description  t3.chat のライトテーマ+Boring Mode時の配色を調整します
// @match        https://t3.chat/*
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/T3chatのカラーリングを調整/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/T3chatのカラーリングを調整/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/T3chatのカラーリングを調整/icon_128.png
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const CLEANUP_KEY = '__codexT3BoringCleanup';
  const STYLE_ID = 'codex-t3-boring-style';
  const ACTIVE_ATTR = 'data-t3-boring-active';
  const MARK_ATTRS = [
    'data-t3-boring-logo',
    'data-t3-boring-new-chat',
    'data-t3-boring-chip',
    'data-t3-boring-model-trigger',
    'data-t3-boring-action-chip',
    'data-t3-boring-chat-form',
    'data-t3-boring-model-dialog',
    'data-t3-boring-model-header',
    'data-t3-boring-model-search',
    'data-t3-boring-model-left',
    'data-t3-boring-model-right',
    'data-t3-boring-avatar-button',
    'data-t3-boring-avatar',
  ];
  const CHIP_LABELS = new Set(['Create', 'Explore', 'Code', 'Learn']);
  const ACTION_CHIP_LABELS = new Set(['Instant', 'Search', 'Attach']);
  const BRAND_LABELS = new Set([
    'Favorites',
    'OpenAI',
    'Anthropic',
    'Google',
    'Meta',
    'DeepSeek',
    'xAI',
    'Alibaba',
    'Moonshot',
    'Z.ai',
    'MiniMax',
    'Xiaomi',
    'Stealth',
    'InclusionAI',
  ]);

  const CSS_TEXT = `
html[${ACTIVE_ATTR}="1"] body {
  --wordmark-color: #ca0277;
}

html[${ACTIVE_ATTR}="1"] [data-t3-boring-logo="1"] {
  color: #ca0277 !important;
}

html[${ACTIVE_ATTR}="1"] [data-t3-boring-new-chat="1"] {
  background: #ffffff !important;
  color: #111111 !important;
  border: 1px solid rgba(0, 0, 0, 0.12) !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06) !important;
}

html[${ACTIVE_ATTR}="1"] [data-t3-boring-new-chat="1"]:hover,
html[${ACTIVE_ATTR}="1"] [data-t3-boring-new-chat="1"]:active {
  background: #f5f5f5 !important;
  color: #111111 !important;
}

html[${ACTIVE_ATTR}="1"] [data-t3-boring-new-chat="1"]::before,
html[${ACTIVE_ATTR}="1"] [data-t3-boring-new-chat="1"]::after {
  opacity: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
}

html[${ACTIVE_ATTR}="1"] [data-t3-boring-chip="1"] {
  background: rgba(255, 255, 255, 0.72) !important;
  color: #222222 !important;
  outline: 1px solid rgba(0, 0, 0, 0.16) !important;
  outline-offset: 0 !important;
  border: 0 !important;
  box-shadow: none !important;
}

html[${ACTIVE_ATTR}="1"] [data-t3-boring-chip="1"]:hover,
html[${ACTIVE_ATTR}="1"] [data-t3-boring-chip="1"]:active {
  background: rgba(255, 255, 255, 0.86) !important;
  color: #222222 !important;
}

html[${ACTIVE_ATTR}="1"] [data-t3-boring-chip="1"]::before,
html[${ACTIVE_ATTR}="1"] [data-t3-boring-chip="1"]::after {
  opacity: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
}

html[${ACTIVE_ATTR}="1"] [data-t3-boring-action-chip="1"] {
  border-color: rgba(0, 0, 0, 0.24) !important;
  color: #4a4a4a !important;
  box-shadow: none !important;
}

html[${ACTIVE_ATTR}="1"] [data-t3-boring-chat-form="1"] {
  border: 1px solid rgba(0, 0, 0, 0.10) !important;
  outline: none !important;
  box-shadow: none !important;
}

html[${ACTIVE_ATTR}="1"] [data-t3-boring-chat-form="1"]::before,
html[${ACTIVE_ATTR}="1"] [data-t3-boring-chat-form="1"]::after {
  opacity: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
}

html[${ACTIVE_ATTR}="1"] [data-t3-boring-avatar="1"] {
  border: 0 !important;
  outline: 0 !important;
  box-shadow: none !important;
}
`;

  let observer = null;
  let scheduled = false;

  if (typeof window[CLEANUP_KEY] === 'function') {
    window[CLEANUP_KEY]();
  }

  function normalizeText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function setFlag(element, attrName) {
    if (element && element.getAttribute(attrName) !== '1') {
      element.setAttribute(attrName, '1');
    }
  }

  function clearFlags() {
    for (const attrName of MARK_ATTRS) {
      const marked = document.querySelectorAll(`[${attrName}="1"]`);
      for (const element of marked) {
        element.removeAttribute(attrName);
      }
    }
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
    return (
      document.documentElement.classList.contains('light') &&
      document.body &&
      document.body.classList.contains('theme-boring')
    );
  }

  function isModelRow(button) {
    const text = normalizeText(button.textContent);
    if (!text || BRAND_LABELS.has(text) || text === 'Upgrade') {
      return false;
    }
    if (!/[$·]/.test(text) || text.length < 8) {
      return false;
    }
    return true;
  }

  function isRailButton(button) {
    if (!button || isModelRow(button)) {
      return false;
    }
    if (normalizeText(button.textContent)) {
      return false;
    }
    return Boolean(button.querySelector('img, svg'));
  }

  function findCommonAncestor(elements) {
    if (!elements.length) {
      return null;
    }
    let current = elements[0];
    while (current) {
      const matchesAll = elements.every((element) => current.contains(element));
      if (matchesAll) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function findSmallestContainer(root, predicate) {
    const matches = Array.from(root.querySelectorAll('div')).filter(predicate);
    if (!matches.length) {
      return null;
    }
    matches.sort((left, right) => left.querySelectorAll('*').length - right.querySelectorAll('*').length);
    return matches[0];
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

    const modelTrigger = document.querySelector('[role="combobox"][aria-label^="Select model. Current model:"]');
    setFlag(modelTrigger, 'data-t3-boring-model-trigger');

    const input = document.querySelector('textarea[name="input"]');
    const form = input ? input.closest('form') : null;
    setFlag(form, 'data-t3-boring-chat-form');
    if (form) {
      const actionButtons = Array.from(form.querySelectorAll('button'));
      for (const button of actionButtons) {
        if (ACTION_CHIP_LABELS.has(normalizeText(button.textContent))) {
          setFlag(button, 'data-t3-boring-action-chip');
        }
      }
    }

    const avatarButton = document.querySelector('[data-sidebar="footer"] button[aria-label="User menu"]');
    setFlag(avatarButton, 'data-t3-boring-avatar-button');
    setFlag(avatarButton ? avatarButton.querySelector('span[data-slot="avatar"]') : null, 'data-t3-boring-avatar');
  }

  function markModelDialog() {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    const dialog = dialogs.find((candidate) =>
      candidate.querySelector('input[placeholder="Search models..."]')
    );

    if (!dialog) {
      return;
    }

    setFlag(dialog, 'data-t3-boring-model-dialog');
    setFlag(dialog.querySelector('a[href="/settings/subscription"]')?.closest('div'), 'data-t3-boring-model-header');
    setFlag(dialog.querySelector('input[placeholder="Search models..."]')?.closest('div[class]'), 'data-t3-boring-model-search');

    const modelRows = Array.from(dialog.querySelectorAll('button')).filter(isModelRow);
    const leftPanel =
      findSmallestContainer(dialog, (element) => {
        const buttons = Array.from(element.querySelectorAll('button')).filter(isRailButton);
        const rows = Array.from(element.querySelectorAll('button')).filter(isModelRow);
        return buttons.length >= 5 && rows.length === 0;
      }) || null;

    setFlag(leftPanel, 'data-t3-boring-model-left');
    const leftWrapper = leftPanel ? leftPanel.parentElement : null;
    const layout =
      leftWrapper &&
      findSmallestContainer(dialog, (element) => {
        const rows = Array.from(element.querySelectorAll('button')).filter(isModelRow);
        return element.contains(leftWrapper) && rows.length >= 3;
      });
    const rightPanel =
      (layout && leftWrapper
        ? Array.from(layout.children).find((child) => child !== leftWrapper && child.contains(modelRows[0] || dialog))
        : null) ||
      findSmallestContainer(dialog, (element) => {
        const rows = Array.from(element.querySelectorAll('button')).filter(isModelRow);
        const rails = Array.from(element.querySelectorAll('[data-t3-boring-model-left="1"]'));
        return rows.length >= 3 && rails.length === 0;
      }) ||
      findCommonAncestor(modelRows);

    setFlag(rightPanel, 'data-t3-boring-model-right');
  }

  function applyChanges() {
    scheduled = false;
    ensureStyle();

    if (!document.body) {
      scheduleApply();
      return;
    }

    const active = isActiveTheme();
    if (active) {
      document.documentElement.setAttribute(ACTIVE_ATTR, '1');
    } else {
      document.documentElement.removeAttribute(ACTIVE_ATTR);
    }

    clearFlags();
    markStaticTargets();
    markModelDialog();
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
