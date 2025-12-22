// ==UserScript==
// @name         マウスドラッグで検索
// @version      1.2.0
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
  const QUIET_MS = 150; // selection が落ち着くまでの猶予（誤爆防止）

  let armed = false, fired = false;
  let sx = 0, sy = 0;

  let isPointerDown = false;
  let selectionChangedDuringDrag = false;

  // 「このドラッグで動かしていい選択文字列」（pointerdown時点の固定スナップショット）
  let snapshotText = "";

  // 直近の selectionchange 時刻
  let lastSelChange = 0;

  const selText = () => (window.getSelection?.().toString().trim() || "");

  const normalizeUrl = (raw) => {
    if (!raw) return null;
    let t = raw.trim();

    // 改行/空白が混ざるならURL扱いしない（誤爆防止）
    if (/\s/.test(t)) return null;

    // 前後に付きがちな記号、末尾の句読点を落とす
    t = t
      .replace(/^[<\(\[\{「『"'`]+/, "")
      .replace(/[>\)\]\}」』"'`]+$/, "")
      .replace(/[.,;:!?]+$/, "");

    if (!t) return null;

    if (/^(https?:\/\/)/i.test(t)) return t;
    if (/^\/\//.test(t)) return "https:" + t;
    if (/^www\./i.test(t)) return "https://" + t;

    if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s]*)?$/i.test(t)) {
      return "https://" + t;
    }
    return null;
  };

  const inSelection = (t) => {
    const s = window.getSelection?.();
    if (!s || s.rangeCount === 0 || !(t instanceof Node)) return false;
    try { return s.getRangeAt(0).intersectsNode(t); } catch { return false; }
  };

  // 選択が変化したらタイムスタンプ更新＆「選択作業中」フラグ
  document.addEventListener("selectionchange", () => {
    lastSelChange = Date.now();
    if (isPointerDown) selectionChangedDuringDrag = true;
  }, true);

  addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return; // 左ボタンのみ

    isPointerDown = true;
    selectionChangedDuringDrag = false;
    armed = false;
    fired = false;

    // pointerdown時点で「すでに」選択があることが条件（＝初回の選択ドラッグは絶対に武装しない）
    snapshotText = selText();
    if (!snapshotText) return;

    // 選択範囲の上から開始した時だけ武装（＝選択済み文字列を“つかんで”ドラッグ）
    if (!inSelection(e.target)) return;

    armed = true;
    sx = e.clientX;
    sy = e.clientY;
  }, true);

  addEventListener("pointermove", (e) => {
    if (!armed || fired) return;

    // selectionが落ち着いてない間は絶対発火しない
    if (Date.now() - lastSelChange < QUIET_MS) return;

    // ドラッグ中に選択が変化していたら、そのドラッグは「選択作業」なので発火しない
    if (selectionChangedDuringDrag) return;

    // 「pointerdown時点の選択」と同じ文字列が保たれている時だけ発火
    // （選択範囲を伸ばしてる途中＝文字列が変わるケースを確実に潰す）
    const nowText = selText();
    if (!nowText || nowText !== snapshotText) return;

    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.hypot(dx, dy) < THRESHOLD) return;

    fired = true;

    const url = normalizeUrl(nowText);
    if (url) {
      GM_openInTab(url, { active: true, insert: true, setParent: true });
      return;
    }

    const base = getSearchUrl();
    GM_openInTab(base + encodeURIComponent(nowText), { active: true, insert: true, setParent: true });
  }, true);

  addEventListener("pointerup", () => {
    isPointerDown = false;
    selectionChangedDuringDrag = false;
    armed = false;
    fired = false;
    snapshotText = "";
  }, true);
})();
