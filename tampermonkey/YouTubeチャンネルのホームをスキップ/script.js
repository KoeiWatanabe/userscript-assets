// ==UserScript==
// @name         YouTubeチャンネルのホームをスキップ
// @namespace    http://tampermonkey.net/
// @version      2.0
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

    const MAX_RACE_ROUNDS = 15; // 最大15ラウンド（15×30=450件まで比較）

    // チャンネルURLのパターン: /@handle, /channel/ID, /c/name
    const channelPattern = /^\/(@[^/]+|channel\/[^/]+|c\/[^/]+)\/?$/;

    // ---- ユーティリティ ----

    function getChannelBase(pathname) {
        const m = pathname.match(channelPattern);
        return m ? '/' + m[1] : null;
    }

    function getActivePageElement() {
        return document.querySelector('ytd-page-manager > :not([hidden])');
    }

    function getActiveWatchFlexy() {
        const activePage = getActivePageElement();
        return activePage?.tagName === 'YTD-WATCH-FLEXY' ? activePage : null;
    }

    // 現在アクティブな watch ページがライブ配信・アーカイブか
    function isWatchingStream() {
        const watchFlexy = getActiveWatchFlexy();
        if (!watchFlexy) return false;

        if (watchFlexy.querySelector('.ytp-live-badge')?.offsetParent) return true;
        if (watchFlexy.querySelector('ytd-live-chat-frame')) return true;
        try {
            if (watchFlexy.playerData?.videoDetails?.isLiveContent) return true;
        } catch {}
        return false;
    }

    // ---- InnerTube API ----

    // HTMLから INNERTUBE_API_KEY と INNERTUBE_CLIENT_VERSION を抽出
    function extractApiInfo(html) {
        const apiKey = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) ?? [])[1] ?? '';
        const clientVersion = (html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) ?? [])[1] ?? '2.20260401.08.00';
        return { apiKey, clientVersion };
    }

    // continuation token を使って次ページを取得
    async function fetchContinuation(token, apiKey, clientVersion) {
        try {
            const resp = await fetch(`/youtubei/v1/browse?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context: { client: { clientName: 'WEB', clientVersion } },
                    continuation: token,
                }),
                credentials: 'include',
            });
            if (!resp.ok) return { count: 0, token: null };
            const data = await resp.json();
            const items = data?.onResponseReceivedActions?.[0]
                ?.appendContinuationItemsAction?.continuationItems ?? [];
            const count = items.filter(c => c.richItemRenderer).length;
            const nextToken = items.find(c => c.continuationItemRenderer)
                ?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ?? null;
            return { count, token: nextToken };
        } catch {
            return { count: 0, token: null };
        }
    }

    // ---- タブ初期ページの取得 ----

    // 指定URLをfetchし、選択タブのアイテム数・continuation token・API情報を返す
    async function fetchTabFirstPage(url) {
        try {
            const resp = await fetch(url, { credentials: 'include' });
            if (!resp.ok) return null;
            const html = await resp.text();
            const m = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s);
            if (!m) return null;
            const data = JSON.parse(m[1]);
            const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];
            const selected = tabs.find(t => t.tabRenderer?.selected);
            const contents = selected?.tabRenderer?.content?.richGridRenderer?.contents ?? [];
            const count = contents.filter(c => c.richItemRenderer).length;
            const token = contents.find(c => c.continuationItemRenderer)
                ?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ?? null;
            return { count, token, apiInfo: extractApiInfo(html) };
        } catch {
            return null;
        }
    }

    // ---- 競争方式の件数比較 ----

    // /videos と /streams を並行取得し、どちらが多いかを競争形式で決定する。
    // 片方のページが尽きた時点でもう片方の勝ちとして打ち切る（最大 MAX_RACE_ROUNDS ラウンド）。
    async function decideSuffix(channelBase) {
        const base = location.origin + channelBase;

        // ページ1を並行取得
        const [videosPage, streamsPage] = await Promise.all([
            fetchTabFirstPage(base + '/videos'),
            fetchTabFirstPage(base + '/streams'),
        ]);

        // 配信タブが存在しない（取得失敗 or 0件 & token無し）→ 動画へ
        if (!streamsPage || (streamsPage.count === 0 && !streamsPage.token)) return '/videos';
        // 動画タブが存在しない → 配信へ
        if (!videosPage || (videosPage.count === 0 && !videosPage.token)) return '/streams';

        let vCount = videosPage.count;
        let sCount = streamsPage.count;
        let vToken = videosPage.token;
        let sToken = streamsPage.token;

        // API情報は動画ページから取得
        const { apiKey, clientVersion } = videosPage.apiInfo;

        // ページ1の時点でどちらかが終了している場合
        if (!vToken && !sToken) return sCount > vCount ? '/streams' : '/videos';
        if (!vToken) return '/streams'; // 動画が先に尽きた → 配信の方が多い
        if (!sToken) return '/videos';  // 配信が先に尽きた → 動画の方が多い

        // 競争: 両方に continuation がある間、並行で次ページを取得
        for (let round = 0; round < MAX_RACE_ROUNDS; round++) {
            const [vNext, sNext] = await Promise.all([
                fetchContinuation(vToken, apiKey, clientVersion),
                fetchContinuation(sToken, apiKey, clientVersion),
            ]);

            vCount += vNext.count;
            sCount += sNext.count;
            vToken = vNext.token;
            sToken = sNext.token;

            // どちらかが尽きた
            if (!vToken && !sToken) return sCount > vCount ? '/streams' : '/videos';
            if (!vToken) return '/streams';
            if (!sToken) return '/videos';
        }

        // MAX_RACE_ROUNDS 消化: それでも両方 450件超なら動画をデフォルト
        return '/videos';
    }

    // ---- 重複フェッチ防止（キャッシュなし版） ----

    const inflight = new Map(); // 進行中の decideSuffix を共有

    function warmDecision(channelBase) {
        if (inflight.has(channelBase)) return inflight.get(channelBase);

        const p = decideSuffix(channelBase)
            .then((suffix) => {
                inflight.delete(channelBase);
                return suffix;
            })
            .catch((err) => {
                inflight.delete(channelBase);
                throw err;
            });

        inflight.set(channelBase, p);
        return p;
    }

    // ---- リダイレクト処理 ----

    let pendingChannelBase = null;

    // yt-navigate-start 時点（DOM がまだ旧ページ状態）で保存する遷移元情報
    let prevWasWatch = false;  // 動画ページからの遷移か
    let prevWasStream = false; // その動画がライブ/アーカイブだったか

    async function handleChannelNavigation(currentPathname) {
        const channelBase = getChannelBase(currentPathname);
        if (!channelBase) return;
        if (pendingChannelBase === channelBase) return; // 既に処理中

        pendingChannelBase = channelBase;

        // 今回の判断に使う遷移元情報を取り出し、次の遷移に備えてリセット
        const fromWatch = prevWasWatch;
        const fromStream = prevWasStream;
        prevWasWatch = false;
        prevWasStream = false;

        // 判定中はホームを見せないようにする
        document.documentElement.style.visibility = 'hidden';

        try {
            let suffix;

            if (fromWatch) {
                // 動画ページからの遷移: 視聴コンテンツに基づいて即決（API不要）
                suffix = fromStream ? '/streams' : '/videos';
            } else {
                suffix = await warmDecision(channelBase);
            }

            // 非同期待機中にページが変わっていたら中止
            if (location.pathname !== currentPathname) return;

            window.location.replace(location.origin + channelBase + suffix + location.search);
        } catch {
            // エラー時はホームをそのまま表示
            document.documentElement.style.visibility = '';
        } finally {
            pendingChannelBase = null;
        }
    }

    // ---- 初回ロード時 ----

    if (channelPattern.test(location.pathname)) {
        handleChannelNavigation(location.pathname);
    }

    // ---- SPA ナビゲーション監視 ----

    // navigate-start: DOMはまだ旧ページ状態なので、動画ページだったかを保存する
    window.addEventListener('yt-navigate-start', () => {
        const watchFlexy = getActiveWatchFlexy();
        prevWasWatch = !!watchFlexy;
        prevWasStream = prevWasWatch && isWatchingStream();
    });

    window.addEventListener('yt-navigate-finish', () => {
        if (channelPattern.test(location.pathname)) {
            handleChannelNavigation(location.pathname);
        }
    });

    // ---- ホームフィードのライブアバター（LIVEリング）クリックのインターセプト ----

    document.addEventListener('click', async (e) => {
        const liveRing = e.target.closest('.yt-spec-avatar-shape--live-ring');
        if (!liveRing) return;

        const container = liveRing.closest(
            'yt-lockup-view-model, ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer'
        );
        if (!container) return;

        const channelLink = container.querySelector('a[href^="/@"], a[href^="/channel/"], a[href^="/c/"]');
        if (!channelLink) return;

        const href = channelLink.getAttribute('href');
        const m = href.match(channelPattern);
        if (!m) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const channelBase = '/' + m[1];
        const suffix = await warmDecision(channelBase);
        window.location.href = location.origin + channelBase + suffix;
    }, true);

})();
