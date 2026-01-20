// ==UserScript==
// @name         Pocket Castsのプレイボタンを左に
// @namespace    https://pocketcasts.com/
// @version      1.1
// @description  Move episode list Play/Pause buttons to the left using CSS for better performance.
// @match        https://pocketcasts.com/*
// @match        https://play.pocketcasts.com/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Pocket Castsのレイアウト調整/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Pocket Castsのレイアウト調整/script.js
// @icon         https://static.pocketcasts.com/webplayer/favicons/favicon.ico
// ==/UserScript==

(() => {
  "use strict";

  // 1. CSSを一度だけ注入（JSで個別にスタイルを当てない）
  const style = document.createElement('style');
  style.id = 'pc-left-button-theme';
  style.textContent = `
    /* 行コンテナの調整: ボタンのスペース分だけ左にパディングを作る */
    .pc-left-row {
      position: relative !important;
      padding-left: 54px !important; /* ボタン幅+余白 */
    }
    /* ボタンの調整: 絶対配置で左端へ固定 */
    .pc-left-btn {
      position: absolute !important;
      left: 8px !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
      margin: 0 !important;
      z-index: 5 !important;
    }
  `;
  document.head.appendChild(style);

  // ボタンが右端（エピソードリスト内）にあるか判定
  function isRightEdge(btn) {
    const rect = btn.getBoundingClientRect();
    const dist = window.innerWidth - rect.right;
    // 画面幅に応じた閾値（元のロジックを継承しつつシンプルに）
    const threshold = Math.min(340, Math.max(180, window.innerWidth * 0.22));
    return dist >= 0 && dist <= threshold;
  }

  // 適切な行コンテナを見つける
  function findRow(btn) {
    // 14段階も遡る必要はおそらくなく、特定の高さを持つ親を探す
    let el = btn.parentElement;
    let depth = 0;
    while (el && depth < 10) {
      const h = el.offsetHeight;
      // Pocket Castsのリスト行は大抵40px〜150pxの間
      if (h >= 40 && h <= 180) return el;
      el = el.parentElement;
      depth++;
    }
    return null;
  }

  function applyAll() {
    const selector = 'button[aria-label="Play"]:not(.pc-left-btn), button[aria-label="Pause"]:not(.pc-left-btn)';
    const buttons = document.querySelectorAll(selector);

    buttons.forEach(btn => {
      // フッター（プレイヤー）は除外
      if (btn.closest('footer')) return;

      // 座標計算は必要なときだけ行う
      if (isRightEdge(btn)) {
        const row = findRow(btn);
        if (row) {
          btn.classList.add('pc-left-btn');
          row.classList.add('pc-left-row');
        }
      }
    });
  }

  // MutationObserverの最適化
  let timer = null;
  const observer = new MutationObserver(() => {
    if (timer) return;
    timer = requestAnimationFrame(() => {
      applyAll();
      timer = null;
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
  applyAll();

  // リセット用関数
  window.__pcResetAll = () => {
    document.querySelectorAll('.pc-left-btn').forEach(el => el.classList.remove('pc-left-btn'));
    document.querySelectorAll('.pc-left-row').forEach(el => el.classList.remove('pc-left-row'));
    const s = document.getElementById('pc-left-button-theme');
    if (s) s.remove();
    observer.disconnect();
  };
})();