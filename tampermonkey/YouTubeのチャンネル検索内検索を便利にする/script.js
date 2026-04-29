// ==UserScript==
// @name         YouTubeのチャンネル検索内検索を便利にする
// @namespace    https://tampermonkey.net/
// @version      1.0.0
// @description  YouTubeのチャンネル内検索の検索結果に「Latest」「Popular」「Oldest」のソートチップを表示する
// @match        https://www.youtube.com/*
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeのチャンネル検索内検索を便利にする/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeのチャンネル検索内検索を便利にする/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeのチャンネル検索内検索を便利にする/icon_128.png
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const CHIP_BAR_ID = 'tm-channel-search-sort-chips';
  const STATUS_ID = 'tm-channel-search-sort-status';
  const SORT_CONTAINER_ID = 'tm-channel-search-sort-results';
  const ORIGINAL_INDEX_ATTR = 'tmOriginalIndex';
  const PAGE_KIND_CHANNEL_SEARCH = 'channel-search';
  const PAGE_KIND_PLAYLIST = 'playlist';

  const CHIPS = [
    { key: 'latest', label: 'Latest' },
    { key: 'popular', label: 'Popular' },
    { key: 'oldest', label: 'Oldest' },
  ];

  let currentSort = null;
  let originalIndexCounter = 0;
  let observer = null;
  let lastLocationKey = '';
  let collectionPromise = null;
  let collectionComplete = false;
  const seenVideoIds = new Set();
  const DUPLICATE_CLASS = 'tm-channel-search-duplicate';
  const sectionEntries = [];
  const sectionEntryByNode = new WeakMap();

  function getPageKind() {
    if (/^\/(?:@[^/]+|c\/[^/]+|user\/[^/]+|channel\/[^/]+)\/search\/?$/.test(location.pathname)) {
      return PAGE_KIND_CHANNEL_SEARCH;
    }
    if (location.pathname === '/playlist' && new URLSearchParams(location.search).has('list')) {
      return PAGE_KIND_PLAYLIST;
    }
    return null;
  }

  function isSupportedPage() {
    return Boolean(getPageKind());
  }

  function getListRoot() {
    const pageKind = getPageKind();
    if (pageKind === PAGE_KIND_CHANNEL_SEARCH) {
      return document.querySelector(
        'ytd-browse[role="main"][page-subtype="channels"] ytd-section-list-renderer'
      );
    }
    if (pageKind === PAGE_KIND_PLAYLIST) {
      return document.querySelector(
        'ytd-browse[role="main"][page-subtype="playlist"] ytd-playlist-video-list-renderer'
      );
    }
    return null;
  }

  function getContents() {
    const root = getListRoot();
    return root ? root.querySelector(':scope > #contents') : null;
  }

  function isItemRenderer(node) {
    if (node?.nodeType !== 1) return false;
    const pageKind = getPageKind();
    if (pageKind === PAGE_KIND_CHANNEL_SEARCH) {
      return node.tagName === 'YTD-ITEM-SECTION-RENDERER';
    }
    if (pageKind === PAGE_KIND_PLAYLIST) {
      return node.tagName === 'YTD-PLAYLIST-VIDEO-RENDERER';
    }
    return false;
  }

  function getLocationKey() {
    return `${location.pathname}${location.search}`;
  }

  function parseCompactNumber(numberText, suffix = '') {
    if (!numberText) return 0;
    const normalized = String(numberText).replace(/,/g, '').trim();
    const value = parseFloat(normalized);
    if (!Number.isFinite(value)) return 0;

    if (/億/i.test(suffix)) return Math.round(value * 100000000);
    if (/万/i.test(suffix)) return Math.round(value * 10000);
    if (/千|K/i.test(suffix)) return Math.round(value * 1000);
    if (/M/i.test(suffix)) return Math.round(value * 1000000);
    if (/B/i.test(suffix)) return Math.round(value * 1000000000);
    return Math.round(value);
  }

  function parseViewCount(text) {
    if (!text) return 0;
    const s = String(text);

    const jaMatch = s.match(/([\d.,]+)\s*(億|万|千)?\s*回(?:視聴|再生)/i);
    if (jaMatch) {
      return parseCompactNumber(jaMatch[1], jaMatch[2] || '');
    }

    const enMatch = s.match(/([\d.,]+)\s*([KMB])?\s*views?\b/i);
    if (enMatch) {
      return parseCompactNumber(enMatch[1], enMatch[2] || '');
    }

    return 0;
  }

  function parseRelativeAgeSeconds(text) {
    if (!text) return Infinity;
    const s = String(text);

    const jaMatch = s.match(/([\d.]+)\s*(年|(?:か|ヶ|カ|ケ)月|ヵ月|ヶ月|週(?:間)?|日|時間|分|秒)\s*前?/i);
    if (jaMatch) {
      const value = parseFloat(jaMatch[1]);
      const unit = jaMatch[2];
      if (/年/.test(unit)) return value * 31536000;
      if (/月/.test(unit)) return value * 2592000;
      if (/週/.test(unit)) return value * 604800;
      if (/日/.test(unit)) return value * 86400;
      if (/時間/.test(unit)) return value * 3600;
      if (/分/.test(unit)) return value * 60;
      if (/秒/.test(unit)) return value;
    }

    const enMatch = s.match(/([\d.]+)\s*(years?|months?|weeks?|days?|hours?|minutes?|seconds?)\s+ago/i);
    if (enMatch) {
      const value = parseFloat(enMatch[1]);
      const unit = enMatch[2].toLowerCase();
      if (unit.startsWith('year')) return value * 31536000;
      if (unit.startsWith('month')) return value * 2592000;
      if (unit.startsWith('week')) return value * 604800;
      if (unit.startsWith('day')) return value * 86400;
      if (unit.startsWith('hour')) return value * 3600;
      if (unit.startsWith('minute')) return value * 60;
      if (unit.startsWith('second')) return value;
    }

    return Infinity;
  }

  function getVideoNode(item) {
    if (getPageKind() === PAGE_KIND_CHANNEL_SEARCH) {
      return item.querySelector('ytd-video-renderer');
    }
    if (getPageKind() === PAGE_KIND_PLAYLIST) {
      return item;
    }
    return null;
  }

  function getVideoData(item) {
    const node = getVideoNode(item);
    if (!node) return null;
    return node.data || node.__data || null;
  }

  function getVideoIdFromItem(item) {
    const data = getVideoData(item);
    if (data?.videoId) return data.videoId;

    const href = item.querySelector('a[href*="watch?v="]')?.getAttribute('href');
    if (!href) return null;
    try {
      const url = new URL(href, location.origin);
      return url.searchParams.get('v');
    } catch {
      return null;
    }
  }

  function getMetricTexts(item) {
    const data = getVideoData(item);
    const texts = [];

    const pushText = (value) => {
      if (!value) return;
      const normalized = String(value).replace(/\s+/g, ' ').trim();
      if (normalized && !texts.includes(normalized)) {
        texts.push(normalized);
      }
    };

    pushText(data?.publishedTimeText?.simpleText);
    pushText(data?.viewCountText?.simpleText);
    pushText(data?.shortViewCountText?.simpleText);

    if (Array.isArray(data?.videoInfo?.runs)) {
      data.videoInfo.runs.forEach((run) => pushText(run?.text));
    }

    item.querySelectorAll(
      '#metadata-line span, #video-info span, #byline span, span.inline-metadata-item, yt-formatted-string'
    ).forEach((node) => {
      pushText(node.textContent);
      pushText(node.getAttribute?.('aria-label'));
    });

    item.querySelectorAll('a[aria-label]').forEach((node) => {
      pushText(node.getAttribute('aria-label'));
    });

    pushText(item.getAttribute?.('aria-label'));
    pushText(item.innerText);
    return texts;
  }

  function readMetricsFromItem(item) {
    const texts = getMetricTexts(item);
    let viewCount = 0;
    let ageSeconds = Infinity;

    for (const text of texts) {
      const candidate = parseViewCount(text);
      if (candidate > 0) {
        viewCount = candidate;
        break;
      }
    }

    for (const text of texts) {
      const candidate = parseRelativeAgeSeconds(text);
      if (Number.isFinite(candidate)) {
        ageSeconds = candidate;
        break;
      }
    }

    return { viewCount, ageSeconds };
  }

  function getStatusNode() {
    return document.getElementById(STATUS_ID);
  }

  function resetDisplayState() {
    const contents = getContents();
    if (contents) {
      contents.hidden = false;
    }

    const container = document.getElementById(SORT_CONTAINER_ID);
    if (container) {
      container.hidden = true;
      container.replaceChildren();
    }

    setStatus(collectionComplete ? `Collected ${getRenderableEntries().length} results.` : '');
  }

  function setStatus(text, tone = '') {
    const node = getStatusNode();
    if (!node) return;
    node.textContent = text || '';
    node.dataset.tone = tone;
    node.hidden = !text;
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

  function getSectionOriginalIndex(section) {
    if (section.dataset[ORIGINAL_INDEX_ATTR] === undefined) {
      section.dataset[ORIGINAL_INDEX_ATTR] = String(originalIndexCounter++);
    }
    return parseInt(section.dataset[ORIGINAL_INDEX_ATTR], 10) || 0;
  }

  function upsertSectionEntry(section) {
    let entry = sectionEntryByNode.get(section);
    if (!entry) {
      const originalIndex = getSectionOriginalIndex(section);
      const videoNode = getVideoNode(section);
      const videoId = getVideoIdFromItem(section);
      const shouldDeduplicate = getPageKind() === PAGE_KIND_CHANNEL_SEARCH;
      const isDuplicate = Boolean(shouldDeduplicate && videoId && seenVideoIds.has(videoId));
      if (videoId && shouldDeduplicate && !isDuplicate) {
        seenVideoIds.add(videoId);
      }
      if (isDuplicate) {
        section.classList.add(DUPLICATE_CLASS);
      }
      entry = {
        section,
        originalIndex,
        hasVideo: Boolean(videoNode),
        videoId,
        isDuplicate,
        viewCount: 0,
        ageSeconds: Infinity,
      };
      sectionEntryByNode.set(section, entry);
      sectionEntries.push(entry);
    }

    const metrics = readMetricsFromItem(section);
    entry.hasVideo = Boolean(getVideoNode(section));
    entry.viewCount = metrics.viewCount;
    entry.ageSeconds = metrics.ageSeconds;
    return entry;
  }

  function scanSections() {
    const contents = getContents();
    if (!contents) return;
    Array.from(contents.children)
      .filter(isItemRenderer)
      .forEach((section) => {
        upsertSectionEntry(section);
      });
  }

  function getRenderableEntries() {
    return sectionEntries.filter((entry) => !entry.isDuplicate);
  }

  function compareEntries(a, b) {
    if (currentSort === 'popular') {
      return b.viewCount - a.viewCount || a.originalIndex - b.originalIndex;
    }
    if (currentSort === 'latest') {
      return a.ageSeconds - b.ageSeconds || a.originalIndex - b.originalIndex;
    }
    if (currentSort === 'oldest') {
      return b.ageSeconds - a.ageSeconds || a.originalIndex - b.originalIndex;
    }
    return a.originalIndex - b.originalIndex;
  }

  function buildSortedEntries() {
    const entries = getRenderableEntries();
    const videoEntries = entries.filter((entry) => entry.hasVideo);
    const nonVideoEntries = entries.filter((entry) => !entry.hasVideo);
    videoEntries.sort(compareEntries);
    nonVideoEntries.sort((a, b) => a.originalIndex - b.originalIndex);
    return [...videoEntries, ...nonVideoEntries];
  }

  function renderOriginalContents() {
    const contents = getContents();
    if (!contents) return;

    const nonSectionChildren = Array.from(contents.children).filter((child) => !isItemRenderer(child));
    const frag = document.createDocumentFragment();
    sectionEntries
      .slice()
      .sort((a, b) => a.originalIndex - b.originalIndex)
      .forEach((entry) => {
        frag.appendChild(entry.section);
      });
    nonSectionChildren.forEach((child) => frag.appendChild(child));
    contents.replaceChildren(frag);
    resetDisplayState();
  }

  function renderSortedContents() {
    const contents = getContents();
    const container = ensureSortContainer();
    if (!contents || !container) return;

    const frag = document.createDocumentFragment();
    const orderedEntries = buildSortedEntries();
    orderedEntries.forEach((entry) => {
      frag.appendChild(entry.section);
    });
    container.replaceChildren(frag);
    container.hidden = false;
    contents.hidden = true;
    const prefix = collectionComplete ? 'Sorted' : 'Showing';
    setStatus(`${prefix} ${orderedEntries.length} collected results.`, collectionComplete ? 'done' : 'warn');
  }

  function findContinuationNode() {
    const contents = getContents();
    if (!contents) return null;
    return (
      contents.querySelector(':scope > ytd-continuation-item-renderer') ||
      contents.querySelector('ytd-continuation-item-renderer')
    );
  }

  function nudgeContinuation() {
    const continuation = findContinuationNode();
    if (!continuation) return false;

    continuation.scrollIntoView({ block: 'end', inline: 'nearest' });
    const button = continuation.querySelector('button, tp-yt-paper-button, yt-button-shape button');
    if (button) {
      button.click();
    } else {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
    }
    return true;
  }

  function waitForMoreResults(previousCount, timeoutMs = 2500) {
    return new Promise((resolve) => {
      const startedAt = Date.now();

      function tick() {
        scanSections();
        if (getRenderableEntries().length > previousCount) {
          resolve(true);
          return;
        }
        if (!findContinuationNode()) {
          resolve(false);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(tick, 150);
      }

      tick();
    });
  }

  async function collectAllResults() {
    if (collectionComplete) return true;
    if (collectionPromise) return collectionPromise;

    const startScrollY = window.scrollY;
    const promise = (async () => {
      scanSections();
      setStatus(`Collecting results... ${getRenderableEntries().length} found.`, 'progress');

      let stalledRounds = 0;
      for (let i = 0; i < 80; i += 1) {
        const continuation = findContinuationNode();
        if (!continuation) {
          collectionComplete = true;
          break;
        }

        const previousCount = getRenderableEntries().length;
        nudgeContinuation();
        await waitForMoreResults(previousCount);

        const currentCount = getRenderableEntries().length;
        setStatus(`Collecting results... ${currentCount} found.`, 'progress');

        if (!findContinuationNode()) {
          collectionComplete = true;
          break;
        }

        if (currentCount > previousCount) {
          stalledRounds = 0;
          continue;
        }

        stalledRounds += 1;
        if (stalledRounds >= 3) {
          break;
        }
      }

      window.scrollTo({ top: startScrollY, behavior: 'auto' });
      return collectionComplete;
    })();

    collectionPromise = promise;
    try {
      return await promise;
    } finally {
      collectionPromise = null;
    }
  }

  function buildChipBar() {
    const bar = document.createElement('div');
    bar.id = CHIP_BAR_ID;
    bar.className = 'tm-chip-bar';
    const chips = document.createElement('div');
    chips.className = 'tm-chip-list';
    CHIPS.forEach((c) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tm-chip';
      btn.dataset.sortKey = c.key;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', 'false');
      btn.textContent = c.label;
      btn.addEventListener('click', () => {
        void onChipClick(c.key);
      });
      chips.appendChild(btn);
    });
    const status = document.createElement('div');
    status.id = STATUS_ID;
    status.className = 'tm-status';
    status.hidden = true;
    bar.appendChild(chips);
    bar.appendChild(status);
    updateActiveChips(bar);
    return bar;
  }

  function updateActiveChips(bar) {
    bar = bar || document.getElementById(CHIP_BAR_ID);
    if (!bar) return;
    bar.querySelectorAll('.tm-chip').forEach((btn) => {
      const active = btn.dataset.sortKey === currentSort;
      btn.classList.toggle('tm-chip-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  async function onChipClick(key) {
    currentSort = currentSort === key ? null : key;
    updateActiveChips();
    if (!currentSort) {
      renderOriginalContents();
      return;
    }

    scanSections();
    const completed = await collectAllResults();
    if (!currentSort) return;
    renderSortedContents();
    if (!completed) {
      setStatus(`Stopped after collecting ${getRenderableEntries().length} results.`, 'warn');
    }
  }

  function injectChipBar() {
    const pageKind = getPageKind();
    if (!pageKind) return false;
    if (document.getElementById(CHIP_BAR_ID)) return true;
    const listRoot = getListRoot();
    const contents = getContents();
    if (!listRoot || !contents) return false;
    const bar = buildChipBar();
    if (pageKind === PAGE_KIND_CHANNEL_SEARCH) {
      const headerContainer = listRoot.querySelector(':scope > #header-container');
      if (headerContainer) {
        headerContainer.appendChild(bar);
      } else {
        contents.parentNode.insertBefore(bar, contents);
      }
      return true;
    }

    const playlistHeader =
      document.querySelector('ytd-browse[role="main"][page-subtype="playlist"] #header-container') ||
      listRoot.parentNode;
    if (playlistHeader && playlistHeader !== listRoot.parentNode) {
      playlistHeader.appendChild(bar);
    } else {
      contents.parentNode.insertBefore(bar, contents);
    }
    return true;
  }

  function removeChipBar() {
    const bar = document.getElementById(CHIP_BAR_ID);
    if (bar) bar.remove();
  }

  function removeSortContainer() {
    const container = document.getElementById(SORT_CONTAINER_ID);
    if (container) container.remove();
  }

  function startObserver() {
    const contents = getContents();
    if (!contents) return false;
    if (!observer) {
      observer = new MutationObserver(() => {
        if (!isSupportedPage()) return;
        if (!document.getElementById(CHIP_BAR_ID)) injectChipBar();
        scanSections();
      });
    } else {
      observer.disconnect();
    }
    observer.observe(contents, { childList: true });
    return true;
  }

  function setup() {
    if (!isSupportedPage()) {
      removeChipBar();
      removeSortContainer();
      if (observer) observer.disconnect();
      return;
    }
    if (!injectChipBar()) {
      requestAnimationFrame(setup);
      return;
    }
    ensureSortContainer();
    scanSections();
    startObserver();
    if (currentSort && collectionComplete) {
      renderSortedContents();
      return;
    }
    resetDisplayState();
  }

  function resetState() {
    currentSort = null;
    originalIndexCounter = 0;
    collectionPromise = null;
    collectionComplete = false;
    seenVideoIds.clear();
    sectionEntries.length = 0;
  }

  function onNavigate() {
    const locationKey = getLocationKey();
    if (locationKey !== lastLocationKey) {
      lastLocationKey = locationKey;
      resetState();
      removeChipBar();
      removeSortContainer();
    }
    setup();
  }

  const style = document.createElement('style');
  style.textContent = `
    #${CHIP_BAR_ID} {
      display: grid;
      gap: 8px;
      padding: 12px 0 16px;
      font-family: "Roboto", "YouTube Sans", "Noto Sans JP", sans-serif;
    }
    #${CHIP_BAR_ID} .tm-chip-list {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    #${STATUS_ID} {
      font-size: 12px;
      color: #606060;
      min-height: 18px;
    }
    #${STATUS_ID}[data-tone="progress"] {
      color: #065fd4;
    }
    #${STATUS_ID}[data-tone="warn"] {
      color: #b06000;
    }
    #${STATUS_ID}[data-tone="done"] {
      color: #2e7d32;
    }
    #${SORT_CONTAINER_ID}[hidden] {
      display: none !important;
    }
    ytd-item-section-renderer.${DUPLICATE_CLASS} {
      display: none !important;
    }
    #${CHIP_BAR_ID} .tm-chip {
      background: #f2f2f2;
      color: #0f0f0f;
      border: 1px solid transparent;
      border-radius: 8px;
      padding: 0 12px;
      height: 32px;
      font-size: 14px;
      font-weight: 500;
      line-height: 30px;
      cursor: pointer;
      white-space: nowrap;
      transition: background-color 0.1s linear, color 0.1s linear;
    }
    #${CHIP_BAR_ID} .tm-chip:hover {
      background: #e5e5e5;
    }
    #${CHIP_BAR_ID} .tm-chip-active {
      background: #0f0f0f;
      color: #fff;
    }
    #${CHIP_BAR_ID} .tm-chip-active:hover {
      background: #0f0f0f;
    }
    html[dark] #${CHIP_BAR_ID} .tm-chip,
    [dark] #${CHIP_BAR_ID} .tm-chip {
      background: rgba(255,255,255,0.1);
      color: #fff;
    }
    html[dark] #${CHIP_BAR_ID} .tm-chip:hover,
    [dark] #${CHIP_BAR_ID} .tm-chip:hover {
      background: rgba(255,255,255,0.2);
    }
    html[dark] #${CHIP_BAR_ID} .tm-chip-active,
    [dark] #${CHIP_BAR_ID} .tm-chip-active {
      background: #fff;
      color: #0f0f0f;
    }
    html[dark] #${CHIP_BAR_ID} .tm-chip-active:hover,
    [dark] #${CHIP_BAR_ID} .tm-chip-active:hover {
      background: #fff;
    }
    html[dark] #${STATUS_ID},
    [dark] #${STATUS_ID} {
      color: rgba(255,255,255,0.75);
    }
    html[dark] #${STATUS_ID}[data-tone="progress"],
    [dark] #${STATUS_ID}[data-tone="progress"] {
      color: #8ab4f8;
    }
    html[dark] #${STATUS_ID}[data-tone="warn"],
    [dark] #${STATUS_ID}[data-tone="warn"] {
      color: #ffb74d;
    }
    html[dark] #${STATUS_ID}[data-tone="done"],
    [dark] #${STATUS_ID}[data-tone="done"] {
      color: #81c995;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  document.addEventListener('yt-navigate-finish', onNavigate);
  window.addEventListener('popstate', onNavigate);

  lastLocationKey = getLocationKey();
  setup();
})();
