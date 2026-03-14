// ==UserScript==
// @name         Pocket Castsのレイアウト調整
// @namespace    http://tampermonkey.net/
// @version      4.0
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

    /* =========================================================
       共通設定
       ========================================================= */
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

    function isPodcastPage() {
        return location.pathname.startsWith("/podcast/");
    }

    function isUnifiedTargetPage() {
        return TARGET_PATHS_UNIFIED.has(location.pathname);
    }

    /* =========================================================
       DOM調査で判明したエピソード行の構造
       =========================================================
       /podcast/ ページ（サイト側クラス: sc-1yw2asb-3）
         div[role="link"] の直接の子要素:
           nth-child(1): タイトル
           nth-child(2): 短い日付（≤768pxで表示、>768pxで非表示）
           nth-child(3): 長い日付（>768pxで表示、≤768pxで非表示）
           nth-child(4): 再生時間
           nth-child(5): アクションボタン群（>1035pxで表示、以下非表示）
           nth-child(6): エピソードアクション「...」ボタン（769-1035pxで表示、他で非表示）
           直接子BUTTON: Play/Pauseボタン（nth-child(7)相当）

       5ページ（starred等、サイト側クラス: sc-1yw2asb-2）
         div[role="link"] の直接の子要素:
           nth-child(1): サムネイル画像
           nth-child(2): タイトル
           nth-child(3): 日付
           nth-child(4): 再生時間
           nth-child(5): アクションボタン群（>1035pxで表示、以下非表示）
           nth-child(6): エピソードアクション「...」ボタン（769-1035pxで表示、他で非表示）
           直接子BUTTON: Play/Pauseボタン

       サイトのブレークポイント: 768px / 1035px
         >1035px (デスクトップ): 5〜6列グリッド、アクションボタン表示
         769-1035px (タブレット): 列数縮小、アクションボタン非表示、エピソードアクション表示
                                  ★Playボタンに grid-area: 1/4/auto/5 が付与される
         ≤768px (モバイル): 2列2行グリッド（ネイティブレイアウトに完全委任）

       カスタマイズの方針:
         - 769px以上: Playボタンを左端に移動（grid-area: auto で上書き + order: 1）
         - タブレット: 5列（再生|タイトル|エピソードアクション|日付|長さ）
         - デスクトップ: 5列（再生|タイトル|アクションボタン|日付|長さ）
         - ≤768px: スクリプトによる上書きなし
       ========================================================= */

    /* =========================================================
       CSS builders
       ========================================================= */

    // /podcast ページ用
    function buildPodcastCss() {
        // セレクタ共通部（再生中のSkipボタン付き行を除外）
        const row = `div[role="link"]:has(> button[aria-label="Play"]):not(:has(button[aria-label*="Skip"])),
      div[role="link"]:has(> button[aria-label="Pause"]):not(:has(button[aria-label*="Skip"]))`;
        const playBtn = `div[role="link"]:not(:has(button[aria-label*="Skip"])) > button[aria-label="Play"],
      div[role="link"]:not(:has(button[aria-label*="Skip"])) > button[aria-label="Pause"]`;

        return `
      /* ===== タブレット (769px-1035px): 5列グリッド ===== */
      /* 列構成: 再生 | タイトル | エピソードアクション(auto) | 日付 | 長さ */
      @media (min-width: 769px) and (max-width: 1035px) {
        ${row} {
          display: grid !important;
          grid-template-columns: min-content 1fr auto ${DATE_WIDTH} ${DURATION_WIDTH} !important;
          align-items: center !important;
          gap: 12px !important;
          width: 100% !important;
        }
      }

      /* ===== デスクトップ (1036px以上): 5列グリッド ===== */
      /* 列構成: 再生 | タイトル | アクションボタン(固定幅) | 日付 | 長さ */
      @media (min-width: 1036px) {
        ${row} {
          display: grid !important;
          grid-template-columns: min-content 1fr ${BUTTON_WIDTH} ${DATE_WIDTH} ${DURATION_WIDTH} !important;
          align-items: center !important;
          gap: 16px !important;
          width: 100% !important;
        }
      }

      /* ===== 共通 (769px以上): 各要素の配置 ===== */
      @media (min-width: 769px) {
        /* [1] 再生ボタン
           タブレットでサイト側が grid-area: 1/4/auto/5 を付与するため
           grid-area: auto で上書きし、order制御に切り替える */
        ${playBtn} {
          grid-area: auto !important;
          order: 1 !important;
          margin: 0 !important;
        }

        /* [2] タイトル (nth-child 1) */
        div[role="link"]:has(> button[aria-label="Play"]):not(:has(button[aria-label*="Skip"])) > :nth-child(1),
        div[role="link"]:has(> button[aria-label="Pause"]):not(:has(button[aria-label*="Skip"])) > :nth-child(1) {
          order: 2 !important;
          min-width: 0 !important;
          max-width: none !important;
          width: 100% !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          display: block !important;
        }

        /* [3] アクションボタン (nth-child 5) ＋ エピソードアクション (nth-child 6)
           どちらか一方だけが表示されるため、両方に order:3 を設定。
           エピソードアクションはタブレットでサイト側が grid-area を付与するため
           grid-area: auto で上書きする。 */
        div[role="link"]:has(> button[aria-label="Play"]):not(:has(button[aria-label*="Skip"])) > :nth-child(5),
        div[role="link"]:has(> button[aria-label="Play"]):not(:has(button[aria-label*="Skip"])) > :nth-child(6),
        div[role="link"]:has(> button[aria-label="Pause"]):not(:has(button[aria-label*="Skip"])) > :nth-child(5),
        div[role="link"]:has(> button[aria-label="Pause"]):not(:has(button[aria-label*="Skip"])) > :nth-child(6) {
          grid-area: auto !important;
          order: 3 !important;
          justify-self: end !important;
        }

        /* [4] 日付 (nth-child 3 = 長い日付、769px以上で表示) */
        div[role="link"]:has(> button[aria-label="Play"]):not(:has(button[aria-label*="Skip"])) > :nth-child(3),
        div[role="link"]:has(> button[aria-label="Pause"]):not(:has(button[aria-label*="Skip"])) > :nth-child(3) {
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

        /* [5] 長さ (nth-child 4) */
        div[role="link"]:has(> button[aria-label="Play"]):not(:has(button[aria-label*="Skip"])) > :nth-child(4),
        div[role="link"]:has(> button[aria-label="Pause"]):not(:has(button[aria-label*="Skip"])) > :nth-child(4) {
          order: 5 !important;
          width: ${DURATION_WIDTH} !important;
          min-width: ${DURATION_WIDTH} !important;
          max-width: ${DURATION_WIDTH} !important;
          text-align: right !important;
          justify-self: end !important;
          margin-right: 12px !important;
        }
      }

      /* ===== デスクトップのみ: アクションボタンの表示スタイル ===== */
      @media (min-width: 1036px) {
        div[role="link"]:has(> button[aria-label="Play"]):not(:has(button[aria-label*="Skip"])) > :nth-child(5),
        div[role="link"]:has(> button[aria-label="Pause"]):not(:has(button[aria-label*="Skip"])) > :nth-child(5) {
          width: ${BUTTON_WIDTH} !important;
          min-width: ${BUTTON_WIDTH} !important;
          max-width: ${BUTTON_WIDTH} !important;
          display: flex !important;
          justify-content: flex-end !important;
          overflow: visible !important;
        }
      }
    `;
    }

    // 5ページ用（starred/history/new-releases/in-progress/search）
    function buildUnifiedCss() {
        const row = `body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Play"]),
      body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Pause"])`;

        return `
      /* ===== タブレット (769px-1035px): 6列グリッド ===== */
      /* 列構成: 再生 | 画像 | タイトル | エピソードアクション(auto) | 日付 | 長さ */
      @media (min-width: 769px) and (max-width: 1035px) {
        ${row} {
          display: grid !important;
          grid-template-columns: min-content ${THUMB_WIDTH_EPISODE} 1fr auto ${DATE_WIDTH} ${DURATION_WIDTH} !important;
          align-items: center !important;
          gap: 12px !important;
          width: 100% !important;
          padding: 4px 0 !important;
        }
      }

      /* ===== デスクトップ (1036px以上): 6列グリッド ===== */
      /* 列構成: 再生 | 画像 | タイトル | アクションボタン(固定幅) | 日付 | 長さ */
      @media (min-width: 1036px) {
        ${row} {
          display: grid !important;
          grid-template-columns: min-content ${THUMB_WIDTH_EPISODE} 1fr ${BUTTON_WIDTH} ${DATE_WIDTH} ${DURATION_WIDTH} !important;
          align-items: center !important;
          gap: 16px !important;
          width: 100% !important;
          padding: 4px 0 !important;
        }
      }

      /* ===== 共通 (769px以上): 各要素の配置 ===== */
      @media (min-width: 769px) {
        /* [1] 再生ボタン (grid-area: auto でサイト側の grid-area 指定を上書き) */
        body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Play"]) > button[aria-label="Play"],
        body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Pause"]) > button[aria-label="Pause"] {
          grid-area: auto !important;
          order: 1 !important;
          margin: 0 !important;
        }

        /* [2] サムネイル画像 (nth-child 1) */
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

        /* [3] タイトル (nth-child 2) */
        body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Play"]) > :nth-child(2),
        body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Pause"]) > :nth-child(2) {
          order: 3 !important;
          min-width: 0 !important;
          max-width: none !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          display: block !important;
        }

        /* [4] アクションボタン (nth-child 5) ＋ エピソードアクション (nth-child 6)
           grid-area: auto で上書きし order 制御に切り替え */
        body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Play"]) > :nth-child(5),
        body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Play"]) > :nth-child(6),
        body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Pause"]) > :nth-child(5),
        body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Pause"]) > :nth-child(6) {
          grid-area: auto !important;
          order: 4 !important;
          justify-self: end !important;
        }

        /* [5] 日付 (nth-child 3) */
        body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Play"]) > :nth-child(3),
        body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Pause"]) > :nth-child(3) {
          order: 5 !important;
          width: ${DATE_WIDTH} !important;
          min-width: ${DATE_WIDTH} !important;
          justify-self: end !important;
          text-align: right !important;
          display: flex !important;
          justify-content: flex-end !important;
          white-space: nowrap !important;
        }

        /* [6] 長さ (nth-child 4) */
        body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Play"]) > :nth-child(4),
        body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Pause"]) > :nth-child(4) {
          order: 6 !important;
          width: ${DURATION_WIDTH} !important;
          min-width: ${DURATION_WIDTH} !important;
          justify-self: end !important;
          text-align: right !important;
          margin-right: 12px !important;
          white-space: nowrap !important;
        }
      }

      /* ===== デスクトップのみ: アクションボタンの表示スタイル ===== */
      @media (min-width: 1036px) {
        body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Play"]) > :nth-child(5),
        body.${UNIFIED_BODY_CLASS} div[role="link"]:has(> button[aria-label="Pause"]) > :nth-child(5) {
          width: ${BUTTON_WIDTH} !important;
          min-width: ${BUTTON_WIDTH} !important;
          display: flex !important;
          justify-content: flex-end !important;
          overflow: visible !important;
        }
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
        if (!document.body) return;

        if (isPodcastPage()) enablePodcast();
        else disablePodcast();

        if (isUnifiedTargetPage()) enableUnified();
        else disableUnified();
    }

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
        queueMicrotask(reconcile);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
})();
