// ==UserScript==
// @name         YTコメントの名前をもとに戻す
// @namespace    https://example.com/
// @version      0.5
// @description  コメント欄や動画主表示などに出る@handle表記をチャンネル表示名へ（channel_id→Feed優先で安定化）
// @match        https://www.youtube.com/*
// @grant        GM_xmlhttpRequest
// @connect      www.youtube.com
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YTコメントの名前をもとに戻す/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YTコメントの名前をもとに戻す/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YTコメントの名前をもとに戻す/icon_128.png
// ==/UserScript==

(() => {
  "use strict";

  // ===== 設定 =====
  const ENABLE_REPLACE = true;

  // 取得負荷（総数上限は置かず、速度と同時数で縛る）
  const RATE_LIMIT_MS = 250;
  const MAX_CONCURRENCY = 2;

  // 失敗リトライ
  const RETRY_COUNT = 2;
  const RETRY_WAIT_MS = 400;

  // キャッシュ
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const FAIL_COOLDOWN_MS = 5 * 60 * 1000;

  // 保険スキャン
  const PERIODIC_RESCAN_MS = 2500;

  // ===== キャッシュ =====
  const memCache = new Map();   // key -> { name, t }  keyは "cid:..." or "h:..."
  const inflight = new Map();   // key -> Promise<string|null>
  const failCache = new Map();  // key -> lastFailTime

  const LS_KEY = "tm_youtube_namecache_v5";
  const now = Date.now();
  const ls = (() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
  })();
  for (const [k, v] of Object.entries(ls)) {
    if (v?.name && v?.t && (now - v.t) < CACHE_TTL_MS) memCache.set(k, v);
  }
  const saveLS = () => {
    const obj = {};
    for (const [k, v] of memCache.entries()) obj[k] = v;
    try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch {}
  };

  // ===== 基本ユーティリティ =====
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const decodeHtml = (s) => {
    const e = document.createElement("textarea");
    e.innerHTML = s;
    return e.value;
  };

  const gmGet = (url) => new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url,
      onload: (res) => resolve({ status: res.status, text: res.responseText }),
      onerror: reject,
      ontimeout: reject,
    });
  });

  // ===== 任意の要素から「近くのチャンネルリンク」を探してIDを抜く =====
  const extractIdsFromNearby = (el) => {
    if (!el) return { channelId: null, handle: null };

    // 優先：自分がaなら自分。そうでなければ近くのaを探す
    const a =
      (el.tagName === "A" ? el : null) ||
      el.closest?.('a[href*="/channel/UC"], a[href*="/@"]') ||
      el.querySelector?.('a[href*="/channel/UC"], a[href*="/@"]') ||
      null;

    const href = a?.href || a?.getAttribute?.("href") || "";

    // /channel/UCxxxx
    const c = href.match(/\/channel\/(UC[^/?#]+)/);
    const channelId = c?.[1] ? c[1] : null;

    // /@handle
    const h = href.match(/\/@([^/?#]+)/);
    let handle = null;
    if (h?.[1]) {
      try { handle = "@" + decodeURIComponent(h[1]).trim(); }
      catch { handle = "@" + h[1].trim(); }
    } else {
      // フォールバック：テキストが @... なら拾う（日本語OK）
      const t = (el.textContent || "").trim();
      if (t.startsWith("@")) handle = t.split(/\s+/)[0];
    }

    return { channelId, handle };
  };

  // ===== 取得キュー（レート制限 + 同時数制限）=====
  let lastRequestAt = 0;
  let active = 0;
  const pending = [];

  const pump = async () => {
    if (active >= MAX_CONCURRENCY) return;
    const job = pending.shift();
    if (!job) return;

    active++;
    try {
      const wait = Math.max(0, RATE_LIMIT_MS - (Date.now() - lastRequestAt));
      if (wait) await sleep(wait);
      lastRequestAt = Date.now();

      const out = await job.fn();
      job.resolve(out);
    } catch (e) {
      job.reject(e);
    } finally {
      active--;
      pump();
    }
  };

  const enqueue = (fn) => new Promise((resolve, reject) => {
    pending.push({ fn, resolve, reject });
    pump();
  });

  // ===== 名前取得ルート =====
  const fetchNameByChannelId_Feed = async (channelId) => {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
    const { status, text } = await gmGet(url);
    if (status !== 200) return null;
    const m = text.match(/<title>([^<].*?)<\/title>/);
    return m?.[1] ? decodeHtml(m[1]).trim() : null;
  };

  const fetchNameByHandle_Page = async (handle) => {
    const url = `https://www.youtube.com/${handle}`;
    const { status, text: html } = await gmGet(url);
    if (status !== 200) return null;

    const og = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    if (og?.[1]) return decodeHtml(og[1]).trim();

    const tt = html.match(/<title>([^<]+)<\/title>/i);
    if (tt?.[1]) return decodeHtml(tt[1]).replace(/\s*-\s*YouTube\s*$/i, "").trim();

    return null;
  };

  const withRetry = async (fn) => {
    for (let i = 0; i <= RETRY_COUNT; i++) {
      try {
        const r = await fn();
        if (r) return r;
      } catch {}
      if (i < RETRY_COUNT) await sleep(RETRY_WAIT_MS);
    }
    return null;
  };

  const getNameByKey = async (key, producerFn) => {
    const cached = memCache.get(key);
    if (cached?.name && (Date.now() - cached.t) < CACHE_TTL_MS) return cached.name;

    const lastFail = failCache.get(key);
    if (lastFail && (Date.now() - lastFail) < FAIL_COOLDOWN_MS) return null;

    if (inflight.has(key)) return inflight.get(key);

    const p = (async () => {
      try {
        const name = await enqueue(() => withRetry(producerFn));
        if (name) {
          memCache.set(key, { name, t: Date.now() });
          saveLS();
          return name;
        }
        failCache.set(key, Date.now());
        return null;
      } catch {
        failCache.set(key, Date.now());
        return null;
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, p);
    return p;
  };

  const getDisplayName = async ({ channelId, handle }) => {
    if (channelId) {
      const key = `cid:${channelId}`;
      const name = await getNameByKey(key, () => fetchNameByChannelId_Feed(channelId));
      if (name) return name;
    }
    if (handle) {
      const key = `h:${handle}`;
      const name = await getNameByKey(key, () => fetchNameByHandle_Page(handle));
      if (name) return name;
    }
    return null;
  };

  // ===== 置換対象：テキストが@で始まるものだけ =====
  const isHandleText = (el) => {
    const t = (el.textContent || "").trim();
    // "@xxxx" が先頭にあるやつだけ（表示名リンクの方は通常 @ で始まらない）
    return t.startsWith("@") && t.length >= 2;
  };

  const markKey = "tmProcessedKeyV5"; // datasetに処理キーを保存

  const applyReplace = (el, displayName, info) => {
    const hint = info.channelId ? info.channelId : (info.handle || "");
    el.textContent = displayName;
    if (hint) el.title = `${displayName} (${hint})`;
  };

  // ===== スキャン範囲：コメント作者 + ページ上の@表記（動画主含む） =====
  const getTargets = (root) => {
    if (!root?.querySelectorAll) return [];

    // 1) コメント作者リンク（@で始まる場合のみ後で置換）
    const commentAuthorLinks = root.querySelectorAll(
      "ytd-comment-thread-renderer a#author-text, ytd-comment-renderer a#author-text, a#author-text"
    );

    // 2) 動画主/ヘッダ/メタ領域などに出る @handle 表示（aでない場合もある）
    //    YouTubeはここが日替わり変装するので、@が出やすい要素を広めに拾う
    const handleTextNodes = root.querySelectorAll(
      [
        // 動画主付近
        "ytd-video-owner-renderer yt-formatted-string",
        "ytd-video-owner-renderer span",
        "#owner yt-formatted-string",
        "#owner span",
        "#upload-info yt-formatted-string",
        "#upload-info span",

        // チャンネル名ブロック一般
        "ytd-channel-name yt-formatted-string",
        "ytd-channel-name span",

        // 説明欄・メタにも稀に出る
        "#description yt-formatted-string",
        "#description span",
      ].join(",")
    );

    // 統合して返す（NodeList→配列）
    return [...commentAuthorLinks, ...handleTextNodes];
  };

  const processNode = (root) => {
    if (!ENABLE_REPLACE) return;

    const targets = getTargets(root);
    for (const el of targets) {
      // 「@から始まる表示」以外は触らない
      if (!isHandleText(el)) continue;

      const info = extractIdsFromNearby(el);
      if (!info.channelId && !info.handle) continue;

      const key = info.channelId ? `cid:${info.channelId}` : `h:${info.handle}`;
      if (el.dataset?.[markKey] === key) continue;
      if (el.dataset) el.dataset[markKey] = key;

      const cached = memCache.get(key);
      if (cached?.name) {
        applyReplace(el, cached.name, info);
        continue;
      }

      getDisplayName(info).then((name) => {
        if (!el.isConnected) return;
        if (el.dataset?.[markKey] !== key) return;
        if (name) applyReplace(el, name, info);
      });
    }
  };

  // ===== 取りこぼし対策 =====
  let scanScheduled = false;
  const scheduleScan = (node) => {
    if (scanScheduled) return;
    scanScheduled = true;
    setTimeout(() => {
      scanScheduled = false;
      processNode(node || document);
    }, 60);
  };

  const startObserver = () => {
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          for (const n of m.addedNodes) if (n.nodeType === 1) scheduleScan(n);
        } else if (m.type === "attributes") {
          const el = m.target;
          if (el?.nodeType === 1) scheduleScan(el);
        }
      }
    });

    obs.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "style", "class", "aria-expanded"],
    });

    processNode(document);
  };

  const hookExpandClicks = () => {
    document.addEventListener("click", (ev) => {
      const el = ev.target?.closest?.(
        "ytd-comment-replies-renderer tp-yt-paper-button, " +
        "ytd-comment-replies-renderer #more-replies, " +
        "ytd-comment-replies-renderer #less-replies, " +
        "ytd-comment-thread-renderer tp-yt-paper-button, " +
        "ytd-button-renderer a, ytd-button-renderer button"
      );
      if (!el) return;

      const t = (el.textContent || "").trim();
      if (!/返信|repl(ies|y)|responses|view/i.test(t)) return;

      const thread = el.closest("ytd-comment-thread-renderer") || el.closest("ytd-comment-renderer");
      if (!thread) return;

      setTimeout(() => processNode(thread), 100);
      setTimeout(() => processNode(thread), 450);
      setTimeout(() => processNode(thread), 1500);
    }, true);
  };

  const startPeriodicRescan = () => {
    setInterval(() => {
      if (location.pathname !== "/watch") return;
      processNode(document);
    }, PERIODIC_RESCAN_MS);
  };

  const startUrlWatcher = () => {
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;

      if (location.pathname !== "/watch") return;
      setTimeout(() => processNode(document), 600);
      setTimeout(() => processNode(document), 2000);
      setTimeout(() => processNode(document), 5000); // 動画主エリアが遅い時の保険
    }, 500);
  };

  const boot = () => {
    startUrlWatcher();
    if (location.pathname !== "/watch") return;

    startObserver();
    hookExpandClicks();
    startPeriodicRescan();

    // 初期の遅延保険（動画主領域が後で来るケースがある）
    setTimeout(() => processNode(document), 2000);
    setTimeout(() => processNode(document), 5000);
  };

  boot();
})();
