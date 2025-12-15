// ==UserScript==
// @name         YTチャットの名前をもとに戻す
// @namespace    https://example.com/
// @version      2.0.0
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
  "use strict";

  // ===== Tunables =====
  const MAX_CONCURRENT_REQUESTS = 6;
  const REQUEST_DELAY_MS = 80;
  const NEGATIVE_TTL_MS = 10 * 60 * 1000;
  const CACHE_LIMIT = 20000;

  const CACHE = new Map();    // handle(without @) -> {name, ts}
  const PENDING = new Map();  // handle(without @) -> callbacks[]
  const QUEUE = [];
  let active = 0;

  function cacheGet(k) {
    const v = CACHE.get(k);
    if (!v) return null;
    CACHE.delete(k);
    CACHE.set(k, v);
    return v;
  }
  function cacheSet(k, v) {
    if (CACHE.has(k)) CACHE.delete(k);
    CACHE.set(k, v);
    if (CACHE.size > CACHE_LIMIT) {
      const oldest = CACHE.keys().next().value;
      CACHE.delete(oldest);
    }
  }

  function parseOgTitle(html) {
    const m = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
    if (!m) return null;
    return m[1].trim().replace(/\s*-\s*YouTube\s*$/i, "").trim() || null;
  }

  async function processQueue() {
    if (active >= MAX_CONCURRENT_REQUESTS) return;
    if (QUEUE.length === 0) return;

    const handleAt = QUEUE.shift(); // "@foo"
    const clean = handleAt.slice(1); // "foo"
    active++;

    try {
      const cached = cacheGet(clean);
      if (cached) {
        if (cached.name) {
          const cbs = PENDING.get(clean) || [];
          PENDING.delete(clean);
          cbs.forEach(cb => cb(cached.name));
          return;
        }
        if (Date.now() - cached.ts < NEGATIVE_TTL_MS) {
          const cbs = PENDING.get(clean) || [];
          PENDING.delete(clean);
          cbs.forEach(cb => cb(null));
          return;
        }
      }

      const url = `https://www.youtube.com/@${encodeURIComponent(clean)}/about`;
      const res = await fetch(url, { credentials: "include" });
      const html = await res.text();
      const name = parseOgTitle(html) || null;

      cacheSet(clean, { name, ts: Date.now() });

      const cbs = PENDING.get(clean) || [];
      PENDING.delete(clean);
      cbs.forEach(cb => cb(name));
    } catch {
      cacheSet(clean, { name: null, ts: Date.now() });
      const cbs = PENDING.get(clean) || [];
      PENDING.delete(clean);
      cbs.forEach(cb => cb(null));
    } finally {
      active--;
      if (QUEUE.length) setTimeout(processQueue, REQUEST_DELAY_MS);
    }
  }

  function enqueueRequest(handleAt, cb) {
    const clean = handleAt.slice(1);
    const cached = cacheGet(clean);
    if (cached) {
      if (cached.name) return cb(cached.name);
      if (Date.now() - cached.ts < NEGATIVE_TTL_MS) return cb(null);
    }

    if (PENDING.has(clean)) {
      PENDING.get(clean).push(cb);
      return;
    }
    PENDING.set(clean, [cb]);
    QUEUE.push(handleAt);
    processQueue();
  }

  // ===== DOM processor (chip-focused) =====
  const chipProcessed = new WeakSet();

  function getAuthorNameEl(chip) {
    return chip.querySelector("#author-name") || chip.querySelector("span");
  }

  function getHandleTextFromChip(chip) {
    const el = getAuthorNameEl(chip);
    const t = el?.textContent?.trim();
    if (t && t.startsWith("@") && t.length > 1) return t;

    const raw = (chip.textContent || "").trim();
    if (raw.startsWith("@") && raw.length > 1) return raw;

    return null;
  }

  function processChip(chip) {
    if (!chip || chipProcessed.has(chip)) return;
    chipProcessed.add(chip);

    const handleAt = getHandleTextFromChip(chip);
    if (!handleAt) return;

    const authorNameEl = getAuthorNameEl(chip);
    if (!authorNameEl) return;

    enqueueRequest(handleAt, (realName) => {
      if (!realName) return;
      if (!chip.isConnected || !authorNameEl.isConnected) return;

      // すでに置換済みなら何もしない
      const current = (authorNameEl.textContent || "").trim();
      if (current === realName) return;

      // ★ここが要望：表示名だけ表示する（@handleは消す）
      authorNameEl.textContent = realName;
    });
  }

  function processAddedNode(node) {
    if (!(node instanceof HTMLElement)) return;

    if (node.tagName === "YT-LIVE-CHAT-AUTHOR-CHIP") {
      processChip(node);
      return;
    }

    const chips = node.getElementsByTagName?.("yt-live-chat-author-chip");
    if (!chips || chips.length === 0) return;
    for (let i = 0; i < chips.length; i++) processChip(chips[i]);
  }

  // ===== Observer: #items direct children only =====
  let itemsObserver = null;
  let observedItems = null;

  function findItems() {
    return document.querySelector("yt-live-chat-item-list-renderer #items");
  }

  function attach(items) {
    if (!items || items === observedItems) return;

    if (itemsObserver) itemsObserver.disconnect();
    observedItems = items;

    itemsObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const n of m.addedNodes) processAddedNode(n);
      }
    });

    itemsObserver.observe(items, { childList: true, subtree: false });

    // 初期分
    const chips = items.getElementsByTagName("yt-live-chat-author-chip");
    for (let i = 0; i < chips.length; i++) processChip(chips[i]);
  }

  // VODで #items が差し替わるのを拾う
  setInterval(() => {
    const items = findItems();
    if (items) attach(items);
  }, 800);

  const first = findItems();
  if (first) attach(first);
})();
