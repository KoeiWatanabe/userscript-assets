// ==UserScript==
// @name         YouTubeに字幕を表示する
// @namespace    https://tampermonkey.net/
// @version      1.4.0
// @description  自作の .srt / .lrc 字幕を YouTube 動画にオーバーレイ表示する。Alt+C: 表示オン/オフ, Alt+Shift+C: 字幕ファイル読み込み, Alt+S: 字幕保存（タイムスタンプ付き）, Alt+Shift+S: 字幕保存。フルスクリーン/通常時とも動画領域に追従。
// @match        https://www.youtube.com/*
// @run-at       document-end
// @grant        GM_setValue
// @grant        GM_getValue
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeに字幕を表示する/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeに字幕を表示する/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeに字幕を表示する/icon_128.png
// ==/UserScript==

(() => {
  "use strict";

  // ── Tuning constants (edit to taste) ──────────────────────────────────────
  const FONT_RATIO     = 0.045; // font-size = player_height * FONT_RATIO
  const FONT_MIN_PX    = 14;
  const FONT_MAX_PX    = 56;
  const BOTTOM_PERCENT = 5;     // distance from bottom of player (%)
  const MAX_WIDTH_PCT  = 85;    // max width relative to player (%)

  // ── Storage keys ──────────────────────────────────────────────────────────
  // NOTE: v1.1 から .lrc もサポート。キー名は互換性のため据え置き（値は .srt/.lrc どちらも格納）。
  const CAPTION_KEY_PREFIX        = "ytsrt:srt:"; // + videoId → 字幕ファイル本文（.srt or .lrc）
  const ENABLED_KEY               = "ytsrt:enabled";
  const LAST_LRC_DEFAULT_DURATION = 5;            // .lrc は最後の cue の長さをこの秒数とする

  // ── DOM ids / selectors ───────────────────────────────────────────────────
  const OVERLAY_ID      = "ytsrt-overlay";
  const STYLE_ID        = "ytsrt-style";
  const NOTIFY_ID       = "ytsrt-notify";
  const PLAYER_SELECTOR = "#movie_player";
  const VIDEO_SELECTOR  = "video.html5-main-video";

  // ── Notification（iOS 風バナー） ─────────────────────────────────────────
  const NOTIFY_TITLE = "YouTubeに字幕を表示する";
  const NOTIFY_ICON  = "https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeに字幕を表示する/icon_128.png";

  // ── State ─────────────────────────────────────────────────────────────────
  const state = {
    cues: [],
    enabled: true,
    currentVideoId: "",
    lastCueIdx: -1,
    renderedBody: null,
    resizeObs: null,
    notifyTimer: 0,
    boundVideo: null,
    routeToken: 0,
  };

  // ── Utilities ─────────────────────────────────────────────────────────────
  const isVideoPage = () =>
    location.pathname.startsWith("/watch") || location.pathname.startsWith("/live/");

  function getVideoId() {
    const q = new URLSearchParams(location.search).get("v");
    if (q) return q;
    const m = location.pathname.match(/^\/(?:live|embed)\/([^/?#]+)/);
    return m ? m[1] : "";
  }

  function getPlayer() {
    return document.querySelector(PLAYER_SELECTOR);
  }

  function getVideo() {
    return document.querySelector(VIDEO_SELECTOR);
  }

  function getOverlay() {
    return document.getElementById(OVERLAY_ID);
  }

  function normalizeCaptionText(raw) {
    return raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  }

  function gmGet(key, fallback) {
    try { return GM_getValue(key, fallback); } catch { return fallback; }
  }

  function gmSet(key, value) {
    try { GM_setValue(key, value); } catch { /* ignore */ }
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function resetCueState() {
    state.cues = [];
    state.lastCueIdx = -1;
    state.renderedBody = null;
  }

  function setCueState(cues) {
    state.cues = cues;
    state.lastCueIdx = -1;
    state.renderedBody = null;
  }

  function isEditableTarget(el = document.activeElement) {
    const tag = el?.tagName?.toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable;
  }

  function createNotifyFallbackIcon() {
    const fallback = document.createElement("div");
    fallback.className = "ytsrt-notify__icon-fallback";
    fallback.textContent = "\u5B57";
    return fallback;
  }

  // ── SRT parser ────────────────────────────────────────────────────────────
  // 戻り値: [{ start, end, body }]。body は SRT 本文のまま（タグ含む）。
  // レンダリング時に DOM へ安全に変換する（TrustedTypes 下でも innerHTML を使わない）。
  function parseSRT(raw) {
    if (!raw) return [];
    const text = normalizeCaptionText(raw).trim();
    const blocks = text.split(/\n{2,}/);
    const cues = [];

    for (const block of blocks) {
      const lines = block.split("\n");
      let tsIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/-->/.test(lines[i])) {
          tsIdx = i;
          break;
        }
      }
      if (tsIdx < 0) continue;

      const m = lines[tsIdx].match(
        /(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})\s*-->\s*(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})/
      );
      if (!m) continue;

      const start = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
      const end = (+m[5]) * 3600 + (+m[6]) * 60 + (+m[7]) + (+m[8]) / 1000;
      const body = unescapeNewlines(lines.slice(tsIdx + 1).join("\n").trim());
      if (!body) continue;

      cues.push({ start, end, body });
    }

    cues.sort((a, b) => a.start - b.start);
    return cues;
  }

  // 本文中の文字列 "\n" / "\r" （バックスラッシュ + 文字）を実改行へ変換する。
  // 単一行で書かれた字幕に明示的な改行を入れたい場合のため。
  function unescapeNewlines(s) {
    return s.replace(/\\r\\n|\\n|\\r/g, "\n");
  }

  // ── LRC parser ────────────────────────────────────────────────────────────
  // LRC は end time を持たないので、各 cue の end = 次の cue の start。最後の cue は +LAST_LRC_DEFAULT_DURATION。
  function parseLRC(raw) {
    if (!raw) return [];
    const text = normalizeCaptionText(raw);
    const lines = text.split("\n");
    const cues = [];
    let offsetSec = 0;
    let lastBatch = null;

    const TS_HEAD = /^\[(\d+):(\d+)(?:[.:](\d+))?\]/;
    const META = /^\[([a-zA-Z]+):\s*([^\]]*)\]\s*$/;
    const WORD_TS = /<\d+:\d+(?:[.:]\d+)?>/g;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        lastBatch = null;
        continue;
      }

      const meta = line.match(META);
      if (meta && !/^\d+$/.test(meta[1])) {
        if (meta[1].toLowerCase() === "offset") {
          const v = parseInt(meta[2], 10);
          if (!isNaN(v)) offsetSec = v / 1000;
        }
        lastBatch = null;
        continue;
      }

      const stamps = [];
      let rest = line;
      let m;
      while ((m = rest.match(TS_HEAD))) {
        const min = +m[1];
        const sec = +m[2];
        const frac = m[3] ? parseFloat("0." + m[3]) : 0;
        stamps.push(min * 60 + sec + frac);
        rest = rest.slice(m[0].length);
      }

      if (stamps.length) {
        const body = unescapeNewlines(rest.replace(WORD_TS, "").trim());
        const batch = [];
        for (const start of stamps) {
          const cue = { start: Math.max(0, start + offsetSec), end: -1, body };
          cues.push(cue);
          batch.push(cue);
        }
        lastBatch = batch;
      } else if (lastBatch) {
        const extra = unescapeNewlines(line.replace(WORD_TS, "").trim());
        if (!extra) continue;
        for (const cue of lastBatch) {
          cue.body = cue.body ? cue.body + "\n" + extra : extra;
        }
      }
    }

    cues.sort((a, b) => a.start - b.start);
    for (let i = 0; i < cues.length; i++) {
      cues[i].end = i < cues.length - 1
        ? cues[i + 1].start
        : cues[i].start + LAST_LRC_DEFAULT_DURATION;
    }
    return cues;
  }

  function parseCaption(raw) {
    if (!raw) return { cues: [], format: null };
    const sample = raw.slice(0, 2048);
    if (/-->/.test(sample)) return { cues: parseSRT(raw), format: "srt" };
    if (/^\s*\[\d+:\d+/m.test(sample) || /^\s*\[[a-z]+:/im.test(sample)) {
      return { cues: parseLRC(raw), format: "lrc" };
    }
    return { cues: parseSRT(raw), format: "srt" };
  }

  // SRT 本文を DOM ノード列としてコンテナに描画する。
  // 許可タグ: <i>/<b>/<u>（<br> はテキスト中の改行から生成、<font ...> は無視）
  function renderBodyInto(container, body) {
    clearChildren(container);

    const TAG_RE = /<(\/?)(i|b|u)\s*>|<\/?font\b[^>]*>|\n/gi;
    const stack = [container];
    let lastIndex = 0;
    let m;

    while ((m = TAG_RE.exec(body)) !== null) {
      const before = body.slice(lastIndex, m.index);
      if (before) {
        stack[stack.length - 1].appendChild(document.createTextNode(before));
      }

      const token = m[0];
      if (token === "\n") {
        stack[stack.length - 1].appendChild(document.createElement("br"));
      } else if (/^<\/?font\b/i.test(token)) {
        // <font ...>, </font> は無視（色指定などを落とす）
      } else if (m[1] === "/") {
        const tag = m[2].toLowerCase();
        if (stack.length > 1 && stack[stack.length - 1].tagName.toLowerCase() === tag) {
          stack.pop();
        }
      } else {
        const tag = m[2].toLowerCase();
        const el = document.createElement(tag);
        stack[stack.length - 1].appendChild(el);
        stack.push(el);
      }

      lastIndex = TAG_RE.lastIndex;
    }

    const rest = body.slice(lastIndex);
    if (rest) {
      stack[stack.length - 1].appendChild(document.createTextNode(rest));
    }
  }

  // ── Cue 検索（現在時刻で表示すべき cue を返す） ─────────────────────────
  function findCueAt(t) {
    if (!state.cues.length) return null;

    if (state.lastCueIdx >= 0) {
      const current = state.cues[state.lastCueIdx];
      if (current && t >= current.start && t < current.end) return current;
    }

    let lo = 0;
    let hi = state.cues.length - 1;
    let found = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const cue = state.cues[mid];
      if (t < cue.start) hi = mid - 1;
      else if (t >= cue.end) lo = mid + 1;
      else {
        found = mid;
        break;
      }
    }

    state.lastCueIdx = found;
    return found >= 0 ? state.cues[found] : null;
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID} {
        position: absolute;
        left: 50%;
        bottom: ${BOTTOM_PERCENT}%;
        transform: translateX(-50%);
        max-width: ${MAX_WIDTH_PCT}%;
        z-index: 60;
        pointer-events: none;
        text-align: center;
        color: #fff;
        font-family: "YouTube Noto", "Noto Sans JP", "Roboto", "Arial", sans-serif;
        font-weight: 500;
        line-height: 1.3;
        text-shadow: 0 0 2px rgba(0,0,0,0.85);
        white-space: pre-wrap;
        word-break: break-word;
        display: none;
      }
      #${OVERLAY_ID} > span {
        display: inline-block;
        background: rgba(0, 0, 0, 0.75);
        padding: 0.18em 0.5em;
        border-radius: 3px;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
      }
      #${OVERLAY_ID}.--visible { display: block; }

      @keyframes ytsrt-notify-in {
        0%   { opacity: 0; transform: translate(-50%, -100%); }
        5%   { opacity: 1; transform: translate(-50%, 0); }
        85%  { opacity: 1; transform: translate(-50%, 0); }
        100% { opacity: 0; transform: translate(-50%, -100%); }
      }
      #${NOTIFY_ID} {
        position: absolute;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 70;
        pointer-events: none;
        min-width: 260px;
        max-width: 400px;
        padding: 10px 14px;
        border-radius: 14px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: -apple-system, BlinkMacSystemFont, "Noto Sans JP", "Helvetica Neue", sans-serif;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        animation: ytsrt-notify-in 5s cubic-bezier(0.32, 0.72, 0, 1) forwards;
      }
      #${NOTIFY_ID}.--dark {
        background: rgba(30, 30, 30, 0.88);
        box-shadow: 0 4px 24px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(255,255,255,0.1) inset;
      }
      #${NOTIFY_ID}.--light {
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 4px 24px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.06);
      }
      .ytsrt-notify__icon {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        object-fit: cover;
        flex-shrink: 0;
      }
      .ytsrt-notify__icon-fallback {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        background: linear-gradient(135deg, #FF3B30, #FF6B6B);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: #fff;
        font-size: 18px;
        font-weight: bold;
      }
      .ytsrt-notify__body { display: flex; flex-direction: column; gap: 1px; }
      .ytsrt-notify__title { font-size: 13px; font-weight: 600; letter-spacing: 0.2px; }
      .ytsrt-notify__msg   { font-size: 12px; font-weight: 400; }
      .ytsrt-notify__time  { font-size: 11px; margin-left: auto; align-self: flex-start; flex-shrink: 0; }
      #${NOTIFY_ID}.--dark .ytsrt-notify__title { color: rgba(255,255,255,0.95); }
      #${NOTIFY_ID}.--dark .ytsrt-notify__msg   { color: rgba(255,255,255,0.6); }
      #${NOTIFY_ID}.--dark .ytsrt-notify__time  { color: rgba(255,255,255,0.35); }
      #${NOTIFY_ID}.--light .ytsrt-notify__title { color: rgba(0,0,0,0.88); }
      #${NOTIFY_ID}.--light .ytsrt-notify__msg   { color: rgba(0,0,0,0.5); }
      #${NOTIFY_ID}.--light .ytsrt-notify__time  { color: rgba(0,0,0,0.3); }
    `;
    document.head.appendChild(style);
  }

  // ── Overlay lifecycle ─────────────────────────────────────────────────────
  function ensureOverlay(player = getPlayer()) {
    if (!player) return null;
    ensureStyle();

    let overlay = getOverlay();
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.appendChild(document.createElement("span"));
    }
    if (overlay.parentElement !== player) {
      player.appendChild(overlay);
    }

    updateOverlayMetrics();
    observePlayerResize(player);
    return overlay;
  }

  function observePlayerResize(player) {
    if (state.resizeObs || typeof ResizeObserver === "undefined") return;
    state.resizeObs = new ResizeObserver(() => updateOverlayMetrics());
    state.resizeObs.observe(player);
  }

  function disconnectResizeObserver() {
    if (!state.resizeObs) return;
    state.resizeObs.disconnect();
    state.resizeObs = null;
  }

  function updateOverlayMetrics() {
    const overlay = getOverlay();
    const player = getPlayer();
    if (!overlay || !player) return;

    const height = player.getBoundingClientRect().height;
    if (height <= 0) return;

    const fontSize = Math.max(FONT_MIN_PX, Math.min(FONT_MAX_PX, height * FONT_RATIO));
    overlay.style.fontSize = `${fontSize}px`;
  }

  function renderOverlay(body) {
    const nextBody = body || "";
    const overlay = nextBody ? ensureOverlay() : getOverlay();
    if (!overlay) {
      if (!nextBody) state.renderedBody = "";
      return;
    }
    if (state.renderedBody === nextBody) return;

    const inner = overlay.firstElementChild;
    if (!inner) return;

    if (nextBody) {
      renderBodyInto(inner, nextBody);
      overlay.classList.add("--visible");
    } else {
      clearChildren(inner);
      overlay.classList.remove("--visible");
    }

    state.renderedBody = nextBody;
  }

  // ── Time update → render cue ──────────────────────────────────────────────
  function renderCurrentCue() {
    if (!state.enabled) {
      renderOverlay("");
      return;
    }

    const video = state.boundVideo || getVideo();
    if (!video) {
      renderOverlay("");
      return;
    }

    const cue = findCueAt(video.currentTime);
    renderOverlay(cue ? cue.body : "");
  }

  function unbindVideoListeners() {
    if (!state.boundVideo) return;
    state.boundVideo.removeEventListener("timeupdate", renderCurrentCue);
    state.boundVideo.removeEventListener("seeking", renderCurrentCue);
    state.boundVideo = null;
  }

  function bindVideoListeners() {
    const video = getVideo();
    if (!video) return false;
    if (state.boundVideo === video) return true;

    unbindVideoListeners();
    video.addEventListener("timeupdate", renderCurrentCue);
    video.addEventListener("seeking", renderCurrentCue);
    state.boundVideo = video;
    return true;
  }

  // ── Notification（iOS 風バナー） ───────────────────────────────────────
  function notify(msg) {
    ensureStyle();

    const player = getPlayer();
    if (!player) return;

    const existing = document.getElementById(NOTIFY_ID);
    if (existing) existing.remove();
    if (state.notifyTimer) {
      clearTimeout(state.notifyTimer);
      state.notifyTimer = 0;
    }

    const isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

    const banner = document.createElement("div");
    banner.id = NOTIFY_ID;
    banner.classList.add(isDark ? "--dark" : "--light");

    if (NOTIFY_ICON) {
      const img = document.createElement("img");
      img.className = "ytsrt-notify__icon";
      img.src = NOTIFY_ICON;
      img.alt = "";
      img.onerror = () => img.replaceWith(createNotifyFallbackIcon());
      banner.appendChild(img);
    } else {
      banner.appendChild(createNotifyFallbackIcon());
    }

    const body = document.createElement("div");
    body.className = "ytsrt-notify__body";

    const title = document.createElement("div");
    title.className = "ytsrt-notify__title";
    title.textContent = NOTIFY_TITLE;

    const message = document.createElement("div");
    message.className = "ytsrt-notify__msg";
    message.textContent = msg;

    body.appendChild(title);
    body.appendChild(message);
    banner.appendChild(body);

    const time = document.createElement("div");
    time.className = "ytsrt-notify__time";
    time.textContent = "\u4ECA";
    banner.appendChild(time);

    player.appendChild(banner);
    state.notifyTimer = setTimeout(() => {
      if (banner.parentNode) banner.remove();
      state.notifyTimer = 0;
    }, 3500);
  }

  // ── Toggle / Load ─────────────────────────────────────────────────────────
  function setEnabled(on) {
    state.enabled = !!on;
    gmSet(ENABLED_KEY, state.enabled);
    renderCurrentCue();
  }

  function toggleEnabled() {
    if (!state.cues.length) {
      notify("字幕が読み込まれていません（Alt+Shift+C）");
      return;
    }
    setEnabled(!state.enabled);
    notify(state.enabled ? "字幕: ON" : "字幕: OFF");
  }

  function waitForPlayer(timeoutMs = 10000) {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const tick = () => {
        if (getPlayer() && getVideo()) return resolve(true);
        if (Date.now() > deadline) return resolve(false);
        setTimeout(tick, 150);
      };
      tick();
    });
  }

  async function loadCaptionText(raw, {
    persist = false,
    persistVideoId = state.currentVideoId,
    enableAfterLoad = false,
    routeToken = state.routeToken,
  } = {}) {
    const { cues, format } = parseCaption(raw);
    if (!cues.length) return { ok: false, reason: "parse" };

    setCueState(cues);

    if (persist && persistVideoId) {
      gmSet(CAPTION_KEY_PREFIX + persistVideoId, raw);
    }
    if (enableAfterLoad) {
      state.enabled = true;
      gmSet(ENABLED_KEY, true);
    }

    const ready = await waitForPlayer();
    if (!ready || routeToken !== state.routeToken) {
      return { ok: true, format, cueCount: cues.length, ready: false };
    }

    ensureOverlay();
    bindVideoListeners();
    renderCurrentCue();
    return { ok: true, format, cueCount: cues.length, ready: true };
  }

  function openFilePicker() {
    const videoId = state.currentVideoId;
    if (!videoId) {
      notify("動画IDを取得できません");
      return;
    }

    const routeToken = state.routeToken;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".srt,.lrc,text/plain";
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", async () => {
      try {
        const file = input.files && input.files[0];
        if (!file) return;

        const text = await file.text();
        if (routeToken !== state.routeToken || videoId !== state.currentVideoId) return;

        const result = await loadCaptionText(text, {
          persist: true,
          persistVideoId: videoId,
          enableAfterLoad: true,
          routeToken,
        });
        if (!result.ok) {
          notify("字幕ファイルを解析できませんでした");
          return;
        }

        notify(`字幕を読み込みました（${result.format?.toUpperCase() ?? ""} / ${result.cueCount}行）`);
      } catch (e) {
        console.warn("[ytsrt] load failed:", e);
        notify("読み込みに失敗しました");
      } finally {
        input.remove();
      }
    }, { once: true });

    input.click();
  }

  // ── Route handling ────────────────────────────────────────────────────────
  function detach() {
    unbindVideoListeners();
    disconnectResizeObserver();

    const overlay = getOverlay();
    if (overlay) overlay.remove();

    const banner = document.getElementById(NOTIFY_ID);
    if (banner) banner.remove();
    if (state.notifyTimer) {
      clearTimeout(state.notifyTimer);
      state.notifyTimer = 0;
    }

    resetCueState();
    state.currentVideoId = "";
  }

  async function handleRouteChange() {
    const routeToken = ++state.routeToken;
    detach();

    if (!isVideoPage()) return;

    const videoId = getVideoId();
    if (!videoId) return;

    state.currentVideoId = videoId;
    const saved = gmGet(CAPTION_KEY_PREFIX + videoId, null);
    if (!saved) return;

    await loadCaptionText(saved, { routeToken });
  }

  // ── Caption export ────────────────────────────────────────────────────────
  function stripInlineTags(body) {
    return body.replace(/<\/?(?:i|b|u)\s*>|<\/?font\b[^>]*>/gi, "");
  }

  function normalizeCueText(body) {
    return stripInlineTags(body)
      .replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatTimestamp(seconds, useHours) {
    const total = Math.max(0, Math.floor(seconds));
    const s = total % 60;
    const m = Math.floor(total / 60) % 60;
    const h = Math.floor(total / 3600);
    const pad = (n) => String(n).padStart(2, "0");
    return useHours ? `${h}:${pad(m)}:${pad(s)}` : `${pad(Math.floor(total / 60))}:${pad(s)}`;
  }

  function getVideoTitle() {
    const candidates = [
      () => document.querySelector("h1.ytd-watch-metadata yt-formatted-string")?.textContent,
      () => document.querySelector("h1.title yt-formatted-string")?.textContent,
      () => document.querySelector('meta[name="title"]')?.content,
      () => document.title?.replace(/\s*-\s*YouTube\s*$/, ""),
      () => state.currentVideoId,
    ];
    for (const get of candidates) {
      const v = (get() || "").trim();
      if (v) return v;
    }
    return "";
  }

  function sanitizeFilename(name) {
    let s = (name || "")
      .replace(/[\x00-\x1f]/g, "_")
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.\s]+$/, "");
    if (s.length > 120) s = s.slice(0, 120).replace(/[.\s]+$/, "");
    return s || "transcript";
  }

  function buildTranscriptText(cues, { withTimestamps }) {
    const useHours = cues.some((c) => c.start >= 3600);
    const lines = [];
    for (const cue of cues) {
      const text = normalizeCueText(cue.body);
      if (!text) continue;
      lines.push(withTimestamps ? `${formatTimestamp(cue.start, useHours)} ${text}` : text);
    }
    return lines.join("\r\n");
  }

  function downloadTextFile(filename, contents) {
    const blob = new Blob(["\uFEFF" + contents], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function exportCaption(withTimestamps) {
    if (!state.cues.length) {
      notify("字幕が読み込まれていません");
      return;
    }
    try {
      const text = buildTranscriptText(state.cues, { withTimestamps });
      if (!text) {
        notify("字幕が読み込まれていません");
        return;
      }
      const title = sanitizeFilename(getVideoTitle());
      const suffix = withTimestamps ? " - transcript (with timestamp).txt" : " - transcript.txt";
      const filename = title + suffix;
      downloadTextFile(filename, text);
      notify(`字幕を ${filename} として保存しました`);
    } catch (e) {
      console.error("[ytsrt] export failed:", e);
      notify("字幕の保存に失敗しました");
    }
  }

  // ── Shortcuts ─────────────────────────────────────────────────────────────
  function registerShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (!isVideoPage() || isEditableTarget()) return;

      const altOnly = e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey;
      const altShift = e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey;
      if (!altOnly && !altShift) return;

      if (e.code === "KeyC") {
        e.preventDefault();
        e.stopPropagation();
        if (altOnly) toggleEnabled();
        else openFilePicker();
        return;
      }
      if (e.code === "KeyS") {
        e.preventDefault();
        e.stopPropagation();
        exportCaption(altOnly);
        return;
      }
    }, true);
  }

  // ── Startup ───────────────────────────────────────────────────────────────
  function start() {
    state.enabled = gmGet(ENABLED_KEY, true);
    registerShortcuts();
    handleRouteChange();
    window.addEventListener("yt-navigate-finish", handleRouteChange);
  }

  start();
})();
