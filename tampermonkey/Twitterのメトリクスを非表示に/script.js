// ==UserScript==
// @name         Twitterのメトリクスを非表示に
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  普段は数字を隠し、ポストにホバーした時だけ表示する（アクション後も対応）
// @author       Gemini & Claude
// @match        https://x.com/*
// @match        https://twitter.com/*
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Twitterのメトリクスを非表示に/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Twitterのメトリクスを非表示に/script.js
// @icon         https://lh3.googleusercontent.com/1GU703pTRO0zps9AmDtoYtUlyDTeo_Cjj2mVzevaSHu-IIfOsiPXjMy5BLQdjt_SlSZCNDM3izGKGeEBDWsRbrizyg=s120
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // CSSの定義
    // opacity: 0 (透明) に設定し、マウスが乗ったときだけ 1 (不透明) にする
    // transition: 0.2s でフワッと表示させる
    const css = `
        /* --- 定義開始 --- */

        /* 1. 隠したい要素の指定 */
        /* いいね、リツイート、返信、ブックマークなどのボタン内の「数字コンテナ」を対象にする */
        /* アクション前後の両方の状態に対応 */
        article [data-testid="reply"] [data-testid="app-text-transition-container"],
        article [data-testid="retweet"] [data-testid="app-text-transition-container"],
        article [data-testid="unretweet"] [data-testid="app-text-transition-container"],
        article [data-testid="like"] [data-testid="app-text-transition-container"],
        article [data-testid="unlike"] [data-testid="app-text-transition-container"],
        article [data-testid="bookmark"] [data-testid="app-text-transition-container"],
        article [data-testid="removeBookmark"] [data-testid="app-text-transition-container"],
        article [href*="/analytics"] [data-testid="app-text-transition-container"], /* 表示回数(リンクの場合) */
        article [data-testid="analyticsButton"] [data-testid="app-text-transition-container"] /* 表示回数(ボタンの場合) */
        {
            opacity: 0;
            transition: opacity 0.2s ease-in-out;
            visibility: hidden; /* スクリーンリーダー対策＆誤クリック防止のため完全に隠す */
        }

        /* 2. ホバー時の動作 */
        /* ポスト全体(article)にマウスが乗った時、上記の要素を表示する */
        article:hover [data-testid="reply"] [data-testid="app-text-transition-container"],
        article:hover [data-testid="retweet"] [data-testid="app-text-transition-container"],
        article:hover [data-testid="unretweet"] [data-testid="app-text-transition-container"],
        article:hover [data-testid="like"] [data-testid="app-text-transition-container"],
        article:hover [data-testid="unlike"] [data-testid="app-text-transition-container"],
        article:hover [data-testid="bookmark"] [data-testid="app-text-transition-container"],
        article:hover [data-testid="removeBookmark"] [data-testid="app-text-transition-container"],
        article:hover [href*="/analytics"] [data-testid="app-text-transition-container"],
        article:hover [data-testid="analyticsButton"] [data-testid="app-text-transition-container"]
        {
            opacity: 1;
            visibility: visible;
        }

        /* --- 定義終了 --- */
    `;

    // CSSをページに注入
    GM_addStyle(css);

})();