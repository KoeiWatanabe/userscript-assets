// ==UserScript==
// @name         Obsidianに保存する
// @namespace    local.obsidian.capture
// @version      3.0
// @description  選択があれば選択範囲、なければ直近で触った返答をマークダウン形式でObsidianの新規ノートに保存＋チャット全体MDダウンロード（アイコン化・SVGフォールバック・履歴サイト横断・表/チェックリスト強化）
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://gemini.google.com/*
// @match        https://t3.chat/*
// @match        https://claude.ai/*
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @require      https://unpkg.com/turndown@7.1.2/dist/turndown.js
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Obsidianに保存する/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Obsidianに保存する/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Obsidianに保存する/icon_128.png
// ==/UserScript==

(() => {
  "use strict";

  const VAULT_NAME = "iCloud Vault";
  const PREFIX = "\n\n";
  const SUFFIX = "\n";
  const INBOX_FOLDER = "00 Inbox";

  // 共有ストレージ（GM_*）で使うキー
  const LAST_NOTE_KEY = "obsidian_last_note_path";
  const CREATED_NOTES_KEY = "obsidian_created_notes";

  // Windowsでファイル名に使えない文字（Obsidian vaultがWindows上にある前提ならこれが一番安全）
const WINDOWS_FORBIDDEN_CHARS_RE = /[\\\/:*?"<>|]/g;
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/g;

// Windowsの予約語（拡張子が付いていてもダメ）
const WINDOWS_RESERVED_NAMES = new Set([
  "CON","PRN","AUX","NUL",
  "COM1","COM2","COM3","COM4","COM5","COM6","COM7","COM8","COM9",
  "LPT1","LPT2","LPT3","LPT4","LPT5","LPT6","LPT7","LPT8","LPT9",
]);

function validateWindowsFileName(name) {
  // 入力前提：拡張子はスクリプト側で付けるので、ここは「ベース名」だけでもOK
  const raw = String(name ?? "");

  if (!raw.trim()) {
    return { ok: false, message: "ファイル名が空です。" };
  }

  // 前後空白はユーザーの意図が薄いので禁止寄りにする（最低でも末尾の空白は禁止）
  if (/[ \t]+$/.test(raw)) {
    return { ok: false, message: "末尾にスペースが入っています（WindowsではNGです）。" };
  }
  if (/\.+$/.test(raw)) {
    return { ok: false, message: "末尾がピリオド(.)です（WindowsではNGです）。" };
  }

  // 禁止文字
  if (WINDOWS_FORBIDDEN_CHARS_RE.test(raw)) {
    return { ok: false, message: '禁止文字が含まれています: \\ / : * ? " < > |' };
  }
  if (CONTROL_CHARS_RE.test(raw)) {
    return { ok: false, message: "制御文字（見えない文字）が含まれています。" };
  }

  // 予約語（CON.txt みたいなのもNGなので、拡張子を落として判定）
  const base = raw.split(".")[0].trim().toUpperCase();
  if (WINDOWS_RESERVED_NAMES.has(base)) {
    return { ok: false, message: `Windows予約語（${base}）はファイル名に使えません。` };
  }

  // 長さ（余裕を見て 180 くらいで止める：日付やフォルダも足されるので）
  // Obsidian/URI/ファイルパス長も絡むので控えめに
  if (raw.length > 180) {
    return { ok: false, message: "ファイル名が長すぎます（180文字以内にしてください）。" };
  }

  return { ok: true, message: "" };
}

// “置換して強制セーフ名にする”方も一応用意（使うかは後述）
function sanitizeWindowsFileName(name) {
  return String(name ?? "")
    .replace(CONTROL_CHARS_RE, "")
    .replace(WINDOWS_FORBIDDEN_CHARS_RE, " ")
    .replace(/[ \t]+$/g, "")
    .replace(/\.+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

  // =========================
  // 履歴ストレージ（サイト横断）
  // =========================

  function getCreatedNotes() {
    return GM_getValue(CREATED_NOTES_KEY, []);
  }

  function saveCreatedNote(filepath) {
    const notes = getCreatedNotes();
    if (!notes.includes(filepath)) {
      notes.push(filepath);
      GM_setValue(CREATED_NOTES_KEY, notes);
    }
  }

  function noteExists(filepath) {
    const notes = getCreatedNotes();
    return notes.includes(filepath);
  }

  function saveLastNotePath(filepath) {
    GM_setValue(LAST_NOTE_KEY, filepath);
  }

  function getLastNotePath() {
    return GM_getValue(LAST_NOTE_KEY, null);
  }

  // 既存の localStorage（サイト別）に履歴が残っている場合、各サイトで1回だけGMへ移行して統合
  function migrateLocalStorageToGMOncePerHost() {
    const migratedKey = `obsidian_migrated_to_gm_v1__${location.hostname}`;
    if (GM_getValue(migratedKey, false)) return;

    try {
      const lsLast = localStorage.getItem(LAST_NOTE_KEY);
      const gmLast = GM_getValue(LAST_NOTE_KEY, null);
      if (lsLast && !gmLast) {
        GM_setValue(LAST_NOTE_KEY, lsLast);
      }

      const lsCreatedRaw = localStorage.getItem(CREATED_NOTES_KEY);
      if (lsCreatedRaw) {
        let lsCreated = [];
        try {
          lsCreated = JSON.parse(lsCreatedRaw) || [];
        } catch {
          lsCreated = [];
        }

        const gmCreated = GM_getValue(CREATED_NOTES_KEY, []);
        const merged = Array.from(new Set([...gmCreated, ...lsCreated]));
        GM_setValue(CREATED_NOTES_KEY, merged);
      }

      GM_setValue(migratedKey, true);
    } catch {
      // 失敗しても致命的ではないので無視
    }
  }

  // =========================
  // Icon (Webfont -> SVG fallback)
  // =========================

  const MATERIAL_SYMBOLS_HREF =
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=calendar_add_on,download,note_add';

  // ChatGPT / Claude は CSP で fonts.googleapis.com がブロックされがち → 最初からSVG固定
  function forceSvgHost() {
    const h = location.hostname;
    return (
      h.includes("chatgpt.com") ||
      h.includes("chat.openai.com") ||
      h.includes("claude.ai")
    );
  }

  function ensureMaterialSymbolsCss() {
    if (forceSvgHost()) return;
    if (document.querySelector(`link[data-obsidian-ms="1"][href="${MATERIAL_SYMBOLS_HREF}"]`)) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = MATERIAL_SYMBOLS_HREF;
    link.dataset.obsidianMs = "1";
    document.head.appendChild(link);
  }

  // あなたが貼ってくれた path d（Material Symbols の 960x960 座標系）
  const SVG_PATHS = {
    calendar_add_on:
      "M700-80v-120H580v-60h120v-120h60v120h120v60H760v120h-60Zm-520-80q-24 0-42-18t-18-42v-540q0-24 18-42t42-18h65v-60h65v60h260v-60h65v60h65q24 0 42 18t18 42v302q-15-2-30-2t-30 2v-112H180v350h320q0 15 3 30t8 30H180Zm0-470h520v-130H180v130Zm0 0v-130 130Z",
    note_add:
      "M450-234h60v-129h130v-60H510v-130h-60v130H320v60h130v129ZM220-80q-24 0-42-18t-18-42v-680q0-24 18-42t42-18h361l219 219v521q0 24-18 42t-42 18H220Zm331-554v-186H220v680h520v-494H551ZM220-820v186-186 680-680Z",
    download:
      "M480-336 288-528l51-51 105 105v-342h72v342l105-105 51 51-192 192ZM263.72-192Q234-192 213-213.15T192-264v-72h72v72h432v-72h72v72q0 29.7-21.16 50.85Q725.68-192 695.96-192H263.72Z",
  };

  function makeSvgIcon(iconName, sizePx = 22) {
    const pathD = SVG_PATHS[iconName];
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");

    // Material Symbols のパスは 960x960 & Yがマイナス方向の座標系
    svg.setAttribute("viewBox", "0 -960 960 960");
    svg.setAttribute("width", String(sizePx));
    svg.setAttribute("height", String(sizePx));
    svg.setAttribute("aria-hidden", "true");
    svg.style.display = "block";

    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", pathD || "M0 0");
    svg.appendChild(path);

    return svg;
  }

  function makeFontIcon(iconName) {
    const span = document.createElement("span");
    span.className = "material-symbols-outlined obsidian-capture-icon";
    span.textContent = iconName;
    span.dataset.iconName = iconName;
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  function canUseMaterialSymbolsFont() {
    try {
      return !!document.fonts?.check?.('16px "Material Symbols Outlined"');
    } catch {
      return false;
    }
  }

  async function fallbackIconsIfNeeded(rootEl, timeoutMs = 1200) {
    if (forceSvgHost()) return;

    const waitFonts = (async () => {
      if (!document.fonts?.ready) return;
      await document.fonts.ready;
    })();

    const waitTimeout = new Promise((resolve) => setTimeout(resolve, timeoutMs));
    await Promise.race([waitFonts, waitTimeout]);

    if (canUseMaterialSymbolsFont()) return;

    const spans = rootEl.querySelectorAll(".obsidian-capture-icon[data-icon-name]");
    for (const span of spans) {
      const iconName = span.dataset.iconName;
      span.replaceWith(makeSvgIcon(iconName, 22));
    }
  }

  function makeIconButton({ iconName, label, onClick }) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "obsidian-capture-btn";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.addEventListener("click", onClick);

    if (forceSvgHost()) {
      btn.appendChild(makeSvgIcon(iconName, 22));
    } else {
      btn.appendChild(makeFontIcon(iconName));
    }
    return btn;
  }

  // =========================
  // Turndownインスタンスの初期化（表/チェックリスト強化）
  // =========================

  let turndownService = null;

  function escapePipes(s) {
    return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
  }

  function tableToMarkdown(rows) {
    if (!rows || !rows.length) return "";

    const colCount = Math.max(...rows.map(r => (r ? r.length : 0)), 0);
    if (colCount === 0) return "";

    const norm = (r) => {
      const out = (r || []).slice(0, colCount);
      while (out.length < colCount) out.push("");
      return out;
    };

    const header = norm(rows[0]).map(escapePipes);
    const sep = new Array(colCount).fill("---");

    const lines = [];
    lines.push(`| ${header.join(" | ")} |`);
    lines.push(`| ${sep.join(" | ")} |`);

    for (const r of rows.slice(1)) {
      const row = norm(r).map(escapePipes);
      lines.push(`| ${row.join(" | ")} |`);
    }

    return "\n\n" + lines.join("\n") + "\n\n";
  }

  function initTurndown() {
    if (typeof TurndownService === "undefined") {
      console.error("Turndown library not loaded");
      return null;
    }

    const service = new TurndownService({
      headingStyle: "atx",
      hr: "---",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      fence: "```",
      emDelimiter: "*",
      strongDelimiter: "**",
      linkStyle: "inlined",
      linkReferenceStyle: "full",
    });

    // --- コードブロックを強く拾う（pre は fenced に）---
    service.addRule("fencedCodeBlockStrong", {
      filter(node) {
        return node && node.nodeName === "PRE";
      },
      replacement(content, node) {
        const raw = node.textContent || "";
        const cleaned = raw
          .replace(/^\s*コードをコピーする\s*\n?/m, "")
          .replace(/^\s*Copy code\s*\n?/m, "");

        let lang = "";
        const code = node.querySelector("code");
        const cls = code && code.className ? code.className : "";
        const m = cls.match(/language-([a-z0-9_-]+)/i);
        if (m) lang = m[1];

        const body = cleaned.replace(/\n$/, "");
        return `\n\n\`\`\`${lang}\n${body}\n\`\`\`\n\n`;
      }
    });

    // --- タスクリストを強制（li内のcheckboxをGFMに） ---
    // 検出条件は保守的にし、Radix UI等のdata-state属性との衝突を回避
    // 直接の子要素のみ検査し、ネストされたサブリスト内のチェックボックスで親LIが誤マッチするのを防ぐ
service.addRule("taskListItemsCustom", {
  filter(node) {
    if (!node || node.nodeName !== "LI") return false;

    const directChildren = Array.from(node.children);

    // 1) 直接の子に checkbox input がある（最も確実）
    if (directChildren.some(c => c.tagName === 'INPUT' && c.type === 'checkbox')) return true;

    // 2) 直接の子に ARIA role="checkbox" がある
    if (directChildren.some(c => c.getAttribute && c.getAttribute('role') === 'checkbox')) return true;

    // 3) 直接の子に aria-checked がある（明示的なチェックボックスセマンティクス）
    if (directChildren.some(c => c.getAttribute && (c.getAttribute('aria-checked') === 'true' || c.getAttribute('aria-checked') === 'false'))) return true;

    // 4) 最初のテキストノードが [x] / [ ] で始まる（Gemini等はチェックボックスをプレーンテキストで描画）
    const firstText = Array.from(node.childNodes).find(n => n.nodeType === 3 && n.textContent.trim());
    if (firstText && /^\[[ xX]\]\s+/.test(firstText.textContent.trim())) return true;

    return false;
  },

  replacement(content, node) {
    // checked 判定（直接の子要素のみ検査）
    const directChildren = Array.from(node.children);
    const cb =
      directChildren.find(c => c.tagName === 'INPUT' && c.type === 'checkbox') ||
      directChildren.find(c => c.getAttribute && c.getAttribute('role') === 'checkbox') ||
      directChildren.find(c => c.getAttribute && c.hasAttribute('aria-checked')) ||
      directChildren.find(c => c.getAttribute && c.hasAttribute('data-checked')) ||
      directChildren.find(c => c.getAttribute && c.hasAttribute('data-state'));

    let checked = false;

    // input の checked
    if (cb && typeof cb.checked === "boolean") checked = cb.checked;

    // aria-checked="true"
    if (!checked && cb && cb.getAttribute) {
      const aria = cb.getAttribute("aria-checked");
      if (aria === "true") checked = true;
    }

    // data-state="checked" / data-checked="true"
    if (!checked && cb && cb.getAttribute) {
      const ds = cb.getAttribute("data-state");
      const dc = cb.getAttribute("data-checked");
      if (ds === "checked" || dc === "true") checked = true;
    }

    // 記号から推定（最後の保険 — 最初のテキストノードのみ）
    if (!checked) {
      const firstText = Array.from(node.childNodes).find(n => n.nodeType === 3 && n.textContent.trim());
      if (firstText && /^(\[x\]|\u2611|\u2713|\u2705)\s+/i.test(firstText.textContent.trim())) checked = true;
    }

    // Turndownが再帰的に変換済みの content を使う（ネスト構造が保持される）
    // Turndownデフォルトの listItem と同じインデント処理を適用
    content = content
      .replace(/^\n+/, '')       // 先頭の改行を除去
      .replace(/\n+$/, '\n')    // 末尾の改行を正規化
      .replace(/\n/gm, '\n    '); // ネストされた内容をインデント

    // 先頭に残ってるチェックボックス記号を除去（重複防止）
    // エスケープ済み: \[x\], \[ \]  未エスケープ: [x], [ ]  記号: ☐☑✓✅
    content = content.replace(/^\\?\[[ xX]\\?\]\s*/i, '');
    content = content.replace(/^[\u2610\u2611\u2713\u2705]\s*/i, '');

    const box = checked ? "[x]" : "[ ]";
    return (
      '- ' + box + ' ' + content +
      (node.nextSibling && !/\n$/.test(content) ? '\n' : '')
    );
  }
});

    // --- 本物の <table> を Markdown表に ---
    service.addRule("tablesCustom", {
      filter(node) {
        return node && node.nodeName === "TABLE";
      },
      replacement(content, node) {
        const trList = Array.from(node.querySelectorAll("tr"));
        if (!trList.length) return "";

        const rows = trList.map(tr => {
          const cells = Array.from(tr.querySelectorAll("th,td"));
          return cells.map(td => (td.textContent || "").trim());
        });

        return tableToMarkdown(rows);
      }
    });

    // --- 疑似テーブル（role="table"/"grid"）を Markdown表に（Geminiなど） ---
    service.addRule("roleTablesCustom", {
      filter(node) {
        if (!node || node.nodeType !== 1) return false;
        const role = node.getAttribute && node.getAttribute("role");
        return role === "table" || role === "grid";
      },
      replacement(content, node) {
        const roleRows = Array.from(node.querySelectorAll('[role="row"]'));
        if (!roleRows.length) {
          return "\n\n" + ((node.textContent || "").trim()) + "\n\n";
        }

        const rows = roleRows.map(r => {
          const cells = Array.from(
            r.querySelectorAll('[role="columnheader"], [role="rowheader"], [role="cell"]')
          );
          return cells.map(c => (c.textContent || "").trim());
        }).filter(r => r.some(x => x && x.length));

        if (!rows.length) {
          return "\n\n" + ((node.textContent || "").trim()) + "\n\n";
        }

        return tableToMarkdown(rows);
      }
    });

    // --- リンクのルール（title属性を保持） ---
    service.addRule("links", {
      filter: "a",
      replacement: function (content, node) {
        const href = node.getAttribute("href");
        const title = node.getAttribute("title");
        if (!href) return content;
        if (title) return "[" + content + "](" + href + ' "' + title + '")';
        return "[" + content + "](" + href + ")";
      },
    });

    return service;
  }

  function getSelectionContainer() {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0);
    const container = document.createElement("div");
    container.appendChild(range.cloneContents());
    return container.childNodes.length > 0 ? container : null;
  }

  function getSelectionMarkdown() {
    const container = getSelectionContainer();
    if (!container) return "";

    if (!turndownService) {
      turndownService = initTurndown();
    }
    if (!turndownService) {
      return window.getSelection?.()?.toString().trim() || "";
    }
    // DOM要素を直接渡す（Trusted Types CSP対策）
    return turndownService.turndown(container).trim();
  }

  let lastPointedEl = null;
  document.addEventListener("mouseover", (e) => { lastPointedEl = e.target; }, true);
  document.addEventListener("mousedown", (e) => { lastPointedEl = e.target; }, true);

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // Turndownがエスケープしたチェックボックス記法を復元（ \[ \] → [ ]、\[x\] → [x] ）
  function unescapeCheckboxes(md) {
    return md.replace(/^(\s*-\s+)\\\[([ xX])\\\]/gm, '$1[$2]');
  }

  function markdownFromEl(el) {
    if (!el) return "";
    if (!turndownService) turndownService = initTurndown();
    if (!turndownService) return (el.innerText || el.textContent || "").trim();
    // Claude のビジュアライゼーションウィジェットを除去（該当サイトのみ）
    const target = (location.hostname.includes("claude.ai") && typeof stripClaudeVisualizationWidgets === "function")
      ? stripClaudeVisualizationWidgets(el)
      : el;
    // DOM要素を直接渡す（Trusted Types CSP対策：innerHTML経由だとブロックされるサイトがある）
    const md = turndownService.turndown(target).trim();
    return unescapeCheckboxes(md);
  }

  function closestBySelectors(startEl, selectors) {
    let el = startEl;
    while (el && el !== document.documentElement) {
      for (const sel of selectors) {
        try {
          if (el.matches && el.matches(sel)) return el;
        } catch {}
      }
      el = el.parentElement;
    }
    return null;
  }

  function findWholeReplyElement() {
    const host = location.hostname;

    const fromPointer = (() => {
      const el = lastPointedEl;
      if (!el) return null;

      if (host.includes("chatgpt.com") || host.includes("chat.openai.com")) {
        return closestBySelectors(el, ['[data-message-author-role="assistant"]', "article"]);
      }
      if (host.includes("gemini.google.com")) {
        return closestBySelectors(el, ["message-content", 'div[role="article"]', 'main div[role="main"] div', "main div"]);
      }
      if (host.includes("t3.chat")) {
        return closestBySelectors(el, ['[data-message-role="assistant"]', "article", 'div[role="article"]']);
      }
      if (host.includes("claude.ai")) {
        return closestBySelectors(el, [".standard-markdown", '[class*="standard-markdown"]']);
      }
      return null;
    })();

    if (fromPointer && isVisible(fromPointer) && fromPointer.innerHTML) return fromPointer;

    if (host.includes("chatgpt.com") || host.includes("chat.openai.com")) {
      const nodes = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
      return nodes.length ? nodes[nodes.length - 1] : null;
    }
    if (host.includes("gemini.google.com")) {
      // まずは適切なセレクタでメッセージコンテナを直接探す
      const directSelectors = [
        '[data-message-role="assistant"]',
        'model-response',
        '.model-response-text',
        '.response-container'
      ];

      for (const selector of directSelectors) {
        const elements = Array.from(document.querySelectorAll(selector))
          .filter(el => isVisible(el) && el.innerHTML && el.innerHTML.length > 50);
        if (elements.length) {
          return elements[elements.length - 1];
        }
      }

      // フォールバック：候補を見つけて、その親を辿る
      const candidates = Array.from(document.querySelectorAll("main *"))
        .filter(el => el instanceof Element && isVisible(el))
        .filter(el => (el.innerText || "").trim().length > 200);

      if (candidates.length) {
        const lastCandidate = candidates[candidates.length - 1];
        // 親要素を辿ってメッセージ全体を含むコンテナを探す
        const messageContainer = closestBySelectors(lastCandidate, [
          '[data-message-role="assistant"]',
          'model-response',
          '.model-response-text',
          'article',
          'div[role="article"]',
          'main > div',
          'main > section'
        ]);
        return messageContainer || lastCandidate;
      }

      return null;
    }
    if (host.includes("t3.chat")) {
      const nodes = Array.from(document.querySelectorAll("article, div[role='article']"));
      for (let i = nodes.length - 1; i >= 0; i--) {
        const t = markdownFromEl(nodes[i]);
        if (t && t.length > 80) return nodes[i];
      }
      return null;
    }
    if (host.includes("claude.ai")) {
      const messages = Array.from(document.querySelectorAll(".standard-markdown"))
        .filter(el => isVisible(el) && el.innerHTML && el.innerHTML.length > 50);
      return messages.length > 0 ? messages[messages.length - 1] : null;
    }

    return null;
  }

  function getCurrentDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  function openObsidianDailyAppend(content) {
    const url = `obsidian://advanced-uri?vault=${encodeURIComponent(VAULT_NAME)}&daily=true&data=${encodeURIComponent(content)}&mode=append`;
    window.location.href = url;
  }

  function openObsidianNewNote(filepath, content, isAppend) {
    const mode = isAppend ? "append" : "overwrite";
    const data = isAppend ? `\n\n---\n\n${content}` : content;
    const url = `obsidian://advanced-uri?vault=${encodeURIComponent(VAULT_NAME)}&filepath=${encodeURIComponent(filepath)}&data=${encodeURIComponent(data)}&mode=${mode}`;
    window.location.href = url;
  }

  async function onClickDaily() {
    const selected = getSelectionMarkdown();
    let payload = selected;

    if (!payload) {
      const replyEl = findWholeReplyElement();
      payload = markdownFromEl(replyEl);
      if (!payload) {
        alert("保存する返答を特定できなかった。");
        return;
      }
    }

    openObsidianDailyAppend(PREFIX + payload + SUFFIX);
  }

  async function onClickNewNote() {
  const selected = getSelectionMarkdown();
  let payload = selected;

  if (!payload) {
    const replyEl = findWholeReplyElement();
    payload = markdownFromEl(replyEl);
    if (!payload) {
      alert("保存する返答を特定できなかった。");
      return;
    }
  }

  // ---- ファイル名入力（禁止文字チェック + 修正案を次promptにプリセット）----
  let noteName = "";
  let defaultValue = ""; // 次回promptに入れるデフォルト文字列

  for (;;) {
    const input = prompt(
      "ノート名を入力してください（日付は自動で追加されます）:",
      defaultValue
    );
    if (input === null) return; // キャンセル

    const candidate = String(input);

    const v = validateWindowsFileName(candidate);
    if (v.ok) {
      noteName = candidate.trim();
      break;
    }

    const fixed = sanitizeWindowsFileName(candidate);
    // 次のpromptに修正案を入れておく（修正案が空なら空のまま）
    defaultValue = fixed || "";

    // アラートは情報として出す（ここでOK押した後にpromptが出る）
    alert(`そのファイル名は使えません。\n理由: ${v.message}\n\n禁止文字を除いて入力し直してください。`);
  }

  const dateStr = getCurrentDateString();
  const filename = `${dateStr}_${noteName}.md`;
  const filepath = `/${INBOX_FOLDER}/${filename}`;

  const exists = noteExists(filepath);
  openObsidianNewNote(filepath, payload, exists);

  saveCreatedNote(filepath);
  saveLastNotePath(filepath);
}

  // =========================
  // ユーティリティ：連続する重複パラグラフを除去
  // （Claude UIのツール使用ブロックでサマリーが2要素に重複表示される問題への対策）
  // =========================

  function removeDuplicateParagraphs(md) {
    const parts = md.split(/\n\n+/);
    const result = [];
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (result.length > 0 && trimmed === result[result.length - 1].trim()) continue;
      result.push(part);
    }
    return result.join('\n\n');
  }

  // =========================
  // チャット全体ダウンロード機能
  // =========================

  function formatDateForFilename(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${h}.${min}`;
  }

  function sanitizeFilenameForDownload(name) {
    return name.replace(/[\\\/:*?"<>|]/g, '_').trim();
  }

  function downloadMarkdownFile(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function getServiceNameForExport() {
    const host = location.hostname;
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt';
    if (host.includes('gemini.google.com')) return 'gemini';
    if (host.includes('claude.ai')) return 'claude';
    if (host.includes('t3.chat')) return 't3chat';
    return null;
  }

  function extractFullChatGPT() {
    const title = document.title || 'Untitled';
    const messages = [];
    const turns = document.querySelectorAll('[data-testid^="conversation-turn"]');

    function processUser(el) {
      const textEl = el.querySelector('.whitespace-pre-wrap');
      const text = textEl ? textEl.textContent.trim() : el.innerText.trim();
      if (text) messages.push({ role: 'user', content: text });
    }

    function processAssistant(el) {
      const mdEl = el.querySelector('.markdown');
      if (mdEl) {
        const md = markdownFromEl(mdEl);
        if (md) messages.push({ role: 'assistant', content: md });
      } else {
        const text = el.innerText.trim();
        if (text) messages.push({ role: 'assistant', content: text });
      }
    }

    if (turns.length > 0) {
      turns.forEach(turn => {
        const userEl = turn.querySelector('[data-message-author-role="user"]');
        // ChatGPTでは1ターン内に複数のassistant要素がある場合がある
        // （思考/検索ステップ + 本体の返答）。最後の要素が本体。
        const assistantEls = turn.querySelectorAll('[data-message-author-role="assistant"]');
        if (userEl) processUser(userEl);
        if (assistantEls.length > 0) {
          processAssistant(assistantEls[assistantEls.length - 1]);
        }
      });
    } else {
      // フォールバック: ターンが見つからない場合は全要素を走査
      // assistant要素が連続する場合は最後の1つだけを採用
      const allMsgs = document.querySelectorAll('[data-message-author-role]');
      let pendingAssistant = null;
      allMsgs.forEach(el => {
        const role = el.getAttribute('data-message-author-role');
        if (role === 'user') {
          // 先に溜まっているassistantがあれば確定
          if (pendingAssistant) {
            processAssistant(pendingAssistant);
            pendingAssistant = null;
          }
          processUser(el);
        } else if (role === 'assistant') {
          // 連続するassistantは上書き（最後のものだけ残す）
          pendingAssistant = el;
        }
      });
      // 末尾に残ったassistantを処理
      if (pendingAssistant) {
        processAssistant(pendingAssistant);
      }
    }

    let model = '';
    const modelSelector = document.querySelector('button[aria-label*="モデル"], button[aria-label*="Model"]');
    if (modelSelector) {
      const t = modelSelector.textContent.trim();
      if (t.length < 30) model = t;
    }
    if (!model) {
      const modelBtns = document.querySelectorAll('button');
      for (const btn of modelBtns) {
        const t = btn.textContent.trim();
        if (t.match(/^(GPT-|ChatGPT|o[134]|gpt)/i) && t.length < 30) {
          model = t;
          break;
        }
      }
    }

    return { title, messages, model, service: 'ChatGPT' };
  }

  function extractFullGemini() {
    const messages = [];

    let title = '';
    const activeTitle = document.querySelector('.selected .conversation-title, .active .conversation-title');
    if (activeTitle) {
      title = activeTitle.textContent.trim();
    }
    if (!title) {
      title = document.title.replace(' - Google Gemini', '').replace('Google Gemini', '').trim() || 'Untitled';
    }

    const userQueries = document.querySelectorAll('user-query');
    const modelResponses = document.querySelectorAll('model-response');

    const maxLen = Math.max(userQueries.length, modelResponses.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < userQueries.length) {
        const queryText = userQueries[i].querySelector('.query-text');
        let text = queryText ? queryText.textContent.trim() : userQueries[i].innerText.trim();
        text = text.replace(/^あなたのプロンプト\s*/, '').trim();
        if (text) messages.push({ role: 'user', content: text });
      }
      if (i < modelResponses.length) {
        const mdEl = modelResponses[i].querySelector('message-content .markdown');
        if (mdEl) {
          const md = markdownFromEl(mdEl);
          if (md) messages.push({ role: 'assistant', content: md });
        } else {
          const responseText = modelResponses[i].querySelector('.model-response-text');
          const text = responseText ? responseText.innerText.trim() : '';
          if (text) messages.push({ role: 'assistant', content: text });
        }
      }
    }

    return { title, messages, model: '', service: 'Gemini' };
  }

  // Claudeのビジュアライゼーションウィジェット要素をクローンから除去
  function stripClaudeVisualizationWidgets(el) {
    const clone = el.cloneNode(true);

    // 1) <style> 要素（::view-transition CSS）
    clone.querySelectorAll('style').forEach(s => s.remove());

    // 2) モーダル背景 (div.fixed.z-modal)
    clone.querySelectorAll('div.fixed').forEach(d => {
      if (d.className.includes('z-modal')) d.remove();
    });

    // 3) ウィジェットUI本体 (ease-out transition-all font-ui flex-col を含むクラス)
    clone.querySelectorAll('div').forEach(d => {
      const cls = d.className || '';
      if (cls.includes('transition-all') && cls.includes('font-ui') && cls.includes('flex-col')) {
        d.remove();
      }
    });

    return clone;
  }

  function extractFullClaude() {
    const titleBtn = document.querySelector('[data-testid="chat-title-button"]');
    const title = titleBtn ? titleBtn.textContent.trim() : document.title.replace(' - Claude', '').trim() || 'Untitled';

    const messages = [];
    const allMsgEls = document.querySelectorAll('[data-testid="user-message"], .font-claude-response');

    allMsgEls.forEach(el => {
      if (el.matches('[data-testid="user-message"]')) {
        const text = el.innerText.trim();
        if (text) messages.push({ role: 'user', content: text });
      } else if (el.matches('.font-claude-response')) {
        // 入れ子の .font-claude-response はスキップ（二重抽出防止）
        if (el.parentElement && el.parentElement.closest('.font-claude-response')) return;
        const cleaned = stripClaudeVisualizationWidgets(el);
        const md = removeDuplicateParagraphs(markdownFromEl(cleaned));
        if (md) messages.push({ role: 'assistant', content: md });
      }
    });

    let model = '';
    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      const t = btn.textContent.trim();
      if (t.match(/^(Sonnet|Opus|Haiku|Claude)/i) && t.length < 30) {
        model = t;
        break;
      }
    }

    return { title, messages, model, service: 'Claude' };
  }

  function extractFullT3Chat() {
    // タイトル取得: "ModelName_Title - T3 Chat" → "Title"
    let title = document.title.replace(/\s*-\s*T3 Chat$/, '').trim();
    const underscoreIdx = title.indexOf('_');
    if (underscoreIdx > 0) {
      title = title.substring(underscoreIdx + 1).trim();
    }
    title = title || 'Untitled';

    const messages = [];
    const articles = document.querySelectorAll('[role="article"]');

    articles.forEach(article => {
      const label = article.getAttribute('aria-label') || '';

      if (label === 'Your message') {
        const proseEl = article.querySelector('form > div.prose, form > div[class*="prose"]');
        if (proseEl) {
          const text = proseEl.innerText.trim();
          if (text) messages.push({ role: 'user', content: text });
        } else {
          const form = article.querySelector('form');
          if (form && form.firstElementChild) {
            const text = form.firstElementChild.innerText.trim();
            if (text) messages.push({ role: 'user', content: text });
          }
        }
      } else if (label === 'Assistant message') {
        // 思考過程・UIボタン等を除外してコンテンツを抽出
        const contentWrapper = document.createElement('div');
        Array.from(article.children).forEach(child => {
          if (child.classList && child.classList.contains('sr-only')) return;
          if (child.tagName === 'BUTTON') return;
          if (child.tagName === 'DETAILS') return;
          if (child.classList && (
            child.classList.contains('thinking') ||
            child.classList.contains('reasoning')
          )) return;

          // T3 Chat のコードブロック（div.group 内に pre がある）
          // → 言語ラベルを取得し、クリーンな <pre><code class="language-xxx"> に変換
          if (child.tagName === 'DIV' && child.querySelector('pre')) {
            const pre = child.querySelector('pre');
            const code = pre.querySelector('code');
            const headerDiv = child.querySelector('[class*="top-0"]');
            const langSpan = headerDiv ? headerDiv.querySelector('span') : null;
            const lang = langSpan ? langSpan.textContent.trim() : '';
            const newPre = document.createElement('pre');
            const newCode = document.createElement('code');
            if (lang) newCode.className = 'language-' + lang;
            newCode.textContent = code ? code.textContent : pre.textContent;
            newPre.appendChild(newCode);
            contentWrapper.appendChild(newPre);
            return;
          }

          // T3 Chat のテーブルラッパー（div 内に table がある）
          // → table 要素だけ取り出す
          if (child.tagName === 'DIV' && child.querySelector('table')) {
            const table = child.querySelector('table');
            contentWrapper.appendChild(table.cloneNode(true));
            return;
          }

          // ボタンのみを含む DIV（アクションバー等）はスキップ
          if (child.tagName === 'DIV' && child.querySelector('button')) return;

          contentWrapper.appendChild(child.cloneNode(true));
        });
        const md = markdownFromEl(contentWrapper);
        if (md) messages.push({ role: 'assistant', content: md });
      }
    });

    // モデル名: combobox の aria-label から取得
    let model = '';
    const modelCombo = document.querySelector('[role="combobox"][aria-label*="Current model"]');
    if (modelCombo) {
      const match = modelCombo.getAttribute('aria-label').match(/Current model:\s*(.+)/);
      if (match) model = match[1].trim();
    }

    return { title, messages, model, service: 'T3 Chat' };
  }

  function generateFullMarkdown(data) {
    const lines = [];
    lines.push('# ' + data.title);
    lines.push('');
    if (data.model) {
      lines.push('Model: ' + data.model);
    }
    lines.push('Created: ' + new Date().toLocaleString());
    lines.push('Exported from: ' + data.service);
    lines.push('');

    for (const msg of data.messages) {
      if (msg.role === 'user') {
        lines.push('### User');
        lines.push('');
        lines.push(msg.content);
        lines.push('');
      } else if (msg.role === 'assistant') {
        lines.push('### Assistant');
        lines.push('');
        lines.push(msg.content);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  function exportChat() {
    const service = getServiceNameForExport();
    if (!service) {
      alert('このサイトではダウンロード機能はサポートされていません。');
      return;
    }

    let data;
    try {
      switch (service) {
        case 'chatgpt': data = extractFullChatGPT(); break;
        case 'gemini': data = extractFullGemini(); break;
        case 'claude': data = extractFullClaude(); break;
        case 't3chat': data = extractFullT3Chat(); break;
      }
    } catch (e) {
      alert('チャット履歴の取得中にエラーが発生しました: ' + e.message);
      console.error('Chat export error:', e);
      return;
    }

    if (!data || data.messages.length === 0) {
      alert('チャット履歴が見つかりませんでした。チャットページを開いてから実行してください。');
      return;
    }

    const markdown = generateFullMarkdown(data);
    const filename = sanitizeFilenameForDownload(data.title) + ' - ' + formatDateForFilename(new Date()) + '.md';
    downloadMarkdownFile(filename, markdown);
  }

  function setupExportShortcut() {
    document.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        exportChat();
      }
    });
  }

  function injectButton() {
    if (document.querySelector(".obsidian-capture-container")) return;

    ensureMaterialSymbolsCss();

    const BTN_SIZE = 42;
    const ICON_SIZE = 22;

    const style = document.createElement("style");
    style.textContent = `
      .obsidian-capture-container {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .obsidian-capture-btn {
        width: ${BTN_SIZE}px;
        height: ${BTN_SIZE}px;
        padding: 0;
        border-radius: 999px;
        cursor: pointer;
        transition: transform 0.15s ease, background-color 0.2s ease;
        display: inline-flex;
        align-items: center;
        justify-content: center;

        background-color: #ffffff !important;
        color: #333333 !important;
        border: 1px solid rgba(0,0,0,0.15) !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
      }

      .obsidian-capture-btn:hover {
        background-color: #e8e8e8 !important;
        transform: translateY(-1px);
      }

      .obsidian-capture-btn:active {
        transform: translateY(0px);
      }

      .material-symbols-outlined {
        font-family: "Material Symbols Outlined";
        font-weight: normal;
        font-style: normal;
        font-size: ${ICON_SIZE}px;
        line-height: 1;
        display: inline-block;
        white-space: nowrap;
        user-select: none;
        -webkit-font-smoothing: antialiased;
        font-variation-settings: "FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24;
      }

      @media (prefers-color-scheme: dark) {
        .obsidian-capture-btn {
          background-color: #2d2d2d !important;
          color: #efefef !important;
          border: 1px solid rgba(255,255,255,0.2) !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
        }
        .obsidian-capture-btn:hover {
          background-color: #3d3d3d !important;
        }
      }

      html.dark .obsidian-capture-btn,
      body.dark .obsidian-capture-btn,
      [data-theme="dark"] .obsidian-capture-btn {
        background-color: #2d2d2d !important;
        color: #efefef !important;
        border: 1px solid rgba(255,255,255,0.2) !important;
      }
      html.dark .obsidian-capture-btn:hover,
      body.dark .obsidian-capture-btn:hover,
      [data-theme="dark"] .obsidian-capture-btn:hover {
        background-color: #3d3d3d !important;
      }
    `;
    document.head.appendChild(style);

    const container = document.createElement("div");
    container.className = "obsidian-capture-container";

    container.appendChild(makeIconButton({
      iconName: "calendar_add_on",
      label: "Dailyへ追記",
      onClick: onClickDaily
    }));

    container.appendChild(makeIconButton({
      iconName: "note_add",
      label: "新規ノート",
      onClick: onClickNewNote
    }));

    container.appendChild(makeIconButton({
      iconName: "download",
      label: "チャット全体をMarkdownでダウンロード (Alt+S)",
      onClick: exportChat
    }));

    document.body.appendChild(container);

    fallbackIconsIfNeeded(container).catch(() => {});
  }

  function waitForTurndown() {
    if (typeof TurndownService !== "undefined") {
      turndownService = initTurndown();
      migrateLocalStorageToGMOncePerHost();
      injectButton();
      setupExportShortcut();
    } else {
      setTimeout(waitForTurndown, 100);
    }
  }

  waitForTurndown();
})();