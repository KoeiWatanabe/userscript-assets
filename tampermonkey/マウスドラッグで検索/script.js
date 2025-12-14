// ==UserScript==
// @name         マウスドラッグで検索
// @match        *://*/*
// @grant        GM_openInTab
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/マウスドラッグで検索/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/マウスドラッグで検索/script.js
// @icon         https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEh0Khe2Fnk13NxMHrkv1DpzaacPB0wQiRMTtiil0ZlpzOh9HC8sLN8z4qjp-lgGN-xSQIUgbhD7ynpUyqhv23K9QRDceFwLg_oo9Dw3aqd5aDiyHBpV1fuVLU5hXMMYAPTcSrpe6PORw-Kj/s800/computer_mouse_top_wireless.png
// ==/UserScript==

(() => {
  const SEARCH_URL = "https://duckduckgo.com/?q=";
  const THRESHOLD = 50;

  let armed = false, fired = false;
  let sx = 0, sy = 0;

  const selText = () => (window.getSelection?.().toString().trim() || "");
  const inSelection = (t) => {
    const s = window.getSelection?.();
    if (!s || s.rangeCount === 0 || !(t instanceof Node)) return false;
    try { return s.getRangeAt(0).intersectsNode(t); } catch { return false; }
  };

  addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;                 // 左ボタンのみ
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
    GM_openInTab(SEARCH_URL + encodeURIComponent(text), { active: true, insert: true, setParent: true });
  }, true);

  addEventListener("pointerup", () => { armed = false; fired = false; }, true);
})();
