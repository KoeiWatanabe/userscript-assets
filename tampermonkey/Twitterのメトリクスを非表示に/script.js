// ==UserScript==
// @name         Twitterのレイアウト調整
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  メトリクス非表示（ホバー時表示）・サイドバー整理・おすすめタブ削除・原文デフォルト表示
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
    article [data-testid="reply"] [data-testid="app-text-transition-container"],
    article [data-testid="retweet"] [data-testid="app-text-transition-container"],
    article [data-testid="unretweet"] [data-testid="app-text-transition-container"],
    article [data-testid="like"] [data-testid="app-text-transition-container"],
    article [data-testid="unlike"] [data-testid="app-text-transition-container"],
    article [data-testid="bookmark"] [data-testid="app-text-transition-container"],
    article [data-testid="removeBookmark"] [data-testid="app-text-transition-container"],
    article [href*="/analytics"] [data-testid="app-text-transition-container"],
    article [data-testid="analyticsButton"] [data-testid="app-text-transition-container"] {
      opacity: 0;
      transition: opacity 0.2s ease-in-out;
      visibility: hidden;
    }

    article:hover [data-testid="reply"] [data-testid="app-text-transition-container"],
    article:hover [data-testid="retweet"] [data-testid="app-text-transition-container"],
    article:hover [data-testid="unretweet"] [data-testid="app-text-transition-container"],
    article:hover [data-testid="like"] [data-testid="app-text-transition-container"],
    article:hover [data-testid="unlike"] [data-testid="app-text-transition-container"],
    article:hover [data-testid="bookmark"] [data-testid="app-text-transition-container"],
    article:hover [data-testid="removeBookmark"] [data-testid="app-text-transition-container"],
    article:hover [href*="/analytics"] [data-testid="app-text-transition-container"],
    article:hover [data-testid="analyticsButton"] [data-testid="app-text-transition-container"] {
      opacity: 1;
      visibility: visible;
    }

    /* ===== 左サイドバー: プレミアムリンク非表示 ===== */
    a[href="/i/premium_sign_up"],
    a[href="/i/verified-choose"],
    a[href="/i/verified-orgs-signup"] {
      display: none !important;
    }

    nav li:has(a[href="/i/premium_sign_up"]),
    nav li:has(a[href="/i/verified-choose"]),
    nav li:has(a[href="/i/verified-orgs-signup"]),
    nav div:has(> a[href="/i/premium_sign_up"]),
    nav div:has(> a[href="/i/verified-choose"]),
    nav div:has(> a[href="/i/verified-orgs-signup"]) {
      display: none !important;
    }

    [data-testid="AppTabBar_Premium_Link"] {
      display: none !important;
    }

    /* ===== 右サイドバー: 不要セクション非表示 ===== */
    [data-testid="sidebarColumn"] aside,
    [data-testid="sidebarColumn"] div:has(> aside) {
      display: none !important;
    }

    [data-testid="sidebarColumn"] [data-testid="news_sidebar"],
    [data-testid="sidebarColumn"] [data-testid="trend"] {
      display: none !important;
    }

    [data-testid="sidebarColumn"] nav {
      display: none !important;
    }

    [data-testid="sidebarColumn"] [data-testid*="Upsell"],
    [data-testid="sidebarColumn"] [data-testid*="upsell"],
    [data-testid="sidebarColumn"] [data-testid="placementTracking"] {
      display: none !important;
    }

    /* ===== タイムライン: タブ中央寄せ ===== */
    [data-testid="ScrollSnap-List"] {
      justify-content: center !important;
    }
  `);

  // ============================================================
  // 2. JavaScript による動的処理
  // ============================================================

  let tabCleaned = false;
  let lastUrl = location.href;
  const PROCESSED_ATTR = 'data-show-original-done';

  /** 左サイドバーのプレミアムリンクをテキストベースでも削除 */
  function cleanPremiumLinks() {
    document.querySelectorAll('nav a, header a').forEach((a) => {
      const text = a.textContent.trim();
      if (/^(Premium|プレミアム|Verified)(\s|$)/i.test(text)) {
        const row = a.closest('li') || a.closest('[data-testid]') || a.parentElement;
        if (row && row.style.display !== 'none') {
          row.style.setProperty('display', 'none', 'important');
        }
      }
    });
  }

  /** タイムラインの「おすすめ」タブを非表示、「フォロー中」を自動選択 */
  function cleanForYouTab() {
    if (tabCleaned) return;

    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    if (tabs.length === 0) return;

    let forYouTab = null;
    let followingTab = null;

    for (const tab of tabs) {
      const text = tab.textContent.trim();
      if (/^(おすすめ|For You)$/i.test(text)) {
        forYouTab = tab;
      } else if (/^(フォロー中|Following)$/i.test(text)) {
        followingTab = tab;
      }
    }

    if (!forYouTab) return;

    const forYouWrapper = forYouTab.closest('[role="presentation"]') || forYouTab;
    forYouWrapper.style.setProperty('display', 'none', 'important');

    if (followingTab && followingTab.getAttribute('aria-selected') !== 'true') {
      followingTab.click();
    }

    tabCleaned = true;
  }

  /** 右サイドバーのニュース・トレンドセクションを非表示 */
  function cleanSidebarSections() {
    const sidebar = document.querySelector('[data-testid="sidebarColumn"]');
    if (!sidebar) return;

    const HIDE_HEADINGS = /^(本日のニュース|「いま」を見つけよう|What's happening|Today's news)/i;

    sidebar.querySelectorAll('h2').forEach((h2) => {
      if (!HIDE_HEADINGS.test(h2.textContent.trim())) return;

      let target = null;
      let cur = h2.parentElement;
      while (cur && cur !== sidebar) {
        if (cur.querySelector('[data-testid="SearchBox_Search_Input"]')) break;
        target = cur;
        cur = cur.parentElement;
      }
      if (target && target.style.display !== 'none') {
        target.style.setProperty('display', 'none', 'important');
      }
    });
  }

  /** 「原文を表示」ボタンを自動クリック */
  function clickShowOriginalButtons(root) {
    const buttons = root.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent.trim() === '原文を表示' && !btn.hasAttribute(PROCESSED_ATTR)) {
        if (btn.closest('[data-testid="cellInnerDiv"]')) {
          btn.setAttribute(PROCESSED_ATTR, '1');
          btn.click();
        }
      }
    }
  }

  /** 全クリーンアップ実行 */
  function cleanAll() {
    cleanPremiumLinks();
    cleanForYouTab();
    cleanSidebarSections();
    clickShowOriginalButtons(document);
  }

  // ============================================================
  // 3. MutationObserver（統合版）
  // ============================================================
  let rafId = null;

  function onMutation() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      tabCleaned = false;
    }

    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      cleanAll();
    });
  }

  const observer = new MutationObserver(onMutation);

  function start() {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    cleanAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();