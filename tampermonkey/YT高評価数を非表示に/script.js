// ==UserScript==
// @name         YouTubeのレイアウト調整
// @namespace    https://example.com/
// @version      3.8.0
// @description  YouTubeのレイアウトを調整する（高評価数の表示制御、Hideボタンの非表示など）
// @match        https://www.youtube.com/*
// @run-at       document-end
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YT高評価数を非表示に/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YT高評価数を非表示に/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YT%E9%AB%98%E8%A9%95%E4%BE%A1%E6%95%B0%E3%82%92%E9%9D%9E%E8%A1%A8%E7%A4%BA%E3%81%AB/icon.png
// ==/UserScript==

(function () {
  'use strict';

  const HITBOX_PAD = 6;
  const OPEN_WIDTH = 100;

  const HOVER_DELAY = 80;
  const WIDTH_DURATION = 140;
  const TEXT_DURATION = 200;

  const ROOT_ATTR = 'data-yt-like-anim-root';
  const OPEN_ATTR = 'data-yt-like-open';

  const rootsSelector = [
    'ytd-segmented-like-dislike-button-renderer #segmented-like-button',
    'segmented-like-dislike-button-view-model like-button-view-model',
    'like-button-view-model'
  ].join(', ');

  const TEXT_CLASSES =
    '.yt-spec-button-shape-next__button-text-content, .ytSpecButtonShapeNextButtonTextContent, .yt-core-attributed-string';

  const textSelector =
    `#segmented-like-button :is(${TEXT_CLASSES}), like-button-view-model :is(${TEXT_CLASSES})`;

  const css = `
    /* =========================================================
       1) 上下の当たり判定を安定化
       ========================================================= */
    ${rootsSelector} {
      box-sizing: border-box !important;
      padding-top: ${HITBOX_PAD}px !important;
      padding-bottom: ${HITBOX_PAD}px !important;
      margin-top: -${HITBOX_PAD}px !important;
      margin-bottom: -${HITBOX_PAD}px !important;
    }

    /* =========================================================
       2) 数字のアニメーション（領域展開 + フェードイン、移動なし）
       ========================================================= */
    ${textSelector} {
      display: inline-block !important;
      overflow: hidden !important;
      white-space: nowrap !important;
      vertical-align: middle !important;
      line-height: 1 !important;
      pointer-events: none !important;

      max-width: 0 !important;
      opacity: 0 !important;
      margin-left: 0 !important;

      transition:
        max-width ${WIDTH_DURATION}ms ease,
        opacity ${TEXT_DURATION}ms ease,
        margin-left ${WIDTH_DURATION}ms ease !important;
    }

    [${ROOT_ATTR}][${OPEN_ATTR}] :is(${TEXT_CLASSES}) {
      max-width: ${OPEN_WIDTH}px !important;
      opacity: 1 !important;
      margin-left: 8px !important;
    }

    /* =========================================================
       3) 非ホバー時だけ高評価アイコンを中央寄せ
       ========================================================= */
    ytd-segmented-like-dislike-button-renderer
      #segmented-like-button[${ROOT_ATTR}]:not([${OPEN_ATTR}])
      .yt-spec-button-shape-next__button-content,
    like-button-view-model[${ROOT_ATTR}]:not([${OPEN_ATTR}])
      :is(.yt-spec-button-shape-next__button-content, button.ytSpecButtonShapeNextHost) {
      justify-content: center !important;
    }

    ytd-segmented-like-dislike-button-renderer
      #segmented-like-button[${ROOT_ATTR}]:not([${OPEN_ATTR}])
      .yt-spec-button-shape-next__icon,
    like-button-view-model[${ROOT_ATTR}]:not([${OPEN_ATTR}])
      :is(.yt-spec-button-shape-next__icon, .ytSpecButtonShapeNextIcon) {
      margin-inline: auto !important;
    }

    ytd-segmented-like-dislike-button-renderer
      #segmented-like-button[${ROOT_ATTR}][${OPEN_ATTR}]
      .yt-spec-button-shape-next__button-content,
    like-button-view-model[${ROOT_ATTR}][${OPEN_ATTR}]
      :is(.yt-spec-button-shape-next__button-content, button.ytSpecButtonShapeNextHost) {
      justify-content: flex-start !important;
    }

    /* =========================================================
       4) 動画プレーヤー上の Hide ボタンを非表示
       ========================================================= */
    .ytp-ce-hide-button-container {
      display: none !important;
    }

    /* =========================================================
       5) 低モーション環境
       ========================================================= */
    @media (prefers-reduced-motion: reduce) {
      ${textSelector} {
        transition: none !important;
      }
    }
  `;

  GM_addStyle(css);

  const bound = new WeakSet();
  const timers = new WeakMap();

  function clearOpenTimer(root) {
    const timer = timers.get(root);
    if (timer) {
      clearTimeout(timer);
      timers.delete(root);
    }
  }

  function openRoot(root) {
    clearOpenTimer(root);
    root.setAttribute(OPEN_ATTR, '');
  }

  function closeRoot(root) {
    clearOpenTimer(root);
    root.removeAttribute(OPEN_ATTR);
  }

  function bindRoot(root) {
    if (bound.has(root)) return;
    bound.add(root);

    root.setAttribute(ROOT_ATTR, '');

    root.addEventListener(
      'mouseenter',
      () => {
        clearOpenTimer(root);
        timers.set(root, setTimeout(() => openRoot(root), HOVER_DELAY));
      },
      { passive: true }
    );

    root.addEventListener(
      'mouseleave',
      () => {
        closeRoot(root);
      },
      { passive: true }
    );
  }

  function bindAll() {
    document.querySelectorAll(rootsSelector).forEach(bindRoot);
  }

  bindAll();

  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      bindAll();
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
