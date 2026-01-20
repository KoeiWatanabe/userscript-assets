// ==UserScript==
// @name         Pocket Castsのレイアウト調整
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Pocket Casts: /podcast と指定5ページ（starred/history/new-releases/in-progress/search）で別レイアウトを適用。SPA遷移で自動ON/OFF。
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

    /* =========================================================
       共通設定
       ========================================================= */
    const BUTTON_WIDTH = "210px";
    const DATE_WIDTH = "100px";
    const DURATION_WIDTH = "80px";

    // 5ページ（エピソード行）用
    const THUMB_WIDTH_EPISODE = "40px";
    const UNIFIED_BODY_CLASS = "tm-layout-unified";
    const UNIFIED_STYLE_ID = "tm-pocketcasts-style-unified";

    // /podcast 用
    const PODCAST_STYLE_ID = "tm-pocketcasts-style-podcast";

    const TARGET_PATHS_UNIFIED = new Set([
        "/starred",
        "/history",
        "/new-releases",
        "/in-progress",
        "/search", // ?q= は毎回変わってOK。pathnameだけ見る
    ]);

    function isPodcastPage() {
        return location.pathname.startsWith("/podcast/");
    }

    function isUnifiedTargetPage() {
        return TARGET_PATHS_UNIFIED.has(location.pathname);
    }

    /* =========================================================
       CSS builders
       ========================================================= */

    // /podcast 用（パターンB、5列：再生 | タイトル | ボタン | 日付 | 長さ）
    function buildPodcastCss() {
        return `
      /* 1. グリッド定義 */
      div:has(> button[aria-label="Play"]):not(:has(button[aria-label*="Skip"])),
      div:has(> button[aria-label="Pause"]):not(:has(button[aria-label*="Skip"])) {
          display: grid !important;
          grid-template-columns: min-content 1fr ${BUTTON_WIDTH} ${DATE_WIDTH} ${DURATION_WIDTH} !important;
          align-items: center !important;
          grid-gap: 16px !important;
          width: 100% !important;
      }

      /* [1] 再生ボタン (左詰め) */
      div:not(:has(button[aria-label*="Skip"])) > button[aria-label="Play"],
      div:not(:has(button[aria-label*="Skip"])) > button[aria-label="Pause"] {
          order: 1 !important;
          margin: 0 !important;
      }

      /* [2] タイトル (左詰め・可変幅) */
      div:has(> button[aria-label="Play"]):not(:has(button[aria-label*="Skip"])) > :nth-child(1) {
          order: 2 !important;
          min-width: 0 !important;
          max-width: none !important;
          width: 100% !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          display: block !important;
      }

      /* [3] ボタン類 (右詰め・固定幅) */
      div:has(> button[aria-label="Play"]):not(:has(button[aria-label*="Skip"])) > :nth-child(5) {
          order: 3 !important;
          width: ${BUTTON_WIDTH} !important;
          min-width: ${BUTTON_WIDTH} !important;
          max-width: ${BUTTON_WIDTH} !important;
          justify-self: end !important;
          display: flex !important;
          justify-content: flex-end !important;
          overflow: visible !important;
      }

      /* [4] 日付 (右詰め・固定幅) */
      div:has(> button[aria-label="Play"]):not(:has(button[aria-label*="Skip"])) > :nth-child(3) {
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

      /* [5] 長さ (右詰め・固定幅・右余白あり) */
      div:has(> button[aria-label="Play"]):not(:has(button[aria-label*="Skip"])) > :nth-child(4) {
          order: 5 !important;
          width: ${DURATION_WIDTH} !important;
          min-width: ${DURATION_WIDTH} !important;
          max-width: ${DURATION_WIDTH} !important;
          text-align: right !important;
          justify-self: end !important;
          margin-right: 12px !important;
      }
    `;
    }

    // 5ページ用（エピソード行のみ、6列：再生 | 画像 | タイトル | ボタン | 日付 | 長さ）
    // 検索上部の番組一覧を巻き込まないため、Play/Pauseのある行だけに限定
    function buildUnifiedCss() {
        return `
      /* エピソード行（Play/Pauseあり）だけ整列 */
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Play"]),
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Pause"]) {
          display: grid !important;
          grid-template-columns: min-content ${THUMB_WIDTH_EPISODE} 1fr ${BUTTON_WIDTH} ${DATE_WIDTH} ${DURATION_WIDTH} !important;
          align-items: center !important;
          grid-gap: 16px !important;
          width: 100% !important;
          padding: 4px 0 !important;
      }

      /* 再生ボタン */
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Play"]) > button[aria-label="Play"],
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Pause"]) > button[aria-label="Pause"] {
          order: 1 !important;
          margin: 0 !important;
      }

      /* タイトルのはみ出し対策 */
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Play"]) > :nth-child(1),
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Play"]) > :nth-child(2),
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Pause"]) > :nth-child(1),
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Pause"]) > :nth-child(2) {
          min-width: 0 !important;
          max-width: none !important;
          width: 100% !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          display: block !important;
      }

      /* [2] 画像 (Child 1) 40px固定 */
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Play"]) > :nth-child(1),
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Pause"]) > :nth-child(1) {
          order: 2 !important;
          width: ${THUMB_WIDTH_EPISODE} !important;
          height: ${THUMB_WIDTH_EPISODE} !important;
          min-width: ${THUMB_WIDTH_EPISODE} !important;
          max-width: ${THUMB_WIDTH_EPISODE} !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
      }

      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Play"]) > :nth-child(1) img,
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Pause"]) > :nth-child(1) img {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          border-radius: 4px !important;
          display: block !important;
      }

      /* [3] タイトル (Child 2) */
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Play"]) > :nth-child(2),
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Pause"]) > :nth-child(2) {
          order: 3 !important;
      }

      /* [4] ボタン類 (Child 5) */
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Play"]) > :nth-child(5),
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Pause"]) > :nth-child(5) {
          order: 4 !important;
          width: ${BUTTON_WIDTH} !important;
          justify-self: end !important;
          display: flex !important;
          justify-content: flex-end !important;
      }

      /* [5] 日付 (Child 3) */
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Play"]) > :nth-child(3),
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Pause"]) > :nth-child(3) {
          order: 5 !important;
          width: ${DATE_WIDTH} !important;
          justify-self: end !important;
          text-align: right !important;
          display: flex !important;
          justify-content: flex-end !important;
          white-space: nowrap !important;
      }

      /* [6] 長さ (Child 4) */
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Play"]) > :nth-child(4),
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Pause"]) > :nth-child(4) {
          order: 6 !important;
          width: ${DURATION_WIDTH} !important;
          justify-self: end !important;
          text-align: right !important;
          margin-right: 12px !important;
          white-space: nowrap !important;
      }

      /* メニュー (Child 6) は隠す */
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Play"]) > :nth-child(6),
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Pause"]) > :nth-child(6) {
          display: none !important;
      }
    `;
    }

    /* =========================================================
       Style helpers
       ========================================================= */
    function ensureStyle(id, cssText) {
        if (document.getElementById(id)) return;
        const style = document.createElement("style");
        style.id = id;
        style.textContent = cssText;
        (document.head || document.documentElement).appendChild(style);
    }

    function removeStyle(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    /* =========================================================
       Enable/Disable per mode
       ========================================================= */
    function enablePodcast() {
        ensureStyle(PODCAST_STYLE_ID, buildPodcastCss());
    }

    function disablePodcast() {
        removeStyle(PODCAST_STYLE_ID);
    }

    function enableUnified() {
        if (document.body) document.body.classList.add(UNIFIED_BODY_CLASS);
        ensureStyle(UNIFIED_STYLE_ID, buildUnifiedCss());
    }

    function disableUnified() {
        if (document.body) document.body.classList.remove(UNIFIED_BODY_CLASS);
        removeStyle(UNIFIED_STYLE_ID);
    }

    /* =========================================================
       Reconcile (single source of truth)
       ========================================================= */
    function reconcile() {
        // bodyがまだ無い瞬間があるので保険（DOM構築初期）
        if (!document.body) return;

        if (isPodcastPage()) enablePodcast();
        else disablePodcast();

        if (isUnifiedTargetPage()) enableUnified();
        else disableUnified();
    }

    // body待ちしてから reconcile を実行（初回だけ）
    function reconcileWhenReady() {
        if (document.body) {
            reconcile();
            return;
        }
        requestAnimationFrame(reconcileWhenReady);
    }

    /* =========================================================
       SPA navigation hook
       ========================================================= */
    function hookSpaNavigation() {
        const { pushState, replaceState } = history;

        function wrap(fn) {
            return function (...args) {
                const ret = fn.apply(this, args);
                // 画面差し替えのタイミングずれ対策：即時＋次tick
                reconcile();
                queueMicrotask(reconcile);
                return ret;
            };
        }

        history.pushState = wrap(pushState);
        history.replaceState = wrap(replaceState);

        window.addEventListener("popstate", () => {
            reconcile();
            queueMicrotask(reconcile);
        });
    }

    // 起動
    hookSpaNavigation();
    reconcileWhenReady();

    // DOM差し替えがURL変更なしで起きる場合の保険（軽め）
    const mo = new MutationObserver(() => {
        // 連発しがちなので microtask でまとめる
        queueMicrotask(reconcile);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
})();
