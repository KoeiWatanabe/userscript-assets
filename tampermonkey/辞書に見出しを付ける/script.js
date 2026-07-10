// ==UserScript==
// @name         辞書に見出しを付ける
// @namespace    http://tampermonkey.net/
// @version      2.5.5
// @description  OALD / Cambridge Dictionary / Collins Dictionary に意味の目次をサイドバーとしてページ内に組み込む
// @match        https://www.oxfordlearnersdictionaries.com/definition/english/*
// @match        https://dictionary.cambridge.org/dictionary/*
// @match        https://www.collinsdictionary.com/dictionary/english/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/辞書に見出しを付ける/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/辞書に見出しを付ける/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/辞書に見出しを付ける/icon_128.png
// ==/UserScript==

(function () {
  "use strict";

  const SITE_BY_HOST = {
    "www.oxfordlearnersdictionaries.com": "oald",
    "dictionary.cambridge.org": "cambridge",
    "www.collinsdictionary.com": "collins",
  };
  const SITE = SITE_BY_HOST[location.hostname];

  // --- サイト別の設定 ---
  const CONFIG = {
    oald: {
      accentColor: "#0056b3",
      headerBg: "#0056b3",
      dictTitleBg: "#1a3a5c",
      sectionTitleBg: "#5a5a5a",
      hoverBg: "#f0f6ff",
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
      dictTitleBg: "#1a3a5c",
      sectionTitleBg: "#5a5a5a",
      hoverBg: "#f0f6ff",
      // Cambridgeは固定ヘッダー (#header) の下端に追従
      getHeaderBottom: () => {
        const h = document.querySelector("#header");
        return h ? Math.max(h.getBoundingClientRect().bottom, 0) + 10 : 10;
      },
    },
    collins: {
      accentColor: "#cc1f26",
      headerBg: "#cc1f26",
      dictTitleBg: "#7e7e7e",
      sectionTitleBg: "#6f7d90",
      hoverBg: "#f7fbff",
      getHeaderBottom: () => {
        const candidates = [
          document.querySelector(".top"),
          document.querySelector(".navigation"),
          document.querySelector("header"),
        ].filter((el) => {
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          return rect.bottom > 0 && rect.top < 120 && rect.bottom < window.innerHeight * 0.5;
        });
        if (candidates.length === 0) return 10;
        return (
          Math.max(
            ...candidates.map((el) => Math.max(el.getBoundingClientRect().bottom, 0))
          ) + 10
        );
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
      box-sizing: border-box;
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
      overscroll-behavior: contain;
    }
    #dict-toc-sidebar.hidden,
    #dict-toc-sidebar.auto-hidden {
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

    /* --- 辞書タイトル --- */
    #dict-toc-sidebar .toc-dict-title {
      padding: 8px 14px;
      font-weight: bold;
      color: #fff;
      background: ${CONFIG.dictTitleBg};
      font-size: 13px;
      margin-top: 2px;
    }
    #dict-toc-sidebar .toc-dict-title:first-child {
      margin-top: 0;
    }
    #dict-toc-sidebar .toc-dict-title:hover {
      filter: brightness(0.92);
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
      background: ${CONFIG.hoverBg};
    }

    /* --- 定義行 --- */
    #dict-toc-sidebar .toc-sense {
      padding: 3px 14px 3px 28px;
      cursor: pointer;
      color: #333;
      border-left: 3px solid transparent;
    }
    #dict-toc-sidebar .toc-sense:hover {
      background: ${CONFIG.hoverBg};
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
      background: ${CONFIG.sectionTitleBg};
      font-size: 13px;
      margin-top: 6px;
    }

    #dict-toc-sidebar .toc-section-link {
      padding: 5px 14px 5px 28px;
      cursor: pointer;
      color: #333;
      border-left: 3px solid transparent;
    }
    #dict-toc-sidebar .toc-section-link:hover {
      background: ${CONFIG.hoverBg};
      border-left-color: ${CONFIG.sectionTitleBg};
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
      background: ${CONFIG.hoverBg};
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

  function normalizeText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function truncateText(text, maxLen = 80) {
    const normalized = normalizeText(text);
    if (normalized.length <= maxLen) return normalized;
    return normalized.slice(0, maxLen - 1).trimEnd() + "…";
  }

  function stripCollinsCobuildMeta(text) {
    return normalizeText(text)
      .replace(/^\.\.\.\s*/, "")
      .replace(/^(\d+|[a-z])\.\s*/i, "")
      .replace(
        /^(?:(?:countable|uncountable|singular|plural|transitive|intransitive|linking|reciprocal|auxiliary|modal|ordinal|predeterminer)\s+)*(?:noun|verb|adjective|adverb|pronoun|preposition|conjunction|determiner|interjection|exclamation|modal verb|phrasal verb|combining form)(?:\s+\[[^\]]+\])*(?:\s+[A-C]\d\+?)?\s*/i,
        ""
      )
      .replace(/^(?:\[[^\]]+\]\s*)+/i, "")
      .replace(/^(?:[A-C]\d\+?\s*)+/i, "")
      .trim();
  }

  function stripCollinsLeadingLabels(text) {
    return normalizeText(text)
      .replace(/^(?:\([^)]*\)\s*)+/i, "")
      .replace(/^(?:\[[^\]]+\]\s*)+/i, "")
      .trim();
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

  // --- Collins データ収集 ---
  function collectCollins() {
    const DICT_LABELS = {
      Cob_Adv_Brit: "COBUILD",
      Collins_Eng_Dict: "British English",
      Large_US_Webster: "American English (Webster)",
      Penguin: "American English (Penguin)",
      ESP_Vocab_Extractive: "Oil and Gas Industry",
    };

    function sanitizeExcerpt(text) {
      return normalizeText(text)
        .replace(/\biaw\.cmd\.push[\s\S]*$/i, "")
        .replace(/\bgoogletag[\s\S]*$/i, "")
        .trim();
    }

    function buildHomLabel(hom, fallbackNum) {
      const lines = hom.innerText
        .split("\n")
        .map((line) => normalizeText(line))
        .filter(Boolean);
      const firstLine = lines[0] || "";
      const match = firstLine.match(/^(\d+)\.\s*(.*)$/);
      const num = match ? Number(match[1]) : fallbackNum;
      const firstSense = hom.querySelector(".sense");
      const excerptSource = firstSense ? firstSense.textContent : lines.slice(1).join(" ");
      const excerpt = truncateText(
        sanitizeExcerpt(
          stripCollinsCobuildMeta(excerptSource) ||
          stripCollinsCobuildMeta(lines.slice(1).join(" ")) ||
          excerptSource
        ),
        72
      );
      return {
        num,
        el: hom,
        def: excerpt || `Sense ${num}`,
      };
    }

    function buildSenseLabel(sense, fallbackNum) {
      const lines = sense.innerText
        .split("\n")
        .map((line) => normalizeText(line))
        .filter(Boolean);
      const firstLine = lines[0] || "";
      const match = firstLine.match(/^(\d+|[a-z])\.\s*(.*)$/i);
      const num = match ? match[1] : String(fallbackNum);
      const headRest = normalizeText(match ? match[2] : firstLine);
      let defLine = "";
      if (headRest && !/^\(.*\)$/.test(headRest)) {
        defLine = headRest;
      } else {
        defLine =
          lines
            .slice(1)
            .map((line) => line.replace(/^[a-z]\.\s*/i, ""))
            .find(Boolean) || "";
      }

      const def = truncateText(
        sanitizeExcerpt(
          stripCollinsLeadingLabels(defLine || headRest || sense.textContent || "")
        ),
        72
      );
      return {
        num,
        el: sense,
        def: def || `Sense ${num}`,
      };
    }

    function collectHomSenses(hom) {
      const directSenses = Array.from(hom.querySelectorAll(":scope > .sense"));
      if (directSenses.length > 0) {
        return directSenses.map((sense, index) => buildSenseLabel(sense, index + 1));
      }

      if (
        hom.matches(".sense") ||
        hom.querySelector(":scope > .def") ||
        hom.querySelector(":scope > .sensenum")
      ) {
        return [buildSenseLabel(hom, 1)];
      }

      const nestedSenses = Array.from(hom.querySelectorAll(".sense"));
      return nestedSenses.map((sense, index) => buildSenseLabel(sense, index + 1));
    }

    function collectLogicalEntries(dictBlock) {
      const nestedEntries = Array.from(dictBlock.querySelectorAll(":scope > .dictlink.dictentry"));
      if (nestedEntries.length > 0) return nestedEntries;
      if (dictBlock.querySelector(".hom")) return [dictBlock];
      return [];
    }

    function collectDictionaryBlocks(pageRoot) {
      const blocks = [];
      pageRoot.querySelectorAll(":scope > .dictionary").forEach((candidate) => {
        if (candidate.classList.contains("assets")) return;
        const nestedBlocks = Array.from(candidate.querySelectorAll(":scope > .dictionary"));
        if (nestedBlocks.length > 0) {
          blocks.push(...nestedBlocks);
        } else {
          blocks.push(candidate);
        }
      });
      return blocks;
    }

    const data = { headword: "", dicts: [], sections: [] };
    const hwEl = document.querySelector("article h2.h2_entry");
    data.headword = hwEl ? normalizeText(hwEl.textContent).replace(/\s+in\s+.*$/, "") : "";
    const rawEntries = [];

    const pageRoot = document.querySelector("article .he .page");
    if (pageRoot) {
      collectDictionaryBlocks(pageRoot).forEach((dictBlock) => {
        const dictKey = Array.from(dictBlock.classList).find((cls) => DICT_LABELS[cls]);
        collectLogicalEntries(dictBlock).forEach((entryEl) => {
          const titleEl = entryEl.querySelector("h2.h2_entry");
          const anchorEl = entryEl.querySelector(".anchor");
          const entry = {
            dictKey,
            rawTitle: normalizeText(titleEl ? titleEl.innerText : ""),
            el: anchorEl || titleEl || entryEl,
            groups: [],
            renderMode: "grouped",
            idioms: [],
            phrasalVerbs: [],
          };

          if (dictKey === "Cob_Adv_Brit") {
            entry.renderMode = "flat";
            const group = { heading: "", el: null, senses: [] };
            entryEl.querySelectorAll(".hom").forEach((hom, index) => {
              group.senses.push(buildHomLabel(hom, index + 1));
            });
            if (group.senses.length > 0) {
              entry.groups.push(group);
            }
          } else {
            entryEl.querySelectorAll(".hom").forEach((hom) => {
              const heading = normalizeText(
                hom.querySelector(":scope > .gramGrp .pos, :scope > .pos, .pos")?.textContent ||
                  ""
              );
              const group = {
                heading,
                el: hom,
                senses: [],
              };
              group.senses.push(...collectHomSenses(hom));
              if (group.senses.length > 0) {
                entry.groups.push(group);
              }
            });
            if (!entry.groups.some((group) => group.heading)) {
              entry.renderMode = "flat";
            }
          }

          if (entry.groups.some((group) => group.senses.length > 0)) {
            rawEntries.push(entry);
          }
        });
      });
    }

    const countsByKey = rawEntries.reduce((map, entry) => {
      const key = entry.dictKey || entry.rawTitle;
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {});

    rawEntries.forEach((entry) => {
      const mappedLabel = DICT_LABELS[entry.dictKey] || entry.rawTitle;
      const headwordFromTitle = entry.rawTitle.replace(/\s+in\s+.*$/, "");
      const shouldUseRawTitle =
        countsByKey[entry.dictKey || entry.rawTitle] > 1 &&
        headwordFromTitle &&
        headwordFromTitle !== data.headword;
      entry.label = shouldUseRawTitle
        ? entry.rawTitle.replace(/\s+in\s+/i, " (").replace(/\)$/, "") + ")"
        : mappedLabel;
      delete entry.dictKey;
      delete entry.rawTitle;
      data.dicts.push(entry);
    });

    const assets = document.querySelector("article .assets");
    if (assets) {
      assets.querySelectorAll("h2.entry_title, h2.h2_entry").forEach((heading) => {
        const title = normalizeText(heading.innerText);
        if (!title) return;
        data.sections.push({
          title,
          el: heading,
        });
      });
    }

    return data;
  }

  // --- 定義項目リストを描画 ---
  function renderSenseList(container, senses) {
    senses.forEach((sense) => {
      const item = document.createElement("div");
      if (sense.phrase) {
        item.className = "toc-phrase";
        item.textContent = sense.phrase;
      } else {
        item.className = "toc-sense";
        item.innerHTML = `<span class="toc-sense-num">${sense.num}.</span> ${sense.def.replace(/:$/, "")}`;
      }
      if (sense.el) {
        item.addEventListener("click", () => scrollToEl(sense.el));
      }
      container.appendChild(item);
    });
  }

  // --- エントリの中身（グループ・定義）を描画 ---
  function renderEntryContent(container, entry) {
    entry.groups.forEach((group) => {
      if (group.heading) {
        const h = document.createElement("div");
        h.className = "toc-group-heading";
        h.textContent = group.heading;
        if (group.el) {
          h.addEventListener("click", () => scrollToEl(group.el));
        }
        container.appendChild(h);
      }
      renderSenseList(container, group.senses);
    });
  }

  // --- Idiom / Phrasal Verb 項目リスト ---
  function renderXrefList(container, items, className) {
    items.forEach((item) => {
      const div = document.createElement("div");
      div.className = className;
      div.textContent = item.text;
      if (item.el) {
        div.addEventListener("click", () => scrollToEl(item.el));
      } else if (item.href) {
        div.addEventListener("click", () => {
          window.location.href = item.href;
        });
      }
      container.appendChild(div);
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
      renderXrefList(body, entry.idioms, "toc-idiom-item");
    }

    if (entry.phrasalVerbs.length > 0) {
      const title = document.createElement("div");
      title.className = "toc-section-title";
      title.textContent = `Phrasal Verbs (${entry.phrasalVerbs.length})`;
      body.appendChild(title);
      renderXrefList(body, entry.phrasalVerbs, "toc-pv-item");
    }
  }

  // --- Cambridge: 品詞セクション（常に展開・クリックでジャンプ） ---
  function renderCambridgeEntry(body, entry) {
    if (entry.groups.length > 0) {
      const totalSenses = entry.groups.reduce(
        (sum, g) => sum + g.senses.filter((s) => s.num !== null).length,
        0
      );
      const header = document.createElement("div");
      header.className = "toc-collapsible open";
      header.innerHTML = `<span>${entry.pos} (${totalSenses})</span>`;
      if (entry.el) {
        header.addEventListener("click", () => scrollToEl(entry.el, "start"));
      }
      body.appendChild(header);
      renderEntryContent(body, entry);
    }

    if (entry.idioms.length > 0) {
      const header = document.createElement("div");
      header.className = "toc-collapsible toc-sub open";
      header.innerHTML = `<span>Idioms (${entry.idioms.length})</span>`;
      body.appendChild(header);
      renderXrefList(body, entry.idioms, "toc-idiom-item");
    }

    if (entry.phrasalVerbs.length > 0) {
      const header = document.createElement("div");
      header.className = "toc-collapsible toc-sub open";
      header.innerHTML = `<span>Phrasal Verbs (${entry.phrasalVerbs.length})</span>`;
      body.appendChild(header);
      renderXrefList(body, entry.phrasalVerbs, "toc-pv-item");
    }
  }

  // --- Collins 非-COBUILD: 品詞セクション付き ---
  function renderCollinsGroupedEntry(body, entry) {
    entry.groups.forEach((group) => {
      const header = document.createElement("div");
      header.className = "toc-collapsible open";
      header.innerHTML = `<span>${group.heading} (${group.senses.length})</span>`;
      if (group.el) {
        header.addEventListener("click", () => scrollToEl(group.el, "start"));
      }
      body.appendChild(header);
      renderSenseList(body, group.senses);
    });
  }

  // --- Cambridge TOC Body ---
  function buildCambridgeBody(body, data) {
    data.dicts.forEach((dict) => {
      const dictTitle = document.createElement("div");
      dictTitle.className = "toc-dict-title";
      dictTitle.textContent = dict.label;
      if (dict.el) {
        dictTitle.style.cursor = "pointer";
        dictTitle.addEventListener("click", () => scrollToEl(dict.el, "start"));
      }
      body.appendChild(dictTitle);

      dict.entries.forEach((entry) => {
        renderCambridgeEntry(body, entry);
      });
    });
  }

  // --- Collins TOC Body ---
  function buildCollinsBody(body, data) {
    data.dicts.forEach((dict) => {
      const dictTitle = document.createElement("div");
      dictTitle.className = "toc-dict-title";
      dictTitle.textContent = dict.label;
      if (dict.el) {
        dictTitle.style.cursor = "pointer";
        dictTitle.addEventListener("click", () => scrollToEl(dict.el, "start"));
      }
      body.appendChild(dictTitle);
      if (dict.renderMode === "grouped") {
        renderCollinsGroupedEntry(body, dict);
      } else {
        renderEntryContent(body, dict);
      }
    });

    if (data.sections.length > 0) {
      const title = document.createElement("div");
      title.className = "toc-section-title";
      title.textContent = "Supplementary Sections";
      body.appendChild(title);

      data.sections.forEach((section) => {
        const item = document.createElement("div");
        item.className = "toc-section-link";
        item.textContent = section.title;
        item.addEventListener("click", () => scrollToEl(section.el, "start"));
        body.appendChild(item);
      });
    }
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
    if (SITE === "collins") {
      return document.querySelector(".dictionary .res_cell_center_content");
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

  // --- Collins: 本文左側の実際の空きからTOC位置を計算 ---
  function getCollinsTocRect() {
    const article = document.querySelector("#article_1");
    if (article) {
      const articleRect = article.getBoundingClientRect();
      const leftPanel = document.querySelector(".res_cell_left");
      const leftPanelRect = leftPanel ? leftPanel.getBoundingClientRect() : null;
      const hasVisibleLeftPanel =
        leftPanelRect &&
        leftPanelRect.width > 0 &&
        getComputedStyle(leftPanel).display !== "none";
      const gap = 12;
      const minWidth = 180;
      const maxWidth = 280;
      const leftBoundary = hasVisibleLeftPanel
        ? Math.max(leftPanelRect.left, 5)
        : Math.max(5, articleRect.left - maxWidth - gap);
      const availableWidth = articleRect.left - leftBoundary - gap;

      if (availableWidth >= minWidth) {
        return { left: leftBoundary, width: Math.min(availableWidth, maxWidth) };
      }
    }
    return null;
  }

  // --- 全サイト共通: 語釈本文に重ならない範囲へTOCを収める ---
  function fitTocBeforeContent(left, width) {
    const contentSelectors = {
      oald: ["#entryContent", "#main_column"],
      cambridge: [".pr.dictionary", ".hfl-s.lt2b.lp-s_r-20"],
      collins: ["#article_1"],
    }[SITE];
    const content = contentSelectors
      .map((sel) => document.querySelector(sel))
      .find((el) => el && el.getBoundingClientRect().width > 0);
    if (!content) return null;

    const contentLeft = content.getBoundingClientRect().left;
    const gap = 12;
    const minWidth = SITE === "collins" ? 180 : 150;
    const safeWidth = Math.min(width, contentLeft - left - gap);

    if (safeWidth < minWidth) return null;
    return { left, width: safeWidth };
  }

  // --- メイン ---
  function buildTOC() {
    let bodyBuilder;

    if (SITE === "oald") {
      const data = collectOALD();
      if (data.entries.length === 0) return;
      bodyBuilder = (body) => renderEntryFlat(body, data.entries[0]);
    } else if (SITE === "cambridge") {
      const data = collectCambridge();
      if (data.dicts.length === 0) return;
      bodyBuilder = (body) => buildCambridgeBody(body, data);
    } else {
      const data = collectCollins();
      if (data.dicts.length === 0 && data.sections.length === 0) return;
      bodyBuilder = (body) => buildCollinsBody(body, data);
    }

    const anchorCol = getAnchorCol();
    // OALD でアンカーなしは表示しない
    if (!anchorCol && SITE === "oald") return;

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
      } else if (SITE === "collins") {
        const r = getCollinsTocRect();
        if (!r) return hideAutomatically();
        left = r.left;
        width = r.width;
      } else if (anchorCol) {
        const rect = anchorCol.getBoundingClientRect();
        left = rect.left;
        width = rect.width;
      } else {
        return; // OALD でアンカーなしは表示しない
      }

      const fittedRect = fitTocBeforeContent(left, width);
      if (!fittedRect) return hideAutomatically();
      sidebar.classList.remove("auto-hidden");
      left = fittedRect.left;
      width = fittedRect.width;

      // フッター / 常時表示バーと重ならないよう maxHeight を制限
      let bottomLimit = window.innerHeight;
      const footerSels =
        SITE === "cambridge"
          ? ["#footer", ".pf.py.pb0.pl0.pr0"]
          : SITE === "collins"
            ? ["footer", ".footer", ".page_footer"]
            : ["#ox-footer"];
      for (const sel of footerSels) {
        const el = document.querySelector(sel);
        if (el) {
          const elTop = el.getBoundingClientRect().top;
          if (elTop > 0 && elTop < bottomLimit) bottomLimit = elTop;
        }
      }
      if (SITE === "collins") {
        Array.from(document.body.children).forEach((el) => {
          if (el === sidebar) return;
          const style = getComputedStyle(el);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            (style.position !== "fixed" && style.position !== "sticky")
          ) {
            return;
          }
          const rect = el.getBoundingClientRect();
          if (
            rect.height > 0 &&
            rect.top > window.innerHeight * 0.6 &&
            rect.top < bottomLimit
          ) {
            bottomLimit = rect.top;
          }
        });
      }
      const maxH = bottomLimit - top - 10;

      sidebar.style.top = top + "px";
      sidebar.style.left = left + "px";
      sidebar.style.width = width + "px";
      sidebar.style.maxHeight = maxH + "px";
      sidebar.style.overflowY = "auto";
    }

    function hideAutomatically() {
      sidebar.classList.add("auto-hidden");
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
