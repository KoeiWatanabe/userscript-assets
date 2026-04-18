// ==UserScript==
// @name         YouTubeチャンネルのホームをスキップ (shorts対応版・お試し)
// @namespace    http://tampermonkey.net/
// @version      3.4
// @description  YouTubeチャンネルページを自動的に/videos・/streams・/shortsのいずれかへリダイレクト。動画視聴中の投稿主/コラボレーター遷移は動画タイプに合わせ、その他は件数比較で決定。
// @match        https://www.youtube.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeチャンネルのホームをスキップ/script-shorts.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeチャンネルのホームをスキップ/script-shorts.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeチャンネルのホームをスキップ/icon_128.png
// ==/UserScript==

(function () {
    'use strict';

    const MAX_RACE_ROUNDS = 15;

    const channelPattern = /^\/(@[^/]+|channel\/[^/]+|c\/[^/]+)\/?$/;

    // ---- ユーティリティ ----

    function getChannelBase(pathname) {
        const m = pathname.match(channelPattern);
        return m ? '/' + m[1] : null;
    }

    function isWatchingStream() {
        const liveBadge = document.querySelector('.ytp-live-badge');
        if (liveBadge && liveBadge.offsetParent !== null) return true;
        const dateText = document.querySelector('#info-strings yt-formatted-string')?.textContent ?? '';
        if (/streamed|配信済み/i.test(dateText)) return true;
        return false;
    }

    // ---- InnerTube API ----

    function extractApiInfo(html) {
        const apiKey = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) ?? [])[1] ?? '';
        const clientVersion = (html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) ?? [])[1] ?? '2.20260401.08.00';
        return { apiKey, clientVersion };
    }

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
    // videos / streams / shorts の3候補で件数競争を行う。
    // 各ラウンドで「まだ継続トークンを持っている候補 = 今後もさらに増える候補」とみなし、
    // トークンを持つ候補が1つだけになったらそれを優勝とする。全員トークンが尽きたら最大件数で決定。

    function pickMaxCount(candidates) {
        // 同数の場合は candidates の順序（videos > streams > shorts）を優先。
        return candidates.reduce((a, b) => b.count > a.count ? b : a).suffix;
    }

    async function decideSuffix(channelBase) {
        const base = location.origin + channelBase;

        const [videosPage, streamsPage, shortsPage] = await Promise.all([
            fetchTabFirstPage(base + '/videos'),
            fetchTabFirstPage(base + '/streams'),
            fetchTabFirstPage(base + '/shorts'),
        ]);

        const rawCandidates = [
            { suffix: '/videos',  page: videosPage  },
            { suffix: '/streams', page: streamsPage },
            { suffix: '/shorts',  page: shortsPage  },
        ];

        // 空 or 失敗した候補は除外（件数0かつ継続トークンなし = 実質的に存在しない／空タブ）
        const candidates = rawCandidates
            .filter(({ page }) => page && (page.count > 0 || page.token))
            .map(({ suffix, page }) => ({
                suffix,
                count: page.count,
                token: page.token,
                apiInfo: page.apiInfo,
            }));

        if (candidates.length === 0) return '/videos';
        if (candidates.length === 1) return candidates[0].suffix;

        const { apiKey, clientVersion } = candidates[0].apiInfo;

        // 1回目のレース前の早期判定
        const activeInit = candidates.filter(c => c.token);
        if (activeInit.length === 0) return pickMaxCount(candidates);
        if (activeInit.length === 1) return activeInit[0].suffix;

        for (let round = 0; round < MAX_RACE_ROUNDS; round++) {
            const active = candidates.filter(c => c.token);
            const results = await Promise.all(
                active.map(c => fetchContinuation(c.token, apiKey, clientVersion))
            );
            active.forEach((c, i) => {
                c.count += results[i].count;
                c.token = results[i].token;
            });

            const stillActive = candidates.filter(c => c.token);
            if (stillActive.length === 0) return pickMaxCount(candidates);
            if (stillActive.length === 1) return stillActive[0].suffix;
        }

        // 最大ラウンドに到達した場合は現時点の件数で決定
        return pickMaxCount(candidates);
    }

    // ---- 重複フェッチ防止 ----

    const inflight = new Map();

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
    let fromWatchStreamState = null;

    window.addEventListener('yt-navigate-start', () => {
        fromWatchStreamState = location.pathname.startsWith('/watch')
            ? isWatchingStream()
            : null;
    });

    async function handleChannelNavigation(currentPathname) {
        const channelBase = getChannelBase(currentPathname);
        if (!channelBase) return;
        if (pendingChannelBase === channelBase) return;

        pendingChannelBase = channelBase;
        document.documentElement.style.visibility = 'hidden';

        try {
            // yt-navigate-start で保存した状態があればそちらを優先（@handleなしチャンネルのフォールバック）
            // なければ競争ロジックで決定
            const watchStream = fromWatchStreamState;
            fromWatchStreamState = null;
            const suffix = (watchStream !== null)
                ? (watchStream ? '/streams' : '/videos')
                : await warmDecision(channelBase);

            if (location.pathname !== currentPathname) return;

            window.location.replace(location.origin + channelBase + suffix + location.search);
        } catch {
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
        } else {
            // チャンネルホーム以外に着地した場合、fromWatchStreamState は用済みなのでクリア。
            // （例: /watch → popup → /@channelA/videos と直接遷移した際に
            //   yt-navigate-start が false をセットするが、handleChannelNavigation が
            //   呼ばれないため残留し、次の遷移で誤って使われるのを防ぐ）
            fromWatchStreamState = null;
        }
    });

    // ---- ホームフィードのライブアバタークリック ----

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


    // ---- 【修正版】リンククリックのインターセプト ----

    document.addEventListener('click', async (e) => {
        // 1. 動画ページ（/watch）限定の処理
        if (location.pathname.startsWith('/watch')) {

            // A. ポップアップ内アイテムの検知（ユーザー提案のロジックを改良）
            // ターゲット: チャンネルアイコンクリック時に出るポップアップリスト
            const popupItem = e.target.closest('yt-list-item-view-model');
            if (popupItem && popupItem.closest('yt-dialog-view-model')) {
                // チャンネル特定処理
                let channelBase = null;

                // 方法1: 中に<a>タグが隠れていないか探す（最優先・確実）
                const hiddenLink = popupItem.querySelector('a[href^="/@"], a[href^="/channel/"], a[href^="/c/"]');
                if (hiddenLink) {
                    channelBase = getChannelBase(hiddenLink.getAttribute('href'));
                }
                // 方法2: <a>タグがない場合、字幕テキストから@ハンドルを抽出（ユーザー提案のフォールバック）
                else {
                    const subtitle = popupItem.querySelector('.yt-list-item-view-model__subtitle');
                    // @handle 形式を抽出
                    const handle = subtitle?.textContent?.match(/@[\w.-]+/)?.[0];
                    if (handle) {
                        channelBase = '/' + handle;
                    }
                }

                // チャンネルが特定できればリダイレクト
                if (channelBase) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    // 【重要】投稿主・コラボレーターなので「動画判定ロジック」を使う
                    const suffix = isWatchingStream() ? '/streams' : '/videos';

                    const newUrl = location.origin + channelBase + suffix;
                    if (e.ctrlKey || e.metaKey || e.button === 1) {
                        window.open(newUrl, '_blank');
                    } else {
                        window.location.href = newUrl;
                    }
                    return; // 処理終了
                }
            }

            // B. 通常のリンククリック（投稿主エリアなど）
            const anchor = e.target.closest('a');
            if (anchor) {
                try {
                    const url = new URL(anchor.href, location.origin);
                    if (url.origin !== location.origin) return;

                    const m = url.pathname.match(channelPattern);
                    if (!m) return;

                    const clickedChannelBase = '/' + m[1];

                    // 投稿主エリア（動画下のチャンネル名/アイコン）からのクリックか判定
                    const isOwnerArea = anchor.closest('#owner, ytd-video-owner-renderer, #upload-info');

                    if (isOwnerArea) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();

                        // 【重要】投稿主なので「動画判定ロジック」を使う
                        const suffix = isWatchingStream() ? '/streams' : '/videos';
                        const newUrl = url.origin + clickedChannelBase + suffix + url.search;

                        if (e.ctrlKey || e.metaKey || e.button === 1) {
                            window.open(newUrl, '_blank');
                        } else {
                            window.location.href = newUrl;
                        }
                        return;
                    }

                    // C. /watchページ内だが、関係ないチャンネルリンク（コメント欄、サイドバーなど）
                    // -> 処理がここに来た = isOwnerAreaではない

                    // 【重要】関係ないチャンネルなので「競争ロジック」を使う
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    const openInNewTab = e.ctrlKey || e.metaKey || e.button === 1;
                    const suffix = await warmDecision(clickedChannelBase);
                    const newUrl = url.origin + clickedChannelBase + suffix + url.search;

                    if (openInNewTab) {
                        window.open(newUrl, '_blank');
                    } else {
                        window.location.href = newUrl;
                    }

                } catch (_) {}
            }

        } else {
            // 2. /watch 以外のページ（ホーム、トレンドなど）
            // すべてのチャンネルリンクで「競争ロジック」を使う

            const anchor = e.target.closest('a');
            if (!anchor) return;

            try {
                const url = new URL(anchor.href, location.origin);
                if (url.origin !== location.origin) return;

                const m = url.pathname.match(channelPattern);
                if (!m) return;

                const clickedChannelBase = '/' + m[1];

                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                const suffix = await warmDecision(clickedChannelBase);
                const newUrl = url.origin + clickedChannelBase + suffix + url.search;

                if (e.ctrlKey || e.metaKey || e.button === 1) {
                    window.open(newUrl, '_blank');
                } else {
                    window.location.href = newUrl;
                }

            } catch (_) {}
        }
    }, true);

})();
