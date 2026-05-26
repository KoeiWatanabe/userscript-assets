// ==UserScript==
// @name         ChatGPTを調整
// @namespace    https://tampermonkey.net/
// @version      1.0.0
// @description  ChatGPTの知能レベル選択肢を「低」「中」「高」に置き換えます。
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/ChatGPTを調整/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/ChatGPTを調整/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/ChatGPTを調整/icon_128.png
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const LABELS = new Map([
    ["最速", "低"],
    ["標準", "中"],
    ["高", "高"],
  ]);

  const INTELLIGENCE_TIME_RE = /^(?:5秒|5[〜～~\-–—-]30秒|15[〜～~\-–—-]60秒)$/;
  const OBSERVER_DEBOUNCE_MS = 50;
  const STARTUP_SCAN_MS = 5000;
  const STARTUP_SCAN_INTERVAL_MS = 250;

  let rescanTimer = 0;

  const normalize = (value) => String(value || "").replace(/\s+/g, "");

  const isElement = (node) => node && node.nodeType === Node.ELEMENT_NODE;

  const isVisible = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const textOf = (element) => normalize(element.textContent);

  const replaceExactText = (element) => {
    const current = normalize(element.textContent);
    const replacement = LABELS.get(current);

    if (!replacement || current === replacement) {
      return false;
    }

    element.textContent = replacement;
    return true;
  };

  const replaceLeafLabels = (root) => {
    if (!isElement(root)) {
      return false;
    }

    let changed = false;
    const candidates = root.querySelectorAll("span, div, button");

    for (const candidate of candidates) {
      if (candidate.children.length === 0) {
        changed = replaceExactText(candidate) || changed;
      }
    }

    return changed;
  };

  const isIntelligenceMenuItem = (button) => {
    if (button.getAttribute("role") !== "menuitemradio") {
      return false;
    }

    const leafTexts = [...button.querySelectorAll("span, div")]
      .filter((element) => element.children.length === 0)
      .map(textOf);

    const hasKnownLabel = leafTexts.some((text) => LABELS.has(text));
    const hasKnownDuration = leafTexts.some((text) => INTELLIGENCE_TIME_RE.test(text));

    return hasKnownLabel && hasKnownDuration;
  };

  const isIntelligenceTrigger = (button) => {
    const text = textOf(button);

    if (!LABELS.has(text)) {
      return false;
    }

    return (
      button.classList.contains("__composer-pill") ||
      button.getAttribute("aria-haspopup") === "menu"
    );
  };

  const applyLabels = (root = document) => {
    const scope = root === document || root === document.documentElement ? document : root;
    const buttons = isElement(scope) && scope.matches("button")
      ? [scope, ...scope.querySelectorAll("button")]
      : [...scope.querySelectorAll("button")];

    for (const button of buttons) {
      if (!isVisible(button)) {
        continue;
      }

      if (isIntelligenceMenuItem(button) || isIntelligenceTrigger(button)) {
        replaceLeafLabels(button);
      }
    }
  };

  const scheduleApply = (root) => {
    if (rescanTimer) {
      clearTimeout(rescanTimer);
    }

    rescanTimer = window.setTimeout(() => {
      rescanTimer = 0;
      applyLabels(root);
    }, OBSERVER_DEBOUNCE_MS);
  };

  const observe = () => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (isElement(node)) {
            scheduleApply(node);
            return;
          }
        }

        if (mutation.type === "characterData" && mutation.target.parentElement) {
          scheduleApply(mutation.target.parentElement);
          return;
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  };

  const start = () => {
    applyLabels();
    observe();

    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      applyLabels();

      if (Date.now() - startedAt > STARTUP_SCAN_MS) {
        window.clearInterval(intervalId);
      }
    }, STARTUP_SCAN_INTERVAL_MS);

    document.addEventListener("click", () => scheduleApply(document), true);
    document.addEventListener("visibilitychange", () => scheduleApply(document));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
