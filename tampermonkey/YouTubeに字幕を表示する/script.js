// ==UserScript==
// @name         YouTubeに字幕を表示する
// @namespace    https://tampermonkey.net/
// @version      1.7.9
// @description  自作の .srt / .lrc 字幕を YouTube 動画にネイティブ字幕トラック風に統合表示する。Alt+C: 字幕ファイル読み込み, Alt+Shift+C: カスタム字幕オン/オフ, Alt+S: 字幕保存（タイムスタンプ付き）, Alt+Shift+S: 字幕保存。
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

  // ── Tuning constants ──────────────────────────────────────────────────────
  const FONT_RATIO = 0.045;
  const FONT_MIN_PX = 14;
  const FONT_MAX_PX = 56;
  const BOTTOM_PERCENT = 5;
  const MAX_WIDTH_PCT = 85;

  // ── Storage keys ──────────────────────────────────────────────────────────
  const CAPTION_KEY_PREFIX = "ytsrt:srt:";
  const CUSTOM_MODE_KEY = "ytsrt:customMode";
  const LAST_LRC_DEFAULT_DURATION = 5;

  // ── DOM ids / selectors ───────────────────────────────────────────────────
  const OVERLAY_ID = "ytsrt-overlay";
  const STYLE_ID = "ytsrt-style";
  const LOAD_BUTTON_ID = "ytsrt-load-button";
  const TOOLTIP_ID = "ytsrt-tooltip";
  const CUSTOM_PANEL_ID = "ytsrt-custom-captions-panel";
  const CUSTOM_TOP_ROW_ID = "ytsrt-custom-captions-row";
  const CUSTOM_NATIVE_ROW_ID = "ytsrt-native-custom-row";
  const PLAYER_SELECTOR = "#movie_player";
  const VIDEO_SELECTOR = "video.html5-main-video";
  const RIGHT_CONTROLS_SELECTOR = `${PLAYER_SELECTOR} .ytp-right-controls`;
  const SUBTITLES_BUTTON_SELECTOR = ".ytp-subtitles-button";
  const SETTINGS_BUTTON_SELECTOR = ".ytp-settings-button";
  const SETTINGS_POPUP_SELECTOR = `${PLAYER_SELECTOR} .ytp-popup.ytp-settings-menu`;
  const MENU_ITEM_SELECTOR = ".ytp-menuitem";
  const LOAD_BUTTON_SHORTCUT = "Alt+C";
  const LOAD_BUTTON_PATH_SCALE = 1.25;
  const MISSING_ATTRIBUTE_VALUE = "__ytsrt_missing__";
  const LOAD_BUTTON_SVG_PATH = "M480-480Zm120 288H216q-29.7 0-50.85-21.16Q144-234.32 144-264.04v-432.24Q144-726 165.15-747T216-768h528q29.7 0 50.85 21.15Q816-725.7 816-696v288h-72v-288H216v432h384v72Zm144 72v-72h-72v-72h72v-72h72v72h72v72h-72v72h-72ZM293.29-368h111.86Q421-368 432-378.78q11-10.78 11-26.72V-443h-56.14v19H312v-112h75v19h56v-37.89q0-16.11-10.64-26.61Q421.73-592 406-592H293.01q-16.01 0-26.51 10.71-10.5 10.7-10.5 26.52v148.95Q256-390 266.72-379t26.57 11Zm261.22 0h112.55q15.94 0 26.44-10.78Q704-389.56 704-405.5V-443h-56.14v19H573v-112h75v19h56v-37.89q0-16.11-10.72-26.61T666.71-592H554.85Q539-592 528-581.29q-11 10.7-11 26.52v148.95Q517-390 527.79-379q10.78 11 26.72 11Z";
  const ACTIVE_SUBTITLE_ICON_PATH = "M168-192q-29.7 0-50.85-21.16Q96-234.32 96-264.04v-432.24Q96-726 117.15-747T168-768h624q29.7 0 50.85 21.16Q864-725.68 864-695.96v432.24Q864-234 842.85-213T792-192H168Z M168-264h624v-432H168v432Z M168-264h624v-432H168v432Z M240-336h336v-72H240v72Z M648-336h72v-72h-72v72Z M240-480h72v-72h-72v72Z M384-480h336v-72H384v72Z";
  const BACK_ICON_PATH = "m313-440 224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z";

  const CAPTION_MODE = {
    OFF: "off",
    CUSTOM: "custom",
    NATIVE: "native",
  };

  const STRINGS = {
    ja: {
      captions: "字幕",
      captionsMenu: "字幕",
      captionsRow: "字幕 (1)",
      customTrack: "ユーザー作成字幕",
      off: "オフ",
      on: "オン",
      loadCaptions: "字幕を読み込む",
      reloadCaptions: "字幕を再読み込み",
      unavailable: "利用不可",
    },
    en: {
      captions: "Subtitles/CC",
      captionsMenu: "Subtitles/CC",
      captionsRow: "Subtitles/CC (1)",
      customTrack: "User-created subtitles",
      off: "Off",
      on: "On",
      loadCaptions: "Load captions",
      reloadCaptions: "Reload captions",
      unavailable: "Unavailable",
    },
  };

  // ── State ─────────────────────────────────────────────────────────────────
  const state = {
    cues: [],
    captionMode: CAPTION_MODE.OFF,
    currentVideoId: "",
    nativeCaptionsAvailable: false,
    lastCueIdx: -1,
    renderedBody: null,
    resizeObs: null,
    controlsObs: null,
    controlsObsTarget: null,
    controlsSyncFrame: 0,
    menuSyncFrame: 0,
    boundVideo: null,
    routeToken: 0,
    ignoreNextSubtitlesButtonClick: false,
    customTopRowMounted: false,
    customNativeRowMounted: false,
  };
  const originalSubtitlesButtonIcons = new WeakMap();

  // ── Utilities ─────────────────────────────────────────────────────────────
  const isVideoPage = () =>
    location.pathname.startsWith("/watch") || location.pathname.startsWith("/live/");

  function getLocale() {
    const lang = (
      document.documentElement.lang ||
      document.body?.lang ||
      navigator.language ||
      "en"
    ).toLowerCase();
    return lang.startsWith("ja") ? "ja" : "en";
  }

  function t(key) {
    return STRINGS[getLocale()][key];
  }

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

  function getRightControls() {
    return document.querySelector(RIGHT_CONTROLS_SELECTOR);
  }

  function getSubtitlesButton() {
    return getRightControls()?.querySelector(SUBTITLES_BUTTON_SELECTOR) || null;
  }

  function getSettingsButton() {
    return document.querySelector(`${PLAYER_SELECTOR} ${SETTINGS_BUTTON_SELECTOR}`);
  }

  function getLoadButton() {
    return document.getElementById(LOAD_BUTTON_ID);
  }

  function getTooltip() {
    return document.getElementById(TOOLTIP_ID);
  }

  function getSettingsPopup() {
    return Array.from(document.querySelectorAll(SETTINGS_POPUP_SELECTOR)).find(isVisibleElement) ||
      document.querySelector(SETTINGS_POPUP_SELECTOR);
  }

  function getCustomPanel() {
    return document.getElementById(CUSTOM_PANEL_ID);
  }

  function hasCustomCaptions() {
    return state.cues.length > 0;
  }

  function isVisibleElement(el) {
    return !!el && el.isConnected && !el.hidden && el.getClientRects().length > 0;
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

  function stashAttribute(node, attributeName, datasetKey) {
    if (datasetKey in node.dataset) return;
    node.dataset[datasetKey] = node.getAttribute(attributeName) ?? MISSING_ATTRIBUTE_VALUE;
  }

  function restoreStashedAttribute(node, attributeName, datasetKey) {
    if (!(datasetKey in node.dataset)) return;
    const originalValue = node.dataset[datasetKey];
    if (originalValue === MISSING_ATTRIBUTE_VALUE) {
      node.removeAttribute(attributeName);
    } else {
      node.setAttribute(attributeName, originalValue);
    }
    delete node.dataset[datasetKey];
  }

  function normalizeLabelText(text) {
    return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function getStoredCustomMode() {
    return gmGet(CUSTOM_MODE_KEY, CAPTION_MODE.CUSTOM) === CAPTION_MODE.CUSTOM
      ? CAPTION_MODE.CUSTOM
      : CAPTION_MODE.OFF;
  }

  function persistCustomMode(mode) {
    gmSet(
      CUSTOM_MODE_KEY,
      mode === CAPTION_MODE.CUSTOM ? CAPTION_MODE.CUSTOM : CAPTION_MODE.OFF
    );
  }

  function applyCueState(cues = []) {
    state.cues = cues;
    state.lastCueIdx = -1;
    state.renderedBody = null;
    syncLoadButtonState();
    scheduleSyncSettingsUi();
  }

  function isEditableTarget(el = document.activeElement) {
    const tag = el?.tagName?.toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable;
  }

  function getLoadButtonLabel() {
    return hasCustomCaptions() ? t("reloadCaptions") : t("loadCaptions");
  }

  function getCustomRowSummary() {
    if (!hasCustomCaptions()) return t("unavailable");
    return state.captionMode === CAPTION_MODE.CUSTOM ? t("customTrack") : t("off");
  }

  function applyCaptionMode(mode, { persist = true } = {}) {
    if (mode === CAPTION_MODE.CUSTOM && !hasCustomCaptions()) {
      mode = getNativeCaptionsActive() ? CAPTION_MODE.NATIVE : CAPTION_MODE.OFF;
    }

    state.captionMode = mode;
    if (persist) persistCustomMode(mode);

    if (mode === CAPTION_MODE.CUSTOM) {
      disableNativeCaptionsIfNeeded();
      renderCurrentCue();
    } else {
      renderOverlay("");
      if (mode !== CAPTION_MODE.CUSTOM) state.renderedBody = "";
    }

    syncSubtitlesButtonState();
    syncLoadButtonState();
    scheduleSyncSettingsUi();
  }

  function syncCaptionModeFromPlayer({ persist = false } = {}) {
    if (state.captionMode === CAPTION_MODE.CUSTOM) return;
    state.captionMode = getNativeCaptionsActive() ? CAPTION_MODE.NATIVE : CAPTION_MODE.OFF;
    if (persist) persistCustomMode(state.captionMode);
    syncSubtitlesButtonState();
    scheduleSyncSettingsUi();
  }

  function getNativeCaptionsAvailability() {
    const button = getSubtitlesButton();
    const label = normalizeLabelText(
      button?.getAttribute("aria-label") ||
      button?.getAttribute("title") ||
      ""
    );
    if (label && !label.includes("unavailable") && !label.includes("利用不可")) {
      return true;
    }

    const captionsVisible = Array.from(
      document.querySelectorAll(
        `${PLAYER_SELECTOR} .caption-window, ${PLAYER_SELECTOR} .ytp-caption-segment`
      )
    ).some((el) => isVisibleElement(el) && normalizeLabelText(el.textContent));
    if (captionsVisible) return true;

    const popup = getSettingsPopup();
    const menuTexts = popup
      ? Array.from(popup.querySelectorAll(MENU_ITEM_SELECTOR))
        .map((el) => normalizeLabelText(el.textContent))
      : [];
    return menuTexts.some((text) =>
      text.includes("subtitles/cc") ||
      text.includes("subtitles") ||
      text.startsWith(normalizeLabelText(t("captionsMenu")))
    );
  }

  function syncNativeAvailability() {
    state.nativeCaptionsAvailable = getNativeCaptionsAvailability();
  }

  function getNativeCaptionsActive() {
    const button = getSubtitlesButton();
    if (!button) return false;
    return button.getAttribute("aria-pressed") === "true" ||
      button.classList.contains("ytp-button-active");
  }

  function disableNativeCaptionsIfNeeded() {
    const button = getSubtitlesButton();
    if (!button || !getNativeCaptionsActive()) return;
    state.ignoreNextSubtitlesButtonClick = true;
    button.click();
  }

  function closeSettingsMenu() {
    removeCustomPanel();
    const settingsButton = getSettingsButton();
    if (settingsButton?.getAttribute("aria-expanded") === "true") {
      settingsButton.click();
    }
  }

  function togglePrimaryCaptions() {
    if (!hasCustomCaptions()) return;
    if (state.captionMode === CAPTION_MODE.CUSTOM) {
      applyCaptionMode(CAPTION_MODE.OFF);
    } else {
      applyCaptionMode(CAPTION_MODE.CUSTOM);
    }
  }

  function toggleCustomShortcutMode() {
    if (!hasCustomCaptions()) return;
    togglePrimaryCaptions();
  }

  function removeCustomPanel() {
    const panel = getCustomPanel();
    if (panel) panel.remove();
  }

  function resetInjectedMenuMarkers() {
    state.customTopRowMounted = false;
    state.customNativeRowMounted = false;
  }

  // ── SRT parser ────────────────────────────────────────────────────────────
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

  function unescapeNewlines(s) {
    return s.replace(/\\r\\n|\\n|\\r/g, "\n");
  }

  // ── LRC parser ────────────────────────────────────────────────────────────
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
    if (!raw) return [];
    const sample = raw.slice(0, 2048);
    if (/-->/.test(sample)) return parseSRT(raw);
    if (/^\s*\[\d+:\d+/m.test(sample) || /^\s*\[[a-z]+:/im.test(sample)) {
      return parseLRC(raw);
    }
    return parseSRT(raw);
  }

  // ── Body rendering ────────────────────────────────────────────────────────
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
        // ignore
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

  // ── Cue lookup ────────────────────────────────────────────────────────────
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

      #${LOAD_BUTTON_ID} {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        overflow: visible;
        padding: 0;
        line-height: 1;
        color: var(--yt-spec-text-primary, #fff);
      }
      #${LOAD_BUTTON_ID} .ytsrt-load-button__icon {
        width: 24px;
        height: 24px;
        display: block;
        fill: currentColor;
        opacity: 1;
      }
      #${LOAD_BUTTON_ID} .ytsrt-load-button__indicator {
        position: absolute;
        top: 9px;
        right: 8px;
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: #8ab4f8;
        opacity: 0;
        transform: scale(0.6);
        transition: opacity 120ms ease, transform 120ms ease;
        box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.85);
        pointer-events: none;
      }
      #${LOAD_BUTTON_ID}.--loaded .ytsrt-load-button__indicator {
        opacity: 1;
        transform: scale(1);
      }
      #${LOAD_BUTTON_ID}:hover .ytsrt-load-button__icon,
      #${LOAD_BUTTON_ID}:focus-visible .ytsrt-load-button__icon {
        transform: scale(1.03);
      }
      #${TOOLTIP_ID} {
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
      #${TOOLTIP_ID}[hidden] {
        display: none;
      }
      #${TOOLTIP_ID} .ytp-tooltip-bottom-text {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px 9px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.3);
        color: #eee;
        white-space: nowrap;
      }
      #${TOOLTIP_ID} .ytp-tooltip-keyboard-shortcut {
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
      ${PLAYER_SELECTOR} .ytp-subtitles-button.ytsrt-subtitles-ready {
        opacity: 1 !important;
        filter: none !important;
        color: #fff !important;
        cursor: pointer;
        pointer-events: auto;
      }
      ${PLAYER_SELECTOR} .ytp-subtitles-button.ytsrt-subtitles-ready *,
      ${PLAYER_SELECTOR} .ytp-subtitles-button.ytsrt-subtitles-ready svg,
      ${PLAYER_SELECTOR} .ytp-subtitles-button.ytsrt-subtitles-ready path {
        opacity: 1 !important;
        fill-opacity: 1 !important;
        fill: currentColor !important;
      }
      ${PLAYER_SELECTOR} .ytp-subtitles-button.ytsrt-subtitles-custom-active {
        color: #fff !important;
      }

      .ytsrt-menuitem {
        cursor: pointer;
      }
      .ytsrt-menuitem .ytp-menuitem-label {
        white-space: nowrap;
      }
      .ytsrt-menuitem .ytsrt-menuitem-status {
        color: #aaa;
        font-size: 14.5px;
      }
      .ytsrt-menuitem.ytsrt-choice-row .ytp-menuitem-icon {
        display: none;
      }
      .ytsrt-menuitem.ytsrt-choice-row .ytp-menuitem-content {
        color: #aaa;
        font-size: 12px;
      }
      .ytsrt-menuitem.ytsrt-choice-row .ytp-menuitem-label,
      .ytsrt-menuitem.ytsrt-choice-row .ytp-menuitem-content {
        margin-left: 0;
      }
      .ytsrt-menuitem svg,
      .ytsrt-menuitem path {
        fill: currentColor;
        opacity: 1 !important;
      }
      .ytsrt-menuitem .ytsrt-subtitle-glyph {
        opacity: 1 !important;
      }
      .ytsrt-menuitem.ytsrt-custom-track-row .ytp-menuitem-icon {
        visibility: hidden;
      }
      #${CUSTOM_PANEL_ID} {
        position: absolute;
        inset: 0;
        z-index: 2;
        border-radius: inherit;
        background: rgba(28, 28, 28, 0.92);
        overflow: hidden;
      }
      #${CUSTOM_PANEL_ID} .ytsrt-custom-panel__header {
        display: flex;
        align-items: center;
        min-height: 48px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      #${CUSTOM_PANEL_ID} .ytsrt-custom-panel__back {
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
      #${CUSTOM_PANEL_ID} .ytsrt-custom-panel__back svg {
        width: 18px;
        height: 18px;
        fill: currentColor;
      }
      #${CUSTOM_PANEL_ID} .ytsrt-custom-panel__title {
        color: #fff;
        font-size: 14px;
        font-weight: 500;
      }
      #${CUSTOM_PANEL_ID} .ytsrt-custom-panel__list {
        padding: 8px 0;
      }
    `;
    document.head.appendChild(style);
  }

  // ── SVG helpers ───────────────────────────────────────────────────────────
  function createSvgIcon(pathData, viewBox = "0 -960 960 960", transform = "") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    if (transform) path.setAttribute("transform", transform);
    svg.appendChild(path);
    return svg;
  }

  function getLoadButtonPathTransform() {
    return `translate(480 -480) scale(${LOAD_BUTTON_PATH_SCALE}) translate(-480 480)`;
  }

  function cloneSubtitleIcon() {
    const button = getSubtitlesButton();
    const currentIcon = getSubtitlesButtonIconContainer(button);
    const sourceIcon = currentIcon?.dataset.ytsrtCustomIcon === "1"
      ? originalSubtitlesButtonIcons.get(button) || currentIcon
      : currentIcon;
    const source = sourceIcon?.querySelector("svg");
    if (source) {
      const svg = source.cloneNode(true);
      svg.setAttribute("fill-opacity", "1");
      svg.querySelectorAll("[fill-opacity]").forEach((el) => {
        el.setAttribute("fill-opacity", "1");
      });
      return svg;
    }

    const glyph = sourceIcon?.querySelector(".ytsrt-subtitle-glyph");
    if (glyph) return glyph.cloneNode(true);

    const span = document.createElement("span");
    span.className = "ytsrt-subtitle-glyph";
    span.textContent = "CC";
    span.style.fontSize = "11px";
    span.style.fontWeight = "700";
    span.style.letterSpacing = "0.02em";
    span.style.opacity = "1";
    return span;
  }

  function createActiveSubtitleIcon() {
    const svg = createSvgIcon(
      ACTIVE_SUBTITLE_ICON_PATH,
      "0 -960 960 960",
      getLoadButtonPathTransform()
    );
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "24");
    svg.setAttribute("fill", "currentColor");
    const path = svg.querySelector("path");
    if (path) {
      path.setAttribute("fill", "currentColor");
      path.setAttribute("fill-rule", "evenodd");
    }
    return svg;
  }

  function createCustomSubtitlesButtonIcon(template = null) {
    const icon = template ? template.cloneNode(false) : document.createElement("div");
    icon.className = template?.className || "ytp-subtitles-button-icon";
    icon.setAttribute("fill-opacity", "1");
    icon.dataset.ytsrtCustomIcon = "1";
    clearChildren(icon);
    icon.appendChild(createActiveSubtitleIcon());
    return icon;
  }

  function getSubtitlesButtonIconContainer(button = getSubtitlesButton()) {
    return button?.querySelector(".ytp-subtitles-button-icon") || null;
  }

  function syncSubtitlesButtonIcon(button = getSubtitlesButton(), customActive = false) {
    const icon = getSubtitlesButtonIconContainer(button);
    if (!button || !icon) return;

    if (customActive) {
      if (!originalSubtitlesButtonIcons.has(button)) {
        originalSubtitlesButtonIcons.set(button, icon.cloneNode(true));
      }
      if (icon.dataset.ytsrtCustomIcon === "1") return;
      icon.replaceWith(createCustomSubtitlesButtonIcon(icon));
      return;
    }

    if (icon.dataset.ytsrtCustomIcon !== "1") return;

    const originalIcon = originalSubtitlesButtonIcons.get(button);
    if (originalIcon) icon.replaceWith(originalIcon.cloneNode(true));
  }

  function createMenuItem({
    id = "",
    label = "",
    content = "",
    checked = false,
    iconNode = null,
    role = "menuitemradio",
  }) {
    const item = document.createElement("div");
    item.className = "ytp-menuitem ytsrt-menuitem";
    item.setAttribute("role", role);
    item.setAttribute("tabindex", "0");
    if (role === "menuitemradio") {
      item.setAttribute("aria-checked", checked ? "true" : "false");
    }
    if (id) item.id = id;

    const icon = document.createElement("div");
    icon.className = "ytp-menuitem-icon";
    if (iconNode) icon.appendChild(iconNode);

    const labelNode = document.createElement("div");
    labelNode.className = "ytp-menuitem-label";
    labelNode.textContent = label;

    const contentNode = document.createElement("div");
    contentNode.className = "ytp-menuitem-content";
    if (content) {
      const text = document.createElement("span");
      text.className = "ytsrt-menuitem-status";
      text.textContent = content;
      contentNode.appendChild(text);
    }

    item.appendChild(icon);
    item.appendChild(labelNode);
    item.appendChild(contentNode);
    return item;
  }

  function findMenuItemSummaryHost(contentNode) {
    if (!contentNode) return null;

    const directChildren = Array.from(contentNode.children);
    const textLikeChild = directChildren.find((child) =>
      !child.querySelector("svg, path") && normalizeLabelText(child.textContent)
    );
    if (textLikeChild) return textLikeChild;

    return directChildren.find((child) => !child.querySelector("svg, path")) || null;
  }

  function getMenuItemSummaryText(contentNode) {
    if (!contentNode) return "";
    const host = findMenuItemSummaryHost(contentNode);
    return (host?.textContent || contentNode.textContent || "").trim();
  }

  function setMenuItemSummaryText(contentNode, text) {
    if (!contentNode) return;

    const host = findMenuItemSummaryHost(contentNode);
    if (host) {
      host.textContent = text;
      return;
    }

    const arrowNodes = Array.from(contentNode.children).filter((child) =>
      child.querySelector("svg, path")
    );
    clearChildren(contentNode);

    const summary = document.createElement("span");
    summary.className = "ytsrt-menuitem-status";
    summary.textContent = text;
    contentNode.appendChild(summary);
    arrowNodes.forEach((node) => contentNode.appendChild(node));
  }

  function replaceMenuItemIcon(item, iconNode) {
    const icon = item?.querySelector(".ytp-menuitem-icon");
    if (!icon) return;
    clearChildren(icon);
    if (iconNode) icon.appendChild(iconNode);
  }

  // ── Player controls / load button ────────────────────────────────────────
  function createLoadButton() {
    ensureStyle();

    const button = document.createElement("button");
    button.id = LOAD_BUTTON_ID;
    button.className = "ytp-button";
    button.type = "button";
    button.setAttribute("aria-keyshortcuts", LOAD_BUTTON_SHORTCUT);
    button.dataset.titleNoTooltip = getLoadButtonLabel();

    const svg = createSvgIcon(
      LOAD_BUTTON_SVG_PATH,
      "0 -960 960 960",
      getLoadButtonPathTransform()
    );
    svg.setAttribute("class", "ytsrt-load-button__icon");
    button.appendChild(svg);

    const indicator = document.createElement("span");
    indicator.className = "ytsrt-load-button__indicator";
    indicator.setAttribute("aria-hidden", "true");
    button.appendChild(indicator);

    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openFilePicker();
    });
    button.addEventListener("mouseenter", showTooltip);
    button.addEventListener("focus", showTooltip);
    button.addEventListener("mouseleave", hideTooltip);
    button.addEventListener("blur", hideTooltip);
    syncLoadButtonState(button);
    return button;
  }

  function ensureTooltip(player = getPlayer()) {
    if (!player) return null;
    ensureStyle();

    let tooltip = getTooltip();
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.id = TOOLTIP_ID;
      tooltip.className = "ytsrt-load-tooltip ytp-tooltip ytp-bottom";
      tooltip.hidden = true;

      const wrapper = document.createElement("div");
      wrapper.className = "ytp-tooltip-text-wrapper";
      wrapper.setAttribute("aria-hidden", "true");

      const bottom = document.createElement("div");
      bottom.className = "ytp-tooltip-bottom-text";

      const label = document.createElement("span");
      label.className = "ytp-tooltip-text";

      const shortcut = document.createElement("div");
      shortcut.className = "ytp-tooltip-keyboard-shortcut";
      shortcut.textContent = LOAD_BUTTON_SHORTCUT;

      bottom.appendChild(label);
      bottom.appendChild(shortcut);
      wrapper.appendChild(bottom);
      tooltip.appendChild(wrapper);
    }

    if (tooltip.parentElement !== player) {
      player.appendChild(tooltip);
    }

    syncTooltipState(tooltip);
    return tooltip;
  }

  function syncTooltipState(tooltip = getTooltip()) {
    const labelNode = tooltip?.querySelector(".ytp-tooltip-text");
    if (labelNode) labelNode.textContent = getLoadButtonLabel();
  }

  function syncLoadButtonState(button = getLoadButton()) {
    if (!button) return;
    const label = getLoadButtonLabel();
    syncNativeAvailability();
    button.setAttribute("aria-label", label);
    button.dataset.titleNoTooltip = label;
    button.classList.toggle("--loaded", hasCustomCaptions());
    syncTooltipState();
    syncSubtitlesButtonState();

    const topRow = document.getElementById(CUSTOM_TOP_ROW_ID);
    if (topRow) {
      setMenuItemSummaryText(
        topRow.querySelector(".ytp-menuitem-content"),
        getCustomRowSummary()
      );
    }
  }

  function positionTooltip(tooltip, button, player) {
    const buttonRect = button.getBoundingClientRect();
    const playerRect = player.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const left =
      buttonRect.left - playerRect.left + (buttonRect.width / 2) - (tooltipRect.width / 2);
    const top = buttonRect.top - playerRect.top - tooltipRect.height - 22;
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
    tooltip.style.bottom = "auto";
  }

  function showTooltip() {
    const player = getPlayer();
    const button = getLoadButton();
    if (!player || !button) return;

    const tooltip = ensureTooltip(player);
    if (!tooltip) return;

    tooltip.hidden = false;
    tooltip.style.visibility = "hidden";
    positionTooltip(tooltip, button, player);
    tooltip.style.visibility = "";
  }

  function hideTooltip() {
    const tooltip = getTooltip();
    if (tooltip) tooltip.hidden = true;
  }

  function syncSubtitlesButtonState(button = getSubtitlesButton()) {
    if (!button) return;

    const ready = hasCustomCaptions();
    const customActive = ready && state.captionMode === CAPTION_MODE.CUSTOM;
    button.classList.toggle("ytsrt-subtitles-ready", ready);
    button.classList.toggle("ytsrt-subtitles-custom-active", customActive);

    if (ready) {
      stashAttribute(button, "aria-label", "ytsrtOriginalAriaLabel");
      stashAttribute(button, "aria-pressed", "ytsrtOriginalAriaPressed");
      stashAttribute(button, "title", "ytsrtOriginalTitle");
      stashAttribute(button, "data-title-no-tooltip", "ytsrtOriginalDataTitle");
      stashAttribute(button, "data-tooltip-title", "ytsrtOriginalTooltipTitle");
      button.setAttribute("aria-label", t("captions"));
      button.setAttribute("title", t("captions"));
      button.setAttribute("data-title-no-tooltip", t("captions"));
      button.setAttribute("data-tooltip-title", t("captions"));
      button.disabled = false;
      button.removeAttribute("disabled");
      button.setAttribute("aria-disabled", "false");
      button.removeAttribute("aria-hidden");
      button.setAttribute(
        "aria-pressed",
        state.captionMode === CAPTION_MODE.OFF ? "false" : "true"
      );
      button.classList.remove("ytp-button-disabled");
      button.tabIndex = 0;
      syncSubtitlesButtonIcon(button, customActive);
      button.querySelectorAll("[fill-opacity]").forEach((el) => {
        if (!el.dataset.ytsrtOriginalFillOpacity) {
          el.dataset.ytsrtOriginalFillOpacity = el.getAttribute("fill-opacity") || "";
        }
        el.setAttribute("fill-opacity", "1");
      });
      if (customActive && !button.classList.contains("ytp-button-active")) {
        button.dataset.ytsrtForcedActive = "1";
        button.classList.add("ytp-button-active");
      }
    }

    if (
      !customActive &&
      state.captionMode === CAPTION_MODE.OFF &&
      button.dataset.ytsrtForcedActive === "1"
    ) {
      button.classList.remove("ytp-button-active");
      delete button.dataset.ytsrtForcedActive;
    }

    if (!ready) {
      syncSubtitlesButtonIcon(button, false);
      button.removeAttribute("aria-disabled");
      restoreStashedAttribute(button, "aria-label", "ytsrtOriginalAriaLabel");
      restoreStashedAttribute(button, "aria-pressed", "ytsrtOriginalAriaPressed");
      restoreStashedAttribute(button, "title", "ytsrtOriginalTitle");
      restoreStashedAttribute(button, "data-title-no-tooltip", "ytsrtOriginalDataTitle");
      restoreStashedAttribute(button, "data-tooltip-title", "ytsrtOriginalTooltipTitle");
      button.querySelectorAll("[data-ytsrt-original-fill-opacity]").forEach((el) => {
        const original = el.dataset.ytsrtOriginalFillOpacity;
        if (original) el.setAttribute("fill-opacity", original);
        else el.removeAttribute("fill-opacity");
        delete el.dataset.ytsrtOriginalFillOpacity;
      });
    }
  }

  function ensureLoadButton() {
    if (!isVideoPage()) return null;

    const player = getPlayer();
    if (!player) return null;

    observeControls(player);

    const subtitlesButton = getSubtitlesButton();
    if (!subtitlesButton?.parentNode) return null;

    let button = getLoadButton();
    if (!button) button = createLoadButton();

    if (button.parentElement !== subtitlesButton.parentNode || button.previousSibling !== subtitlesButton) {
      subtitlesButton.parentNode.insertBefore(button, subtitlesButton.nextSibling);
    }

    syncLoadButtonState(button);
    return button;
  }

  function scheduleEnsureUi() {
    if (state.controlsSyncFrame) return;
    state.controlsSyncFrame = requestAnimationFrame(() => {
      state.controlsSyncFrame = 0;
      ensureLoadButton();
      scheduleSyncSettingsUi();
    });
  }

  function observeControls(player) {
    if (typeof MutationObserver === "undefined") return;
    if (state.controlsObs && state.controlsObsTarget === player) return;

    disconnectControlsObserver();
    state.controlsObs = new MutationObserver(() => scheduleEnsureUi());
    state.controlsObs.observe(player, { childList: true, subtree: true, attributes: true });
    state.controlsObsTarget = player;
  }

  function disconnectControlsObserver() {
    if (state.controlsSyncFrame) {
      cancelAnimationFrame(state.controlsSyncFrame);
      state.controlsSyncFrame = 0;
    }
    if (state.menuSyncFrame) {
      cancelAnimationFrame(state.menuSyncFrame);
      state.menuSyncFrame = 0;
    }
    if (!state.controlsObs) return;
    state.controlsObs.disconnect();
    state.controlsObs = null;
    state.controlsObsTarget = null;
  }

  function removePlayerControlsUi() {
    hideTooltip();
    const tooltip = getTooltip();
    if (tooltip) tooltip.remove();

    const button = getLoadButton();
    if (button) button.remove();

    const subtitlesButton = getSubtitlesButton();
    if (subtitlesButton) {
      syncSubtitlesButtonIcon(subtitlesButton, false);
      subtitlesButton.classList.remove(
        "ytsrt-subtitles-ready",
        "ytsrt-subtitles-custom-active"
      );
      if (subtitlesButton.dataset.ytsrtForcedActive === "1") {
        subtitlesButton.classList.remove("ytp-button-active");
        delete subtitlesButton.dataset.ytsrtForcedActive;
      }
      restoreStashedAttribute(subtitlesButton, "aria-label", "ytsrtOriginalAriaLabel");
      restoreStashedAttribute(subtitlesButton, "aria-pressed", "ytsrtOriginalAriaPressed");
      restoreStashedAttribute(subtitlesButton, "title", "ytsrtOriginalTitle");
      restoreStashedAttribute(subtitlesButton, "data-title-no-tooltip", "ytsrtOriginalDataTitle");
      restoreStashedAttribute(subtitlesButton, "data-tooltip-title", "ytsrtOriginalTooltipTitle");
      subtitlesButton.querySelectorAll("[data-ytsrt-original-fill-opacity]").forEach((el) => {
        const original = el.dataset.ytsrtOriginalFillOpacity;
        if (original) el.setAttribute("fill-opacity", original);
        else el.removeAttribute("fill-opacity");
        delete el.dataset.ytsrtOriginalFillOpacity;
      });
    }
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

  // ── Settings menu integration ─────────────────────────────────────────────
  function scheduleSyncSettingsUi() {
    if (state.menuSyncFrame) return;
    state.menuSyncFrame = requestAnimationFrame(() => {
      state.menuSyncFrame = 0;
      syncNativeAvailability();
      syncSettingsUi();
    });
  }

  function burstSyncSettingsUi() {
    scheduleSyncSettingsUi();
    setTimeout(() => scheduleSyncSettingsUi(), 0);
    setTimeout(() => scheduleSyncSettingsUi(), 120);
    setTimeout(() => scheduleSyncSettingsUi(), 320);
  }

  function getVisibleMenuItems(popup = getSettingsPopup()) {
    if (!popup || !isVisibleElement(popup)) return [];
    return Array.from(popup.querySelectorAll(MENU_ITEM_SELECTOR)).filter(isVisibleElement);
  }

  function findTopLevelMenuContainer(popup = getSettingsPopup()) {
    if (!popup || !isVisibleElement(popup) || getActivePanelHeader(popup)) return null;

    const containers = Array.from(popup.querySelectorAll(".ytp-panel-menu")).filter((container) =>
      isVisibleElement(container) && !container.closest(`#${CUSTOM_PANEL_ID}`)
    );

    return containers.find((container) =>
      Array.from(container.children).some((item) =>
        item.matches?.(MENU_ITEM_SELECTOR) &&
        isVisibleElement(item) &&
        item.getAttribute("role") === "menuitem"
      )
    ) || null;
  }

  function isCaptionsMenuTitle(text) {
    const normalized = normalizeLabelText(text);
    return normalized === normalizeLabelText(t("captionsMenu")) ||
      normalized === "subtitles/cc" ||
      normalized === "subtitles" ||
      normalized === "captions";
  }

  function getActivePanelHeader(popup = getSettingsPopup()) {
    if (!popup || !isVisibleElement(popup)) return null;
    return Array.from(popup.querySelectorAll(".ytp-panel-header")).find(isVisibleElement) || null;
  }

  function getActivePanelTitleText(popup = getSettingsPopup()) {
    const header = getActivePanelHeader(popup);
    const title = header?.querySelector(".ytp-panel-title");
    return title && isVisibleElement(title) ? title.textContent || "" : "";
  }

  function findNativeCaptionMenuContainer(popup = getSettingsPopup()) {
    if (!isCaptionsMenuTitle(getActivePanelTitleText(popup))) return null;

    const header = getActivePanelHeader(popup);
    const container = header?.nextElementSibling;
    if (
      !container ||
      !container.matches(".ytp-panel-menu") ||
      !isVisibleElement(container) ||
      container.closest(`#${CUSTOM_PANEL_ID}`)
    ) {
      return null;
    }

    const nativeItems = Array.from(container.querySelectorAll(MENU_ITEM_SELECTOR)).filter((item) =>
      item.id !== CUSTOM_TOP_ROW_ID &&
      item.id !== CUSTOM_NATIVE_ROW_ID &&
      item.getAttribute("role") === "menuitemradio" &&
      isVisibleElement(item)
    );
    return nativeItems.length ? container : null;
  }

  function renderCustomSubmenu() {
    removeCustomPanel();
    const popup = getSettingsPopup();
    if (!popup || !isVisibleElement(popup)) return;
    ensureStyle();

    const panel = document.createElement("div");
    panel.id = CUSTOM_PANEL_ID;

    const header = document.createElement("div");
    header.className = "ytsrt-custom-panel__header";

    const back = document.createElement("button");
    back.type = "button";
    back.className = "ytsrt-custom-panel__back";
    back.setAttribute("aria-label", t("captionsMenu"));
    back.appendChild(createSvgIcon(BACK_ICON_PATH));
    back.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeCustomPanel();
      scheduleSyncSettingsUi();
    });

    const title = document.createElement("div");
    title.className = "ytsrt-custom-panel__title";
    title.textContent = t("captionsMenu");

    header.appendChild(back);
    header.appendChild(title);
    panel.appendChild(header);

    const list = document.createElement("div");
    list.className = "ytsrt-custom-panel__list";

    const offItem = createMenuItem({
      label: t("off"),
      checked: state.captionMode === CAPTION_MODE.OFF,
      iconNode: document.createTextNode(""),
    });
    offItem.classList.add("ytsrt-choice-row");
    offItem.dataset.ytsrtChoice = CAPTION_MODE.OFF;
    offItem.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyCaptionMode(CAPTION_MODE.OFF);
      closeSettingsMenu();
    });

    const customItem = createMenuItem({
      label: t("customTrack"),
      checked: state.captionMode === CAPTION_MODE.CUSTOM,
      iconNode: document.createTextNode(""),
      content: state.captionMode === CAPTION_MODE.CUSTOM ? t("customTrack") : "",
    });
    customItem.classList.add("ytsrt-choice-row");
    customItem.dataset.ytsrtChoice = CAPTION_MODE.CUSTOM;
    customItem.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyCaptionMode(CAPTION_MODE.CUSTOM);
      closeSettingsMenu();
    });

    list.appendChild(offItem);
    list.appendChild(customItem);
    panel.appendChild(list);
    popup.appendChild(panel);
  }

  function cloneTopLevelMenuRowTemplate(container = findTopLevelMenuContainer()) {
    if (!container) return null;

    const candidates = Array.from(container.querySelectorAll(MENU_ITEM_SELECTOR)).filter((item) =>
      item.id !== CUSTOM_TOP_ROW_ID &&
      item.id !== CUSTOM_NATIVE_ROW_ID &&
      !item.closest(`#${CUSTOM_PANEL_ID}`) &&
      !item.querySelector(".ytp-menuitem-toggle-checkbox") &&
      item.querySelector(".ytp-menuitem-content")
    );
    const template = candidates.find((item) => !isNativeCaptionsTopRow(item)) || candidates[0];
    return template ? template.cloneNode(true) : null;
  }

  function buildTopLevelCustomRow(container = findTopLevelMenuContainer()) {
    const row = cloneTopLevelMenuRowTemplate(container) || createMenuItem({
      label: t("captionsRow"),
      content: getCustomRowSummary(),
      checked: false,
      iconNode: cloneSubtitleIcon(),
      role: "menuitem",
    });

    row.id = CUSTOM_TOP_ROW_ID;
    row.classList.add("ytsrt-menuitem");
    row.dataset.ytsrtTopRow = "1";
    row.setAttribute("role", "menuitem");
    row.setAttribute("tabindex", "0");
    row.removeAttribute("aria-checked");
    replaceMenuItemIcon(row, cloneSubtitleIcon());

    const labelNode = row.querySelector(".ytp-menuitem-label");
    if (labelNode) labelNode.textContent = t("captionsRow");
    setMenuItemSummaryText(row.querySelector(".ytp-menuitem-content"), getCustomRowSummary());

    row.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      renderCustomSubmenu();
    });
    return row;
  }

  function buildNativeCustomRow() {
    const row = createMenuItem({
      id: CUSTOM_NATIVE_ROW_ID,
      label: t("customTrack"),
      checked: state.captionMode === CAPTION_MODE.CUSTOM,
      iconNode: document.createTextNode(""),
    });
    row.classList.add("ytsrt-custom-track-row");
    row.classList.add("ytsrt-choice-row");
    row.dataset.ytsrtChoice = CAPTION_MODE.CUSTOM;
    row.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyCaptionMode(CAPTION_MODE.CUSTOM);
      closeSettingsMenu();
    });
    return row;
  }

  function mountTopLevelCustomRow(container) {
    if (!container || document.getElementById(CUSTOM_TOP_ROW_ID)) return;
    const row = buildTopLevelCustomRow(container);
    const items = Array.from(container.querySelectorAll(MENU_ITEM_SELECTOR));
    const before = items.find((item) =>
      !item.querySelector(".ytp-menuitem-toggle-checkbox")
    );
    if (before) container.insertBefore(row, before);
    else container.appendChild(row);
    state.customTopRowMounted = true;
  }

  function mountNativeCustomRow(container) {
    if (!container || document.getElementById(CUSTOM_NATIVE_ROW_ID)) return;
    const row = buildNativeCustomRow();
    container.appendChild(row);
    state.customNativeRowMounted = true;
    syncCaptionMenuChecks(container);
  }

  function getMenuItemLabel(item) {
    return normalizeLabelText(item?.querySelector(".ytp-menuitem-label")?.textContent || "");
  }

  function isNativeCaptionsTopRow(item) {
    const label = getMenuItemLabel(item);
    return label === normalizeLabelText(t("captionsMenu")) ||
      label.includes("subtitles/cc") ||
      label === "subtitles" ||
      label === "captions";
  }

  function findNativeCaptionsTopRow(popup = getSettingsPopup()) {
    const container = findTopLevelMenuContainer(popup);
    if (!container) return null;
    return Array.from(container.querySelectorAll(MENU_ITEM_SELECTOR))
      .find((item) =>
        item.id !== CUSTOM_TOP_ROW_ID &&
        item.id !== CUSTOM_NATIVE_ROW_ID &&
        !item.closest(`#${CUSTOM_PANEL_ID}`) &&
        isNativeCaptionsTopRow(item)
      ) || null;
  }

  function syncTopLevelCaptionsSummary(popup = getSettingsPopup()) {
    if (!popup || !isVisibleElement(popup)) return;
    const row = findNativeCaptionsTopRow(popup);
    const content = row?.querySelector(".ytp-menuitem-content");
    if (!content) return;

    if (
      !content.dataset.ytsrtOriginalText &&
      !(hasCustomCaptions() && state.captionMode === CAPTION_MODE.CUSTOM)
    ) {
      content.dataset.ytsrtOriginalText = getMenuItemSummaryText(content);
    }

    if (hasCustomCaptions() && state.captionMode === CAPTION_MODE.CUSTOM) {
      setMenuItemSummaryText(content, t("customTrack"));
    } else if (content.dataset.ytsrtOriginalText) {
      setMenuItemSummaryText(content, content.dataset.ytsrtOriginalText);
      delete content.dataset.ytsrtOriginalText;
    }
  }

  function syncCaptionMenuChecks(container = findNativeCaptionMenuContainer()) {
    if (!container) return;
    const customActive = state.captionMode === CAPTION_MODE.CUSTOM;
    const customRow = document.getElementById(CUSTOM_NATIVE_ROW_ID);

    for (const item of Array.from(container.querySelectorAll(MENU_ITEM_SELECTOR))) {
      if (item.closest(`#${CUSTOM_PANEL_ID}`)) continue;
      if (item === customRow) {
        item.setAttribute("aria-checked", customActive ? "true" : "false");
        continue;
      }
      if (customActive) item.setAttribute("aria-checked", "false");
    }
  }

  function syncSettingsUi() {
    const popup = getSettingsPopup();
    removeStaleInjectedRows();
    if (!popup || !isVisibleElement(popup)) {
      removeCustomPanel();
      resetInjectedMenuMarkers();
      return;
    }

    const nativeTopRow = findNativeCaptionsTopRow(popup);
    const nativeCaptionContainer = hasCustomCaptions()
      ? findNativeCaptionMenuContainer(popup)
      : null;
    const shouldMountTopLevelCustomRow = hasCustomCaptions() &&
      !nativeTopRow &&
      !nativeCaptionContainer;

    if (shouldMountTopLevelCustomRow) {
      const container = findTopLevelMenuContainer(popup);
      if (container) mountTopLevelCustomRow(container);
    }

    if (nativeCaptionContainer) {
      mountNativeCustomRow(nativeCaptionContainer);
      syncCaptionMenuChecks(nativeCaptionContainer);
    }

    syncTopLevelCaptionsSummary(popup);
  }

  function removeStaleInjectedRows() {
    const top = document.getElementById(CUSTOM_TOP_ROW_ID);
    if (top && (!hasCustomCaptions() || !findTopLevelMenuContainer() || findNativeCaptionsTopRow())) {
      top.remove();
    }

    const nativeRow = document.getElementById(CUSTOM_NATIVE_ROW_ID);
    const nativeContainer = findNativeCaptionMenuContainer();
    if (
      nativeRow &&
      (
        !hasCustomCaptions() ||
        !nativeContainer ||
        nativeRow.parentElement !== nativeContainer
      )
    ) {
      nativeRow.remove();
    }

    state.customTopRowMounted = !!document.getElementById(CUSTOM_TOP_ROW_ID);
    state.customNativeRowMounted = !!document.getElementById(CUSTOM_NATIVE_ROW_ID);
  }

  function onMenuItemActivated(item) {
    if (!item) return;

    if (item.id === CUSTOM_TOP_ROW_ID) {
      renderCustomSubmenu();
      return;
    }

    if (item.dataset.ytsrtChoice === CAPTION_MODE.CUSTOM) {
      applyCaptionMode(CAPTION_MODE.CUSTOM);
      closeSettingsMenu();
      return;
    }

    if (item.dataset.ytsrtChoice === CAPTION_MODE.OFF) {
      applyCaptionMode(CAPTION_MODE.OFF);
      closeSettingsMenu();
      return;
    }

    if (hasCustomCaptions() && state.nativeCaptionsAvailable && findNativeCaptionMenuContainer()) {
      const text = normalizeLabelText(item.textContent);
      setTimeout(() => {
        if (text === normalizeLabelText(t("off"))) {
          applyCaptionMode(CAPTION_MODE.OFF, { persist: false });
        } else if (!text.includes(normalizeLabelText(t("customTrack")))) {
          state.captionMode = CAPTION_MODE.NATIVE;
          renderOverlay("");
          syncSubtitlesButtonState();
          scheduleSyncSettingsUi();
        }
      }, 0);
    }
  }

  // ── Time update → render cue ──────────────────────────────────────────────
  function renderCurrentCue() {
    if (state.captionMode !== CAPTION_MODE.CUSTOM) {
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

  // ── Load / route handling ─────────────────────────────────────────────────
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
    const cues = parseCaption(raw);
    if (!cues.length) return false;

    applyCueState(cues);

    if (persist && persistVideoId) {
      gmSet(CAPTION_KEY_PREFIX + persistVideoId, raw);
    }

    if (!await waitForPlayer() || routeToken !== state.routeToken) return true;

    ensureLoadButton();
    ensureOverlay();
    bindVideoListeners();
    syncNativeAvailability();
    applyCaptionMode(enableAfterLoad ? CAPTION_MODE.CUSTOM : getStoredCustomMode(), {
      persist: false,
    });
    renderCurrentCue();
    return true;
  }

  function openFilePicker() {
    const videoId = state.currentVideoId;
    if (!videoId) return;

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

        const loaded = await loadCaptionText(text, {
          persist: true,
          persistVideoId: videoId,
          enableAfterLoad: true,
          routeToken,
        });
        if (!loaded) {
          console.warn("[ytsrt] failed to parse caption file");
          return;
        }
      } catch (e) {
        console.warn("[ytsrt] load failed:", e);
      } finally {
        input.remove();
      }
    }, { once: true });

    input.click();
  }

  function detach() {
    unbindVideoListeners();
    disconnectResizeObserver();
    disconnectControlsObserver();
    removePlayerControlsUi();
    removeCustomPanel();

    const overlay = getOverlay();
    if (overlay) overlay.remove();

    applyCueState();
    state.captionMode = CAPTION_MODE.OFF;
    state.currentVideoId = "";
    state.nativeCaptionsAvailable = false;
    resetInjectedMenuMarkers();
  }

  async function handleRouteChange() {
    const routeToken = ++state.routeToken;
    detach();

    if (!isVideoPage()) return;

    const videoId = getVideoId();
    if (!videoId) return;

    state.currentVideoId = videoId;
    const ready = await waitForPlayer();
    if (!ready || routeToken !== state.routeToken) return;

    ensureLoadButton();
    bindVideoListeners();
    syncNativeAvailability();
    syncCaptionModeFromPlayer();

    const saved = gmGet(CAPTION_KEY_PREFIX + videoId, null);
    if (!saved) return;

    await loadCaptionText(saved, {
      enableAfterLoad: getStoredCustomMode() === CAPTION_MODE.CUSTOM,
      routeToken,
    });
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
    if (!state.cues.length) return;
    try {
      const text = buildTranscriptText(state.cues, { withTimestamps });
      if (!text) return;
      const title = sanitizeFilename(getVideoTitle());
      const suffix = withTimestamps ? " - transcript (with timestamp).txt" : " - transcript.txt";
      const filename = title + suffix;
      downloadTextFile(filename, text);
    } catch (e) {
      console.error("[ytsrt] export failed:", e);
    }
  }

  // ── Events / shortcuts ────────────────────────────────────────────────────
  function onDocumentClick(e) {
    if (!isVideoPage()) return;

    const subtitlesButton = e.target.closest(SUBTITLES_BUTTON_SELECTOR);
    if (subtitlesButton) {
      if (state.ignoreNextSubtitlesButtonClick) {
        state.ignoreNextSubtitlesButtonClick = false;
        return;
      }
      syncNativeAvailability();
      if (hasCustomCaptions()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        togglePrimaryCaptions();
      }
      return;
    }

    if (e.target.closest(SETTINGS_BUTTON_SELECTOR)) {
      burstSyncSettingsUi();
      return;
    }

    const menuItem = e.target.closest(MENU_ITEM_SELECTOR);
    if (menuItem) {
      onMenuItemActivated(menuItem);
      burstSyncSettingsUi();
      return;
    }
  }

  function registerShortcuts() {
    document.addEventListener("click", onDocumentClick, true);

    document.addEventListener("keydown", (e) => {
      if (!isVideoPage() || isEditableTarget()) return;

      const altOnly = e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey;
      const altShift = e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey;
      const plainC = !e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyC";

      if (plainC && hasCustomCaptions()) {
        e.preventDefault();
        e.stopPropagation();
        togglePrimaryCaptions();
        return;
      }

      if (!altOnly && !altShift) return;

      if (e.code === "KeyC") {
        e.preventDefault();
        e.stopPropagation();
        if (altOnly) openFilePicker();
        else toggleCustomShortcutMode();
        return;
      }
      if (e.code === "KeyS") {
        e.preventDefault();
        e.stopPropagation();
        exportCaption(altOnly);
      }
    }, true);
  }

  // ── Startup ───────────────────────────────────────────────────────────────
  function start() {
    registerShortcuts();
    handleRouteChange();
    window.addEventListener("yt-navigate-finish", handleRouteChange);
  }

  start();
})();
