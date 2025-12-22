// ==UserScript==
// @name         マウスドラッグで検索
// @version      1.0.0
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
  const DEFAULT_SEARCH_URL = "https://duckduckgo.com/?q="; // ← GitHub側デフォルト

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

  // よく使う候補をワンクリで
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

  let armed = false, fired = false;
  let sx = 0, sy = 0;

  const selText = () => (window.getSelection?.().toString().trim() || "");

  // URLっぽい文字列なら「検索」ではなく、そのURLへ直接飛ぶ
  const normalizeUrl = (raw) => {
    if (!raw) return null;
    let t = raw.trim();

    // 選択範囲に改行や空白が混ざっている場合はURL扱いしない（誤爆防止）
    if (/\s/.test(t)) return null;

    // 先頭/末尾につきがちな括弧や引用符、末尾の句読点を落とす
    t = t
      .replace(/^[<\(\[\{「『"'`]+/, "")
      .replace(/[>\)\]\}」』"'`]+$/, "")
      .replace(/[.,;:!?]+$/, "");

    if (!t) return null;

    // 既にスキームがある
    if (/^(https?:\/\/)/i.test(t)) return t;

    // //example.com のようなスキーム省略
    if (/^\/\//.test(t)) return "https:" + t;

    // www. から始まる
    if (/^www\./i.test(t)) return "https://" + t;

    // ドメインっぽい（example.com / example.co.jp / example.com/path など）
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

  addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;                  // 左ボタンのみ
    const text = selText();
    if (!text || !inSelection(e.target)) return; // 選択済み & 選択上から開始だけ
    armed = true; fired = false;
    sx = e.clientX; sy = e.clientY;
  }, true);

  addEventListener("pointermove", (e) => {
    if (!armed || fired) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.hypot(dx, dy) < THRESHOLD) return;

    const text = selText();
    if (!text) return;

    fired = true;

    // ★ 追加：URLなら検索ではなくそのまま開く
    const url = normalizeUrl(text);
    if (url) {
      GM_openInTab(url, { active: true, insert: true, setParent: true });
      return;
    }

    const base = getSearchUrl(); // ← ここがブラウザごとのローカル設定
    GM_openInTab(base + encodeURIComponent(text), { active: true, insert: true, setParent: true });
  }, true);

  addEventListener("pointerup", () => { armed = false; fired = false; }, true);
})();
