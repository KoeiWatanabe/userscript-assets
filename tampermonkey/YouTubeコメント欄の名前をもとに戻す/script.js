// ==UserScript==
// @name         YouTubeコメント欄の名前をもとに戻す＋
// @namespace    https://example.com/
// @version      1.0.0
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

  /**********************
   * Config
   **********************/
  const CFG = {
    // LRU sizes
    memCacheMax: 20000,
    lsCacheMax: 3000,

    // Negative cache TTL (ms)
    negativeTTL: 5 * 60 * 1000, // 5 min

    // Reattach check interval (ms)
    reattachInterval: 900,

    // Fetch timeout (ms)
    fetchTimeout: 7000,

    // Streaming safety limits
    maxBytesToScan: 700 * 1024, // stop scanning after ~700KB
    maxChunks: 80,              // stop after N chunks (safety)

    // Persist debounce (ms)
    persistDebounce: 5000,

    // Scan throttling
    scanDebounceMs: 120,
    scanMaxPerPass: 1200,       // safety: per full scan
  };

  /**********************
   * Tiny utils
   **********************/
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const now = () => Date.now();

  // decode cache: avoids repeated parsing work
  const _decodeCache = new Map();
  const _DECODE_CACHE_MAX = 2000;

  function decodeHtmlEntities(str) {
    if (str == null) return '';
    const s0 = String(str);
    if (s0.indexOf('&') === -1) return s0;

    const cached = _decodeCache.get(s0);
    if (cached !== undefined) return cached;

    const named = {
      amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0',
      hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
      laquo: '«', raquo: '»', middot: '·', bull: '•',
      copy: '©', reg: '®', trade: '™', deg: '°', plusmn: '±', times: '×', divide: '÷', micro: 'µ',
      yen: '¥', euro: '€', pound: '£', cent: '¢',
      frac14: '¼', frac12: '½', frac34: '¾', sup1: '¹', sup2: '²', sup3: '³',
    };

    const replaced = s0.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/g, (m, g1) => {
      if (!g1) return m;
      if (g1[0] === '#') {
        const hex = (g1[1] || '').toLowerCase() === 'x';
        const numStr = hex ? g1.slice(2) : g1.slice(1);
        const cp = parseInt(numStr, hex ? 16 : 10);
        if (!Number.isFinite(cp)) return m;
        try { return String.fromCodePoint(cp); } catch (_) { return m; }
      }
      const key = g1.toLowerCase();
      return Object.prototype.hasOwnProperty.call(named, key) ? named[key] : m;
    });

    let out = replaced;
    if (/[&][a-zA-Z][a-zA-Z0-9]+;/.test(out)) {
      try {
        const doc = new DOMParser().parseFromString(`<textarea>${out}</textarea>`, 'text/html');
        const ta = doc && doc.querySelector('textarea');
        if (ta && typeof ta.value === 'string') out = ta.value;
      } catch (_) { }
    }

    _decodeCache.set(s0, out);
    if (_decodeCache.size > _DECODE_CACHE_MAX) {
      const firstKey = _decodeCache.keys().next().value;
      if (firstKey !== undefined) _decodeCache.delete(firstKey);
    }
    return out;
  }

  function safeDecode(s) {
    try { return decodeHtmlEntities(s); } catch (_) { return String(s ?? ''); }
  }

  function normalizeTitleToDisplayName(title) {
    const t = title.trim();
    return t.replace(/\s+-\s+YouTube\s*$/i, '').trim();
  }

  function isHandleText(s) {
    if (!s) return false;
    const t = s.trim();
    return t.startsWith('@') && t.length >= 3;
  }

  function extractHandleFromText(text) {
    const t = (text || '').trim();
    if (!isHandleText(t)) return null;
    return t.replace(/\s+/g, '');
  }

  function extractHandleFromHref(href) {
    if (!href) return null;
    const m = href.match(/\/@([A-Za-z0-9._-]{2,})/);
    return m ? '@' + m[1] : null;
  }

  function isElement(node) {
    return node && node.nodeType === 1;
  }

  /**********************
   * LRU Cache (Map-based)
   **********************/
  class LRU {
    constructor(max) {
      this.max = max;
      this.map = new Map();
    }
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
      if (this.map.size > this.max) {
        const oldest = this.map.keys().next().value;
        this.map.delete(oldest);
      }
    }
    delete(key) { this.map.delete(key); }
    entriesArray() { return Array.from(this.map.entries()); }
    loadFromEntries(entries) {
      this.map.clear();
      for (const [k, v] of entries) this.map.set(k, v);
      while (this.map.size > this.max) {
        const oldest = this.map.keys().next().value;
        this.map.delete(oldest);
      }
    }
  }

  /**********************
   * Caches
   **********************/
  const memCache = new LRU(CFG.memCacheMax); // handle -> {name, ts}
  const negCache = new LRU(20000);           // handle -> {ts}

  // localStorage persistent cache
  const LS_KEY = 'yt_handle_to_display_name_cache_v1';
  const lsCache = new LRU(CFG.lsCacheMax);
  let persistTimer = null;

  function loadPersistentCache() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.entries)) return;
      lsCache.loadFromEntries(parsed.entries);
    } catch (_) { }
  }

  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      try {
        const payload = { v: 1, entries: lsCache.entriesArray() };
        localStorage.setItem(LS_KEY, JSON.stringify(payload));
      } catch (_) { }
    }, CFG.persistDebounce);
  }

  loadPersistentCache();

  /**********************
   * Networking (streaming og:title sniff) - from your live chat script
   **********************/
  const inFlight = new Map(); // handle -> Promise<string|null>

  async function fetchDisplayNameByHandle(handle) {
    // 1) memory cache
    const mc = memCache.get(handle);
    if (mc && mc.name) return mc.name;

    // 2) persistent cache
    const lc = lsCache.get(handle);
    if (lc && lc.name) {
      memCache.set(handle, lc);
      return lc.name;
    }

    // 3) negative cache
    const nc = negCache.get(handle);
    if (nc && (now() - nc.ts) < CFG.negativeTTL) return null;

    // 4) inFlight dedupe
    if (inFlight.has(handle)) return inFlight.get(handle);

    const p = (async () => {
      const url = `https://www.youtube.com/${handle}`; // handle includes '@'
      const controller = new AbortController();

      const timeoutId = setTimeout(() => {
        try { controller.abort(); } catch (_) { }
      }, CFG.fetchTimeout);

      try {
        const res = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          signal: controller.signal,
        });

        const body = res.body;
        if (!body || !body.getReader) {
          const text = await res.text();
          return extractOgTitleFromHtml(text);
        }

        const reader = body.getReader();
        const decoder = new TextDecoder('utf-8');
        let scannedBytes = 0;
        let scannedChunks = 0;
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          scannedChunks++;
          scannedBytes += value.byteLength;
          buffer += decoder.decode(value, { stream: true });

          const name = extractOgTitleFromHtml(buffer);
          if (name) {
            try { controller.abort(); } catch (_) { }
            return name;
          }

          if (scannedBytes > CFG.maxBytesToScan || scannedChunks > CFG.maxChunks) break;
          if (buffer.length > 250000) buffer = buffer.slice(-120000);
        }

        return extractOgTitleFromHtml(buffer);
      } catch (_) {
        return null;
      } finally {
        clearTimeout(timeoutId);
      }
    })();

    inFlight.set(handle, p);

    try {
      const name = await p;
      if (name) {
        const record = { name, ts: now() };
        memCache.set(handle, record);
        lsCache.set(handle, record);
        schedulePersist();
        return name;
      } else {
        negCache.set(handle, { ts: now() });
        return null;
      }
    } finally {
      inFlight.delete(handle);
    }
  }

  function extractOgTitleFromHtml(html) {
    if (!html) return null;
    const re = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i;
    const m = html.match(re);
    if (!m) return null;

    const raw = safeDecode(m[1] || '');
    const name = normalizeTitleToDisplayName(raw);
    if (!name || /^YouTube$/i.test(name)) return null;
    return name;
  }

  /**********************
   * Generic “author element” processor
   **********************/
  async function processAuthorElement(authorEl) {
    if (!isElement(authorEl)) return;

    const text = (authorEl.textContent || '').trim();

    let handle = extractHandleFromText(text);

    if (!handle) {
      const anchor = authorEl.closest ? authorEl.closest('a') : null;
      const href = (anchor && anchor.getAttribute) ? anchor.getAttribute('href') : authorEl.getAttribute?.('href');
      handle = extractHandleFromHref(href);
    }
    if (!handle) return;

    // Only act if currently showing handle (avoid re-writing already-names)
    if (!isHandleText(text)) return;

    if (authorEl.dataset && authorEl.dataset.ytNameRestored === '1') return;

    const name = await fetchDisplayNameByHandle(handle);
    if (!name) return;

    // Re-check the element still shows the same handle
    const latestText = (authorEl.textContent || '').trim();
    if (extractHandleFromText(latestText) !== handle) return;

    authorEl.textContent = name;
    if (authorEl.dataset) {
      authorEl.dataset.ytNameRestored = '1';
      authorEl.dataset.originalHandle = handle;
    }
    try { authorEl.setAttribute('title', handle); } catch (_) { }
  }

  /**********************
   * Live Chat Module
   **********************/
  const LiveChat = (() => {
    let itemsEl = null;
    let observer = null;

    const nodeQueue = new Set();
    let rafScheduled = false;

    function enqueueNode(node) {
      if (!node) return;
      nodeQueue.add(node);
      if (!rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(flushQueue);
      }
    }

    function flushQueue() {
      rafScheduled = false;
      if (nodeQueue.size === 0) return;

      const nodes = Array.from(nodeQueue);
      nodeQueue.clear();

      for (const n of nodes) scanAndProcessAuthorElements(n);
    }

    function scanAndProcessAuthorElements(root) {
      if (!isElement(root)) return;

      const authorEls = [];

      if (root.matches && root.matches('yt-live-chat-author-chip #author-name, #author-name')) {
        authorEls.push(root);
      }

      const found = root.querySelectorAll
        ? root.querySelectorAll('yt-live-chat-author-chip #author-name, a#author-name, span#author-name')
        : [];
      for (const el of found) authorEls.push(el);

      if (authorEls.length === 0) return;

      for (const el of authorEls) processAuthorElement(el);
    }

    function findItemsElement() {
      return document.querySelector('#items');
    }

    function attachObserverIfNeeded() {
      const found = findItemsElement();
      if (!found) return;

      if (itemsEl === found && observer) return;

      if (observer) {
        try { observer.disconnect(); } catch (_) { }
        observer = null;
      }

      itemsEl = found;

      observer = new MutationObserver((mutList) => {
        for (const mut of mutList) {
          for (const node of mut.addedNodes) enqueueNode(node);
        }
      });

      observer.observe(itemsEl, { childList: true, subtree: false });
      enqueueNode(itemsEl);
    }

    function reset() {
      if (observer) {
        try { observer.disconnect(); } catch (_) { }
        observer = null;
      }
      itemsEl = null;
    }

    return { attachObserverIfNeeded, reset };
  })();

  /**********************
   * Comments Module
   **********************/
  const Comments = (() => {
    // We try to observe a reasonably scoped container when possible.
    // If we can’t find a stable root, yt-action + periodic scan acts as fallback.
    const observers = new Map(); // Element -> MutationObserver

    let scanTimer = null;
    let lastScanAt = 0;

    function scheduleScan(delay = 0) {
      const t = now();
      const dueIn = Math.max(delay, CFG.scanDebounceMs - (t - lastScanAt));
      if (scanTimer) return;
      scanTimer = setTimeout(() => {
        scanTimer = null;
        lastScanAt = now();
        scanAllCommentAuthors();
      }, dueIn);
    }

    function findLikelyCommentContainers() {
      const targets = new Set();

      // Common watch page comments root
      const commentsRoot = document.querySelector('#comments');
      if (commentsRoot) targets.add(commentsRoot);

      // Sometimes ytd-comments exists
      const ytdComments = document.querySelector('ytd-comments');
      if (ytdComments) targets.add(ytdComments);

      // Shorts / engagement panels often contain comment threads
      const firstThread = document.querySelector('ytd-comment-thread-renderer');
      if (firstThread) {
        const panel = firstThread.closest('ytd-engagement-panel-section-list-renderer');
        if (panel) targets.add(panel);
        const itemSection = firstThread.closest('ytd-item-section-renderer');
        if (itemSection) targets.add(itemSection);
      }

      return Array.from(targets).filter(Boolean);
    }

    function attachObserversIfNeeded() {
      const containers = findLikelyCommentContainers();
      for (const c of containers) {
        if (!isElement(c)) continue;
        if (observers.has(c)) continue;

        const mo = new MutationObserver((mutList) => {
          for (const mut of mutList) {
            for (const node of mut.addedNodes) {
              // Only scan the new subtree
              scanCommentAuthorsUnder(node);
            }
          }
        });

        // Comments DOM can update deep; subtree true is needed, but we keep it scoped to container
        mo.observe(c, { childList: true, subtree: true });
        observers.set(c, mo);

        // Initial scan of this container
        scanCommentAuthorsUnder(c);
      }

      // Clean up removed containers
      for (const [el, mo] of observers.entries()) {
        if (!document.contains(el)) {
          try { mo.disconnect(); } catch (_) { }
          observers.delete(el);
        }
      }
    }

    function reset() {
      for (const [, mo] of observers.entries()) {
        try { mo.disconnect(); } catch (_) { }
      }
      observers.clear();
    }

    function scanAllCommentAuthors() {
      // Safety: keep scanning scoped to known comment components
      const threads = document.querySelectorAll('ytd-comment-thread-renderer');
      let count = 0;
      for (const t of threads) {
        scanCommentAuthorsUnder(t, () => {
          count++;
          return count < CFG.scanMaxPerPass;
        });
        if (count >= CFG.scanMaxPerPass) break;
      }
    }

    function scanCommentAuthorsUnder(root, allowContinueFn) {
      if (!isElement(root) && root !== document) return;

      // Strategy:
      // Prefer anchors pointing to "/@handle" (author links & sometimes mentions).
      // Then choose the innermost text element (span / yt-formatted-string).
      const anchors = root.querySelectorAll
        ? root.querySelectorAll('a[href^="/@"]')
        : [];

      for (const a of anchors) {
        if (allowContinueFn && !allowContinueFn()) return;

        // Prefer typical author name nodes inside the anchor
        const inner =
          a.querySelector('span') ||
          a.querySelector('yt-formatted-string');

        // If inner exists, process it, else process anchor itself
        if (inner) {
          processAuthorElement(inner);
        } else {
          processAuthorElement(a);
        }
      }
    }

    return { attachObserversIfNeeded, reset, scheduleScan };
  })();

  /**********************
   * Return-script-like robustness: yt-action / yt-navigate-finish hooks
   **********************/
  function hookYouTubeEvents() {
    // “yt-action” gives us reliable moments to rescan when new comments load / replies expand
    document.addEventListener('yt-action', (e) => {
      const d = e && e.detail;
      const actionName = d && d.actionName;
      if (!actionName) return;

      switch (actionName) {
        // These are the same family that Return YouTube Comment Username listens for
        case 'yt-append-continuation-items-action':
          Comments.scheduleScan(350);
          break;
        case 'yt-reload-continuation-items-command':
          Comments.scheduleScan(120);
          break;
        case 'yt-history-load':
          Comments.scheduleScan(120);
          break;
        case 'yt-get-multi-page-menu-action':
          Comments.scheduleScan(120);
          break;
        case 'yt-create-comment-action':
          Comments.scheduleScan(120);
          break;
        case 'yt-create-comment-reply-action':
          Comments.scheduleScan(120);
          break;
        default:
          // ignore other actions
          break;
      }
    });

    // SPA navigation: re-init observation + scan
    document.addEventListener('yt-navigate-finish', () => {
      // Reset state that depends on page DOM
      LiveChat.reset();
      Comments.reset();

      // Reattach + rescan after a tiny delay (DOM often changes just after navigate-finish)
      setTimeout(() => {
        LiveChat.attachObserverIfNeeded();
        Comments.attachObserversIfNeeded();
        Comments.scheduleScan(80);
      }, 80);
    });
  }

  /**********************
   * Bootstrap / reattach loop
   **********************/
  async function bootstrap() {
    hookYouTubeEvents();

    // Wait until documentElement exists (document-start safe)
    while (!document.documentElement) await sleep(20);

    // Reattach loop: “won’t die” core
    setInterval(() => {
      LiveChat.attachObserverIfNeeded();
      Comments.attachObserversIfNeeded();
    }, CFG.reattachInterval);

    // Initial attach attempt
    LiveChat.attachObserverIfNeeded();
    Comments.attachObserversIfNeeded();
    Comments.scheduleScan(200);

    // Also scan once after DOMContentLoaded to catch late layouts
    document.addEventListener('DOMContentLoaded', () => {
      Comments.attachObserversIfNeeded();
      Comments.scheduleScan(120);
    }, { once: true });
  }

  bootstrap().catch(() => { });
})();