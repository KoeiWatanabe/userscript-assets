// ==UserScript==
// @name         YouTubeに字幕を表示する
// @namespace    https://tampermonkey.net/
// @version      1.3.0
// @description  自作の .srt / .lrc 字幕を YouTube 動画にオーバーレイ表示する。Alt+C: 表示オン/オフ, Alt+Shift+C: 字幕ファイル読み込み。フルスクリーン/通常時とも動画領域に追従。
// @match        https://www.youtube.com/*
// @run-at       document-end
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeに字幕を表示する/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeに字幕を表示する/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeに字幕を表示する/icon_128.png
// ==/UserScript==

(() => {
  "use strict";

  // ── Tuning constants (edit to taste) ──────────────────────────────────────
  const FONT_RATIO      = 0.045; // font-size = player_height * FONT_RATIO
  const FONT_MIN_PX     = 14;
  const FONT_MAX_PX     = 56;
  const BOTTOM_PERCENT  = 5;    // distance from bottom of player (%)
  const MAX_WIDTH_PCT   = 85;    // max width relative to player (%)

  // ── Storage keys ──────────────────────────────────────────────────────────
  // NOTE: v1.1 から .lrc もサポート。キー名は互換性のため据え置き（値は .srt/.lrc どちらも格納）。
  const SRT_KEY_PREFIX = "ytsrt:srt:";     // + videoId → 字幕ファイル本文（.srt or .lrc）
  const ENABLED_KEY    = "ytsrt:enabled";  // global on/off
  const LAST_LRC_DEFAULT_DURATION = 5;     // .lrc は end time を持たないため最後の cue の長さをこの秒数とする

  // ── DOM ids / classes ─────────────────────────────────────────────────────
  const OVERLAY_ID = "ytsrt-overlay";
  const STYLE_ID   = "ytsrt-style";
  const NOTIFY_ID  = "ytsrt-notify";

  // ── 通知（iOS 風バナー） ──────────────────────────────────────────────────
  const NOTIFY_TITLE = "YouTubeに字幕を表示する";
  const NOTIFY_ICON  = "https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeに字幕を表示する/icon_128.png";

  // ── State ─────────────────────────────────────────────────────────────────
  let _cues         = [];    // [{ start, end, html }]
  let _enabled      = true;
  let _currentVideoId = "";
  let _lastCueIdx   = -1;
  let _resizeObs    = null;
  let _timeUpdateBound = false;
  let _notifyTimer  = 0;

  // ── Utilities ─────────────────────────────────────────────────────────────
  const isVideoPage = () =>
    location.pathname.startsWith("/watch") || location.pathname.startsWith("/live/");

  function getVideoId() {
    const q = new URLSearchParams(location.search).get("v");
    if (q) return q;
    const m = location.pathname.match(/^\/(?:live|embed)\/([^/?#]+)/);
    if (m) return m[1];
    return "";
  }

  function gmGet(key, fallback) {
    try { return GM_getValue(key, fallback); } catch { return fallback; }
  }
  function gmSet(key, value) {
    try { GM_setValue(key, value); } catch { /* ignore */ }
  }

  // ── SRT parser ────────────────────────────────────────────────────────────
  // 戻り値: [{ start, end, body }]。body は SRT 本文のまま（タグ含む）。
  // レンダリング時に DOM へ安全に変換する（TrustedTypes 下でも innerHTML を使わない）。
  function parseSRT(raw) {
    if (!raw) return [];
    const text = raw
      .replace(/^\uFEFF/, "")        // BOM 除去
      .replace(/\r\n?/g, "\n")       // 改行正規化
      .trim();
    const blocks = text.split(/\n{2,}/);
    const cues = [];

    for (const block of blocks) {
      const lines = block.split("\n");
      // タイムスタンプ行を探す（先頭の index 行が欠落していても動く）
      let tsIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/-->/.test(lines[i])) { tsIdx = i; break; }
      }
      if (tsIdx < 0) continue;
      const m = lines[tsIdx].match(
        /(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})\s*-->\s*(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})/
      );
      if (!m) continue;
      const start = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
      const end   = (+m[5]) * 3600 + (+m[6]) * 60 + (+m[7]) + (+m[8]) / 1000;
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
  // LRC フォーマット:
  //   [ti:Title] / [ar:Artist] / [offset:+500] などのメタタグは無視 or offset のみ適用。
  //   [mm:ss.xx]歌詞テキスト    … 行頭に1つ以上のタイムスタンプ
  //   [mm:ss.xx][mm:ss.xx]繰返  … 同一行に複数タイムスタンプ → 各時刻で同じ歌詞を表示
  //   空本文のタイムスタンプ行  … その時刻以降は空表示（直前の cue の終端として機能）
  //   <mm:ss.xx> 形式の単語レベル拡張タグはテキストから除去
  //
  // 改行の扱い:
  //   1) タイムスタンプを持たない非空行は、直前のタイムスタンプ行の続きとして前 cue に連結する（実改行）。
  //      空行・メタタグを挟むと継続は途切れる。
  //   2) 本文中の文字列 "\n" (バックスラッシュ+n) は実改行に変換する（unescapeNewlines 経由）。
  //
  // LRC は end time を持たないので、各 cue の end = 次の cue の start。最後の cue は +LAST_LRC_DEFAULT_DURATION。
  function parseLRC(raw) {
    if (!raw) return [];
    const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    const lines = text.split("\n");
    const cues = [];
    let offsetSec = 0;
    let lastBatch = null; // 直近のタイムスタンプ行で作った cue 群（同一バッチに続き行を連結する）

    const TS_HEAD = /^\[(\d+):(\d+)(?:[.:](\d+))?\]/;
    const META    = /^\[([a-zA-Z]+):\s*([^\]]*)\]\s*$/;
    const WORD_TS = /<\d+:\d+(?:[.:]\d+)?>/g;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) { lastBatch = null; continue; } // 空行で継続を終了

      // メタタグ（先頭英字で始まるキーのみ）
      const meta = line.match(META);
      if (meta && !/^\d+$/.test(meta[1])) {
        if (meta[1].toLowerCase() === "offset") {
          const v = parseInt(meta[2], 10);
          if (!isNaN(v)) offsetSec = v / 1000;
        }
        lastBatch = null;
        continue;
      }

      // 先頭のタイムスタンプを全て収集
      const stamps = [];
      let rest = line;
      let m;
      while ((m = rest.match(TS_HEAD))) {
        const min = +m[1], sec = +m[2];
        const frac = m[3] ? parseFloat("0." + m[3]) : 0;
        stamps.push(min * 60 + sec + frac);
        rest = rest.slice(m[0].length);
      }

      if (stamps.length) {
        // タイムスタンプ行 → 新しい cue 群
        const body = unescapeNewlines(rest.replace(WORD_TS, "").trim());
        const batch = [];
        for (const start of stamps) {
          const cue = { start: Math.max(0, start + offsetSec), end: -1, body };
          cues.push(cue);
          batch.push(cue);
        }
        lastBatch = batch;
      } else if (lastBatch) {
        // タイムスタンプなしの継続行 → 直前の cue 群へ改行で連結
        const extra = unescapeNewlines(line.replace(WORD_TS, "").trim());
        if (!extra) continue;
        for (const cue of lastBatch) {
          cue.body = cue.body ? cue.body + "\n" + extra : extra;
        }
      }
      // （初回からタイムスタンプなしで始まる行は無視）
    }

    cues.sort((a, b) => a.start - b.start);
    // end time を補完
    for (let i = 0; i < cues.length; i++) {
      cues[i].end = (i < cues.length - 1)
        ? cues[i + 1].start
        : cues[i].start + LAST_LRC_DEFAULT_DURATION;
    }
    return cues;
  }

  // フォーマットを自動判定してパース（.srt / .lrc）
  function parseCaption(raw) {
    if (!raw) return { cues: [], format: null };
    const sample = raw.slice(0, 2048);
    if (/-->/.test(sample)) return { cues: parseSRT(raw), format: "srt" };
    if (/^\s*\[\d+:\d+/m.test(sample) || /^\s*\[[a-z]+:/im.test(sample)) {
      return { cues: parseLRC(raw), format: "lrc" };
    }
    // フォールバック: SRT として試行
    return { cues: parseSRT(raw), format: "srt" };
  }

  // SRT 本文を DOM ノード列としてコンテナに描画する。
  // 許可タグ: <i>/<b>/<u>（<br> はテキスト中の改行から生成、<font ...> は無視）
  function renderBodyInto(container, body) {
    while (container.firstChild) container.removeChild(container.firstChild);
    const TAG_RE = /<(\/?)(i|b|u)\s*>|<\/?font\b[^>]*>|\n/gi;
    const stack = [container];
    let lastIndex = 0;
    let m;
    while ((m = TAG_RE.exec(body)) !== null) {
      const before = body.slice(lastIndex, m.index);
      if (before) stack[stack.length - 1].appendChild(document.createTextNode(before));
      const tok = m[0];
      if (tok === "\n") {
        stack[stack.length - 1].appendChild(document.createElement("br"));
      } else if (/^<\/?font\b/i.test(tok)) {
        // <font ...>, </font> は無視（色指定などを落とす）
      } else if (m[1] === "/") {
        // 閉じタグ: 対応タグが直近にあれば pop
        const tag = m[2].toLowerCase();
        if (stack.length > 1 && stack[stack.length - 1].tagName.toLowerCase() === tag) {
          stack.pop();
        }
      } else {
        // 開きタグ: <i>/<b>/<u>
        const tag = m[2].toLowerCase();
        const el = document.createElement(tag);
        stack[stack.length - 1].appendChild(el);
        stack.push(el);
      }
      lastIndex = TAG_RE.lastIndex;
    }
    const rest = body.slice(lastIndex);
    if (rest) stack[stack.length - 1].appendChild(document.createTextNode(rest));
  }

  // ── Cue 検索（現在時刻で表示すべき cue を返す） ─────────────────────────
  function findCueAt(t) {
    if (!_cues.length) return null;
    // 直前の cue の近傍は線形、それ以外は二分探索
    if (_lastCueIdx >= 0) {
      const c = _cues[_lastCueIdx];
      if (c && t >= c.start && t < c.end) return c;
    }
    let lo = 0, hi = _cues.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = _cues[mid];
      if (t < c.start) hi = mid - 1;
      else if (t >= c.end) lo = mid + 1;
      else { found = mid; break; }
    }
    _lastCueIdx = found;
    return found >= 0 ? _cues[found] : null;
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
        width: 36px; height: 36px;
        border-radius: 8px;
        object-fit: cover;
        flex-shrink: 0;
      }
      .ytsrt-notify__icon-fallback {
        width: 36px; height: 36px;
        border-radius: 8px;
        background: linear-gradient(135deg, #FF3B30, #FF6B6B);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        color: #fff; font-size: 18px; font-weight: bold;
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
  function getPlayer() {
    return document.querySelector("#movie_player");
  }

  function ensureOverlay() {
    const player = getPlayer();
    if (!player) return null;
    ensureStyle();

    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      const inner = document.createElement("span");
      overlay.appendChild(inner);
    }
    if (overlay.parentElement !== player) {
      player.appendChild(overlay);
    }
    updateOverlayMetrics();
    observePlayerResize(player);
    return overlay;
  }

  function observePlayerResize(player) {
    if (_resizeObs) return;
    if (typeof ResizeObserver === "undefined") return;
    _resizeObs = new ResizeObserver(() => updateOverlayMetrics());
    _resizeObs.observe(player);
  }

  function updateOverlayMetrics() {
    const overlay = document.getElementById(OVERLAY_ID);
    const player  = getPlayer();
    if (!overlay || !player) return;
    const h = player.getBoundingClientRect().height;
    if (h <= 0) return;
    const fs = Math.max(FONT_MIN_PX, Math.min(FONT_MAX_PX, h * FONT_RATIO));
    overlay.style.fontSize = `${fs}px`;
  }

  function setOverlayBody(body) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const inner = overlay.firstElementChild;
    if (!inner) return;
    if (body) {
      renderBodyInto(inner, body);
      overlay.classList.add("--visible");
    } else {
      while (inner.firstChild) inner.removeChild(inner.firstChild);
      overlay.classList.remove("--visible");
    }
  }

  // ── Time update → render cue ──────────────────────────────────────────────
  function bindTimeUpdate() {
    if (_timeUpdateBound) return;
    const video = document.querySelector("video.html5-main-video");
    if (!video) return;
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeking", onTimeUpdate);
    _timeUpdateBound = true;
  }

  function onTimeUpdate() {
    if (!_enabled) { setOverlayBody(""); return; }
    const video = document.querySelector("video.html5-main-video");
    if (!video) return;
    const cue = findCueAt(video.currentTime);
    setOverlayBody(cue ? cue.body : "");
  }

  // ── Notification（iOS 風バナー） ───────────────────────────────────────
  function notify(msg) {
    ensureStyle();
    const player = getPlayer();
    if (!player) return;
    const existing = document.getElementById(NOTIFY_ID);
    if (existing) existing.remove();
    if (_notifyTimer) { clearTimeout(_notifyTimer); _notifyTimer = 0; }

    const isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

    const banner = document.createElement("div");
    banner.id = NOTIFY_ID;
    banner.classList.add(isDark ? "--dark" : "--light");

    // アイコン（画像 → 失敗時は「字」のフォールバック）
    if (NOTIFY_ICON) {
      const img = document.createElement("img");
      img.className = "ytsrt-notify__icon";
      img.src = NOTIFY_ICON;
      img.alt = "";
      img.onerror = () => {
        const fb = document.createElement("div");
        fb.className = "ytsrt-notify__icon-fallback";
        fb.textContent = "\u5B57"; // 「字」
        img.replaceWith(fb);
      };
      banner.appendChild(img);
    } else {
      const fb = document.createElement("div");
      fb.className = "ytsrt-notify__icon-fallback";
      fb.textContent = "\u5B57";
      banner.appendChild(fb);
    }

    // タイトル + 本文
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

    // 時刻ラベル「今」
    const time = document.createElement("div");
    time.className = "ytsrt-notify__time";
    time.textContent = "\u4ECA";
    banner.appendChild(time);

    player.appendChild(banner);
    _notifyTimer = setTimeout(() => {
      if (banner.parentNode) banner.remove();
      _notifyTimer = 0;
    }, 3500);
  }

  // ── Toggle / Load ─────────────────────────────────────────────────────────
  function setEnabled(on) {
    _enabled = !!on;
    gmSet(ENABLED_KEY, _enabled);
    onTimeUpdate();
  }

  function toggleEnabled() {
    if (!_cues.length) {
      notify("字幕が読み込まれていません（Alt+Shift+C）");
      return;
    }
    setEnabled(!_enabled);
    notify(_enabled ? "字幕: ON" : "字幕: OFF");
  }

  function openFilePicker() {
    if (!_currentVideoId) {
      notify("動画IDを取得できません");
      return;
    }
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
        const { cues, format } = parseCaption(text);
        if (!cues.length) {
          notify("字幕ファイルを解析できませんでした");
          return;
        }
        _cues = cues;
        _lastCueIdx = -1;
        gmSet(SRT_KEY_PREFIX + _currentVideoId, text);
        setEnabled(true);
        ensureOverlay();
        bindTimeUpdate();
        onTimeUpdate();
        notify(`字幕を読み込みました（${format?.toUpperCase() ?? ""} / ${cues.length}行）`);
      } catch (e) {
        console.warn("[ytsrt] load failed:", e);
        notify("読み込みに失敗しました");
      } finally {
        input.remove();
      }
    });
    input.click();
  }

  // ── Auto-load saved SRT for current video ────────────────────────────────
  function autoLoadForCurrentVideo() {
    if (!isVideoPage()) { detach(); return; }
    const id = getVideoId();
    if (!id) return;
    _currentVideoId = id;
    _cues = [];
    _lastCueIdx = -1;

    const saved = gmGet(SRT_KEY_PREFIX + id, null);
    if (!saved) { setOverlayBody(""); return; }
    const { cues } = parseCaption(saved);
    if (!cues.length) return;
    _cues = cues;

    waitForPlayer().then(() => {
      ensureOverlay();
      bindTimeUpdate();
      onTimeUpdate();
    });
  }

  function detach() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();
    if (_resizeObs) { _resizeObs.disconnect(); _resizeObs = null; }
    // timeupdate は video が使い回されるため残してもよいが、念のため解除
    const video = document.querySelector("video.html5-main-video");
    if (video) {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("seeking", onTimeUpdate);
    }
    _timeUpdateBound = false;
    _cues = [];
    _currentVideoId = "";
  }

  function waitForPlayer(timeoutMs = 10000) {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const tick = () => {
        const p = getPlayer();
        const v = document.querySelector("video.html5-main-video");
        if (p && v) return resolve(true);
        if (Date.now() > deadline) return resolve(false);
        setTimeout(tick, 150);
      };
      tick();
    });
  }

  // ── Shortcuts ─────────────────────────────────────────────────────────────
  function registerShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (!isVideoPage()) return;
      // テキスト入力中は無視
      const tag = document.activeElement?.tagName?.toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;
      if (e.code !== "KeyC") return;

      const altOnly     = e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey;
      const altShift    = e.altKey &&  e.shiftKey && !e.ctrlKey && !e.metaKey;
      if (!altOnly && !altShift) return;

      e.preventDefault();
      e.stopPropagation();
      if (altOnly) toggleEnabled();
      else openFilePicker();
    }, true); // capture: YouTube側ハンドラより先に処理
  }

  // ── Startup ───────────────────────────────────────────────────────────────
  function start() {
    _enabled = gmGet(ENABLED_KEY, true);
    registerShortcuts();
    autoLoadForCurrentVideo();
    window.addEventListener("yt-navigate-finish", () => {
      // SPA遷移: overlay/observer は次動画用に貼り直す
      setOverlayBody("");
      if (_resizeObs) { _resizeObs.disconnect(); _resizeObs = null; }
      _timeUpdateBound = false;
      autoLoadForCurrentVideo();
    });
  }

  start();
})();
