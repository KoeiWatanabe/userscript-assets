// ==UserScript==
// @name         Longmanで日本語に切り替える
// @namespace    https://tampermonkey.net/
// @version      1.5.0
// @description  Longman Dictionary の通常英語ページと英語スペルチェックを英和辞書側へ自動で切り替える
// @match        https://www.ldoceonline.com/dictionary/*
// @match        https://www.ldoceonline.com/spellcheck/english/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Longmanで日本語に切り替える/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Longmanで日本語に切り替える/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Longmanで日本語に切り替える/icon_128.png
// ==/UserScript==

(function () {
  "use strict";

  const DICTIONARY_PREFIX = "/dictionary/";
  const ENGLISH_SPELLCHECK_PREFIX = "/spellcheck/english/";
  const JAPANESE_PREFIX = "/dictionary/english-japanese/";
  const JAPANESE_SPELLCHECK_PREFIX = "/spellcheck/english-japanese/";
  const JAPANESE_SEARCH_PATH = "/search/english-japanese/direct/";

  function getEntryQuery() {
    const { pathname } = location;

    if (!pathname.startsWith(DICTIONARY_PREFIX)) return null;
    if (pathname.startsWith(JAPANESE_PREFIX)) return null;

    const entryPath = pathname.slice(DICTIONARY_PREFIX.length);
    if (!entryPath) return null;

    try {
      return decodeURIComponent(entryPath);
    } catch (_) {
      return entryPath;
    }
  }

  function getJapaneseSearchUrl(entryQuery) {
    const url = new URL(JAPANESE_SEARCH_PATH, location.origin);
    url.searchParams.set("q", entryQuery);
    return url;
  }

  function getJapaneseSpellcheckUrl() {
    if (!location.pathname.startsWith(ENGLISH_SPELLCHECK_PREFIX)) return null;

    return new URL(
      JAPANESE_SPELLCHECK_PREFIX + location.search + location.hash,
      location.origin
    );
  }

  async function resolveJapaneseResult(url) {
    try {
      const response = await fetch(url.href, {
        method: "GET",
        credentials: "same-origin",
      });
      const finalUrl = new URL(response.url);

      if (
        response.ok &&
        finalUrl.origin === location.origin &&
        (
          finalUrl.pathname.startsWith(JAPANESE_PREFIX) ||
          finalUrl.pathname.startsWith(JAPANESE_SPELLCHECK_PREFIX)
        )
      ) {
        return finalUrl;
      }
    } catch (_) {
      // 通信に失敗した場合は現在のページのままにする。
    }

    return null;
  }

  async function redirectIfAvailable() {
    const spellcheckUrl = getJapaneseSpellcheckUrl();
    if (spellcheckUrl) {
      location.replace(spellcheckUrl.href);
      return;
    }

    const entryQuery = getEntryQuery();
    if (!entryQuery) return;

    const japaneseUrl = await resolveJapaneseResult(getJapaneseSearchUrl(entryQuery));
    if (!japaneseUrl) return;

    location.replace(japaneseUrl.href);
  }

  redirectIfAvailable();
})();
