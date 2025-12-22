// ==UserScript==
// @name         YT高評価数を非表示に
// @namespace    https://example.com/
// @version      2.2.1
// @description  YouTubeの高評価数だけ非表示（アイコンは残す・監視を#actionsに限定して軽量化）
// @match        https://www.youtube.com/*
// @run-at       document-end
// @grant        none
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YT高評価数を非表示に/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YT高評価数を非表示に/script.js
// @icon         https://lh3.googleusercontent.com/Rzh9eUOk4CP3W-GO1IIFlH8btzW6YuubQQbNDZYRVgYGRsz1Dr-TdZI75kBkt2mVaOtAsHvMG4Et_ErwxMwLaiMs72E=s120
// ==/UserScript==

(() => {
  'use strict';

  const NUM_RE = /^\s*[\d,.]+(?:\s*[KMkm])?\s*(?:万|億)?\s*$/;
  const LIKE_HINT_RE = /(高評価|いいね|like)/i;

  let actionsObserver = null;

  // idle優先（なければRAF）
  function defer(fn) {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(fn, { timeout: 500 });
    } else {
      requestAnimationFrame(fn);
    }
  }

  function findActionsRoot() {
    return document.querySelector('#actions') || null;
  }

  function findLikeButtonWithin(actionsRoot) {
    // まずは「それっぽい場所」から直取り（総当たりを避ける）
    const candidates = [
      '#segmented-like-button button',
      'ytd-like-button-renderer button',
      'ytd-segmented-like-dislike-button-renderer button',
      '#top-level-buttons-computed ytd-toggle-button-renderer button'
    ];

    for (const sel of candidates) {
      const btn = (actionsRoot || document).querySelector(sel);
      if (!btn) continue;

      const hay = `${btn.getAttribute('aria-label') || ''} ${btn.getAttribute('title') || ''}`;
      // aria-labelが取れない/別言語などもあるので、ヒントに引っかからなくても一旦次候補へ
      if (LIKE_HINT_RE.test(hay)) return btn;
    }

    // どれもダメなら最後の保険：actions内のbuttonを走査（ただし範囲は#actions内に限定）
    if (!actionsRoot) return null;
    const btns = actionsRoot.querySelectorAll('button');
    for (const b of btns) {
      const hay = `${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''}`;
      if (LIKE_HINT_RE.test(hay)) return b;
    }
    return null;
  }

  function hideNumericTextInsideButton(btn) {
    if (!btn) return;

    // アニメ数字は直で消す
    btn.querySelectorAll('yt-animated-rolling-number').forEach(el => {
      el.style.display = 'none';
    });

    // 数字っぽい短いテキストだけを消す（svgアイコンには触れない）
    const els = btn.querySelectorAll('span, yt-formatted-string, div');
    for (const el of els) {
      const t = (el.textContent || '').trim();
      if (!t || t.length > 12) continue;
      if (NUM_RE.test(t)) el.style.display = 'none';
    }
  }

  let scheduled = false;
  function scheduleRun() {
    if (scheduled) return;
    scheduled = true;
    defer(() => {
      scheduled = false;
      const actions = findActionsRoot();
      const likeBtn = findLikeButtonWithin(actions);
      hideNumericTextInsideButton(likeBtn);
      ensureActionsObserver(actions);
    });
  }

  function ensureActionsObserver(actionsRoot) {
    // #actionsが見つかるまで無理にObserver張らない
    if (!actionsRoot) return;

    // 既に同じrootを監視してるなら何もしない
    if (actionsObserver && actionsObserver.__root === actionsRoot) return;

    // 以前の監視があれば破棄
    if (actionsObserver) actionsObserver.disconnect();

    actionsObserver = new MutationObserver(() => {
      // #actionsの中身が差し替わった時だけ再適用
      scheduleRun();
    });
    actionsObserver.__root = actionsRoot;

    actionsObserver.observe(actionsRoot, { childList: true, subtree: true });
  }

  // 初回
  scheduleRun();

  // SPA遷移（動画切り替え・ライブ/アーカイブ含む）で再適用
  window.addEventListener('yt-navigate-finish', scheduleRun);

  // ページ離脱時に監視解除（念のため）
  window.addEventListener('pagehide', () => {
    if (actionsObserver) actionsObserver.disconnect();
    actionsObserver = null;
  });
})();
