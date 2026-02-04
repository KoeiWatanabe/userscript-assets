// ==UserScript==
// @name         YT高評価数を非表示に
// @namespace    https://example.com/
// @version      3.0.1
// @description  YouTubeの高評価数だけ非表示（アイコンは残す・監視を#actionsに限定して軽量化）
// @match        https://www.youtube.com/*
// @run-at       document-end
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YT高評価数を非表示に/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YT高評価数を非表示に/script.js
// @icon         https://lh3.googleusercontent.com/Rzh9eUOk4CP3W-GO1IIFlH8btzW6YuubQQbNDZYRVgYGRsz1Dr-TdZI75kBkt2mVaOtAsHvMG4Et_ErwxMwLaiMs72E=s120
// ==/UserScript==

(function() {
    'use strict';

    console.log("Like Count Hover Script V2: Loaded"); // 動作確認用ログ

    // 複数のレイアウトパターンに対応するセレクタを定義
    // 1. ytd-segmented-... : 従来の一般的なレイアウト
    // 2. like-button-view-model : 最近増えている新しいレイアウト
    // 3. .yt-spec-button-shape-next--icon-leading-trailing : 一部の環境での特定のボタン形状

    const targetSelectors = [
        'ytd-segmented-like-dislike-button-renderer .yt-spec-button-shape-next__button-text-content',
        'like-button-view-model .yt-spec-button-shape-next__button-text-content',
        'like-button-view-model .yt-core-attributed-string'
    ];

    // CSSを作成
    // ※ !important をつけて、YouTubeの標準スタイルを強制的に上書きします
    const css = `
        /* --- 通常時：数字を隠す --- */
        ${targetSelectors.join(', ')} {
            max-width: 0px !important;
            opacity: 0 !important;
            overflow: hidden !important;
            margin-left: 0px !important;
            padding-left: 0px !important; /* パディングが残る場合があるので消す */
            transition: all 0.3s ease !important;
            display: inline-block !important; /* アニメーションのためにblock要素化 */
            vertical-align: middle !important;
        }

        /* --- ホバー時：数字を表示 --- */
        /* 親要素(ボタン全体)にマウスが乗ったときの挙動 */
        ytd-segmented-like-dislike-button-renderer:hover .yt-spec-button-shape-next__button-text-content,
        like-button-view-model:hover .yt-spec-button-shape-next__button-text-content,
        like-button-view-model:hover .yt-core-attributed-string {
            max-width: 100px !important; /* 十分な幅を確保 */
            opacity: 1 !important;
            margin-left: 6px !important;
        }
    `;

    GM_addStyle(css);
})();
