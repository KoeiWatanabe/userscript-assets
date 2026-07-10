// ==UserScript==
// @name         YouTubeにNGワードを設定する
// @namespace    https://tampermonkey.net/
// @version      1.3.0
// @description  YouTubeのホームフィードと動画ページのおすすめから、設定したNGワードに一致する動画を非表示にします。
// @match        https://www.youtube.com/*
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeにNGワードを設定する/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeにNGワードを設定する/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeにNGワードを設定する/icon_128.png
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const SCRIPT_KEY = "yt-news-filter";
  const HIDDEN_ATTR = `data-${SCRIPT_KEY}-hidden`;
  const CLEANUP_KEY = "__ytNewsFilterCleanup";
  const MODAL_ATTR = `data-${SCRIPT_KEY}-settings`;
  const COMMON_WORDS_KEY = "commonWords:v1";
  const ACCOUNT_WORDS_PREFIX = "accountWords:v1:";
  const DEFAULT_ACCOUNT_KEY = "default";

  const HOME_CARD_SELECTOR = [
    "ytd-rich-item-renderer",
    "ytd-rich-grid-media",
    "ytd-video-renderer",
  ].join(",");

  const WATCH_CARD_SELECTOR = [
    "yt-lockup-view-model",
    "ytd-compact-video-renderer",
    "ytd-video-renderer",
    "ytd-rich-item-renderer",
  ].join(",");

  const CARD_SELECTOR_ALL = [
    "ytd-rich-item-renderer",
    "ytd-rich-grid-media",
    "ytd-video-renderer",
    "yt-lockup-view-model",
    "ytd-compact-video-renderer",
  ].join(",");

  const TITLE_SELECTORS = [
    "#video-title",
    "a#video-title",
    "a#video-title-link",
    "yt-formatted-string#video-title",
    ".ytLockupMetadataViewModelTitle",
    "h3 a",
    "h3",
  ];

  const CHANNEL_SELECTORS = [
    "yt-content-metadata-view-model .ytContentMetadataViewModelMetadataRow:first-child .ytContentMetadataViewModelMetadataText",
    "ytd-channel-name a",
    "#channel-name a",
    "#text.ytd-channel-name",
    "ytd-channel-name yt-formatted-string",
    ".ytLockupMetadataViewModelMetadata a[href^='/@']",
    ".ytLockupMetadataViewModelMetadata a[href*='/channel/']",
    "a.yt-simple-endpoint[href^='/@']",
    "a.yt-simple-endpoint[href*='/channel/']",
  ];

  const CHANNEL_NEWS_PATTERNS = [
    /news/i,
    /ニュース/,
    /報道/,
    /速報/,
    /時事/,
    /政治/,
    /新聞/,
  ];

  const CONTENT_BLOCK_PATTERNS = [
    /\bdonald\s+trump\b/i,
    /\btrump\b/i,
    /\bmaga\b/i,
    /トランプ/,
    /共和党/,
    /大統領選/,
    /\bnews\b/i,
    /\bnewsmakers\b/i,
    /\bbreaking\s+news\b/i,
    /\bwhite\s+house\b/i,
    /\bcongress\b/i,
    /\bpresident\b/i,
    /\belection\b/i,
    /\bpolitics\b/i,
    /速報/,
    /ニュース/,
    /報道/,
    /政治/,
    /選挙/,
    /大統領/,
    /会見/,
  ];

  let observer = null;
  let scanTimer = 0;
  let lastUrl = location.href;
  let needsFullScan = true;
  let wordsVersion = 0;
  let lastAccountKey = null;
  const hideCache = new Map();
  const pendingCards = new Set();
  let checkedSignatures = new WeakMap();
  let accountCache = {
    source: "",
    key: DEFAULT_ACCOUNT_KEY,
  };

  if (typeof window[CLEANUP_KEY] === "function") {
    window[CLEANUP_KEY]();
  }

  function isHomePage() {
    return location.pathname === "/";
  }

  function isWatchPage() {
    return location.pathname === "/watch";
  }

  function isTargetPage() {
    return isHomePage() || isWatchPage();
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeWord(value) {
    return normalizeText(value).toLocaleLowerCase();
  }

  function uniqueWordsFromText(value) {
    const words = [];
    const seen = new Set();

    String(value || "")
      .split(/\r?\n/)
      .map((word) => normalizeText(word))
      .filter(Boolean)
      .forEach((word) => {
        const key = normalizeWord(word);
        if (seen.has(key)) {
          return;
        }

        seen.add(key);
        words.push(word);
      });

    return words;
  }

  function getAvatarSource() {
    const image = document.querySelector(
      "#avatar-btn img[src], button[aria-label='Account menu'] img[src], ytd-topbar-menu-button-renderer img[src]"
    );

    if (!image) {
      return "";
    }

    return String(image.getAttribute("src") || "").replace(/=s\d+.*$/, "");
  }

  function getAccountInfo() {
    const source = getAvatarSource();
    if (!source) {
      accountCache = { source: "", key: DEFAULT_ACCOUNT_KEY };
      return accountCache;
    }

    if (accountCache.source === source) {
      return accountCache;
    }

    accountCache = { source, key: `avatar:${source}` };
    return accountCache;
  }

  function getAccountWordsStorageKey(accountKey = getAccountInfo().key) {
    return `${ACCOUNT_WORDS_PREFIX}${accountKey}`;
  }

  function checkAccountChange() {
    const info = getAccountInfo();
    if (info.key !== lastAccountKey) {
      lastAccountKey = info.key;
      wordsVersion += 1;
      hideCache.clear();
      needsFullScan = true;
    }
    return info;
  }

  function readWords(storageKey) {
    const value = GM_getValue(storageKey, []);
    if (!Array.isArray(value)) {
      return [];
    }

    return uniqueWordsFromText(value.join("\n"));
  }

  function writeWords(storageKey, words) {
    GM_setValue(storageKey, uniqueWordsFromText(words.join("\n")));
  }

  function matchWords(text, words) {
    const haystack = normalizeWord(text);
    return words.some((word) => haystack.includes(normalizeWord(word)));
  }

  function getTextFromSelectors(root, selectors) {
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      if (!element) {
        continue;
      }

      const text = normalizeText(element.getAttribute("title") || element.textContent);
      if (text) {
        return text;
      }
    }

    return "";
  }

  function getChannelName(card) {
    const direct = getTextFromSelectors(card, CHANNEL_SELECTORS);
    if (direct) {
      return direct;
    }

    const metadata = card.querySelector(".ytLockupMetadataViewModelMetadata");
    if (!metadata) {
      return "";
    }

    const metadataLines = normalizeText(metadata.textContent).split(" ");
    const markerIndex = metadataLines.findIndex((part) => /\bviews?\b|回視聴/.test(part));
    if (markerIndex > 0) {
      return metadataLines.slice(0, markerIndex).join(" ");
    }

    return "";
  }

  function getCardInfo(card) {
    const title = getTextFromSelectors(card, TITLE_SELECTORS);
    const channel = getChannelName(card);
    const text = normalizeText(card.innerText || card.textContent);

    return {
      title,
      channel,
      text,
      signature: [title, channel, text.slice(0, 300)].join("\n"),
    };
  }

  function getVideoId(card) {
    const link = card.querySelector('a[href*="/watch?v="], a[href^="/shorts/"]');
    if (link) {
      const href = link.getAttribute("href");
      const match = href.match(/[?&]v=([^&]+)/) || href.match(/^\/shorts\/([^/?#]+)/);
      if (match) {
        return match[1];
      }
    }

    const idHost = card.matches("[class*='content-id-']")
      ? card
      : card.querySelector("[class*='content-id-']");
    if (idHost) {
      for (const cls of idHost.classList) {
        if (cls.startsWith("content-id-")) {
          return cls.slice("content-id-".length);
        }
      }
    }

    return "";
  }

  function matchAny(text, patterns) {
    return patterns.some((pattern) => pattern.test(text));
  }

  function shouldHide(info, commonWords, accountWords) {
    if (info.channel && matchAny(info.channel, CHANNEL_NEWS_PATTERNS)) {
      return true;
    }

    const cardText = `${info.title}\n${info.channel}\n${info.text}`;
    if (matchAny(cardText, CONTENT_BLOCK_PATTERNS)) {
      return true;
    }

    if (matchWords(cardText, commonWords)) {
      return true;
    }

    return matchWords(cardText, accountWords);
  }

  function setHidden(card, hidden) {
    if (hidden) {
      card.style.display = "none";
      card.setAttribute(HIDDEN_ATTR, "true");
      return;
    }

    if (!card.hasAttribute(HIDDEN_ATTR)) {
      return;
    }

    card.style.display = "";
    card.removeAttribute(HIDDEN_ATTR);
  }

  function getTargetCards() {
    if (isHomePage()) {
      return Array.from(document.querySelectorAll(HOME_CARD_SELECTOR));
    }

    if (!isWatchPage()) {
      return [];
    }

    const secondary = document.querySelector("#secondary, ytd-watch-next-secondary-results-renderer");
    if (!secondary) {
      return [];
    }

    return Array.from(secondary.querySelectorAll(WATCH_CARD_SELECTOR));
  }

  function resetHiddenCards() {
    document.querySelectorAll(`[${HIDDEN_ATTR}="true"]`).forEach((card) => {
      setHidden(card, false);
    });
  }

  function refreshCards() {
    wordsVersion += 1;
    hideCache.clear();
    checkedSignatures = new WeakMap();
    resetHiddenCards();
    needsFullScan = true;
    scheduleScan(0);
  }

  function processCard(card, commonWords, accountWords) {
    const info = getCardInfo(card);
    const videoId = getVideoId(card);

    if (videoId) {
      const cached = hideCache.get(videoId);
      if (cached && cached.wordsVersion === wordsVersion) {
        setHidden(card, cached.hidden);
        return;
      }

      if (!info.title && !info.channel && !info.text.trim()) {
        return;
      }

      const hidden = shouldHide(info, commonWords, accountWords);
      hideCache.set(videoId, { hidden, wordsVersion });
      setHidden(card, hidden);
      return;
    }

    if (!info.signature.trim()) {
      return;
    }

    const signature = [wordsVersion, info.signature].join("\n");
    if (checkedSignatures.get(card) === signature) {
      return;
    }

    checkedSignatures.set(card, signature);
    setHidden(card, shouldHide(info, commonWords, accountWords));
  }

  function runScan() {
    scanTimer = 0;

    if (!isTargetPage()) {
      resetHiddenCards();
      pendingCards.clear();
      needsFullScan = false;
      return;
    }

    const accountInfo = checkAccountChange();
    const commonWords = readWords(COMMON_WORDS_KEY);
    const accountWords = readWords(getAccountWordsStorageKey(accountInfo.key));
    const cards = needsFullScan ? getTargetCards() : pendingCards;

    for (const card of cards) {
      processCard(card, commonWords, accountWords);
    }

    pendingCards.clear();
    needsFullScan = false;
  }

  function scheduleScan(delay = 120) {
    if (scanTimer) {
      window.clearTimeout(scanTimer);
    }

    scanTimer = window.setTimeout(runScan, delay);
  }

  function handleUrlChange() {
    if (location.href === lastUrl) {
      return;
    }

    lastUrl = location.href;
    pendingCards.clear();
    needsFullScan = true;
    scheduleScan(250);
  }

  function collectPendingFromMutations(mutations) {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }

        if (node.matches(CARD_SELECTOR_ALL)) {
          pendingCards.add(node);
          continue;
        }

        const hostCard = node.closest && node.closest(CARD_SELECTOR_ALL);
        if (hostCard) {
          pendingCards.add(hostCard);
        }

        if (node.querySelector) {
          for (const card of node.querySelectorAll(CARD_SELECTOR_ALL)) {
            pendingCards.add(card);
          }
        }
      }
    }
  }

  function startObserver() {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
      handleUrlChange();
      collectPendingFromMutations(mutations);
      scheduleScan();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function onNavigationChange() {
    handleUrlChange();
  }

  function onPageDataUpdated() {
    needsFullScan = true;
    scheduleScan(250);
  }

  function closeSettingsModal() {
    const modal = document.querySelector(`[${MODAL_ATTR}="true"]`);
    if (modal) {
      modal.remove();
    }
  }

  function onSettingsKeydown(event) {
    if (event.key === "Escape") {
      closeSettingsModal();
    }
  }

  function openSettingsModal() {
    closeSettingsModal();

    const accountInfo = getAccountInfo();
    const commonWords = readWords(COMMON_WORDS_KEY);
    const accountWords = readWords(getAccountWordsStorageKey(accountInfo.key));
    const overlay = document.createElement("div");
    const dialog = document.createElement("div");
    const header = document.createElement("div");
    const title = document.createElement("h2");
    const closeButton = document.createElement("button");
    const account = document.createElement("div");
    const commonGroup = document.createElement("label");
    const commonLabel = document.createElement("span");
    const commonTextarea = document.createElement("textarea");
    const accountGroup = document.createElement("label");
    const accountLabel = document.createElement("span");
    const accountTextarea = document.createElement("textarea");
    const actions = document.createElement("div");
    const cancelButton = document.createElement("button");
    const saveButton = document.createElement("button");

    overlay.setAttribute(MODAL_ATTR, "true");
    dialog.className = `${SCRIPT_KEY}-dialog`;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", `${SCRIPT_KEY}-title`);

    header.className = `${SCRIPT_KEY}-header`;

    title.id = `${SCRIPT_KEY}-title`;
    title.textContent = "非表示ワードを編集";

    closeButton.type = "button";
    closeButton.className = `${SCRIPT_KEY}-icon-button`;
    closeButton.setAttribute("data-action", "cancel");
    closeButton.setAttribute("aria-label", "閉じる");
    closeButton.textContent = "×";

    account.className = `${SCRIPT_KEY}-account`;
    account.textContent = `現在のアカウント: ${accountInfo.key}`;

    commonGroup.className = `${SCRIPT_KEY}-field`;
    commonLabel.className = `${SCRIPT_KEY}-field-label`;
    commonLabel.textContent = "共通NGワード";

    commonTextarea.className = `${SCRIPT_KEY}-textarea`;
    commonTextarea.spellcheck = false;
    commonTextarea.setAttribute("data-field", "common");
    commonTextarea.setAttribute("aria-label", "共通NGワード");
    commonTextarea.value = commonWords.join("\n");

    accountGroup.className = `${SCRIPT_KEY}-field`;
    accountLabel.className = `${SCRIPT_KEY}-field-label`;
    accountLabel.textContent = "このアカウントのNGワード";

    accountTextarea.className = `${SCRIPT_KEY}-textarea`;
    accountTextarea.spellcheck = false;
    accountTextarea.setAttribute("data-field", "account");
    accountTextarea.setAttribute("aria-label", "このアカウントのNGワード");
    accountTextarea.value = accountWords.join("\n");

    actions.className = `${SCRIPT_KEY}-actions`;

    cancelButton.type = "button";
    cancelButton.className = `${SCRIPT_KEY}-button`;
    cancelButton.setAttribute("data-action", "cancel");
    cancelButton.textContent = "キャンセル";

    saveButton.type = "button";
    saveButton.className = `${SCRIPT_KEY}-button ${SCRIPT_KEY}-button-primary`;
    saveButton.setAttribute("data-action", "save");
    saveButton.textContent = "保存";

    header.append(title, closeButton);
    commonGroup.append(commonLabel, commonTextarea);
    accountGroup.append(accountLabel, accountTextarea);
    actions.append(cancelButton, saveButton);
    dialog.append(header, account, commonGroup, accountGroup, actions);
    overlay.append(dialog);

    overlay.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target === overlay || target.closest("[data-action='cancel']")) {
        closeSettingsModal();
        return;
      }

      if (target.closest("[data-action='save']")) {
        const nextCommonWords = uniqueWordsFromText(commonTextarea.value);
        const nextAccountWords = uniqueWordsFromText(accountTextarea.value);
        writeWords(COMMON_WORDS_KEY, nextCommonWords);
        writeWords(getAccountWordsStorageKey(accountInfo.key), nextAccountWords);
        closeSettingsModal();
        refreshCards();
      }
    });

    document.body.appendChild(overlay);
    commonTextarea.focus();
  }

  function installSettingsStyle() {
    GM_addStyle(`
      [${MODAL_ATTR}="true"] {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        padding: 24px;
        background: rgba(15, 15, 15, 0.58);
        color: #0f0f0f;
        font-family: Roboto, Arial, sans-serif;
      }

      .${SCRIPT_KEY}-dialog {
        width: min(560px, 100%);
        max-height: calc(100vh - 48px);
        overflow: auto;
        box-sizing: border-box;
        border-radius: 8px;
        background: #fff;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
        padding: 20px;
      }

      .${SCRIPT_KEY}-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }

      .${SCRIPT_KEY}-header h2 {
        margin: 0;
        font-size: 18px;
        line-height: 1.35;
        font-weight: 500;
      }

      .${SCRIPT_KEY}-icon-button {
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 50%;
        background: transparent;
        color: #0f0f0f;
        cursor: pointer;
        font-size: 24px;
        line-height: 1;
      }

      .${SCRIPT_KEY}-icon-button:hover {
        background: rgba(0, 0, 0, 0.08);
      }

      .${SCRIPT_KEY}-account {
        margin-bottom: 12px;
        color: #606060;
        font-size: 13px;
        line-height: 1.4;
        overflow-wrap: anywhere;
      }

      .${SCRIPT_KEY}-field {
        display: block;
        margin-top: 12px;
      }

      .${SCRIPT_KEY}-field-label {
        display: block;
        margin-bottom: 6px;
        color: #0f0f0f;
        font-size: 13px;
        line-height: 1.4;
        font-weight: 500;
      }

      .${SCRIPT_KEY}-textarea {
        width: 100%;
        min-height: 150px;
        box-sizing: border-box;
        resize: vertical;
        border: 1px solid #c7c7c7;
        border-radius: 6px;
        padding: 10px 12px;
        color: #0f0f0f;
        background: #fff;
        font: 14px/1.5 Consolas, "Courier New", monospace;
      }

      .${SCRIPT_KEY}-textarea:focus {
        border-color: #065fd4;
        outline: 2px solid rgba(6, 95, 212, 0.22);
      }

      .${SCRIPT_KEY}-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 14px;
      }

      .${SCRIPT_KEY}-button {
        min-width: 86px;
        border: 1px solid #c7c7c7;
        border-radius: 18px;
        padding: 8px 16px;
        background: #fff;
        color: #0f0f0f;
        cursor: pointer;
        font-size: 14px;
        line-height: 1.2;
      }

      .${SCRIPT_KEY}-button:hover {
        background: #f2f2f2;
      }

      .${SCRIPT_KEY}-button-primary {
        border-color: #065fd4;
        background: #065fd4;
        color: #fff;
      }

      .${SCRIPT_KEY}-button-primary:hover {
        background: #0556bf;
      }
    `);
  }

  function registerMenuCommand() {
    GM_registerMenuCommand("非表示ワードを編集", openSettingsModal);
  }

  window[CLEANUP_KEY] = function cleanup() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (scanTimer) {
      window.clearTimeout(scanTimer);
      scanTimer = 0;
    }
    window.removeEventListener("yt-navigate-finish", onNavigationChange);
    window.removeEventListener("yt-page-data-updated", onPageDataUpdated);
    window.removeEventListener("popstate", onNavigationChange);
    window.removeEventListener("keydown", onSettingsKeydown);
    closeSettingsModal();
  };

  installSettingsStyle();
  registerMenuCommand();

  window.addEventListener("yt-navigate-finish", onNavigationChange);
  window.addEventListener("yt-page-data-updated", onPageDataUpdated);
  window.addEventListener("popstate", onNavigationChange);
  window.addEventListener("keydown", onSettingsKeydown);

  startObserver();
  scheduleScan(0);
})();
