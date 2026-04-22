// ==UserScript==
// @name         Obsidianに保存する
// @namespace    local.obsidian.capture
// @version      4.4
// @description  最新AI返答をサイト純正コピー機能でObsidianに保存（Daily追記・新規ノート）＋チャット全体Markdownダウンロード。対応: ChatGPT / Gemini / Claude / T3 Chat
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
  const BUTTON_SIZE = 42;
  const ICON_SIZE = 22;
  const CAPTURE_STYLE_ID = "obsidian-capture-style";

  // 共有ストレージ（GM_*）で使うキー
  const LAST_NOTE_KEY = "obsidian_last_note_path";
  const CREATED_NOTES_KEY = "obsidian_created_notes";

  // =========================
  // サイト識別（初期化時に1回だけ評価）
  // =========================

  const SITE = (() => {
    const h = location.hostname;
    if (h.includes('chatgpt.com') || h.includes('chat.openai.com')) return 'chatgpt';
    if (h.includes('gemini.google.com')) return 'gemini';
    if (h.includes('claude.ai')) return 'claude';
    if (h.includes('t3.chat')) return 't3chat';
    return null;
  })();

  // サイトごとの処理契約
  const SITE_HANDLERS = {
    chatgpt: {
      forceSvg: true,
      pointerSelectors: ['[data-message-author-role="assistant"]', 'article'],
      findLatestReplyElement: findChatGPTLatestReplyElement,
      findCopyButton: findChatGPTCopyButton,
      extractConversation: extractFullChatGPT,
    },
    gemini: {
      forceSvg: false,
      pointerSelectors: ['message-content', 'div[role="article"]', 'main div[role="main"] div', 'main div'],
      findLatestReplyElement: findGeminiLatestReplyElement,
      findCopyButton: findGeminiCopyButton,
      extractConversation: extractFullGemini,
    },
    claude: {
      forceSvg: true,
      pointerSelectors: ['.standard-markdown', '[class*="standard-markdown"]'],
      prepareMarkdownElement: stripClaudeVisualizationWidgets,
      findLatestReplyElement: findClaudeLatestReplyElement,
      findCopyButton: findClaudeCopyButton,
      extractConversation: extractFullClaude,
    },
    t3chat: {
      forceSvg: false,
      pointerSelectors: ['[data-message-role="assistant"]', 'article', 'div[role="article"]'],
      findLatestReplyElement: findT3ChatLatestReplyElement,
      findCopyButton: findT3ChatCopyButton,
      extractConversation: extractFullT3Chat,
    },
  };

  function getSiteHandler() {
    return SITE ? SITE_HANDLERS[SITE] || null : null;
  }

  // =========================
  // Windowsファイル名バリデーション
  // =========================

  const WINDOWS_FORBIDDEN_CHARS_RE = /[\\\/:*?"<>|]/g;
  const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/g;

  const WINDOWS_RESERVED_NAMES = new Set([
    "CON","PRN","AUX","NUL",
    "COM1","COM2","COM3","COM4","COM5","COM6","COM7","COM8","COM9",
    "LPT1","LPT2","LPT3","LPT4","LPT5","LPT6","LPT7","LPT8","LPT9",
  ]);

  function validateWindowsFileName(name) {
    const raw = String(name ?? "");

    if (!raw.trim()) return { ok: false, message: "ファイル名が空です。" };
    if (/[ \t]+$/.test(raw)) return { ok: false, message: "末尾にスペースが入っています（WindowsではNGです）。" };
    if (/\.+$/.test(raw)) return { ok: false, message: "末尾がピリオド(.)です（WindowsではNGです）。" };
    if (WINDOWS_FORBIDDEN_CHARS_RE.test(raw)) return { ok: false, message: '禁止文字が含まれています: \\ / : * ? " < > |' };
    if (CONTROL_CHARS_RE.test(raw)) return { ok: false, message: "制御文字（見えない文字）が含まれています。" };

    const base = raw.split(".")[0].trim().toUpperCase();
    if (WINDOWS_RESERVED_NAMES.has(base)) return { ok: false, message: `Windows予約語（${base}）はファイル名に使えません。` };
    if (raw.length > 180) return { ok: false, message: "ファイル名が長すぎます（180文字以内にしてください）。" };

    return { ok: true, message: "" };
  }

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
    return getCreatedNotes().includes(filepath);
  }

  function saveLastNotePath(filepath) {
    GM_setValue(LAST_NOTE_KEY, filepath);
  }

  // 既存の localStorage（サイト別）に履歴が残っている場合、各サイトで1回だけGMへ移行して統合
  function migrateLocalStorageToGMOncePerHost() {
    const migratedKey = `obsidian_migrated_to_gm_v1__${location.hostname}`;
    if (GM_getValue(migratedKey, false)) return;

    try {
      const lsLast = localStorage.getItem(LAST_NOTE_KEY);
      const gmLast = GM_getValue(LAST_NOTE_KEY, null);
      if (lsLast && !gmLast) GM_setValue(LAST_NOTE_KEY, lsLast);

      const lsCreatedRaw = localStorage.getItem(CREATED_NOTES_KEY);
      if (lsCreatedRaw) {
        let lsCreated = [];
        try { lsCreated = JSON.parse(lsCreatedRaw) || []; } catch { lsCreated = []; }
        const gmCreated = GM_getValue(CREATED_NOTES_KEY, []);
        GM_setValue(CREATED_NOTES_KEY, Array.from(new Set([...gmCreated, ...lsCreated])));
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

  function ensureMaterialSymbolsCss() {
    if (getSiteHandler()?.forceSvg) return;
    if (document.querySelector(`link[data-obsidian-ms="1"][href="${MATERIAL_SYMBOLS_HREF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = MATERIAL_SYMBOLS_HREF;
    link.dataset.obsidianMs = "1";
    document.head.appendChild(link);
  }

  // Material Symbols の 960x960 座標系パスデータ
  const SVG_PATHS = {
    calendar_add_on:
      "M700-80v-120H580v-60h120v-120h60v120h120v60H760v120h-60Zm-520-80q-24 0-42-18t-18-42v-540q0-24 18-42t42-18h65v-60h65v60h260v-60h65v60h65q24 0 42 18t18 42v302q-15-2-30-2t-30 2v-112H180v350h320q0 15 3 30t8 30H180Zm0-470h520v-130H180v130Zm0 0v-130 130Z",
    note_add:
      "M450-234h60v-129h130v-60H510v-130h-60v130H320v60h130v129ZM220-80q-24 0-42-18t-18-42v-680q0-24 18-42t42-18h361l219 219v521q0 24-18 42t-42 18H220Zm331-554v-186H220v680h520v-494H551ZM220-820v186-186 680-680Z",
    download:
      "M480-336 288-528l51-51 105 105v-342h72v342l105-105 51 51-192 192ZM263.72-192Q234-192 213-213.15T192-264v-72h72v72h432v-72h72v72q0 29.7-21.16 50.85Q725.68-192 695.96-192H263.72Z",
  };

  function makeSvgIcon(iconName, sizePx = 22) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 -960 960 960");
    svg.setAttribute("width", String(sizePx));
    svg.setAttribute("height", String(sizePx));
    svg.setAttribute("aria-hidden", "true");
    svg.style.display = "block";
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", SVG_PATHS[iconName] || "M0 0");
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
    if (getSiteHandler()?.forceSvg) return;
    await Promise.race([
      (async () => { if (document.fonts?.ready) await document.fonts.ready; })(),
      new Promise(resolve => setTimeout(resolve, timeoutMs)),
    ]);
    if (canUseMaterialSymbolsFont()) return;
    for (const span of rootEl.querySelectorAll(".obsidian-capture-icon[data-icon-name]")) {
      span.replaceWith(makeSvgIcon(span.dataset.iconName, ICON_SIZE));
    }
  }

  function makeIconButton({ iconName, label, onClick }) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "obsidian-capture-btn";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.addEventListener("click", onClick);
    btn.appendChild(getSiteHandler()?.forceSvg ? makeSvgIcon(iconName, ICON_SIZE) : makeFontIcon(iconName));
    return btn;
  }

  // =========================
  // Turndownインスタンスの初期化（表/チェックリスト強化）
  // =========================

  let turndownService = null;

  function ensureTurndown() {
    if (!turndownService) turndownService = initTurndown();
    return turndownService;
  }

  function escapePipes(s) {
    return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
  }

  function tableToMarkdown(rows) {
    if (!rows || !rows.length) return "";
    const colCount = Math.max(...rows.map(r => (r ? r.length : 0)), 0);
    if (colCount === 0) return "";

    const norm = r => {
      const out = (r || []).slice(0, colCount);
      while (out.length < colCount) out.push("");
      return out;
    };

    const lines = [
      `| ${norm(rows[0]).map(escapePipes).join(" | ")} |`,
      `| ${new Array(colCount).fill("---").join(" | ")} |`,
      ...rows.slice(1).map(r => `| ${norm(r).map(escapePipes).join(" | ")} |`),
    ];
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

    // --- ChatGPT用: PRE要素からコードと言語を抽出 ---
    function chatgptStickyLang(preNode) {
      const sticky = preNode.querySelector('[class*="sticky"]');
      if (!sticky) return '';
      const wrapper = sticky.children[0];
      const langDiv = wrapper && wrapper.children[0];
      if (!langDiv) return '';
      const t = langDiv.textContent.trim();
      return KNOWN_LANGS_RE.test(t) ? t.toLowerCase() : '';
    }

    // BR要素を改行として扱いつつテキストを抽出（オフスクリーン要素でも動作）
    function extractTextWithBR(el) {
      const parts = [];
      for (const child of el.childNodes) {
        if (child.nodeName === 'BR') { parts.push('\n'); }
        else { parts.push(child.textContent); }
      }
      return parts.join('');
    }

    function extractChatGPTCodeFromPre(preNode) {
      // CodeMirror（通常コードブロック、または mermaid の "コード" ボタン押下後）
      const cmContent = preNode.querySelector('.cm-content');
      if (cmContent) {
        const lang = chatgptStickyLang(preNode);
        const isMermaid = !!preNode.querySelector('button[aria-label="コード"]');
        const cmLines = cmContent.querySelectorAll('.cm-line');
        let text;
        if (cmLines.length > 0) {
          text = Array.from(cmLines).map(l => l.textContent).join('\n');
        } else {
          // 新CodeMirror構造: <span>text</span><br><span>text</span>...
          text = extractTextWithBR(cmContent);
          if (!text) text = cmContent.innerText || '';
        }
        return { lang: lang || (isMermaid ? 'mermaid' : ''), codeText: text.trim() };
      }

      // mermaid SVG（コードボタン未押下）: ソースを同期取得不可
      if (preNode.querySelector('button[aria-label="コード"]')) {
        return { lang: 'mermaid', codeText: '' };
      }

      // 通常コードブロック: sticky ヘッダーから言語名を取得
      const lang = chatgptStickyLang(preNode);
      const sticky = preNode.querySelector('[class*="sticky"]');

      // コード本文: sticky の兄弟要素（装飾要素を除く最後の子）から innerText で取得
      let codeText = '';
      if (sticky && sticky.parentElement) {
        const container = sticky.parentElement;
        for (let i = container.children.length - 1; i >= 0; i--) {
          const child = container.children[i];
          if (child === sticky) continue;
          if ((child.className || '').includes('pointer-events-none')) continue;
          codeText = child.innerText;
          break;
        }
      }

      if (!codeText) codeText = preNode.innerText || '';

      return { lang, codeText: codeText.trim() };
    }

    // --- コードブロックを強く拾う（pre は fenced に）---
    service.addRule("fencedCodeBlockStrong", {
      filter(node) {
        return node && node.nodeName === "PRE";
      },
      replacement(content, node) {
        if (SITE === 'chatgpt') {
          const { lang, codeText } = extractChatGPTCodeFromPre(node);
          if (!codeText) return '';
          return `\n\n\`\`\`${lang}\n${codeText}\n\`\`\`\n\n`;
        }

        const code = node.querySelector("code");
        const rawText = code ? code.textContent : (node.textContent || "");
        const cleaned = rawText
          .replace(/^\s*コードをコピーする\s*\n?/m, "")
          .replace(/^\s*Copy code\s*\n?/m, "");
        const cls = code?.className || "";
        const lang = (cls.match(/language-([a-z0-9_-]+)/i) || [])[1] || "";
        return `\n\n\`\`\`${lang}\n${cleaned.replace(/\n$/, "")}\n\`\`\`\n\n`;
      }
    });

    // --- タスクリストを強制（li内のcheckboxをGFMに） ---
    // li自身の"直下"のcheckboxだけを対象にする（ネストしたul/ol配下は除外）
    // → 親liがネストの中に子タスクを含むだけで task化されるバグ対策
    function ownDescendant(liNode, selector) {
      const matches = liNode.querySelectorAll(selector);
      for (const m of matches) {
        let p = m.parentElement;
        let insideNestedList = false;
        while (p && p !== liNode) {
          if (p.nodeName === "UL" || p.nodeName === "OL") { insideNestedList = true; break; }
          p = p.parentElement;
        }
        if (!insideNestedList) return m;
      }
      return null;
    }

    service.addRule("taskListItemsCustom", {
      filter(node) {
        if (!node || node.nodeName !== "LI") return false;
        if (node.classList.contains('task-list-item')) return true;
        if (ownDescendant(node, 'input[type="checkbox"]')) return true;
        if (ownDescendant(node, '[role="checkbox"]')) return true;
        if (ownDescendant(node, '[aria-checked]')) return true;
        const firstText = Array.from(node.childNodes).find(n => n.nodeType === 3 && n.textContent.trim());
        if (firstText && /^\[[ xX]\]\s+/.test(firstText.textContent.trim())) return true;
        return false;
      },

      replacement(content, node) {
        const cb =
          ownDescendant(node, 'input[type="checkbox"]') ||
          ownDescendant(node, '[role="checkbox"]') ||
          ownDescendant(node, '[aria-checked]') ||
          ownDescendant(node, '[data-checked]') ||
          ownDescendant(node, '[data-state]');

        let checked = false;
        if (cb && typeof cb.checked === "boolean") checked = cb.checked;
        if (!checked && cb?.getAttribute) {
          const aria = cb.getAttribute("aria-checked");
          if (aria === "true") checked = true;
        }
        if (!checked && cb?.getAttribute) {
          const ds = cb.getAttribute("data-state");
          const dck = cb.getAttribute("data-checked");
          if (ds === "checked" || dck === "true") checked = true;
        }
        if (!checked) {
          const firstText = Array.from(node.childNodes).find(n => n.nodeType === 3 && n.textContent.trim());
          if (firstText && /^(\[x\]|\u2611|\u2713|\u2705)\s+/i.test(firstText.textContent.trim())) checked = true;
        }

        content = content
          .replace(/^\n+/, '')
          .replace(/\n+$/, '\n')
          .replace(/\n/gm, '\n    ');
        content = content.replace(/^\\?\[[ xX]\\?\]\s*/i, '');
        content = content.replace(/^[\u2610\u2611\u2713\u2705]\s*/i, '');

        const box = checked ? "[x]" : "[ ]";
        return '- ' + box + ' ' + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '');
      }
    });

    // --- 本物の <table> を Markdown表に ---
    service.addRule("tablesCustom", {
      filter(node) { return node && node.nodeName === "TABLE"; },
      replacement(content, node) {
        const rows = Array.from(node.querySelectorAll("tr")).map(tr =>
          Array.from(tr.querySelectorAll("th,td")).map(td => (td.textContent || "").trim())
        );
        return rows.length ? tableToMarkdown(rows) : "";
      }
    });

    // --- 疑似テーブル（role="table"/"grid"）を Markdown表に（Geminiなど） ---
    service.addRule("roleTablesCustom", {
      filter(node) {
        if (!node || node.nodeType !== 1) return false;
        const role = node.getAttribute?.("role");
        return role === "table" || role === "grid";
      },
      replacement(content, node) {
        const roleRows = Array.from(node.querySelectorAll('[role="row"]'));
        if (!roleRows.length) return "\n\n" + (node.textContent || "").trim() + "\n\n";
        const rows = roleRows.map(r =>
          Array.from(r.querySelectorAll('[role="columnheader"], [role="rowheader"], [role="cell"]'))
            .map(c => (c.textContent || "").trim())
        ).filter(r => r.some(x => x.length));
        return rows.length ? tableToMarkdown(rows) : "\n\n" + (node.textContent || "").trim() + "\n\n";
      }
    });

    // --- 打ち消し線（<del>/<s>/<strike> → ~~content~~） ---
    service.addRule("strikethrough", {
      filter: ["del", "s", "strike"],
      replacement(content) {
        return content ? `~~${content}~~` : "";
      },
    });

    // --- KaTeX 数式保存（annotation から LaTeX を復元） ---
    service.addRule("katexMath", {
      filter(node) {
        return node?.classList?.contains('katex');
      },
      replacement(content, node) {
        const annotation = node.querySelector('annotation[encoding="application/x-tex"]')
          || node.querySelector('annotation');
        if (!annotation) return content;
        const latex = annotation.textContent.trim();
        const isDisplay = node.parentElement?.classList?.contains('katex-display');
        if (isDisplay) return `\n\n$$\n${latex}\n$$\n\n`;
        return `\\(${latex}\\)`;
      },
    });

    // --- リンクのルール（title属性を保持） ---
    service.addRule("links", {
      filter: "a",
      replacement(content, node) {
        const href = node.getAttribute("href");
        const title = node.getAttribute("title");
        if (!href) return content;
        if (title) return `[${content}](${href} "${title}")`;
        return `[${content}](${href})`;
      },
    });

    return service;
  }

  let lastPointedEl = null;
  document.addEventListener("mouseover", (e) => { lastPointedEl = e.target; }, true);
  document.addEventListener("mousedown", (e) => { lastPointedEl = e.target; }, true);

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // Turndownがエスケープしたチェックボックス記法を復元
  function unescapeCheckboxes(md) {
    return md.replace(/^(\s*-\s+)\\\[([ xX])\\\]/gm, '$1[$2]');
  }

  const KNOWN_LANGS_RE = /^(bash|sh|zsh|fish|python|py|javascript|js|jsx|typescript|ts|tsx|json|jsonc|yaml|yml|toml|xml|html|css|scss|sass|less|sql|graphql|gql|go|rust|rs|ruby|rb|java|kotlin|kt|swift|c|cpp|cxx|csharp|cs|php|perl|pl|r|lua|elixir|ex|erlang|haskell|hs|scala|clojure|clj|dart|objc|shell|powershell|ps1|dockerfile|makefile|cmake|nginx|apache|ini|conf|diff|patch|markdown|md|mermaid|latex|tex|text|txt|plaintext|log|csv|tsv|svg|proto|protobuf|terraform|tf|hcl|vue|svelte|astro|zig|nim|v|wasm|wat)$/i;

  function postProcessMarkdown(md) {
    // 見出し行の番号エスケープを復元 (## 1\. → ## 1.)
    md = md.replace(/^(#{1,6}\s+.*)$/gm, line => line.replace(/\\\./g, '.'));
    // 脚注ブラケットのエスケープを復元 (\[^1\] → [^1])
    md = md.replace(/\\\[\^(\w+)\\\]/g, '[^$1]');
    // 脚注定義のブラケットを復元 (\[1\]: → [1]:)
    md = md.replace(/^\\\[(\d+)\\\]/gm, '[$1]');
    // 分離した言語ラベルをコードフェンスに統合 (例: bash\n\n``` → ```bash)
    md = md.replace(/^(\s*)(\w+)\s*\n(?:\s*\n)*(\s*```)\s*\n/gm, (match, _indent, word, fence) => {
      if (KNOWN_LANGS_RE.test(word)) return fence + word.toLowerCase() + '\n';
      return match;
    });
    // 言語ラベル + 同名タグ付きフェンスの重複を統合 (例: python\n\n```python → ```python)
    md = md.replace(/^(\s*)(\w+)\s*\n(?:\s*\n)*(\s*```)\2\s*\n/gmi, (match, _indent, word, fence) => {
      if (KNOWN_LANGS_RE.test(word)) return fence + word.toLowerCase() + '\n';
      return match;
    });
    return md;
  }

  function markdownFromEl(el) {
    if (!el) return "";
    if (!ensureTurndown()) return (el.innerText || el.textContent || "").trim();
    const target = getSiteHandler()?.prepareMarkdownElement?.(el) || el;
    return postProcessMarkdown(unescapeCheckboxes(turndownService.turndown(target).trim()));
  }

  function closestBySelectors(startEl, selectors) {
    let el = startEl;
    while (el && el !== document.documentElement) {
      for (const sel of selectors) {
        try { if (el.matches?.(sel)) return el; } catch {}
      }
      el = el.parentElement;
    }
    return null;
  }

  function findGeminiFallback() {
    for (const selector of ['[data-message-role="assistant"]', 'model-response', '.model-response-text', '.response-container']) {
      const els = Array.from(document.querySelectorAll(selector))
        .filter(el => isVisible(el) && el.innerHTML?.length > 50);
      if (els.length) return els[els.length - 1];
    }
    const candidates = Array.from(document.querySelectorAll("main *"))
      .filter(el => el instanceof Element && isVisible(el) && (el.innerText || "").trim().length > 200);
    if (!candidates.length) return null;
    return closestBySelectors(candidates[candidates.length - 1], [
      '[data-message-role="assistant"]', 'model-response', '.model-response-text',
      'article', 'div[role="article"]', 'main > div', 'main > section',
    ]) || candidates[candidates.length - 1];
  }

  function findLastVisibleElement(selectors, predicate = () => true) {
    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector)).filter(el =>
        isVisible(el) && predicate(el)
      );
      if (elements.length) return elements[elements.length - 1];
    }
    return null;
  }

  function findChatGPTLatestReplyElement() {
    const nodes = document.querySelectorAll('[data-message-author-role="assistant"]');
    return nodes.length ? nodes[nodes.length - 1] : null;
  }

  function findGeminiLatestReplyElement() {
    return findGeminiFallback();
  }

  function findClaudeLatestReplyElement() {
    return findLastVisibleElement(
      ['.standard-markdown', '[class*="standard-markdown"]'],
      el => !!el.innerHTML && el.innerHTML.length > 50
    );
  }

  function findT3ChatLatestReplyElement() {
    const labeled = findLastVisibleElement(
      ['[role="article"][aria-label="Assistant message"]'],
      el => (el.innerText || "").trim().length > 50
    );
    if (labeled) return labeled;
    return findLastVisibleElement(
      ["article", "div[role='article']"],
      el => (el.innerText || "").trim().length > 80
    );
  }

  function findWholeReplyElement() {
    const handler = getSiteHandler();
    const pointerSelectors = handler?.pointerSelectors || [];
    const fromPointer = (lastPointedEl && pointerSelectors.length)
      ? closestBySelectors(lastPointedEl, pointerSelectors)
      : null;

    if (fromPointer && isVisible(fromPointer) && fromPointer.innerHTML) return fromPointer;
    return handler?.findLatestReplyElement?.() || null;
  }

  // =========================
  // 日付フォーマット
  // =========================

  function formatDate(date, style) {
    const p = n => String(n).padStart(2, '0');
    const y = date.getFullYear(), mo = p(date.getMonth() + 1), d = p(date.getDate());
    if (style === 'compact') return `${y}${mo}${d}`;
    return `${y}-${mo}-${d} ${p(date.getHours())}.${p(date.getMinutes())}`;
  }

  // =========================
  // Obsidian URI 連携
  // =========================

  function openObsidianUri(uri) {
    const a = document.createElement('a');
    a.href = uri;
    a.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { try { a.remove(); } catch {} }, 1000);
  }

  // =========================
  // コピーボタン探索（サイト別）
  // =========================

  function findChatGPTCopyButton() {
    const turns = Array.from(document.querySelectorAll('[data-testid^="conversation-turn"]'));
    for (let i = turns.length - 1; i >= 0; i--) {
      if (!turns[i].querySelector('[data-message-author-role="assistant"]')) continue;
      const btn =
        turns[i].querySelector('button[data-testid="copy-turn-action-button"]') ||
        turns[i].querySelector('button[aria-label="回答をコピーする"]');
      if (btn) return btn;
    }
    return null;
  }

  function findGeminiCopyButton() {
    const responses = Array.from(document.querySelectorAll('model-response'));
    for (let i = responses.length - 1; i >= 0; i--) {
      const btn =
        responses[i].querySelector('button[mattooltip="回答をコピー"]') ||
        responses[i].querySelector('button[aria-label="コピー"]');
      if (btn) return btn;
    }
    return null;
  }

  function findClaudeCopyButton() {
    const responses = Array.from(document.querySelectorAll('.font-claude-response'));
    for (let i = responses.length - 1; i >= 0; i--) {
      let container = responses[i];
      for (let j = 0; j < 3; j++) container = container?.parentElement;
      if (!container) continue;
      const btn = container.querySelector('button[data-testid="action-bar-copy"]');
      if (btn) return btn;
    }
    return null;
  }

  function findT3ChatCopyButton() {
    const footers = Array.from(document.querySelectorAll('[data-testid="assistant-message-footer"]'));
    for (let i = footers.length - 1; i >= 0; i--) {
      const btn =
        footers[i].querySelector('button[aria-label="Copy response to clipboard"]') ||
        footers[i].querySelector('button[aria-label*="Copy"]');
      if (btn) return btn;
    }
    return null;
  }

  // 各サイトの最新 assistant メッセージに対応するコピーボタンを返す。
  // ホバーで表示されるボタンも DOM に存在するため isVisible() チェックは行わない。
  function findLastAssistantCopyButton() {
    return getSiteHandler()?.findCopyButton?.() || null;
  }

  // コピーボタンをクリックしてクリップボードの内容を取得する。
  // 戻り値:
  //   { text: string, clipboardReady: false }  → 読み取り成功（prefix/suffix を付加できる）
  //   { text: null,   clipboardReady: true  }  → クリック成功・読み取り権限なし
  //                                              （クリップボードはサイト側がセット済み）
  //   null                                      → ボタンが見つからなかった（DOM 抽出へ）
  async function tryNativeCopy() {
    const btn = findLastAssistantCopyButton();
    if (!btn) return null;

    btn.click();
    await new Promise(r => setTimeout(r, 350));

    try {
      const text = await navigator.clipboard.readText();
      if (text) return { text, clipboardReady: false };
    } catch {
      // clipboard-read 権限なし。クリップボードはサイト側がセット済みなのでそのまま使える。
    }
    return { text: null, clipboardReady: true };
  }

  // 単体保存のペイロード取得オーケストレーター
  //   1. サイト純正コピーボタンを優先
  //   2. 失敗時は既存の DOM 抽出にフォールバック
  async function getPayload() {
    const result = await tryNativeCopy();
    if (result !== null) return result;

    // フォールバック: DOM 抽出 → Turndown 変換
    const md = markdownFromEl(findWholeReplyElement());
    if (!md) { alert("保存する返答を特定できなかった。"); return null; }
    return { text: md, clipboardReady: false };
  }

  // =========================
  // Obsidian URI 連携（保存先別）
  // =========================

  // content=null のとき GM_setClipboard を呼ばない
  // （サイト側がセット済みのクリップボードをそのまま Obsidian に渡す）
  function openObsidianDailyAppend(content = null) {
    if (content !== null) GM_setClipboard(content, "text");
    const uri =
      `obsidian://adv-uri?vault=${encodeURIComponent(VAULT_NAME)}` +
      `&daily=true&clipboard=true&mode=append`;
    openObsidianUri(uri);
  }

  function openObsidianNewNote(filepath, content, exists) {
    const mode = exists ? "append" : "overwrite";
    if (content !== null) {
      const data = exists ? `\n\n---\n\n${content}` : content;
      GM_setClipboard(data, "text/plain");
    }
    // content=null の場合はクリップボードをそのまま使う
    const uri =
      `obsidian://adv-uri?vault=${encodeURIComponent(VAULT_NAME)}` +
      `&filepath=${encodeURIComponent(filepath)}` +
      `&clipboard=true&mode=${mode}`;
    openObsidianUri(uri);
  }

  async function onClickDaily() {
    const payload = await getPayload();
    if (!payload) return;
    if (payload.clipboardReady) {
      // クリップボードにサイト側の出力がある → prefix/suffix なしでそのまま追記
      openObsidianDailyAppend(null);
    } else {
      openObsidianDailyAppend(PREFIX + payload.text + SUFFIX);
    }
  }

  // =========================
  // 新規ノート作成モーダル
  // =========================

  function showNewNoteModal(payload) {
    const existing = document.querySelector(
      ".obsidian-capture-modal-overlay"
    );
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "obsidian-capture-modal-overlay";

    const dialog = document.createElement("div");
    dialog.className = "obsidian-capture-modal";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "obsidian-capture-modal-title");

    const title = document.createElement("div");
    title.className = "obsidian-capture-modal-title";
    title.id = "obsidian-capture-modal-title";
    title.textContent = "新規ノートを作成";

    const desc = document.createElement("div");
    desc.className = "obsidian-capture-modal-desc";
    desc.textContent =
      "ファイル名を入力してください（日付は自動で付きます）。";

    const label = document.createElement("label");
    label.className = "obsidian-capture-modal-label";
    label.setAttribute("for", "obsidian-capture-note-name");
    label.textContent = "ノート名";

    const input = document.createElement("input");
    input.id = "obsidian-capture-note-name";
    input.type = "text";
    input.className = "obsidian-capture-modal-input";
    input.placeholder = "例: API調査メモ";
    input.autocomplete = "off";
    input.spellcheck = false;

    const preview = document.createElement("div");
    preview.className = "obsidian-capture-modal-preview";

    const error = document.createElement("div");
    error.className = "obsidian-capture-modal-error";
    error.hidden = true;

    const actions = document.createElement("div");
    actions.className = "obsidian-capture-modal-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "obsidian-capture-modal-btn secondary";
    cancelBtn.textContent = "キャンセル";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "obsidian-capture-modal-btn primary";
    saveBtn.textContent = "保存";

    actions.append(cancelBtn, saveBtn);
    dialog.append(title, desc, label, input, preview, error, actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const updatePreview = () => {
      const raw = input.value.trim();
      const safe = sanitizeWindowsFileName(raw) || "ノート名";
      preview.textContent =
        `作成先: ${INBOX_FOLDER}/` +
        `${formatDate(new Date(), "compact")}_${safe}.md`;
    };

    const close = () => {
      document.removeEventListener("keydown", onKeydown, true);
      overlay.remove();
    };

    const onKeydown = e => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };

    const submit = () => {
      const candidate = String(input.value ?? "");
      const v = validateWindowsFileName(candidate);

      if (!v.ok) {
        const suggestion = sanitizeWindowsFileName(candidate);
        error.hidden = false;
        error.textContent =
          `そのファイル名は使えません。${v.message}` +
          (suggestion ? ` 修正候補: ${suggestion}` : "");

        if (suggestion && suggestion !== candidate) {
          input.value = suggestion;
          updatePreview();
        }

        input.focus();
        input.select();
        return;
      }

      const noteName = candidate.trim();
      const filepath =
        `${INBOX_FOLDER}/` +
        `${formatDate(new Date(), "compact")}_${noteName}.md`;
      const exists = noteExists(filepath);

      // clipboardReady の場合は content=null でクリップボードをそのまま Obsidian に渡す
      openObsidianNewNote(filepath, payload.clipboardReady ? null : payload.text, exists);
      saveCreatedNote(filepath);
      saveLastNotePath(filepath);
      close();
    };

    overlay.addEventListener("click", e => {
      if (e.target === overlay) close();
    });

    cancelBtn.addEventListener("click", close);
    saveBtn.addEventListener("click", submit);

    input.addEventListener("input", () => {
      error.hidden = true;
      error.textContent = "";
      updatePreview();
    });

    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        submit();
      }
    });

    document.addEventListener("keydown", onKeydown, true);

    updatePreview();
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  async function onClickNewNote() {
    const payload = await getPayload();
    if (!payload) return;
    showNewNoteModal(payload);
  }

  // =========================
  // ユーティリティ：連続する重複パラグラフを除去
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

  function sanitizeFilenameForDownload(name) {
    return sanitizeWindowsFileName(name) || 'Untitled';
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

  async function extractFullChatGPT() {
    // mermaid "コード" ボタンを押してソースコードを表示させる
    const codeToggleBtns = document.querySelectorAll('button[aria-label="コード"]');
    const clickedBtns = [];
    for (const btn of codeToggleBtns) {
      if (btn.getAttribute('aria-pressed') !== 'true') {
        btn.click();
        clickedBtns.push(btn);
      }
    }
    if (clickedBtns.length > 0) {
      await new Promise(r => setTimeout(r, 600));
    }

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
        const assistantEls = turn.querySelectorAll('[data-message-author-role="assistant"]');
        if (userEl) processUser(userEl);
        if (assistantEls.length > 0) processAssistant(assistantEls[assistantEls.length - 1]);
      });
    } else {
      const allMsgs = document.querySelectorAll('[data-message-author-role]');
      let pendingAssistant = null;
      allMsgs.forEach(el => {
        const role = el.getAttribute('data-message-author-role');
        if (role === 'user') {
          if (pendingAssistant) { processAssistant(pendingAssistant); pendingAssistant = null; }
          processUser(el);
        } else if (role === 'assistant') {
          pendingAssistant = el;
        }
      });
      if (pendingAssistant) processAssistant(pendingAssistant);
    }

    // mermaid ボタンを元に戻す
    for (const btn of clickedBtns) btn.click();

    let model = '';
    const modelSelector = document.querySelector('button[aria-label*="モデル"], button[aria-label*="Model"]');
    if (modelSelector) {
      const t = modelSelector.textContent.trim();
      if (t.length < 30) model = t;
    }
    if (!model) {
      for (const btn of document.querySelectorAll('button')) {
        const t = btn.textContent.trim();
        if (t.match(/^(GPT-|ChatGPT|o[134]|gpt)/i) && t.length < 30) { model = t; break; }
      }
    }

    return { title, messages, model, service: 'ChatGPT' };
  }

  function extractFullGemini() {
    const messages = [];

    let title = document.querySelector('.selected .conversation-title, .active .conversation-title')?.textContent.trim() || '';
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
          const text = modelResponses[i].querySelector('.model-response-text')?.innerText.trim() || '';
          if (text) messages.push({ role: 'assistant', content: text });
        }
      }
    }

    return { title, messages, model: '', service: 'Gemini' };
  }

  // data-mermaid="true" コンテナは SVG にレンダリング済みで元ソースが DOM 上に残らない。
  // React fiber の props を再帰走査して元の Mermaid ソースを復元する。
  const MERMAID_HEAD_RE = /^(graph|flowchart|gantt|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|pie|quadrantChart|mindmap|timeline|gitGraph|C4Context|C4Container|requirementDiagram)/m;

  function extractClaudeMermaidSource(node) {
    if (!node) return null;
    try {
      const propsKey = Object.keys(node).find(k => k.startsWith('__reactProps'));
      if (!propsKey) return null;
      const seen = new WeakSet();
      const find = (o, depth) => {
        if (depth > 8 || !o || typeof o !== 'object' || seen.has(o)) return null;
        seen.add(o);
        for (const k of Object.keys(o)) {
          try {
            const v = o[k];
            if (typeof v === 'string' && v.length > 5 && MERMAID_HEAD_RE.test(v)) return v;
            if (v && typeof v === 'object') {
              const r = find(v, depth + 1);
              if (r) return r;
            }
          } catch {}
        }
        return null;
      };
      return find(node[propsKey], 0);
    } catch {
      return null;
    }
  }

  function stripClaudeVisualizationWidgets(el) {
    // React fiber は original 要素にしか付いていないため、clone 前に Mermaid ソースを抽出する
    const originalMermaids = el.querySelectorAll('div[data-mermaid="true"]');
    const mermaidSources = Array.from(originalMermaids).map(extractClaudeMermaidSource);

    const clone = el.cloneNode(true);
    clone.querySelectorAll('style').forEach(s => s.remove());
    clone.querySelectorAll('div.fixed').forEach(d => { if (d.className.includes('z-modal')) d.remove(); });
    clone.querySelectorAll('div').forEach(d => {
      const cls = d.className || '';
      if (cls.includes('transition-all') && cls.includes('font-ui') && cls.includes('flex-col')) d.remove();
    });
    // コードブロック上の言語ラベルdivを除去（Turndownがプレーンテキストとして拾うのを防止）
    clone.querySelectorAll('div[role="group"]').forEach(group => {
      group.querySelectorAll('div').forEach(d => {
        const cls = d.className || '';
        if (cls.includes('text-text-500') && cls.includes('font-small')) d.remove();
      });
    });

    // Mermaid SVGを元のソースに復元（fencedCodeBlockStrongルールがmermaidフェンスに変換する）
    const cloneMermaids = clone.querySelectorAll('div[data-mermaid="true"]');
    cloneMermaids.forEach((div, i) => {
      const source = mermaidSources[i];
      if (!source) { div.remove(); return; }
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.className = 'language-mermaid';
      code.textContent = source.trim();
      pre.appendChild(code);
      div.replaceWith(pre);
    });

    return clone;
  }

  function extractFullClaude() {
    const titleBtn = document.querySelector('[data-testid="chat-title-button"]');
    const title = titleBtn ? titleBtn.textContent.trim() : document.title.replace(' - Claude', '').trim() || 'Untitled';

    const messages = [];
    document.querySelectorAll('[data-testid="user-message"], .font-claude-response').forEach(el => {
      if (el.matches('[data-testid="user-message"]')) {
        const text = el.innerText.trim();
        if (text) messages.push({ role: 'user', content: text });
      } else if (el.matches('.font-claude-response')) {
        if (el.parentElement?.closest('.font-claude-response')) return;
        const md = removeDuplicateParagraphs(markdownFromEl(el));
        if (md) messages.push({ role: 'assistant', content: md });
      }
    });

    let model = '';
    for (const btn of document.querySelectorAll('button')) {
      const t = btn.textContent.trim();
      if (t.match(/^(Sonnet|Opus|Haiku|Claude)/i) && t.length < 30) { model = t; break; }
    }

    return { title, messages, model, service: 'Claude' };
  }

  function extractFullT3Chat() {
    let title = document.title.replace(/\s*-\s*T3 Chat$/, '').trim();
    const underscoreIdx = title.indexOf('_');
    if (underscoreIdx > 0) title = title.substring(underscoreIdx + 1).trim();
    title = title || 'Untitled';

    const messages = [];
    document.querySelectorAll('[role="article"]').forEach(article => {
      const label = article.getAttribute('aria-label') || '';

      if (label === 'Your message') {
        const proseEl = article.querySelector('form > div.prose, form > div[class*="prose"]');
        const text = proseEl
          ? proseEl.innerText.trim()
          : article.querySelector('form')?.firstElementChild?.innerText.trim() || '';
        if (text) messages.push({ role: 'user', content: text });
      } else if (label === 'Assistant message') {
        const contentWrapper = document.createElement('div');
        Array.from(article.children).forEach(child => {
          if (child.classList?.contains('sr-only')) return;
          if (child.tagName === 'BUTTON' || child.tagName === 'DETAILS') return;
          if (child.classList?.contains('thinking') || child.classList?.contains('reasoning')) return;

          if (child.tagName === 'DIV' && child.querySelector('pre')) {
            const pre = child.querySelector('pre');
            const code = pre.querySelector('code');
            const langSpan = child.querySelector('[class*="top-0"] span');
            const lang = langSpan ? langSpan.textContent.trim() : '';
            const newPre = document.createElement('pre');
            const newCode = document.createElement('code');
            if (lang) newCode.className = 'language-' + lang;
            newCode.textContent = code ? code.textContent : pre.textContent;
            newPre.appendChild(newCode);
            contentWrapper.appendChild(newPre);
            return;
          }

          if (child.tagName === 'DIV' && child.querySelector('table')) {
            contentWrapper.appendChild(child.querySelector('table').cloneNode(true));
            return;
          }

          if (child.tagName === 'DIV' && child.querySelector('button')) return;

          contentWrapper.appendChild(child.cloneNode(true));
        });
        const md = markdownFromEl(contentWrapper);
        if (md) messages.push({ role: 'assistant', content: md });
      }
    });

    let model = '';
    const modelCombo = document.querySelector('[role="combobox"][aria-label*="Current model"]');
    if (modelCombo) {
      const match = modelCombo.getAttribute('aria-label').match(/Current model:\s*(.+)/);
      if (match) model = match[1].trim();
    }

    return { title, messages, model, service: 'T3 Chat' };
  }

  function generateFullMarkdown(data) {
    const lines = ['# ' + data.title, ''];
    if (data.model) lines.push('Model: ' + data.model);
    lines.push('Created: ' + new Date().toLocaleString(), 'Exported from: ' + data.service, '');

    for (const msg of data.messages) {
      lines.push(`### ${msg.role === 'user' ? 'User' : 'Assistant'}`, '', msg.content, '');
    }

    return lines.join('\n');
  }

  async function exportChat() {
    const handler = getSiteHandler();
    if (!handler) {
      alert('このサイトではダウンロード機能はサポートされていません。');
      return;
    }

    let data;
    try {
      data = await handler.extractConversation();
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
    const filename = sanitizeFilenameForDownload(data.title) + ' - ' + formatDate(new Date(), 'full') + '.md';
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

  const CAPTURE_STYLE_CSS = `
    :root {
      --obsidian-capture-btn-bg: #ffffff;
      --obsidian-capture-btn-hover-bg: #e8e8e8;
      --obsidian-capture-btn-fg: #333333;
      --obsidian-capture-btn-border: rgba(0, 0, 0, 0.15);
      --obsidian-capture-btn-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      --obsidian-capture-modal-bg: #ffffff;
      --obsidian-capture-modal-fg: #222222;
      --obsidian-capture-modal-border: rgba(0, 0, 0, 0.12);
      --obsidian-capture-input-bg: #ffffff;
      --obsidian-capture-input-fg: #222222;
      --obsidian-capture-input-border: rgba(0, 0, 0, 0.18);
      --obsidian-capture-secondary-bg: #eeeeee;
      --obsidian-capture-secondary-fg: #222222;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --obsidian-capture-btn-bg: #2d2d2d;
        --obsidian-capture-btn-hover-bg: #3d3d3d;
        --obsidian-capture-btn-fg: #efefef;
        --obsidian-capture-btn-border: rgba(255, 255, 255, 0.2);
        --obsidian-capture-btn-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        --obsidian-capture-modal-bg: #232323;
        --obsidian-capture-modal-fg: #efefef;
        --obsidian-capture-modal-border: rgba(255, 255, 255, 0.14);
        --obsidian-capture-input-bg: #1b1b1b;
        --obsidian-capture-input-fg: #efefef;
        --obsidian-capture-input-border: rgba(255, 255, 255, 0.18);
        --obsidian-capture-secondary-bg: #3a3a3a;
        --obsidian-capture-secondary-fg: #efefef;
      }
    }

    html.dark,
    body.dark,
    [data-theme="dark"] {
      --obsidian-capture-btn-bg: #2d2d2d;
      --obsidian-capture-btn-hover-bg: #3d3d3d;
      --obsidian-capture-btn-fg: #efefef;
      --obsidian-capture-btn-border: rgba(255, 255, 255, 0.2);
      --obsidian-capture-btn-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      --obsidian-capture-modal-bg: #232323;
      --obsidian-capture-modal-fg: #efefef;
      --obsidian-capture-modal-border: rgba(255, 255, 255, 0.14);
      --obsidian-capture-input-bg: #1b1b1b;
      --obsidian-capture-input-fg: #efefef;
      --obsidian-capture-input-border: rgba(255, 255, 255, 0.18);
      --obsidian-capture-secondary-bg: #3a3a3a;
      --obsidian-capture-secondary-fg: #efefef;
    }

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
      width: ${BUTTON_SIZE}px;
      height: ${BUTTON_SIZE}px;
      padding: 0;
      border-radius: 999px;
      cursor: pointer;
      transition: transform 0.15s ease, background-color 0.2s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background-color: var(--obsidian-capture-btn-bg) !important;
      color: var(--obsidian-capture-btn-fg) !important;
      border: 1px solid var(--obsidian-capture-btn-border) !important;
      box-shadow: var(--obsidian-capture-btn-shadow) !important;
    }

    .obsidian-capture-btn:hover {
      background-color: var(--obsidian-capture-btn-hover-bg) !important;
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

    .obsidian-capture-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: rgba(0, 0, 0, 0.45);
    }

    .obsidian-capture-modal {
      width: min(520px, calc(100vw - 32px));
      padding: 16px;
      border-radius: 14px;
      background: var(--obsidian-capture-modal-bg);
      color: var(--obsidian-capture-modal-fg);
      border: 1px solid var(--obsidian-capture-modal-border);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.28);
    }

    .obsidian-capture-modal-title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 6px;
    }

    .obsidian-capture-modal-desc {
      font-size: 13px;
      opacity: 0.8;
      margin-bottom: 12px;
    }

    .obsidian-capture-modal-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 6px;
    }

    .obsidian-capture-modal-input {
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid var(--obsidian-capture-input-border);
      background: var(--obsidian-capture-input-bg);
      color: var(--obsidian-capture-input-fg);
      outline: none;
    }

    .obsidian-capture-modal-input:focus {
      border-color: #4f8cff;
      box-shadow: 0 0 0 3px rgba(79, 140, 255, 0.18);
    }

    .obsidian-capture-modal-preview {
      margin-top: 10px;
      font-size: 12px;
      opacity: 0.8;
      word-break: break-all;
      font-family: ui-monospace, SFMono-Regular, Monaco, Consolas,
        "Liberation Mono", "Courier New", monospace;
    }

    .obsidian-capture-modal-error {
      margin-top: 10px;
      font-size: 12px;
      color: #c62828;
      white-space: pre-wrap;
    }

    .obsidian-capture-modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }

    .obsidian-capture-modal-btn {
      border: 0;
      border-radius: 10px;
      padding: 10px 14px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
    }

    .obsidian-capture-modal-btn.secondary {
      background: var(--obsidian-capture-secondary-bg);
      color: var(--obsidian-capture-secondary-fg);
    }

    .obsidian-capture-modal-btn.primary {
      background: #4f8cff;
      color: #ffffff;
    }
  `;

  function ensureCaptureStyle() {
    if (document.getElementById(CAPTURE_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = CAPTURE_STYLE_ID;
    style.textContent = CAPTURE_STYLE_CSS;
    document.head.appendChild(style);
  }

  function injectButton() {
    if (document.querySelector(".obsidian-capture-container")) return;

    ensureMaterialSymbolsCss();
    ensureCaptureStyle();

    const container = document.createElement("div");
    container.className = "obsidian-capture-container";

    container.appendChild(makeIconButton({ iconName: "calendar_add_on", label: "Dailyへ追記", onClick: onClickDaily }));
    container.appendChild(makeIconButton({ iconName: "note_add", label: "新規ノート", onClick: onClickNewNote }));
    container.appendChild(makeIconButton({ iconName: "download", label: "チャット全体をMarkdownでダウンロード (Alt+S)", onClick: exportChat }));

    document.body.appendChild(container);

    fallbackIconsIfNeeded(container).catch(() => {});
  }

  function initializeScript() {
    if (typeof TurndownService === "undefined") {
      setTimeout(initializeScript, 100);
      return;
    }
    ensureTurndown();
    migrateLocalStorageToGMOncePerHost();
    injectButton();
    setupExportShortcut();
  }

  initializeScript();
})();
