// ==UserScript==
// @name         YouTubeコメント欄の名前をもとに戻す＋
// @namespace    https://example.com/
// @version      1.0.2
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

  function decodeEntities(s) {
    if (!s || !s.includes('&')) return s || '';
    try {
      return new DOMParser().parseFromString(`<i>${s}</i>`, 'text/html').body.textContent || s;
    } catch { return s; }
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
      lsCache.load(parsed.entries);
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

  const OG_TITLE_RE = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i;
  function extractOgTitleFromHtml(html) {
    if (!html) return null;
    const m = html.match(OG_TITLE_RE);
    if (!m) return null;
    const name = decodeEntities(m[1] || '').trim().replace(/\s+-\s+YouTube\s*$/i, '').trim();
    if (!name || /^YouTube$/i.test(name)) return null;
    return name;
  }

  async function fetchDisplayNameByHandle(handle) {
    const mc = memCache.get(handle);
    if (mc) return mc;

    const lc = lsCache.get(handle);
    if (lc) {
      memCache.set(handle, lc);
      return lc;
    }

    const nts = negCache.get(handle);
    if (nts && (now() - nts) < CFG.negativeTTL) return null;

    if (inFlight.has(handle)) return inFlight.get(handle);

    const p = (async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => { try { controller.abort(); } catch { } }, CFG.fetchTimeout);
      try {
        const res = await fetch(`https://www.youtube.com/${handle}`, {
          method: 'GET',
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
    })();

    inFlight.set(handle, p);
    try {
      const name = await p;
      if (name) {
        memCache.set(handle, name);
        lsCache.set(handle, name);
        schedulePersist();
        return name;
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
    if (authorEl.dataset.ytNameRestored === '1') return;

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

    const name = await fetchDisplayNameByHandle(handle);
    if (!name) return;

    const latestText = (authorEl.textContent || '').trim();
    if (extractHandleFromText(latestText) !== handle) return;

    authorEl.textContent = name;
    authorEl.dataset.ytNameRestored = '1';
    authorEl.dataset.originalHandle = handle;
    try { authorEl.setAttribute('title', handle); } catch { }
  }

  /**********************
   * Live Chat Module
   **********************/
  const LiveChat = (() => {
    const WATCH = [
      { sel: '#item-list #items', opts: { childList: true, subtree: false } },
      { sel: 'yt-live-chat-banner-manager', opts: { childList: true, subtree: true } },
      { sel: 'yt-live-chat-ticker-renderer #ticker-items', opts: { childList: true, subtree: true } },
      { sel: 'yt-live-chat-pinned-message-renderer#pinned-message', opts: { childList: true, subtree: true } },
      {
        sel: 'ytd-engagement-panel-section-list-renderer[target-id="PAreply_thread"]',
        opts: { childList: true, subtree: true, attributes: true, attributeFilter: ['visibility'] },
        watchAttrs: true,
      },
    ];
    const slots = WATCH.map(() => ({ el: null, mo: null }));

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
      if (!isElement(root)) return;
      if (root.matches(AUTHOR_NAME_SEL) || root.matches(TICKER_TEXT_SEL)) {
        processAuthorElement(root);
      }
      for (const el of root.querySelectorAll(AUTHOR_NAME_SEL)) processAuthorElement(el);
      for (const el of root.querySelectorAll(TICKER_TEXT_SEL)) processAuthorElement(el);
    }

    function makeObserver(watchAttrs) {
      return new MutationObserver((mutList) => {
        for (const mut of mutList) {
          for (const node of mut.addedNodes) enqueueNode(node);
          if (watchAttrs && mut.type === 'attributes') enqueueNode(mut.target);
        }
      });
    }

    function attachObserverIfNeeded() {
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
    }

    return { attachObserverIfNeeded, reset };
  })();

  /**********************
   * Comments Module
   **********************/
  const Comments = (() => {
    const observers = new Map(); // Element -> MutationObserver
    let scanTimer = null;
    let lastScanAt = 0;

    function scheduleScan(delay = 0) {
      if (scanTimer) return;
      const dueIn = Math.max(delay, CFG.scanDebounceMs - (now() - lastScanAt));
      scanTimer = setTimeout(() => {
        scanTimer = null;
        lastScanAt = now();
        scanAllCommentAuthors();
      }, dueIn);
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

    function attachObserversIfNeeded() {
      for (const c of findLikelyCommentContainers()) {
        if (observers.has(c)) continue;
        const mo = new MutationObserver((mutList) => {
          for (const mut of mutList) {
            for (const node of mut.addedNodes) scanCommentAuthorsUnder(node);
          }
        });
        mo.observe(c, { childList: true, subtree: true });
        observers.set(c, mo);
        scanCommentAuthorsUnder(c);
      }
      for (const [el, mo] of observers) {
        if (!document.contains(el)) {
          try { mo.disconnect(); } catch { }
          observers.delete(el);
        }
      }
    }

    function reset() {
      for (const mo of observers.values()) {
        try { mo.disconnect(); } catch { }
      }
      observers.clear();
    }

    function scanAllCommentAuthors() {
      let remaining = CFG.scanMaxPerPass;
      for (const t of document.querySelectorAll('ytd-comment-thread-renderer')) {
        if (remaining <= 0) break;
        remaining = scanCommentAuthorsUnder(t, remaining);
      }
    }

    function scanCommentAuthorsUnder(root, remaining = Infinity) {
      if (!isElement(root)) return remaining;
      for (const a of root.querySelectorAll('a[href^="/@"]')) {
        if (remaining <= 0) break;
        const inner = a.querySelector('span') || a.querySelector('yt-formatted-string');
        processAuthorElement(inner || a);
        remaining--;
      }
      return remaining;
    }

    return { attachObserversIfNeeded, reset, scheduleScan };
  })();

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
      if (delay !== undefined) Comments.scheduleScan(delay);
    });

    document.addEventListener('yt-navigate-finish', () => {
      LiveChat.reset();
      Comments.reset();
      setTimeout(() => {
        LiveChat.attachObserverIfNeeded();
        Comments.attachObserversIfNeeded();
        Comments.scheduleScan(80);
      }, 80);
    });
  }

  async function bootstrap() {
    hookYouTubeEvents();

    while (!document.documentElement) await sleep(20);

    setInterval(() => {
      LiveChat.attachObserverIfNeeded();
      Comments.attachObserversIfNeeded();
    }, CFG.reattachInterval);

    LiveChat.attachObserverIfNeeded();
    Comments.attachObserversIfNeeded();
    Comments.scheduleScan(200);

    document.addEventListener('DOMContentLoaded', () => {
      Comments.attachObserversIfNeeded();
      Comments.scheduleScan(120);
    }, { once: true });
  }

  bootstrap().catch(() => { });
})();
