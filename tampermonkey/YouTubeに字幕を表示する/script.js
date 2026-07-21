// ==UserScript==
// @name         YouTubeに字幕を表示する
// @namespace    https://tampermonkey.net/
// @version      3.0.0
// @description  自作の .srt / .lrc 字幕を YouTube 動画にネイティブ字幕トラック風に統合表示する。Alt+C: 字幕ファイル読み込み。
// @match        https://www.youtube.com/*
// @run-at       document-end
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeに字幕を表示する/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeに字幕を表示する/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeに字幕を表示する/icon_128.png
// ==/UserScript==

(() => {
  "use strict";

  // ── 設定値 ───────────────────────────────────────────────────────────────
  const FONT = { ratio: 0.0444, min: 14, max: 56 };
  const KEY_SRT = "ytsrt:srt:";
  const KEY_MODE = "ytsrt:customMode";
  const LRC_LAST_CUE_SEC = 5;
  const SHORTCUT = "Alt+C";

  const ID = {
    overlay: "ytsrt-overlay",
    style: "ytsrt-style",
    load: "ytsrt-load-button",
    tip: "ytsrt-tooltip",
    panel: "ytsrt-custom-captions-panel",
    topRow: "ytsrt-custom-captions-row",
    nativeRow: "ytsrt-native-custom-row",
  };
  const SEL = {
    player: "#movie_player",
    video: "video.html5-main-video",
    ccBtn: ".ytp-subtitles-button",
    settingsBtn: ".ytp-settings-button",
    popup: "#movie_player .ytp-popup.ytp-settings-menu",
    item: ".ytp-menuitem",
  };

  // 共通フレーム + "CC" グリフ。読み込み/削除ボタンは +/− 部分のみ異なる。
  const ICON_FRAME = "M480-480Zm120 288H216q-29.7 0-50.85-21.16Q144-234.32 144-264.04v-432.24Q144-726 165.15-747T216-768h528q29.7 0 50.85 21.15Q816-725.7 816-696v288h-72v-288H216v432h384v72";
  const ICON_CC = "M293.29-368h111.86Q421-368 432-378.78q11-10.78 11-26.72V-443h-56.14v19H312v-112h75v19h56v-37.89q0-16.11-10.64-26.61Q421.73-592 406-592H293.01q-16.01 0-26.51 10.71-10.5 10.7-10.5 26.52v148.95Q256-390 266.72-379t26.57 11Zm261.22 0h112.55q15.94 0 26.44-10.78Q704-389.56 704-405.5V-443h-56.14v19H573v-112h75v19h56v-37.89q0-16.11-10.72-26.61T666.71-592H554.85Q539-592 528-581.29q-11 10.7-11 26.52v148.95Q517-390 527.79-379q10.78 11 26.72 11Z";
  const PATH_LOAD = `${ICON_FRAME}Zm144 72v-72h-72v-72h72v-72h72v72h72v72h-72v72h-72Z${ICON_CC}`;
  const PATH_DELETE = `${ICON_FRAME}Zm72 -54v-72h216v72h-216Z${ICON_CC}`;
  const LOAD_ICON_TRANSFORM = "translate(480 -480) scale(1.25) translate(-480 480)";
  const PATH_CC_ACTIVE = "M21 3H3C2.46 3 1.96 3.21 1.58 3.58C1.21 3.96 1 4.46 1 5V19C1 19.53 1.21 20.03 1.58 20.41C1.96 20.78 2.46 21 3 21H21C21.53 21 22.03 20.78 22.41 20.41C22.78 20.03 23 19.53 23 19V5C23 4.46 22.78 3.96 22.41 3.58C22.03 3.21 21.53 3 21 3ZM6 11H8C8.26 11 8.51 11.10 8.70 11.29C8.89 11.48 9 11.73 9 12C9 12.26 8.89 12.51 8.70 12.70C8.51 12.89 8.26 13 8 13H6C5.73 13 5.48 12.89 5.29 12.70C5.10 12.51 5 12.26 5 12C5 11.73 5.10 11.48 5.29 11.29C5.48 11.10 5.73 11 6 11ZM12 11H18C18.26 11 18.51 11.10 18.70 11.29C18.89 11.48 19 11.73 19 12C19 12.26 18.89 12.51 18.70 12.70C18.51 12.89 18.26 13 18 13H12C11.73 13 11.48 12.89 11.29 12.70C11.10 12.51 11 12.26 11 12C11 11.73 11.10 11.48 11.29 11.29C11.48 11.10 11.73 11 12 11ZM16 15H18C18.26 15 18.51 15.10 18.70 15.29C18.89 15.48 19 15.73 19 16C19 16.26 18.89 16.51 18.70 16.70C18.51 16.89 18.26 17 18 17H16C15.73 17 15.48 16.89 15.29 16.70C15.10 16.51 15 16.26 15 16C15 15.73 15.10 15.48 15.29 15.29C15.48 15.10 15.73 15 16 15ZM6 15H12C12.26 15 12.51 15.10 12.70 15.29C12.89 15.48 13 15.73 13 16C13 16.26 12.89 16.51 12.70 16.70C12.51 16.89 12.26 17 12 17H6C5.73 17 5.48 16.89 5.29 16.70C5.10 16.51 5 16.26 5 16C5 15.73 5.10 15.48 5.29 15.29C5.48 15.10 5.73 15 6 15Z";
  const PATH_BACK = "m313-440 224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z";

  const MODE = { OFF: "off", CUSTOM: "custom", NATIVE: "native" };

  const STRINGS = {
    ja: {
      captions: "字幕",
      captionsRow: "字幕 (1)",
      customTrack: "ユーザー作成字幕",
      off: "オフ",
      loadCaptions: "字幕を読み込む",
      deleteCaptions: "字幕を削除",
      unavailable: "利用不可",
    },
    en: {
      captions: "Subtitles/CC",
      captionsRow: "Subtitles/CC (1)",
      customTrack: "User-created subtitles",
      off: "Off",
      loadCaptions: "Load captions",
      deleteCaptions: "Delete Caption",
      unavailable: "Unavailable",
    },
  };
  const t = (key) => {
    const lang = (document.documentElement.lang || navigator.language || "en").toLowerCase();
    return STRINGS[lang.startsWith("ja") ? "ja" : "en"][key];
  };

  // ── 状態 ────────────────────────────────────────────────────────────────
  const state = {
    // detach() で初期値に戻るフィールド
    cues: [],
    mode: MODE.OFF,
    videoId: "",
    isLive: false,
    nativeKnown: false,
    nativeAvailable: false,
    lastNativeLabel: "",
    pending: null,
    renderedBody: null,
    lastFontSize: -1,
    ignoreNextCcClick: false,
    // セッションをまたいで保持するフィールド
    boundVideo: null,
    resizeObs: null,
    controlsObs: null,
    controlsObsTarget: null,
    uiRaf: 0,
    menuRaf: 0,
    transition: 0,
    route: 0,
  };

  function resetState() {
    Object.assign(state, {
      cues: [], mode: MODE.OFF, videoId: "", isLive: false,
      nativeKnown: false, nativeAvailable: false, lastNativeLabel: "",
      pending: null, renderedBody: null, lastFontSize: -1, ignoreNextCcClick: false,
    });
  }

  // ── 汎用ヘルパー ─────────────────────────────────────────────────────────
  const $ = (sel, root = document) => root.querySelector(sel);
  const player = () => $(SEL.player);
  const video = () => { const p = player(); return p ? $(SEL.video, p) : null; };
  const ccButton = () => { const p = player(); return p ? $(SEL.ccBtn, p) : null; };
  const loadButton = () => document.getElementById(ID.load);
  const hasCues = () => state.cues.length > 0;
  const isVideoPage = () =>
    location.pathname.startsWith("/watch") || location.pathname.startsWith("/live/");

  const visible = (node) =>
    !!node && node.isConnected && !node.hidden && node.getClientRects().length > 0;
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const setAttr = (node, name, value) => {
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  };

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "dataset") Object.assign(node.dataset, v);
      else if (k.startsWith("aria-") || k === "role" || k === "tabindex") node.setAttribute(k, v);
      else node[k] = v;
    }
    for (const child of children) if (child) node.appendChild(child);
    return node;
  }

  function svgIcon(d, viewBox = "0 -960 960 960", transform = "") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    if (transform) path.setAttribute("transform", transform);
    svg.appendChild(path);
    return svg;
  }

  const waitFor = (pred, timeoutMs = 1500, intervalMs = 50) => new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    (function tick() {
      if (pred()) return resolve(true);
      if (Date.now() >= deadline) return resolve(false);
      setTimeout(tick, intervalMs);
    })();
  });

  function getVideoId() {
    const q = new URLSearchParams(location.search).get("v");
    if (q) return q;
    const m = location.pathname.match(/^\/(?:live|embed)\/([^/?#]+)/);
    return m ? m[1] : "";
  }

  function isEditableTarget(node = document.activeElement) {
    const tag = node?.tagName?.toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || node?.isContentEditable;
  }

  // ── 永続化 ───────────────────────────────────────────────────────────────
  const storedMode = () =>
    GM_getValue(KEY_MODE, MODE.CUSTOM) === MODE.CUSTOM ? MODE.CUSTOM : MODE.OFF;
  const persistMode = (mode) =>
    GM_setValue(KEY_MODE, mode === MODE.CUSTOM ? MODE.CUSTOM : MODE.OFF);

  // ── プレイヤー情報 ────────────────────────────────────────────────────────
  function readMediaInfo(expectedId) {
    const p = unsafeWindow.document.querySelector(SEL.player);
    if (!p) return { ready: false };

    let data = null;
    let resp = null;
    // ナビゲーション中は YouTube がプレイヤーを一時的に差し替えることがある。
    try { data = p.getVideoData?.() || null; } catch {}
    try { resp = p.getPlayerResponse?.() || null; } catch {}
    resp ||= unsafeWindow.ytInitialPlayerResponse || null;

    const respId = resp?.videoDetails?.videoId || "";
    const respOk = !!respId && (!expectedId || respId === expectedId);
    const id = respOk ? respId : (data?.video_id || "");
    if (!id || (expectedId && id !== expectedId)) return { ready: false };

    const validResp = respOk ? resp : null;
    const tracks = validResp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    const live = validResp?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
    return {
      ready: true,
      isLive: live?.isLiveNow === true || data?.isLive === true,
      nativeKnown: !!validResp,
      nativeAvailable: Array.isArray(tracks) && tracks.length > 0,
    };
  }

  // ── 字幕パーサー ─────────────────────────────────────────────────────────
  const normalizeText = (raw) => raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const unescapeNewlines = (s) => s.replace(/\\r\\n|\\n|\\r/g, "\n");

  function parseSRT(raw) {
    const cues = [];
    for (const block of normalizeText(raw).trim().split(/\n{2,}/)) {
      const lines = block.split("\n");
      const tsIdx = lines.findIndex((line) => line.includes("-->"));
      if (tsIdx < 0) continue;
      const m = lines[tsIdx].match(
        /(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})\s*-->\s*(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})/
      );
      if (!m) continue;
      const start = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
      const end = (+m[5]) * 3600 + (+m[6]) * 60 + (+m[7]) + (+m[8]) / 1000;
      const body = unescapeNewlines(lines.slice(tsIdx + 1).join("\n").trim());
      if (body) cues.push({ start, end, body });
    }
    return cues.sort((a, b) => a.start - b.start);
  }

  function parseLRC(raw) {
    const TS_HEAD = /^\[(\d+):(\d+)(?:[.:](\d+))?\]/;
    const META = /^\[([a-zA-Z]+):\s*([^\]]*)\]\s*$/;
    const WORD_TS = /<\d+:\d+(?:[.:]\d+)?>/g;
    const cues = [];
    let offsetSec = 0;
    let lastBatch = null;

    for (const rawLine of normalizeText(raw).split("\n")) {
      const line = rawLine.trim();
      if (!line) { lastBatch = null; continue; }

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
        stamps.push((+m[1]) * 60 + (+m[2]) + (m[3] ? parseFloat("0." + m[3]) : 0));
        rest = rest.slice(m[0].length);
      }

      if (stamps.length) {
        const body = unescapeNewlines(rest.replace(WORD_TS, "").trim());
        lastBatch = stamps.map((start) => {
          const cue = { start: Math.max(0, start + offsetSec), end: -1, body };
          cues.push(cue);
          return cue;
        });
      } else if (lastBatch) {
        const extra = unescapeNewlines(line.replace(WORD_TS, "").trim());
        if (!extra) continue;
        for (const cue of lastBatch) cue.body = cue.body ? cue.body + "\n" + extra : extra;
      }
    }

    cues.sort((a, b) => a.start - b.start);
    cues.forEach((cue, i) => {
      cue.end = i < cues.length - 1 ? cues[i + 1].start : cue.start + LRC_LAST_CUE_SEC;
    });
    return cues;
  }

  function parseCaption(raw) {
    if (!raw) return [];
    const sample = raw.slice(0, 2048);
    const looksLikeLrc = !/-->/.test(sample) &&
      (/^\s*\[\d+:\d+/m.test(sample) || /^\s*\[[a-z]+:/im.test(sample));
    return looksLikeLrc ? parseLRC(raw) : parseSRT(raw);
  }

  // ── cue 検索 / 本文レンダリング ──────────────────────────────────────────
  function findCueAt(time) {
    let lo = 0;
    let hi = state.cues.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const cue = state.cues[mid];
      if (time < cue.start) hi = mid - 1;
      else if (time >= cue.end) lo = mid + 1;
      else return cue;
    }
    return null;
  }

  // <i>/<b>/<u> を許可し、<font> は除去、改行は <br> に変換する。
  function renderBodyInto(container, body) {
    container.replaceChildren();
    const TAG_RE = /<(\/?)(i|b|u)\s*>|<\/?font\b[^>]*>|\n/gi;
    const stack = [container];
    let lastIndex = 0;
    let m;

    while ((m = TAG_RE.exec(body)) !== null) {
      const before = body.slice(lastIndex, m.index);
      if (before) stack[stack.length - 1].appendChild(document.createTextNode(before));

      const token = m[0];
      if (token === "\n") {
        stack[stack.length - 1].appendChild(document.createElement("br"));
      } else if (/^<\/?font\b/i.test(token)) {
        // <font> は無視
      } else if (m[1] === "/") {
        if (stack.length > 1 && stack[stack.length - 1].tagName.toLowerCase() === m[2].toLowerCase()) {
          stack.pop();
        }
      } else {
        const child = document.createElement(m[2].toLowerCase());
        stack[stack.length - 1].appendChild(child);
        stack.push(child);
      }
      lastIndex = TAG_RE.lastIndex;
    }

    const rest = body.slice(lastIndex);
    if (rest) stack[stack.length - 1].appendChild(document.createTextNode(rest));
  }

  // ── スタイル ─────────────────────────────────────────────────────────────
  const CSS = `
    #${ID.overlay} {
      position: absolute;
      left: 50%;
      bottom: 2%;
      transform: translateX(-50%);
      width: 96%;
      z-index: 60;
      pointer-events: none;
      text-align: center;
      color: #fff;
      font-family: "YouTube Noto", Roboto, Arial, Helvetica, Verdana, "PT Sans Caption", sans-serif;
      font-weight: 400;
      line-height: normal;
      text-shadow: none;
      white-space: pre-wrap;
      word-break: normal;
      overflow-wrap: normal;
      display: none;
    }
    #${ID.overlay} > span {
      display: inline-block;
      max-width: 100%;
      background: rgba(8, 8, 8, 0.75);
      padding: 0 0.25em;
      border-radius: 0;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
    ${SEL.player}:not(.ytp-autohide) #${ID.overlay} { bottom: 12%; }
    #${ID.overlay}.--visible { display: block; }

    #${ID.load} {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: visible;
      padding: 0;
      line-height: 1;
      color: var(--yt-spec-text-primary, #fff);
    }
    #${ID.load} .ytsrt-load-button__icon {
      width: 24px;
      height: 24px;
      display: block;
      fill: currentColor;
      opacity: 1;
    }
    #${ID.load}:hover .ytsrt-load-button__icon,
    #${ID.load}:focus-visible .ytsrt-load-button__icon { transform: scale(1.03); }

    #${ID.tip} {
      position: absolute;
      z-index: 2024;
      display: block;
      max-width: 300px;
      bottom: auto;
      pointer-events: none;
      color: #eee;
      font-family: "YouTube Noto", "Roboto", "Arial", sans-serif;
      font-size: 12.98px;
      font-weight: 500;
      line-height: 15px;
    }
    #${ID.tip}[hidden] { display: none; }
    #${ID.tip} .ytp-tooltip-bottom-text {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 5px 9px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.3);
      color: #eee;
      white-space: nowrap;
    }
    #${ID.tip} .ytp-tooltip-keyboard-shortcut {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 11px;
      min-height: 15px;
      padding: 0 2px;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: #fff;
      font-size: 12.98px;
    }

    ${SEL.player} .ytp-subtitles-button.ytsrt-subtitles-ready {
      opacity: 1 !important;
      filter: none !important;
      color: #fff !important;
      cursor: pointer;
      pointer-events: auto;
    }
    ${SEL.player} .ytp-subtitles-button.ytsrt-subtitles-ready *,
    ${SEL.player} .ytp-subtitles-button.ytsrt-subtitles-ready svg,
    ${SEL.player} .ytp-subtitles-button.ytsrt-subtitles-ready path {
      opacity: 1 !important;
      fill-opacity: 1 !important;
      fill: currentColor !important;
    }
    ${SEL.player} .ytp-subtitles-button.ytsrt-subtitles-custom-active {
      color: #fff !important;
      position: relative;
    }
    ${SEL.player} .ytp-subtitles-button .ytsrt-custom-subtitles-button-icon {
      display: none;
      position: absolute;
      inset: 0;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      color: currentColor;
    }
    ${SEL.player} .ytp-subtitles-button .ytsrt-custom-subtitles-button-icon svg {
      width: 24px;
      height: 24px;
      fill: currentColor;
    }
    ${SEL.player} .ytp-subtitles-button.ytsrt-subtitles-custom-active .ytp-subtitles-button-icon > svg {
      visibility: hidden;
    }
    ${SEL.player} .ytp-subtitles-button.ytsrt-subtitles-custom-active .ytsrt-custom-subtitles-button-icon {
      display: inline-flex;
      visibility: visible;
    }

    .ytsrt-menuitem { cursor: pointer; }
    .ytsrt-menuitem .ytp-menuitem-label { white-space: nowrap; }
    .ytsrt-menuitem .ytsrt-menuitem-status {
      color: #aaa;
      font-size: 14.5px;
    }
    .ytsrt-menuitem.ytsrt-choice-row .ytp-menuitem-icon { display: none; }
    .ytsrt-menuitem.ytsrt-choice-row .ytp-menuitem-content {
      color: #aaa;
      font-size: 12px;
    }
    .ytsrt-menuitem.ytsrt-choice-row .ytp-menuitem-label,
    .ytsrt-menuitem.ytsrt-choice-row .ytp-menuitem-content { margin-left: 0; }
    .ytsrt-menuitem svg,
    .ytsrt-menuitem path {
      fill: currentColor;
      opacity: 1 !important;
    }
    .ytsrt-menuitem .ytsrt-subtitle-glyph { opacity: 1 !important; }
    .ytsrt-menuitem.ytsrt-custom-track-row .ytp-menuitem-icon { visibility: hidden; }

    #${ID.panel} {
      position: absolute;
      inset: 0;
      z-index: 2;
      border-radius: inherit;
      background: rgba(28, 28, 28, 0.92);
      overflow: hidden;
    }
    #${ID.panel} .ytsrt-custom-panel__header {
      display: flex;
      align-items: center;
      min-height: 48px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    #${ID.panel} .ytsrt-custom-panel__back {
      flex: 0 0 auto;
      width: 48px;
      height: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      background: transparent;
      border: 0;
      cursor: pointer;
    }
    #${ID.panel} .ytsrt-custom-panel__back svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
    }
    #${ID.panel} .ytsrt-custom-panel__title {
      color: #fff;
      font-size: 14px;
      font-weight: 500;
    }
    #${ID.panel} .ytsrt-custom-panel__list { padding: 8px 0; }
  `;

  function ensureStyle() {
    let style = document.getElementById(ID.style);
    if (!style) {
      style = el("style", { id: ID.style });
      style.textContent = CSS;
    }
    if (style.parentElement !== document.head) document.head.appendChild(style);
  }

  // ── オーバーレイ ─────────────────────────────────────────────────────────
  function ensureOverlay(p = player()) {
    if (!p) return null;
    ensureStyle();

    let overlay = document.getElementById(ID.overlay);
    let needsMetrics = false;
    if (!overlay) {
      overlay = el("div", { id: ID.overlay }, el("span"));
      needsMetrics = true;
    }
    if (overlay.parentElement !== p) {
      p.appendChild(overlay);
      needsMetrics = true;
    }

    if (needsMetrics || state.lastFontSize < 0) updateOverlayMetrics(p);
    if (!state.resizeObs && typeof ResizeObserver !== "undefined") {
      state.resizeObs = new ResizeObserver((entries) => {
        const box = entries[0]?.borderBoxSize;
        const height = (Array.isArray(box) ? box[0]?.blockSize : box?.blockSize) ||
          entries[0]?.contentRect?.height || 0;
        updateOverlayMetrics(p, height);
      });
      state.resizeObs.observe(p);
    }
    return overlay;
  }

  function updateOverlayMetrics(p = player(), observedHeight = 0) {
    const overlay = document.getElementById(ID.overlay);
    if (!overlay || !p) return;
    const height = observedHeight || p.getBoundingClientRect().height;
    if (height <= 0) return;
    const fontSize = Math.max(FONT.min, Math.min(FONT.max, height * FONT.ratio));
    if (fontSize === state.lastFontSize) return;
    overlay.style.fontSize = `${fontSize}px`;
    state.lastFontSize = fontSize;
  }

  function renderOverlay(body) {
    const next = body || "";
    const overlay = next ? ensureOverlay() : document.getElementById(ID.overlay);
    if (!overlay) {
      if (!next) state.renderedBody = "";
      return;
    }
    if (state.renderedBody === next) return;

    const inner = overlay.firstElementChild;
    if (!inner) return;
    if (next) {
      renderBodyInto(inner, next);
      overlay.classList.add("--visible");
    } else {
      inner.replaceChildren();
      overlay.classList.remove("--visible");
    }
    state.renderedBody = next;
  }

  function renderCurrentCue() {
    if (state.mode !== MODE.CUSTOM) return renderOverlay("");
    const v = state.boundVideo || video();
    if (!v) return renderOverlay("");
    const cue = findCueAt(v.currentTime);
    renderOverlay(cue ? cue.body : "");
  }

  // ── CC ボタン管理 ────────────────────────────────────────────────────────
  // 元の属性は JSON で dataset に 1 つにまとめて退避する。
  const CC_MANAGED_ATTRS = [
    "aria-label", "aria-pressed", "title", "data-title-no-tooltip", "data-tooltip-title",
  ];

  function stashCcAttrs(btn) {
    if (btn.dataset.ytsrtStash) return;
    btn.dataset.ytsrtStash = JSON.stringify(
      Object.fromEntries(CC_MANAGED_ATTRS.map((a) => [a, btn.getAttribute(a)]))
    );
  }

  function readCcStash(btn) {
    try {
      return btn?.dataset.ytsrtStash ? JSON.parse(btn.dataset.ytsrtStash) : null;
    } catch {
      return null;
    }
  }

  function restoreCcAttrs(btn) {
    const stash = readCcStash(btn);
    if (!stash) return;
    for (const [attr, value] of Object.entries(stash)) {
      if (value === null) btn.removeAttribute(attr);
      else btn.setAttribute(attr, value);
    }
    delete btn.dataset.ytsrtStash;
  }

  const customCcIcon = (btn) => btn?.querySelector(".ytsrt-custom-subtitles-button-icon") || null;

  function syncCcIcon(btn, customActive) {
    const existing = customCcIcon(btn);
    if (!customActive) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const svg = svgIcon(PATH_CC_ACTIVE, "0 0 24 24");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "24");
    svg.setAttribute("fill", "currentColor");
    svg.querySelector("path").setAttribute("fill", "currentColor");
    btn.appendChild(el("span", { class: "ytsrt-custom-subtitles-button-icon", "aria-hidden": "true" }, svg));
  }

  function syncForcedActive(btn, active, resetActiveClass = false) {
    if (active) {
      if (!btn.classList.contains("ytp-button-active")) {
        btn.dataset.ytsrtForcedActive = "1";
        btn.classList.add("ytp-button-active");
      }
      return;
    }
    if (btn.dataset.ytsrtForcedActive !== "1") return;
    if (resetActiveClass || state.mode === MODE.OFF) btn.classList.remove("ytp-button-active");
    delete btn.dataset.ytsrtForcedActive;
  }

  const isManagedCc = (btn) =>
    !!btn && (
      "ytsrtStash" in btn.dataset ||
      btn.dataset.ytsrtForcedActive === "1" ||
      !!customCcIcon(btn)
    );

  function restoreCcButton(btn, { resetActiveClass = false } = {}) {
    syncCcIcon(btn, false);
    syncForcedActive(btn, false, resetActiveClass);
    restoreCcAttrs(btn);
    btn.removeAttribute("aria-disabled");
  }

  function syncCcButton(btn = ccButton()) {
    if (!btn) return;
    const ready = hasCues();
    const customActive = ready && state.mode === MODE.CUSTOM;
    btn.classList.toggle("ytsrt-subtitles-ready", ready);
    btn.classList.toggle("ytsrt-subtitles-custom-active", customActive);

    if (!ready) {
      if (isManagedCc(btn)) restoreCcButton(btn);
      return;
    }

    const active = state.mode !== MODE.OFF;
    stashCcAttrs(btn);
    for (const attr of ["aria-label", "title", "data-title-no-tooltip", "data-tooltip-title"]) {
      setAttr(btn, attr, t("captions"));
    }
    btn.disabled = false;
    btn.removeAttribute("disabled");
    setAttr(btn, "aria-disabled", "false");
    btn.removeAttribute("aria-hidden");
    setAttr(btn, "aria-pressed", active ? "true" : "false");
    btn.classList.remove("ytp-button-disabled");
    btn.tabIndex = 0;
    syncCcIcon(btn, customActive);
    syncForcedActive(btn, active);
  }

  // ── 読み込みボタン / ツールチップ ────────────────────────────────────────
  const loadButtonLabel = () => hasCues() ? t("deleteCaptions") : t("loadCaptions");
  const customRowSummary = () => {
    if (!hasCues()) return t("unavailable");
    return state.mode === MODE.CUSTOM ? t("customTrack") : t("off");
  };

  function createLoadButton() {
    ensureStyle();
    const svg = svgIcon(PATH_LOAD, "-30 -960 1020 960", LOAD_ICON_TRANSFORM);
    svg.setAttribute("class", "ytsrt-load-button__icon");

    const btn = el("button", {
      id: ID.load,
      class: "ytp-button",
      type: "button",
      "aria-keyshortcuts": SHORTCUT,
    }, svg);
    btn.dataset.titleNoTooltip = loadButtonLabel();

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (hasCues()) deleteCaptions();
      else openFilePicker();
    });
    btn.addEventListener("mouseenter", showTooltip);
    btn.addEventListener("focus", showTooltip);
    btn.addEventListener("mouseleave", hideTooltip);
    btn.addEventListener("blur", hideTooltip);
    syncLoadButton(btn);
    return btn;
  }

  function syncLoadButton(btn = loadButton()) {
    if (!btn) return;
    const label = loadButtonLabel();
    setAttr(btn, "aria-label", label);
    if (btn.dataset.titleNoTooltip !== label) btn.dataset.titleNoTooltip = label;

    const path = btn.querySelector(".ytsrt-load-button__icon path");
    const desired = hasCues() ? PATH_DELETE : PATH_LOAD;
    if (path && path.getAttribute("d") !== desired) path.setAttribute("d", desired);

    syncTooltipLabel();
    const topRow = document.getElementById(ID.topRow);
    if (topRow) {
      setSummaryText(topRow.querySelector(".ytp-menuitem-content"), customRowSummary());
    }
  }

  function ensureTooltip(p = player()) {
    if (!p) return null;
    ensureStyle();
    let tip = document.getElementById(ID.tip);
    if (!tip) {
      tip = el("div", { id: ID.tip, class: "ytsrt-load-tooltip ytp-tooltip ytp-bottom", hidden: true },
        el("div", { class: "ytp-tooltip-text-wrapper", "aria-hidden": "true" },
          el("div", { class: "ytp-tooltip-bottom-text" },
            el("span", { class: "ytp-tooltip-text" }),
            el("div", { class: "ytp-tooltip-keyboard-shortcut", text: SHORTCUT }))));
    }
    if (tip.parentElement !== p) p.appendChild(tip);
    syncTooltipLabel(tip);
    return tip;
  }

  function syncTooltipLabel(tip = document.getElementById(ID.tip)) {
    const label = tip?.querySelector(".ytp-tooltip-text");
    if (label) label.textContent = loadButtonLabel();
  }

  function showTooltip() {
    const p = player();
    const btn = loadButton();
    if (!p || !btn) return;
    const tip = ensureTooltip(p);
    if (!tip) return;

    tip.hidden = false;
    tip.style.visibility = "hidden";
    const btnRect = btn.getBoundingClientRect();
    const playerRect = p.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(8, btnRect.left - playerRect.left + btnRect.width / 2 - tipRect.width / 2)}px`;
    tip.style.top = `${Math.max(8, btnRect.top - playerRect.top - tipRect.height - 22)}px`;
    tip.style.bottom = "auto";
    tip.style.visibility = "";
  }

  function hideTooltip() {
    const tip = document.getElementById(ID.tip);
    if (tip) tip.hidden = true;
  }

  function controlsMounted() {
    const btn = loadButton();
    const cc = ccButton();
    return !!btn && !!cc &&
      btn.parentElement === cc.parentElement &&
      btn.previousSibling === cc;
  }

  function ensureLoadButton() {
    if (!isVideoPage() || state.isLive) return;
    const p = player();
    const controls = p ? $(".ytp-right-controls", p) : null;
    if (!controls) return;

    observeControls(controls);
    const cc = $(SEL.ccBtn, controls);
    if (!cc?.parentNode) return;

    let btn = loadButton();
    if (!btn) btn = createLoadButton();
    if (btn.parentElement !== cc.parentNode || btn.previousSibling !== cc) {
      cc.parentNode.insertBefore(btn, cc.nextSibling);
    }
    syncLoadButton(btn);
    syncCcButton();
  }

  function scheduleEnsureUi() {
    if (state.uiRaf) return;
    state.uiRaf = requestAnimationFrame(() => {
      state.uiRaf = 0;
      ensureLoadButton();
    });
  }

  function observeControls(controls) {
    if (typeof MutationObserver === "undefined") return;
    if (state.controlsObs && state.controlsObsTarget === controls) return;

    disconnectControlsObserver();
    state.controlsObs = new MutationObserver(() => {
      if (!controlsMounted()) scheduleEnsureUi();
    });
    state.controlsObs.observe(controls, { childList: true, subtree: true });
    if (controls.parentElement) {
      state.controlsObs.observe(controls.parentElement, { childList: true });
    }
    state.controlsObsTarget = controls;
  }

  function disconnectControlsObserver() {
    if (state.uiRaf) { cancelAnimationFrame(state.uiRaf); state.uiRaf = 0; }
    if (state.menuRaf) { cancelAnimationFrame(state.menuRaf); state.menuRaf = 0; }
    state.controlsObs?.disconnect();
    state.controlsObs = null;
    state.controlsObsTarget = null;
  }

  // ── 設定メニュー: 検索・判定ヘルパー ─────────────────────────────────────
  function settingsPopup() {
    const popups = Array.from(document.querySelectorAll(SEL.popup));
    return popups.find(visible) || popups[0] || null;
  }

  const removePanel = () => document.getElementById(ID.panel)?.remove();
  const hasInjectedMenuContent = (popup = settingsPopup()) =>
    !!popup?.querySelector(`#${ID.topRow}, #${ID.nativeRow}, #${ID.panel}`);

  const itemLabel = (item) =>
    item?.querySelector(".ytp-menuitem-label")?.textContent?.trim() || "";
  const isOffItem = (item) => norm(itemLabel(item)) === norm(t("off"));
  const isAutoTranslateItem = (item) => norm(itemLabel(item)) === "auto-translate";
  const isCustomItem = (item) =>
    !!item && (item.id === ID.nativeRow || item.dataset.ytsrtChoice === MODE.CUSTOM);
  const isInjectedRow = (item) => item.id === ID.topRow || item.id === ID.nativeRow;

  const stripCount = (text) =>
    norm(text).replace(/\s*[\(（]\s*\d+\s*[\)）]\s*$/u, "").trim();
  function isCaptionsLabel(text) {
    const n = stripCount(text);
    return n === norm(t("captions")) || n === "subtitles/cc" || n === "subtitles" || n === "captions";
  }

  function activePanelHeader(popup = settingsPopup()) {
    if (!popup || !visible(popup)) return null;
    return Array.from(popup.querySelectorAll(".ytp-panel-header")).find(visible) || null;
  }

  // トップレベルメニュー（パネルヘッダーのない画面）のコンテナ
  function findTopLevelMenuContainer(popup = settingsPopup()) {
    if (!popup || !visible(popup) || activePanelHeader(popup)) return null;
    return Array.from(popup.querySelectorAll(".ytp-panel-menu")).find((container) =>
      visible(container) &&
      !container.closest(`#${ID.panel}`) &&
      Array.from(container.children).some((item) =>
        item.matches?.(SEL.item) && visible(item) && item.getAttribute("role") === "menuitem"
      )
    ) || null;
  }

  // ネイティブ字幕サブメニュー（「字幕」パネル）のコンテナ
  function nativeCaptionMenuContainer(popup = settingsPopup()) {
    const header = activePanelHeader(popup);
    const title = header?.querySelector(".ytp-panel-title");
    if (!title || !visible(title) || !isCaptionsLabel(title.textContent || "")) return null;

    const container = header.nextElementSibling;
    if (
      !container?.matches?.(".ytp-panel-menu") ||
      !visible(container) ||
      container.closest(`#${ID.panel}`)
    ) {
      return null;
    }
    const hasNativeItems = Array.from(container.querySelectorAll(SEL.item)).some((item) =>
      !isInjectedRow(item) && item.getAttribute("role") === "menuitemradio" && visible(item)
    );
    return hasNativeItems ? container : null;
  }

  function nativeCaptionItems(container = nativeCaptionMenuContainer()) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(SEL.item)).filter((item) =>
      !item.closest(`#${ID.panel}`) &&
      item.parentElement === container &&
      item.getAttribute("role") === "menuitemradio" &&
      visible(item)
    );
  }

  function rememberNativeLabel(label) {
    const n = norm(label);
    if (!n || n === norm(t("off")) || n === norm(t("customTrack")) || n === "auto-translate") return;
    state.lastNativeLabel = label.trim();
  }

  // 字幕メニューの選択状態を読む（ネイティブトラック名も記憶する）
  function readMenuSelection(container = nativeCaptionMenuContainer()) {
    const checked = nativeCaptionItems(container)
      .find((item) => item.getAttribute("aria-checked") === "true");
    if (!checked) return { mode: null, label: "" };
    if (isCustomItem(checked)) return { mode: MODE.CUSTOM, label: t("customTrack") };
    if (isOffItem(checked)) return { mode: MODE.OFF, label: t("off") };

    const label = itemLabel(checked);
    if (label && !isAutoTranslateItem(checked)) {
      rememberNativeLabel(label);
      return { mode: MODE.NATIVE, label };
    }
    return { mode: null, label };
  }

  const hasVisibleNativeCaptions = () =>
    Array.from(document.querySelectorAll(
      `${SEL.player} .caption-window, ${SEL.player} .ytp-caption-segment`
    )).some((node) => visible(node) && norm(node.textContent));

  function detectNativeAvailability() {
    if (state.nativeKnown) return state.nativeAvailable;
    if (hasVisibleNativeCaptions()) return true;

    const popup = settingsPopup();
    if (popup && Array.from(popup.querySelectorAll(SEL.item)).some((item) => {
      const text = norm(item.textContent);
      return text.includes("subtitles") || text.startsWith(norm(t("captions")));
    })) {
      return true;
    }

    const btn = ccButton();
    if (!btn) return false;
    const stash = readCcStash(btn);
    const label = norm(
      (stash ? stash["aria-label"] : btn.getAttribute("aria-label")) ||
      (stash ? stash["title"] : btn.getAttribute("title")) ||
      ""
    );
    if (!label) return false;
    return !label.includes("unavailable") && !label.includes("利用不可");
  }

  function nativeCaptionsActive() {
    const selection = readMenuSelection();
    if (selection.mode === MODE.NATIVE) return true;
    if (selection.mode === MODE.OFF || selection.mode === MODE.CUSTOM) return false;
    if (hasVisibleNativeCaptions()) return true;
    if (state.pending === MODE.NATIVE && state.lastNativeLabel) return true;

    const btn = ccButton();
    if (!btn) return false;
    if (!(state.nativeAvailable || detectNativeAvailability())) return false;

    const pressed = btn.getAttribute("aria-pressed");
    if (pressed === "true") return true;
    if (pressed === "false") return false;
    return btn.classList.contains("ytp-button-active");
  }

  // ── 設定メニュー: サマリーテキスト ───────────────────────────────────────
  function summaryHost(content) {
    if (!content) return null;
    const children = Array.from(content.children);
    return children.find((c) => !c.querySelector("svg, path") && norm(c.textContent)) ||
      children.find((c) => !c.querySelector("svg, path")) || null;
  }

  function getSummaryText(content) {
    if (!content) return "";
    return (summaryHost(content)?.textContent || content.textContent || "").trim();
  }

  function setSummaryText(content, text) {
    if (!content) return;
    const host = summaryHost(content);
    if (host) {
      if (host.textContent !== text) host.textContent = text;
      return;
    }
    const arrows = Array.from(content.children).filter((c) => c.querySelector("svg, path"));
    content.replaceChildren(el("span", { class: "ytsrt-menuitem-status", text }), ...arrows);
  }

  // ── 設定メニュー: 行の生成と注入 ─────────────────────────────────────────
  function createMenuItem({ id = "", label = "", content = "", checked = false, iconNode = null, role = "menuitemradio" }) {
    const item = el("div", { class: "ytp-menuitem ytsrt-menuitem", role, tabindex: "0" },
      el("div", { class: "ytp-menuitem-icon" }, iconNode),
      el("div", { class: "ytp-menuitem-label", text: label }),
      el("div", { class: "ytp-menuitem-content" },
        content ? el("span", { class: "ytsrt-menuitem-status", text: content }) : null));
    if (role === "menuitemradio") {
      item.setAttribute("aria-checked", checked ? "true" : "false");
    }
    if (id) item.id = id;
    return item;
  }

  function cloneSubtitleIcon() {
    const source = ccButton()?.querySelector(".ytp-subtitles-button-icon svg");
    if (source) {
      const svg = source.cloneNode(true);
      svg.setAttribute("fill-opacity", "1");
      svg.querySelectorAll("[fill-opacity]").forEach((n) => n.setAttribute("fill-opacity", "1"));
      return svg;
    }
    const span = el("span", { class: "ytsrt-subtitle-glyph", text: "CC" });
    Object.assign(span.style, { fontSize: "11px", fontWeight: "700", letterSpacing: "0.02em", opacity: "1" });
    return span;
  }

  const isNativeCaptionsTopRow = (item) => isCaptionsLabel(itemLabel(item));

  function findNativeCaptionsTopRow(popup = settingsPopup(), container = findTopLevelMenuContainer(popup)) {
    if (!container) return null;
    return Array.from(container.querySelectorAll(SEL.item)).find((item) =>
      !isInjectedRow(item) && !item.closest(`#${ID.panel}`) && isNativeCaptionsTopRow(item)
    ) || null;
  }

  // 見た目を揃えるため既存行を雛形にしてトップレベル「字幕」行を作る
  function buildTopRow(container) {
    const candidates = Array.from(container?.querySelectorAll(SEL.item) || []).filter((item) =>
      !isInjectedRow(item) &&
      !item.closest(`#${ID.panel}`) &&
      !item.querySelector(".ytp-menuitem-toggle-checkbox") &&
      item.querySelector(".ytp-menuitem-content")
    );
    const template = candidates.find((item) => !isNativeCaptionsTopRow(item)) || candidates[0];
    const row = template ? template.cloneNode(true) : createMenuItem({
      label: t("captionsRow"),
      content: customRowSummary(),
      iconNode: cloneSubtitleIcon(),
      role: "menuitem",
    });

    row.id = ID.topRow;
    row.classList.add("ytsrt-menuitem");
    row.dataset.ytsrtTopRow = "1";
    row.setAttribute("role", "menuitem");
    row.setAttribute("tabindex", "0");
    row.removeAttribute("aria-checked");

    const icon = row.querySelector(".ytp-menuitem-icon");
    if (icon) {
      icon.replaceChildren();
      icon.appendChild(cloneSubtitleIcon());
    }
    const label = row.querySelector(".ytp-menuitem-label");
    if (label) label.textContent = t("captionsRow");
    setSummaryText(row.querySelector(".ytp-menuitem-content"), customRowSummary());
    return row;
  }

  function mountTopRow(container) {
    if (!container || document.getElementById(ID.topRow)) return;
    const row = buildTopRow(container);
    const before = Array.from(container.querySelectorAll(SEL.item))
      .find((item) => !item.querySelector(".ytp-menuitem-toggle-checkbox"));
    if (before) container.insertBefore(row, before);
    else container.appendChild(row);
  }

  function mountNativeRow(container) {
    if (!container || document.getElementById(ID.nativeRow)) return;
    const row = createMenuItem({
      id: ID.nativeRow,
      label: t("customTrack"),
      checked: state.mode === MODE.CUSTOM,
    });
    row.classList.add("ytsrt-custom-track-row", "ytsrt-choice-row");
    row.dataset.ytsrtChoice = MODE.CUSTOM;
    container.appendChild(row);
    syncMenuChecks(container);
  }

  // ネイティブ字幕のない動画用: 自前の「字幕」サブパネルを popup に被せる
  function renderCustomSubmenu() {
    removePanel();
    const popup = settingsPopup();
    if (!popup || !visible(popup)) return;
    ensureStyle();

    const back = el("button", {
      type: "button",
      class: "ytsrt-custom-panel__back",
      "aria-label": t("captions"),
    }, svgIcon(PATH_BACK));
    back.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      removePanel();
      scheduleMenuSync();
    });

    const offItem = createMenuItem({ label: t("off"), checked: state.mode === MODE.OFF });
    offItem.classList.add("ytsrt-choice-row");
    offItem.dataset.ytsrtChoice = MODE.OFF;

    const customItem = createMenuItem({
      label: t("customTrack"),
      checked: state.mode === MODE.CUSTOM,
      content: state.mode === MODE.CUSTOM ? t("customTrack") : "",
    });
    customItem.classList.add("ytsrt-choice-row");
    customItem.dataset.ytsrtChoice = MODE.CUSTOM;

    popup.appendChild(el("div", { id: ID.panel },
      el("div", { class: "ytsrt-custom-panel__header" },
        back,
        el("div", { class: "ytsrt-custom-panel__title", text: t("captions") })),
      el("div", { class: "ytsrt-custom-panel__list" }, offItem, customItem)));
    syncPopupWidth(popup);
  }

  // ── 設定メニュー: ポップアップ幅 ─────────────────────────────────────────
  function stashWidth(node) {
    if (!node || "ytsrtWidth" in node.dataset) return;
    node.dataset.ytsrtWidth = node.style.width;
  }

  function restoreWidth(node) {
    if (!node || !("ytsrtWidth" in node.dataset)) return;
    if (node.dataset.ytsrtWidth) node.style.width = node.dataset.ytsrtWidth;
    else node.style.removeProperty("width");
    delete node.dataset.ytsrtWidth;
  }

  function originalWidth(node, fallback) {
    const stashed = node?.dataset.ytsrtWidth;
    return Number.parseFloat(stashed || node?.style.width) || fallback;
  }

  function restorePopupWidth(popup = settingsPopup()) {
    if (!popup) return;
    restoreWidth(popup);
    popup.querySelectorAll(".ytp-panel").forEach(restoreWidth);
  }

  function syncPopupWidth(popup = settingsPopup()) {
    if (!popup || !visible(popup)) return;
    if (!hasInjectedMenuContent(popup)) {
      restorePopupWidth(popup);
      return;
    }

    let widest = null;
    let widestWidth = 0;
    for (const menu of popup.querySelectorAll(".ytp-panel-menu")) {
      if (!visible(menu)) continue;
      const width = menu.getBoundingClientRect().width;
      if (width > widestWidth) { widest = menu; widestWidth = width; }
    }
    if (!widest) return;

    const panel = widest.closest(".ytp-panel");
    const popupWidth = popup.getBoundingClientRect().width;
    const target = Math.ceil(Math.max(originalWidth(popup, popupWidth), widestWidth));
    if (
      target === Math.ceil(popupWidth) &&
      (!panel || target === Math.ceil(panel.getBoundingClientRect().width))
    ) {
      return;
    }

    stashWidth(popup);
    popup.style.width = `${target}px`;
    if (panel) {
      stashWidth(panel);
      panel.style.width = `${target}px`;
    }
    for (const other of popup.querySelectorAll(".ytp-panel")) {
      if (other !== panel) restoreWidth(other);
    }
  }

  // ── 設定メニュー: 同期 ───────────────────────────────────────────────────
  function scheduleMenuSync() {
    if (state.menuRaf) return;
    state.menuRaf = requestAnimationFrame(() => {
      state.menuRaf = 0;
      if (!state.nativeKnown) state.nativeAvailable = detectNativeAvailability();
      syncSettingsUi();
    });
  }

  // メニュー描画は非同期なので、開閉直後は複数回同期を走らせる
  function burstMenuSync() {
    scheduleMenuSync();
    setTimeout(scheduleMenuSync, 120);
    setTimeout(scheduleMenuSync, 320);
  }

  function syncMenuChecks(container = nativeCaptionMenuContainer()) {
    if (!container) return;
    const desired = state.pending || state.mode;
    const selection = readMenuSelection(container);
    const nativeLabel = selection.mode === MODE.NATIVE ? selection.label : state.lastNativeLabel;

    for (const item of nativeCaptionItems(container)) {
      let checked = false;
      if (isCustomItem(item)) {
        checked = desired === MODE.CUSTOM;
      } else if (desired === MODE.OFF) {
        checked = isOffItem(item);
      } else if (desired === MODE.NATIVE && nativeLabel) {
        checked = !isOffItem(item) && !isAutoTranslateItem(item) &&
          norm(itemLabel(item)) === norm(nativeLabel);
      }
      setAttr(item, "aria-checked", checked ? "true" : "false");
    }
  }

  function syncTopSummary(popup = settingsPopup(), row = findNativeCaptionsTopRow(popup)) {
    if (!popup || !visible(popup)) return;
    const content = row?.querySelector(".ytp-menuitem-content");
    if (!content) return;

    const customSummary = norm(t("customTrack"));
    const live = getSummaryText(content);
    if (live && norm(live) !== customSummary) content.dataset.ytsrtOriginalText = live;

    const desired = state.pending || state.mode;
    const selection = readMenuSelection();

    if (hasCues() && desired === MODE.CUSTOM) {
      setSummaryText(content, t("customTrack"));
      return;
    }
    if (selection.mode === MODE.NATIVE) {
      setSummaryText(content, selection.label);
      content.dataset.ytsrtOriginalText = selection.label;
      return;
    }
    if (desired === MODE.NATIVE && state.lastNativeLabel) {
      setSummaryText(content, state.lastNativeLabel);
      content.dataset.ytsrtOriginalText = state.lastNativeLabel;
      return;
    }
    if (selection.mode === MODE.OFF) {
      setSummaryText(content, t("off"));
      content.dataset.ytsrtOriginalText = t("off");
      return;
    }
    if (
      content.dataset.ytsrtOriginalText &&
      norm(content.dataset.ytsrtOriginalText) !== customSummary
    ) {
      setSummaryText(content, content.dataset.ytsrtOriginalText);
    }
  }

  function removeStaleRows(
    popup = settingsPopup(),
    topContainer = findTopLevelMenuContainer(popup),
    nativeTopRow = findNativeCaptionsTopRow(popup, topContainer),
    nativeContainer = nativeCaptionMenuContainer(popup)
  ) {
    const top = document.getElementById(ID.topRow);
    if (top && (!hasCues() || !topContainer || nativeTopRow)) top.remove();

    const nativeRow = document.getElementById(ID.nativeRow);
    if (nativeRow && (!hasCues() || !nativeContainer || nativeRow.parentElement !== nativeContainer)) {
      nativeRow.remove();
    }
    if (!hasInjectedMenuContent(popup)) restorePopupWidth(popup);
  }

  function syncSettingsUi() {
    const popup = settingsPopup();
    if (!popup || !visible(popup)) {
      removeStaleRows(popup);
      removePanel();
      return;
    }

    const topContainer = findTopLevelMenuContainer(popup);
    const nativeTopRow = findNativeCaptionsTopRow(popup, topContainer);
    const nativeContainer = hasCues() ? nativeCaptionMenuContainer(popup) : null;
    removeStaleRows(popup, topContainer, nativeTopRow, nativeContainer);

    // ネイティブの「字幕」行がない動画にだけ自前のトップレベル行を出す
    if (hasCues() && !nativeTopRow && !nativeContainer && topContainer) {
      mountTopRow(topContainer);
    }
    if (nativeContainer) {
      mountNativeRow(nativeContainer);
      syncMenuChecks(nativeContainer);
    }
    syncTopSummary(popup, nativeTopRow);
    syncPopupWidth(popup);
  }

  function onMenuItemActivated(item) {
    if (!item) return false;

    if (item.id === ID.topRow) {
      renderCustomSubmenu();
      return true;
    }
    if (item.dataset.ytsrtChoice === MODE.CUSTOM) {
      void requestMode(MODE.CUSTOM, { closeMenu: true });
      return true;
    }
    if (item.dataset.ytsrtChoice === MODE.OFF) {
      void requestMode(MODE.OFF, { closeMenu: true });
      return true;
    }

    // ネイティブ字幕メニューの操作は消費せず、モード同期だけ行う
    const container = nativeCaptionMenuContainer();
    const isNativeItem = !!container &&
      item.parentElement === container &&
      item.getAttribute("role") === "menuitemradio" &&
      visible(item);
    if (hasCues() && detectNativeAvailability() && isNativeItem && !isAutoTranslateItem(item)) {
      if (isOffItem(item)) {
        void requestMode(MODE.OFF, { persist: false, syncFromPlayer: true });
      } else {
        void requestMode(MODE.NATIVE, {
          persist: false,
          syncFromPlayer: true,
          nativeTrackLabel: itemLabel(item),
        });
      }
    }
    return false;
  }

  // ── モード制御 ───────────────────────────────────────────────────────────
  function applyMode(mode, { persist = true } = {}) {
    if (mode === MODE.CUSTOM && !hasCues()) {
      mode = state.mode === MODE.NATIVE ? MODE.NATIVE : MODE.OFF;
    }
    state.mode = mode;
    if (persist) persistMode(mode);

    if (mode === MODE.CUSTOM) renderCurrentCue();
    else renderOverlay("");

    syncCcButton();
    syncLoadButton();
    syncMenuChecks();
    scheduleMenuSync();
  }

  function syncModeFromPlayer({ persist = false } = {}) {
    if (
      state.mode === MODE.CUSTOM &&
      state.pending !== MODE.NATIVE &&
      state.pending !== MODE.OFF
    ) {
      return;
    }

    const selection = readMenuSelection();
    state.mode = selection.mode === MODE.CUSTOM
      ? MODE.CUSTOM
      : (selection.mode === MODE.NATIVE || hasVisibleNativeCaptions() || nativeCaptionsActive())
        ? MODE.NATIVE
        : MODE.OFF;
    state.pending = null;
    if (persist) persistMode(state.mode);

    if (state.mode !== MODE.CUSTOM) renderOverlay("");
    syncCcButton();
    syncMenuChecks();
    scheduleMenuSync();
  }

  async function requestMode(mode, {
    persist = true,
    closeMenu = false,
    syncFromPlayer = false,
    nativeTrackLabel = "",
  } = {}) {
    if (mode === MODE.CUSTOM && !hasCues()) return false;

    const token = ++state.transition;
    state.pending = mode;
    scheduleMenuSync();
    if (closeMenu) closeSettingsMenu();

    if (mode !== MODE.CUSTOM) {
      if (mode === MODE.NATIVE && nativeTrackLabel) rememberNativeLabel(nativeTrackLabel);
      applyMode(mode, { persist });
      if (syncFromPlayer) {
        setTimeout(() => {
          if (token !== state.transition) return;
          syncModeFromPlayer({ persist });
          burstMenuSync();
        }, 0);
      }
      return true;
    }

    // カスタムへ切り替え: ネイティブ字幕が表示中なら CC ボタンで先に無効化する
    if (state.mode === MODE.NATIVE || nativeCaptionsActive()) {
      const btn = ccButton();
      if (btn) {
        state.ignoreNextCcClick = true;
        btn.click();
      }
      const disabled = await waitFor(() =>
        token !== state.transition ||
        (!hasVisibleNativeCaptions() && readMenuSelection().mode !== MODE.NATIVE),
      2000, 50);
      if (!disabled) {
        console.warn("[ytsrt] native captions remained active while switching to custom");
      }
    }

    if (token !== state.transition) return false;
    applyMode(MODE.CUSTOM, { persist });
    state.pending = null;
    scheduleMenuSync();
    return true;
  }

  function closeSettingsMenu() {
    removePanel();
    const p = player();
    const btn = p ? $(SEL.settingsBtn, p) : null;
    if (btn?.getAttribute("aria-expanded") === "true") btn.click();
  }

  function togglePrimary() {
    if (!hasCues()) return;
    void requestMode(state.mode === MODE.CUSTOM ? MODE.OFF : MODE.CUSTOM);
  }

  // ── 動画イベント ─────────────────────────────────────────────────────────
  function unbindVideo() {
    if (!state.boundVideo) return;
    state.boundVideo.removeEventListener("timeupdate", renderCurrentCue);
    state.boundVideo.removeEventListener("seeking", renderCurrentCue);
    state.boundVideo = null;
  }

  function bindVideo() {
    const v = video();
    if (!v) return false;
    if (state.boundVideo === v) return true;
    unbindVideo();
    v.addEventListener("timeupdate", renderCurrentCue);
    v.addEventListener("seeking", renderCurrentCue);
    state.boundVideo = v;
    return true;
  }

  // ── 読み込み / 削除 / ルート処理 ─────────────────────────────────────────
  function setCues(cues) {
    state.cues = cues;
    state.renderedBody = null;
    syncLoadButton();
    scheduleMenuSync();
  }

  async function loadCaptionText(raw, {
    persist = false,
    persistVideoId = state.videoId,
    enableAfterLoad = false,
    routeToken = state.route,
  } = {}) {
    if (state.isLive) return false;

    const cues = parseCaption(raw);
    if (!cues.length) return false;

    setCues(cues);
    if (persist && persistVideoId) GM_setValue(KEY_SRT + persistVideoId, raw);

    if (
      !await waitFor(() => player() && video(), 10000, 150) ||
      routeToken !== state.route ||
      state.isLive
    ) {
      return true;
    }

    ensureLoadButton();
    ensureOverlay();
    bindVideo();
    applyMode(
      enableAfterLoad
        ? MODE.CUSTOM
        : state.mode === MODE.NATIVE ? MODE.NATIVE : storedMode(),
      { persist: false }
    );
    renderCurrentCue();
    return true;
  }

  function deleteCaptions() {
    if (state.videoId) GM_deleteValue(KEY_SRT + state.videoId);
    setCues([]);
    applyMode(MODE.OFF, { persist: true });
  }

  function openFilePicker() {
    if (state.isLive || !state.videoId) return;

    const videoId = state.videoId;
    const routeToken = state.route;
    const input = el("input", { type: "file", accept: ".srt,.lrc,text/plain" });
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", async () => {
      try {
        const file = input.files?.[0];
        if (!file) return;

        const text = await file.text();
        if (routeToken !== state.route || videoId !== state.videoId || state.isLive) return;

        const loaded = await loadCaptionText(text, {
          persist: true,
          persistVideoId: videoId,
          enableAfterLoad: true,
          routeToken,
        });
        if (!loaded) console.warn("[ytsrt] failed to parse caption file");
      } catch (e) {
        console.warn("[ytsrt] load failed:", e);
      } finally {
        input.remove();
      }
    }, { once: true });

    input.click();
  }

  function detach() {
    unbindVideo();
    state.resizeObs?.disconnect();
    state.resizeObs = null;
    disconnectControlsObserver();

    hideTooltip();
    document.getElementById(ID.tip)?.remove();
    loadButton()?.remove();
    const cc = ccButton();
    if (cc) {
      cc.classList.remove("ytsrt-subtitles-ready", "ytsrt-subtitles-custom-active");
      restoreCcButton(cc, { resetActiveClass: true });
    }
    removePanel();
    document.getElementById(ID.overlay)?.remove();

    state.transition += 1;
    resetState();
  }

  async function handleRouteChange() {
    const token = ++state.route;
    detach();

    if (!isVideoPage()) return;
    const videoId = getVideoId();
    if (!videoId) return;
    state.videoId = videoId;

    if (!await waitFor(() => player() && video(), 10000, 150)) return;
    if (token !== state.route || videoId !== getVideoId()) return;

    let info = readMediaInfo(videoId);
    if (!info.ready) {
      await waitFor(() => (info = readMediaInfo(videoId)).ready, 3000, 100);
    }
    if (token !== state.route || videoId !== getVideoId()) return;

    state.isLive = !!(info.ready && info.isLive);
    state.nativeKnown = !!(info.ready && info.nativeKnown);
    state.nativeAvailable = state.nativeKnown && !!info.nativeAvailable;
    if (state.isLive) return;

    ensureLoadButton();
    bindVideo();
    syncModeFromPlayer();

    const saved = GM_getValue(KEY_SRT + videoId, null);
    if (!saved || token !== state.route) return;

    await loadCaptionText(saved, {
      enableAfterLoad: storedMode() === MODE.CUSTOM,
      routeToken: token,
    });
  }

  // ── イベント / ショートカット ────────────────────────────────────────────
  function onDocumentClick(e) {
    if (!isVideoPage() || state.isLive) return;

    const cc = e.target.closest(SEL.ccBtn);
    if (cc) {
      if (state.ignoreNextCcClick) {
        state.ignoreNextCcClick = false;
        return;
      }
      if (hasCues()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        togglePrimary();
      }
      return;
    }

    if (e.target.closest(SEL.settingsBtn)) {
      burstMenuSync();
      return;
    }

    const item = e.target.closest(SEL.item);
    if (item) {
      if (onMenuItemActivated(item)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      burstMenuSync();
    }
  }

  function onKeydown(e) {
    if (!isVideoPage() || state.isLive || isEditableTarget()) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.code !== "KeyC") return;
    if (!e.altKey && !hasCues()) return;

    e.preventDefault();
    e.stopPropagation();
    if (e.altKey) {
      if (hasCues()) deleteCaptions();
      else openFilePicker();
    } else {
      togglePrimary();
    }
  }

  // ── 起動 ────────────────────────────────────────────────────────────────
  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("keydown", onKeydown, true);
  handleRouteChange();
  window.addEventListener("yt-navigate-finish", handleRouteChange);
})();
