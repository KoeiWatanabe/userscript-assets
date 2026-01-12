// ==UserScript==
// @name         YouTube Audio Mode
// @namespace    https://tampermonkey.net/
// @version      1.0.0
// @description  Per-video audio mode with blurred video frame background. Toggle with "A". 144p enforced.
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeAudioMode/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeAudioMode/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeAudioMode/icon_128.png
// ==/UserScript==

(() => {
  "use strict";

  /* ================== 設定 ================== */

  const TOGGLE_KEY = "a";

  const SEEK_SECONDS = 10;

  // 🔧 フレーム取得間隔（ミリ秒）
  // 例: 5000 = 5秒 / 10000 = 10秒
  const FRAME_CAPTURE_INTERVAL_MS = 10_000;

  // 🔧 キャプチャ用キャンバス横幅（小さいほど軽い）
  const FRAME_CAPTURE_WIDTH = 320;

  // 144p
  const TARGET_QUALITY = "tiny";

  /* ========================================== */

  let enabled = false;
  let overlayEl = null;
  let frameTimer = null;
  let uiTimer = null;
  let lastVideoId = null;

  /* ---------- Utils ---------- */

  function isTyping(el) {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    if (["input", "textarea", "select"].includes(tag)) return true;
    if (el.isContentEditable) return true;
    return !!el.closest?.('[contenteditable="true"]');
  }

  function getVideo() {
    return document.querySelector("video.html5-main-video");
  }

  function getPlayer() {
    return document.querySelector("#movie_player");
  }

  function getVideoId() {
    try {
      return new URL(location.href).searchParams.get("v");
    } catch {
      return null;
    }
  }

  function formatTime(sec) {
    sec = Math.max(0, sec | 0);
    const m = (sec / 60) | 0;
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  /* ---------- Quality ---------- */

  function set144p() {
    const p = getPlayer();
    if (!p) return;
    try {
      p.setPlaybackQualityRange?.(TARGET_QUALITY);
      p.setPlaybackQuality?.(TARGET_QUALITY);
    } catch {}
  }

  /* ---------- Styles ---------- */

  function injectStyles() {
    if (document.getElementById("tm-audio-mode-style")) return;

    const style = document.createElement("style");
    style.id = "tm-audio-mode-style";
    style.textContent = `
      .tm-audio-overlay {
        position:absolute;
        inset:0;
        z-index:9999;
        display:none;
        user-select:none;
      }

      .tm-audio-canvas {
        position:absolute;
        inset:0;
        width:100%;
        height:100%;
        transform:scale(1.06);
        filter:blur(14px);
      }

      .tm-audio-dim {
        position:absolute;
        inset:0;
        background:rgba(0,0,0,.35);
      }

      .tm-audio-controls {
        position:absolute;
        top:50%;
        left:50%;
        transform:translate(-50%,-50%);
        display:flex;
        gap:14px;
        pointer-events:none;
      }

      .tm-btn {
        pointer-events:auto;
        width:64px;
        height:64px;
        border-radius:50%;
        background:rgba(0,0,0,.35);
        border:1px solid rgba(255,255,255,.3);
        cursor:pointer;
        display:grid;
        place-items:center;
      }

      .tm-btn svg {
        width:30px;
        height:30px;
        fill:#fff;
      }

      .tm-audio-bottom {
        position:absolute;
        left:12px;
        right:12px;
        bottom:10px;
        display:flex;
        justify-content:space-between;
        font-size:12px;
        color:#fff;
        pointer-events:none;
      }
    `;
    document.documentElement.appendChild(style);
  }

  /* ---------- SVG ---------- */

  const svgPlay = () =>
    `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
  const svgPause = () =>
    `<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>`;
  const svgBack = () =>
    `<svg viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6L11 18zm1-6 9.5 6V6L12 12z"/></svg>`;
  const svgFwd = () =>
    `<svg viewBox="0 0 24 24"><path d="M13 6v12l8.5-6L13 6zM12 12 2.5 6v12L12 12z"/></svg>`;

  /* ---------- Overlay ---------- */

  function createOverlay() {
    injectStyles();

    const root = document.createElement("div");
    root.className = "tm-audio-overlay";

    const canvas = document.createElement("canvas");
    canvas.className = "tm-audio-canvas";

    const dim = document.createElement("div");
    dim.className = "tm-audio-dim";

    const ctr = document.createElement("div");
    ctr.className = "tm-audio-controls";

    const btnBack = makeBtn(svgBack(), () => seek(-SEEK_SECONDS));
    const btnPlay = makeBtn(svgPlay(), togglePlay);
    const btnFwd  = makeBtn(svgFwd(),  () => seek(SEEK_SECONDS));

    ctr.append(btnBack, btnPlay, btnFwd);

    const bottom = document.createElement("div");
    bottom.className = "tm-audio-bottom";

    const time = document.createElement("div");
    const label = document.createElement("div");
    label.textContent = "Audio Mode";

    bottom.append(label, time);

    root.append(canvas, dim, ctr, bottom);

    root._canvas = canvas;
    root._time = time;
    root._playBtn = btnPlay;

    return root;
  }

  function makeBtn(svg, fn) {
    const b = document.createElement("button");
    b.className = "tm-btn";
    b.innerHTML = svg;
    b.onclick = (e) => {
      e.stopPropagation();
      fn();
    };
    return b;
  }

  /* ---------- Playback ---------- */

  function togglePlay() {
    const v = getVideo();
    if (!v) return;
    v.paused ? v.play() : v.pause();
    updateUI();
  }

  function seek(sec) {
    const v = getVideo();
    if (!v) return;
    v.currentTime += sec;
    updateUI();
  }

  function updateUI() {
    const v = getVideo();
    if (!v || !overlayEl) return;

    overlayEl._time.textContent =
      `${formatTime(v.currentTime)} / ${formatTime(v.duration || 0)}`;

    overlayEl._playBtn.innerHTML = v.paused ? svgPlay() : svgPause();
  }

  /* ---------- Frame Capture ---------- */

  function startFrameCapture() {
    stopFrameCapture();
    captureFrame();
    frameTimer = setInterval(captureFrame, FRAME_CAPTURE_INTERVAL_MS);
  }

  function stopFrameCapture() {
    if (frameTimer) clearInterval(frameTimer);
    frameTimer = null;
  }

  function captureFrame() {
    if (!enabled) return;

    const v = getVideo();
    const c = overlayEl?._canvas;
    if (!v || !c || !v.videoWidth) return;

    const w = FRAME_CAPTURE_WIDTH;
    const h = Math.round((v.videoHeight / v.videoWidth) * w);

    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }

    const ctx = c.getContext("2d", { alpha: false });
    if (!ctx) return;

    try {
      ctx.drawImage(v, 0, 0, w, h);
    } catch {
      // 環境依存で失敗する場合あり → 無視
    }
  }

  /* ---------- Mode Control ---------- */

  function enableAudioMode() {
    enabled = true;
    overlayEl.style.display = "block";
    set144p();
    startFrameCapture();
    startUiTimer();
  }

  function disableAudioMode() {
    enabled = false;
    overlayEl.style.display = "none";
    stopFrameCapture();
    stopUiTimer();
  }

  function toggleMode() {
    enabled ? disableAudioMode() : enableAudioMode();
  }

  function startUiTimer() {
    stopUiTimer();
    uiTimer = setInterval(updateUI, 400);
  }

  function stopUiTimer() {
    if (uiTimer) clearInterval(uiTimer);
    uiTimer = null;
  }

  /* ---------- Init / Attach ---------- */

  function attach() {
    const player = getPlayer();
    if (!player) return;

    if (!overlayEl) overlayEl = createOverlay();

    if (!player.contains(overlayEl)) {
      player.style.position ||= "relative";
      player.appendChild(overlayEl);
    }
  }

  /* ---------- Events ---------- */

  window.addEventListener("keydown", (e) => {
    if (isTyping(e.target)) return;
    if (e.key.toLowerCase() === TOGGLE_KEY) toggleMode();
  });

  window.addEventListener("yt-navigate-finish", () => {
    const vid = getVideoId();
    if (vid !== lastVideoId) {
      lastVideoId = vid;
      disableAudioMode(); // 動画ごとに必ずOFF
      attach();
    }
  });

  /* ---------- Boot ---------- */

  attach();

})();
