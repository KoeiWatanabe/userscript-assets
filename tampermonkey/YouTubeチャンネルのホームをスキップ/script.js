// ==UserScript==
// @name         YouTubeチャンネルのホームをスキップ
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  YouTubeチャンネルページを自動的に/videosへリダイレクト。配信・アーカイブ視聴中は/streamsへ。
// @match        https://www.youtube.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeチャンネルのホームをスキップ/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeチャンネルのホームをスキップ/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeチャンネルのホームをスキップ/icon_128.png
// ==/UserScript==

(function () {
    'use strict';

    // チャンネルURLのパターン: /@handle, /channel/ID, /c/name
    const channelPattern = /^\/(@[^/]+|channel\/[^/]+|c\/[^/]+)\/?$/;

    // 現在視聴中の動画が配信（ライブ or アーカイブ）かどうかを判定
    function isWatchingLiveOrStream() {
        // 動画ページでなければfalse
        if (!location.pathname.startsWith('/watch')) return false;
        // ライブ配信中のバッジ
        const liveBadge = document.querySelector('.ytp-live-badge');
        if (liveBadge && liveBadge.offsetParent !== null) return true;
        // ライブチャット or チャットリプレイの存在
        if (document.querySelector('ytd-live-chat-frame')) return true;
        // ytInitialPlayerResponse から判定
        try {
            const flexy = document.querySelector('ytd-watch-flexy');
            if (flexy?.playerData?.videoDetails?.isLiveContent) return true;
        } catch (_) {}
        return false;
    }

    function shouldRedirect(pathname) {
        return channelPattern.test(pathname);
    }

    function getRedirectPath(pathname) {
        const match = pathname.match(channelPattern);
        if (!match) return null;
        const base = '/' + match[1];
        const suffix = isWatchingLiveOrStream() ? '/streams' : '/videos';
        return base + suffix;
    }

    // ページ遷移時のリダイレクト（初回読み込み・SPAナビゲーション両対応）
    function checkAndRedirect() {
        const path = location.pathname;
        if (shouldRedirect(path)) {
            const newPath = getRedirectPath(path);
            if (newPath) {
                window.location.replace(location.origin + newPath + location.search);
            }
        }
    }

    // 初回読み込み
    checkAndRedirect();

    // YouTubeはSPAなので、URLの変化を監視
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            checkAndRedirect();
        }
    });
    observer.observe(document, { subtree: true, childList: true });

    // リンククリックのインターセプト（Alt+クリック対応）
    document.addEventListener('click', (e) => {
        const anchor = e.target.closest('a');
        if (!anchor) return;

        try {
            const url = new URL(anchor.href, location.origin);
            if (url.origin !== location.origin) return;
            if (!shouldRedirect(url.pathname)) return;

            const suffix = isWatchingLiveOrStream() ? '/streams' : '/videos';
            const match = url.pathname.match(channelPattern);
            const newUrl = url.origin + '/' + match[1] + suffix + url.search;

            // Ctrl+クリック / 中クリック: リンク先を書き換えてブラウザに任せる（新しいタブで開く）
            if (e.ctrlKey || e.metaKey || e.button === 1) {
                anchor.href = newUrl;
                return; // デフォルト動作に任せる
            }

            e.preventDefault();
            e.stopPropagation();
            window.location.href = newUrl;
        } catch (_) {
            // invalid URL, ignore
        }
    }, true);
})();
