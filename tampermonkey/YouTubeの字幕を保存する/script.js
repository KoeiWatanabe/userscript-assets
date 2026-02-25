// ==UserScript==
// @name         YouTubeの字幕を保存する
// @namespace    https://tampermonkey.net/
// @version      0.3.1
// @description  Adds 2 save buttons to YouTube transcript panel header: TXT(with timestamps) and TXT(no timestamps).
// @match        https://www.youtube.com/*
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeの字幕を保存する/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeの字幕を保存する/script.js
// ==/UserScript==

(() => {
  "use strict";

  const BTN_ID_NO_TS = "tm-transcript-save-btn";
  const BTN_ID_WITH_TS = "tm-transcript-save-btn-ts";
  const STYLE_ID = "tm-transcript-save-style";

  // Default save icon (used for no-timestamp TXT)
  const SAVE_ICON_PATH =
    'm732-120 144-144-51-51-57 57v-150h-72v150l-57-57-51 51 144 144ZM588 0v-72h288V0H588ZM264-144q-29 0-50.5-21.5T192-216v-576q0-29 21.5-50.5T264-864h312l192 192v192h-72v-144H528v-168H264v576h264v72H264Zm0-72v-576 576Z';

  // User-provided icon path (timestamped)
  const TS_ICON_PATH =
    'M173-293q-77-77-77-187t77-187q77-77 187-77t187 77q77 77 77 187t-77 187q-77 77-187 77t-187-77Zm594 101L648-311l50-52 33 34v-438h72v437l33-33 51 51-120 120ZM496-343.79q56-55.8 56-136Q552-560 496.21-616q-55.8-56-136-56Q280-672 224-616.21q-56 55.8-56 136Q168-400 223.79-344q55.8 56 136 56Q440-288 496-343.79ZM420-372l51-51-75-75v-126h-72v156l96 96Zm-60-108Z';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function addStyleOnce() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .tm-transcript-save-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        margin: 0 6px;
        padding: 0;
        border: none;
        border-radius: 18px;
        background: transparent;
        color: var(--yt-spec-text-primary);
        cursor: pointer;
        user-select: none;
      }
      .tm-transcript-save-btn:hover { background: rgba(255,255,255,0.14); }
      .tm-transcript-save-btn[data-busy="1"] { opacity: 0.6; cursor: progress; }
      .tm-transcript-save-btn[disabled] { opacity: 0.45; cursor: not-allowed; }
      .tm-transcript-save-btn svg {
        width: 22px;
        height: 22px;
        display: block;
        fill: currentColor;
      }
    `;
    document.head.appendChild(style);
  }

  function sanitizeFilename(name) {
    return (name || "youtube-transcript")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  }

  function getVideoTitle() {
    const h1 = document.querySelector("h1.ytd-watch-metadata yt-formatted-string");
    if (h1?.textContent?.trim()) return h1.textContent.trim();
    const meta = document.querySelector('meta[name="title"]')?.getAttribute("content");
    if (meta?.trim()) return meta.trim();
    if (document.title) return document.title.replace(" - YouTube", "").trim();
    return "youtube-transcript";
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function extractTranscriptText() {
    const container = document.querySelector("#segments-container");
    if (!container) return { ok: false, reason: "segments-container not found" };

    const nodes = container.querySelectorAll(
      "ytd-transcript-segment-renderer yt-formatted-string.segment-text"
    );

    const lines = [];
    nodes.forEach((n) => {
      const t = (n.textContent || "").replace(/\s+/g, " ").trim();
      if (t) lines.push(t);
    });

    if (!lines.length) return { ok: false, reason: "no transcript lines found" };
    return { ok: true, text: lines.join("\n") };
  }

  function parseTimestampToSeconds(ts) {
    // Accepts "SS", "M:SS", "H:MM:SS" (as displayed in YouTube transcript)
    const s = (ts || "").trim();
    if (!s) return null;
    const parts = s.split(":").map((p) => p.trim());
    if (!parts.length || parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
    if (parts.length === 1) return Number(parts[0]);
    if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
    if (parts.length === 3) return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
    return null;
  }

  function extractTranscriptSegments() {
    const container = document.querySelector("#segments-container");
    if (!container) return { ok: false, reason: "segments-container not found" };

    const segs = [];
    const items = container.querySelectorAll("ytd-transcript-segment-renderer");
    items.forEach((item) => {
      const tsNode =
        item.querySelector(".segment-timestamp") ||
        item.querySelector("yt-formatted-string.segment-timestamp") ||
        item.querySelector("#timestamp") ||
        item.querySelector("span");
      const textNode = item.querySelector("yt-formatted-string.segment-text");

      const tsText = (tsNode?.textContent || "").replace(/\s+/g, " ").trim();
      const lineText = (textNode?.textContent || "").replace(/\s+/g, " ").trim();
      if (!lineText) return;

      const seconds = parseTimestampToSeconds(tsText);
      segs.push({ tsText: seconds == null ? "" : tsText, seconds, text: lineText });
    });

    if (!segs.length) return { ok: false, reason: "no transcript segments found" };

    const hasAnyTs = segs.some((s) => typeof s.seconds === "number" && !Number.isNaN(s.seconds));
    return { ok: true, segments: segs, hasAnyTs };
  }

  function buildTimestampedTxt(segments) {
    // Keep YouTube-style timestamps as-is (e.g., 0:12, 1:02:03)
    const lines = segments.map((s) => (s.tsText ? `${s.tsText}\t${s.text}` : s.text));
    return lines.join("\n");
  }

  function findTranscriptHeader() {
    // Transcript が開いてる時にだけ存在する #segments-container を起点に探す
    const segments = document.querySelector("#segments-container");
    if (!segments) return null;

    const panelRoot =
      segments.closest("ytd-engagement-panel-section-list-renderer") ||
      segments.closest("ytd-engagement-panel-section-renderer") ||
      segments.parentElement;

    // あなたのDOM情報: <div id="header" class="... ytd-engagement-panel-title-header-renderer">
    const header =
      panelRoot?.querySelector('ytd-engagement-panel-title-header-renderer #header') ||
      panelRoot?.querySelector("#header.style-scope.ytd-engagement-panel-title-header-renderer") ||
      panelRoot?.querySelector("#header");

    return header || null;
  }

  function makeIconButton({ id, title, ariaLabel, pathD, onClick }) {
    addStyleOnce();
    const btn = document.createElement("button");
    btn.id = id;
    btn.type = "button";
    btn.className = "tm-transcript-save-btn";
    btn.setAttribute("aria-label", ariaLabel);
    btn.title = title;
    btn.innerHTML = `
      <svg viewBox="0 -960 960 960" aria-hidden="true" focusable="false">
        <path d="${pathD}"></path>
      </svg>
    `;

    btn.addEventListener("click", async () => {
      try {
        btn.dataset.busy = "1";
        btn.disabled = true;
        await sleep(50);
        await onClick();
      } finally {
        btn.dataset.busy = "0";
        btn.disabled = false;
      }
    });

    return btn;
  }

  function inject() {
    try {
      const header = findTranscriptHeader();
      if (!header) return;

      // すでにあるなら何もしない
      if (header.querySelector(`#${BTN_ID_WITH_TS}`) || header.querySelector(`#${BTN_ID_NO_TS}`)) return;

      // ︙ のプレースホルダ（あなたが特定したやつ）
      const info = header.querySelector("#information-button");

      const btnWithTs = makeIconButton({
        id: BTN_ID_WITH_TS,
        title: "タイムスタンプありで字幕を保存",
        ariaLabel: "タイムスタンプありで字幕を保存（TXT）",
        pathD: TS_ICON_PATH,
        onClick: async () => {
          const res = extractTranscriptSegments();
          if (!res.ok) {
            alert(
              `トランスクリプトを取得できませんでした：${res.reason}\n（トランスクリプトが開いているか、必要なら少しスクロールして読み込みを完了してから再試行してください）`
            );
            return;
          }
          if (!res.hasAnyTs) {
            alert(
              "タイムスタンプを取得できませんでした。YouTubeのトランスクリプト表示が変わっている可能性があります。"
            );
            return;
          }

          const title = sanitizeFilename(getVideoTitle());
          const txt = buildTimestampedTxt(res.segments);
          downloadText(txt, `${title} - transcript (with timestamps).txt`);
        },
      });

      const btnNoTs = makeIconButton({
        id: BTN_ID_NO_TS,
        title: "タイムスタンプなしで字幕を保存",
        ariaLabel: "タイムスタンプなしで字幕を保存（TXT）",
        pathD: SAVE_ICON_PATH,
        onClick: async () => {
          const res = extractTranscriptText();
          if (!res.ok) {
            alert(
              `トランスクリプトを取得できませんでした：${res.reason}\n（トランスクリプトが開いているか、必要なら少しスクロールして読み込みを完了してから再試行してください）`
            );
            return;
          }

          const title = sanitizeFilename(getVideoTitle());
          downloadText(res.text, `${title} - transcript.txt`);
        },
      });

      // ✅ 指定の順：左から（テキストあり）→（テキストなし）
      const buttons = [btnWithTs, btnNoTs];

      if (info && info.parentElement) {
        // info の直前へまとめて挿入
        buttons.forEach((b) => info.parentElement.insertBefore(b, info));
      } else {
        // フォールバック：ヘッダー末尾へ
        buttons.forEach((b) => header.appendChild(b));
      }
    } catch (e) {
      console.warn("[tm transcript] inject failed:", e);
    }
  }

  function start() {
    const mo = new MutationObserver(() => {
      if (document.querySelector("#segments-container")) inject();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    inject();

    window.addEventListener("yt-navigate-finish", () => {
      setTimeout(inject, 400);
    });
  }

  start();
})();
