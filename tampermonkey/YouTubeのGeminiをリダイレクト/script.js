// ==UserScript==
// @name         YouTubeのGeminiをリダイレクト
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  YouTubeのAskボタン（動画下／概要欄内）を横取りし、Geminiを新規タブで開いて動画URL+改行2回を入力欄に投入する（送信はしない）
// @author       You
// @match        https://www.youtube.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeのGeminiをリダイレクト/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeのGeminiをリダイレクト/script.js
// ==/UserScript==

(function () {
    'use strict';

    // 動画下「Ask」/ 概要欄内「Ask questions」共通のホスト要素クラス
    const ASK_BUTTON_SELECTOR = 'button-view-model.you-chat-entrypoint-button';
    const GEMINI_URL = 'https://gemini.google.com/app';

    function getCleanVideoUrl() {
        const u = new URL(window.location.href);
        // /watch?v=ID は &t= などを除去して正規化、/shorts/ や /live/ はそのまま origin+pathname
        if (u.pathname === '/watch') {
            const v = u.searchParams.get('v');
            if (v) return `${u.origin}/watch?v=${v}`;
        }
        return `${u.origin}${u.pathname}`;
    }

    function openGeminiWithUrl() {
        const videoUrl = getCleanVideoUrl();
        const target = new URL(GEMINI_URL);
        // URL + 改行2回（空行を1つ挟んで3行目にカーソル）。submit=0 で送信抑止（連携先: Geminiに自動送信する v2.2.0+）
        target.searchParams.set('q', `${videoUrl}\n\n`);
        target.searchParams.set('submit', '0');
        window.open(target.toString(), '_blank');
    }

    // capture phase で YouTube 側の React ハンドラより先に捕捉する
    document.addEventListener('click', (e) => {
        const t = e.target;
        if (!t || typeof t.closest !== 'function') return;
        const btn = t.closest(ASK_BUTTON_SELECTOR);
        if (!btn) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        openGeminiWithUrl();
    }, true);
})();
