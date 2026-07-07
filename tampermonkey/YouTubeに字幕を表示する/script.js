// ==UserScript==
// @name         YouTubeに字幕を表示する
// @namespace    https://tampermonkey.net/
// @version      2.2.0
// @description  自作の .srt / .lrc 字幕を YouTube 動画にネイティブ字幕トラック風に統合表示する。Alt+C: 字幕ファイル読み込み。
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

  // ── Tuning constants ──────────────────────────────────────────────────────
  const FONT_RATIO = 0.0444;
  const FONT_MIN_PX = 14;
  const FONT_MAX_PX = 56;
  const BOTTOM_PERCENT = 2;
  const MAX_WIDTH_PCT = 96;

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
  const LIVE_STATE_ATTR = "data-ytsrt-live-now";
  const LIVE_STATE_VIDEO_ID_ATTR = "data-ytsrt-live-video-id";
  const LIVE_STATE_READY_ATTR = "data-ytsrt-live-state-ready";
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
  const DELETE_BUTTON_SVG_PATH = "M480-480Zm120 288H216q-29.7 0-50.85-21.16Q144-234.32 144-264.04v-432.24Q144-726 165.15-747T216-768h528q29.7 0 50.85 21.15Q816-725.7 816-696v288h-72v-288H216v432h384v72Zm72 -54v-72h216v72h-216ZM293.29-368h111.86Q421-368 432-378.78q11-10.78 11-26.72V-443h-56.14v19H312v-112h75v19h56v-37.89q0-16.11-10.64-26.61Q421.73-592 406-592H293.01q-16.01 0-26.51 10.71-10.5 10.7-10.5 26.52v148.95Q256-390 266.72-379t26.57 11Zm261.22 0h112.55q15.94 0 26.44-10.78Q704-389.56 704-405.5V-443h-56.14v19H573v-112h75v19h56v-37.89q0-16.11-10.72-26.61T666.71-592H554.85Q539-592 528-581.29q-11 10.7-11 26.52v148.95Q517-390 527.79-379q10.78 11 26.72 11Z";
  const YOUTUBE_ACTIVE_SUBTITLE_ICON_PATH = "M21 3H3C2.46 3 1.96 3.21 1.58 3.58C1.21 3.96 1 4.46 1 5V19C1 19.53 1.21 20.03 1.58 20.41C1.96 20.78 2.46 21 3 21H21C21.53 21 22.03 20.78 22.41 20.41C22.78 20.03 23 19.53 23 19V5C23 4.46 22.78 3.96 22.41 3.58C22.03 3.21 21.53 3 21 3ZM6 11H8C8.26 11 8.51 11.10 8.70 11.29C8.89 11.48 9 11.73 9 12C9 12.26 8.89 12.51 8.70 12.70C8.51 12.89 8.26 13 8 13H6C5.73 13 5.48 12.89 5.29 12.70C5.10 12.51 5 12.26 5 12C5 11.73 5.10 11.48 5.29 11.29C5.48 11.10 5.73 11 6 11ZM12 11H18C18.26 11 18.51 11.10 18.70 11.29C18.89 11.48 19 11.73 19 12C19 12.26 18.89 12.51 18.70 12.70C18.51 12.89 18.26 13 18 13H12C11.73 13 11.48 12.89 11.29 12.70C11.10 12.51 11 12.26 11 12C11 11.73 11.10 11.48 11.29 11.29C11.48 11.10 11.73 11 12 11ZM16 15H18C18.26 15 18.51 15.10 18.70 15.29C18.89 15.48 19 15.73 19 16C19 16.26 18.89 16.51 18.70 16.70C18.51 16.89 18.26 17 18 17H16C15.73 17 15.48 16.89 15.29 16.70C15.10 16.51 15 16.26 15 16C15 15.73 15.10 15.48 15.29 15.29C15.48 15.10 15.73 15 16 15ZM6 15H12C12.26 15 12.51 15.10 12.70 15.29C12.89 15.48 13 15.73 13 16C13 16.26 12.89 16.51 12.70 16.70C12.51 16.89 12.26 17 12 17H6C5.73 17 5.48 16.89 5.29 16.70C5.10 16.51 5 16.26 5 16C5 15.73 5.10 15.48 5.29 15.29C5.48 15.10 5.73 15 6 15Z";
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
      loadCaptions: "字幕を読み込む",
      deleteCaptions: "字幕を削除",
      unavailable: "利用不可",
    },
    en: {
      captions: "Subtitles/CC",
      captionsMenu: "Subtitles/CC",
      captionsRow: "Subtitles/CC (1)",
      customTrack: "User-created subtitles",
      off: "Off",
      loadCaptions: "Load captions",
      deleteCaptions: "Delete Caption",
      unavailable: "Unavailable",
    },
  };

  // ── State ─────────────────────────────────────────────────────────────────
  const state = {
    cues: [],
    captionMode: CAPTION_MODE.OFF,
    currentVideoId: "",
    currentPageIsLive: false,
    nativeCaptionsAvailable: false,
    lastKnownNativeTrackLabel: "",
    lastCueIdx: -1,
    pendingCaptionSelection: null,
    renderedBody: null,
    resizeObs: null,
    controlsObs: null,
    controlsObsTarget: null,
    captionTransitionToken: 0,
    controlsSyncFrame: 0,
    menuSyncFrame: 0,
    boundVideo: null,
    routeToken: 0,
    ignoreNextSubtitlesButtonClick: false,
  };
  const SUBTITLES_BUTTON_STASHED_ATTRIBUTES = [
    ["aria-label", "ytsrtOriginalAriaLabel"],
    ["aria-pressed", "ytsrtOriginalAriaPressed"],
    ["title", "ytsrtOriginalTitle"],
    ["data-title-no-tooltip", "ytsrtOriginalDataTitle"],
    ["data-tooltip-title", "ytsrtOriginalTooltipTitle"],
  ];

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

  function getPageLiveState() {
    const root = document.documentElement;
    return {
      isLive: root.getAttribute(LIVE_STATE_ATTR) === "1",
      videoId: root.getAttribute(LIVE_STATE_VIDEO_ID_ATTR) || "",
      ready: root.getAttribute(LIVE_STATE_READY_ATTR) === "1",
    };
  }

  function isCustomCaptionDisabledForCurrentPage() {
    return state.currentPageIsLive;
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

  function gmDelete(key) {
    try { GM_deleteValue(key); } catch { /* ignore */ }
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

  function getStashedAttribute(node, attributeName, datasetKey) {
    if (!node) return null;
    if (datasetKey in node.dataset) {
      const value = node.dataset[datasetKey];
      return value === MISSING_ATTRIBUTE_VALUE ? null : value;
    }
    return node.getAttribute(attributeName);
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
    return hasCustomCaptions() ? t("deleteCaptions") : t("loadCaptions");
  }

  function getCustomRowSummary() {
    if (!hasCustomCaptions()) return t("unavailable");
    return state.captionMode === CAPTION_MODE.CUSTOM ? t("customTrack") : t("off");
  }

  function applyCaptionMode(mode, { persist = true } = {}) {
    const previousMode = state.captionMode;

    if (mode === CAPTION_MODE.CUSTOM && !hasCustomCaptions()) {
      mode = previousMode === CAPTION_MODE.NATIVE ? CAPTION_MODE.NATIVE : CAPTION_MODE.OFF;
    }

    state.captionMode = mode;
    if (persist) persistCustomMode(mode);

    if (mode === CAPTION_MODE.CUSTOM) {
      renderCurrentCue();
    } else {
      renderOverlay("");
    }

    syncSubtitlesButtonState();
    syncLoadButtonState();
    syncCaptionMenuChecks();
    scheduleSyncSettingsUi();
  }

  function syncCaptionModeFromPlayer({ persist = false } = {}) {
    if (
      state.captionMode === CAPTION_MODE.CUSTOM &&
      state.pendingCaptionSelection !== CAPTION_MODE.NATIVE &&
      state.pendingCaptionSelection !== CAPTION_MODE.OFF
    ) {
      return;
    }

    const selection = syncNativeCaptionTrackLabelFromMenu();
    let nextMode = CAPTION_MODE.OFF;

    if (selection.mode === CAPTION_MODE.CUSTOM) {
      nextMode = CAPTION_MODE.CUSTOM;
    } else if (
      selection.mode === CAPTION_MODE.NATIVE ||
      hasVisibleNativeCaptions() ||
      getNativeCaptionsActive()
    ) {
      nextMode = CAPTION_MODE.NATIVE;
    }

    state.captionMode = nextMode;
    state.pendingCaptionSelection = null;
    if (persist) persistCustomMode(state.captionMode);

    if (nextMode !== CAPTION_MODE.CUSTOM) {
      renderOverlay("");
    }

    syncSubtitlesButtonState();
    syncCaptionMenuChecks();
    scheduleSyncSettingsUi();
  }

  function hasVisibleNativeCaptions() {
    return Array.from(
      document.querySelectorAll(
        `${PLAYER_SELECTOR} .caption-window, ${PLAYER_SELECTOR} .ytp-caption-segment`
      )
    ).some((el) => isVisibleElement(el) && normalizeLabelText(el.textContent));
  }

  function getCaptionMenuItemLabelText(item) {
    return item?.querySelector(".ytp-menuitem-label")?.textContent?.trim() || "";
  }

  function isCaptionOffMenuItem(item) {
    return normalizeLabelText(getCaptionMenuItemLabelText(item)) === normalizeLabelText(t("off"));
  }

  function isAutoTranslateMenuItem(item) {
    return normalizeLabelText(getCaptionMenuItemLabelText(item)) === "auto-translate";
  }

  function isCustomCaptionMenuItem(item) {
    return !!item && (
      item.id === CUSTOM_NATIVE_ROW_ID ||
      item.dataset.ytsrtChoice === CAPTION_MODE.CUSTOM
    );
  }

  function getNativeCaptionsAvailability() {
    const button = getSubtitlesButton();
    if (hasVisibleNativeCaptions()) return true;

    const popup = getSettingsPopup();
    const menuTexts = popup
      ? Array.from(popup.querySelectorAll(MENU_ITEM_SELECTOR))
        .map((el) => normalizeLabelText(el.textContent))
      : [];
    if (menuTexts.some((text) =>
      text.includes("subtitles/cc") ||
      text.includes("subtitles") ||
      text.startsWith(normalizeLabelText(t("captionsMenu")))
    )) {
      return true;
    }

    const label = normalizeLabelText(
      getStashedAttribute(button, "aria-label", "ytsrtOriginalAriaLabel") ||
      getStashedAttribute(button, "title", "ytsrtOriginalTitle") ||
      ""
    );
    if (!label) return false;
    if (label.includes("unavailable") || label.includes("利用不可")) return false;
    return true;
  }

  function syncNativeAvailability() {
    state.nativeCaptionsAvailable = getNativeCaptionsAvailability();
  }

  function getNativeCaptionMenuItems(container = findNativeCaptionMenuContainer()) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(MENU_ITEM_SELECTOR)).filter((item) =>
      !item.closest(`#${CUSTOM_PANEL_ID}`) && isNativeCaptionMenuItem(item, container)
    );
  }

  function getCheckedNativeCaptionMenuItem(container = findNativeCaptionMenuContainer()) {
    return getNativeCaptionMenuItems(container).find((item) =>
      item.getAttribute("aria-checked") === "true"
    ) || null;
  }

  function rememberNativeCaptionTrackLabel(label) {
    const normalized = normalizeLabelText(label);
    if (
      !normalized ||
      normalized === normalizeLabelText(t("off")) ||
      normalized === normalizeLabelText(t("customTrack")) ||
      normalized === "auto-translate"
    ) {
      return;
    }

    state.lastKnownNativeTrackLabel = label.trim();
  }

  function getNativeCaptionSelection(container = findNativeCaptionMenuContainer()) {
    const checkedItem = getCheckedNativeCaptionMenuItem(container);
    if (!checkedItem) return { mode: null, label: "" };
    if (isCustomCaptionMenuItem(checkedItem)) {
      return { mode: CAPTION_MODE.CUSTOM, label: t("customTrack") };
    }
    if (isCaptionOffMenuItem(checkedItem)) {
      return { mode: CAPTION_MODE.OFF, label: t("off") };
    }

    const label = getCaptionMenuItemLabelText(checkedItem);
    if (label && !isAutoTranslateMenuItem(checkedItem)) {
      return { mode: CAPTION_MODE.NATIVE, label };
    }
    return { mode: null, label };
  }

  function syncNativeCaptionTrackLabelFromMenu(container = findNativeCaptionMenuContainer()) {
    const selection = getNativeCaptionSelection(container);
    if (selection.mode === CAPTION_MODE.NATIVE) {
      rememberNativeCaptionTrackLabel(selection.label);
    }
    return selection;
  }

  function getNativeCaptionsActive() {
    const selection = syncNativeCaptionTrackLabelFromMenu();
    if (selection.mode === CAPTION_MODE.NATIVE) return true;
    if (selection.mode === CAPTION_MODE.OFF || selection.mode === CAPTION_MODE.CUSTOM) {
      return false;
    }
    if (hasVisibleNativeCaptions()) return true;
    if (state.pendingCaptionSelection === CAPTION_MODE.NATIVE && state.lastKnownNativeTrackLabel) {
      return true;
    }

    const button = getSubtitlesButton();
    if (!button) return false;
    if (!(state.nativeCaptionsAvailable || getNativeCaptionsAvailability())) return false;

    const ariaPressed = button.getAttribute("aria-pressed");
    if (ariaPressed === "true") return true;
    if (ariaPressed === "false") return false;

    return button.classList.contains("ytp-button-active");
  }

  function disableNativeCaptionsFromKnownNativeMode() {
    const button = getSubtitlesButton();
    if (!button) return false;
    state.ignoreNextSubtitlesButtonClick = true;
    button.click();
    return true;
  }

  function waitForCondition(predicate, timeoutMs = 1500, intervalMs = 50) {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const tick = () => {
        if (predicate()) return resolve(true);
        if (Date.now() >= deadline) return resolve(false);
        setTimeout(tick, intervalMs);
      };
      tick();
    });
  }

  function beginCaptionTransition(mode) {
    const transitionToken = ++state.captionTransitionToken;
    state.pendingCaptionSelection = mode;
    scheduleSyncSettingsUi();
    return transitionToken;
  }

  function scheduleCaptionModeSyncFromPlayer({ persist = false, transitionToken = 0 } = {}) {
    setTimeout(() => {
      if (transitionToken && transitionToken !== state.captionTransitionToken) return;
      syncCaptionModeFromPlayer({ persist });
      burstSyncSettingsUi();
    }, 0);
  }

  async function requestCaptionMode(mode, {
    persist = true,
    closeMenu = false,
    syncFromPlayer = false,
    nativeTrackLabel = "",
  } = {}) {
    if (mode === CAPTION_MODE.CUSTOM && !hasCustomCaptions()) return false;

    const transitionToken = beginCaptionTransition(mode);
    if (closeMenu) closeSettingsMenu();

    if (mode !== CAPTION_MODE.CUSTOM) {
      if (mode === CAPTION_MODE.NATIVE && nativeTrackLabel) {
        rememberNativeCaptionTrackLabel(nativeTrackLabel);
      }

      applyCaptionMode(mode, { persist });
      if (syncFromPlayer) {
        scheduleCaptionModeSyncFromPlayer({ persist, transitionToken });
      }
      return true;
    }

    const nativeWasActive = state.captionMode === CAPTION_MODE.NATIVE || getNativeCaptionsActive();
    if (nativeWasActive) {
      disableNativeCaptionsFromKnownNativeMode();
      const disabled = await waitForCondition(() => {
        if (transitionToken !== state.captionTransitionToken) return true;
        const selection = syncNativeCaptionTrackLabelFromMenu();
        return !hasVisibleNativeCaptions() && selection.mode !== CAPTION_MODE.NATIVE;
      }, 2000, 50);

      if (!disabled) {
        console.warn("[ytsrt] native captions remained active while switching to custom");
      }
    }

    if (transitionToken !== state.captionTransitionToken) return false;

    applyCaptionMode(CAPTION_MODE.CUSTOM, { persist });
    state.pendingCaptionSelection = null;
    scheduleSyncSettingsUi();
    return true;
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
    void requestCaptionMode(
      state.captionMode === CAPTION_MODE.CUSTOM ? CAPTION_MODE.OFF : CAPTION_MODE.CUSTOM
    );
  }

  function removeCustomPanel() {
    const panel = getCustomPanel();
    if (panel) panel.remove();
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
    container.replaceChildren();

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
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
    }

    const css = `
      #${OVERLAY_ID} {
        position: absolute;
        left: 50%;
        bottom: ${BOTTOM_PERCENT}%;
        transform: translateX(-50%);
        width: ${MAX_WIDTH_PCT}%;
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
      #${OVERLAY_ID} > span {
        display: inline-block;
        max-width: 100%;
        background: rgba(8, 8, 8, 0.75);
        padding: 0 0.25em;
        border-radius: 0;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
      }
      ${PLAYER_SELECTOR}:not(.ytp-autohide) #${OVERLAY_ID} {
        bottom: 12%;
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
        position: relative;
      }
      ${PLAYER_SELECTOR} .ytp-subtitles-button .ytsrt-custom-subtitles-button-icon {
        display: none;
        position: absolute;
        inset: 0;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        color: currentColor;
      }
      ${PLAYER_SELECTOR} .ytp-subtitles-button .ytsrt-custom-subtitles-button-icon svg {
        width: 24px;
        height: 24px;
        fill: currentColor;
      }
      ${PLAYER_SELECTOR} .ytp-subtitles-button.ytsrt-subtitles-custom-active .ytp-subtitles-button-icon > svg {
        visibility: hidden;
      }
      ${PLAYER_SELECTOR} .ytp-subtitles-button.ytsrt-subtitles-custom-active .ytsrt-custom-subtitles-button-icon {
        display: inline-flex;
        visibility: visible;
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
    if (style.textContent !== css) style.textContent = css;
    if (style.parentElement !== document.head) document.head.appendChild(style);
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
    const sourceIcon = getSubtitlesButtonIconContainer(button);
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

  function createYouTubeActiveSubtitleIcon() {
    const svg = createSvgIcon(YOUTUBE_ACTIVE_SUBTITLE_ICON_PATH, "0 0 24 24");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "24");
    svg.setAttribute("fill", "currentColor");
    const path = svg.querySelector("path");
    if (path) path.setAttribute("fill", "currentColor");
    return svg;
  }

  function getSubtitlesButtonIconContainer(button = getSubtitlesButton()) {
    return button?.querySelector(".ytp-subtitles-button-icon") || null;
  }

  function getCustomSubtitlesButtonIcon(button = getSubtitlesButton()) {
    return button?.querySelector(".ytsrt-custom-subtitles-button-icon") || null;
  }

  function removeCustomSubtitlesButtonIcon(button = getSubtitlesButton()) {
    const overlay = getCustomSubtitlesButtonIcon(button);
    if (overlay) overlay.remove();
  }

  function syncSubtitlesButtonIcon(button = getSubtitlesButton(), customActive = false) {
    if (!button) return;

    if (!customActive) {
      removeCustomSubtitlesButtonIcon(button);
      return;
    }

    if (getCustomSubtitlesButtonIcon(button)) return;

    const overlay = document.createElement("span");
    overlay.className = "ytsrt-custom-subtitles-button-icon";
    overlay.setAttribute("aria-hidden", "true");
    overlay.appendChild(createYouTubeActiveSubtitleIcon());
    button.appendChild(overlay);
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
    contentNode.replaceChildren();

    const summary = document.createElement("span");
    summary.className = "ytsrt-menuitem-status";
    summary.textContent = text;
    contentNode.appendChild(summary);
    arrowNodes.forEach((node) => contentNode.appendChild(node));
  }

  function replaceMenuItemIcon(item, iconNode) {
    const icon = item?.querySelector(".ytp-menuitem-icon");
    if (!icon) return;
    icon.replaceChildren();
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
      "-30 -960 1020 960",
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
      if (hasCustomCaptions()) deleteCustomCaptions();
      else openFilePicker();
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

  function stashManagedSubtitlesButtonAttributes(button) {
    SUBTITLES_BUTTON_STASHED_ATTRIBUTES.forEach(([attributeName, datasetKey]) => {
      stashAttribute(button, attributeName, datasetKey);
    });
  }

  function restoreManagedSubtitlesButtonAttributes(button) {
    SUBTITLES_BUTTON_STASHED_ATTRIBUTES.forEach(([attributeName, datasetKey]) => {
      restoreStashedAttribute(button, attributeName, datasetKey);
    });
  }

  function hasManagedSubtitlesButtonState(button) {
    if (!button) return false;
    return button.dataset.ytsrtManaged === "1" ||
      button.dataset.ytsrtForcedActive === "1" ||
      !!getCustomSubtitlesButtonIcon(button) ||
      SUBTITLES_BUTTON_STASHED_ATTRIBUTES.some(([, datasetKey]) => datasetKey in button.dataset);
  }

  function syncForcedSubtitlesButtonActiveState(button, active, resetActiveClass = false) {
    if (active) {
      if (!button.classList.contains("ytp-button-active")) {
        button.dataset.ytsrtForcedActive = "1";
        button.classList.add("ytp-button-active");
      }
      return;
    }

    if (button.dataset.ytsrtForcedActive !== "1") return;
    if (resetActiveClass || state.captionMode === CAPTION_MODE.OFF) {
      button.classList.remove("ytp-button-active");
    }
    delete button.dataset.ytsrtForcedActive;
  }

  function applyManagedSubtitlesButtonState(button, customActive) {
    const active = state.captionMode !== CAPTION_MODE.OFF;
    button.dataset.ytsrtManaged = "1";
    stashManagedSubtitlesButtonAttributes(button);
    button.setAttribute("aria-label", t("captions"));
    button.setAttribute("title", t("captions"));
    button.setAttribute("data-title-no-tooltip", t("captions"));
    button.setAttribute("data-tooltip-title", t("captions"));
    button.disabled = false;
    button.removeAttribute("disabled");
    button.setAttribute("aria-disabled", "false");
    button.removeAttribute("aria-hidden");
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.classList.remove("ytp-button-disabled");
    button.tabIndex = 0;
    syncSubtitlesButtonIcon(button, customActive);
    syncForcedSubtitlesButtonActiveState(button, active);
  }

  function restoreManagedSubtitlesButtonState(button, { resetActiveClass = false } = {}) {
    syncSubtitlesButtonIcon(button);
    syncForcedSubtitlesButtonActiveState(button, false, resetActiveClass);
    restoreManagedSubtitlesButtonAttributes(button);
    button.removeAttribute("aria-disabled");
    delete button.dataset.ytsrtManaged;
  }

  function syncLoadButtonState(button = getLoadButton()) {
    if (!button) return;
    const label = getLoadButtonLabel();
    button.setAttribute("aria-label", label);
    button.dataset.titleNoTooltip = label;
    const loaded = hasCustomCaptions();
    button.classList.toggle("--loaded", loaded);
    const path = button.querySelector(".ytsrt-load-button__icon path");
    if (path) {
      const desired = loaded ? DELETE_BUTTON_SVG_PATH : LOAD_BUTTON_SVG_PATH;
      if (path.getAttribute("d") !== desired) path.setAttribute("d", desired);
    }
    syncTooltipState();

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
      applyManagedSubtitlesButtonState(button, customActive);
    } else if (hasManagedSubtitlesButtonState(button)) {
      restoreManagedSubtitlesButtonState(button);
    }
  }

  function ensureLoadButton() {
    if (!isVideoPage() || isCustomCaptionDisabledForCurrentPage()) return null;

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
    syncSubtitlesButtonState();
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
    state.controlsObs.observe(player, { childList: true, subtree: true });
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
      subtitlesButton.classList.remove(
        "ytsrt-subtitles-ready",
        "ytsrt-subtitles-custom-active"
      );
      restoreManagedSubtitlesButtonState(subtitlesButton, { resetActiveClass: true });
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
      inner.replaceChildren();
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

  function hasInjectedSettingsMenuContent(popup = getSettingsPopup()) {
    return !!popup?.querySelector(
      `#${CUSTOM_TOP_ROW_ID}, #${CUSTOM_NATIVE_ROW_ID}, #${CUSTOM_PANEL_ID}`
    );
  }

  function stashInlineWidth(el) {
    if (!el || "ytsrtOriginalInlineWidth" in el.dataset) return;
    el.dataset.ytsrtOriginalInlineWidth = el.style.width || MISSING_ATTRIBUTE_VALUE;
  }

  function restoreInlineWidth(el) {
    if (!el || !("ytsrtOriginalInlineWidth" in el.dataset)) return;

    const originalWidth = el.dataset.ytsrtOriginalInlineWidth;
    if (originalWidth === MISSING_ATTRIBUTE_VALUE) {
      el.style.removeProperty("width");
    } else {
      el.style.width = originalWidth;
    }
    delete el.dataset.ytsrtOriginalInlineWidth;
  }

  function restoreSettingsPopupWidth(popup = getSettingsPopup()) {
    if (!popup) return;
    restoreInlineWidth(popup);
    popup.querySelectorAll(".ytp-panel").forEach(restoreInlineWidth);
  }

  function getOriginalInlineWidth(el, fallbackWidth = 0) {
    if (!el) return fallbackWidth;

    const originalWidth = el.dataset.ytsrtOriginalInlineWidth;
    if (originalWidth && originalWidth !== MISSING_ATTRIBUTE_VALUE) {
      return Number.parseFloat(originalWidth) || fallbackWidth;
    }
    return Number.parseFloat(el.style.width) || fallbackWidth;
  }

  function syncSettingsPopupWidth(popup = getSettingsPopup()) {
    if (!popup || !isVisibleElement(popup)) return;

    if (!hasInjectedSettingsMenuContent(popup)) {
      restoreSettingsPopupWidth(popup);
      return;
    }

    const widestMenu = Array.from(popup.querySelectorAll(".ytp-panel-menu"))
      .filter(isVisibleElement)
      .reduce((widest, menu) => {
        const width = menu.getBoundingClientRect().width;
        return width > widest.width ? { menu, width } : widest;
      }, { menu: null, width: 0 });
    if (!widestMenu.menu) return;

    const panel = widestMenu.menu.closest(".ytp-panel");
    const popupWidth = popup.getBoundingClientRect().width;
    const baseWidth = getOriginalInlineWidth(popup, popupWidth);
    const targetWidth = Math.ceil(Math.max(baseWidth, widestMenu.width));
    const currentWidth = Math.ceil(popupWidth);
    if (
      targetWidth === currentWidth &&
      (!panel || targetWidth === Math.ceil(panel.getBoundingClientRect().width))
    ) {
      return;
    }

    stashInlineWidth(popup);
    popup.style.width = `${targetWidth}px`;

    if (panel) {
      stashInlineWidth(panel);
      panel.style.width = `${targetWidth}px`;
    }

    Array.from(popup.querySelectorAll(".ytp-panel"))
      .filter((candidate) => candidate !== panel)
      .forEach(restoreInlineWidth);
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

  function normalizeCaptionsMenuLabel(text) {
    return normalizeLabelText(text)
      .replace(/\s*[\(\uFF08]\s*\d+\s*[\)\uFF09]\s*$/u, "")
      .trim();
  }

  function isCaptionsMenuLabel(text) {
    const normalized = normalizeCaptionsMenuLabel(text);
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
    if (!isCaptionsMenuLabel(getActivePanelTitleText(popup))) return null;

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
      void requestCaptionMode(CAPTION_MODE.OFF, { closeMenu: true });
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
      void requestCaptionMode(CAPTION_MODE.CUSTOM, { closeMenu: true });
    });

    list.appendChild(offItem);
    list.appendChild(customItem);
    panel.appendChild(list);
    popup.appendChild(panel);
    syncSettingsPopupWidth(popup);
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
      void requestCaptionMode(CAPTION_MODE.CUSTOM, { closeMenu: true });
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
  }

  function mountNativeCustomRow(container) {
    if (!container || document.getElementById(CUSTOM_NATIVE_ROW_ID)) return;
    const row = buildNativeCustomRow();
    container.appendChild(row);
    syncCaptionMenuChecks(container);
  }

  function getMenuItemLabel(item) {
    return normalizeLabelText(item?.querySelector(".ytp-menuitem-label")?.textContent || "");
  }

  function isNativeCaptionsTopRow(item) {
    return isCaptionsMenuLabel(getMenuItemLabel(item));
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

  function isNativeCaptionMenuItem(item, container = findNativeCaptionMenuContainer()) {
    return !!container &&
      item?.parentElement === container &&
      item.getAttribute("role") === "menuitemradio" &&
      isVisibleElement(item);
  }

  function syncTopLevelCaptionsSummary(popup = getSettingsPopup()) {
    if (!popup || !isVisibleElement(popup)) return;
    const row = findNativeCaptionsTopRow(popup);
    const content = row?.querySelector(".ytp-menuitem-content");
    if (!content) return;

    const customSummary = normalizeLabelText(t("customTrack"));
    const liveSummary = getMenuItemSummaryText(content);
    if (liveSummary && normalizeLabelText(liveSummary) !== customSummary) {
      content.dataset.ytsrtOriginalText = liveSummary;
    }

    const desiredMode = state.pendingCaptionSelection || state.captionMode;
    const selection = syncNativeCaptionTrackLabelFromMenu();

    if (hasCustomCaptions() && desiredMode === CAPTION_MODE.CUSTOM) {
      setMenuItemSummaryText(content, t("customTrack"));
      return;
    }

    if (selection.mode === CAPTION_MODE.NATIVE) {
      setMenuItemSummaryText(content, selection.label);
      content.dataset.ytsrtOriginalText = selection.label;
      return;
    }

    if (desiredMode === CAPTION_MODE.NATIVE && state.lastKnownNativeTrackLabel) {
      setMenuItemSummaryText(content, state.lastKnownNativeTrackLabel);
      content.dataset.ytsrtOriginalText = state.lastKnownNativeTrackLabel;
      return;
    }

    if (selection.mode === CAPTION_MODE.OFF) {
      setMenuItemSummaryText(content, t("off"));
      content.dataset.ytsrtOriginalText = t("off");
      return;
    }

    if (
      content.dataset.ytsrtOriginalText &&
      normalizeLabelText(content.dataset.ytsrtOriginalText) !== customSummary
    ) {
      setMenuItemSummaryText(content, content.dataset.ytsrtOriginalText);
    }
  }

  function syncCaptionMenuChecks(container = findNativeCaptionMenuContainer()) {
    if (!container) return;
    const desiredMode = state.pendingCaptionSelection || state.captionMode;
    const selection = syncNativeCaptionTrackLabelFromMenu(container);
    const desiredNativeLabel = selection.mode === CAPTION_MODE.NATIVE
      ? selection.label
      : state.lastKnownNativeTrackLabel;

    for (const item of getNativeCaptionMenuItems(container)) {
      let checked = false;

      if (isCustomCaptionMenuItem(item)) {
        checked = desiredMode === CAPTION_MODE.CUSTOM;
      } else if (desiredMode === CAPTION_MODE.OFF) {
        checked = isCaptionOffMenuItem(item);
      } else if (desiredMode === CAPTION_MODE.NATIVE && desiredNativeLabel) {
        checked = (
          !isCaptionOffMenuItem(item) &&
          !isAutoTranslateMenuItem(item) &&
          normalizeLabelText(getCaptionMenuItemLabelText(item)) ===
            normalizeLabelText(desiredNativeLabel)
        );
      }

      item.setAttribute("aria-checked", checked ? "true" : "false");
    }
  }

  function syncSettingsUi() {
    const popup = getSettingsPopup();
    removeStaleInjectedRows();
    if (!popup || !isVisibleElement(popup)) {
      removeCustomPanel();
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
    syncSettingsPopupWidth(popup);
  }

  function removeStaleInjectedRows() {
    const popup = getSettingsPopup();
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

    if (!hasInjectedSettingsMenuContent(popup)) {
      restoreSettingsPopupWidth(popup);
    }
  }

  function onMenuItemActivated(item) {
    if (!item) return false;

    if (item.id === CUSTOM_TOP_ROW_ID) {
      renderCustomSubmenu();
      return true;
    }

    if (item.dataset.ytsrtChoice === CAPTION_MODE.CUSTOM) {
      void requestCaptionMode(CAPTION_MODE.CUSTOM, { closeMenu: true });
      return true;
    }

    if (item.dataset.ytsrtChoice === CAPTION_MODE.OFF) {
      void requestCaptionMode(CAPTION_MODE.OFF, { closeMenu: true });
      return true;
    }

    const nativeCaptionContainer = findNativeCaptionMenuContainer();
    if (
      hasCustomCaptions() &&
      getNativeCaptionsAvailability() &&
      isNativeCaptionMenuItem(item, nativeCaptionContainer)
    ) {
      if (isAutoTranslateMenuItem(item)) {
        return false;
      }

      if (isCaptionOffMenuItem(item)) {
        void requestCaptionMode(CAPTION_MODE.OFF, {
          persist: false,
          syncFromPlayer: true,
        });
      } else {
        void requestCaptionMode(CAPTION_MODE.NATIVE, {
          persist: false,
          syncFromPlayer: true,
          nativeTrackLabel: getCaptionMenuItemLabelText(item),
        });
      }
    }
    return false;
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
  async function loadCaptionText(raw, {
    persist = false,
    persistVideoId = state.currentVideoId,
    enableAfterLoad = false,
    routeToken = state.routeToken,
  } = {}) {
    if (isCustomCaptionDisabledForCurrentPage()) return false;

    const cues = parseCaption(raw);
    if (!cues.length) return false;

    applyCueState(cues);

    if (persist && persistVideoId) {
      gmSet(CAPTION_KEY_PREFIX + persistVideoId, raw);
    }

    if (
      !await waitForCondition(() => getPlayer() && getVideo(), 10000, 150) ||
      routeToken !== state.routeToken ||
      isCustomCaptionDisabledForCurrentPage()
    ) {
      return true;
    }

    ensureLoadButton();
    ensureOverlay();
    bindVideoListeners();
    applyCaptionMode(
      enableAfterLoad
        ? CAPTION_MODE.CUSTOM
        : state.captionMode === CAPTION_MODE.NATIVE
          ? CAPTION_MODE.NATIVE
          : getStoredCustomMode(),
      {
      persist: false,
      }
    );
    renderCurrentCue();
    return true;
  }

  function deleteCustomCaptions() {
    const videoId = state.currentVideoId;
    if (videoId) gmDelete(CAPTION_KEY_PREFIX + videoId);
    applyCueState([]);
    applyCaptionMode(CAPTION_MODE.OFF, { persist: true });
  }

  function openFilePicker() {
    if (isCustomCaptionDisabledForCurrentPage()) return;

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
        if (
          routeToken !== state.routeToken ||
          videoId !== state.currentVideoId ||
          isCustomCaptionDisabledForCurrentPage()
        ) {
          return;
        }

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
    state.captionTransitionToken += 1;
    state.currentVideoId = "";
    state.currentPageIsLive = false;
    state.lastKnownNativeTrackLabel = "";
    state.nativeCaptionsAvailable = false;
    state.pendingCaptionSelection = null;
  }

  async function handleRouteChange() {
    const routeToken = ++state.routeToken;
    detach();

    if (!isVideoPage()) return;

    const videoId = getVideoId();
    if (!videoId) return;

    state.currentVideoId = videoId;
    const ready = await waitForCondition(() => getPlayer() && getVideo(), 10000, 150);
    if (!ready || routeToken !== state.routeToken || videoId !== getVideoId()) return;

    const liveReady = await waitForCondition(() => {
      const liveState = getPageLiveState();
      return liveState.videoId === videoId && liveState.ready;
    }, 3000, 50);
    const pageIsLive = liveReady && getPageLiveState().isLive;
    if (routeToken !== state.routeToken || videoId !== getVideoId()) return;

    state.currentPageIsLive = pageIsLive;
    if (state.currentPageIsLive) return;

    ensureLoadButton();
    bindVideoListeners();
    syncCaptionModeFromPlayer();

    const saved = gmGet(CAPTION_KEY_PREFIX + videoId, null);
    if (!saved) return;

    if (routeToken !== state.routeToken) return;

    await loadCaptionText(saved, {
      enableAfterLoad: getStoredCustomMode() === CAPTION_MODE.CUSTOM,
      routeToken,
    });
  }

  // ── Events / shortcuts ────────────────────────────────────────────────────
  function onDocumentClick(e) {
    if (!isVideoPage() || isCustomCaptionDisabledForCurrentPage()) return;

    const subtitlesButton = e.target.closest(SUBTITLES_BUTTON_SELECTOR);
    if (subtitlesButton) {
      if (state.ignoreNextSubtitlesButtonClick) {
        state.ignoreNextSubtitlesButtonClick = false;
        return;
      }
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
      const consumed = onMenuItemActivated(menuItem);
      if (consumed) {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
      }
      burstSyncSettingsUi();
      return;
    }
  }

  function registerShortcuts() {
    document.addEventListener("click", onDocumentClick, true);

    document.addEventListener("keydown", (e) => {
      if (
        !isVideoPage() ||
        isCustomCaptionDisabledForCurrentPage() ||
        isEditableTarget()
      ) {
        return;
      }

      const altOnly = e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey;
      const plainC = !e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyC";

      if (plainC && hasCustomCaptions()) {
        e.preventDefault();
        e.stopPropagation();
        togglePrimaryCaptions();
        return;
      }

      if (!altOnly) return;

      if (altOnly && e.code === "KeyC") {
        e.preventDefault();
        e.stopPropagation();
        if (hasCustomCaptions()) deleteCustomCaptions();
        else openFilePicker();
      }
    }, true);
  }

  // ── Startup ───────────────────────────────────────────────────────────────
  function injectPageLiveStateReader() {
    const script = document.createElement("script");
    script.textContent = `
(() => {
  const LIVE_ATTR = ${JSON.stringify(LIVE_STATE_ATTR)};
  const VIDEO_ID_ATTR = ${JSON.stringify(LIVE_STATE_VIDEO_ID_ATTR)};
  const READY_ATTR = ${JSON.stringify(LIVE_STATE_READY_ATTR)};
  const INSTALL_KEY = "__ytsrtLiveStateReaderInstalled";

  if (window[INSTALL_KEY]) {
    return;
  }
  window[INSTALL_KEY] = true;

  function getVideoIdFromUrl() {
    const q = new URLSearchParams(location.search).get("v");
    if (q) return q;
    const m = location.pathname.match(/^\\/(?:live|embed)\\/([^/?#]+)/);
    return m ? m[1] : "";
  }

  function getPlayerResponse() {
    const player = document.querySelector("#movie_player");
    if (typeof player?.getPlayerResponse === "function") {
      try {
        const response = player.getPlayerResponse();
        if (response) return response;
      } catch {
        // Keep the page bridge silent.
      }
    }
    return window.ytInitialPlayerResponse || null;
  }

  function syncLiveState() {
    const response = getPlayerResponse();
    const liveDetails = response?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
    const videoId = response?.videoDetails?.videoId || getVideoIdFromUrl();
    const isLiveNow = liveDetails?.isLiveNow === true;

    document.documentElement.setAttribute(LIVE_ATTR, isLiveNow ? "1" : "0");
    document.documentElement.setAttribute(READY_ATTR, response ? "1" : "0");
    if (videoId) {
      document.documentElement.setAttribute(VIDEO_ID_ATTR, videoId);
    } else {
      document.documentElement.removeAttribute(VIDEO_ID_ATTR);
    }
  }

  function scheduleLiveStateSync() {
    syncLiveState();
    setTimeout(syncLiveState, 250);
    setTimeout(syncLiveState, 1000);
    setTimeout(syncLiveState, 2000);
    setTimeout(syncLiveState, 3000);
  }

  scheduleLiveStateSync();
  window.addEventListener("yt-navigate-finish", scheduleLiveStateSync);
  window.addEventListener("yt-page-data-updated", scheduleLiveStateSync);
})();`;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  function start() {
    injectPageLiveStateReader();
    registerShortcuts();
    handleRouteChange();
    window.addEventListener("yt-navigate-finish", handleRouteChange);
  }

  start();
})();
