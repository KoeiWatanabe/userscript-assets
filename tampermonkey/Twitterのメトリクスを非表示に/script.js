// ==UserScript==
// @name         Twitterのレイアウト調整
// @namespace    http://tampermonkey.net/
// @version      1.14.0
// @description  メトリクス非表示（ホバー時表示）・認証バッジ非表示・サイドバー整理・おすすめタブ削除・原文デフォルト表示・プロフィールのリツイート切替・プレミアム勧誘リダイレクト・「もっと見つける」非表示
// @author       Gemini & Claude
// @match        https://x.com/*
// @match        https://twitter.com/*
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Twitterのレイアウト調整/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Twitterのレイアウト調整/script.js
// @icon         https://lh3.googleusercontent.com/1GU703pTRO0zps9AmDtoYtUlyDTeo_Cjj2mVzevaSHu-IIfOsiPXjMy5BLQdjt_SlSZCNDM3izGKGeEBDWsRbrizyg=s120
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // 1. CSS 定義（即時適用・点滅防止）
  // ============================================================
  GM_addStyle(`
    /* ===== メトリクス非表示（ホバー時表示） ===== */
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

    /* ===== 認証バッジ非表示 ===== */
    :is(
      span:has(> [data-testid="icon-verified"]),
      button:has(> [data-testid="icon-verified"]),
      span:has(> svg[aria-label="Verified account"][role="img"]),
      span:has(> svg[aria-label="認証済みアカウント"][role="img"]),
      button:has(> svg[aria-label="Verified account"][role="img"]),
      button:has(> svg[aria-label="認証済みアカウント"][role="img"]),
      [data-testid="icon-verified"],
      svg[aria-label="Verified account"][role="img"],
      svg[aria-label="認証済みアカウント"][role="img"]
    ) {
      display: none !important;
    }

    /* ===== 左サイドバー: プレミアムリンク非表示 ===== */
    :is(
      a[href="/i/premium_sign_up"],
      a[href="/i/verified-choose"],
      a[href="/i/verified-orgs-signup"],
      [data-testid="AppTabBar_Premium_Link"]
    ) {
      display: none !important;
    }

    /* ===== 右サイドバー: 不要セクション非表示 ===== */
    [data-testid="sidebarColumn"] :is(
      aside,
      [data-testid="news_sidebar"],
      [data-testid="trend"],
      nav,
      [data-testid*="Upsell"],
      [data-testid*="upsell"],
      [data-testid="placementTracking"]
    ) {
      display: none !important;
    }

    /* ===== タイムライン: タブ中央寄せ ===== */
    [data-testid="ScrollSnap-List"] {
      justify-content: center !important;
    }

    /* ===== プロフィール: リツイート切替ボタン ===== */
    .codex-retweet-toggle-button {
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

    .codex-retweet-toggle-button[data-state="on"] {
      background-color: transparent !important;
      border-color: transparent !important;
    }

    .codex-retweet-toggle-button[data-state="off"] {
      background-color: transparent !important;
      border-color: transparent !important;
    }

    .codex-retweet-toggle-button:hover {
      opacity: 0.82;
    }

    .codex-retweet-toggle-icon {
      width: 100%;
      height: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .codex-retweet-toggle-button svg {
      width: 20px !important;
      height: 20px !important;
      display: block !important;
      color: inherit;
      fill: currentColor !important;
    }

    .codex-retweet-toggle-button svg path {
      fill: currentColor !important;
    }

    .codex-profile-retweet-hidden {
      display: none !important;
    }
  `);

  // ============================================================
  // 2. JavaScript による動的処理
  // ============================================================

  /** プレミアム勧誘ページ (/i/premium_sign_up) ならホームへリダイレクト */
  function redirectIfPremiumPage() {
    if (location.pathname === '/i/premium_sign_up') {
      location.replace('https://x.com/home');
      return true;
    }
    return false;
  }

  let lastUrl = location.href;
  // おすすめタブの wrapper をキャッシュ（DOM 内で非表示のまま → O(1) スキップ）
  let forYouWrapper = null;
  let currentProfileHandle = null;
  let hideProfileRetweets = false;
  const profileRetweetHiddenStates = new Map();

  // 原文を表示したい言語（「○○からの翻訳」の○○部分）
  const SHOW_ORIGINAL_LANGS = new Set(['英語']);
  const SEARCH_INPUT_SELECTOR = '[data-testid="SearchBox_Search_Input"]';
  const RETWEET_TOGGLE_BUTTON_SELECTOR = '[data-codex-retweet-toggle]';
  const PROFILE_RETWEET_HIDDEN_CLASS = 'codex-profile-retweet-hidden';
  const TOGGLE_ICON_VIEWBOX = '0 -960 960 960';
  const VISIBILITY_OFF_ICON_PATH = 'm637-425-62-62q4-38-23-65.5T487-576l-62-62q13-5 27-7.5t28-2.5q70 0 119 49t49 119q0 14-2.5 28t-8.5 27Zm133 133-52-52q36-28 65.5-61.5T833-480q-49-101-144.5-158.5T480-696q-26 0-51 3t-49 10l-58-58q38-15 77.5-21t80.5-6q143 0 261.5 77.5T912-480q-22 57-58.5 103.5T770-292Zm-2 202L638-220q-38 14-77.5 21t-80.5 7q-143 0-261.5-77.5T48-480q22-57 58-104t84-85L90-769l51-51 678 679-51 51ZM241-617q-35 28-65 61.5T127-480q49 101 144.5 158.5T480-264q26 0 51-3.5t50-9.5l-45-45q-14 5-28 7.5t-28 2.5q-70 0-119-49t-49-119q0-14 3.5-28t6.5-28l-81-81Zm287 89Zm-96 96Z';
  const VISIBILITY_ICON_PATH = 'M599-361q49-49 49-119t-49-119q-49-49-119-49t-119 49q-49 49-49 119t49 119q49 49 119 49t119-49Zm-187-51q-28-28-28-68t28-68q28-28 68-28t68 28q28 28 28 68t-28 68q-28 28-68 28t-68-28ZM220-270.5Q103-349 48-480q55-131 172-209.5T480-768q143 0 260 78.5T912-480q-55 131-172 209.5T480-192q-143 0-260-78.5ZM480-480Zm207 158q95-58 146-158-51-100-146-158t-207-58q-112 0-207 58T127-480q51 100 146 158t207 58q112 0 207-58Z';
  const PROFILE_TAB_SEGMENTS = new Set(['with_replies', 'media', 'likes', 'highlights', 'articles']);
  const NON_PROFILE_ROOT_SEGMENTS = new Set([
    'home', 'explore', 'notifications', 'messages', 'search', 'i', 'settings', 'compose',
    'login', 'signup', 'logout', 'tos', 'privacy', 'about', 'download', 'jobs', 'share',
    'intent', 'hashtag',
  ]);
  const SIDEBAR_SECTION_MARKERS = [
    'aside',
    '[data-testid="news_sidebar"]',
    '[data-testid="trend"]',
    '[data-testid="placementTracking"]',
    '[data-testid*="Upsell"]',
    '[data-testid*="upsell"]',
    '[role="complementary"]',
    '[aria-label][tabindex="0"]',
    'h2',
  ].join(', ');

  // WeakSet で処理済みボタンを追跡（DOM 属性不要・副作用なし）
  const processedButtons = new WeakSet();
  // 言語ラベル未描画のボタンを保留（WeakRef で参照保持・GC 可能）
  const pendingButtons = new Set();
  // 原文を一度表示済みのセル（ユーザーが翻訳に戻した場合の再クリックを防止）
  const originalShownCells = new WeakSet();

  function normalizeHandle(value) {
    return value ? value.replace(/^@/, '').trim().toLowerCase() : null;
  }

  function isProfilePagePath() {
    const segments = location.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return false;

    const [root, subpage] = segments;
    if (NON_PROFILE_ROOT_SEGMENTS.has(root.toLowerCase())) return false;
    if (segments.length === 1) return true;
    if (segments.length === 2 && PROFILE_TAB_SEGMENTS.has(subpage.toLowerCase())) return true;
    return false;
  }

  function getCurrentProfileHandleFromUrl() {
    if (!isProfilePagePath()) return null;
    const [handle] = location.pathname.split('/').filter(Boolean);
    return normalizeHandle(handle);
  }

  function getProfileRetweetsHidden(profileHandle) {
    return profileHandle ? profileRetweetHiddenStates.get(profileHandle) === true : false;
  }

  function setProfileRetweetsHidden(profileHandle, shouldHide) {
    if (!profileHandle) return;
    profileRetweetHiddenStates.set(profileHandle, shouldHide);
  }

  function extractHandleFromHref(href) {
    if (!href) return null;
    try {
      const url = new URL(href, location.origin);
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length !== 1) return null;
      const [handle] = segments;
      if (NON_PROFILE_ROOT_SEGMENTS.has(handle.toLowerCase())) return null;
      return normalizeHandle(handle);
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

  function getSocialContextHandle(article) {
    const socialContext = article.querySelector('[data-testid="socialContext"]');
    if (!socialContext) return null;
    const socialLink = socialContext.closest('a[href]');
    return extractHandleFromHref(socialLink?.getAttribute('href') || null);
  }

  function isPureProfileRetweetArticle(article, profileHandle = currentProfileHandle) {
    if (!profileHandle || !article) return false;

    const socialHandle = getSocialContextHandle(article);
    if (!socialHandle || socialHandle !== profileHandle) return false;

    const authorHandle = getArticleAuthorHandle(article);
    return !!authorHandle && authorHandle !== profileHandle;
  }

  function getProfileRetweetContainer(article) {
    return article.closest('[data-testid="cellInnerDiv"]') || article;
  }

  function renderAllRetweetToggleButtons() {
    document.querySelectorAll(RETWEET_TOGGLE_BUTTON_SELECTOR).forEach(renderRetweetToggleButton);
  }

  function renderRetweetToggleButton(button) {
    if (!button) return;

    const state = hideProfileRetweets ? 'off' : 'on';
    const ariaLabel = hideProfileRetweets
      ? 'リポストを表示'
      : 'リポストを非表示';
    const iconPaths = hideProfileRetweets
      ? `<path d="${VISIBILITY_ICON_PATH}"></path>`
      : `<path d="${VISIBILITY_OFF_ICON_PATH}"></path>`;

    button.dataset.state = state;
    button.setAttribute('aria-pressed', String(hideProfileRetweets));
    button.setAttribute('aria-label', ariaLabel);
    button.setAttribute('title', ariaLabel);

    const svg = button.querySelector('svg');
    if (svg) {
      svg.setAttribute('viewBox', TOGGLE_ICON_VIEWBOX);
      svg.innerHTML = `<g>${iconPaths}</g>`;
    }
  }

  function applyProfileRetweetVisibility(roots, profileHandle = currentProfileHandle) {
    const scannedArticles = new Set();

    for (const root of roots) {
      const articles = [];
      if (root.matches?.('article')) {
        articles.push(root);
      } else if (root.matches?.('[data-testid="cellInnerDiv"]')) {
        const article = root.querySelector('article');
        if (article) articles.push(article);
      } else if (root.querySelectorAll) {
        root.querySelectorAll('article').forEach(article => articles.push(article));
      }

      for (const article of articles) {
        if (scannedArticles.has(article)) continue;
        scannedArticles.add(article);

        const container = getProfileRetweetContainer(article);
        const shouldHide = hideProfileRetweets && isPureProfileRetweetArticle(article, profileHandle);
        container.classList.toggle(PROFILE_RETWEET_HIDDEN_CLASS, shouldHide);
      }
    }
  }

  function getStickyHeaderFollowButton() {
    const candidates = Array.from(document.querySelectorAll('button[data-testid$="-follow"], button[data-testid$="-unfollow"]'))
      .filter(button => button.closest('[data-testid="primaryColumn"]'));

    let best = null;
    let bestTop = Infinity;
    for (const button of candidates) {
      const rect = button.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top > 120) continue;
      if (rect.top < bestTop) {
        bestTop = rect.top;
        best = button;
      }
    }
    return best;
  }

  function createRetweetToggleButton(templateButton, variant) {
    const button = document.createElement('button');

    button.type = 'button';
    button.className = templateButton.getAttribute('class') || '';
    button.dataset.codexRetweetToggle = variant;
    button.classList.add('codex-retweet-toggle-button');
    button.innerHTML = `
      <span class="codex-retweet-toggle-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false"></svg>
      </span>
    `;

    button.addEventListener('click', () => {
      hideProfileRetweets = !hideProfileRetweets;
      setProfileRetweetsHidden(currentProfileHandle, hideProfileRetweets);
      renderAllRetweetToggleButtons();
      applyProfileRetweetVisibility([document.documentElement]);
    });

    renderRetweetToggleButton(button);
    return button;
  }

  function syncSearchHeaderRetweetToggle(profileHandle) {
    const existingButton = document.querySelector('[data-codex-retweet-toggle="search"]');
    if (!profileHandle) {
      existingButton?.remove();
      return;
    }

    const searchButton = Array.from(document.querySelectorAll('button[aria-label="検索"], button[aria-label="Search"]'))
      .find(button => button.closest('[data-testid="primaryColumn"]'));
    if (!searchButton || !searchButton.parentElement) {
      existingButton?.remove();
      return;
    }

    const parent = searchButton.parentElement;
    const button = existingButton || createRetweetToggleButton(searchButton, 'search');
    if (button.parentElement !== parent || button.nextSibling !== searchButton) {
      parent.insertBefore(button, searchButton);
    }
    renderRetweetToggleButton(button);
  }

  function syncStickyHeaderRetweetToggle(profileHandle) {
    const existingButton = document.querySelector('[data-codex-retweet-toggle="sticky"]');
    if (!profileHandle) {
      existingButton?.remove();
      document.querySelector('[data-codex-retweet-toggle-wrapper="sticky"]')?.remove();
      return;
    }

    const followButton = getStickyHeaderFollowButton();
    const followWrapper = followButton?.parentElement;
    const followGroup = followWrapper?.parentElement;
    const actionRow = followGroup?.parentElement;
    if (!followButton || !followWrapper || !followGroup || !actionRow) {
      existingButton?.remove();
      document.querySelector('[data-codex-retweet-toggle-wrapper="sticky"]')?.remove();
      return;
    }

    const legacyWrapper = document.querySelector('[data-codex-retweet-toggle-wrapper="sticky"]');
    if (legacyWrapper) {
      if (existingButton && !followWrapper.contains(existingButton)) {
        legacyWrapper.removeChild(existingButton);
      }
      legacyWrapper.remove();
    }

    let button = existingButton;
    if (!button) {
      const templateButton = document.querySelector('button[aria-label="検索"], button[aria-label="Search"]') || followButton;
      button = createRetweetToggleButton(templateButton, 'sticky');
    }

    const wrapper = button.parentElement?.dataset.codexRetweetToggleWrapper === 'sticky'
      ? button.parentElement
      : document.createElement('div');
    if (!wrapper.dataset.codexRetweetToggleWrapper) {
      wrapper.dataset.codexRetweetToggleWrapper = 'sticky';
      wrapper.className = followWrapper.className || 'css-175oi2r';
      wrapper.style.minWidth = '0px';
      wrapper.style.marginRight = '8px';
    }
    if (button.parentElement !== wrapper) {
      wrapper.replaceChildren(button);
    }

    if (wrapper.parentElement !== actionRow || wrapper.nextSibling !== followGroup) {
      actionRow.insertBefore(wrapper, followGroup);
    }
    renderRetweetToggleButton(button);
  }

  function syncRetweetToggleButtons(profileHandle) {
    syncSearchHeaderRetweetToggle(profileHandle);
    syncStickyHeaderRetweetToggle(profileHandle);
  }

  /** 左サイドバーのプレミアムリンクをテキストベースでも削除 */
  function cleanPremiumLinks(roots) {
    // 追加ノードから nav / header を収集（自身・子孫・祖先を考慮）
    const navs = new Set();
    for (const root of roots) {
      if (root.matches?.('nav, header')) navs.add(root);
      root.querySelectorAll?.('nav, header').forEach(n => navs.add(n));
      const ancestor = root.closest?.('nav, header');
      if (ancestor) navs.add(ancestor);
    }

    for (const nav of navs) {
      nav.querySelectorAll('a').forEach((a) => {
        if (!/^(Premium|プレミアム|Verified)(\s|$)/i.test(a.textContent.trim())) return;
        const row = a.closest('li') || a.closest('[data-testid]') || a.parentElement;
        if (row && row.style.display !== 'none') {
          row.style.setProperty('display', 'none', 'important');
        }
      });
    }
  }

  /**
   * タイムラインの「おすすめ」タブを非表示・「フォロー中」を自動選択
   * forYouWrapper をキャッシュし、DOM 内で非表示済みなら O(1) でスキップ。
   * SPA で再描画されると document.contains() が false になり再スキャンが走る。
   */
  function cleanForYouTab() {
    // キャッシュ済みかつ DOM 内で非表示 → スキップ
    if (forYouWrapper && document.contains(forYouWrapper) && forYouWrapper.style.display === 'none') return;

    const tabList = document.querySelector('[data-testid="primaryColumn"] [role="tablist"]');
    if (!tabList) return;
    const tabs = tabList.querySelectorAll('[role="tab"]');

    let forYouTab = null;
    let followingTab = null;
    for (const tab of tabs) {
      const text = tab.textContent.trim();
      if (/^(おすすめ|For You)$/i.test(text)) forYouTab = tab;
      else if (/^(フォロー中|Following)$/i.test(text)) followingTab = tab;
    }

    if (!forYouTab) return;

    forYouWrapper = forYouTab.closest('[role="presentation"]') || forYouTab;
    forYouWrapper.style.setProperty('display', 'none', 'important');
    if (followingTab && followingTab.getAttribute('aria-selected') !== 'true') {
      followingTab.click();
    }
  }

  /** 検索ボックスを残しつつ、同じ親配下の右サイドバー要素をまとめて非表示にする */
  function hideSidebarSiblingsExceptSearch(sidebar) {
    const searchInput = sidebar.querySelector(SEARCH_INPUT_SELECTOR);
    if (!searchInput) return false;

    let branch = searchInput.parentElement;
    while (branch && branch !== sidebar) {
      const parent = branch.parentElement;
      if (!parent) break;

      const siblings = Array.from(parent.children);
      const keep = siblings.find(child => child.contains(searchInput));
      if (!keep || siblings.length < 2) {
        branch = parent;
        continue;
      }

      const hideable = siblings.filter((child) => {
        if (child === keep || child.contains(searchInput)) return false;
        return child.matches?.(SIDEBAR_SECTION_MARKERS) || child.querySelector?.(SIDEBAR_SECTION_MARKERS);
      });

      if (hideable.length > 0) {
        hideable.forEach((child) => {
          if (child.style.display !== 'none') {
            child.style.setProperty('display', 'none', 'important');
          }
        });
        return true;
      }

      branch = parent;
    }

    return false;
  }

  /** 右サイドバーの不要セクションを非表示（サイドバー変化時のみ実行） */
  function cleanSidebarSections(roots) {
    const sidebar = document.querySelector('[data-testid="sidebarColumn"]');
    if (!sidebar) return;

    // サイドバーに関係するノードが追加されたときだけ実行
    const affected = roots.some(root =>
      sidebar === root || sidebar.contains(root) || root.contains(sidebar)
    );
    if (!affected) return;

    if (hideSidebarSiblingsExceptSearch(sidebar)) return;

    sidebar.querySelectorAll('aside').forEach(aside => {
      const parent = aside.parentElement;
      if (parent && parent !== sidebar && parent.style.display !== 'none') {
        parent.style.setProperty('display', 'none', 'important');
      }
    });

    const HIDE_HEADINGS = /^(本日のニュース|「いま」を見つけよう|What's happening|Today's news)/i;
    sidebar.querySelectorAll('h2').forEach((h2) => {
      if (!HIDE_HEADINGS.test(h2.textContent.trim())) return;
      let target = null;
      let cur = h2.parentElement;
      while (cur && cur !== sidebar) {
        if (cur.querySelector(SEARCH_INPUT_SELECTOR)) break;
        target = cur;
        cur = cur.parentElement;
      }
      if (target && target.style.display !== 'none') {
        target.style.setProperty('display', 'none', 'important');
      }
    });
  }

  /** 「○○からの翻訳」ラベルからソース言語名を取得する */
  function getSourceLanguage(cellDiv) {
    for (const span of cellDiv.querySelectorAll('span')) {
      const text = span.textContent.trim();
      if (text.endsWith('からの翻訳')) return text.replace('からの翻訳', '');
    }
    return null;
  }

  /**
   * 「原文を表示」ボタンを 1 件処理
   * 言語ラベルが未描画なら pendingButtons に保留し、
   * 次回 mutation 時に retryPendingButtons() で再試行する
   */
  function processShowOriginalButton(btn) {
    if (processedButtons.has(btn)) return;

    const cellDiv = btn.closest('[data-testid="cellInnerDiv"]');
    if (!cellDiv) return;

    // このセルで既に原文を表示済み → ユーザーが翻訳に戻した可能性があるため再クリックしない
    if (originalShownCells.has(cellDiv)) {
      processedButtons.add(btn);
      return;
    }

    const sourceLang = getSourceLanguage(cellDiv);
    if (sourceLang === null) {
      pendingButtons.add(new WeakRef(btn));
      return;
    }

    processedButtons.add(btn);
    if (SHOW_ORIGINAL_LANGS.has(sourceLang)) {
      originalShownCells.add(cellDiv);
      btn.click();
    }
  }

  /** 保留中ボタンの再試行（毎 RAF で呼ぶ） */
  function retryPendingButtons() {
    if (pendingButtons.size === 0) return;
    for (const ref of pendingButtons) {
      const btn = ref.deref();
      if (!btn || !document.contains(btn)) {
        pendingButtons.delete(ref);
        continue;
      }
      const cellDiv = btn.closest('[data-testid="cellInnerDiv"]');
      if (!cellDiv) {
        pendingButtons.delete(ref);
        continue;
      }
      if (originalShownCells.has(cellDiv)) {
        pendingButtons.delete(ref);
        processedButtons.add(btn);
        continue;
      }
      const sourceLang = getSourceLanguage(cellDiv);
      if (sourceLang !== null) {
        pendingButtons.delete(ref);
        processedButtons.add(btn);
        if (SHOW_ORIGINAL_LANGS.has(sourceLang)) {
          originalShownCells.add(cellDiv);
          btn.click();
        }
      }
    }
  }

  /** 追加ノードに含まれる「原文を表示」ボタンを処理 */
  function clickShowOriginalButtons(roots) {
    const scannedCells = new Set();

    for (const root of roots) {
      if (root.matches?.('button')) {
        if (root.textContent.trim() === '原文を表示') processShowOriginalButton(root);
        continue;
      }

      // root → 対応する cellInnerDiv に正規化
      const cell = root.matches?.('[data-testid="cellInnerDiv"]') ? root
                 : root.closest?.('[data-testid="cellInnerDiv"]');
      const cells = cell ? [cell]
                   : (root.querySelectorAll ? root.querySelectorAll('[data-testid="cellInnerDiv"]') : []);

      for (const c of cells) {
        if (scannedCells.has(c)) continue;
        scannedCells.add(c);
        for (const btn of c.querySelectorAll('button')) {
          if (btn.textContent.trim() === '原文を表示') processShowOriginalButton(btn);
        }
      }
    }
    retryPendingButtons();
  }

  /**
   * ツイート詳細ページの「もっと見つける」(Discover more) セクションと
   * その後に続くおすすめツイート群をすべて非表示にする。
   * h2[role="heading"] のテキストを判定基点にし、該当する cellInnerDiv 以降の
   * 兄弟 cellInnerDiv をまとめて display: none にする。
   */
  function cleanDiscoverMore() {
    const DISCOVER_MORE_RE = /^(もっと見つける|Discover more)$/i;
    const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
    if (!primaryColumn) return;

    const headings = primaryColumn.querySelectorAll('h2[role="heading"]');
    for (const h2 of headings) {
      if (!DISCOVER_MORE_RE.test(h2.textContent.trim())) continue;

      // h2 を含む cellInnerDiv を特定
      const cell = h2.closest('[data-testid="cellInnerDiv"]');
      if (!cell) continue;

      // この cellInnerDiv 自体と、以降の兄弟要素をすべて非表示
      let sibling = cell;
      while (sibling) {
        if (sibling.style.display !== 'none') {
          sibling.style.setProperty('display', 'none', 'important');
        }
        sibling = sibling.nextElementSibling;
      }
    }
  }

  /**
   * 話題を検索ページ (/explore) の「本日のニュース」「おすすめユーザー」「おすすめ投稿」を非表示にする
   */
  function cleanExplorePage() {
    if (!location.pathname.startsWith('/explore')) return;

    const headingsToHide = {
      news: ["本日のニュース", "Today's news", "Today's News", "What's happening", "いまどうしてる？"],
      follow: ["おすすめユーザー", "Who to follow", "Who to Follow", "おすすめのユーザー"],
      posts: ["おすすめ投稿", "おすすめの投稿", "おすすめのポスト", "Recommended posts", "Recommended Posts", "おすすめトレンド", "Recommended trends"]
    };

    const allHeadings = Object.values(headingsToHide).flat();
    const timeRegex = /\d+\s*(時間前|分前|日前|hour|minute|day|h|m|d)s?/;

    const cells = Array.from(document.querySelectorAll('[data-testid="cellInnerDiv"]'));
    const hiddenIndices = new Set();

    // First pass: Hide target headers, user cards, recommended posts, and news articles based on content
    cells.forEach((cell, idx) => {
      let shouldHide = false;

      // 1. Check if it contains a target heading
      const h2 = cell.querySelector('h2');
      if (h2 && allHeadings.includes(h2.textContent.trim())) {
        shouldHide = true;
      }

      // 2. Check if it contains UserCell (Who to Follow)
      if (cell.querySelector('[data-testid="UserCell"]')) {
        shouldHide = true;
      }

      // 3. Check if it contains "Show more" link for Who to Follow
      if (cell.querySelector('a[href="/i/connect_people"]')) {
        shouldHide = true;
      }

      // 4. Check if it contains tweet (Recommended Posts)
      if (cell.querySelector('[data-testid="tweet"]')) {
        shouldHide = true;
      }

      // 5. Check if it is a news trend (Today's News)
      const trend = cell.querySelector('[data-testid="trend"]');
      if (trend) {
        const hasImg = !!trend.querySelector('img');
        const hasTime = timeRegex.test(cell.textContent);
        if (hasImg || hasTime) {
          shouldHide = true;
        }
      }

      if (shouldHide) {
        cell.style.setProperty('display', 'none', 'important');
        hiddenIndices.add(idx);
      }
    });

    // Second pass: Hide empty spacer cells adjacent to hidden elements to clean up gaps
    cells.forEach((cell, idx) => {
      if (cell.textContent.trim() === '') {
        if (hiddenIndices.has(idx - 1) || hiddenIndices.has(idx + 1)) {
          cell.style.setProperty('display', 'none', 'important');
          hiddenIndices.add(idx);
        }
      }
    });
  }

  // ============================================================
  // 3. MutationObserver（追加ノードのみ処理・RAF でバッチ化）
  // ============================================================
  let rafId = null;
  let scrollRafId = null;
  let pendingAddedNodes = [];

  function scheduleRetweetToggleSync() {
    if (scrollRafId || !currentProfileHandle) return;
    scrollRafId = requestAnimationFrame(() => {
      scrollRafId = null;
      syncRetweetToggleButtons(currentProfileHandle);
    });
  }

  function onMutation(mutations) {
    let urlChanged = false;
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      urlChanged = true;
    }

    if (urlChanged) {
      // プレミアム勧誘ページならホームへリダイレクト
      if (redirectIfPremiumPage()) return;
      // URL 変化 → キャッシュをリセットして全体再スキャン
      forYouWrapper = null;
      const nextProfileHandle = getCurrentProfileHandleFromUrl();
      currentProfileHandle = nextProfileHandle;
      hideProfileRetweets = getProfileRetweetsHidden(currentProfileHandle);
      pendingAddedNodes.length = 0;
      pendingAddedNodes.push(document.documentElement);
    } else {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            pendingAddedNodes.push(node);
          }
        }
      }
    }

    if (pendingAddedNodes.length === 0) return;
    if (rafId) return; // 既に RAF 予約済み → 次フレームで一括処理

    rafId = requestAnimationFrame(() => {
      rafId = null;
      const roots = pendingAddedNodes; // 積みノードを全取得
      pendingAddedNodes = [];

      cleanForYouTab();              // タブは常に確認（SPA 再描画対応）
      cleanPremiumLinks(roots);      // 追加 nav/header のみ
      cleanSidebarSections(roots);   // サイドバー変化時のみ
      syncRetweetToggleButtons(currentProfileHandle);
      applyProfileRetweetVisibility(roots);
      cleanDiscoverMore();            // 「もっと見つける」非表示
      cleanExplorePage();             // 「話題を検索」ページのクリーンアップ
      setTimeout(() => clickShowOriginalButtons(roots), 0); // ペイント後に遅延実行
    });
  }

  const observer = new MutationObserver(onMutation);

  function start() {
    // 起動時にプレミアム勧誘ページならホームへリダイレクト
    if (redirectIfPremiumPage()) return;
    currentProfileHandle = getCurrentProfileHandleFromUrl();
    hideProfileRetweets = getProfileRetweetsHidden(currentProfileHandle);
    window.addEventListener('scroll', scheduleRetweetToggleSync, { passive: true });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    // 初回は全体スキャン
    const roots = [document.documentElement];
    cleanForYouTab();
    cleanPremiumLinks(roots);
    cleanSidebarSections(roots);
    syncRetweetToggleButtons(currentProfileHandle);
    applyProfileRetweetVisibility(roots);
    cleanDiscoverMore();
    cleanExplorePage();            // 「話題を検索」ページのクリーンアップ
    clickShowOriginalButtons(roots);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
