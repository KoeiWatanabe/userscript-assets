// ==UserScript==
// @name         Twitterのレイアウト調整
// @namespace    http://tampermonkey.net/
// @version      1.8.0
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
  `);

  // ============================================================
  // 2. JavaScript による動的処理
  // ============================================================

  let lastUrl = location.href;
  // おすすめタブの wrapper をキャッシュ（DOM 内で非表示のまま → O(1) スキップ）
  let forYouWrapper = null;

  // 原文を表示したい言語（「○○からの翻訳」の○○部分）
  const SHOW_ORIGINAL_LANGS = new Set(['英語']);

  // WeakSet で処理済みボタンを追跡（DOM 属性不要・副作用なし）
  const processedButtons = new WeakSet();
  // 言語ラベル未描画のボタンを保留（WeakRef で参照保持・GC 可能）
  const pendingButtons = new Set();

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

  /** 右サイドバーのニュース・トレンドセクションを非表示（サイドバー変化時のみ実行） */
  function cleanSidebarSections(roots) {
    const sidebar = document.querySelector('[data-testid="sidebarColumn"]');
    if (!sidebar) return;

    // サイドバーに関係するノードが追加されたときだけ実行
    const affected = roots.some(root =>
      sidebar === root || sidebar.contains(root) || root.contains(sidebar)
    );
    if (!affected) return;

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
        if (cur.querySelector('[data-testid="SearchBox_Search_Input"]')) break;
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

    const sourceLang = getSourceLanguage(cellDiv);
    if (sourceLang === null) {
      // ラベルがまだ描画されていない → 保留
      pendingButtons.add(new WeakRef(btn));
      return;
    }

    processedButtons.add(btn);
    if (SHOW_ORIGINAL_LANGS.has(sourceLang)) btn.click();
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
      const sourceLang = getSourceLanguage(cellDiv);
      if (sourceLang !== null) {
        pendingButtons.delete(ref);
        processedButtons.add(btn);
        if (SHOW_ORIGINAL_LANGS.has(sourceLang)) btn.click();
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

  // ============================================================
  // 3. MutationObserver（追加ノードのみ処理・RAF でバッチ化）
  // ============================================================
  let rafId = null;
  let pendingAddedNodes = [];

  function onMutation(mutations) {
    let urlChanged = false;
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      urlChanged = true;
    }

    if (urlChanged) {
      // URL 変化 → キャッシュをリセットして全体再スキャン
      forYouWrapper = null;
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
      setTimeout(() => clickShowOriginalButtons(roots), 0); // ペイント後に遅延実行
    });
  }

  const observer = new MutationObserver(onMutation);

  function start() {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    // 初回は全体スキャン
    const roots = [document.documentElement];
    cleanForYouTab();
    cleanPremiumLinks(roots);
    cleanSidebarSections(roots);
    clickShowOriginalButtons(roots);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
