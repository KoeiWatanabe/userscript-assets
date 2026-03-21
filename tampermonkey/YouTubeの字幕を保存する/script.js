// ==UserScript==
// @name         YouTubeの字幕を保存する
// @namespace    https://tampermonkey.net/
// @version      1.5.1
// @description  Adds 2 save buttons to YouTube transcript panel header. Chapters → .md with ## headings, no chapters → .txt. Shortcuts: Ctrl+Alt+T (toggle panel) / Alt+T (with timestamps) / Alt+Shift+T (no timestamps).
// @match        https://www.youtube.com/*
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeの字幕を保存する/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeの字幕を保存する/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeの字幕を保存する/icon_128.png
// ==/UserScript==

(() => {
  "use strict";

  const BTN_ID_NO_TS = "tm-transcript-save-btn";
  const BTN_ID_WITH_TS = "tm-transcript-save-btn-ts";
  const STYLE_ID = "tm-transcript-save-style";
  const NOTIFY_ICON = "https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeの字幕を保存する/icon_128.png"; // 通知アイコンURL（null ならデフォルトアイコン）

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
      @keyframes tm-transcript-notify-in {
        0%   { opacity: 0; transform: translate(-50%, -100%); }
        5%   { opacity: 1; transform: translate(-50%, 0); }
        85%  { opacity: 1; transform: translate(-50%, 0); }
        100% { opacity: 0; transform: translate(-50%, -100%); }
      }
      @keyframes tm-transcript-notify-stay {
        0%   { opacity: 0; transform: translate(-50%, -100%); }
        15%  { opacity: 1; transform: translate(-50%, 0); }
        100% { opacity: 1; transform: translate(-50%, 0); }
      }
      .tm-transcript-notify {
        position: absolute;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-radius: 14px;
        padding: 10px 14px;
        pointer-events: none;
        z-index: 2022;
        min-width: 260px;
        max-width: 400px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: -apple-system, BlinkMacSystemFont, "Noto Sans JP", "Helvetica Neue", sans-serif;
      }
      .tm-transcript-notify.--auto {
        animation: tm-transcript-notify-in 5s cubic-bezier(0.32, 0.72, 0, 1) forwards;
      }
      .tm-transcript-notify.--stay {
        animation: tm-transcript-notify-stay 0.6s cubic-bezier(0.32, 0.72, 0, 1) forwards;
      }
      .tm-transcript-notify.--dark {
        background: rgba(30, 30, 30, 0.88);
        box-shadow: 0 4px 24px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(255,255,255,0.1) inset;
      }
      .tm-transcript-notify.--light {
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 4px 24px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.06);
      }
      .tm-transcript-notify__icon-fallback {
        width: 36px; height: 36px;
        border-radius: 8px;
        background: linear-gradient(135deg, #FF3B30, #FF6B6B);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        color: #fff; font-size: 18px; font-weight: bold;
      }
      .tm-transcript-notify__icon-img {
        width: 36px; height: 36px;
        border-radius: 8px;
        object-fit: cover;
        flex-shrink: 0;
      }
      .tm-transcript-notify__body { display: flex; flex-direction: column; gap: 1px; }
      .tm-transcript-notify__title { font-size: 13px; font-weight: 600; letter-spacing: 0.2px; }
      .tm-transcript-notify__msg   { font-size: 12px; font-weight: 400; }
      .tm-transcript-notify__time  { font-size: 11px; margin-left: auto; align-self: flex-start; flex-shrink: 0; }
      .tm-transcript-notify.--dark .tm-transcript-notify__title { color: rgba(255,255,255,0.95); }
      .tm-transcript-notify.--dark .tm-transcript-notify__msg   { color: rgba(255,255,255,0.6); }
      .tm-transcript-notify.--dark .tm-transcript-notify__time  { color: rgba(255,255,255,0.35); }
      .tm-transcript-notify.--light .tm-transcript-notify__title { color: rgba(0,0,0,0.88); }
      .tm-transcript-notify.--light .tm-transcript-notify__msg   { color: rgba(0,0,0,0.5); }
      .tm-transcript-notify.--light .tm-transcript-notify__time  { color: rgba(0,0,0,0.3); }
    `;
    document.head.appendChild(style);
  }

  // ── iOS風通知 ──
  let _notifyTimer = 0;
  /**
   * 通知を表示する。
   * @param {string} message - 通知メッセージ
   * @param {"auto"|"stay"} mode - "auto": 3秒で自動消去, "stay": 手動で消すまで表示
   * @returns {function} dismiss - 通知を消す関数
   */
  function showNotify(message, mode = "auto") {
    addStyleOnce();
    const player = document.querySelector("#movie_player");
    if (!player) return () => {};

    // 既存の通知を除去
    const existing = player.querySelector(".tm-transcript-notify");
    if (existing) existing.remove();
    if (_notifyTimer) { clearTimeout(_notifyTimer); _notifyTimer = 0; }

    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const banner = document.createElement("div");
    banner.className = `tm-transcript-notify --${mode} ` + (isDark ? "--dark" : "--light");

    // アイコン
    if (NOTIFY_ICON) {
      const img = document.createElement("img");
      img.className = "tm-transcript-notify__icon-img";
      img.src = NOTIFY_ICON;
      img.onerror = () => {
        const fallback = document.createElement("div");
        fallback.className = "tm-transcript-notify__icon-fallback";
        fallback.textContent = "\u5B57"; // 「字」
        img.replaceWith(fallback);
      };
      banner.appendChild(img);
    } else {
      const icon = document.createElement("div");
      icon.className = "tm-transcript-notify__icon-fallback";
      icon.textContent = "\u5B57"; // 「字」
      banner.appendChild(icon);
    }

    // テキスト
    const body = document.createElement("div");
    body.className = "tm-transcript-notify__body";
    const title = document.createElement("div");
    title.className = "tm-transcript-notify__title";
    title.textContent = "YouTubeの字幕を保存する";
    const msg = document.createElement("div");
    msg.className = "tm-transcript-notify__msg";
    msg.textContent = message;
    body.appendChild(title);
    body.appendChild(msg);

    // 時刻ラベル
    const time = document.createElement("div");
    time.className = "tm-transcript-notify__time";
    time.textContent = "\u4ECA"; // 「今」

    banner.appendChild(body);
    banner.appendChild(time);
    player.appendChild(banner);

    const dismiss = () => {
      if (banner.parentNode) banner.remove();
      if (_notifyTimer) { clearTimeout(_notifyTimer); _notifyTimer = 0; }
    };

    if (mode === "auto") {
      _notifyTimer = setTimeout(dismiss, 5500);
    }

    return dismiss;
  }

  function sanitizeFilename(name) {
    return (name || "youtube-transcript")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  }

  /**
   * 原語（オリジナル言語）の動画タイトルを返す。
   * ブラウザの表示言語が英語でも、YouTubeの内部データから翻訳前のタイトルを取得する。
   */
  function getVideoTitle() {
    // 1. microformat: SEO/OGP 用データなので原語タイトルが保持されている
    try {
      const micro =
        window.ytInitialPlayerResponse?.microformat?.playerMicroformatRenderer;
      if (micro?.title?.simpleText?.trim()) return micro.title.simpleText.trim();
    } catch (_) {/* ignore */}

    // 2. movie_player の内部レスポンス（SPA遷移後でも更新される）
    try {
      const player = document.getElementById("movie_player");
      const resp = player?.getPlayerResponse?.();
      const micro2 = resp?.microformat?.playerMicroformatRenderer;
      if (micro2?.title?.simpleText?.trim()) return micro2.title.simpleText.trim();
    } catch (_) {/* ignore */}

    // 3. フォールバック: DOM から取得（翻訳済みの場合あり）
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

  // ── Chapter detection ───────────────────────────────────────────────────

  function hasChapters() {
    return !!(
      document.querySelector("timeline-chapter-view-model") ||
      document.querySelector("#segments-container ytd-transcript-section-header-renderer")
    );
  }

  // ── New DOM helpers (transcript-segment-view-model) ──────────────────────

  function hasNewTranscript() {
    return !!document.querySelector("transcript-segment-view-model");
  }

  /**
   * チャプター + 字幕セグメントを DOM 順に取得する（新DOM専用）。
   * 返り値の entries 配列は { type: "chapter"|"segment", ... } の混在リスト。
   */
  function extractTranscriptWithChaptersNew() {
    const items = document.querySelectorAll(
      "timeline-chapter-view-model, transcript-segment-view-model"
    );
    if (!items.length) return { ok: false, reason: "transcript elements not found" };

    const entries = [];
    items.forEach((el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === "timeline-chapter-view-model") {
        const titleEl = el.querySelector(".ytwTimelineChapterViewModelTitle");
        const title = (titleEl?.textContent || "").trim();
        if (title) entries.push({ type: "chapter", title });
      } else {
        const tsNode = el.querySelector(".ytwTranscriptSegmentViewModelTimestamp");
        const textNode = el.querySelector("span.yt-core-attributed-string");
        const tsText = (tsNode?.textContent || "").replace(/\s+/g, " ").trim();
        const lineText = (textNode?.textContent || "").replace(/\s+/g, " ").trim();
        if (!lineText) return;
        const seconds = parseTimestampToSeconds(tsText);
        entries.push({ type: "segment", tsText: seconds == null ? "" : tsText, seconds, text: lineText });
      }
    });

    const hasAnySegment = entries.some((e) => e.type === "segment");
    if (!hasAnySegment) return { ok: false, reason: "no transcript segments found" };

    const hasAnyChapter = entries.some((e) => e.type === "chapter");
    const hasAnyTs = entries.some(
      (e) => e.type === "segment" && typeof e.seconds === "number" && !Number.isNaN(e.seconds)
    );
    return { ok: true, entries, hasAnyChapter, hasAnyTs };
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

  /**
   * チャプター + 字幕セグメントを DOM 順に取得する（旧DOM専用）。
   * ytd-transcript-section-header-renderer をチャプター区切りとして認識する。
   */
  function extractTranscriptWithChaptersOld() {
    const container = document.querySelector("#segments-container");
    if (!container) return { ok: false, reason: "segments-container not found" };

    const items = container.querySelectorAll(
      "ytd-transcript-section-header-renderer, ytd-transcript-segment-renderer"
    );
    if (!items.length) return { ok: false, reason: "transcript elements not found" };

    const entries = [];
    items.forEach((el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === "ytd-transcript-section-header-renderer") {
        const titleEl = el.querySelector("h2") || el.querySelector("span.yt-core-attributed-string");
        const title = (titleEl?.textContent || "").trim();
        if (title) entries.push({ type: "chapter", title });
      } else {
        const tsNode =
          el.querySelector(".segment-timestamp") ||
          el.querySelector("yt-formatted-string.segment-timestamp") ||
          el.querySelector("#timestamp") ||
          el.querySelector("span");
        const textNode = el.querySelector("yt-formatted-string.segment-text");
        const tsText = (tsNode?.textContent || "").replace(/\s+/g, " ").trim();
        const lineText = (textNode?.textContent || "").replace(/\s+/g, " ").trim();
        if (!lineText) return;
        const seconds = parseTimestampToSeconds(tsText);
        entries.push({ type: "segment", tsText: seconds == null ? "" : tsText, seconds, text: lineText });
      }
    });

    const hasAnySegment = entries.some((e) => e.type === "segment");
    if (!hasAnySegment) return { ok: false, reason: "no transcript segments found" };

    const hasAnyChapter = entries.some((e) => e.type === "chapter");
    const hasAnyTs = entries.some(
      (e) => e.type === "segment" && typeof e.seconds === "number" && !Number.isNaN(e.seconds)
    );
    return { ok: true, entries, hasAnyChapter, hasAnyTs };
  }

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

  // Ctrl+Alt+T: トランスクリプトパネルを開閉する
  function toggleTranscriptPanel() {
    const panel = document.querySelector('[target-id="PAmodern_transcript_view"]');
    if (panel?.getAttribute("visibility") === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED") {
      // 開いている → Close ボタンをクリックして閉じる
      const closeBtn = panel.querySelector("#visibility-button button");
      if (closeBtn) closeBtn.click();
    } else {
      // 閉じている → "Show transcript" ボタンを探してクリック
      const showBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        /transcript/i.test(b.textContent.trim())
      );
      if (showBtn) showBtn.click();
    }
  }

  // 現在 DOM にあるセグメント数を返す（新旧DOM両対応）
  function countSegments() {
    return (
      document.querySelectorAll("transcript-segment-view-model").length +
      document.querySelectorAll("#segments-container ytd-transcript-segment-renderer").length
    );
  }

  // セグメント未ロード時に "Show transcript" ボタンを自動クリックして待機する
  async function openTranscriptPanel(timeoutMs = 15000) {
    // すでにセグメントが DOM にある場合はそのまま返す
    if (hasNewTranscript() || document.querySelector("#segments-container")) return true;

    // "show transcript" / "トランスクリプトを表示" 等のボタンを探す
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /transcript/i.test(b.textContent.trim())
    );
    if (!btn) return false;

    btn.click();

    // セグメント数が STABLE_MS の間変化しなくなったらロード完了とみなす
    const POLL_MS   = 200;   // ポーリング間隔
    const STABLE_MS = 600;   // この時間カウントが変わらなければ完了
    const deadline = Date.now() + timeoutMs;
    let lastCount = 0;
    let stableMs  = 0;

    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      const count = countSegments();

      if (count > 0) {
        if (count === lastCount) {
          stableMs += POLL_MS;
          if (stableMs >= STABLE_MS) return true;
        } else {
          stableMs  = 0;
          lastCount = count;
        }
      } else {
        stableMs  = 0;
        lastCount = 0;
      }
    }

    return lastCount > 0;
  }

  async function downloadViaShortcut(withTs) {
    // トランスクリプトが未ロードなら「読み込み中」通知を表示
    const needsLoad = !hasNewTranscript() && !document.querySelector("#segments-container");
    let dismissLoading = null;
    if (needsLoad) {
      dismissLoading = showNotify("読み込み中…", "stay");
    }

    const loaded = await openTranscriptPanel();
    if (dismissLoading) dismissLoading();

    if (!loaded) {
      alert(
        "トランスクリプトを読み込めませんでした。\n動画の説明欄から「Show transcript」を先に開いてみてください。"
      );
      return;
    }

    const title = sanitizeFilename(getVideoTitle());

    // チャプターがある場合は .md 形式で保存
    if (hasChapters()) {
      const res = hasNewTranscript()
        ? extractTranscriptWithChaptersNew()
        : extractTranscriptWithChaptersOld();
      if (!res.ok) { alert(`取得失敗: ${res.reason}`); return; }
      if (withTs && !res.hasAnyTs) { alert("タイムスタンプを取得できませんでした。"); return; }
      const md = buildMarkdownWithChapters(res.entries, withTs);
      const suffix = withTs ? " - transcript (with timestamps).md" : " - transcript.md";
      const filename = `${title}${suffix}`;
      downloadText(md, filename);
      showNotify(`字幕を ${filename} として保存しました`);
      return;
    }

    // チャプターなし → 従来通り .txt 形式
    if (withTs) {
      const res = extractTranscriptSegments();
      if (!res.ok) { alert(`取得失敗: ${res.reason}`); return; }
      if (!res.hasAnyTs) { alert("タイムスタンプを取得できませんでした。"); return; }
      const filename = `${title} - transcript (with timestamps).txt`;
      downloadText(buildTimestampedTxt(res.segments), filename);
      showNotify(`字幕を ${filename} として保存しました`);
    } else {
      const res = extractTranscriptText();
      if (!res.ok) { alert(`取得失敗: ${res.reason}`); return; }
      const filename = `${title} - transcript.txt`;
      downloadText(res.text, filename);
      showNotify(`字幕を ${filename} として保存しました`);
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
      // Ctrl+Alt+T: パネル開閉
      const isCtrlAltT  = e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey && key === "t";
      // Alt+T: タイムスタンプ付きで保存
      const isAltT      = e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && key === "t";
      // Alt+Shift+T: タイムスタンプなしで保存
      const isAltShiftT = e.altKey &&  e.shiftKey && !e.ctrlKey && !e.metaKey && key === "t";

      if (!isCtrlAltT && !isAltT && !isAltShiftT) return;

      e.preventDefault();
      e.stopPropagation();
      if (isCtrlAltT) toggleTranscriptPanel();
      else downloadViaShortcut(isAltT); // isAltT=true → with timestamps
    });
  }

  function buildTimestampedTxt(segments) {
    const lines = segments.map((s) => (s.tsText ? `${s.tsText}\t${s.text}` : s.text));
    return lines.join("\n");
  }

  /**
   * チャプター付き entries からマークダウン文字列を生成する。
   * チャプターは ## 見出し、字幕は本文テキスト。
   */
  function buildMarkdownWithChapters(entries, withTimestamps) {
    const lines = [];
    entries.forEach((e) => {
      if (e.type === "chapter") {
        if (lines.length > 0) lines.push(""); // チャプター前に空行
        lines.push(`## ${e.title}`);
        lines.push(""); // チャプター後に空行
      } else {
        if (withTimestamps && e.tsText) {
          lines.push(`${e.tsText}\t${e.text}`);
        } else {
          lines.push(e.text);
        }
      }
    });
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
          const title = sanitizeFilename(getVideoTitle());
          if (hasChapters()) {
            const res = hasNewTranscript()
              ? extractTranscriptWithChaptersNew()
              : extractTranscriptWithChaptersOld();
            if (!res.ok) { alert(`トランスクリプトを取得できませんでした：${res.reason}\n（トランスクリプトが開いているか、必要なら少しスクロールして読み込みを完了してから再試行してください）`); return; }
            if (!res.hasAnyTs) { alert("タイムスタンプを取得できませんでした。YouTubeのトランスクリプト表示が変わっている可能性があります。"); return; }
            const mdFilename = `${title} - transcript (with timestamps).md`;
            downloadText(buildMarkdownWithChapters(res.entries, true), mdFilename);
            showNotify(`字幕を ${mdFilename} として保存しました`);
            return;
          }
          const res = extractTranscriptSegments();
          if (!res.ok) {
            alert(`トランスクリプトを取得できませんでした：${res.reason}\n（トランスクリプトが開いているか、必要なら少しスクロールして読み込みを完了してから再試行してください）`);
            return;
          }
          if (!res.hasAnyTs) {
            alert("タイムスタンプを取得できませんでした。YouTubeのトランスクリプト表示が変わっている可能性があります。");
            return;
          }
          const tsFilename = `${title} - transcript (with timestamps).txt`;
          downloadText(buildTimestampedTxt(res.segments), tsFilename);
          showNotify(`字幕を ${tsFilename} として保存しました`);
        },
      });

      const btnNoTs = makeIconButton({
        id: BTN_ID_NO_TS,
        title: "タイムスタンプなしで字幕を保存",
        ariaLabel: "タイムスタンプなしで字幕を保存（TXT）",
        pathD: SAVE_ICON_PATH,
        onClick: async () => {
          const title = sanitizeFilename(getVideoTitle());
          if (hasChapters()) {
            const res = hasNewTranscript()
              ? extractTranscriptWithChaptersNew()
              : extractTranscriptWithChaptersOld();
            if (!res.ok) { alert(`トランスクリプトを取得できませんでした：${res.reason}\n（トランスクリプトが開いているか、必要なら少しスクロールして読み込みを完了してから再試行してください）`); return; }
            const mdFilenameNoTs = `${title} - transcript.md`;
            downloadText(buildMarkdownWithChapters(res.entries, false), mdFilenameNoTs);
            showNotify(`字幕を ${mdFilenameNoTs} として保存しました`);
            return;
          }
          const res = extractTranscriptText();
          if (!res.ok) {
            alert(`トランスクリプトを取得できませんでした：${res.reason}\n（トランスクリプトが開いているか、必要なら少しスクロールして読み込みを完了してから再試行してください）`);
            return;
          }
          const txtFilename = `${title} - transcript.txt`;
          downloadText(res.text, txtFilename);
          showNotify(`字幕を ${txtFilename} として保存しました`);
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
