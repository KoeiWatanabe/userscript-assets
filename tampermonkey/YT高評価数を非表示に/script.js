// ==UserScript==
// @name         YT高評価数を非表示に
// @namespace    https://example.com/
// @version      3.2.0
// @description  YouTubeの高評価数だけ非表示（アイコンは残す・監視を#actionsに限定して軽量化）
// @match        https://www.youtube.com/*
// @run-at       document-end
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YT高評価数を非表示に/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YT高評価数を非表示に/script.js
// @icon         https://lh3.googleusercontent.com/Rzh9eUOk4CP3W-GO1IIFlH8btzW6YuubQQbNDZYRVgYGRsz1Dr-TdZI75kBkt2mVaOtAsHvMG4Et_ErwxMwLaiMs72E=s120
// ==/UserScript==

(function () {
  'use strict';

  const HITBOX_PAD = 6;      // 上下の当たり判定を広げるpx（必要なら 8〜10）
  const OPEN_WIDTH = 100;    // 数字表示時の max-width

  const targetSelectors = [
    'ytd-segmented-like-dislike-button-renderer .yt-spec-button-shape-next__button-text-content',
    'like-button-view-model .yt-spec-button-shape-next__button-text-content',
    'like-button-view-model .yt-core-attributed-string'
  ];

  const css = `
    /* =========================================================
       1) 上下の当たり判定を安定化（見た目ほぼ不変）
       ========================================================= */
    ytd-segmented-like-dislike-button-renderer #segmented-like-button,
    like-button-view-model {
      box-sizing: border-box !important;
      padding-top: ${HITBOX_PAD}px !important;
      padding-bottom: ${HITBOX_PAD}px !important;
      margin-top: -${HITBOX_PAD}px !important;
      margin-bottom: -${HITBOX_PAD}px !important;
    }

    /* =========================================================
       2) 数字の開閉アニメ（max-width）を維持しつつ、allは使わない
       ========================================================= */
    ${targetSelectors.join(', ')} {
      display: inline-block !important;
      overflow: hidden !important;
      white-space: nowrap !important;

      max-width: 0 !important;
      margin-left: 0 !important;
      opacity: 0 !important;

      transition: max-width 0.2s ease, margin-left 0.2s ease, opacity 0.2s ease !important;

      pointer-events: none !important;

      line-height: 1 !important;
      vertical-align: middle !important;
    }

    ytd-segmented-like-dislike-button-renderer:hover .yt-spec-button-shape-next__button-text-content,
    like-button-view-model:hover .yt-spec-button-shape-next__button-text-content,
    like-button-view-model:hover .yt-core-attributed-string {
      max-width: ${OPEN_WIDTH}px !important;
      margin-left: 8px !important;
      opacity: 1 !important;
    }

    /* =========================================================
       3) 左右対称：非ホバー時だけ「高評価アイコン」を中央寄せ
          - 低評価側は触らない
          - ホバー時は標準配置に戻す
       ========================================================= */

    /* 旧レイアウト（segmented）: 高評価ボタンだけ */
    ytd-segmented-like-dislike-button-renderer:not(:hover)
      #segmented-like-button .yt-spec-button-shape-next__button-content {
      justify-content: center !important;
    }
    ytd-segmented-like-dislike-button-renderer:not(:hover)
      #segmented-like-button .yt-spec-button-shape-next__icon {
      margin-inline: auto !important;
    }

    /* 新レイアウト（like-button-view-model）: 高評価側 */
    like-button-view-model:not(:hover) .yt-spec-button-shape-next__button-content {
      justify-content: center !important;
    }
    like-button-view-model:not(:hover) .yt-spec-button-shape-next__icon {
      margin-inline: auto !important;
    }

    /* ホバー時は自然な並び（アイコン＋数字）へ戻す */
    ytd-segmented-like-dislike-button-renderer:hover
      #segmented-like-button .yt-spec-button-shape-next__button-content,
    like-button-view-model:hover .yt-spec-button-shape-next__button-content {
      justify-content: flex-start !important;
    }
  `;

  GM_addStyle(css);
})();