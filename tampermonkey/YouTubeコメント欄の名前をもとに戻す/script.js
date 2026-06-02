// ==UserScript==
// @name         YouTubeコメント欄の名前をもとに戻す＋
// @namespace    https://example.com/
// @version      1.0.6
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

  const CFG = {
    memCacheMax: 20000,
    lsCacheMax: 3000,
    negCacheMax: 20000,
    negativeTTL: 5 * 60 * 1000,
    reattachInterval: 900,
    startupReattachMs: 15000,
    navigateReattachMs: 12000,
    actionReattachMs: 4000,
    maxConcurrentFetches: 4,
    fetchTimeout: 7000,
    maxBytesToScan: 700 * 1024,
    maxChunks: 80,
    persistDebounce: 5000,
    scanDebounceMs: 120,
    scanMaxPerPass: 1200,
  };

  const now = () => Date.now();
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const isElement = (n) => n && n.nodeType === 1;

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
  const COMMENT_ATTRIBUTION_TEXT_SEL =
    'ytd-pinned-comment-badge-renderer #label';
  const decodeCache = new Map();
  const DECODE_CACHE_MAX = 2000;

  function decodeEntities(s) {
    if (s == null) return '';
    const text = String(s);
    if (!text.includes('&')) return text;

    const cached = decodeCache.get(text);
    if (cached !== undefined) return cached;

    const named = {
      amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0',
      hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
      laquo: '«', raquo: '»', middot: '·', bull: '•',
      copy: '©', reg: '®', trade: '™', deg: '°', plusmn: '±', times: '×', divide: '÷', micro: 'µ',
      yen: '¥', euro: '€', pound: '£', cent: '¢',
      frac14: '¼', frac12: '½', frac34: '¾', sup1: '¹', sup2: '²', sup3: '³',
    };

    let decoded = text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/g, (match, entity) => {
      if (entity[0] === '#') {
        const isHex = (entity[1] || '').toLowerCase() === 'x';
        const num = parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10);
        if (!Number.isFinite(num)) return match;
        try { return String.fromCodePoint(num); } catch { return match; }
      }
      const key = entity.toLowerCase();
      return Object.prototype.hasOwnProperty.call(named, key) ? named[key] : match;
    });

    if (/&[a-zA-Z][a-zA-Z0-9]+;/.test(decoded)) {
      try {
        const doc = new DOMParser().parseFromString(`<textarea>${decoded}</textarea>`, 'text/html');
        const textarea = doc && doc.querySelector('textarea');
        if (textarea && typeof textarea.value === 'string') decoded = textarea.value;
      } catch { }
    }

    decodeCache.set(text, decoded);
    if (decodeCache.size > DECODE_CACHE_MAX) {
      const firstKey = decodeCache.keys().next().value;
      if (firstKey !== undefined) decodeCache.delete(firstKey);
    }
    return decoded;
  }

  function normalizeDisplayName(name) {
    let normalized = String(name || '');
    for (let i = 0; i < 4 && normalized.includes('&'); i++) {
      const decoded = decodeEntities(normalized);
      if (decoded === normalized) break;
      normalized = decoded;
    }
    return normalized.trim();
  }

  function isHandleText(s) {
    const t = (s || '').trim();
    return t.startsWith('@') && t.length >= 3;
  }

  function extractHandleFromText(text) {
    const t = (text || '').trim();
    return isHandleText(t) ? t.replace(/\s+/g, '') : null;
  }

  function extractHandleFromHref(href) {
    const m = href && href.match(/\/@([A-Za-z0-9._-]{2,})/);
    return m ? '@' + m[1] : null;
  }

  function replaceAllLiteral(text, needle, replacement) {
    return String(text || '').split(needle).join(replacement);
  }

  class LRU {
    constructor(max) { this.max = max; this.map = new Map(); }
    get(key) {
      const v = this.map.get(key);
      if (v === undefined) return undefined;
      this.map.delete(key);
      this.map.set(key, v);
      return v;
    }
    set(key, val) {
      if (this.map.has(key)) this.map.delete(key);
      this.map.set(key, val);
      if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    }
    entries() { return Array.from(this.map.entries()); }
    load(entries) {
      this.map.clear();
      for (const [k, v] of entries) this.map.set(k, v);
      while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    }
  }

  // handle -> displayName (string)
  const memCache = new LRU(CFG.memCacheMax);
  const lsCache = new LRU(CFG.lsCacheMax);
  // handle -> timestamp (ms)
  const negCache = new LRU(CFG.negCacheMax);

  const LS_KEY = 'yt_handle_to_display_name_cache_v2';
  let persistTimer = null;

  function loadPersistentCache() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== 2 || !Array.isArray(parsed.entries)) return;
      let changed = false;
      const entries = parsed.entries.map(([handle, name]) => {
        const normalizedName = normalizeDisplayName(name);
        if (normalizedName !== name) changed = true;
        return [handle, normalizedName];
      });
      lsCache.load(entries);
      if (changed) schedulePersist();
    } catch { }
  }

  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({ v: 2, entries: lsCache.entries() }));
      } catch { }
    }, CFG.persistDebounce);
  }

  loadPersistentCache();

  const inFlight = new Map(); // handle -> Promise<string|null>
  const fetchQueue = [];
  let activeFetchCount = 0;
  const authorQueue = new Set();
  const authorState = new WeakMap(); // Element -> { handle, pending?, checkedAt? }
  let authorQueueScheduled = false;

  const OG_TITLE_RE = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i;
  function extractOgTitleFromHtml(html) {
    if (!html) return null;
    const m = html.match(OG_TITLE_RE);
    if (!m) return null;
    const name = normalizeDisplayName(m[1] || '').replace(/\s+-\s+YouTube\s*$/i, '').trim();
    if (!name || /^YouTube$/i.test(name)) return null;
    return name;
  }

  function scheduleAuthorQueueFlush() {
    if (authorQueueScheduled) return;
    authorQueueScheduled = true;
    requestAnimationFrame(() => {
      authorQueueScheduled = false;
      const batch = Array.from(authorQueue);
      authorQueue.clear();
      for (const el of batch) processAuthorElement(el);
    });
  }

  function enqueueAuthorElement(el) {
    if (!isElement(el)) return;
    authorQueue.add(el);
    scheduleAuthorQueueFlush();
  }

  function pumpFetchQueue() {
    while (activeFetchCount < CFG.maxConcurrentFetches && fetchQueue.length) {
      const job = fetchQueue.shift();
      activeFetchCount++;
      fetchDisplayNameFromNetwork(job.handle)
        .then(job.resolve, () => job.resolve(null))
        .finally(() => {
          activeFetchCount--;
          pumpFetchQueue();
        });
    }
  }

  async function fetchDisplayNameFromNetwork(handle) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => { try { controller.abort(); } catch { } }, CFG.fetchTimeout);
    try {
      const res = await fetch(`https://www.youtube.com/${handle}`, {
        credentials: 'include',
        signal: controller.signal,
      });

      const body = res.body;
      if (!body || !body.getReader) {
        return extractOgTitleFromHtml(await res.text());
      }

      const reader = body.getReader();
      const decoder = new TextDecoder('utf-8');
      let scannedBytes = 0, scannedChunks = 0, buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        scannedChunks++;
        scannedBytes += value.byteLength;
        buffer += decoder.decode(value, { stream: true });

        const name = extractOgTitleFromHtml(buffer);
        if (name) {
          try { controller.abort(); } catch { }
          return name;
        }

        if (scannedBytes > CFG.maxBytesToScan || scannedChunks > CFG.maxChunks) break;
        if (buffer.length > 250000) buffer = buffer.slice(-120000);
      }

      return extractOgTitleFromHtml(buffer);
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function fetchDisplayNameByHandle(handle) {
    const mc = memCache.get(handle);
    if (mc) return normalizeDisplayName(mc);

    const lc = lsCache.get(handle);
    if (lc) {
      const name = normalizeDisplayName(lc);
      memCache.set(handle, name);
      if (name !== lc) {
        lsCache.set(handle, name);
        schedulePersist();
      }
      return name;
    }

    const nts = negCache.get(handle);
    if (nts && (now() - nts) < CFG.negativeTTL) return null;

    if (inFlight.has(handle)) return inFlight.get(handle);

    const p = new Promise((resolve) => {
      fetchQueue.push({ handle, resolve });
      pumpFetchQueue();
    });

    inFlight.set(handle, p);
    try {
      const name = await p;
      if (name) {
        const normalizedName = normalizeDisplayName(name);
        memCache.set(handle, normalizedName);
        lsCache.set(handle, normalizedName);
        schedulePersist();
        return normalizedName;
      }
      negCache.set(handle, now());
      return null;
    } finally {
      inFlight.delete(handle);
    }
  }

  async function processAuthorElement(authorEl) {
    if (!isElement(authorEl)) return;

    const text = (authorEl.textContent || '').trim();
    if (!isHandleText(text)) return;

    let handle = extractHandleFromText(text);
    if (!handle) {
      const anchor = authorEl.closest('a');
      const href = anchor ? anchor.getAttribute('href') : authorEl.getAttribute('href');
      handle = extractHandleFromHref(href);
    }
    if (!handle) {
      const tickerItem = authorEl.closest(TICKER_ITEM_SEL);
      if (tickerItem) {
        const link = tickerItem.querySelector('a[href*="/@"]');
        if (link) handle = extractHandleFromHref(link.getAttribute('href'));
      }
    }
    if (!handle) return;

    const state = authorState.get(authorEl);
    if (state && state.handle === handle) {
      if (state.pending) return;
      if (state.checkedAt && (now() - state.checkedAt) < CFG.negativeTTL) return;
    }

    authorState.set(authorEl, { handle, pending: true });
    const name = await fetchDisplayNameByHandle(handle);

    const latestState = authorState.get(authorEl);
    if (!latestState || latestState.handle !== handle || !latestState.pending) return;
    if (!name) {
      authorState.set(authorEl, { handle, checkedAt: now() });
      return;
    }

    const latestText = (authorEl.textContent || '').trim();
    if (extractHandleFromText(latestText) !== handle) {
      authorState.delete(authorEl);
      return;
    }

    authorEl.textContent = name;
    authorEl.dataset.ytNameRestored = '1';
    authorEl.dataset.originalHandle = handle;
    try { authorEl.setAttribute('title', handle); } catch { }
    updateRelatedCommentAttributionLabels(authorEl, handle, name);
    authorState.delete(authorEl);
  }

  function queueAuthorCandidatesUnder(root, selector) {
    if (!isElement(root)) return;
    if (root.matches(selector)) enqueueAuthorElement(root);
    for (const el of root.querySelectorAll(selector)) enqueueAuthorElement(el);
  }

  function updateRelatedCommentAttributionLabels(authorEl, handle, name) {
    const commentRoot = authorEl.closest('ytd-comment-view-model, ytd-comment-thread-renderer');
    if (!commentRoot) return;

    for (const label of commentRoot.querySelectorAll(COMMENT_ATTRIBUTION_TEXT_SEL)) {
      const text = label.textContent || '';
      if (!text.includes(handle)) continue;
      label.textContent = replaceAllLiteral(text, handle, name);
      label.dataset.ytNameRestored = '1';
      label.dataset.originalHandle = handle;
    }
  }

  function getCommentAuthorTarget(link) {
    if (link.matches('ytd-author-comment-badge-renderer a#name')) {
      return link.querySelector(
        'ytd-channel-name yt-formatted-string#text,' +
        '#channel-name #text,' +
        'yt-formatted-string#text'
      ) || link;
    }

    let child = link.firstElementChild;
    while (child) {
      const tag = child.localName;
      if (tag === 'span' || tag === 'yt-formatted-string') return child;
      child = child.nextElementSibling;
    }
    return link;
  }

  function queueCommentAuthorsUnder(root, remaining = Infinity) {
    if (!isElement(root) || remaining <= 0) return remaining;

    if (root.matches(COMMENT_AUTHOR_LINK_SEL)) {
      enqueueAuthorElement(getCommentAuthorTarget(root));
      remaining--;
    }
    if (remaining <= 0) return remaining;

    for (const link of root.querySelectorAll(COMMENT_AUTHOR_LINK_SEL)) {
      enqueueAuthorElement(getCommentAuthorTarget(link));
      remaining--;
      if (remaining <= 0) break;
    }
    return remaining;
  }

  /**********************
   * Live Chat Module
   **********************/
  const LiveChat = (() => {
    const REPLY_PANEL_SEL = 'ytd-engagement-panel-section-list-renderer[target-id="PAreply_thread"]';
    const WATCH = [
      { sel: '#item-list #items', opts: { childList: true, subtree: false } },
      { sel: 'yt-live-chat-banner-manager', opts: { childList: true, subtree: true } },
      { sel: 'yt-live-chat-ticker-renderer #ticker-items', opts: { childList: true, subtree: true } },
      { sel: 'yt-live-chat-pinned-message-renderer#pinned-message', opts: { childList: true, subtree: true } },
      {
        sel: REPLY_PANEL_SEL,
        opts: { childList: true, subtree: true, attributes: true, attributeFilter: ['visibility'] },
        watchAttrs: true,
      },
    ];
    const slots = WATCH.map(() => ({ el: null, mo: null }));
    let rootObserver = null;
    let rootObserverTarget = null;

    const nodeQueue = new Set();
    let rafScheduled = false;

    function enqueueNode(node) {
      if (!node) return;
      nodeQueue.add(node);
      if (rafScheduled) return;
      rafScheduled = true;
      requestAnimationFrame(() => {
        rafScheduled = false;
        const nodes = Array.from(nodeQueue);
        nodeQueue.clear();
        for (const n of nodes) scanAndProcessAuthorElements(n);
      });
    }

    function scanAndProcessAuthorElements(root) {
      queueAuthorCandidatesUnder(root, LIVE_CHAT_SCAN_SEL);
    }

    function makeObserver(watchAttrs) {
      return new MutationObserver((mutList) => {
        for (const mut of mutList) {
          for (const node of mut.addedNodes) {
            if (isElement(node)) enqueueNode(node);
          }
          if (watchAttrs && mut.type === 'attributes' && isElement(mut.target)) enqueueNode(mut.target);
        }
      });
    }

    function findRelatedReplyPanel(node) {
      if (!isElement(node)) return null;
      if (node.matches(REPLY_PANEL_SEL)) return node;
      const closest = node.closest(REPLY_PANEL_SEL);
      if (closest) return closest;
      return node.querySelector(REPLY_PANEL_SEL);
    }

    function attachRootObserverIfNeeded() {
      const root = document.querySelector('yt-live-chat-app') || document.body || document.documentElement;
      if (!root || rootObserverTarget === root) return;

      if (rootObserver) { try { rootObserver.disconnect(); } catch { } }
      rootObserverTarget = root;
      rootObserver = new MutationObserver((mutList) => {
        let shouldAttach = false;
        for (const mut of mutList) {
          if (mut.type === 'attributes') {
            const panel = findRelatedReplyPanel(mut.target);
            if (panel) {
              shouldAttach = true;
              enqueueNode(panel);
            }
          }
          for (const node of mut.addedNodes) {
            const panel = findRelatedReplyPanel(node);
            if (!panel) continue;
            shouldAttach = true;
            enqueueNode(panel);
          }
        }
        if (shouldAttach) attachObserverIfNeeded();
      });
      rootObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['visibility'] });
    }

    function attachObserverIfNeeded() {
      attachRootObserverIfNeeded();
      for (let i = 0; i < WATCH.length; i++) {
        const spec = WATCH[i];
        const slot = slots[i];
        const found = document.querySelector(spec.sel);
        if (!found || (slot.el === found && slot.mo)) continue;
        if (slot.mo) { try { slot.mo.disconnect(); } catch { } }
        slot.el = found;
        slot.mo = makeObserver(spec.watchAttrs);
        slot.mo.observe(found, spec.opts);
        enqueueNode(found);
      }
    }

    function reset() {
      for (const slot of slots) {
        if (slot.mo) { try { slot.mo.disconnect(); } catch { } }
        slot.el = null;
        slot.mo = null;
      }
      if (rootObserver) { try { rootObserver.disconnect(); } catch { } }
      rootObserver = null;
      rootObserverTarget = null;
    }

    return { attachObserverIfNeeded, reset };
  })();

  /**********************
   * Comments Module
   **********************/
  const Comments = (() => {
    const observers = new Map(); // Element -> MutationObserver
    const pendingRoots = new Set();
    let scanTimer = null;
    let scanDueAt = 0;
    let lastScanAt = 0;

    function flushPendingRoots() {
      scanTimer = null;
      scanDueAt = 0;
      lastScanAt = now();
      attachObserversIfNeeded(false);

      let remaining = CFG.scanMaxPerPass;
      const roots = pendingRoots.size ? Array.from(pendingRoots) : findLikelyCommentContainers();
      pendingRoots.clear();

      for (let i = 0; i < roots.length; i++) {
        const root = roots[i];
        remaining = queueCommentAuthorsUnder(root, remaining);
        if (remaining <= 0) {
          pendingRoots.add(root);
          for (let j = i + 1; j < roots.length; j++) pendingRoots.add(roots[j]);
          break;
        }
      }

      if (pendingRoots.size) scheduleScan(CFG.scanDebounceMs);
    }

    function scheduleScan(delay = 0) {
      const dueAt = now() + Math.max(delay, CFG.scanDebounceMs - (now() - lastScanAt));
      if (scanTimer && dueAt >= scanDueAt) return;
      if (scanTimer) clearTimeout(scanTimer);
      scanDueAt = dueAt;
      scanTimer = setTimeout(flushPendingRoots, Math.max(0, dueAt - now()));
    }

    function findLikelyCommentContainers() {
      const targets = new Set();
      const commentsRoot = document.querySelector('#comments');
      if (commentsRoot) targets.add(commentsRoot);
      const ytdComments = document.querySelector('ytd-comments');
      if (ytdComments) targets.add(ytdComments);
      const firstThread = document.querySelector('ytd-comment-thread-renderer');
      if (firstThread) {
        const panel = firstThread.closest('ytd-engagement-panel-section-list-renderer');
        if (panel) targets.add(panel);
        const itemSection = firstThread.closest('ytd-item-section-renderer');
        if (itemSection) targets.add(itemSection);
      }
      return Array.from(targets);
    }

    function attachObserversIfNeeded(shouldSchedule = true) {
      let queuedNewRoot = false;
      for (const c of findLikelyCommentContainers()) {
        if (observers.has(c)) continue;
        const mo = new MutationObserver((mutList) => {
          let sawElement = false;
          for (const mut of mutList) {
            for (const node of mut.addedNodes) {
              if (!isElement(node)) continue;
              pendingRoots.add(node);
              sawElement = true;
            }
          }
          if (sawElement) scheduleScan();
        });
        mo.observe(c, { childList: true, subtree: true });
        observers.set(c, mo);
        pendingRoots.add(c);
        queuedNewRoot = true;
      }
      for (const [el, mo] of observers) {
        if (!document.contains(el)) {
          try { mo.disconnect(); } catch { }
          observers.delete(el);
        }
      }
      if (queuedNewRoot && shouldSchedule) scheduleScan();
    }

    function reset() {
      for (const mo of observers.values()) {
        try { mo.disconnect(); } catch { }
      }
      observers.clear();
      pendingRoots.clear();
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = null;
      scanDueAt = 0;
      lastScanAt = 0;
    }

    return { attachObserversIfNeeded, reset, scheduleScan };
  })();

  let reattachTimer = null;
  let reattachUntil = 0;

  function runAttachPass() {
    LiveChat.attachObserverIfNeeded();
    Comments.attachObserversIfNeeded();
  }

  function scheduleReattachBurst(durationMs) {
    const until = now() + durationMs;
    if (until > reattachUntil) reattachUntil = until;
    if (reattachTimer) return;

    const tick = () => {
      reattachTimer = null;
      runAttachPass();
      if (now() < reattachUntil) {
        reattachTimer = setTimeout(tick, CFG.reattachInterval);
      }
    };

    tick();
  }

  /**********************
   * yt-action / yt-navigate-finish hooks
   **********************/
  const YT_ACTION_DELAYS = new Map([
    ['yt-append-continuation-items-action', 350],
    ['yt-reload-continuation-items-command', 120],
    ['yt-history-load', 120],
    ['yt-get-multi-page-menu-action', 120],
    ['yt-create-comment-action', 120],
    ['yt-create-comment-reply-action', 120],
  ]);

  function hookYouTubeEvents() {
    document.addEventListener('yt-action', (e) => {
      const name = e && e.detail && e.detail.actionName;
      const delay = YT_ACTION_DELAYS.get(name);
      if (delay !== undefined) {
        scheduleReattachBurst(CFG.actionReattachMs);
        Comments.scheduleScan(delay);
      }
    });

    document.addEventListener('yt-navigate-finish', () => {
      LiveChat.reset();
      Comments.reset();
      setTimeout(() => {
        scheduleReattachBurst(CFG.navigateReattachMs);
        Comments.scheduleScan(80);
      }, 80);
    });
  }

  async function bootstrap() {
    hookYouTubeEvents();

    while (!document.documentElement) await sleep(20);

    scheduleReattachBurst(CFG.startupReattachMs);
    Comments.scheduleScan(200);

    document.addEventListener('DOMContentLoaded', () => {
      scheduleReattachBurst(CFG.startupReattachMs);
      Comments.scheduleScan(120);
    }, { once: true });
  }

  bootstrap().catch(() => { });
})();
