// ==UserScript==
// @name         YouTubeチャンネルのホームをスキップ
// @namespace    http://tampermonkey.net/
// @version      3.6
// @description  YouTubeチャンネルページを自動的に/videos・/streams・/shortsのいずれかへリダイレクト。動画視聴中の投稿主/コラボレーター遷移は動画タイプに合わせ、その他は件数比較で決定。
// @match        https://www.youtube.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeチャンネルのホームをスキップ/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeチャンネルのホームをスキップ/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeチャンネルのホームをスキップ/icon_128.png
// ==/UserScript==

(function () {
    'use strict';

    const MAX_RACE_ROUNDS = 15;
    const CACHE_PREFIX = 'yt-channel-home-skip:3.6:';
    const channelPattern = /^\/(@[^/]+|channel\/[^/]+|c\/[^/]+)\/?$/;

    const TABS = [
        { suffix: '/videos',  params: 'EgZ2aWRlb3PyBgQKAjoA' },
        { suffix: '/streams', params: 'EgdzdHJlYW1z8gYECgJ6AA==' },
        { suffix: '/shorts',  params: 'EgZzaG9ydHPyBgUKA5oBAA==' },
    ];

    const TAB_PARAMS = Object.fromEntries(TABS.map(({ suffix, params }) => [suffix, params]));

    const RESOLVE_FIELD_MASK = 'endpoint.browseEndpoint.browseId';
    const FIRST_PAGE_FIELD_MASK = [
        'contents.twoColumnBrowseResultsRenderer.tabs.tabRenderer.selected',
        'contents.twoColumnBrowseResultsRenderer.tabs.tabRenderer.content.richGridRenderer.contents.richItemRenderer.trackingParams',
        'contents.twoColumnBrowseResultsRenderer.tabs.tabRenderer.content.richGridRenderer.contents.continuationItemRenderer.continuationEndpoint.continuationCommand.token',
    ].join(',');
    const CONTINUATION_FIELD_MASK = [
        'onResponseReceivedActions.appendContinuationItemsAction.continuationItems.richItemRenderer.trackingParams',
        'onResponseReceivedActions.appendContinuationItemsAction.continuationItems.continuationItemRenderer.continuationEndpoint.continuationCommand.token',
    ].join(',');

    let apiConfigPromise = null;
    let activeDecision = null;
    let pendingNavigation = null;
    let navigationSerial = 0;

    function getChannelBase(pathname) {
        const match = pathname.match(channelPattern);
        return match ? '/' + match[1] : null;
    }

    function getBrowseIdFromPath(channelBase) {
        return channelBase.startsWith('/channel/') ? channelBase.slice(9) : null;
    }

    function isAbortError(error) {
        return error instanceof DOMException && error.name === 'AbortError';
    }

    function isWatchingStream() {
        try {
            return document.getElementById('movie_player')
                ?.getPlayerResponse()
                ?.videoDetails
                ?.isLiveContent === true;
        } catch {
            return false;
        }
    }

    async function getApiConfig() {
        if (!apiConfigPromise) {
            apiConfigPromise = (async () => {
                if (!globalThis.ytcfg?.get) {
                    await customElements.whenDefined('ytd-app');
                }

                const apiKey = globalThis.ytcfg?.get('INNERTUBE_API_KEY');
                const clientVersion = globalThis.ytcfg?.get('INNERTUBE_CLIENT_VERSION');
                if (!apiKey || !clientVersion) throw new Error('InnerTube config is unavailable');

                return {
                    apiKey,
                    context: { client: { clientName: 'WEB', clientVersion } },
                };
            })();
        }

        return apiConfigPromise;
    }

    async function postInnerTube(endpoint, payload, fieldMask, signal) {
        const { apiKey, context } = await getApiConfig();
        const response = await fetch(
            '/youtubei/v1/' + endpoint + '?key=' + encodeURIComponent(apiKey) + '&prettyPrint=false',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-FieldMask': fieldMask,
                },
                body: JSON.stringify({ context, ...payload }),
                credentials: 'include',
                signal,
            }
        );

        if (!response.ok) {
            throw new Error('InnerTube ' + endpoint + ' failed: ' + response.status);
        }
        return response.json();
    }

    async function resolveBrowseId(channelBase, signal) {
        const directId = getBrowseIdFromPath(channelBase);
        if (directId) return directId;

        const data = await postInnerTube(
            'navigation/resolve_url',
            { url: location.origin + channelBase },
            RESOLVE_FIELD_MASK,
            signal
        );
        const browseId = data?.endpoint?.browseEndpoint?.browseId;
        if (!browseId) throw new Error('Channel browseId was not resolved');
        return browseId;
    }

    function countItems(items) {
        let count = 0;
        let token = null;

        for (const item of items) {
            if (item.richItemRenderer) {
                count++;
            } else if (item.continuationItemRenderer) {
                token = item.continuationItemRenderer
                    ?.continuationEndpoint
                    ?.continuationCommand
                    ?.token ?? null;
            }
        }

        return { count, token };
    }

    async function fetchFirstPage(browseId, candidate, signal) {
        const data = await postInnerTube(
            'browse',
            { browseId, params: candidate.params },
            FIRST_PAGE_FIELD_MASK,
            signal
        );
        const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs;
        if (!Array.isArray(tabs)) throw new Error('Channel tabs were not returned');

        const selected = tabs.find(tab => tab.tabRenderer?.selected)?.tabRenderer;
        if (!selected) throw new Error('Selected channel tab was not returned');

        const items = selected.content?.richGridRenderer?.contents;
        const page = Array.isArray(items) ? countItems(items) : { count: 0, token: null };
        return { ...candidate, ...page };
    }

    async function fetchContinuation(token, signal) {
        const data = await postInnerTube(
            'browse',
            { continuation: token },
            CONTINUATION_FIELD_MASK,
            signal
        );
        const items = data?.onResponseReceivedActions?.[0]
            ?.appendContinuationItemsAction
            ?.continuationItems;
        if (!Array.isArray(items)) throw new Error('Continuation items were not returned');
        return countItems(items);
    }

    function pickMaxCount(candidates) {
        return candidates.reduce((best, candidate) =>
            candidate.count > best.count ? candidate : best
        ).suffix;
    }

    async function decideTarget(channelBase, signal) {
        let browseId = getBrowseIdFromPath(channelBase);

        try {
            browseId ||= await resolveBrowseId(channelBase, signal);

            const pages = await Promise.all(
                TABS.map(candidate => fetchFirstPage(browseId, candidate, signal))
            );
            const candidates = pages.filter(page => page.count > 0 || page.token);

            if (candidates.length === 0) {
                return { browseId, suffix: '/videos', cacheable: true };
            }
            if (candidates.length === 1) {
                return { browseId, suffix: candidates[0].suffix, cacheable: true };
            }

            let active = candidates.filter(candidate => candidate.token);
            if (active.length === 0) {
                return { browseId, suffix: pickMaxCount(candidates), cacheable: true };
            }
            if (active.length === 1) {
                return { browseId, suffix: active[0].suffix, cacheable: true };
            }

            for (let round = 0; round < MAX_RACE_ROUNDS; round++) {
                const results = await Promise.all(
                    active.map(candidate => fetchContinuation(candidate.token, signal))
                );

                for (let index = 0; index < active.length; index++) {
                    active[index].count += results[index].count;
                    active[index].token = results[index].token;
                }

                active = candidates.filter(candidate => candidate.token);
                if (active.length === 0) {
                    return { browseId, suffix: pickMaxCount(candidates), cacheable: true };
                }
                if (active.length === 1) {
                    return { browseId, suffix: active[0].suffix, cacheable: true };
                }
            }

            return { browseId, suffix: pickMaxCount(candidates), cacheable: true };
        } catch (error) {
            if (isAbortError(error)) throw error;
            return { browseId, suffix: '/videos', cacheable: false };
        }
    }

    function cacheKey(channelBase) {
        return CACHE_PREFIX + channelBase;
    }

    function readCachedTarget(channelBase) {
        try {
            const cached = JSON.parse(sessionStorage.getItem(cacheKey(channelBase)));
            if (
                typeof cached?.browseId === 'string' &&
                Object.hasOwn(TAB_PARAMS, cached?.suffix)
            ) {
                return cached;
            }
        } catch {}
        return null;
    }

    function writeCachedTarget(channelBase, target) {
        try {
            sessionStorage.setItem(
                cacheKey(channelBase),
                JSON.stringify({ browseId: target.browseId, suffix: target.suffix })
            );
        } catch {}
    }

    function cancelActiveDecisionExcept(channelBase) {
        if (activeDecision && activeDecision.channelBase !== channelBase) {
            activeDecision.controller.abort();
        }
    }

    function getDecision(channelBase) {
        cancelActiveDecisionExcept(channelBase);

        const cached = readCachedTarget(channelBase);
        if (cached) return Promise.resolve(cached);
        if (activeDecision?.channelBase === channelBase) return activeDecision.promise;

        const controller = new AbortController();
        const entry = { channelBase, controller, promise: null };
        entry.promise = decideTarget(channelBase, controller.signal)
            .then(target => {
                if (target.cacheable) writeCachedTarget(channelBase, target);
                return { browseId: target.browseId, suffix: target.suffix };
            })
            .finally(() => {
                if (activeDecision === entry) activeDecision = null;
            });
        activeDecision = entry;
        return entry.promise;
    }

    async function getContextualTarget(channelBase, browseId) {
        const suffix = isWatchingStream() ? '/streams' : '/videos';
        if (browseId) return { browseId, suffix };

        try {
            return { browseId: await resolveBrowseId(channelBase), suffix };
        } catch {
            return { browseId: null, suffix };
        }
    }

    function buildTargetUrl(channelBase, suffix, search = '') {
        return location.origin + channelBase + suffix + search;
    }

    function navigateWithYouTube(channelBase, target, search = '') {
        const url = channelBase + target.suffix + search;
        const app = document.querySelector('ytd-app');

        if (!app || !target.browseId) {
            location.href = location.origin + url;
            return;
        }

        app.dispatchEvent(new CustomEvent('yt-navigate', {
            bubbles: true,
            composed: true,
            detail: {
                endpoint: {
                    commandMetadata: {
                        webCommandMetadata: {
                            url,
                            webPageType: 'WEB_PAGE_TYPE_CHANNEL',
                            rootVe: 3611,
                            apiUrl: '/youtubei/v1/browse',
                        },
                    },
                    browseEndpoint: {
                        browseId: target.browseId,
                        params: TAB_PARAMS[target.suffix],
                        canonicalBaseUrl: channelBase,
                    },
                },
            },
        }));
    }

    function getPopupChannel(target) {
        if (location.pathname !== '/watch') return null;

        const item = target.closest('yt-list-item-view-model');
        if (!item?.closest('yt-dialog-view-model')) return null;

        const command = item.data
            ?.rendererContext
            ?.commandContext
            ?.onTap
            ?.innertubeCommand;
        const path = command?.commandMetadata?.webCommandMetadata?.url;
        if (!path) return null;

        const url = new URL(path, location.origin);
        const channelBase = getChannelBase(url.pathname);
        if (!channelBase) return null;

        return {
            channelBase,
            browseId: command?.browseEndpoint?.browseId ?? getBrowseIdFromPath(channelBase),
            search: url.search,
            contextual: true,
        };
    }

    function getLiveAvatarChannel(target) {
        const ring = target.closest('.ytSpecAvatarShapeLiveRing');
        const container = ring?.closest('yt-lockup-view-model');
        const link = container?.querySelector(
            'a[href^="/@"], a[href^="/channel/"], a[href^="/c/"]'
        );
        if (!(link instanceof HTMLAnchorElement)) return null;

        const channelBase = getChannelBase(link.pathname);
        if (!channelBase) return null;

        return {
            channelBase,
            browseId: getBrowseIdFromPath(channelBase),
            search: link.search,
            contextual: false,
        };
    }

    function getAnchorChannel(target) {
        const anchor = target.closest('a[href]');
        if (!(anchor instanceof HTMLAnchorElement) || anchor.origin !== location.origin) return null;

        const channelBase = getChannelBase(anchor.pathname);
        if (!channelBase) return null;

        const owner = location.pathname === '/watch'
            ? anchor.closest('ytd-video-owner-renderer')
            : null;

        return {
            channelBase,
            browseId: owner?.data?.navigationEndpoint?.browseEndpoint?.browseId
                ?? getBrowseIdFromPath(channelBase),
            search: anchor.search,
            contextual: Boolean(owner),
        };
    }

    document.addEventListener('click', async event => {
        if (!(event.target instanceof Element)) return;

        const channel = getPopupChannel(event.target)
            ?? getLiveAvatarChannel(event.target)
            ?? getAnchorChannel(event.target);
        if (!channel) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const serial = ++navigationSerial;
        cancelActiveDecisionExcept(channel.channelBase);

        try {
            const target = channel.contextual
                ? await getContextualTarget(channel.channelBase, channel.browseId)
                : await getDecision(channel.channelBase);

            if (serial !== navigationSerial) return;

            const url = buildTargetUrl(channel.channelBase, target.suffix, channel.search);
            if (event.ctrlKey || event.metaKey || event.button === 1) {
                window.open(url, '_blank');
            } else {
                navigateWithYouTube(channel.channelBase, target, channel.search);
            }
        } catch (error) {
            if (!isAbortError(error) && serial === navigationSerial) {
                location.href = buildTargetUrl(channel.channelBase, '/videos', channel.search);
            }
        }
    }, true);

    async function handleChannelNavigation(pathname) {
        const channelBase = getChannelBase(pathname);
        if (!channelBase || pendingNavigation?.channelBase === channelBase) return;

        const token = { channelBase };
        const serial = ++navigationSerial;
        pendingNavigation = token;
        document.documentElement.style.visibility = 'hidden';

        try {
            const target = await getDecision(channelBase);
            if (serial !== navigationSerial || location.pathname !== pathname) return;

            location.replace(buildTargetUrl(channelBase, target.suffix, location.search));
        } catch (error) {
            if (!isAbortError(error) && location.pathname === pathname) {
                document.documentElement.style.visibility = '';
            }
        } finally {
            if (pendingNavigation === token) pendingNavigation = null;
        }
    }

    if (channelPattern.test(location.pathname)) {
        handleChannelNavigation(location.pathname);
    }

    window.addEventListener('yt-navigate-finish', () => {
        if (channelPattern.test(location.pathname)) {
            handleChannelNavigation(location.pathname);
        } else {
            document.documentElement.style.visibility = '';
        }
    });
})();
