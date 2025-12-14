// ==UserScript==
// @name         YTチャットの名前をもとに戻す
// @namespace    https://example.com/
// @version      1.6.0
// @description  Replace @handle-like author names in YouTube live chat with channel display names. Batched DOM updates + handle fan-out + LRU + negative TTL + lightweight items reattach.
// @match        https://www.youtube.com/live_chat*
// @match        https://www.youtube.com/live_chat_replay*
// @grant        GM_xmlhttpRequest
// @connect      www.youtube.com
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YTチャットの名前をもとに戻す/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YTチャットの名前をもとに戻す/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YTチャットの名前をもとに戻す/icon_128.png
// ==/UserScript==

(() => {
  "use strict";

  // =========================
  // Settings
  // =========================
  const DEBUG = false;

  const CACHE_LIMIT = 20000;
  const NEGATIVE_TTL_MS = 10 * 60 * 1000; // 10 min
  const MAX_CONCURRENCY = 4;

  // Top/Live切替などで #items が差し替わるのを軽く検知する用（常時監視より軽い）
  const ITEMS_POLL_INTERVAL_MS = 800;

  const log = (...a) => DEBUG && console.log("[YTChatNameFix]", ...a);

  // =========================
  // Cache / inFlight / Queue
  // =========================
  const cache = new Map();     // handle -> { name: string|null, ts: number }
  const inFlight = new Map();  // handle -> Promise<string|null>

  let active = 0;
  const queue = [];

  function enqueue(task) {
    queue.push(task);
    pump();
  }

  function pump() {
    while (active < MAX_CONCURRENCY && queue.length) {
      const task = queue.shift();
      active++;
      task()
        .catch(() => {})
        .finally(() => {
          active--;
          pump();
        });
    }
  }

  // =========================
  // LRU helpers
  // =========================
  function cacheGet(key) {
    if (!cache.has(key)) return null;
    const val = cache.get(key);
    cache.delete(key);
    cache.set(key, val);
    return val;
  }

  function cacheSet(key, val) {
    if (cache.has(key)) cache.delete(key);
    cache.set(key, val);

    if (cache.size > CACHE_LIMIT) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
  }

  // =========================
  // Fetch / Parse
  // =========================
  function isHandleLikeName(name) {
    return typeof name === "string" && name.trim().startsWith("@");
  }

  function toHandleUrl(handle) {
    const h = handle.trim();
    return `https://www.youtube.com/${encodeURI(h)}`;
  }

  function parseOgTitle(html) {
    const m = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
    if (!m) return null;
    return m[1].trim().replace(/\s*-\s*YouTube\s*$/i, "").trim() || null;
  }

  function gmGet(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        headers: { Accept: "text/html" },
        timeout: 15000,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) resolve(res.responseText);
          else reject(new Error(`HTTP ${res.status}`));
        },
        onerror: () => reject(new Error("Network error")),
        ontimeout: () => reject(new Error("Timeout")),
      });
    });
  }

  async function fetchChannelDisplayNameByHandle(handle) {
    if (!handle) return null;
    const key = handle.trim();

    // cache
    const cached = cacheGet(key);
    if (cached) {
      if (cached.name) return cached.name;
      if (Date.now() - cached.ts < NEGATIVE_TTL_MS) return null;
    }

    // in-flight dedupe
    if (inFlight.has(key)) return inFlight.get(key);

    const p = (async () => {
      try {
        const html = await gmGet(toHandleUrl(key));
        const name = parseOgTitle(html);
        cacheSet(key, { name: name || null, ts: Date.now() });
        return name || null;
      } catch (e) {
        cacheSet(key, { name: null, ts: Date.now() });
        log("fetch failed:", key, e);
        return null;
      } finally {
        inFlight.delete(key);
      }
    })();

    inFlight.set(key, p);
    return p;
  }

  // =========================
  // Fan-out updates (handle -> elements)
  // =========================
  const waitingEls = new Map(); // handle -> Set<#author-name>
  const seen = new WeakSet();   // element processed?

  function registerAuthorNameEl(nameEl) {
    if (!nameEl || seen.has(nameEl)) return;
    seen.add(nameEl);

    const text = (nameEl.textContent || "").trim();
    if (!isHandleLikeName(text)) return;

    let set = waitingEls.get(text);
    if (!set) {
      set = new Set();
      waitingEls.set(text, set);

      // only one resolver per handle
      enqueue(async () => {
        const displayName = await fetchChannelDisplayNameByHandle(text);
        if (!displayName) {
          waitingEls.delete(text);
          return;
        }

        const els = waitingEls.get(text);
        waitingEls.delete(text);
        if (!els) return;

        for (const el of els) {
          if (el && el.isConnected) el.textContent = displayName;
        }

        log(`Replaced ${text} -> ${displayName} (${els.size} nodes)`);
      });
    }

    set.add(nameEl);
  }

  // =========================
  // Batched mutation handling
  // =========================
  let pendingNodes = [];
  const pendingDedup = new WeakSet(); // ★同じノードが何度も入るのを防ぐ
  let scheduled = false;

  function pushPending(node) {
    if (!(node instanceof HTMLElement)) return;
    if (pendingDedup.has(node)) return;
    pendingDedup.add(node);
    pendingNodes.push(node);
  }

  function scheduleFlush() {
    if (scheduled) return;
    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;
      const nodes = pendingNodes;
      pendingNodes = [];
      // ★dedupもリセット（次フレームでまた使える）
      // WeakSetはクリアできないので作り直す…は重いので、ここは妥協して
      // “同一ノードが次フレームでも来る”ケースは少ない前提でOKにする。
      // もし気になるなら pendingDedup を Set にしてクリア可能にする手もある。
      flush(nodes);
    });
  }

  function flush(nodes) {
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;

      // ★軽量化1：チャットDOMと無関係っぽいノードを早期スキップ
      // (yt-live-chat-app の外から飛んでくるDOM更新に反応しない)
      // node自身が yt-live-chat-app ならOK、それ以外は祖先にあるかだけ確認
      if (node.tagName !== "YT-LIVE-CHAT-APP" && !node.closest?.("yt-live-chat-app")) {
        continue;
      }

      // Fast path
      if (node.id === "author-name") {
        registerAuthorNameEl(node);
        continue;
      }

      // ★軽量化2：いきなり querySelectorAll せず “1個でもあるか” を先に軽くチェック
      // 無ければスキップ（これで無駄な深掘りを減らす）
      const first = node.querySelector?.("#author-name");
      if (!first) continue;

      // 1個はあるのでまとめて拾う
      const authorNames = node.querySelectorAll?.("#author-name");
      if (!authorNames || authorNames.length === 0) continue;

      for (const el of authorNames) registerAuthorNameEl(el);
    }
  }

  // =========================
  // Items observer (main)
  // =========================
  let itemsObserver = null;
  let observedItems = null;

  function attachItemsObserver(itemsEl) {
    if (!itemsEl || itemsEl === observedItems) return;

    if (itemsObserver) itemsObserver.disconnect();
    observedItems = itemsEl;

    itemsObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const n of m.addedNodes) pushPending(n);
      }
      scheduleFlush();
    });

    itemsObserver.observe(itemsEl, { childList: true, subtree: true });
    log("items observer attached:", itemsEl);

    // rescan existing (only inside items)
    itemsEl.querySelectorAll?.("#author-name").forEach(registerAuthorNameEl);
  }

  function findItemsContainer() {
    return document.querySelector("yt-live-chat-item-list-renderer #items");
  }

  // =========================
  // Lightweight reattach: polling (instead of wide root observer)
  // =========================
  function watchItemsByPolling() {
    setInterval(() => {
      const items = findItemsContainer();
      if (items) attachItemsObserver(items);
    }, ITEMS_POLL_INTERVAL_MS);
  }

  // =========================
  // Start
  // =========================
  const initialItems = findItemsContainer();
  if (initialItems) attachItemsObserver(initialItems);
  watchItemsByPolling();
})();
