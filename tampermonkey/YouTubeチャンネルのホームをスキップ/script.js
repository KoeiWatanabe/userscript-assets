// ==UserScript==
// @name         YouTubeチャンネルのホームをスキップ
// @namespace    http://tampermonkey.net/
// @version      2.4
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

    // 現在アクティブな watch ページがライブ配信・アーカイブか
    // DOM構造で判定: yt-video-type.user.js と同じアプローチ
    function isWatchingStream() {
        // 配信中: プレイヤーの LIVE バッジが可視
        const liveBadge = document.querySelector('.ytp-live-badge');
        if (liveBadge && liveBadge.offsetParent !== null) return true;

        // 配信アーカイブ: 日付テキストに "Streamed" または "配信済み" を含む
        const dateText = document.querySelector('#info-strings yt-formatted-string')?.textContent ?? '';
        if (/streamed|配信済み/i.test(dateText)) return true;

        return false;
    }

    // 現在視聴中の動画の投稿主チャンネルを取得
    function getCurrentVideoChannelBase() {
        // 動画ページからチャンネルリンクを取得
        const ownerLink = document.querySelector(
            '#owner-name a, ytd-video-owner-renderer a, #upload-info a[href^="/@"], #upload-info a[href^="/channel/"], #upload-info a[href^="/c/"]'
        );
        if (!ownerLink) return null;
        const href = ownerLink.getAttribute('href');
        const m = href.match(channelPattern);
        return m ? '/' + m[1] : null;
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

    async function handleChannelNavigation(currentPathname) {
        const channelBase = getChannelBase(currentPathname);
        if (!channelBase) return;
        if (pendingChannelBase === channelBase) return; // 既に処理中

        pendingChannelBase = channelBase;

        // 判定中はホームを見せないようにする
        document.documentElement.style.visibility = 'hidden';

        try {
            let suffix;

            suffix = await warmDecision(channelBase);

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

    // ---- リンククリックのインターセプト（動画ページからの遷移用） ----

    document.addEventListener('click', (e) => {
        const anchor = e.target.closest('a');
        if (!anchor) return;

        try {
            const url = new URL(anchor.href, location.origin);
            if (url.origin !== location.origin) return;

            const m = url.pathname.match(channelPattern);
            if (!m) return;

            const clickedChannelBase = '/' + m[1];

            // 動画ページ視聴中の場合
            if (location.pathname.startsWith('/watch')) {
                // 現在視聴中の動画の投稿主チャンネルを取得
                const currentVideoChannelBase = getCurrentVideoChannelBase();

                // 同一チャンネルの場合のみ、動画判別ロジックを使用
                if (currentVideoChannelBase && clickedChannelBase === currentVideoChannelBase) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    const suffix = isWatchingStream() ? '/streams' : '/videos';
                    const newUrl = url.origin + clickedChannelBase + suffix + url.search;

                    // Ctrl+クリック / 中クリック: 新しいタブで開く
                    if (e.ctrlKey || e.metaKey || e.button === 1) {
                        window.open(newUrl, '_blank');
                        return;
                    }

                    // 通常クリック
                    window.location.href = newUrl;
                    return;
                }

                // 別チャンネルの場合は、競争ロジックを使用（下に続く）
            }

            // 動画ページ以外、または別チャンネルへのクリックは競争ロジックを使用
            e.preventDefault();
            e.stopPropagation();
            warmDecision(clickedChannelBase).then(suffix => {
                 const newUrl = url.origin + clickedChannelBase + suffix + url.search;

                 // Ctrl+クリック / 中クリック: 新しいタブで開く
                 if (e.ctrlKey || e.metaKey || e.button === 1) {
                     window.open(newUrl, '_blank');
                     return;
                 }

                 window.location.href = newUrl;
            });

        } catch (_) {
            // invalid URL, ignore
        }
    }, true);

})();
