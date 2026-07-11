// ==UserScript==
// @name         YouTubeの字幕を保存する
// @namespace    https://tampermonkey.net/
// @version      1.8.5
// @description  Adds 2 save buttons to YouTube transcript panel header. Timestamped save → plain .lrc, no-timestamp save → chaptered .md or plain .txt. Shortcuts: Ctrl+Alt+T (toggle panel) / Alt+T (with timestamps) / Alt+Shift+T (no timestamps). Shorts で押した場合は /watch に遷移してから自動実行。
// @match        https://www.youtube.com/*
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeの字幕を保存する/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeの字幕を保存する/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeの字幕を保存する/icon_128.png
// ==/UserScript==

(() => {
  "use strict";

  const BTN_WITH_TS = "tm-transcript-save-btn-ts";
  const BTN_NO_TS = "tm-transcript-save-btn";
  const STYLE_ID = "tm-transcript-save-style";
  const PENDING_KEY = "tm-transcript-pending-action";
  const PENDING_TTL = 15000;
  const NOTIFY_ICON = "https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeの字幕を保存する/icon_128.png";

  const PANEL_SELECTOR =
    '[target-id="PAmodern_transcript_view"],[target-id="engagement-panel-searchable-transcript"]';
  const SHOW_BUTTON_SELECTOR =
    "ytd-video-description-transcript-section-renderer #primary-button button";
  const SEGMENT = "transcript-segment-view-model";
  const CHAPTER = "timeline-chapter-view-model";
  const TIMESTAMP = ".ytwTranscriptSegmentViewModelTimestamp";
  const TEXT = ".ytAttributedStringHost";
  const CHAPTER_TITLE = ".ytwTimelineChapterViewModelTitle";

  const SAVE_ICON =
    "m732-120 144-144-51-51-57 57v-150h-72v150l-57-57-51 51 144 144ZM588 0v-72h288V0H588ZM264-144q-29 0-50.5-21.5T192-216v-576q0-29 21.5-50.5T264-864h312l192 192v192h-72v-144H528v-168H264v576h264v72H264Zm0-72v-576 576Z";
  const TS_ICON =
    "M173-293q-77-77-77-187t77-187q77-77 187-77t187 77q77 77 77 187t-77 187q-77 77-187 77t-187-77Zm594 101L648-311l50-52 33 34v-438h72v437l33-33 51 51-120 120ZM496-343.79q56-55.8 56-136Q552-560 496.21-616q-55.8-56-136-56Q280-672 224-616.21q-56 55.8-56 136Q168-400 223.79-344q55.8 56 136 56Q440-288 496-343.79ZM420-372l51-51-75-75v-126h-72v156l96 96Zm-60-108Z";

  let lastCheckedVideoId = "";
  let notifyTimer = 0;
  let loadPromise = null;
  let cancelWait = null;

  const norm = (value) => (value || "").replace(/\s+/g, " ").trim();
  const isVideoPage = () =>
    location.pathname.startsWith("/watch") || location.pathname.startsWith("/live/");
  const isShortsPage = () => location.pathname.startsWith("/shorts/");

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .tm-transcript-save-btn {
        display: inline-flex; align-items: center; justify-content: center;
        width: 36px; height: 36px; margin: 0 6px; padding: 0;
        border: 0; border-radius: 50%; background: transparent;
        color: var(--yt-spec-text-primary); cursor: pointer;
      }
      .tm-transcript-save-btn:hover { background: var(--yt-spec-10-percent-layer); }
      .tm-transcript-save-btn svg { width: 22px; height: 22px; fill: currentColor; }
      @keyframes tm-transcript-notify-in {
        0% { opacity: 0; transform: translate(-50%, -100%); }
        5%, 85% { opacity: 1; transform: translate(-50%, 0); }
        100% { opacity: 0; transform: translate(-50%, -100%); }
      }
      .tm-transcript-notify {
        position: absolute; top: 12px; left: 50%; z-index: 2022;
        display: flex; align-items: center; gap: 10px;
        min-width: 260px; max-width: 400px; padding: 10px 14px;
        border-radius: 14px; pointer-events: none;
        color: var(--yt-spec-text-primary);
        background: var(--yt-spec-menu-background);
        box-shadow: 0 4px 24px rgba(0,0,0,.28);
        font-family: Roboto, Arial, sans-serif;
      }
      .tm-transcript-notify.--auto { animation: tm-transcript-notify-in 5s forwards; }
      .tm-transcript-notify__icon { width: 36px; height: 36px; border-radius: 8px; object-fit: cover; }
      .tm-transcript-notify__icon.--fallback { display: grid; place-items: center; color: #fff; background: #f33; font-weight: 700; }
      .tm-transcript-notify__body { display: flex; flex-direction: column; min-width: 0; }
      .tm-transcript-notify__title { font-size: 13px; font-weight: 600; }
      .tm-transcript-notify__msg { font-size: 12px; color: var(--yt-spec-text-secondary); }
      .tm-transcript-notify__time { margin-left: auto; align-self: flex-start; font-size: 11px; color: var(--yt-spec-text-secondary); }
    `;
    document.head.appendChild(style);
  }

  function showNotify(message, stay = false) {
    const player = document.querySelector("#movie_player");
    if (!player) return () => {};
    addStyle();
    player.querySelector(".tm-transcript-notify")?.remove();
    clearTimeout(notifyTimer);

    const banner = document.createElement("div");
    banner.className = `tm-transcript-notify${stay ? "" : " --auto"}`;

    const img = document.createElement("img");
    img.className = "tm-transcript-notify__icon";
    img.src = NOTIFY_ICON;
    img.alt = "";
    img.addEventListener("error", () => {
      const fallback = document.createElement("div");
      fallback.className = "tm-transcript-notify__icon --fallback";
      fallback.textContent = "字";
      img.replaceWith(fallback);
    }, { once: true });

    const body = document.createElement("div");
    body.className = "tm-transcript-notify__body";
    const title = document.createElement("div");
    title.className = "tm-transcript-notify__title";
    title.textContent = "YouTubeの字幕を保存する";
    const text = document.createElement("div");
    text.className = "tm-transcript-notify__msg";
    text.textContent = message;
    body.append(title, text);

    const time = document.createElement("div");
    time.className = "tm-transcript-notify__time";
    time.textContent = "今";
    banner.append(img, body, time);
    player.appendChild(banner);

    const dismiss = () => {
      banner.remove();
      clearTimeout(notifyTimer);
      notifyTimer = 0;
    };
    if (!stay) notifyTimer = setTimeout(dismiss, 5500);
    return dismiss;
  }

  function getVideoId() {
    const queryId = new URLSearchParams(location.search).get("v");
    if (queryId) return queryId;
    return location.pathname.match(/^\/(?:live|shorts|embed)\/([^/?#]+)/)?.[1] || "";
  }

  function getPlayerResponse() {
    try {
      return document.querySelector("#movie_player")?.getPlayerResponse?.() || null;
    } catch {
      return null;
    }
  }

  function getVideoTitle() {
    const id = getVideoId();
    const response = getPlayerResponse();
    if (!id || response?.videoDetails?.videoId === id) {
      const original = response?.microformat?.playerMicroformatRenderer?.title?.simpleText;
      if (original?.trim()) return original.trim();
    }
    return document.title.replace(/ - YouTube$/, "").trim() || "youtube-transcript";
  }

  function sanitizeFilename(name) {
    return name
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  }

  function checkSubtitleAvailability() {
    if (!isVideoPage()) return;
    const videoId = getVideoId();
    if (!videoId || videoId === lastCheckedVideoId) return;

    const response = getPlayerResponse();
    if (response?.videoDetails?.videoId !== videoId || response.videoDetails.isLive) return;
    lastCheckedVideoId = videoId;
    const tracks = response.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks?.length) {
      showNotify("この動画には字幕がありません");
      return;
    }
    showNotify(`字幕あり: ${tracks.map((track) => track.name?.simpleText || track.languageCode).join(", ")}`);
  }

  function findExpandedPanel() {
    for (const panel of document.querySelectorAll(PANEL_SELECTOR)) {
      if (panel.getAttribute("visibility") === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED") return panel;
    }
    return null;
  }

  function findLoadedPanel() {
    let loaded = null;
    for (const panel of document.querySelectorAll(PANEL_SELECTOR)) {
      if (!panel.querySelector(SEGMENT)) continue;
      if (panel.getAttribute("visibility") === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED") return panel;
      loaded ||= panel;
    }
    return loaded;
  }

  function makeButton(id, title, pathData, withTimestamps) {
    const button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.className = "tm-transcript-save-btn";
    button.title = title;
    button.setAttribute("aria-label", title);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 -960 960 960");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    svg.appendChild(path);
    button.appendChild(svg);
    button.addEventListener("click", () => saveTranscript(withTimestamps));
    return button;
  }

  function inject(panel = findLoadedPanel()) {
    if (!panel?.querySelector(SEGMENT)) return;
    const target = panel.querySelector("ytd-engagement-panel-title-header-renderer #action-buttons");
    if (!target || target.querySelector(`#${BTN_WITH_TS},#${BTN_NO_TS}`)) return;

    addStyle();
    const fragment = document.createDocumentFragment();
    fragment.append(
      makeButton(BTN_WITH_TS, "タイムスタンプありで字幕を保存（LRC）", TS_ICON, true),
      makeButton(BTN_NO_TS, "タイムスタンプなしで字幕を保存", SAVE_ICON, false),
    );
    target.appendChild(fragment);
  }

  function waitForTranscript(timeout = 15000) {
    const loaded = findLoadedPanel();
    if (loaded) {
      inject(loaded);
      return Promise.resolve(true);
    }
    if (loadPromise) return loadPromise;

    const videoId = getVideoId();
    const pending = new Promise((resolve) => requestAnimationFrame(resolve))
      .then(() => {
        if (getVideoId() !== videoId) return false;
        const ready = findLoadedPanel();
        if (ready) {
          inject(ready);
          return true;
        }

        const panel = findExpandedPanel() || document.querySelector(PANEL_SELECTOR);
        if (!panel) return false;

        return new Promise((resolve) => {
          let finished = false;
          let timer = 0;
          const observer = new MutationObserver(() => {
            if (panel.querySelector(SEGMENT)) finish(true);
          });
          const finish = (success) => {
            if (finished) return;
            finished = true;
            observer.disconnect();
            clearTimeout(timer);
            if (cancelWait === finish) cancelWait = null;
            if (success) inject(panel);
            resolve(success);
          };

          cancelWait = finish;
          observer.observe(panel, { childList: true, subtree: true });
          if (panel.querySelector(SEGMENT)) finish(true);
          else timer = setTimeout(() => finish(false), timeout);
        });
      });
    loadPromise = pending;
    void pending.finally(() => {
      if (loadPromise === pending) loadPromise = null;
    });
    return pending;
  }

  async function openTranscriptPanel() {
    if (findLoadedPanel()) return true;
    const button = document.querySelector(SHOW_BUTTON_SELECTOR);
    if (!button) return false;
    button.click();
    return waitForTranscript();
  }

  function toggleTranscriptPanel() {
    const expanded = findExpandedPanel();
    if (expanded?.querySelector('h2[aria-label="Transcript"]')) {
      expanded.querySelector("#visibility-button button")?.click();
      return;
    }
    document.querySelector(SHOW_BUTTON_SELECTOR)?.click();
  }

  function formatLrcTimestamp(value) {
    const parts = value.split(":").map(Number);
    if ((parts.length !== 2 && parts.length !== 3) || parts.some(Number.isNaN)) return null;
    const seconds = parts.pop();
    const minutes = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
    return `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.00]`;
  }

  function downloadText(text, filename) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function saveTranscript(withTimestamps) {
    const panel = findLoadedPanel();
    if (!panel) {
      alert("文字起こしを取得できませんでした。文字起こしパネルを開いてから再試行してください。");
      return;
    }

    const lines = [];
    let suffix;
    if (withTimestamps) {
      let timestampCount = 0;
      for (const segment of panel.querySelectorAll(SEGMENT)) {
        const text = norm(segment.querySelector(TEXT)?.textContent);
        if (!text) continue;
        const timestamp = formatLrcTimestamp(norm(segment.querySelector(TIMESTAMP)?.textContent));
        if (timestamp) timestampCount++;
        lines.push(timestamp ? timestamp + text : text);
      }
      if (!timestampCount) {
        alert("タイムスタンプを取得できませんでした。YouTubeの文字起こし表示が変わっている可能性があります。");
        return;
      }
      suffix = " - transcript.lrc";
    } else if (panel.querySelector(CHAPTER)) {
      for (const item of panel.querySelectorAll(`${CHAPTER},${SEGMENT}`)) {
        if (item.matches(CHAPTER)) {
          const title = norm(item.querySelector(CHAPTER_TITLE)?.textContent);
          if (title) lines.push(lines.length ? `\n## ${title}\n` : `## ${title}\n`);
        } else {
          const text = norm(item.querySelector(TEXT)?.textContent);
          if (text) lines.push(text);
        }
      }
      suffix = " - transcript.md";
    } else {
      for (const segment of panel.querySelectorAll(SEGMENT)) {
        const text = norm(segment.querySelector(TEXT)?.textContent);
        if (text) lines.push(text);
      }
      suffix = " - transcript.txt";
    }

    if (!lines.length) {
      alert("文字起こしに保存できる字幕がありませんでした。");
      return;
    }
    const filename = sanitizeFilename(getVideoTitle()) + suffix;
    downloadText(lines.join("\n"), filename);
    showNotify(`字幕を ${filename} として保存しました`);
  }

  async function downloadViaShortcut(withTimestamps) {
    const dismiss = findLoadedPanel() ? null : showNotify("読み込み中…", true);
    const loaded = await openTranscriptPanel();
    dismiss?.();
    if (!loaded) {
      alert("文字起こしを読み込めませんでした。説明欄から「文字起こしを表示」を開けるか確認してください。");
      return;
    }
    saveTranscript(withTimestamps);
  }

  function redirectToWatchAndRun(action) {
    const videoId = getVideoId();
    if (!videoId) {
      alert("動画IDを取得できませんでした。");
      return;
    }
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ action, videoId, time: Date.now() }));
    location.href = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  }

  async function consumePendingAction() {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return;
    sessionStorage.removeItem(PENDING_KEY);

    let pending;
    try {
      pending = JSON.parse(raw);
    } catch {
      return;
    }
    if (
      !isVideoPage() ||
      !pending ||
      Date.now() - pending.time > PENDING_TTL ||
      getVideoId() !== pending.videoId
    ) return;

    if (pending.action === "toggle") {
      const dismiss = showNotify("読み込み中…", true);
      const loaded = await openTranscriptPanel();
      dismiss();
      if (!loaded) alert("文字起こしを読み込めませんでした。");
      return;
    }
    await downloadViaShortcut(pending.action === "save-with-ts");
  }

  function handleShortcut(event) {
    if ((!isVideoPage() && !isShortsPage()) || event.code !== "KeyT") return;
    const active = document.activeElement;
    if (
      active?.matches("input,textarea") ||
      active?.isContentEditable
    ) return;

    const toggle = event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey;
    const withTs = event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey;
    const withoutTs = event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey;
    if (!toggle && !withTs && !withoutTs) return;

    event.preventDefault();
    event.stopPropagation();
    if (isShortsPage()) {
      redirectToWatchAndRun(toggle ? "toggle" : withTs ? "save-with-ts" : "save-no-ts");
    } else if (toggle) {
      toggleTranscriptPanel();
    } else {
      void downloadViaShortcut(withTs);
    }
  }

  function handleClick(event) {
    if (event.target instanceof Element && event.target.closest(SHOW_BUTTON_SELECTOR)) {
      void waitForTranscript();
    }
  }

  function pageReady() {
    cancelWait?.(false);
    inject();
    checkSubtitleAvailability();
    void consumePendingAction();
  }

  document.addEventListener("keydown", handleShortcut);
  document.addEventListener("click", handleClick);
  window.addEventListener("yt-navigate-finish", pageReady);
  pageReady();
})();
