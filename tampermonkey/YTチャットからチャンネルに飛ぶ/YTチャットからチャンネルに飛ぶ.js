// ==UserScript==
// @name         YTチャットからチャンネルに飛ぶ
// @namespace    https://example.com/
// @version      5.0.0
// @match        https://www.youtube.com/live_chat*
// @match        https://www.youtube.com/live_chat_replay*
// @grant        GM_openInTab
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YTチャットからチャンネルに飛ぶ/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YTチャットからチャンネルに飛ぶ/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YTチャットからチャンネルに飛ぶ/icon_128.png
// ==/UserScript==

(() => {
  "use strict";

  // ---- Settings ----
  const OPEN_IN_BACKGROUND = false; // trueにすると背景タブ狙い（環境依存）
  // ------------------

  // rendererごとの解決済みchannelIdをキャッシュ（GCされるので安全）
  const cidCache = new WeakMap(); // renderer -> string|null

  function getRenderer(el) {
    return el?.closest?.(
      "yt-live-chat-text-message-renderer," +
      "yt-live-chat-paid-message-renderer," +
      "yt-live-chat-membership-item-renderer," +
      "yt-live-chat-paid-sticker-renderer"
    );
  }

  // 「アイコン(#author-photo)クリック」だけを対象にする（Shadow DOM対策でcomposedPath）
  function isAvatarEvent(ev) {
    const path = (typeof ev.composedPath === "function") ? ev.composedPath() : null;
    if (path) {
      for (let i = 0; i < path.length; i++) {
        const n = path[i];
        if (n && n.nodeType === 1 && n.id === "author-photo") return true;
      }
    }
    return !!ev.target?.closest?.("#author-photo");
  }

  function openUrl(url) {
    if (!url) return;

    try {
      if (typeof GM_openInTab === "function") {
        GM_openInTab(url, { active: !OPEN_IN_BACKGROUND, insert: true, setParent: true });
        return;
      }
      if (typeof GM !== "undefined" && typeof GM.openInTab === "function") {
        GM.openInTab(url, { active: !OPEN_IN_BACKGROUND, insert: true });
        return;
      }
    } catch { /* ignore */ }

    // 最終fallback
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function isChannelId(s) {
    return typeof s === "string" && /^UC[A-Za-z0-9_-]{20,}$/.test(s);
  }

  function extractChannelId(renderer) {
    if (!renderer) return null;

    // キャッシュ優先（nullもキャッシュして無駄探索を防ぐ）
    if (cidCache.has(renderer)) return cidCache.get(renderer);

    // 1) まず軽い既知ルート（ほぼここで取れる）
    const direct =
      renderer.authorExternalChannelId ||
      renderer?.data?.authorExternalChannelId ||
      renderer?.__data?.data?.authorExternalChannelId ||
      renderer?.__data?.authorExternalChannelId;

    if (isChannelId(direct)) {
      cidCache.set(renderer, direct);
      return direct;
    }

    // 2) 属性にある世界線
    const attr =
      renderer.getAttribute("author-external-channel-id") ||
      renderer.getAttribute("data-author-external-channel-id");

    if (isChannelId(attr)) {
      cidCache.set(renderer, attr);
      return attr;
    }

    // 3) 最後の手段：浅く・回数制限つき探索（高コストなので最小限）
    const roots = [];
    if (renderer.__data) roots.push(renderer.__data);
    if (renderer.data) roots.push(renderer.data);

    const seen = new Set();
    const queue = [];
    for (const r of roots) queue.push({ v: r, d: 0 });

    const MAX_DEPTH = 4;
    const MAX_NODES = 500;
    let nodes = 0;

    while (queue.length && nodes < MAX_NODES) {
      const { v, d } = queue.shift();
      nodes++;

      if (!v || typeof v !== "object") continue;
      if (seen.has(v)) continue;
      seen.add(v);

      // よくあるキー名を優先チェック
      const maybe = v.authorExternalChannelId || v.externalChannelId || v.channelId || v.browseId;
      if (isChannelId(maybe)) {
        cidCache.set(renderer, maybe);
        return maybe;
      }

      if (d >= MAX_DEPTH) continue;

      if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) queue.push({ v: v[i], d: d + 1 });
      } else {
        for (const k in v) {
          const child = v[k];
          if (isChannelId(child)) {
            cidCache.set(renderer, child);
            return child;
          }
          if (child && typeof child === "object") queue.push({ v: child, d: d + 1 });
        }
      }
    }

    cidCache.set(renderer, null);
    return null;
  }

  // YouTube側の「レポート/ブロック」等が出るのを根本から止める
  function swallowEvent(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
  }

  function onPointerDown(ev) {
    if (ev.button !== 0) return;
    if (!isAvatarEvent(ev)) return;
    swallowEvent(ev);
  }

  function onPointerUp(ev) {
    if (ev.button !== 0) return;
    if (!isAvatarEvent(ev)) return;

    const renderer = getRenderer(ev.target);
    const cid = extractChannelId(renderer);
    if (!cid) return;

    swallowEvent(ev);
    openUrl(`https://www.youtube.com/channel/${cid}`);
  }

  function init() {
    // captureで先に奪う（ここが肝）
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
  }

  if (document.body) init();
  else requestAnimationFrame(() => document.body && init());
})();
