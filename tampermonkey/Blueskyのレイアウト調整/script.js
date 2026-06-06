// ==UserScript==
// @name         Blueskyのレイアウト調整
// @namespace    https://tampermonkey.net/
// @version      1.1.1
// @description  Blueskyでポストのメトリクス（数値）を通常時は非表示にし、ホバー時のみ表示します。（タイムライン、個別詳細、検索結果に対応）
// @match        https://bsky.app/*
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Bluesky%E3%81%AE%E3%83%AC%E3%82%A4%E3%82%A2%E3%82%A6%E3%83%88%E8%AA%BF%E6%95%B4/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Bluesky%E3%81%AE%E3%83%AC%E3%82%A4%E3%82%A2%E3%82%A6%E3%83%88%E8%AA%BF%E6%95%B4/script.js
// @icon         https://web-cdn.bsky.app/static/favicon.png
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const css = `
        /* --- 通常時のスタイル：数値を非表示（不透明度0）にする --- */

        /* 1. タイムライン上のフィードアイテムの数値 */
        [data-testid^="feedItem-"] [data-testid="replyBtn"] div,
        [data-testid^="feedItem-"] [data-testid="repostCount"],
        [data-testid^="feedItem-"] [data-testid="likeCount"] {
            opacity: 0 !important;
            transition: opacity 0.15s ease-in-out !important;
        }

        /* 2. 個別ポスト詳細画面の数値 */
        [data-testid^="postThreadItem-"] [data-testid="replyBtn"] div,
        [data-testid^="postThreadItem-"] [data-testid="repostCount"],
        [data-testid^="postThreadItem-"] [data-testid="likeCount"],
        /* 詳細画面（expanded表示）の統計数値 */
        [data-testid="repostCount-expanded"],
        [data-testid="quoteCount-expanded"],
        [data-testid="likeCount-expanded"],
        [data-testid="bookmarkCount-expanded"] {
            opacity: 0 !important;
            transition: opacity 0.15s ease-in-out !important;
        }

        /* 3. 検索ページおよびアカウント内検索ページの数値 */
        [data-testid="searchScreen"] div[role="link"] [data-testid="replyBtn"] div,
        [data-testid="searchScreen"] div[role="link"] [data-testid="repostCount"],
        [data-testid="searchScreen"] div[role="link"] [data-testid="likeCount"],
        [data-testid="searchPostsScreen"] div[role="link"] [data-testid="replyBtn"] div,
        [data-testid="searchPostsScreen"] div[role="link"] [data-testid="repostCount"],
        [data-testid="searchPostsScreen"] div[role="link"] [data-testid="likeCount"] {
            opacity: 0 !important;
            transition: opacity 0.15s ease-in-out !important;
        }

        /* --- ホバー時のスタイル：数値を表示する --- */

        /* 1. タイムライン上のポストホバー時 */
        [data-testid^="feedItem-"]:hover [data-testid="replyBtn"] div,
        [data-testid^="feedItem-"]:hover [data-testid="repostCount"],
        [data-testid^="feedItem-"]:hover [data-testid="likeCount"] {
            opacity: 1 !important;
        }

        /* 2. 詳細画面のポストホバー時 */
        [data-testid^="postThreadItem-"]:hover [data-testid="replyBtn"] div,
        [data-testid^="postThreadItem-"]:hover [data-testid="repostCount"],
        [data-testid^="postThreadItem-"]:hover [data-testid="likeCount"],
        [data-testid^="postThreadItem-"]:hover [data-testid="repostCount-expanded"],
        [data-testid^="postThreadItem-"]:hover [data-testid="quoteCount-expanded"],
        [data-testid^="postThreadItem-"]:hover [data-testid="likeCount-expanded"],
        [data-testid^="postThreadItem-"]:hover [data-testid="bookmarkCount-expanded"] {
            opacity: 1 !important;
        }

        /* 3. 検索ページおよびアカウント内検索ページのポストホバー時 */
        [data-testid="searchScreen"] div[role="link"]:hover [data-testid="replyBtn"] div,
        [data-testid="searchScreen"] div[role="link"]:hover [data-testid="repostCount"],
        [data-testid="searchScreen"] div[role="link"]:hover [data-testid="likeCount"],
        [data-testid="searchPostsScreen"] div[role="link"]:hover [data-testid="replyBtn"] div,
        [data-testid="searchPostsScreen"] div[role="link"]:hover [data-testid="repostCount"],
        [data-testid="searchPostsScreen"] div[role="link"]:hover [data-testid="likeCount"] {
            opacity: 1 !important;
        }
    `;

    const style = document.createElement('style');
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
    (document.head || document.documentElement).appendChild(style);
})();
