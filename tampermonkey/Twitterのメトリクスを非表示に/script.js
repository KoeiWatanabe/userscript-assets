// ==UserScript==
// @name         Twitterのレイアウト調整
// @namespace    https://tampermonkey.net/
// @version      1.16.2
// @description  メトリクス非表示（ホバー時表示）・認証バッジ非表示・サイドバー整理・おすすめタブ削除・原文デフォルト表示・プロフィールのリツイート切替・プレミアム勧誘リダイレクト・「もっと見つける」非表示・プロフィールのおすすめユーザー非表示
// @author       Gemini & Claude
// @match        https://x.com/*
// @match        https://twitter.com/*
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Twitterのメトリクスを非表示に/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Twitterのメトリクスを非表示に/script.js
// @icon         https://lh3.googleusercontent.com/1GU703pTRO0zps9AmDtoYtUlyDTeo_Cjj2mVzevaSHu-IIfOsiPXjMy5BLQdjt_SlSZCNDM3izGKGeEBDWsRbrizyg=s120
// @grant        GM_addStyle
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  if (location.pathname === '/i/premium_sign_up') {
    location.replace('/home');
    return;
  }

  const CELL_SELECTOR = '[data-testid="cellInnerDiv"]';
  const PRIMARY_SELECTOR = '[data-testid="primaryColumn"]';
  const SEARCH_BUTTON_SELECTOR = 'button[aria-label="検索"], button[aria-label="Search"]';
  const FOLLOW_BUTTON_SELECTOR = 'button[data-testid$="-follow"], button[data-testid$="-unfollow"]';
  const TOGGLE_BUTTON_SELECTOR = '[data-tmx-retweet-toggle]';
  const RETWEET_CELL_CLASS = 'tmx-profile-retweet';
  const EXPLORE_HEADING_CLASS = 'tmx-explore-heading';
  const PROFILE_HEADING_CLASS = 'tmx-profile-recommendation-heading';
  const DISCOVER_MORE_CLASS = 'tmx-discover-more';
  const FOR_YOU_CLASS = 'tmx-for-you-tab';
  const TOGGLE_ICON_VIEWBOX = '0 -960 960 960';
  const VISIBILITY_OFF_ICON_PATH = 'm637-425-62-62q4-38-23-65.5T487-576l-62-62q13-5 27-7.5t28-2.5q70 0 119 49t49 119q0 14-2.5 28t-8.5 27Zm133 133-52-52q36-28 65.5-61.5T833-480q-49-101-144.5-158.5T480-696q-26 0-51 3t-49 10l-58-58q38-15 77.5-21t80.5-6q143 0 261.5 77.5T912-480q-22 57-58.5 103.5T770-292Zm-2 202L638-220q-38 14-77.5 21t-80.5 7q-143 0-261.5-77.5T48-480q22-57 58-104t84-85L90-769l51-51 678 679-51 51ZM241-617q-35 28-65 61.5T127-480q49 101 144.5 158.5T480-264q26 0 51-3.5t50-9.5l-45-45q-14 5-28 7.5t-28 2.5q-70 0-119-49t-49-119q0-14 3.5-28t6.5-28l-81-81Zm287 89Zm-96 96Z';
  const VISIBILITY_ICON_PATH = 'M599-361q49-49 49-119t-49-119q-49-49-119-49t-119 49q-49 49-49 119t49 119q49 49 119 49t119-49Zm-187-51q-28-28-28-68t28-68q28-28 68-28t68 28q28 28 28 68t-28 68q-28 28-68 28t-68-28ZM220-270.5Q103-349 48-480q55-131 172-209.5T480-768q143 0 260 78.5T912-480q-55 131-172 209.5T480-192q-143 0-260-78.5ZM480-480Zm207 158q95-58 146-158-51-100-146-158t-207-58q-112 0-207 58T127-480q51 100 146 158t207 58q112 0 207-58Z';

  const PROFILE_TAB_SEGMENTS = new Set([
    'with_replies', 'media', 'likes', 'highlights', 'articles',
  ]);
  const NON_PROFILE_ROOT_SEGMENTS = new Set([
    'home', 'explore', 'notifications', 'messages', 'search', 'i', 'settings',
    'compose', 'login', 'signup', 'logout', 'tos', 'privacy', 'about', 'download',
    'jobs', 'share', 'intent', 'hashtag',
  ]);
  const EXPLORE_HEADINGS = new Set([
    '本日のニュース', 'today\'s news',
    'おすすめユーザー', 'おすすめのユーザー', 'who to follow',
    'おすすめ投稿', 'おすすめの投稿', 'おすすめのポスト', 'recommended posts',
  ]);
  const PROFILE_RECOMMENDATION_HEADINGS = new Set([
    'おすすめユーザー', 'おすすめのユーザー', 'who to follow',
  ]);
  const DISCOVER_MORE_HEADINGS = new Set(['もっと見つける', 'discover more']);
  const ORIGINAL_BUTTON_TEXTS = new Set(['原文を表示', 'Show original']);
  const ENGLISH_TRANSLATION_LABELS = ['英語からの翻訳', 'Translated from English'];
  const ANY_TRANSLATION_LABELS = [/からの翻訳/, /Translated from /i];

  GM_addStyle(`
    article :is(
      [data-testid="reply"],
      [data-testid="retweet"],
      [data-testid="unretweet"],
      [data-testid="like"],
      [data-testid="unlike"],
      [data-testid="bookmark"],
      [data-testid="removeBookmark"],
      [href*="/analytics"],
      [data-testid="analyticsButton"]
    ) [data-testid="app-text-transition-container"] {
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s ease-in-out, visibility 0s 0.2s;
    }

    article:hover :is(
      [data-testid="reply"],
      [data-testid="retweet"],
      [data-testid="unretweet"],
      [data-testid="like"],
      [data-testid="unlike"],
      [data-testid="bookmark"],
      [data-testid="removeBookmark"],
      [href*="/analytics"],
      [data-testid="analyticsButton"]
    ) [data-testid="app-text-transition-container"] {
      opacity: 1;
      visibility: visible;
      transition: opacity 0.2s ease-in-out, visibility 0s;
    }

    [data-testid="icon-verified"],
    a[href="/i/premium_sign_up"] {
      display: none !important;
    }

    [data-testid="sidebarColumn"] :is(
      [role="complementary"],
      [role="region"],
      nav,
      [data-testid="whoToFollowSspAd"]
    ),
    [data-testid="sidebarColumn"] :is(
      div:has(> div > div > [role="complementary"]),
      div:has(> div > [data-testid="news_sidebar"]),
      div:has(> div > [role="region"]),
      div:has(> div > nav)
    ) > *:not(:has([data-testid="SearchBox_Search_Input"])) {
      display: none !important;
    }

    [data-testid="ScrollSnap-List"] {
      justify-content: center !important;
    }

    .${FOR_YOU_CLASS},
    html[data-tmx-page="explore"] ${CELL_SELECTOR}:is(
      .${EXPLORE_HEADING_CLASS},
      :has([data-testid="UserCell"]),
      :has(a[href^="/i/connect_people"]),
      :has([data-testid="tweet"]),
      :has([data-testid="trend"] img)
    ),
    html[data-tmx-page="profile"] ${CELL_SELECTOR}:is(
      .${PROFILE_HEADING_CLASS},
      :has(aside[aria-label="おすすめユーザー"]),
      :has(aside[aria-label="Who to follow"]),
      :has([data-testid="UserCell"]),
      :has(a[href^="/i/connect_people"])
    ),
    html[data-tmx-page="status"] ${CELL_SELECTOR}.${DISCOVER_MORE_CLASS},
    html[data-tmx-page="status"] ${CELL_SELECTOR}.${DISCOVER_MORE_CLASS} ~ ${CELL_SELECTOR},
    html[data-tmx-page="profile"][data-tmx-hide-retweets="true"] ${CELL_SELECTOR}.${RETWEET_CELL_CLASS} {
      display: none !important;
    }

    .tmx-retweet-toggle-button {
      width: 40px !important;
      height: 40px !important;
      min-width: 40px !important;
      padding: 0 !important;
      border: 1px solid transparent !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      background-color: transparent !important;
      color: inherit !important;
      transition: opacity 0.2s ease, filter 0.2s ease !important;
    }

    .tmx-retweet-toggle-button:hover {
      opacity: 0.82;
    }

    .tmx-retweet-toggle-icon {
      width: 100%;
      height: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .tmx-retweet-toggle-button svg {
      width: 20px !important;
      height: 20px !important;
      display: block !important;
      color: inherit;
      fill: currentColor !important;
    }

    .tmx-retweet-toggle-button svg path {
      fill: currentColor !important;
    }

    .tmx-retweet-toggle-button[data-state="on"] .tmx-visibility-icon,
    .tmx-retweet-toggle-button[data-state="off"] .tmx-visibility-off-icon {
      display: none;
    }
  `);

  const profileRetweetHiddenStates = new Map();
  const processedOriginalButtons = new WeakSet();
  const originalShownCells = new WeakSet();
  const requestedFollowingTabs = new WeakSet();

  let appRoot = null;
  let lastPath = '';
  let currentPage = 'other';
  let currentProfileHandle = null;
  let hideProfileRetweets = false;
  let searchToggleButton = null;
  let stickyToggleButton = null;
  let observedFollowButtons = new WeakSet();
  const activeStickyCandidates = new Map();

  function normalizeText(text) {
    return text.trim().toLocaleLowerCase('en-US');
  }

  function normalizeHandle(value) {
    return value ? value.replace(/^@/, '').trim().toLowerCase() : null;
  }

  function getPageContext() {
    const segments = location.pathname.split('/').filter(Boolean);
    const root = segments[0]?.toLowerCase() || '';

    if (root === 'home') return { page: 'home', profileHandle: null };
    if (root === 'explore') return { page: 'explore', profileHandle: null };
    if (segments[1]?.toLowerCase() === 'status' && segments.length >= 3) {
      return { page: 'status', profileHandle: null };
    }
    if (!root || NON_PROFILE_ROOT_SEGMENTS.has(root)) {
      return { page: 'other', profileHandle: null };
    }
    if (segments.length === 1
      || (segments.length === 2 && PROFILE_TAB_SEGMENTS.has(segments[1].toLowerCase()))) {
      return { page: 'profile', profileHandle: normalizeHandle(segments[0]) };
    }
    return { page: 'other', profileHandle: null };
  }

  function setRootAttribute(name, value) {
    const root = document.documentElement;
    if (root.getAttribute(name) !== value) root.setAttribute(name, value);
  }

  function syncRoute(force = false) {
    if (!force && location.pathname === lastPath) return false;

    lastPath = location.pathname;
    const context = getPageContext();
    currentPage = context.page;
    currentProfileHandle = context.profileHandle;
    hideProfileRetweets = currentProfileHandle
      ? profileRetweetHiddenStates.get(currentProfileHandle) === true
      : false;

    setRootAttribute('data-tmx-page', currentPage);
    setRootAttribute('data-tmx-hide-retweets', String(hideProfileRetweets));

    stickyObserver.disconnect();
    observedFollowButtons = new WeakSet();
    activeStickyCandidates.clear();
    removeStickyToggleButton();

    if (currentPage !== 'profile') {
      removeProfileToggleButtons();
    }
    return true;
  }

  function extractHandleFromHref(href) {
    if (!href) return null;
    try {
      const segments = new URL(href, location.origin).pathname.split('/').filter(Boolean);
      if (segments.length !== 1) return null;
      const handle = segments[0];
      return NON_PROFILE_ROOT_SEGMENTS.has(handle.toLowerCase())
        ? null
        : normalizeHandle(handle);
    } catch {
      return null;
    }
  }

  function getArticleAuthorHandle(article) {
    const userName = article.querySelector('[data-testid="User-Name"]');
    if (!userName) return null;
    for (const link of userName.querySelectorAll('a[href]')) {
      const handle = extractHandleFromHref(link.getAttribute('href'));
      if (handle) return handle;
    }
    return null;
  }

  function isPureProfileRetweet(article) {
    if (!currentProfileHandle) return false;
    const socialContext = article.querySelector('[data-testid="socialContext"]');
    const socialHandle = extractHandleFromHref(
      socialContext?.closest('a[href]')?.getAttribute('href') || null,
    );
    if (socialHandle !== currentProfileHandle) return false;
    const authorHandle = getArticleAuthorHandle(article);
    return !!authorHandle && authorHandle !== currentProfileHandle;
  }

  function classifyProfileRetweetCell(cell) {
    const article = cell.matches('article') ? cell : cell.querySelector('article');
    cell.classList.toggle(RETWEET_CELL_CLASS, !!article && isPureProfileRetweet(article));
  }

  function scanCurrentProfileRetweets() {
    if (!hideProfileRetweets) return;
    const primary = document.querySelector(PRIMARY_SELECTOR);
    if (!primary) return;
    for (const cell of primary.querySelectorAll(CELL_SELECTOR)) {
      classifyProfileRetweetCell(cell);
    }
  }

  function renderToggleButton(button) {
    if (!button) return;
    const state = hideProfileRetweets ? 'off' : 'on';
    const label = hideProfileRetweets ? 'リポストを表示' : 'リポストを非表示';
    if (button.dataset.state !== state) button.dataset.state = state;
    if (button.getAttribute('aria-pressed') !== String(hideProfileRetweets)) {
      button.setAttribute('aria-pressed', String(hideProfileRetweets));
    }
    if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
    if (button.title !== label) button.title = label;
  }

  function renderToggleButtons() {
    renderToggleButton(searchToggleButton);
    renderToggleButton(stickyToggleButton);
  }

  function createRetweetToggleButton(variant) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tmx-retweet-toggle-button';
    button.dataset.tmxRetweetToggle = variant;
    button.innerHTML = `
      <span class="tmx-retweet-toggle-icon" aria-hidden="true">
        <svg viewBox="${TOGGLE_ICON_VIEWBOX}" focusable="false">
          <path class="tmx-visibility-icon" d="${VISIBILITY_ICON_PATH}"></path>
          <path class="tmx-visibility-off-icon" d="${VISIBILITY_OFF_ICON_PATH}"></path>
        </svg>
      </span>
    `;
    button.addEventListener('click', () => {
      if (!currentProfileHandle) return;
      hideProfileRetweets = !hideProfileRetweets;
      profileRetweetHiddenStates.set(currentProfileHandle, hideProfileRetweets);
      setRootAttribute('data-tmx-hide-retweets', String(hideProfileRetweets));
      renderToggleButtons();
      if (hideProfileRetweets) scanCurrentProfileRetweets();
    });
    renderToggleButton(button);
    return button;
  }

  function syncSearchToggleButton() {
    if (currentPage !== 'profile') return;
    const primary = document.querySelector(PRIMARY_SELECTOR);
    const searchButton = primary?.querySelector(SEARCH_BUTTON_SELECTOR);
    if (!searchButton?.parentElement) return;

    if (!searchToggleButton?.isConnected) {
      searchToggleButton = document.querySelector('[data-tmx-retweet-toggle="search"]')
        || createRetweetToggleButton('search');
    }
    if (searchToggleButton.parentElement !== searchButton.parentElement
      || searchToggleButton.nextSibling !== searchButton) {
      searchButton.parentElement.insertBefore(searchToggleButton, searchButton);
    }
    renderToggleButton(searchToggleButton);
  }

  function removeStickyToggleButton() {
    document.querySelector('[data-tmx-retweet-toggle-wrapper="sticky"]')?.remove();
    stickyToggleButton = null;
  }

  function syncStickyToggleButton(followButton) {
    const followWrapper = followButton?.parentElement;
    const followGroup = followWrapper?.parentElement;
    const actionRow = followGroup?.parentElement;
    if (!followWrapper || !followGroup || !actionRow) {
      removeStickyToggleButton();
      return;
    }

    let wrapper = document.querySelector('[data-tmx-retweet-toggle-wrapper="sticky"]');
    if (!stickyToggleButton?.isConnected) {
      stickyToggleButton = document.querySelector('[data-tmx-retweet-toggle="sticky"]')
        || createRetweetToggleButton('sticky');
    }
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.dataset.tmxRetweetToggleWrapper = 'sticky';
      wrapper.className = followWrapper.className || 'css-175oi2r';
      wrapper.style.minWidth = '0px';
      wrapper.style.marginRight = '8px';
    }
    if (stickyToggleButton.parentElement !== wrapper) {
      wrapper.replaceChildren(stickyToggleButton);
    }
    if (wrapper.parentElement !== actionRow || wrapper.nextSibling !== followGroup) {
      actionRow.insertBefore(wrapper, followGroup);
    }
    renderToggleButton(stickyToggleButton);
  }

  function removeProfileToggleButtons() {
    document.querySelectorAll(TOGGLE_BUTTON_SELECTOR).forEach(button => button.remove());
    document.querySelector('[data-tmx-retweet-toggle-wrapper="sticky"]')?.remove();
    searchToggleButton = null;
    stickyToggleButton = null;
  }

  function chooseStickyCandidate() {
    let bestButton = null;
    let bestTop = Infinity;
    for (const [button, top] of activeStickyCandidates) {
      if (!button.isConnected) {
        activeStickyCandidates.delete(button);
      } else if (top < bestTop) {
        bestTop = top;
        bestButton = button;
      }
    }
    if (bestButton) syncStickyToggleButton(bestButton);
    else removeStickyToggleButton();
  }

  const stickyObserver = new IntersectionObserver((entries) => {
    if (currentPage !== 'profile') return;
    for (const entry of entries) {
      const rect = entry.boundingClientRect;
      if (entry.isIntersecting && rect.width > 0 && rect.height > 0 && rect.bottom > 0) {
        activeStickyCandidates.set(entry.target, rect.top);
      } else {
        activeStickyCandidates.delete(entry.target);
      }
    }
    chooseStickyCandidate();
  }, {
    root: null,
    rootMargin: '0px 0px -90% 0px',
    threshold: 0,
  });

  function observeFollowButton(button) {
    if (observedFollowButtons.has(button)) return;
    if (!button.closest(PRIMARY_SELECTOR) || button.closest(CELL_SELECTOR)) return;
    observedFollowButtons.add(button);
    stickyObserver.observe(button);
  }

  function syncProfileHeader(root) {
    if (currentPage !== 'profile') return;
    if (root === appRoot || root.matches?.(SEARCH_BUTTON_SELECTOR)
      || root.querySelector?.(SEARCH_BUTTON_SELECTOR)) {
      syncSearchToggleButton();
    }

    if (root.matches?.(FOLLOW_BUTTON_SELECTOR)) observeFollowButton(root);
    root.querySelectorAll?.(FOLLOW_BUTTON_SELECTOR).forEach(observeFollowButton);
  }

  function syncForYouTab(tabList) {
    if (currentPage !== 'home' || !tabList) return;
    let forYouTab = null;
    let followingTab = null;
    for (const tab of tabList.querySelectorAll('[role="tab"]')) {
      const text = normalizeText(tab.textContent);
      if (text === 'おすすめ' || text === 'for you') forYouTab = tab;
      else if (text === 'フォロー中' || text === 'following') followingTab = tab;
    }
    if (!forYouTab) return;

    forYouTab.closest('[role="presentation"]')?.classList.add(FOR_YOU_CLASS);
    if (followingTab?.getAttribute('aria-selected') !== 'true'
      && !requestedFollowingTabs.has(followingTab)) {
      requestedFollowingTabs.add(followingTab);
      followingTab.click();
    }
  }

  function processOriginalButton(cell) {
    if (originalShownCells.has(cell)) return;
    const cellText = cell.textContent;
    let hasOriginalButtonText = false;
    for (const text of ORIGINAL_BUTTON_TEXTS) {
      if (cellText.includes(text)) {
        hasOriginalButtonText = true;
        break;
      }
    }
    if (!hasOriginalButtonText) return;

    let targetButton = null;
    for (const button of cell.querySelectorAll('button')) {
      if (!processedOriginalButtons.has(button)
        && ORIGINAL_BUTTON_TEXTS.has(button.textContent.trim())) {
        targetButton = button;
        break;
      }
    }
    if (!targetButton) return;

    if (ENGLISH_TRANSLATION_LABELS.some(label => cellText.includes(label))) {
      processedOriginalButtons.add(targetButton);
      originalShownCells.add(cell);
      targetButton.click();
    } else if (ANY_TRANSLATION_LABELS.some(pattern => pattern.test(cellText))) {
      processedOriginalButtons.add(targetButton);
    }
  }

  function processCell(cell) {
    processOriginalButton(cell);

    if (currentPage === 'explore') {
      const heading = cell.querySelector('h2[role="heading"], h2');
      const headingText = heading ? normalizeText(heading.textContent) : '';
      cell.classList.toggle(EXPLORE_HEADING_CLASS, EXPLORE_HEADINGS.has(headingText));
    } else if (currentPage === 'profile') {
      const heading = cell.querySelector('h2[role="heading"], h2');
      const headingText = heading ? normalizeText(heading.textContent) : '';
      cell.classList.toggle(
        PROFILE_HEADING_CLASS,
        PROFILE_RECOMMENDATION_HEADINGS.has(headingText),
      );
      if (hideProfileRetweets) classifyProfileRetweetCell(cell);
    } else if (currentPage === 'status') {
      const heading = cell.querySelector('h2[role="heading"], h2');
      const headingText = heading ? normalizeText(heading.textContent) : '';
      cell.classList.toggle(DISCOVER_MORE_CLASS, DISCOVER_MORE_HEADINGS.has(headingText));
    }
  }

  function collectCells(root, cells) {
    if (root.matches?.(CELL_SELECTOR)) cells.add(root);
    const ancestor = root.closest?.(CELL_SELECTOR);
    if (ancestor) cells.add(ancestor);
    root.querySelectorAll?.(CELL_SELECTOR).forEach(cell => cells.add(cell));
  }

  function processSubtree(root) {
    const cells = new Set();
    collectCells(root, cells);
    cells.forEach(processCell);

    if (currentPage === 'home') {
      const primary = document.querySelector(PRIMARY_SELECTOR);
      primary?.querySelectorAll('[role="tablist"]').forEach(syncForYouTab);
    } else if (currentPage === 'profile') {
      syncProfileHeader(root);
    }
  }

  function processMutations(mutations) {
    if (syncRoute()) {
      processSubtree(appRoot);
      return;
    }

    const cells = new Set();
    const tabLists = new Set();
    const profileRoots = new Set();

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        collectCells(node, cells);

        if (currentPage === 'home') {
          if (node.matches?.('[role="tablist"]')) tabLists.add(node);
          const tabList = node.closest?.('[role="tablist"]');
          if (tabList) tabLists.add(tabList);
          node.querySelectorAll?.('[role="tablist"]').forEach(item => tabLists.add(item));
        } else if (currentPage === 'profile'
          && (node.matches?.(`${SEARCH_BUTTON_SELECTOR}, ${FOLLOW_BUTTON_SELECTOR}`)
            || node.querySelector?.(`${SEARCH_BUTTON_SELECTOR}, ${FOLLOW_BUTTON_SELECTOR}`))) {
          profileRoots.add(node);
        }
      }
    }

    cells.forEach(processCell);
    tabLists.forEach(syncForYouTab);
    profileRoots.forEach(syncProfileHeader);
  }

  const observer = new MutationObserver(processMutations);

  function start() {
    appRoot = document.querySelector('#react-root');
    if (!appRoot) return;
    syncRoute();
    observer.observe(appRoot, { childList: true, subtree: true });
    processSubtree(appRoot);
    window.addEventListener('popstate', () => {
      if (syncRoute()) processSubtree(appRoot);
    });
  }

  syncRoute(true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
