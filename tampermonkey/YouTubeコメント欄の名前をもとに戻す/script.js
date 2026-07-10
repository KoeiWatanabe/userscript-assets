// ==UserScript==
// @name         YouTubeコメント欄の名前をもとに戻す＋
// @namespace    https://example.com/
// @version      1.0.9
// @description  YouTubeのコメント欄・ライブチャット欄の名前をハンドル(@...)からユーザー名に書き換えます。
// @match        https://www.youtube.com/*
// @match        https://www.youtube.com/live_chat*
// @match        https://www.youtube.com/live_chat_replay*
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeコメント欄の名前をもとに戻す/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeコメント欄の名前をもとに戻す/script.js
// @icon         https://lh3.googleusercontent.com/sFcMOwMS6nr3GKmCvUNP_4E1kdginHy_n6uK4oz1sThlHveRKGd0K4SqJsLJL-DsFr5LRyJk0A4rgLdLl9RaE8Oz=s120
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  const DAY = 24 * 60 * 60 * 1000;
  const CFG = {
    cacheMax: 5000,
    persistMax: 3000,
    cacheTTL: 30 * DAY,
    negativeTTL: 10 * 60 * 1000,
    cooldownMs: 10 * 60 * 1000,
    cooldownAfterFailures: 3,
    maxConcurrentFetches: 4,
    fetchTimeout: 7000,
    maxBytesToScan: 700 * 1024,
    maxChunks: 100,
    persistDelay: 5000,
  };

  const now = () => Date.now();
  const isElement = (node) => node && node.nodeType === Node.ELEMENT_NODE;

  const TICKER_ITEM_SEL =
    'yt-live-chat-ticker-paid-message-item-renderer,' +
    'yt-live-chat-ticker-paid-sticker-item-renderer,' +
    'yt-live-chat-ticker-sponsor-item-renderer';
  const TICKER_TEXT_SEL =
    'yt-live-chat-ticker-paid-message-item-renderer #text,' +
    'yt-live-chat-ticker-paid-sticker-item-renderer #text,' +
    'yt-live-chat-ticker-sponsor-item-renderer #text';
  const AUTHOR_NAME_SEL = 'yt-live-chat-author-chip #author-name, a#author-name, span#author-name';
  const LIVE_CHAT_SCAN_SEL = `${AUTHOR_NAME_SEL},${TICKER_TEXT_SEL}`;
  const COMMENT_AUTHOR_LINK_SEL =
    'a#author-text[href^="/@"],' +
    'a#author-name[href^="/@"],' +
    'ytd-author-comment-badge-renderer a#name[href^="/@"]';
  const COMMENT_ATTRIBUTION_TEXT_SEL = 'ytd-pinned-comment-badge-renderer #label';
  const COMMENT_ROOT_SEL = 'ytd-comments, #comments, ytd-engagement-panel-section-list-renderer';

  let entityDecoder = null;
  function decodeEntities(value) {
    const text = String(value ?? '');
    if (!text.includes('&')) return text;
    entityDecoder ||= document.createElement('textarea');
    entityDecoder.innerHTML = text;
    return entityDecoder.value;
  }

  function normalizeDisplayName(name) {
    let normalized = String(name || '');
    for (let i = 0; i < 4 && normalized.includes('&'); i++) {
      const decoded = decodeEntities(normalized);
      if (decoded === normalized) break;
      normalized = decoded;
    }
    return normalized.replace(/\s+-\s+YouTube\s*$/i, '').trim();
  }

  function extractHandleFromText(text) {
    const value = (text || '').trim();
    return value.startsWith('@') && value.length >= 3 ? value.replace(/\s+/g, '') : null;
  }

  function extractHandleFromHref(href) {
    const match = href && href.match(/\/@([A-Za-z0-9._-]{2,})/);
    return match ? `@${match[1]}` : null;
  }

  class LRU {
    constructor(max) {
      this.max = max;
      this.map = new Map();
    }

    get(key) {
      const value = this.map.get(key);
      if (value === undefined) return undefined;
      this.map.delete(key);
      this.map.set(key, value);
      return value;
    }

    peek(key) {
      return this.map.get(key);
    }

    set(key, value) {
      if (this.map.has(key)) this.map.delete(key);
      this.map.set(key, value);
      if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    }

    delete(key) {
      this.map.delete(key);
    }

    load(entries) {
      this.map.clear();
      for (const [key, value] of entries) this.set(key, value);
    }

    recentEntries(limit) {
      const entries = Array.from(this.map.entries());
      return entries.length > limit ? entries.slice(entries.length - limit) : entries;
    }
  }

  /**********************
   * Cache
   **********************/
  const LS_KEY = 'yt_handle_to_display_name_cache_v3';
  const LEGACY_LS_KEY = 'yt_handle_to_display_name_cache_v2';
  const nameCache = new LRU(CFG.cacheMax); // handle -> { name, fetchedAt }
  const negativeCache = new LRU(CFG.cacheMax); // handle -> retryAt
  let cacheDirty = false;
  let removeLegacyAfterPersist = false;
  let persistHandle = null;
  let persistUsesIdleCallback = false;

  function parseV3Entries(parsed) {
    if (!parsed || parsed.v !== 3 || !Array.isArray(parsed.entries)) return null;
    const entries = [];
    for (const item of parsed.entries) {
      if (!Array.isArray(item) || item.length < 3) continue;
      const [handle, rawName, fetchedAt] = item;
      const name = normalizeDisplayName(rawName);
      if (!extractHandleFromText(handle) || !name || !Number.isFinite(fetchedAt)) continue;
      entries.push([handle, { name, fetchedAt }]);
    }
    return entries;
  }

  function loadPersistentCache() {
    try {
      const rawV3 = localStorage.getItem(LS_KEY);
      if (rawV3) {
        const entries = parseV3Entries(JSON.parse(rawV3));
        if (entries) {
          nameCache.load(entries);
          return;
        }
      }

      const rawV2 = localStorage.getItem(LEGACY_LS_KEY);
      if (!rawV2) return;
      const parsed = JSON.parse(rawV2);
      if (!parsed || parsed.v !== 2 || !Array.isArray(parsed.entries)) return;

      const migratedAt = now();
      const entries = [];
      for (const item of parsed.entries) {
        if (!Array.isArray(item) || item.length < 2) continue;
        const [handle, rawName] = item;
        const name = normalizeDisplayName(rawName);
        if (!extractHandleFromText(handle) || !name) continue;
        entries.push([handle, { name, fetchedAt: migratedAt }]);
      }
      nameCache.load(entries);
      cacheDirty = true;
      removeLegacyAfterPersist = true;
    } catch { }
  }

  function cancelScheduledPersist() {
    if (persistHandle === null) return;
    if (persistUsesIdleCallback && typeof cancelIdleCallback === 'function') cancelIdleCallback(persistHandle);
    else clearTimeout(persistHandle);
    persistHandle = null;
    persistUsesIdleCallback = false;
  }

  function persistNow() {
    cancelScheduledPersist();
    if (!cacheDirty) return;
    try {
      const entries = nameCache.recentEntries(CFG.persistMax)
        .map(([handle, record]) => [handle, record.name, record.fetchedAt]);
      localStorage.setItem(LS_KEY, JSON.stringify({ v: 3, entries }));
      if (removeLegacyAfterPersist) {
        localStorage.removeItem(LEGACY_LS_KEY);
        removeLegacyAfterPersist = false;
      }
      cacheDirty = false;
    } catch { }
  }

  function schedulePersist() {
    cacheDirty = true;
    if (persistHandle !== null) return;
    if (typeof requestIdleCallback === 'function') {
      persistUsesIdleCallback = true;
      persistHandle = requestIdleCallback(persistNow, { timeout: CFG.persistDelay });
    } else {
      persistHandle = setTimeout(persistNow, CFG.persistDelay);
    }
  }

  function mergeCacheFromStorage(event) {
    if (event.key !== LS_KEY || !event.newValue) return;
    try {
      const entries = parseV3Entries(JSON.parse(event.newValue));
      if (!entries) return;
      for (const [handle, incoming] of entries) {
        const current = nameCache.peek(handle);
        if (current && incoming.fetchedAt <= current.fetchedAt) continue;
        nameCache.set(handle, incoming);
        if ((now() - incoming.fetchedAt) < CFG.cacheTTL) {
          queuedHandles.delete(handle);
          applyNameToHandleTargets(handle, incoming.name);
          clearHandleTargets(handle);
        }
      }
    } catch { }
  }

  loadPersistentCache();
  if (cacheDirty) schedulePersist();
  addEventListener('storage', mergeCacheFromStorage);
  addEventListener('pagehide', persistNow);

  /**********************
   * Author candidates
   **********************/
  let authorState = new WeakMap(); // Element -> { handle }
  let targetInfo = new WeakMap(); // Element -> { handle, ref }
  const targetsByHandle = new Map(); // handle -> Set<WeakRef<Element>>
  const attributionState = new WeakMap(); // label -> { handle, template }

  function forEachHandleTarget(handle, callback) {
    const refs = targetsByHandle.get(handle);
    if (!refs) return false;
    let foundConnected = false;
    for (const ref of Array.from(refs)) {
      const element = ref.deref();
      if (!element) {
        refs.delete(ref);
        continue;
      }
      if (!element.isConnected) continue;
      foundConnected = true;
      callback(element);
    }
    if (!refs.size) targetsByHandle.delete(handle);
    return foundConnected;
  }

  function removeTarget(element) {
    const info = targetInfo.get(element);
    if (!info) return;
    const refs = targetsByHandle.get(info.handle);
    if (refs) {
      refs.delete(info.ref);
      if (!refs.size) targetsByHandle.delete(info.handle);
    }
    targetInfo.delete(element);
  }

  function addTarget(element, handle) {
    const existing = targetInfo.get(element);
    if (existing?.handle === handle) {
      queueHandleFetch(handle);
      return;
    }
    if (existing) removeTarget(element);

    const ref = new WeakRef(element);
    let refs = targetsByHandle.get(handle);
    if (!refs) targetsByHandle.set(handle, refs = new Set());
    refs.add(ref);
    targetInfo.set(element, { handle, ref });
    queueHandleFetch(handle);
  }

  function hasConnectedTarget(handle) {
    return forEachHandleTarget(handle, () => { });
  }

  function clearHandleTargets(handle) {
    forEachHandleTarget(handle, removeTarget);
    targetsByHandle.delete(handle);
  }

  function updateRelatedCommentAttributionLabels(authorElement, handle, name) {
    const commentRoot = authorElement.closest('ytd-comment-view-model, ytd-comment-thread-renderer');
    if (!commentRoot) return;

    for (const label of commentRoot.querySelectorAll(COMMENT_ATTRIBUTION_TEXT_SEL)) {
      let state = attributionState.get(label);
      if (!state) {
        const template = label.textContent || '';
        if (!template.includes(handle)) continue;
        state = { handle, template };
        attributionState.set(label, state);
      }
      if (state.handle !== handle) continue;
      const nextText = state.template.replaceAll(handle, name);
      if (label.textContent !== nextText) label.textContent = nextText;
      label.dataset.ytNameRestored = '1';
      label.dataset.originalHandle = handle;
    }
  }

  function applyDisplayName(authorElement, handle, name) {
    if (!authorElement.isConnected) return false;
    const state = authorState.get(authorElement);
    const currentHandle = authorElement.dataset.originalHandle
      || extractHandleFromText(authorElement.textContent);
    if (state?.handle !== handle && currentHandle !== handle) return false;

    if ((authorElement.textContent || '').trim() !== name) authorElement.textContent = name;
    authorElement.dataset.ytNameRestored = '1';
    authorElement.dataset.originalHandle = handle;
    if (authorElement.getAttribute('title') !== handle) authorElement.setAttribute('title', handle);
    authorState.set(authorElement, { handle });
    updateRelatedCommentAttributionLabels(authorElement, handle, name);
    return true;
  }

  function applyNameToHandleTargets(handle, name) {
    forEachHandleTarget(handle, (element) => applyDisplayName(element, handle, name));
  }

  function findHandleForAuthor(authorElement, explicitHandle) {
    const textHandle = extractHandleFromText(authorElement.textContent);
    if (explicitHandle && textHandle === explicitHandle) return explicitHandle;
    if (textHandle) return textHandle;

    const anchor = authorElement.closest('a');
    const hrefHandle = extractHandleFromHref(anchor?.getAttribute('href') || authorElement.getAttribute('href'));
    if (hrefHandle) return hrefHandle;

    const tickerItem = authorElement.closest(TICKER_ITEM_SEL);
    return tickerItem
      ? extractHandleFromHref(tickerItem.querySelector('a[href*="/@"]')?.getAttribute('href'))
      : null;
  }

  function considerAuthorElement(authorElement, explicitHandle = null) {
    if (!isElement(authorElement)) return;
    const handle = findHandleForAuthor(authorElement, explicitHandle);
    if (!handle) return;

    const visibleHandle = extractHandleFromText(authorElement.textContent);
    const restoredHandle = authorElement.dataset.originalHandle;
    if (visibleHandle !== handle && restoredHandle !== handle) return;

    const previous = authorState.get(authorElement);
    if (previous && previous.handle !== handle) removeTarget(authorElement);
    authorState.set(authorElement, { handle });

    const record = nameCache.get(handle);
    if (record) {
      applyDisplayName(authorElement, handle, record.name);
      if ((now() - record.fetchedAt) < CFG.cacheTTL) {
        removeTarget(authorElement);
        return;
      }
    }
    addTarget(authorElement, handle);
  }

  function getCommentAuthorTarget(link) {
    if (link.matches('ytd-author-comment-badge-renderer a#name')) {
      return link.querySelector(
        'ytd-channel-name yt-formatted-string#text,' +
        '#channel-name #text,' +
        'yt-formatted-string#text'
      ) || link;
    }

    for (let child = link.firstElementChild; child; child = child.nextElementSibling) {
      if (child.localName === 'span' || child.localName === 'yt-formatted-string') return child;
    }
    return link;
  }

  function scanLiveChatRoot(root) {
    if (!isElement(root)) return;
    if (root.matches(LIVE_CHAT_SCAN_SEL)) considerAuthorElement(root);
    for (const element of root.querySelectorAll(LIVE_CHAT_SCAN_SEL)) considerAuthorElement(element);
  }

  function scanCommentRoot(root) {
    if (!isElement(root)) return;
    if (root.matches(COMMENT_AUTHOR_LINK_SEL)) {
      considerAuthorElement(getCommentAuthorTarget(root), extractHandleFromHref(root.getAttribute('href')));
    }
    for (const link of root.querySelectorAll(COMMENT_AUTHOR_LINK_SEL)) {
      considerAuthorElement(getCommentAuthorTarget(link), extractHandleFromHref(link.getAttribute('href')));
    }
  }

  function createScanBatcher(scan) {
    const roots = new Set();
    let scheduled = false;

    function flush() {
      scheduled = false;
      const candidates = Array.from(roots).filter((root) => root.isConnected);
      roots.clear();
      const topmost = candidates.filter((root, index) =>
        !candidates.some((other, otherIndex) => otherIndex !== index && other.contains(root))
      );
      for (const root of topmost) scan(root);
    }

    return {
      enqueue(root) {
        if (!isElement(root)) return;
        roots.add(root);
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(flush);
      },
      clear() {
        roots.clear();
      },
    };
  }

  /**********************
   * Network queue
   **********************/
  const inFlight = new Map();
  const queuedHandles = new Set();
  const fetchQueue = [];
  let activeFetchCount = 0;
  let consecutiveFailures = 0;
  let cooldownUntil = 0;

  function readAttribute(tag, attribute) {
    const match = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
    return match ? match[2] : null;
  }

  function findOgTitleIncrementally(html, fromIndex) {
    const metaPattern = /<meta\b[^>]*>/gi;
    metaPattern.lastIndex = fromIndex;
    let match;
    while ((match = metaPattern.exec(html))) {
      const tag = match[0];
      if ((readAttribute(tag, 'property') || '').toLowerCase() !== 'og:title') continue;
      const name = normalizeDisplayName(readAttribute(tag, 'content'));
      return { name: name && !/^YouTube$/i.test(name) ? name : null, found: true };
    }
    return { name: null, found: false };
  }

  async function fetchDisplayNameFromNetwork(handle) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CFG.fetchTimeout);
    try {
      const response = await fetch(`https://www.youtube.com/${handle}`, {
        credentials: 'same-origin',
        signal: controller.signal,
      });
      if (!response.ok) {
        return { name: null, status: response.status, kind: 'http' };
      }

      if (!response.body?.getReader) {
        const html = (await response.text()).slice(0, CFG.maxBytesToScan);
        return { ...findOgTitleIncrementally(html, 0), status: response.status, kind: 'content' };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let html = '';
      let scannedBytes = 0;
      let scannedChunks = 0;
      let searchFrom = 0;

      while (scannedBytes <= CFG.maxBytesToScan && scannedChunks < CFG.maxChunks) {
        const { value, done } = await reader.read();
        if (done) {
          html += decoder.decode();
          const result = findOgTitleIncrementally(html, searchFrom);
          return { name: result.name, status: response.status, kind: 'content' };
        }

        scannedBytes += value.byteLength;
        scannedChunks++;
        html += decoder.decode(value, { stream: true });

        const result = findOgTitleIncrementally(html, searchFrom);
        if (result.found) {
          await reader.cancel();
          return { name: result.name, status: response.status, kind: 'content' };
        }
        searchFrom = Math.max(0, html.length - 512);
      }

      await reader.cancel();
      return { name: null, status: response.status, kind: 'content' };
    } catch (error) {
      return { name: null, status: 0, kind: error?.name === 'AbortError' ? 'timeout' : 'network' };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function isFetchSuppressed(handle) {
    const retryAt = negativeCache.get(handle);
    if (retryAt) {
      if (retryAt > now()) return true;
      negativeCache.delete(handle);
    }
    return cooldownUntil > now();
  }

  function queueHandleFetch(handle) {
    const record = nameCache.peek(handle);
    if (record && (now() - record.fetchedAt) < CFG.cacheTTL) {
      applyNameToHandleTargets(handle, record.name);
      clearHandleTargets(handle);
      return;
    }
    if (isFetchSuppressed(handle) || queuedHandles.has(handle) || inFlight.has(handle)) return;
    if (!hasConnectedTarget(handle)) return;

    queuedHandles.add(handle);
    fetchQueue.push(handle);
    pumpFetchQueue();
  }

  function handleFetchResult(handle, result) {
    if (result.name) {
      const record = { name: result.name, fetchedAt: now() };
      nameCache.set(handle, record);
      schedulePersist();
      consecutiveFailures = 0;
      applyNameToHandleTargets(handle, record.name);
      clearHandleTargets(handle);
      return;
    }

    negativeCache.set(handle, now() + CFG.negativeTTL);
    consecutiveFailures++;
    if (result.status === 403 || result.status === 429 || consecutiveFailures >= CFG.cooldownAfterFailures) {
      cooldownUntil = now() + CFG.cooldownMs;
    }
  }

  function pumpFetchQueue() {
    while (activeFetchCount < CFG.maxConcurrentFetches && fetchQueue.length) {
      const handle = fetchQueue.shift();
      queuedHandles.delete(handle);
      const cached = nameCache.peek(handle);
      if (cached && (now() - cached.fetchedAt) < CFG.cacheTTL) {
        applyNameToHandleTargets(handle, cached.name);
        clearHandleTargets(handle);
        continue;
      }
      if (isFetchSuppressed(handle) || !hasConnectedTarget(handle)) continue;

      activeFetchCount++;
      const promise = fetchDisplayNameFromNetwork(handle);
      inFlight.set(handle, promise);
      promise
        .then((result) => handleFetchResult(handle, result))
        .finally(() => {
          inFlight.delete(handle);
          activeFetchCount--;
          pumpFetchQueue();
        });
    }
  }

  /**********************
   * Comments
   **********************/
  const Comments = (() => {
    const observers = new Map();
    const batcher = createScanBatcher(scanCommentRoot);
    let reconcileScheduled = false;

    function findRoots() {
      const candidates = new Set();
      for (const root of document.querySelectorAll('ytd-comments')) candidates.add(root);

      for (const root of document.querySelectorAll('#comments')) {
        if (!root.querySelector('ytd-comments')) candidates.add(root);
      }

      for (const panel of document.querySelectorAll('ytd-engagement-panel-section-list-renderer')) {
        if (!panel.querySelector('ytd-comments') && panel.querySelector('ytd-comment-thread-renderer')) {
          candidates.add(panel);
        }
      }

      const roots = Array.from(candidates);
      return roots.filter((root, index) =>
        !roots.some((other, otherIndex) => otherIndex !== index && root.contains(other))
      );
    }

    function mayContainNewRoot(node) {
      return node.matches(COMMENT_ROOT_SEL) || !!node.querySelector(COMMENT_ROOT_SEL);
    }

    function scheduleReconcile() {
      if (reconcileScheduled) return;
      reconcileScheduled = true;
      queueMicrotask(() => {
        reconcileScheduled = false;
        reconcile();
      });
    }

    function makeObserver() {
      return new MutationObserver((mutations) => {
        let shouldReconcile = false;
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (!isElement(node)) continue;
            batcher.enqueue(node);
            if (!shouldReconcile && mayContainNewRoot(node)) shouldReconcile = true;
          }
        }
        if (shouldReconcile) scheduleReconcile();
      });
    }

    function reconcile() {
      const desiredRoots = new Set(findRoots());
      for (const [root, observer] of observers) {
        if (desiredRoots.has(root) && root.isConnected) continue;
        observer.disconnect();
        observers.delete(root);
      }

      for (const root of desiredRoots) {
        if (observers.has(root)) continue;
        const observer = makeObserver();
        observer.observe(root, { childList: true, subtree: true });
        observers.set(root, observer);
        batcher.enqueue(root);
      }
    }

    function reset() {
      for (const observer of observers.values()) observer.disconnect();
      observers.clear();
      batcher.clear();
      reconcileScheduled = false;
    }

    return { reconcile, reset };
  })();

  /**********************
   * Live chat
   **********************/
  const LiveChat = (() => {
    const batcher = createScanBatcher(scanLiveChatRoot);
    let root = null;
    let rootObserver = null;
    let discoveryObserver = null;

    function attach() {
      const found = document.querySelector('yt-live-chat-app');
      if (!found) {
        if (!document.documentElement || discoveryObserver) return;
        discoveryObserver = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (!isElement(node)) continue;
              if (node.matches('yt-live-chat-app') || node.querySelector('yt-live-chat-app')) {
                attach();
                return;
              }
            }
          }
        });
        discoveryObserver.observe(document.documentElement, { childList: true, subtree: true });
        return;
      }

      if (root === found && rootObserver) return;
      discoveryObserver?.disconnect();
      discoveryObserver = null;
      rootObserver?.disconnect();
      root = found;
      rootObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (isElement(node)) batcher.enqueue(node);
          }
        }
      });
      rootObserver.observe(root, { childList: true, subtree: true });
      batcher.enqueue(root);
    }

    function reset() {
      rootObserver?.disconnect();
      discoveryObserver?.disconnect();
      rootObserver = null;
      discoveryObserver = null;
      root = null;
      batcher.clear();
    }

    return { attach, reset };
  })();

  /**********************
   * Lifecycle
   **********************/
  const YT_ACTIONS = new Set([
    'yt-append-continuation-items-action',
    'yt-reload-continuation-items-command',
    'yt-history-load',
    'yt-get-multi-page-menu-action',
    'yt-create-comment-action',
    'yt-create-comment-reply-action',
  ]);

  function isLiveChatPage() {
    return location.pathname === '/live_chat' || location.pathname === '/live_chat_replay';
  }

  function clearDomCandidates() {
    targetsByHandle.clear();
    authorState = new WeakMap();
    targetInfo = new WeakMap();
  }

  function initializeCurrentSurface() {
    if (isLiveChatPage()) {
      Comments.reset();
      LiveChat.attach();
    } else {
      LiveChat.reset();
      Comments.reconcile();
    }
  }

  document.addEventListener('yt-action', (event) => {
    if (isLiveChatPage()) return;
    const actionName = event?.detail?.actionName;
    if (YT_ACTIONS.has(actionName)) Comments.reconcile();
  });

  document.addEventListener('yt-engagement-panel-visibility-change', () => {
    if (!isLiveChatPage()) Comments.reconcile();
  });

  document.addEventListener('yt-navigate-finish', () => {
    Comments.reset();
    LiveChat.reset();
    clearDomCandidates();
    initializeCurrentSurface();
  });

  initializeCurrentSurface();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCurrentSurface, { once: true });
  }
})();
