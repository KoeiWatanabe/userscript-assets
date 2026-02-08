// ==UserScript==
// @name         YTチャットの名前をもとに戻す
// @namespace    https://example.com/
// @version      2.8.0
// @description  Reference-like strategy tuned for minimum visible latency. Replace @handle with display name only.
// @match        https://www.youtube.com/live_chat*
// @match        https://www.youtube.com/live_chat_replay*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YTチャットの名前をもとに戻す/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YTチャットの名前をもとに戻す/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YTチャットの名前をもとに戻す/icon_128.png
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

    // Observe reattach check interval (ms)
    reattachInterval: 800,

    // Fetch timeout (ms)
    fetchTimeout: 7000,

    // Streaming safety limits
    maxBytesToScan: 700 * 1024, // stop scanning after ~700KB
    maxChunks: 80,              // stop after N chunks (safety)

    // Persist debounce (ms)
    persistDebounce: 5000,
  };

  /**********************
   * Tiny utils
   **********************/
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function now() { return Date.now(); }

  // decode cache: avoids repeated parsing work
  const _decodeCache = new Map();
  const _DECODE_CACHE_MAX = 2000;

  function decodeHtmlEntities(str) {
    // Fast path: nothing to decode
    if (str == null) return '';
    const s0 = String(str);
    if (s0.indexOf('&') === -1) return s0;

    // Cache
    const cached = _decodeCache.get(s0);
    if (cached !== undefined) return cached;

    // Common entities: keep it fast for the usual suspects
    const named = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
      nbsp: '\u00A0',

      // punctuation / typography
      hellip: '…',
      ndash: '–',
      mdash: '—',
      lsquo: '‘',
      rsquo: '’',
      ldquo: '“',
      rdquo: '”',
      laquo: '«',
      raquo: '»',
      middot: '·',
      bull: '•',

      // symbols
      copy: '©',
      reg: '®',
      trade: '™',
      deg: '°',
      plusmn: '±',
      times: '×',
      divide: '÷',
      micro: 'µ',

      // currency
      yen: '¥',
      euro: '€',
      pound: '£',
      cent: '¢',

      // fractions / superscripts often seen in titles
      frac14: '¼',
      frac12: '½',
      frac34: '¾',
      sup1: '¹',
      sup2: '²',
      sup3: '³',
    };

    const replaced = s0.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/g, (m, g1) => {
      if (!g1) return m;

      // numeric: &#123; / &#x1F600;
      if (g1[0] === '#') {
        const hex = (g1[1] || '').toLowerCase() === 'x';
        const numStr = hex ? g1.slice(2) : g1.slice(1);
        const cp = parseInt(numStr, hex ? 16 : 10);
        if (!Number.isFinite(cp)) return m;
        try {
          return String.fromCodePoint(cp);
        } catch (_) {
          return m;
        }
      }

      // named: &amp;
      const key = g1.toLowerCase();
      return Object.prototype.hasOwnProperty.call(named, key) ? named[key] : m;
    });

    // If something like "&hellip;" remains (or any other named entity we didn't list),
    // fall back to a DOMParser-based decode WITHOUT touching innerHTML.
    // Using <textarea> ensures any '<' stays as text (not markup).
    let out = replaced;
    if (/[&][a-zA-Z][a-zA-Z0-9]+;/.test(out)) {
      try {
        const doc = new DOMParser().parseFromString(`<textarea>${out}</textarea>`, 'text/html');
        const ta = doc && doc.querySelector('textarea');
        if (ta && typeof ta.value === 'string') out = ta.value;
      } catch (_) {
        // ignore and keep best-effort result
      }
    }

    // Cache write with simple LRU-ish eviction
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
    // Typical channel pages: "Display Name - YouTube"
    // Keep it conservative: only strip the trailing " - YouTube"
    const t = title.trim();
    return t.replace(/\s+-\s+YouTube\s*$/i, '').trim();
  }

  function isHandleText(s) {
    if (!s) return false;
    const t = s.trim();
    // YouTube handles are typically ASCII, but keep permissive.
    // Require leading '@' + at least 2 chars
    return t.startsWith('@') && t.length >= 3;
  }

  function extractHandleFromText(text) {
    const t = (text || '').trim();
    if (!isHandleText(t)) return null;
    // Remove trailing whitespace etc.
    // Keep whole handle (including dots/underscores) as-is.
    // Some UI may include invisible chars; strip common whitespace.
    return t.replace(/\s+/g, '');
  }

  function extractHandleFromHref(href) {
    if (!href) return null;
    // examples: /@handle, https://www.youtube.com/@handle, /@handle/about
    const m = href.match(/\/@([A-Za-z0-9._-]{2,})/);
    return m ? '@' + m[1] : null;
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
      // refresh order
      this.map.delete(key);
      this.map.set(key, v);
      return v;
    }
    set(key, val) {
      if (this.map.has(key)) this.map.delete(key);
      this.map.set(key, val);
      if (this.map.size > this.max) {
        // delete oldest
        const oldest = this.map.keys().next().value;
        this.map.delete(oldest);
      }
    }
    has(key) {
      return this.map.has(key);
    }
    delete(key) {
      this.map.delete(key);
    }
    size() {
      return this.map.size;
    }
    entriesArray() {
      return Array.from(this.map.entries());
    }
    loadFromEntries(entries) {
      this.map.clear();
      for (const [k, v] of entries) {
        this.map.set(k, v);
      }
      // Trim if too large
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
  const LS_KEY = 'yt_livechat_handle_name_cache_v1';
  const lsCache = new LRU(CFG.lsCacheMax);
  let persistTimer = null;

  function loadPersistentCache() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.entries)) return;
      // entries: [[handle, {name, ts}], ...] in LRU order (oldest -> newest)
      lsCache.loadFromEntries(parsed.entries);
    } catch (_) {
      // ignore
    }
  }

  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      try {
        const payload = {
          v: 1,
          entries: lsCache.entriesArray(), // oldest->newest
        };
        localStorage.setItem(LS_KEY, JSON.stringify(payload));
      } catch (_) {
        // ignore (quota etc.)
      }
    }, CFG.persistDebounce);
  }

  loadPersistentCache();

  /**********************
   * Networking (streaming og:title sniff)
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
        try { controller.abort(); } catch (_) {}
      }, CFG.fetchTimeout);

      try {
        const res = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          signal: controller.signal,
        });

        // If body stream not available, fallback to full text
        const body = res.body;
        if (!body || !body.getReader) {
          const text = await res.text();
          const name = extractOgTitleFromHtml(text);
          return name;
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

          // Try to find og:title in the growing buffer
          const name = extractOgTitleFromHtml(buffer);
          if (name) {
            // Stop ASAP
            try { controller.abort(); } catch (_) {}
            return name;
          }

          if (scannedBytes > CFG.maxBytesToScan || scannedChunks > CFG.maxChunks) {
            break;
          }

          // Keep buffer from growing forever
          if (buffer.length > 250000) {
            buffer = buffer.slice(-120000);
          }
        }

        // Final attempt
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

    // Look for: <meta property="og:title" content="...">
    // be flexible about attribute order & quotes
    const re = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i;
    const m = html.match(re);
    if (!m) return null;

    const raw = safeDecode(m[1] || '');
    const name = normalizeTitleToDisplayName(raw);

    // sanity
    if (!name || name.length < 1) return null;
    // Sometimes title could be just "YouTube" or weird; keep conservative
    if (/^YouTube$/i.test(name)) return null;

    return name;
  }

  /**********************
   * DOM processing
   **********************/
  let itemsEl = null;
  let observer = null;

  // batch queue for nodes to scan
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

    // Scan for author elements in each added node
    for (const n of nodes) {
      scanAndProcessAuthorElements(n);
    }
  }

  function scanAndProcessAuthorElements(root) {
    if (!root || root.nodeType !== 1) return;

    // Common patterns in live chat:
    // - <yt-live-chat-author-chip> contains <span id="author-name"> or <a id="author-name">
    // We'll target author-chip + author-name id to reduce false positives.
    const authorEls = [];

    if (root.matches && root.matches('yt-live-chat-author-chip #author-name, #author-name')) {
      // If root itself is author-name (rare), include it
      authorEls.push(root);
    }

    // Prefer scoped selector
    const found = root.querySelectorAll
      ? root.querySelectorAll('yt-live-chat-author-chip #author-name, a#author-name, span#author-name')
      : [];
    for (const el of found) authorEls.push(el);

    if (authorEls.length === 0) return;

    for (const el of authorEls) {
      processAuthorElement(el);
    }
  }

  async function processAuthorElement(authorEl) {
    if (!authorEl || authorEl.nodeType !== 1) return;

    // Identify current handle:
    // - First by visible text if it's "@..."
    // - Else by href "/@handle"
    const text = (authorEl.textContent || '').trim();

    let handle = extractHandleFromText(text);

    // Sometimes authorEl is span and the anchor is parent
    if (!handle) {
      const anchor = authorEl.closest ? authorEl.closest('a') : null;
      const href = (anchor && anchor.getAttribute) ? anchor.getAttribute('href') : authorEl.getAttribute?.('href');
      handle = extractHandleFromHref(href);
    }

    if (!handle) return;

    // Important: "node reuse safe" logic
    // Only act if it's CURRENTLY showing the handle (starts with '@').
    // If it's already a display name, we skip.
    if (!isHandleText(text)) return;

    // Avoid spamming same element repeatedly:
    // If we've already resolved this handle and set it recently, it won't match @ anyway.
    // But just in case, mark a lightweight attribute.
    if (authorEl.dataset && authorEl.dataset.ytNameRestored === '1') return;

    const name = await fetchDisplayNameByHandle(handle);
    if (!name) return;

    // Double-check it still shows the same handle (DOM could have changed meanwhile)
    const latestText = (authorEl.textContent || '').trim();
    if (extractHandleFromText(latestText) !== handle) return;

    // Apply
    authorEl.textContent = name;
    if (authorEl.dataset) {
      authorEl.dataset.ytNameRestored = '1';
      authorEl.dataset.originalHandle = handle;
    }
    // Keep handle discoverable on hover
    try {
      authorEl.setAttribute('title', handle);
    } catch (_) {}
  }

  /**********************
   * Observer attach / reattach
   **********************/
  function findItemsElement() {
    // Live chat is inside an iframe on watch pages.
    // But this userscript runs on all youtube.com; we attempt to find #items wherever it exists.
    return document.querySelector('#items');
  }

  function attachObserverIfNeeded() {
    const found = findItemsElement();
    if (!found) return;

    if (itemsEl === found && observer) return;

    // Replace observer
    if (observer) {
      try { observer.disconnect(); } catch (_) {}
      observer = null;
    }

    itemsEl = found;

    observer = new MutationObserver((mutList) => {
      for (const mut of mutList) {
        for (const node of mut.addedNodes) {
          // We observe only childList (no subtree), so node should be a chat line renderer
          enqueueNode(node);
        }
      }
    });

    observer.observe(itemsEl, {
      childList: true,
      subtree: false, // lightweight
    });

    // Initial scan of current visible items
    enqueueNode(itemsEl);
  }

  function startReattachLoop() {
    setInterval(() => {
      attachObserverIfNeeded();
    }, CFG.reattachInterval);
  }

  /**********************
   * Bootstrap
   **********************/
  function bootstrap() {
    // Wait for DOM to exist
    const start = async () => {
      // document-start can be too early; loop until we can query
      while (document.readyState === 'loading' && !document.documentElement) {
        await sleep(50);
      }
      // Start reattach loop (this is the "won't die" core)
      startReattachLoop();
      // Try attach soon
      attachObserverIfNeeded();
    };
    start().catch(() => {});
  }

  bootstrap();
})();
