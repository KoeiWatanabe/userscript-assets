// ==UserScript==
// @name         Pocket Castsのレイアウト調整
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  Pocket Casts: [再生] [タイトル] (余白) [ボタン] [日付] [長さ] の順に配置
// @author       You
// @match        https://pocketcasts.com/*
// @match        https://play.pocketcasts.com/*
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Pocket Castsのレイアウト調整/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Pocket Castsのレイアウト調整/script.js
// @icon         https://pocketcasts.com/favicons/favicon.ico
// ==/UserScript==

(function () {
    'use strict';

    /* ★設定エリア★ */
    const BUTTON_WIDTH = "210px"; // ボタン類
    const DATE_WIDTH = "100px"; // 日付
    const DURATION_WIDTH = "80px";  // 長さ

    GM_addStyle(`
        /* 1. グリッド定義 */
        div:has(> button[aria-label="Play"]):not(:has(button[aria-label*="Skip"])),
        div:has(> button[aria-label="Pause"]):not(:has(button[aria-label*="Skip"])) {
            display: grid !important;
            grid-template-columns: min-content 1fr ${BUTTON_WIDTH} ${DATE_WIDTH} ${DURATION_WIDTH} !important;
            align-items: center !important;
            grid-gap: 16px !important;
            width: 100% !important;
        }

        /* 2. 要素ごとの設定 */

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

            /* ★ここを追加！ 右側に少しスペースを空ける */
            margin-right: 12px !important;
        }
    `);
})();