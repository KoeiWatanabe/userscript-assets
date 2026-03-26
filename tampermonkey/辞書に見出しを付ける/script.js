// ==UserScript==
// @name         辞書に見出しを付ける
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  OALD / Cambridge Dictionary に意味の目次をサイドバーとしてページ内に組み込む
// @match        https://www.oxfordlearnersdictionaries.com/definition/english/*
// @match        https://dictionary.cambridge.org/dictionary/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/辞書に見出しを付ける/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/辞書に見出しを付ける/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/辞書に見出しを付ける/icon_128.png
// ==/UserScript==

(function () {
  "use strict";

  const SITE =
    location.hostname === "www.oxfordlearnersdictionaries.com"
      ? "oald"
      : "cambridge";

  // --- サイト別の設定 ---
  const CONFIG = {
    oald: {
      accentColor: "#0056b3",
      headerBg: "#0056b3",
      // OALDはヘッダー+検索バーがスクロールで消える → 表示中はその下端に追従
      getHeaderBottom: () => {
        const sb = document.getElementById("searchbar");
        if (sb) return Math.max(sb.getBoundingClientRect().bottom, 0) + 10;
        const h = document.getElementById("ox-header");
        return h ? Math.max(h.getBoundingClientRect().bottom, 0) + 10 : 10;
      },
    },
    cambridge: {
      accentColor: "#00bdb6",
      headerBg: "#00bdb6",
      // Cambridgeは固定ヘッダー (#header) の下端に追従
      getHeaderBottom: () => {
        const h = document.querySelector("#header");
        return h ? Math.max(h.getBoundingClientRect().bottom, 0) + 10 : 10;
      },
    },
  }[SITE];

  // --- スタイル ---
  const style = document.createElement("style");
  style.textContent = `
    /* --- サイドバー本体 (position:fixed で左カラム上に重ねる) --- */
    #dict-toc-sidebar {
      position: fixed;
      z-index: 1000;
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
      overscroll-behavior: contain;
    }
    #dict-toc-sidebar.hidden {
      display: none;
    }

    /* --- ヘッダー --- */
    #dict-toc-sidebar .toc-header {
      position: sticky;
      top: 0;
      background: ${CONFIG.headerBg};
      color: #fff;
      padding: 10px 14px;
      font-size: 15px;
      font-weight: bold;
      border-radius: 8px 8px 0 0;
      z-index: 1;
    }

    /* --- 本文 --- */
    #dict-toc-sidebar .toc-body {
      padding: 0;
    }

    /* --- 辞書タイトル (Cambridge) --- */
    #dict-toc-sidebar .toc-dict-title {
      padding: 8px 14px;
      font-weight: bold;
      color: #fff;
      background: #1a3a5c;
      font-size: 13px;
      margin-top: 2px;
    }
    #dict-toc-sidebar .toc-dict-title:first-child {
      margin-top: 0;
    }
    #dict-toc-sidebar .toc-dict-title:hover {
      background: #243f5f;
    }

    /* --- 折りたたみ見出し (品詞) --- */
    #dict-toc-sidebar .toc-collapsible {
      padding: 6px 14px;
      font-weight: bold;
      color: #333;
      background: #f0f0f0;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid #ddd;
      user-select: none;
    }
    #dict-toc-sidebar .toc-collapsible:hover {
      background: #e4e4e4;
    }
    #dict-toc-sidebar .toc-collapsible .toc-arrow {
      font-size: 10px;
      transition: transform 0.2s;
    }
    #dict-toc-sidebar .toc-collapsible.open .toc-arrow {
      transform: rotate(90deg);
    }
    #dict-toc-sidebar .toc-collapsible.toc-sub {
      padding-left: 28px;
      font-size: 12px;
      font-weight: normal;
      color: #555;
      background: #f8f8f8;
    }
    #dict-toc-sidebar .toc-collapsible.toc-sub:hover {
      background: #efefef;
    }
    #dict-toc-sidebar .toc-collapse-body {
      display: none;
    }
    #dict-toc-sidebar .toc-collapse-body.open {
      display: block;
    }

    /* --- グループ見出し --- */
    #dict-toc-sidebar .toc-group-heading {
      padding: 6px 14px 3px;
      font-weight: bold;
      color: ${CONFIG.accentColor};
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 0.5px;
      border-top: 1px solid #eee;
      margin-top: 4px;
      cursor: pointer;
    }
    #dict-toc-sidebar .toc-group-heading:first-child {
      border-top: none;
      margin-top: 0;
    }
    #dict-toc-sidebar .toc-group-heading:hover {
      background: #f0f6ff;
    }

    /* --- 定義行 --- */
    #dict-toc-sidebar .toc-sense {
      padding: 3px 14px 3px 28px;
      cursor: pointer;
      color: #333;
      border-left: 3px solid transparent;
    }
    #dict-toc-sidebar .toc-sense:hover {
      background: #f0f6ff;
      border-left-color: ${CONFIG.accentColor};
    }
    #dict-toc-sidebar .toc-sense .toc-sense-num {
      color: ${CONFIG.accentColor};
      font-weight: bold;
      margin-right: 4px;
    }

    /* --- セクションタイトル --- */
    #dict-toc-sidebar .toc-section-title {
      padding: 8px 14px 4px;
      font-weight: bold;
      color: #fff;
      background: #5a5a5a;
      font-size: 13px;
      margin-top: 6px;
    }

    /* --- Idiom / Phrasal Verb 項目 --- */
    #dict-toc-sidebar .toc-idiom-item,
    #dict-toc-sidebar .toc-pv-item {
      padding: 3px 14px 3px 28px;
      cursor: pointer;
      color: #333;
      border-left: 3px solid transparent;
    }
    #dict-toc-sidebar .toc-idiom-item:hover,
    #dict-toc-sidebar .toc-pv-item:hover {
      background: #f5f5f5;
      border-left-color: #5a5a5a;
    }

    /* --- フレーズ --- */
    #dict-toc-sidebar .toc-phrase {
      padding: 3px 14px 3px 36px;
      cursor: pointer;
      color: #666;
      font-size: 12px;
      border-left: 3px solid transparent;
    }
    #dict-toc-sidebar .toc-phrase:hover {
      background: #f0f6ff;
      border-left-color: #999;
    }
    #dict-toc-sidebar .toc-phrase::before {
      content: "\\25B8 ";
      color: #999;
    }

    /* --- スクロールバー (Chrome/Edge) --- */
    #dict-toc-sidebar::-webkit-scrollbar {
      width: 5px;
    }
    #dict-toc-sidebar::-webkit-scrollbar-thumb {
      background: #ccc;
      border-radius: 3px;
    }
    /* --- スクロールバー (Firefox/Zen) --- */
    #dict-toc-sidebar {
      scrollbar-width: thin;
      scrollbar-color: #ccc transparent;
    }

    /* --- ハイライト --- */
    .dict-toc-highlight {
      animation: dict-toc-flash 1.5s ease;
    }
    @keyframes dict-toc-flash {
      0%   { background-color: #fff3cd; }
      100% { background-color: transparent; }
    }

  `;
  document.head.appendChild(style);

  // --- ユーティリティ ---
  function scrollToEl(el, block = "center") {
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block });
    el.classList.remove("dict-toc-highlight");
    void el.offsetWidth;
    el.classList.add("dict-toc-highlight");
  }

  function scrollToId(id, block = "center") {
    scrollToEl(document.getElementById(id), block);
  }

  function cleanDef(text) {
    return text.replace(/:$/, "");
  }

  let idCounter = 0;
  function ensureId(el, prefix) {
    if (!el.id) {
      el.id = `${prefix}-${idCounter++}`;
    }
    return el.id;
  }

  // --- OALD データ収集 ---
  function collectOALD() {
    const data = { headword: "", entries: [] };
    const hwEl = document.querySelector(".headword");
    data.headword = hwEl ? hwEl.textContent.trim() : "";

    const entry = { pos: "", groups: [], idioms: [], phrasalVerbs: [] };
    let senseCounter = 1;

    document.querySelectorAll(".shcut-g").forEach((sg) => {
      const heading = sg.querySelector(".shcut");
      const group = {
        heading: heading ? heading.textContent.trim() : "",
        el: sg,
        senses: [],
      };
      sg.querySelectorAll("li.sense").forEach((s) => {
        const def = s.querySelector(".def");
        group.senses.push({
          num: senseCounter++,
          el: s,
          def: def ? def.textContent.trim() : "",
        });
      });
      entry.groups.push(group);
    });

    const ungroupedSenses = [];
    document.querySelectorAll(".entry li.sense").forEach((s) => {
      if (!s.closest(".shcut-g") && !s.closest(".idm-g")) {
        const def = s.querySelector(".def");
        ungroupedSenses.push({
          num: senseCounter++,
          el: s,
          def: def ? def.textContent.trim() : "",
        });
      }
    });
    if (ungroupedSenses.length > 0) {
      entry.groups.unshift({ heading: "", el: null, senses: ungroupedSenses });
    }

    document.querySelectorAll(".idm-g").forEach((ig) => {
      const idm = ig.querySelector(".idm");
      entry.idioms.push({
        text: idm ? idm.textContent.trim() : "",
        el: ig,
      });
    });

    const pvSection = document.querySelector(".phrasal_verb_links");
    if (pvSection) {
      pvSection.querySelectorAll("a.Ref").forEach((a) => {
        entry.phrasalVerbs.push({
          text: a.textContent.trim(),
          href: a.getAttribute("href"),
        });
      });
    }

    data.entries.push(entry);
    return data;
  }

  // --- Cambridge データ収集 ---
  function collectCambridge() {
    const DICT_LABELS = {
      cald4: "English",
      cacd: "American",
      cbed: "Business",
    };

    const data = { headword: "", dicts: [] };
    const hwEl = document.querySelector(".hw.dhw");
    data.headword = hwEl ? hwEl.textContent.trim() : "";

    document.querySelectorAll(".pr.dictionary").forEach((dictEl) => {
      const dictId = dictEl.dataset.id || "";
      const label = DICT_LABELS[dictId] || dictId;
      const dict = { label, el: dictEl, entries: [] };

      dictEl.querySelectorAll(".entry-body__el").forEach((entryEl) => {
        const pos = entryEl.querySelector(".pos");
        const entry = {
          pos: pos ? pos.textContent.trim() : "",
          el: entryEl,
          groups: [],
          idioms: [],
          phrasalVerbs: [],
        };

        let senseCounter = 1;

        entryEl.querySelectorAll(".dsense").forEach((ds) => {
          const gw = ds.querySelector(".dsense_h .guideword span");
          const group = {
            heading: gw ? gw.textContent.trim() : "",
            el: ds,
            senses: [],
          };
          const seenPhrases = new Set();
          ds.querySelectorAll(".def-block").forEach((db) => {
            const phraseBlock = db.closest(".phrase-block");
            if (phraseBlock) {
              const phraseTitle = phraseBlock.querySelector(".phrase-title");
              if (phraseTitle && !seenPhrases.has(phraseBlock)) {
                seenPhrases.add(phraseBlock);
                group.senses.push({
                  num: null,
                  el: phraseBlock,
                  phrase: phraseTitle.textContent.trim(),
                });
              }
            } else {
              const def = db.querySelector(".ddef_d");
              group.senses.push({
                num: senseCounter++,
                el: db,
                def: def ? def.textContent.trim() : "",
              });
            }
          });
          entry.groups.push(group);
        });

        entryEl.querySelectorAll(".xref.idioms a").forEach((a) => {
          entry.idioms.push({
            text: a.textContent.trim(),
            href: a.getAttribute("href"),
          });
        });

        entryEl.querySelectorAll(".xref.phrasal_verbs a").forEach((a) => {
          entry.phrasalVerbs.push({
            text: a.textContent.trim(),
            href: a.getAttribute("href"),
          });
        });

        if (
          entry.groups.length > 0 ||
          entry.idioms.length > 0 ||
          entry.phrasalVerbs.length > 0
        ) {
          dict.entries.push(entry);
        }
      });

      if (dict.entries.length > 0) {
        data.dicts.push(dict);
      }
    });

    return data;
  }

  // --- 折りたたみセクション ---
  function createCollapsible(label, contentBuilder) {
    const header = document.createElement("div");
    header.className = "toc-collapsible";
    header.innerHTML = `<span>${label}</span><span class="toc-arrow">\u25B6</span>`;

    const content = document.createElement("div");
    content.className = "toc-collapse-body";
    contentBuilder(content);

    header.addEventListener("click", () => {
      header.classList.toggle("open");
      content.classList.toggle("open");
    });

    return { header, content };
  }

  // --- エントリの中身（グループ・定義）を描画 ---
  function renderEntryContent(container, entry) {
    entry.groups.forEach((group) => {
      if (group.heading) {
        const h = document.createElement("div");
        h.className = "toc-group-heading";
        h.textContent = group.heading;
        if (group.el) {
          const gid = ensureId(group.el, "dtoc-grp");
          h.addEventListener("click", () => scrollToId(gid));
        }
        container.appendChild(h);
      }

      group.senses.forEach((sense) => {
        const item = document.createElement("div");
        if (sense.phrase) {
          item.className = "toc-phrase";
          item.textContent = sense.phrase;
        } else {
          item.className = "toc-sense";
          item.innerHTML = `<span class="toc-sense-num">${sense.num}.</span> ${cleanDef(sense.def)}`;
        }
        if (sense.el) {
          const sid = ensureId(sense.el, "dtoc-sns");
          item.addEventListener("click", () => scrollToId(sid));
        }
        container.appendChild(item);
      });
    });
  }

  // --- Idioms ---
  function renderIdioms(container, idioms) {
    idioms.forEach((idiom) => {
      const item = document.createElement("div");
      item.className = "toc-idiom-item";
      item.textContent = idiom.text;
      if (idiom.el) {
        const iid = ensureId(idiom.el, "dtoc-idm");
        item.addEventListener("click", () => scrollToId(iid));
      } else if (idiom.href) {
        item.addEventListener("click", () => {
          window.location.href = idiom.href;
        });
      }
      container.appendChild(item);
    });
  }

  // --- Phrasal Verbs ---
  function renderPhrasalVerbs(container, pvs) {
    pvs.forEach((pv) => {
      const item = document.createElement("div");
      item.className = "toc-pv-item";
      item.textContent = pv.text;
      if (pv.href) {
        item.addEventListener("click", () => {
          window.location.href = pv.href;
        });
      }
      container.appendChild(item);
    });
  }

  // --- フラット表示 (品詞1つ / OALD) ---
  function renderEntryFlat(body, entry) {
    renderEntryContent(body, entry);

    if (entry.idioms.length > 0) {
      const title = document.createElement("div");
      title.className = "toc-section-title";
      title.textContent = `Idioms (${entry.idioms.length})`;
      body.appendChild(title);
      renderIdioms(body, entry.idioms);
    }

    if (entry.phrasalVerbs.length > 0) {
      const title = document.createElement("div");
      title.className = "toc-section-title";
      title.textContent = `Phrasal Verbs (${entry.phrasalVerbs.length})`;
      body.appendChild(title);
      renderPhrasalVerbs(body, entry.phrasalVerbs);
    }
  }

  // --- 折りたたみ表示 (品詞複数) ---
  function renderEntryCollapsible(body, entry) {
    if (entry.groups.length > 0) {
      const totalSenses = entry.groups.reduce(
        (sum, g) => sum + g.senses.filter((s) => s.num !== null).length,
        0
      );
      const label = `${entry.pos} (${totalSenses})`;
      const { header, content } = createCollapsible(label, (c) => {
        renderEntryContent(c, entry);
      });
      body.appendChild(header);
      body.appendChild(content);
    }

    if (entry.idioms.length > 0) {
      const label = `Idioms (${entry.idioms.length})`;
      const { header, content } = createCollapsible(label, (c) => {
        renderIdioms(c, entry.idioms);
      });
      header.classList.add("toc-sub");
      body.appendChild(header);
      body.appendChild(content);
    }

    if (entry.phrasalVerbs.length > 0) {
      const label = `Phrasal Verbs (${entry.phrasalVerbs.length})`;
      const { header, content } = createCollapsible(label, (c) => {
        renderPhrasalVerbs(c, entry.phrasalVerbs);
      });
      header.classList.add("toc-sub");
      body.appendChild(header);
      body.appendChild(content);
    }
  }

  // --- OALD TOC Body ---
  function buildOALDBody(body, data) {
    const entry = data.entries[0];
    renderEntryFlat(body, entry);
  }

  // --- Cambridge: 品詞セクション（常に展開・クリックでジャンプ） ---
  function renderCambridgeEntry(body, entry) {
    if (entry.groups.length > 0) {
      const totalSenses = entry.groups.reduce(
        (sum, g) => sum + g.senses.filter((s) => s.num !== null).length,
        0
      );
      const label = `${entry.pos} (${totalSenses})`;
      const header = document.createElement("div");
      header.className = "toc-collapsible open";
      header.innerHTML = `<span>${label}</span>`;
      if (entry.el) {
        const eid = ensureId(entry.el, "dtoc-entry");
        header.addEventListener("click", () => scrollToId(eid, "start"));
      }
      body.appendChild(header);
      renderEntryContent(body, entry);
    }

    if (entry.idioms.length > 0) {
      const header = document.createElement("div");
      header.className = "toc-collapsible toc-sub open";
      header.innerHTML = `<span>Idioms (${entry.idioms.length})</span>`;
      body.appendChild(header);
      renderIdioms(body, entry.idioms);
    }

    if (entry.phrasalVerbs.length > 0) {
      const header = document.createElement("div");
      header.className = "toc-collapsible toc-sub open";
      header.innerHTML = `<span>Phrasal Verbs (${entry.phrasalVerbs.length})</span>`;
      body.appendChild(header);
      renderPhrasalVerbs(body, entry.phrasalVerbs);
    }
  }

  // --- Cambridge TOC Body ---
  function buildCambridgeBody(body, data) {
    data.dicts.forEach((dict) => {
      const dictTitle = document.createElement("div");
      dictTitle.className = "toc-dict-title";
      dictTitle.textContent = dict.label;
      if (dict.el) {
        const did = ensureId(dict.el, "dtoc-dict");
        dictTitle.style.cursor = "pointer";
        dictTitle.addEventListener("click", () => scrollToId(did, "start"));
      }
      body.appendChild(dictTitle);

      dict.entries.forEach((entry) => {
        renderCambridgeEntry(body, entry);
      });
    });
  }

  // --- サイドバー要素を構築 ---
  function createSidebar(bodyBuilder) {
    const sidebar = document.createElement("div");
    sidebar.id = "dict-toc-sidebar";

    const header = document.createElement("div");
    header.className = "toc-header";
    header.textContent = "Definition";
    sidebar.appendChild(header);

    const body = document.createElement("div");
    body.className = "toc-body";
    bodyBuilder(body);
    sidebar.appendChild(body);

    return sidebar;
  }

  // --- 左カラムの参照要素を取得 ---
  function getAnchorCol() {
    if (SITE === "cambridge") {
      const primary = document.querySelector(".x.lpl-10 > .hdn.hdb-m.hfl-m");
      if (primary) {
        const r = primary.getBoundingClientRect();
        if (r.width > 0) return primary;
      }
      return null;
    }
    return document.querySelector(".responsive_row > .responsive_entry_left");
  }

  // --- Cambridge: 記事・右パネルの実測値からTOC位置を計算 ---
  function getCambridgeTocRect(anchorCol) {
    const article = document.querySelector(".hfl-s.lt2b.lp-s_r-20");
    const rightPanel = document.querySelector(".hfr-s.lt2s");

    if (article && rightPanel) {
      const articleRect = article.getBoundingClientRect();
      const rightRect = rightPanel.getBoundingClientRect();
      const articlePadRight = parseFloat(getComputedStyle(article).paddingRight) || 0;
      // 右パネルとの実際のギャップ (記事の padding-right 分)
      const rightGap = rightRect.left - articleRect.right + articlePadRight;

      // アンカー要素がある場合はその左端を使い、なければ記事左端から逆算
      const anchorLeft = anchorCol
        ? anchorCol.getBoundingClientRect().left
        : Math.max(articleRect.left - 300 - rightGap, 5);
      const width = articleRect.left - anchorLeft - rightGap;

      if (width > 150) {
        return { left: anchorLeft, width };
      }
    }

    // 最終フォールバック
    return { left: 5, width: 240 };
  }

  // --- メイン ---
  function buildTOC() {
    let bodyBuilder;

    if (SITE === "oald") {
      const data = collectOALD();
      if (data.entries.length === 0) return;
      bodyBuilder = (body) => buildOALDBody(body, data);
    } else {
      const data = collectCambridge();
      if (data.dicts.length === 0) return;
      bodyBuilder = (body) => buildCambridgeBody(body, data);
    }

    const anchorCol = getAnchorCol();
    // Cambridge でアンカーが見つからなくてもフォールバックで表示する
    if (!anchorCol && SITE !== "cambridge") return;

    const sidebar = createSidebar(bodyBuilder);
    document.body.appendChild(sidebar);

    // position:fixed で左カラムの位置に追従
    function updatePosition() {
      const top = CONFIG.getHeaderBottom();
      let left, width;

      if (SITE === "cambridge") {
        // Cambridge: 常に記事・右パネルの実測値から統一計算
        const r = getCambridgeTocRect(anchorCol);
        left = r.left;
        width = r.width;
      } else if (anchorCol) {
        const rect = anchorCol.getBoundingClientRect();
        left = rect.left;
        width = rect.width;
      } else {
        return; // OALD でアンカーなしは表示しない
      }

      // フッター / 常時表示バーと重ならないよう maxHeight を制限
      let bottomLimit = window.innerHeight;
      const footerSels = SITE === "cambridge"
        ? ["#footer", ".pf.py.pb0.pl0.pr0"]   // 通常フッター + 常時表示ボトムバー
        : ["#ox-footer"];                       // OALD フッター
      for (const sel of footerSels) {
        const el = document.querySelector(sel);
        if (el) {
          const elTop = el.getBoundingClientRect().top;
          if (elTop > 0 && elTop < bottomLimit) bottomLimit = elTop;
        }
      }
      const maxH = bottomLimit - top - 10;

      sidebar.style.top = top + "px";
      sidebar.style.left = left + "px";
      sidebar.style.width = width + "px";
      sidebar.style.maxHeight = maxH + "px";
      sidebar.style.overflowY = "auto";
    }
    updatePosition();
    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition, { passive: true });

    // Alt+T でトグル
    document.addEventListener("keydown", (e) => {
      if (e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        sidebar.classList.toggle("hidden");
      }
    });
  }

  buildTOC();
})();
