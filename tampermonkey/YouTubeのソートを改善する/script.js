// ==UserScript==
// @name         YouTubeのソートを改善する
// @namespace    https://tampermonkey.net/
// @version      1.1.7
// @description  チャンネル/サブスク/プレイリスト/検索結果に並べ替えチップと未視聴/視聴済み絞り込みを追加（Alt+U=未視聴 / Alt+W=視聴済み）。プレイリスト人気順は別言語fetchで同点を再判定し精度向上。
// @match        https://www.youtube.com/*
// @run-at       document-end
// @grant        none
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeのソートを改善する/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeのソートを改善する/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeのソートを改善する/icon_128.png
// ==/UserScript==

(() => {
  'use strict';
  if (window.top !== window.self) return;

  const STYLE_ID = 'tm-yt-improve-sort-style';
  const CHIP_BAR_ID = 'tm-yt-chip-bar';
  const STATUS_ID = 'tm-yt-status';
  const SORT_CONTAINER_ID = 'tm-yt-sort-results';
  const DUPLICATE_CLASS = 'tm-yt-duplicate';
  const FILTER_CLASS_PREFIX = 'tm-yt-filter-';

  const CHANNEL_FEED_RE = /^\/(?:@[^/]+|c\/[^/]+|channel\/[^/]+|user\/[^/]+)\/(?:videos|streams|shorts)\/?$/;
  const CHANNEL_SEARCH_RE = /^\/(?:@[^/]+|c\/[^/]+|channel\/[^/]+|user\/[^/]+)\/search\/?$/;

  const PROGRESS_SELECTORS = [
    'yt-thumbnail-overlay-progress-bar-view-model',
    'ytd-thumbnail-overlay-resume-playback-renderer',
    'ytm-shorts-lockup-view-model #progress',
    'ytm-shorts-lockup-view-model-v2 #progress',
  ];

  const HOST_SELECTORS = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-playlist-video-renderer',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
  ];

  const I18N = {
    en: {
      latest: 'Latest', popular: 'Popular', oldest: 'Oldest',
      unwatched: 'Unwatched', watched: 'Watched',
      hintLatest: 'Sort: Latest', hintPopular: 'Sort: Popular', hintOldest: 'Sort: Oldest',
      hintUnwatched: 'Show only unwatched (Alt+U)',
      hintWatched: 'Show only watched (Alt+W)',
      collecting: (n) => `Collecting results... ${n} found.`,
      collected: (n) => `Collected ${n} results.`,
      sorted: (n) => `Sorted ${n} collected results.`,
      showing: (n) => `Showing ${n} collected results.`,
      stopped: (n) => `Stopped after collecting ${n} results.`,
      refining: 'Refining ties using a finer-grained locale...',
    },
    ja: {
      latest: '新しい順', popular: '人気の動画', oldest: '古い順',
      unwatched: '未視聴', watched: '視聴済み',
      hintLatest: '新しい順で並び替え', hintPopular: '人気の動画で並び替え', hintOldest: '古い順で並び替え',
      hintUnwatched: '未視聴のみ表示 (Alt+U)',
      hintWatched: '視聴済みのみ表示 (Alt+W)',
      collecting: (n) => `結果を収集中... ${n} 件取得済み。`,
      collected: (n) => `${n} 件の結果を取得しました。`,
      sorted: (n) => `取得した ${n} 件を並べ替えました。`,
      showing: (n) => `取得した ${n} 件を表示中。`,
      stopped: (n) => `${n} 件取得した時点で停止しました。`,
      refining: '同点の動画を別言語の表記で再判定中...',
    },
  };

  const SORT_CHIPS = ['latest', 'popular', 'oldest'];
  const FILTER_CHIPS = ['unwatched', 'watched'];
  const SORT_FILTER_CHIPS = [...SORT_CHIPS, ...FILTER_CHIPS];
  const SORT_KEYS = new Set(SORT_CHIPS);
  const FILTER_KEYS = new Set(FILTER_CHIPS);

  function getLocale() {
    const lang = String(document.documentElement.lang || navigator.language || 'en').toLowerCase();
    return lang.startsWith('ja') ? 'ja' : 'en';
  }
  function t(key, ...args) {
    const dict = I18N[getLocale()] || I18N.en;
    const value = dict[key];
    return typeof value === 'function' ? value(...args) : value;
  }

  function mountInSortHeader(barEl) {
    const root = document.querySelector(this.rootSelector);
    if (!root) return false;
    const header = this.findHeader(root);
    if (!header) return false;
    header.appendChild(barEl);
    if (this.chipBarPaddingLeft) barEl.style.paddingLeft = `${this.chipBarPaddingLeft}px`;
    return true;
  }

  const PAGE_DEFS = [
    {
      key: 'subscriptions',
      matches: () => location.pathname === '/feed/subscriptions',
      chips: FILTER_CHIPS,
      sort: false,
      mountChips(barEl) {
        const subscribeButton = document.querySelector(
          'ytd-rich-grid-renderer ytd-shelf-renderer #title-container > #subscribe-button'
        );
        if (!subscribeButton) return false;
        subscribeButton.parentNode.insertBefore(barEl, subscribeButton);
        barEl.dataset.placement = 'subscribe-button-left';
        return true;
      },
    },
    {
      key: 'channelFeed',
      matches: () => CHANNEL_FEED_RE.test(location.pathname),
      chips: FILTER_CHIPS,
      sort: false,
      mountChips(barEl) {
        const chipBar = document.querySelector('chip-bar-view-model > div');
        if (!chipBar) return false;
        chipBar.appendChild(barEl);
        barEl.dataset.placement = 'chip-bar';
        return true;
      },
    },
    {
      key: 'channelSearch',
      matches: () => CHANNEL_SEARCH_RE.test(location.pathname),
      chips: SORT_FILTER_CHIPS,
      sort: true,
      rootSelector: 'ytd-browse[role="main"][page-subtype="channels"] ytd-section-list-renderer',
      itemTag: 'YTD-ITEM-SECTION-RENDERER',
      videoSelector: 'ytd-video-renderer',
      dedupe: true,
      chipBarPaddingLeft: 0,
      findHeader(root) { return root.querySelector(':scope > #header-container'); },
      mountChips: mountInSortHeader,
    },
    {
      // /results にチップは出さないが、Alt+U / Alt+W のショートカット絞り込み対象として残す。
      key: 'searchResults',
      matches: () => location.pathname === '/results',
      chips: [],
      sort: false,
    },
    {
      key: 'playlist',
      matches: () =>
        location.pathname === '/playlist' && new URLSearchParams(location.search).has('list'),
      chips: SORT_FILTER_CHIPS,
      sort: true,
      altLanguageFetch: true,
      rootSelector:
        'ytd-browse[role="main"][page-subtype="playlist"] ytd-playlist-video-list-renderer',
      itemTag: 'YTD-PLAYLIST-VIDEO-RENDERER',
      videoSelector: null,
      dedupe: false,
      chipBarPaddingLeft: 36,
      findHeader() {
        return document.querySelector(
          'ytd-browse[role="main"][page-subtype="playlist"] #header-container'
        );
      },
      mountChips: mountInSortHeader,
    },
  ];

  function resolvePage() {
    return PAGE_DEFS.find((p) => p.matches()) || null;
  }

  const state = {
    page: null,
    currentSort: null,
    currentFilter: null,
    sectionEntries: [],
    sectionEntryByNode: new WeakMap(),
    seenVideoIds: new Set(),
    collectionPromise: null,
    collectionComplete: false,
    runId: 0,
    originalIndexCounter: 0,
    observer: null,
    lastLocationKey: '',
    setupRetryTimer: null,
    scanRafId: 0,
    altLang: null,
    altByVideoId: new Map(),
    altFetchPromise: null,
  };

  function resetState() {
    state.currentSort = null;
    state.currentFilter = null;
    state.sectionEntries = [];
    state.sectionEntryByNode = new WeakMap();
    state.seenVideoIds = new Set();
    state.collectionPromise = null;
    state.collectionComplete = false;
    state.runId += 1;
    state.originalIndexCounter = 0;
    state.altLang = null;
    state.altByVideoId = new Map();
    state.altFetchPromise = null;
    if (state.scanRafId) {
      cancelAnimationFrame(state.scanRafId);
      state.scanRafId = 0;
    }
  }

  function isTyping(el) {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.isContentEditable) return true;
    return !!el.closest?.('[contenteditable="true"]');
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const progressList = PROGRESS_SELECTORS.join(', ');
    const unwatchedRules = HOST_SELECTORS
      .map((h) => `html.${FILTER_CLASS_PREFIX}unwatched ${h}:has(${progressList})`)
      .join(',\n');
    const watchedRules = HOST_SELECTORS
      .map((h) => `html.${FILTER_CLASS_PREFIX}watched ${h}:not(:has(${progressList}))`)
      .join(',\n');

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      ${unwatchedRules} {
        display: none !important;
      }
      ${watchedRules} {
        display: none !important;
      }
      /* Hide section wrappers that have no visible video child after filtering */
      html.${FILTER_CLASS_PREFIX}unwatched ytd-item-section-renderer:has(ytd-video-renderer:has(${progressList})):not(:has(ytd-video-renderer:not(:has(${progressList})))),
      html.${FILTER_CLASS_PREFIX}watched ytd-item-section-renderer:has(ytd-video-renderer:not(:has(${progressList}))):not(:has(ytd-video-renderer:has(${progressList}))) {
        display: none !important;
      }

      ytd-item-section-renderer.${DUPLICATE_CLASS} {
        display: none !important;
      }

      #${CHIP_BAR_ID} {
        --tm-chip-bg: rgba(0,0,0,0.05);
        --tm-chip-bg-hover: rgba(0,0,0,0.1);
        --tm-chip-fg: rgb(15,15,15);
        --tm-chip-active-bg: rgb(15,15,15);
        --tm-chip-active-fg: #fff;
        --tm-status-fg: #606060;
        --tm-status-progress: #065fd4;
        --tm-status-warn: #b06000;
        --tm-status-done: #2e7d32;
        display: inline-flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        font-family: "Roboto", "Arial", sans-serif;
      }
      :is(html[dark], [dark]) #${CHIP_BAR_ID} {
        --tm-chip-bg: rgba(255,255,255,0.1);
        --tm-chip-bg-hover: rgba(255,255,255,0.2);
        --tm-chip-fg: #fff;
        --tm-chip-active-bg: #fff;
        --tm-chip-active-fg: rgb(15,15,15);
        --tm-status-fg: rgba(255,255,255,0.75);
        --tm-status-progress: #8ab4f8;
        --tm-status-warn: #ffb74d;
        --tm-status-done: #81c995;
      }

      /* The chip row is always flex so chips get a real gap regardless of page type */
      #${CHIP_BAR_ID} .tm-chip-list {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }

      /* Inline placements within YouTube's existing chip rows.
         The native chip-bar children already carry margin-right: 8px,
         so we don't add extra left margin here. */
      #${CHIP_BAR_ID}[data-placement="subscribe-button-left"] {
        margin: 0 8px 0 0;
      }
      /* Match the pill shape of the adjacent "All subscriptions" button */
      #${CHIP_BAR_ID}[data-placement="subscribe-button-left"] .tm-chip {
        height: 36px;
        border-radius: 18px;
        padding: 0 16px;
        line-height: 36px;
      }

      /* Sort/filter pages get a stacked layout (chip row + status line) */
      #${CHIP_BAR_ID}[data-with-status="1"] {
        display: grid;
        gap: 8px;
        padding: 8px 0;
      }

      #${CHIP_BAR_ID} .tm-chip {
        background: var(--tm-chip-bg);
        color: var(--tm-chip-fg);
        border: none;
        border-radius: 8px;
        padding: 0 12px;
        height: 32px;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        font-family: inherit;
        font-size: 14px;
        font-weight: 500;
        line-height: 20px;
        letter-spacing: normal;
        cursor: pointer;
        white-space: nowrap;
        transition: background-color 0.1s linear, color 0.1s linear;
      }
      #${CHIP_BAR_ID} .tm-chip:hover {
        background: var(--tm-chip-bg-hover);
      }
      #${CHIP_BAR_ID} .tm-chip[aria-pressed="true"],
      #${CHIP_BAR_ID} .tm-chip[aria-pressed="true"]:hover {
        background: var(--tm-chip-active-bg);
        color: var(--tm-chip-active-fg);
      }

      #${STATUS_ID} {
        font-size: 12px;
        color: var(--tm-status-fg);
        min-height: 18px;
      }
      #${STATUS_ID}[data-tone="progress"] { color: var(--tm-status-progress); }
      #${STATUS_ID}[data-tone="warn"] { color: var(--tm-status-warn); }
      #${STATUS_ID}[data-tone="done"] { color: var(--tm-status-done); }

      #${SORT_CONTAINER_ID}[hidden] { display: none !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function applyFilterClass() {
    const html = document.documentElement;
    html.classList.remove(`${FILTER_CLASS_PREFIX}unwatched`, `${FILTER_CLASS_PREFIX}watched`);
    if (state.currentFilter) html.classList.add(`${FILTER_CLASS_PREFIX}${state.currentFilter}`);
  }

  function setStatus(text, tone = '') {
    const node = document.getElementById(STATUS_ID);
    if (!node) return;
    node.textContent = text || '';
    node.dataset.tone = tone;
    node.hidden = !text;
  }

  /* === Sort engine (channelSearch + playlist) === */

  const NUMBER_MULTIPLIERS = {
    億: 100000000, 万: 10000, 千: 1000, K: 1000, M: 1000000, B: 1000000000,
  };
  const JA_AGE_UNITS = [
    [/年/, 31536000], [/月/, 2592000], [/週/, 604800],
    [/日/, 86400], [/時間/, 3600], [/分/, 60], [/秒/, 1],
  ];
  const EN_AGE_UNITS = {
    year: 31536000, month: 2592000, week: 604800,
    day: 86400, hour: 3600, minute: 60, second: 1,
  };

  function parseCompactNumber(numberText, suffix = '') {
    const value = parseFloat(String(numberText || '').replace(/,/g, '').trim());
    if (!Number.isFinite(value)) return 0;
    const multiplier = NUMBER_MULTIPLIERS[suffix?.toUpperCase?.() || suffix] || 1;
    return Math.round(value * multiplier);
  }

  // 未検出時は null、検出時は数値（0 を含む）を返す。
  function parseViewCount(text) {
    if (!text) return null;
    const s = String(text);
    const jaMatch = s.match(/([\d.,]+)\s*(億|万|千)?\s*回(?:視聴|再生)/i);
    if (jaMatch) return parseCompactNumber(jaMatch[1], jaMatch[2] || '');
    const enMatch = s.match(/([\d.,]+)\s*([KMB])?\s*views?\b/i);
    if (enMatch) return parseCompactNumber(enMatch[1], enMatch[2] || '');
    return null;
  }

  // 未検出時は null、検出時は秒数を返す。
  function parseRelativeAgeSeconds(text) {
    if (!text) return null;
    const s = String(text);
    const jaMatch = s.match(/([\d.]+)\s*(年|(?:か|ヶ|カ|ケ)月|ヵ月|ヶ月|週(?:間)?|日|時間|分|秒)\s*前?/i);
    if (jaMatch) {
      const value = parseFloat(jaMatch[1]);
      const unit = JA_AGE_UNITS.find(([pattern]) => pattern.test(jaMatch[2]));
      return unit && Number.isFinite(value) ? value * unit[1] : null;
    }
    const enMatch = s.match(/([\d.]+)\s*(years?|months?|weeks?|days?|hours?|minutes?|seconds?)\s+ago/i);
    if (enMatch) {
      const value = parseFloat(enMatch[1]);
      const baseUnit = enMatch[2].toLowerCase().replace(/s$/, '');
      const multiplier = EN_AGE_UNITS[baseUnit];
      return multiplier && Number.isFinite(value) ? value * multiplier : null;
    }
    return null;
  }

  function getListRoot() {
    return state.page?.sort ? document.querySelector(state.page.rootSelector) : null;
  }
  function getContents() {
    return getListRoot()?.querySelector(':scope > #contents') || null;
  }
  function isItemRenderer(node) {
    return node?.nodeType === 1 && node.tagName === state.page?.itemTag;
  }
  function getVideoNode(item) {
    if (!state.page) return null;
    return state.page.videoSelector ? item.querySelector(state.page.videoSelector) : item;
  }
  function getVideoData(item) {
    const node = getVideoNode(item);
    return node ? node.data || node.__data || null : null;
  }

  function getVideoIdFromItem(item) {
    const data = getVideoData(item);
    if (data?.videoId) return data.videoId;
    const href = item.querySelector('a[href*="watch?v="]')?.getAttribute('href');
    if (!href) return null;
    try {
      return new URL(href, location.origin).searchParams.get('v');
    } catch {
      return null;
    }
  }

  function readMetricsFromItem(item) {
    const texts = new Set();
    const data = getVideoData(item);
    const addText = (value) => {
      const normalized = String(value || '').replace(/\s+/g, ' ').trim();
      if (normalized) texts.add(normalized);
    };
    addText(data?.publishedTimeText?.simpleText);
    addText(data?.viewCountText?.simpleText);
    addText(data?.shortViewCountText?.simpleText);
    if (Array.isArray(data?.videoInfo?.runs)) {
      for (const run of data.videoInfo.runs) addText(run?.text);
    }
    item
      .querySelectorAll(
        '#metadata-line span, #video-info span, #byline span, span.inline-metadata-item, yt-formatted-string'
      )
      .forEach((node) => {
        addText(node.textContent);
        addText(node.getAttribute?.('aria-label'));
      });
    item.querySelectorAll('a[aria-label]').forEach((node) => addText(node.getAttribute('aria-label')));
    addText(item.getAttribute?.('aria-label'));

    let viewCount = null;
    let ageSeconds = null;
    for (const text of texts) {
      if (viewCount === null) viewCount = parseViewCount(text);
      if (ageSeconds === null) ageSeconds = parseRelativeAgeSeconds(text);
      if (viewCount !== null && ageSeconds !== null) break;
    }
    if (viewCount === null || ageSeconds === null) {
      // textContent fallback (innerText だと layout flush を誘発するため避ける)
      const fallback = String(item.textContent || '').replace(/\s+/g, ' ').trim();
      if (fallback && !texts.has(fallback)) {
        if (viewCount === null) viewCount = parseViewCount(fallback);
        if (ageSeconds === null) ageSeconds = parseRelativeAgeSeconds(fallback);
      }
    }
    return { viewCount, ageSeconds };
  }

  function upsertSectionEntry(section) {
    let entry = state.sectionEntryByNode.get(section);
    if (!entry) {
      const videoId = getVideoIdFromItem(section);
      const isDuplicate = Boolean(state.page?.dedupe && videoId && state.seenVideoIds.has(videoId));
      if (videoId && state.page?.dedupe && !isDuplicate) state.seenVideoIds.add(videoId);
      section.classList.toggle(DUPLICATE_CLASS, isDuplicate);
      entry = {
        section,
        originalIndex: state.originalIndexCounter++,
        hasVideo: Boolean(getVideoNode(section)),
        videoId,
        isDuplicate,
        viewCount: 0,
        ageSeconds: Infinity,
        metricsComplete: false,
      };
      state.sectionEntryByNode.set(section, entry);
      state.sectionEntries.push(entry);
    }
    if (!entry.metricsComplete) {
      const { viewCount, ageSeconds } = readMetricsFromItem(section);
      entry.hasVideo = Boolean(getVideoNode(section));
      entry.viewCount = viewCount ?? 0;
      entry.ageSeconds = ageSeconds ?? Infinity;
      if (viewCount !== null && ageSeconds !== null) entry.metricsComplete = true;
    }
    return entry;
  }

  function scanSections() {
    const contents = getContents();
    if (!contents) return;
    for (const child of contents.children) {
      if (isItemRenderer(child)) upsertSectionEntry(child);
    }
  }

  function queueScanSections() {
    if (state.scanRafId) return;
    state.scanRafId = requestAnimationFrame(() => {
      state.scanRafId = 0;
      scanSections();
    });
  }

  function getRenderableEntries() {
    return state.sectionEntries.filter((e) => !e.isDuplicate);
  }

  function getEntryAltViewCount(entry) {
    if (!entry?.videoId) return null;
    const v = state.altByVideoId.get(entry.videoId);
    return Number.isFinite(v) ? v : null;
  }

  function compareEntries(a, b) {
    if (state.currentSort === 'popular') {
      const va = getEntryAltViewCount(a);
      const vb = getEntryAltViewCount(b);
      return (
        b.viewCount - a.viewCount ||
        (vb ?? -Infinity) - (va ?? -Infinity) ||
        a.originalIndex - b.originalIndex
      );
    }
    if (state.currentSort === 'latest') return a.ageSeconds - b.ageSeconds || a.originalIndex - b.originalIndex;
    if (state.currentSort === 'oldest') return b.ageSeconds - a.ageSeconds || a.originalIndex - b.originalIndex;
    return a.originalIndex - b.originalIndex;
  }

  function getSortedEntries() {
    const videoEntries = [];
    const nonVideoEntries = [];
    getRenderableEntries().forEach((entry) => {
      (entry.hasVideo ? videoEntries : nonVideoEntries).push(entry);
    });
    videoEntries.sort(compareEntries);
    nonVideoEntries.sort((a, b) => a.originalIndex - b.originalIndex);
    return videoEntries.concat(nonVideoEntries);
  }

  function ensureSortContainer() {
    const contents = getContents();
    if (!contents) return null;
    let container = document.getElementById(SORT_CONTAINER_ID);
    if (!container) {
      container = document.createElement('div');
      container.id = SORT_CONTAINER_ID;
      container.hidden = true;
      contents.parentNode.insertBefore(container, contents);
    }
    return container;
  }

  function resetDisplayState() {
    const contents = getContents();
    if (contents) contents.hidden = false;
    const container = document.getElementById(SORT_CONTAINER_ID);
    if (container) {
      container.hidden = true;
      container.replaceChildren();
    }
    setStatus(state.collectionComplete ? t('collected', getRenderableEntries().length) : '');
  }

  function renderOriginalContents() {
    const contents = getContents();
    if (!contents) return;
    const frag = document.createDocumentFragment();
    state.sectionEntries
      .slice()
      .sort((a, b) => a.originalIndex - b.originalIndex)
      .forEach((entry) => frag.appendChild(entry.section));
    Array.from(contents.children)
      .filter((child) => !isItemRenderer(child))
      .forEach((child) => frag.appendChild(child));
    contents.replaceChildren(frag);
    resetDisplayState();
  }

  function renderSortedContents(runId = state.runId) {
    if (runId !== state.runId) return;
    const contents = getContents();
    const container = ensureSortContainer();
    if (!contents || !container) return;
    const orderedEntries = getSortedEntries();
    const frag = document.createDocumentFragment();
    orderedEntries.forEach((entry) => frag.appendChild(entry.section));
    container.replaceChildren(frag);
    container.hidden = false;
    contents.hidden = true;
    const messageKey = state.collectionComplete ? 'sorted' : 'showing';
    setStatus(t(messageKey, orderedEntries.length), state.collectionComplete ? 'done' : 'warn');
  }

  function findContinuationNode() {
    const contents = getContents();
    return (
      contents?.querySelector(':scope > ytd-continuation-item-renderer') ||
      contents?.querySelector('ytd-continuation-item-renderer') ||
      null
    );
  }

  function nudgeContinuation() {
    const continuation = findContinuationNode();
    if (!continuation) return false;
    continuation.scrollIntoView({ block: 'end', inline: 'nearest' });
    const button = continuation.querySelector('button, tp-yt-paper-button, yt-button-shape button');
    if (button) button.click();
    else window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
    return true;
  }

  function waitForMoreResults(previousCount, runId, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      function tick() {
        if (runId !== state.runId) { resolve(false); return; }
        scanSections();
        if (getRenderableEntries().length > previousCount) { resolve(true); return; }
        if (!findContinuationNode() || Date.now() - startedAt >= timeoutMs) { resolve(false); return; }
        setTimeout(tick, 150);
      }
      tick();
    });
  }

  async function collectAllResults(runId) {
    if (state.collectionComplete) return true;
    if (state.collectionPromise) return state.collectionPromise;
    const startScrollY = window.scrollY;
    const promise = (async () => {
      scanSections();
      setStatus(t('collecting', getRenderableEntries().length), 'progress');
      let stalledRounds = 0;
      for (let i = 0; i < 80 && runId === state.runId; i += 1) {
        if (!findContinuationNode()) { state.collectionComplete = true; break; }
        const previousCount = getRenderableEntries().length;
        nudgeContinuation();
        await waitForMoreResults(previousCount, runId);
        if (runId !== state.runId) return false;
        const currentCount = getRenderableEntries().length;
        setStatus(t('collecting', currentCount), 'progress');
        if (!findContinuationNode()) { state.collectionComplete = true; break; }
        stalledRounds = currentCount > previousCount ? 0 : stalledRounds + 1;
        if (stalledRounds >= 3) break;
      }
      if (runId === state.runId) window.scrollTo({ top: startScrollY, behavior: 'auto' });
      return state.collectionComplete;
    })();
    state.collectionPromise = promise;
    try { return await promise; }
    finally { if (state.collectionPromise === promise) state.collectionPromise = null; }
  }

  /* === Alt-language refinement (playlist popular sort tie-breaker) ===
     YouTube のプレイリストでは丸めた表示しか露出していない（例: ja "18万回視聴"）。
     別言語で同じプレイリストを fetch すると粒度が変わるレンジがあり、
     ja の 10 万〜99 万帯の "18万" は en では "181K" "189K" の 1K 粒度になる。
     人気順で同点が出たときだけ別言語を 1 回だけ fetch して 2 段目のソートキーに使う。 */

  function hasPopularTies() {
    const counts = new Map();
    for (const entry of getRenderableEntries()) {
      if (!entry.hasVideo) continue;
      if (!Number.isFinite(entry.viewCount)) continue;
      const next = (counts.get(entry.viewCount) || 0) + 1;
      if (next > 1) return true;
      counts.set(entry.viewCount, next);
    }
    return false;
  }

  function parsePlaylistVideoCounts(html) {
    const map = new Map();
    const m = html.match(/var ytInitialData\s*=\s*(\{[\s\S]+?\});\s*<\/script>/);
    if (!m) return map;
    let data;
    try { data = JSON.parse(m[1]); }
    catch { return map; }
    const stack = [data];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) { for (const v of node) stack.push(v); continue; }
      const r = node.playlistVideoRenderer;
      if (r && r.videoId && !map.has(r.videoId) && Array.isArray(r.videoInfo?.runs)) {
        for (const run of r.videoInfo.runs) {
          const v = parseViewCount(run?.text);
          if (v !== null) { map.set(r.videoId, v); break; }
        }
      }
      for (const k of Object.keys(node)) stack.push(node[k]);
    }
    return map;
  }

  async function fetchAltLanguageViewCounts(altLang, runId) {
    if (state.altLang === altLang && state.altByVideoId.size > 0) return true;
    if (state.altFetchPromise) return state.altFetchPromise;
    const url = new URL(location.href);
    url.searchParams.set('hl', altLang);
    url.searchParams.set('persist_hl', '1');
    const promise = (async () => {
      try {
        const res = await fetch(url.href, { credentials: 'omit' });
        if (!res.ok) return false;
        const html = await res.text();
        if (runId !== state.runId) return false;
        const map = parsePlaylistVideoCounts(html);
        if (map.size === 0) return false;
        state.altByVideoId = map;
        state.altLang = altLang;
        return true;
      } catch {
        return false;
      }
    })();
    state.altFetchPromise = promise;
    try { return await promise; }
    finally { if (state.altFetchPromise === promise) state.altFetchPromise = null; }
  }

  /* === Chip UI === */

  function buildChipBar() {
    const bar = document.createElement('div');
    bar.id = CHIP_BAR_ID;
    if (state.page?.sort) bar.dataset.withStatus = '1';

    const list = document.createElement('div');
    list.className = 'tm-chip-list';

    state.page.chips.forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tm-chip';
      btn.dataset.chipKey = key;
      btn.setAttribute('aria-pressed', 'false');
      const hintKey = `hint${key.charAt(0).toUpperCase()}${key.slice(1)}`;
      btn.title = t(hintKey) || '';
      btn.textContent = t(key);
      btn.addEventListener('click', () => onChipClick(key));
      list.appendChild(btn);
    });

    if (state.page?.sort) {
      const status = document.createElement('div');
      status.id = STATUS_ID;
      status.hidden = true;
      bar.append(list, status);
    } else {
      bar.appendChild(list);
    }
    updateActiveChips(bar);
    return bar;
  }

  function updateActiveChips(bar = document.getElementById(CHIP_BAR_ID)) {
    if (!bar) return;
    bar.querySelectorAll('.tm-chip').forEach((btn) => {
      const key = btn.dataset.chipKey;
      const active =
        (SORT_KEYS.has(key) && state.currentSort === key) ||
        (FILTER_KEYS.has(key) && state.currentFilter === key);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function injectChipBar() {
    if (!state.page?.chips.length) return true;
    if (document.getElementById(CHIP_BAR_ID)) return true;
    const bar = buildChipBar();
    const ok = state.page.mountChips(bar);
    if (!ok) bar.remove();
    return ok;
  }

  function removeInjectedNodes() {
    document.getElementById(CHIP_BAR_ID)?.remove();
    document.getElementById(SORT_CONTAINER_ID)?.remove();
  }

  /* === Click / shortcut handling === */

  async function onChipClick(key) {
    if (FILTER_KEYS.has(key)) { toggleFilter(key); return; }
    if (!SORT_KEYS.has(key)) return;
    if (!state.page?.sort) return;

    const nextSort = state.currentSort === key ? null : key;
    if (!nextSort || !state.currentSort) state.runId += 1;
    state.currentSort = nextSort;
    const runId = state.runId;
    updateActiveChips();

    if (!state.currentSort) {
      renderOriginalContents();
      return;
    }
    scanSections();
    const completed = await collectAllResults(runId);
    if (!state.currentSort || runId !== state.runId) return;
    renderSortedContents(runId);
    if (!completed) setStatus(t('stopped', getRenderableEntries().length), 'warn');

    if (
      state.currentSort === 'popular' &&
      state.page?.altLanguageFetch &&
      state.altLang === null &&
      hasPopularTies()
    ) {
      const altLang = getLocale() === 'ja' ? 'en' : 'ja';
      setStatus(t('refining'), 'progress');
      const refined = await fetchAltLanguageViewCounts(altLang, runId);
      if (state.currentSort !== 'popular' || runId !== state.runId) return;
      if (refined) renderSortedContents(runId);
      else if (completed) setStatus(t('sorted', getRenderableEntries().length), 'done');
    }
  }

  function toggleFilter(key) {
    state.currentFilter = state.currentFilter === key ? null : key;
    applyFilterClass();
    updateActiveChips();
  }

  /* === Setup / observation === */

  function startObserver() {
    if (!state.page) return false;
    if (state.observer) state.observer.disconnect();
    state.observer = new MutationObserver(() => {
      if (!state.page) return;
      if (state.page.chips.length && !document.getElementById(CHIP_BAR_ID)) injectChipBar();
      if (state.page.sort) queueScanSections();
    });
    const target = state.page.sort ? getContents() : document.documentElement;
    if (!target) return false;
    state.observer.observe(target, { childList: true, subtree: !state.page.sort });
    return true;
  }

  function scheduleSetupRetry() {
    if (state.setupRetryTimer) return;
    state.setupRetryTimer = window.setTimeout(() => {
      state.setupRetryTimer = null;
      setup();
    }, 200);
  }

  function setup() {
    state.page = resolvePage();
    if (!state.page) {
      removeInjectedNodes();
      state.observer?.disconnect();
      applyFilterClass();
      return;
    }

    ensureStyle();

    if (state.page.chips.length && !injectChipBar()) {
      scheduleSetupRetry();
      return;
    }

    if (state.page.sort) {
      ensureSortContainer();
      scanSections();
    }

    startObserver();
    applyFilterClass();
    updateActiveChips();

    if (state.page.sort && state.currentSort && state.collectionComplete) {
      renderSortedContents();
    } else if (state.page.sort) {
      resetDisplayState();
    }
  }

  function onNavigate() {
    const locationKey = `${location.pathname}${location.search}`;
    if (locationKey !== state.lastLocationKey) {
      state.lastLocationKey = locationKey;
      resetState();
      removeInjectedNodes();
      applyFilterClass();
    }
    setup();
  }

  document.addEventListener('yt-navigate-finish', onNavigate);
  window.addEventListener('popstate', onNavigate);

  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (isTyping(document.activeElement)) return;
      let key = null;
      if (e.code === 'KeyU') key = 'unwatched';
      else if (e.code === 'KeyW') key = 'watched';
      if (!key) return;
      if (!state.page) return;
      e.preventDefault();
      e.stopPropagation();
      toggleFilter(key);
    },
    true
  );

  state.lastLocationKey = `${location.pathname}${location.search}`;
  ensureStyle();
  setup();
})();
