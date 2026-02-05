// ==UserScript==
// @name         YTチャットの名前をもとに戻す
// @namespace    https://example.com/
// @version      2.2.0
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

  // ===== 設定 =====
  const MAX_CONCURRENT = 4;     // 同時リクエスト数（安定性のため少し下げ）
  const REQUEST_DELAY = 100;    // リクエスト間隔
  const NEGATIVE_TTL = 300000;  // 失敗時の再取得禁止時間(5分)
  const STORAGE_KEY = "yt_realname_cache_v2";
  const CACHE_LIMIT = 3000;
  const SAVE_DEBOUNCE = 5000;

  // ===== 1. キャッシュ管理 (LocalStorage) =====
  let cache = new Map();
  let isCacheDirty = false;
  let saveTimer = null;

  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (json) {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) cache = new Map(parsed);
    }
  } catch (e) {}

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!isCacheDirty) return;
      try {
        if (cache.size > CACHE_LIMIT) {
          const deleteCount = cache.size - CACHE_LIMIT;
          const iter = cache.keys();
          for (let i = 0; i < deleteCount; i++) cache.delete(iter.next().value);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(cache.entries())));
        isCacheDirty = false;
      } catch (e) {}
    }, SAVE_DEBOUNCE);
  }

  function getCache(key) {
    const val = cache.get(key);
    if (!val) return null;
    // LRU: 使ったものを後ろへ
    cache.delete(key);
    cache.set(key, val);
    return val;
  }

  function setCache(key, val) {
    cache.delete(key);
    cache.set(key, val);
    isCacheDirty = true;
    scheduleSave();
  }

  // ===== 2. DOM更新 (requestAnimationFrame) =====
  // 描画の衝突を避けるため、DOM操作はフレームの切れ目に行う
  const domUpdates = new Map();
  let updateScheduled = false;

  function scheduleDomUpdate(el, text) {
    // 既に変わっていれば何もしない
    if (el.textContent === text) return;

    domUpdates.set(el, text);
    if (!updateScheduled) {
      updateScheduled = true;
      requestAnimationFrame(() => {
        updateScheduled = false;
        domUpdates.forEach((txt, element) => {
          if (element.isConnected) element.textContent = txt;
        });
        domUpdates.clear();
      });
    }
  }

  // ===== 3. データ取得 (Streaming Fetch) =====
  async function fetchNameStream(handle) {
    // メン限等のため credentials は include に戻す
    const url = `https://www.youtube.com/@${encodeURIComponent(handle)}/about`;
    const controller = new AbortController();

    try {
      const res = await fetch(url, { signal: controller.signal, credentials: "include" });
      if (!res.body) return null;

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let foundName = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // og:title を探す
        const match = buffer.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
        if (match) {
          foundName = match[1].trim().replace(/\s*-\s*YouTube\s*$/i, "").trim();
          controller.abort(); // ★見つかったら即切断
          break;
        }

        // 50KB読んでもなければ諦める
        if (buffer.length > 50000) {
          controller.abort();
          break;
        }
      }
      return foundName;
    } catch (e) {
      return null;
    }
  }

  // ===== 4. キュー制御 =====
  const pendingCallbacks = new Map();
  const queue = [];
  let activeRequests = 0;

  async function processQueue() {
    if (activeRequests >= MAX_CONCURRENT || queue.length === 0) return;

    const handle = queue.shift();
    activeRequests++;

    try {
      let name = await fetchNameStream(handle);

      const now = Date.now();
      setCache(handle, { name, ts: now });

      const callbacks = pendingCallbacks.get(handle) || [];
      pendingCallbacks.delete(handle);
      callbacks.forEach(cb => cb(name));
    } catch(e) {
      // エラー時もキャッシュして連打防止
      setCache(handle, { name: null, ts: Date.now() });
    } finally {
      activeRequests--;
      if (queue.length > 0) setTimeout(processQueue, REQUEST_DELAY);
    }
  }

  function requestName(rawHandle, cb) {
    const handle = rawHandle.slice(1); // remove @

    const cached = getCache(handle);
    if (cached) {
      if (cached.name) return cb(cached.name);
      if (Date.now() - cached.ts < NEGATIVE_TTL) return cb(null);
    }

    if (pendingCallbacks.has(handle)) {
      pendingCallbacks.get(handle).push(cb);
      return;
    }

    pendingCallbacks.set(handle, [cb]);
    queue.push(handle);
    processQueue();
  }

  // ===== 5. DOM監視 (Stability重視) =====

  function processNode(node) {
    // ノード内の author-chip を探す
    const chips = node.tagName === "YT-LIVE-CHAT-AUTHOR-CHIP"
      ? [node]
      : node.getElementsByTagName?.("yt-live-chat-author-chip");

    if (!chips || chips.length === 0) return;

    for (const chip of chips) {
      const nameEl = chip.querySelector("#author-name") || chip.querySelector("span");
      if (!nameEl) continue;

      // 現在のテキストを取得
      const currentText = nameEl.textContent.trim();

      // 「@」で始まっていなければ、すでに置換済みか、単なる名前と判断して無視
      // ★ここが重要：WeakSetを使わず「今の見た目」で判断することで、再利用されたノードにも対応
      if (!currentText.startsWith("@") || currentText.length < 2) continue;

      // チップ自体のテキストも確認（構造崩れ対策）
      // 一部のチャット形式では #author-name が空で chip 直下にテキストがある場合があるため
      if (currentText === "") {
         const raw = chip.textContent.trim();
         if (!raw.startsWith("@")) continue;
      }

      requestName(currentText, (realName) => {
        if (realName) scheduleDomUpdate(nameEl, realName);
      });
    }
  }

  // MutationObserver
  // ★重要: subtree: false に戻し、トップレベルの行追加のみを監視する
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) processNode(node);
      }
    }
  });

  function startObserver() {
    const items = document.querySelector("yt-live-chat-item-list-renderer #items");
    if (items) {
      // 既存分を処理
      const existing = items.querySelectorAll("yt-live-chat-author-chip");
      existing.forEach(chip => processNode(chip)); // chip自体を渡すよう調整

      // 監視開始
      observer.observe(items, { childList: true, subtree: false });
    } else {
      setTimeout(startObserver, 1000);
    }
  }

  startObserver();
})();