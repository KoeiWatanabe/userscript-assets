// ==UserScript==
// @name         マウスドラッグで検索（URLは直接開く）
// @version      1.1.0
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
   * Helpers
   **********************/
  const selText = () => (window.getSelection?.().toString().trim() || "");

  // 「押下開始地点が選択範囲の中か」を見る（既存選択の上からドラッグした時だけ動作）
  const inSelection = (targetNode) => {
    const s = window.getSelection?.();
    if (!s || s.rangeCount === 0 || !(targetNode instanceof Node)) return false;
    try {
      return s.getRangeAt(0).intersectsNode(targetNode);
    } catch {
      return false;
    }
  };

  // URLっぽい文字列なら検索せず直接開く
  const normalizeUrl = (raw) => {
    if (!raw) return null;
    let t = raw.trim();

    // 改行/空白が混ざるものはURL扱いしない（誤爆防止）
    if (/\s/.test(t)) return null;

    // 先頭/末尾につきがちな括弧や引用符、末尾の句読点を落とす
    t = t
      .replace(/^[<\(\[\{「『"'`]+/, "")
      .replace(/[>\)\]\}」』"'`]+$/, "")
      .replace(/[.,;:!?]+$/, "");

    if (!t) return null;

    if (/^(https?:\/\/)/i.test(t)) return t;          // http(s)://
    if (/^\/\//.test(t)) return "https:" + t;         // //example.com
    if (/^www\./i.test(t)) return "https://" + t;     // www.example.com

    // example.com / example.co.jp / example.com/path / example.com:8080/path
    if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s]*)?$/i.test(t)) {
      return "https://" + t;
    }
    return null;
  };

  /**********************
   * Main
   * - 速いドラッグで「選択中に検索が走る」誤爆を防ぐため、実行は pointerup で行う
   **********************/
  const THRESHOLD = 50;

  let armed = false;       // ドラッグ判定中
  let moved = false;       // 閾値を超えたか
  let sx = 0, sy = 0;      // 開始座標
  let initialText = "";    // 開始時点の選択テキスト（＝既存選択）

  addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0) return; // 左ボタンのみ

      const text = selText();
      if (!text || !inSelection(e.target)) return; // 既存選択の上から開始した時だけ

      armed = true;
      moved = false;
      initialText = text;
      sx = e.clientX;
      sy = e.clientY;
    },
    true
  );

  addEventListener(
    "pointermove",
    (e) => {
      if (!armed || moved) return;

      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (Math.hypot(dx, dy) < THRESHOLD) return;

      // ここでは「ドラッグした」事実だけ記録。実行は pointerup へ。
      moved = true;
    },
    true
  );

  addEventListener(
    "pointerup",
    () => {
      if (!armed) {
        moved = false;
        return;
      }

      if (moved) {
        const text = selText();

        // 選択中に範囲が変わっていたら（= 新規選択してた）何もしない
        if (text && text === initialText) {
          const url = normalizeUrl(text);
          if (url) {
            GM_openInTab(url, { active: true, insert: true, setParent: true });
          } else {
            const base = getSearchUrl();
            GM_openInTab(base + encodeURIComponent(text), {
              active: true,
              insert: true,
              setParent: true,
            });
          }
        }
      }

      armed = false;
      moved = false;
      initialText = "";
    },
    true
  );
})();
