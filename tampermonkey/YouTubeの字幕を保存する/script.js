// ==UserScript==
// @name         YouTubeの字幕を保存する
// @namespace    https://tampermonkey.net/
// @version      0.4.7
// @description  Adds 2 save buttons to YouTube transcript panel header. Shortcuts: Alt+T (with timestamps) / Alt+Shift+T (no timestamps).
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

  // ── New DOM helpers (transcript-segment-view-model) ──────────────────────

  function hasNewTranscript() {
    return !!document.querySelector("transcript-segment-view-model");
  }

  function extractTranscriptTextNew() {
    const segments = document.querySelectorAll("transcript-segment-view-model");
    if (!segments.length) return { ok: false, reason: "transcript-segment-view-model not found" };
    const lines = [];
    segments.forEach((seg) => {
      const textNode = seg.querySelector("span.yt-core-attributed-string");
      const t = (textNode?.textContent || "").replace(/\s+/g, " ").trim();
      if (t) lines.push(t);
    });
    if (!lines.length) return { ok: false, reason: "no transcript lines found" };
    return { ok: true, text: lines.join("\n") };
  }

  function extractTranscriptSegmentsNew() {
    const items = document.querySelectorAll("transcript-segment-view-model");
    if (!items.length) return { ok: false, reason: "transcript-segment-view-model not found" };
    const segs = [];
    items.forEach((item) => {
      const tsNode = item.querySelector(".ytwTranscriptSegmentViewModelTimestamp");
      const textNode = item.querySelector("span.yt-core-attributed-string");
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

  // ── Old DOM helpers (#segments-container) ────────────────────────────────

  function extractTranscriptText() {
    if (hasNewTranscript()) return extractTranscriptTextNew();

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
    if (hasNewTranscript()) return extractTranscriptSegmentsNew();

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

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

  // セグメント未ロード時に "Show transcript" ボタンを自動クリックして待機する
  async function openTranscriptPanel(timeoutMs = 5000) {
    // すでにセグメントが DOM にある場合はそのまま返す
    if (hasNewTranscript() || document.querySelector("#segments-container")) return true;

    // "show transcript" / "トランスクリプトを表示" 等のボタンを探す
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /transcript/i.test(b.textContent.trim())
    );
    if (!btn) return false;

    btn.click();

    // セグメントが DOM に現れるまで最大 timeoutMs 待機
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(100);
      if (hasNewTranscript() || document.querySelector("#segments-container")) {
        // パネルを新たに開いた場合、全セグメントのロード完了を待つ
        await sleep(1000);
        return true;
      }
    }
    return false;
  }

  async function downloadViaShortcut(withTs) {
    const loaded = await openTranscriptPanel();
    if (!loaded) {
      alert(
        "トランスクリプトを読み込めませんでした。\n動画の説明欄から「Show transcript」を先に開いてみてください。"
      );
      return;
    }

    if (withTs) {
      const res = extractTranscriptSegments();
      if (!res.ok) { alert(`取得失敗: ${res.reason}`); return; }
      if (!res.hasAnyTs) { alert("タイムスタンプを取得できませんでした。"); return; }
      const title = sanitizeFilename(getVideoTitle());
      downloadText(buildTimestampedTxt(res.segments), `${title} - transcript (with timestamps).txt`);
    } else {
      const res = extractTranscriptText();
      if (!res.ok) { alert(`取得失敗: ${res.reason}`); return; }
      const title = sanitizeFilename(getVideoTitle());
      downloadText(res.text, `${title} - transcript.txt`);
    }
  }

  function registerShortcuts() {
    document.addEventListener("keydown", (e) => {
      // /watch ページ以外は無視
      if (!location.pathname.startsWith("/watch")) return;

      // テキスト入力中は無視
      const tag = document.activeElement?.tagName?.toUpperCase();
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        document.activeElement?.isContentEditable
      ) return;

      const key = e.key.toLowerCase();
      // Alt+T: タイムスタンプ付きで保存
      const isAltT      = e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && key === "t";
      // Alt+Shift+T: タイムスタンプなしで保存
      const isAltShiftT = e.altKey &&  e.shiftKey && !e.ctrlKey && !e.metaKey && key === "t";

      if (!isAltT && !isAltShiftT) return;

      e.preventDefault();
      e.stopPropagation();
      downloadViaShortcut(isAltT); // isAltT=true → with timestamps
    });
  }

  function buildTimestampedTxt(segments) {
    const lines = segments.map((s) => (s.tsText ? `${s.tsText}\t${s.text}` : s.text));
    return lines.join("\n");
  }

  function findTranscriptHeader() {
    // ── New DOM: transcript-segment-view-model から親パネルをたどる ──
    // visibility属性に依存しないため、セグメントが既にDOMにある場合も対応できる
    const seg = document.querySelector("transcript-segment-view-model");
    if (seg) {
      const panel =
        seg.closest("ytd-engagement-panel-section-list-renderer") ||
        document.querySelector('[target-id="PAmodern_transcript_view"]');
      if (panel) {
        const titleHeader = panel.querySelector("ytd-engagement-panel-title-header-renderer");
        return titleHeader?.querySelector("#header") || null;
      }
    }

    // ── Old DOM: #segments-container based ──
    const segments = document.querySelector("#segments-container");
    if (!segments) return null;

    const panelRoot =
      segments.closest("ytd-engagement-panel-section-list-renderer") ||
      segments.closest("ytd-engagement-panel-section-renderer") ||
      segments.parentElement;

    const header =
      panelRoot?.querySelector("ytd-engagement-panel-title-header-renderer #header") ||
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

    // innerHTML は YouTube の TrustedTypes CSP でブロックされるため DOM API を使う
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 -960 960 960");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    svg.appendChild(path);
    btn.appendChild(svg);

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

      const buttons = [btnWithTs, btnNoTs];

      // 新DOM: #action-buttons に追加（空のコンテナ）
      const actionButtons = header.querySelector("#action-buttons");
      if (actionButtons) {
        buttons.forEach((b) => actionButtons.appendChild(b));
        return;
      }

      // 旧DOM: #information-button の直前に挿入
      const info = header.querySelector("#information-button");
      if (info && info.parentElement) {
        buttons.forEach((b) => info.parentElement.insertBefore(b, info));
        return;
      }

      // フォールバック: #visibility-button の直前に挿入
      const visibilityBtn = header.querySelector("#visibility-button");
      if (visibilityBtn && visibilityBtn.parentElement) {
        buttons.forEach((b) => visibilityBtn.parentElement.insertBefore(b, visibilityBtn));
        return;
      }

      // 最終フォールバック: ヘッダー末尾へ
      buttons.forEach((b) => header.appendChild(b));
    } catch (e) {
      console.warn("[tm transcript] inject failed:", e);
    }
  }

  function start() {
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        // セグメントがDOMに追加された（初回レンダリング）
        if (m.type === "childList") {
          if (
            document.querySelector("#segments-container") ||
            document.querySelector("transcript-segment-view-model")
          ) {
            inject();
            return;
          }
        }
        // パネルのvisibilityが変化した（セグメントが既にDOMにある場合）
        if (
          m.type === "attributes" &&
          m.attributeName === "visibility" &&
          m.target.getAttribute("visibility") === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"
        ) {
          inject();
          return;
        }
      }
    });
    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["visibility"],
    });

    inject();
    registerShortcuts();

    window.addEventListener("yt-navigate-finish", () => {
      setTimeout(inject, 400);
    });
  }

  start();
})();
