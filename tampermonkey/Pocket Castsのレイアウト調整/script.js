// ==UserScript==
// @name         Pocket Castsのレイアウト調整
// @namespace    http://tampermonkey.net/
// @version      4.1
// @description  Pocket Casts: /podcast と指定5ページ（starred/history/new-releases/in-progress/search）で別レイアウトを適用。SPA遷移で自動ON/OFF。レスポンシブ対応（769px未満はネイティブレイアウトに委ねる）。
// @author       You
// @match        https://pocketcasts.com/*
// @match        https://play.pocketcasts.com/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Pocket Castsのレイアウト調整/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Pocket Castsのレイアウト調整/script.js
// @icon         https://pocketcasts.com/favicons/favicon.ico
// ==/UserScript==

(function () {
    "use strict";

    const BUTTON_WIDTH = "210px";
    const DATE_WIDTH = "100px";
    const DURATION_WIDTH = "80px";
    const THUMB_WIDTH_EPISODE = "40px";

    const UNIFIED_BODY_CLASS = "tm-layout-unified";
    const UNIFIED_STYLE_ID = "tm-pocketcasts-style-unified";
    const PODCAST_STYLE_ID = "tm-pocketcasts-style-podcast";

    const TARGET_PATHS_UNIFIED = new Set([
        "/starred",
        "/history",
        "/new-releases",
        "/in-progress",
        "/search",
    ]);

    const isPodcastPage = () => location.pathname.startsWith("/podcast/");
    const isUnifiedTargetPage = () => TARGET_PATHS_UNIFIED.has(location.pathname);

    /* =========================================================
       エピソード行の構造（DOM調査）
       =========================================================
       /podcast/ の行 (sc-1yw2asb-3) 直接の子要素:
         [1]タイトル [2]短い日付(≤768px) [3]長い日付(>768px)
         [4]再生時間 [5]アクションボタン群(>1035px) [6]エピソードアクション(769-1035px)
         直接子BUTTON: Play/Pause

       5ページの行 (sc-1yw2asb-2) 直接の子要素:
         [1]サムネイル画像 [2]タイトル [3]日付 [4]再生時間
         [5]アクションボタン群(>1035px) [6]エピソードアクション(769-1035px)
         直接子BUTTON: Play/Pause

       ブレークポイント: 768px / 1035px
         >1035px: 5〜6列、アクションボタン表示
         769-1035px: アクションボタン非表示、エピソードアクション表示
                     ★サイト側がPlayに grid-area: 1/4/auto/5 を付与するため、
                       grid-area:auto で上書きし order 制御に切り替える
         ≤768px: ネイティブに完全委任
       ========================================================= */

    function buildPodcastCss() {
        // 再生中のSkipボタン付き行を除外
        const R = `div[role="link"]:has(> button:is([aria-label="Play"], [aria-label="Pause"])):not(:has(button[aria-label*="Skip"]))`;
        const PLAY = `${R} > button:is([aria-label="Play"], [aria-label="Pause"])`;

        return `
      /* タブレット (769-1035px): 再生|タイトル|エピソードアクション(auto)|日付|長さ */
      @media (min-width: 769px) and (max-width: 1035px) {
        ${R} {
          display: grid !important;
          grid-template-columns: min-content 1fr auto ${DATE_WIDTH} ${DURATION_WIDTH} !important;
          align-items: center !important;
          gap: 12px !important;
          width: 100% !important;
        }
      }

      /* デスクトップ (1036px+): 再生|タイトル|アクションボタン(固定幅)|日付|長さ */
      @media (min-width: 1036px) {
        ${R} {
          display: grid !important;
          grid-template-columns: min-content 1fr ${BUTTON_WIDTH} ${DATE_WIDTH} ${DURATION_WIDTH} !important;
          align-items: center !important;
          gap: 16px !important;
          width: 100% !important;
        }
        ${R} > :nth-child(5) {
          width: ${BUTTON_WIDTH} !important;
          min-width: ${BUTTON_WIDTH} !important;
          max-width: ${BUTTON_WIDTH} !important;
          display: flex !important;
          justify-content: flex-end !important;
          overflow: visible !important;
        }
      }

      @media (min-width: 769px) {
        ${PLAY} {
          grid-area: auto !important;
          order: 1 !important;
          margin: 0 !important;
        }
        ${R} > :nth-child(1) {
          order: 2 !important;
          min-width: 0 !important;
          max-width: none !important;
          width: 100% !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          display: block !important;
        }
        ${R} > :nth-child(5),
        ${R} > :nth-child(6) {
          grid-area: auto !important;
          order: 3 !important;
          justify-self: end !important;
        }
        ${R} > :nth-child(3) {
          order: 4 !important;
          width: ${DATE_WIDTH} !important;
          min-width: ${DATE_WIDTH} !important;
          max-width: ${DATE_WIDTH} !important;
          justify-self: end !important;
          display: flex !important;
          justify-content: flex-end !important;
          text-align: right !important;
          white-space: nowrap !important;
        }
        ${R} > :nth-child(4) {
          order: 5 !important;
          width: ${DURATION_WIDTH} !important;
          min-width: ${DURATION_WIDTH} !important;
          max-width: ${DURATION_WIDTH} !important;
          text-align: right !important;
          justify-self: end !important;
          margin-right: 12px !important;
        }
      }
    `;
    }

    function buildUnifiedCss() {
        const R = `body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button:is([aria-label="Play"], [aria-label="Pause"]))`;
        const PLAY = `${R} > button:is([aria-label="Play"], [aria-label="Pause"])`;

        return `
      /* タブレット (769-1035px): 再生|画像|タイトル|エピソードアクション(auto)|日付|長さ */
      @media (min-width: 769px) and (max-width: 1035px) {
        ${R} {
          display: grid !important;
          grid-template-columns: min-content ${THUMB_WIDTH_EPISODE} 1fr auto ${DATE_WIDTH} ${DURATION_WIDTH} !important;
          align-items: center !important;
          gap: 12px !important;
          width: 100% !important;
          padding: 4px 0 !important;
        }
      }

      /* デスクトップ (1036px+): 再生|画像|タイトル|アクションボタン(固定幅)|日付|長さ */
      @media (min-width: 1036px) {
        ${R} {
          display: grid !important;
          grid-template-columns: min-content ${THUMB_WIDTH_EPISODE} 1fr ${BUTTON_WIDTH} ${DATE_WIDTH} ${DURATION_WIDTH} !important;
          align-items: center !important;
          gap: 16px !important;
          width: 100% !important;
          padding: 4px 0 !important;
        }
        ${R} > :nth-child(5) {
          width: ${BUTTON_WIDTH} !important;
          min-width: ${BUTTON_WIDTH} !important;
          display: flex !important;
          justify-content: flex-end !important;
          overflow: visible !important;
        }
      }

      @media (min-width: 769px) {
        ${PLAY} {
          grid-area: auto !important;
          order: 1 !important;
          margin: 0 !important;
        }
        ${R} > :nth-child(1) {
          order: 2 !important;
          width: ${THUMB_WIDTH_EPISODE} !important;
          height: ${THUMB_WIDTH_EPISODE} !important;
          min-width: ${THUMB_WIDTH_EPISODE} !important;
          max-width: ${THUMB_WIDTH_EPISODE} !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        ${R} > :nth-child(1) img {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          border-radius: 4px !important;
          display: block !important;
        }
        ${R} > :nth-child(2) {
          order: 3 !important;
          min-width: 0 !important;
          max-width: none !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          display: block !important;
        }
        ${R} > :nth-child(5),
        ${R} > :nth-child(6) {
          grid-area: auto !important;
          order: 4 !important;
          justify-self: end !important;
        }
        ${R} > :nth-child(3) {
          order: 5 !important;
          width: ${DATE_WIDTH} !important;
          min-width: ${DATE_WIDTH} !important;
          justify-self: end !important;
          text-align: right !important;
          display: flex !important;
          justify-content: flex-end !important;
          white-space: nowrap !important;
        }
        ${R} > :nth-child(4) {
          order: 6 !important;
          width: ${DURATION_WIDTH} !important;
          min-width: ${DURATION_WIDTH} !important;
          justify-self: end !important;
          text-align: right !important;
          margin-right: 12px !important;
          white-space: nowrap !important;
        }
      }
    `;
    }

    function ensureStyle(id, cssText) {
        if (document.getElementById(id)) return;
        const style = document.createElement("style");
        style.id = id;
        style.textContent = cssText;
        (document.head || document.documentElement).appendChild(style);
    }

    function removeStyle(id) {
        document.getElementById(id)?.remove();
    }

    function reconcile() {
        if (!document.body) return;

        if (isPodcastPage()) ensureStyle(PODCAST_STYLE_ID, buildPodcastCss());
        else removeStyle(PODCAST_STYLE_ID);

        if (isUnifiedTargetPage()) {
            document.body.classList.add(UNIFIED_BODY_CLASS);
            ensureStyle(UNIFIED_STYLE_ID, buildUnifiedCss());
        } else {
            document.body.classList.remove(UNIFIED_BODY_CLASS);
            removeStyle(UNIFIED_STYLE_ID);
        }
    }

    // sync + microtask: SPAフレームワークのURL更新タイミング差の保険
    function scheduleReconcile() {
        reconcile();
        queueMicrotask(reconcile);
    }

    function hookSpaNavigation() {
        const wrap = (fn) => function (...args) {
            const ret = fn.apply(this, args);
            scheduleReconcile();
            return ret;
        };
        history.pushState = wrap(history.pushState);
        history.replaceState = wrap(history.replaceState);
        window.addEventListener("popstate", scheduleReconcile);
    }

    hookSpaNavigation();
    if (document.body) reconcile();
    else document.addEventListener("DOMContentLoaded", reconcile, { once: true });

    // URL変更なしでDOMが差し替わる場合の保険
    new MutationObserver(() => queueMicrotask(reconcile))
        .observe(document.documentElement, { childList: true, subtree: true });
})();
