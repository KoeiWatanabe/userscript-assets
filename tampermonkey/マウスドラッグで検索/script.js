// ==UserScript==
// @name         マウスドラッグで検索
// @version      1.3.0
// @description  選択した文字列をドラッグで検索
// @match        *://*/*
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/マウスドラッグで検索/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/マウスドラッグで検索/script.js
// @icon         https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEh0Khe2Fnk13NxMHrkv1DpzaacPB0wQiRMTtiil0ZlpzOh9HC8sLN8z4qjp-lgGN-xSQIUgbhD7ynpUyqhv23K9QRDceFwLg_oo9Dw3aqd5aDiyHBpV1fuVLU5hXMMYAPTcSrpe6PORw-Kj/s800/computer_mouse_top_wireless.png
// ==/UserScript==

(() => {
  "use strict";

  /**********************
   * Local settings (per-browser)
   **********************/
  const KEY_SEARCH_URL = "searchUrl";
  const DEFAULT_SEARCH_URL = "https://duckduckgo.com/?q=";

  const getSearchUrl = () => GM_getValue(KEY_SEARCH_URL, DEFAULT_SEARCH_URL);

  const setSearchUrlPrompt = () => {
    const current = getSearchUrl();
    const next = prompt(
      "検索URLのベースを入力してください。\n例) https://www.google.com/search?q=\n例) https://duckduckgo.com/?q=\n現在:",
      current
    );
    if (next == null) return;
    GM_setValue(KEY_SEARCH_URL, next.trim());
  };

  const setSearchUrl = (url) => GM_setValue(KEY_SEARCH_URL, url);

  GM_registerMenuCommand("Search engine: Google", () =>
    setSearchUrl("https://www.google.com/search?q=")
  );
  GM_registerMenuCommand("Search engine: DuckDuckGo", () =>
    setSearchUrl("https://duckduckgo.com/?q=")
  );
  GM_registerMenuCommand("Search engine: Custom…", setSearchUrlPrompt);

  /**********************
   * Behavior
   **********************/
  const THRESHOLD = 50;
  const THRESHOLD_SQUARED = THRESHOLD ** 2;
  const HTTP_PROTOCOL = /^https?:\/\//i;
  const BARE_DOMAIN = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s]*)?$/i;
  const TAB_OPTIONS = { active: true, insert: true, setParent: true };
  const LISTENER_OPTIONS = { capture: true, passive: true };

  let dragCandidate = null;
  let activeDrag = null;

  const normalizeUrl = (text) => {
    if (/\s/.test(text)) return null;

    let candidate = text
      .replace(/^[<\(\[\{「『"'`]+/, "")
      .replace(/[>\)\]\}」』"'`]+$/, "")
      .replace(/[.,;:!?]+$/, "");

    if (candidate.startsWith("//")) {
      candidate = `https:${candidate}`;
    } else if (/^www\./i.test(candidate) || BARE_DOMAIN.test(candidate)) {
      candidate = `https://${candidate}`;
    } else if (!HTTP_PROTOCOL.test(candidate)) {
      return null;
    }

    try {
      const url = new URL(candidate);
      return (url.protocol === "http:" || url.protocol === "https:") && url.hostname
        ? url.href
        : null;
    } catch {
      return null;
    }
  };

  const isPointInRange = (range, x, y) => {
    for (const rect of range.getClientRects()) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return true;
      }
    }
    return false;
  };

  const openText = (text) => {
    const targetUrl = normalizeUrl(text) ?? getSearchUrl() + encodeURIComponent(text);
    GM_openInTab(targetUrl, TAB_OPTIONS);
  };

  addEventListener("pointerdown", (e) => {
    dragCandidate = null;
    activeDrag = null;
    if (e.pointerType !== "mouse" || e.button !== 0) return;

    const selection = getSelection();
    if (selection.rangeCount === 0 || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (!text || !isPointInRange(selection.getRangeAt(0), e.clientX, e.clientY)) return;

    dragCandidate = { text, x: e.clientX, y: e.clientY };
  }, LISTENER_OPTIONS);

  addEventListener("dragstart", () => {
    activeDrag = null;
    if (!dragCandidate) return;

    if (getSelection().toString().trim() === dragCandidate.text) {
      activeDrag = dragCandidate;
    }
    dragCandidate = null;
  }, LISTENER_OPTIONS);

  addEventListener("dragend", (e) => {
    const drag = activeDrag;
    dragCandidate = null;
    activeDrag = null;
    if (!drag) return;

    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (dx * dx + dy * dy >= THRESHOLD_SQUARED) openText(drag.text);
  }, LISTENER_OPTIONS);
})();
