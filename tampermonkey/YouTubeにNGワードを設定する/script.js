// ==UserScript==
// @name         YouTubeにNGワードを設定する
// @namespace    https://tampermonkey.net/
// @version      1.2.0
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
  const PREVIOUS_DISPLAY_ATTR = `data-${SCRIPT_KEY}-previous-display`;
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
  let checkedSignatures = new WeakMap();
  let accountCache = {
    source: "",
    key: DEFAULT_ACCOUNT_KEY,
    label: DEFAULT_ACCOUNT_KEY,
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

  function hashText(value) {
    let hash = 2166136261;
    const text = String(value || "");

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16).padStart(8, "0");
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
      accountCache = {
        source: "",
        key: DEFAULT_ACCOUNT_KEY,
        label: DEFAULT_ACCOUNT_KEY,
      };
      return accountCache;
    }

    if (accountCache.source === source) {
      return accountCache;
    }

    const shortHash = hashText(source).slice(0, 10);
    accountCache = {
      source,
      key: `avatar:${shortHash}`,
      label: `avatar:${shortHash}`,
    };

    return accountCache;
  }

  function getAccountWordsStorageKey(accountKey = getAccountInfo().key) {
    return `${ACCOUNT_WORDS_PREFIX}${accountKey}`;
  }

  function readCommonWords() {
    const value = GM_getValue(COMMON_WORDS_KEY, []);
    if (!Array.isArray(value)) {
      return [];
    }

    return uniqueWordsFromText(value.join("\n"));
  }

  function writeCommonWords(words) {
    GM_setValue(COMMON_WORDS_KEY, uniqueWordsFromText(words.join("\n")));
  }

  function readAccountWords(accountKey = getAccountInfo().key) {
    const value = GM_getValue(getAccountWordsStorageKey(accountKey), []);
    if (!Array.isArray(value)) {
      return [];
    }

    return uniqueWordsFromText(value.join("\n"));
  }

  function writeAccountWords(words, accountKey = getAccountInfo().key) {
    GM_setValue(getAccountWordsStorageKey(accountKey), uniqueWordsFromText(words.join("\n")));
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
      if (!card.hasAttribute(HIDDEN_ATTR)) {
        card.setAttribute(PREVIOUS_DISPLAY_ATTR, card.style.display || "");
      }

      card.style.display = "none";
      card.setAttribute(HIDDEN_ATTR, "true");
      return;
    }

    if (!card.hasAttribute(HIDDEN_ATTR)) {
      return;
    }

    card.style.display = card.getAttribute(PREVIOUS_DISPLAY_ATTR) || "";
    card.removeAttribute(HIDDEN_ATTR);
    card.removeAttribute(PREVIOUS_DISPLAY_ATTR);
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
    checkedSignatures = new WeakMap();
    resetHiddenCards();
    scheduleScan(0);
  }

  function scanCards() {
    scanTimer = 0;

    if (!isTargetPage()) {
      resetHiddenCards();
      return;
    }

    const accountInfo = getAccountInfo();
    const commonWords = readCommonWords();
    const accountWords = readAccountWords(accountInfo.key);
    const commonWordsSignature = commonWords.join("\n").toLocaleLowerCase();
    const accountWordsSignature = accountWords.join("\n").toLocaleLowerCase();

    for (const card of getTargetCards()) {
      const info = getCardInfo(card);
      if (!info.signature.trim()) {
        continue;
      }

      const activeSignature = [
        accountInfo.key,
        commonWordsSignature,
        accountWordsSignature,
        info.signature,
      ].join("\n---\n");

      if (checkedSignatures.get(card) === activeSignature) {
        continue;
      }

      checkedSignatures.set(card, activeSignature);
      setHidden(card, shouldHide(info, commonWords, accountWords));
    }
  }

  function scheduleScan(delay = 120) {
    if (scanTimer) {
      window.clearTimeout(scanTimer);
    }

    scanTimer = window.setTimeout(scanCards, delay);
  }

  function handleUrlChange() {
    if (location.href === lastUrl) {
      return;
    }

    lastUrl = location.href;
    scheduleScan(250);
  }

  function startObserver() {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver(() => {
      handleUrlChange();
      scheduleScan();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function onNavigateFinish() {
    handleUrlChange();
    scheduleScan(250);
  }

  function onPageDataUpdated() {
    scheduleScan(250);
  }

  function onPopState() {
    handleUrlChange();
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
    const commonWords = readCommonWords();
    const accountWords = readAccountWords(accountInfo.key);
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
    account.textContent = `現在のアカウント: ${accountInfo.label}`;

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
        const commonTextarea = overlay.querySelector("[data-field='common']");
        const accountTextarea = overlay.querySelector("[data-field='account']");
        const nextCommonWords = uniqueWordsFromText(commonTextarea ? commonTextarea.value : "");
        const nextAccountWords = uniqueWordsFromText(accountTextarea ? accountTextarea.value : "");
        writeCommonWords(nextCommonWords);
        writeAccountWords(nextAccountWords, accountInfo.key);
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
    window.removeEventListener("yt-navigate-finish", onNavigateFinish);
    window.removeEventListener("yt-page-data-updated", onPageDataUpdated);
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("keydown", onSettingsKeydown);
    closeSettingsModal();
  };

  installSettingsStyle();
  registerMenuCommand();

  window.addEventListener("yt-navigate-finish", onNavigateFinish);
  window.addEventListener("yt-page-data-updated", onPageDataUpdated);
  window.addEventListener("popstate", onPopState);
  window.addEventListener("keydown", onSettingsKeydown);

  startObserver();
  scheduleScan(0);
})();
