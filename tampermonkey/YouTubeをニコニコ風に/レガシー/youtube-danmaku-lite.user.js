// ==UserScript==
// @name         YouTube Live Chat Danmaku Lite (ニコニコ風コメント 軽量版)
// @namespace    https://github.com/tampermonkey-youtube-danmaku
// @version      2.0.0
// @description  YouTubeライブチャットのコメントをニコニコ動画風に動画上へ弾幕表示する（軽量版）
// @author       You
// @match        https://www.youtube.com/watch*
// @match        https://www.youtube.com/live_chat*
// @match        https://www.youtube.com/live_chat_replay*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─── 表示設定 ───
  const CONFIG = {
    fontSize: 32,           // フォントサイズ (px)
    fontFamily: '"Noto Sans JP", sans-serif',
    fontWeight: 'bold',
    opacity: 0.85,          // コメント不透明度
    duration: 6,            // コメントが画面を横切る秒数
    maxLines: 20,           // 同時表示行数上限
    color: '#FFFFFF',       // デフォルト文字色
    shadowColor: '#000000', // 文字影の色
    displayArea: 1.0,       // 表示領域（動画の上から何割）
    ownerColor: '#FFD600',  // チャンネル主の文字色
    modColor: '#5E84F1',    // モデレーターの文字色
    iconSize: 28,           // アイコンサイズ (px)
    bgOpacity: 0.35,        // 特殊コメント背景の不透明度 (0.0〜1.0)
    showIcons: true,        // アイコン表示（falseで軽量化）
  };

  // ─── パフォーマンス設定 ───
  const PERF = {
    batchDelay: 80,         // バッチ処理の間隔 (ms)
    batchSize: 10,          // 1回に処理するコメント数
    maxQueueSize: 60,       // キューの最大サイズ
    maxActiveDanmaku: 30,   // 同時表示弾幕数の上限
    skipWhenHidden: true,   // タブ非表示時にスキップ
  };

  // ─── 対象メッセージのタグ名 ───
  const MESSAGE_TAGS = new Set([
    'yt-live-chat-text-message-renderer',
    'yt-live-chat-paid-message-renderer',
    'yt-live-chat-membership-item-renderer',
  ]);

  // ─── 状態 ───
  let overlay = null;
  let lineTracker = [];
  let enabled = true;
  let chatObserver = null;
  let chatObservedItems = null;
  let activeDanmakuCount = 0;
  let pendingNodes = [];
  let flushTimer = 0;
  let cachedOverlayHeight = 0;
  let cachedOverlayWidth = 0;

  // ─── スタイル注入 ───
  function injectStyles() {
    if (document.getElementById('yt-danmaku-style')) return;
    const style = document.createElement('style');
    style.id = 'yt-danmaku-style';
    style.textContent = `
      #yt-danmaku-overlay {
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        pointer-events: none;
        overflow: hidden;
        z-index: 2021;
        contain: layout style paint;
      }
      .yt-danmaku-item {
        position: absolute;
        left: 100%;
        white-space: nowrap;
        pointer-events: none;
        transform: translate3d(0, 0, 0);
        backface-visibility: hidden;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 70vw;
        font-family: ${CONFIG.fontFamily};
        font-weight: ${CONFIG.fontWeight};
        opacity: ${CONFIG.opacity};
        color: ${CONFIG.color};
        text-shadow: 1px 1px 2px ${CONFIG.shadowColor};
      }
      .yt-danmaku-emoji {
        height: ${CONFIG.fontSize}px;
        width: ${CONFIG.fontSize}px;
        vertical-align: middle;
        margin: 0 1px;
        object-fit: contain;
      }
      .yt-danmaku-item.yt-danmaku-active {
        transition: transform linear;
      }
    `;
    document.head.appendChild(style);
  }

  // ─── メッセージフラグメント構築（DOM走査1回で空判定+クローン）───
  function buildMessageFragment(msgEl) {
    const fragment = document.createDocumentFragment();
    let hasContent = false;

    function walk(node, parent) {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {
          const text = child.textContent || '';
          if (text.trim()) hasContent = true;
          if (text) parent.appendChild(document.createTextNode(text));
        } else if (child.nodeType === 1) {
          const tag = child.tagName.toLowerCase();
          if (tag === 'img') {
            const src = child.getAttribute('src');
            if (src) {
              hasContent = true;
              const img = document.createElement('img');
              img.src = src;
              img.alt = child.getAttribute('alt') || '';
              img.className = 'yt-danmaku-emoji';
              parent.appendChild(img);
            }
          } else {
            walk(child, parent);
          }
        }
      }
    }

    walk(msgEl, fragment);
    return hasContent ? fragment : null;
  }

  // ─── チャットノードからメタ情報を抽出 ───
  function extractChatInfo(node) {
    const tagName = node.tagName.toLowerCase();
    const authorType = node.getAttribute('author-type');
    const authorNameEl = node.querySelector('#author-name');
    const authorName = authorNameEl ? (authorNameEl.textContent || '').trim() : '';
    const photoEl = node.querySelector('#author-photo img, #author-photo yt-img-shadow img, yt-img-shadow img');
    const photoSrc = photoEl ? photoEl.getAttribute('src') : null;

    const info = {
      tagName,
      authorType,
      authorName,
      photoSrc,
      amount: null,
      bgColor: null,
      textColor: CONFIG.color,
      isSpecial: false,
    };

    if (tagName === 'yt-live-chat-paid-message-renderer') {
      const amountEl = node.querySelector('#purchase-amount, #purchase-amount-chip');
      info.amount = amountEl ? (amountEl.textContent || '').trim() : null;
      info.bgColor = node.style.getPropertyValue('--yt-live-chat-paid-message-primary-color') || 'rgba(230,33,23,0.8)';
      info.textColor = node.style.getPropertyValue('--yt-live-chat-paid-message-header-color') || '#FFFFFF';
      info.isSpecial = true;
    }

    if (tagName === 'yt-live-chat-membership-item-renderer') {
      info.bgColor = 'rgba(15,157,88,0.8)';
      info.isSpecial = true;
    }

    if (authorType === 'owner') {
      info.textColor = CONFIG.ownerColor;
      info.isSpecial = true;
    }

    if (authorType === 'moderator') {
      info.textColor = CONFIG.modColor;
      info.isSpecial = true;
    }

    if (info.bgColor) {
      const rgbaMatch = info.bgColor.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
      if (rgbaMatch) {
        info.bgColor = `rgba(${rgbaMatch[1]},${rgbaMatch[2]},${rgbaMatch[3]},${CONFIG.bgOpacity})`;
      }
    }

    return info;
  }

  // ─── オーバーレイ作成 ───
  function createOverlay() {
    const player = document.querySelector('#movie_player');
    if (!player) return null;

    const existing = player.querySelector('#yt-danmaku-overlay');
    if (existing) existing.remove();

    injectStyles();

    const el = document.createElement('div');
    el.id = 'yt-danmaku-overlay';
    player.style.position = 'relative';
    player.appendChild(el);

    // ResizeObserverでサイズをキャッシュ
    try {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          cachedOverlayHeight = entry.contentRect.height;
          cachedOverlayWidth = entry.contentRect.width;
        }
      });
      ro.observe(el);
    } catch (_) {
      // fallback: 毎回読む
    }
    cachedOverlayHeight = el.clientHeight;
    cachedOverlayWidth = el.clientWidth;

    return el;
  }

  // ─── 行割り当て（特殊コメントは2行分確保）───
  function getAvailableLine(tall) {
    const now = Date.now();
    const maxLines = CONFIG.maxLines;
    if (lineTracker.length !== maxLines) {
      lineTracker = new Array(maxLines).fill(0);
    }
    const clearTime = CONFIG.duration * 0.3 * 1000;
    const needed = tall ? 2 : 1;

    for (let i = 0; i <= maxLines - needed; i++) {
      let ok = true;
      for (let j = 0; j < needed; j++) {
        if (now - lineTracker[i + j] <= clearTime) { ok = false; break; }
      }
      if (ok) {
        for (let j = 0; j < needed; j++) lineTracker[i + j] = now;
        return i;
      }
    }
    const fallback = Math.floor(Math.random() * (maxLines - needed + 1));
    for (let j = 0; j < needed; j++) lineTracker[fallback + j] = now;
    return fallback;
  }

  // ─── 弾幕生成 ───
  function spawnDanmaku(messageFragment, chatInfo) {
    if (!enabled) return;
    if (activeDanmakuCount >= PERF.maxActiveDanmaku) return;
    if (!overlay || !overlay.isConnected) {
      overlay = createOverlay();
    }
    if (!overlay) return;

    const isSpecial = chatInfo.isSpecial;
    const line = getAvailableLine(isSpecial);
    const lineHeight = CONFIG.fontSize * 1.4;
    const areaHeight = (cachedOverlayHeight || overlay.clientHeight) * CONFIG.displayArea;
    const topPos = (line * lineHeight) % areaHeight;

    const el = document.createElement('div');
    el.className = 'yt-danmaku-item';
    el.style.top = topPos + 'px';

    // 色が既定と違う場合のみ個別設定
    if (chatInfo.textColor !== CONFIG.color) {
      el.style.color = chatInfo.textColor;
    }

    // 背景色（特殊コメント）
    if (isSpecial && chatInfo.bgColor) {
      el.style.background = chatInfo.bgColor;
      el.style.borderRadius = '8px';
      el.style.padding = '6px 14px';
    }

    if (isSpecial) {
      // 1行目: アイコン + 名前 + 金額
      const headerRow = document.createElement('div');
      headerRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:2px;';

      if (chatInfo.photoSrc && CONFIG.showIcons) {
        const icon = document.createElement('img');
        icon.src = chatInfo.photoSrc;
        icon.style.cssText = `width:${CONFIG.iconSize}px;height:${CONFIG.iconSize}px;border-radius:50%;object-fit:cover;flex-shrink:0;`;
        headerRow.appendChild(icon);
      }

      if (chatInfo.authorName) {
        const nameSpan = document.createElement('span');
        nameSpan.textContent = chatInfo.authorName;
        nameSpan.style.cssText = `font-size:${CONFIG.fontSize * 0.55}px;opacity:0.9;`;
        headerRow.appendChild(nameSpan);
      }

      if (chatInfo.amount) {
        const sep = document.createElement('span');
        sep.textContent = ' - ';
        sep.style.cssText = `font-size:${CONFIG.fontSize * 0.55}px;opacity:0.7;`;
        headerRow.appendChild(sep);

        const amountSpan = document.createElement('span');
        amountSpan.textContent = chatInfo.amount;
        amountSpan.style.cssText = `font-size:${CONFIG.fontSize * 0.55}px;opacity:0.9;`;
        headerRow.appendChild(amountSpan);
      }

      el.appendChild(headerRow);

      // 2行目: メッセージ本文
      const msgRow = document.createElement('div');
      msgRow.style.fontSize = CONFIG.fontSize + 'px';
      msgRow.appendChild(messageFragment);
      el.appendChild(msgRow);
    } else {
      // 通常コメント: 1行表示
      const msgSpan = document.createElement('span');
      msgSpan.style.fontSize = CONFIG.fontSize + 'px';
      msgSpan.appendChild(messageFragment);
      el.appendChild(msgSpan);
    }

    overlay.appendChild(el);
    activeDanmakuCount++;

    requestAnimationFrame(() => {
      const overlayW = cachedOverlayWidth || overlay.clientWidth;
      const elW = el.clientWidth;
      const distance = overlayW + elW + 20;
      el.style.transitionDuration = CONFIG.duration + 's';
      el.classList.add('yt-danmaku-active');
      el.style.transform = `translate3d(-${distance}px, 0, 0)`;
    });

    const removeDelay = (CONFIG.duration + 0.5) * 1000;
    setTimeout(() => {
      if (el.parentNode) {
        activeDanmakuCount--;
        el.remove();
      }
    }, removeDelay);
  }

  // ─── チャットメッセージの処理 ───
  function processNode(node) {
    if (node.nodeType !== 1) return;
    const tagName = node.tagName.toLowerCase();
    if (!MESSAGE_TAGS.has(tagName)) return;

    const msgEl = node.querySelector('#message');
    if (!msgEl) return;

    const fragment = buildMessageFragment(msgEl);
    if (!fragment) return;

    const chatInfo = extractChatInfo(node);
    spawnDanmaku(fragment, chatInfo);
  }

  // ─── バッチ処理キュー ───
  function enqueueNode(node) {
    if (!node || node.nodeType !== 1) return;
    pendingNodes.push(node);
    if (pendingNodes.length > PERF.maxQueueSize) {
      pendingNodes.splice(0, pendingNodes.length - PERF.maxQueueSize);
    }
    if (!flushTimer) {
      flushTimer = setTimeout(flushPendingNodes, PERF.batchDelay);
    }
  }

  function flushPendingNodes() {
    flushTimer = 0;
    if (PERF.skipWhenHidden && document.hidden) {
      pendingNodes.length = 0;
      return;
    }
    const batch = pendingNodes.splice(0, PERF.batchSize);
    for (const node of batch) {
      processNode(node);
    }
    if (pendingNodes.length) {
      flushTimer = setTimeout(flushPendingNodes, PERF.batchDelay);
    }
  }

  // ─── Mutation処理 ───
  function handleChatMutation(mutations) {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        enqueueNode(node);
      }
    }
  }

  // ─── iframeのチャットDOMを監視 ───
  function observeChat() {
    const chatFrame = document.querySelector('#chatframe');
    if (!chatFrame) return false;

    let chatDoc;
    try {
      chatDoc = chatFrame.contentDocument;
    } catch (e) {
      return false;
    }
    if (!chatDoc || !chatDoc.body) return false;

    const itemList = chatDoc.querySelector('yt-live-chat-item-list-renderer #items');
    if (!itemList) return false;

    if (chatObservedItems === itemList) return true;

    if (chatObserver) {
      chatObserver.disconnect();
    }

    chatObserver = new MutationObserver(handleChatMutation);
    chatObserver.observe(itemList, { childList: true });
    chatObservedItems = itemList;
    return true;
  }

  // ─── チャット準備待ち（ポーリング方式）───
  function waitForChat() {
    if (observeChat()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      if (observeChat() || attempts++ > 30) {
        clearInterval(timer);
      }
    }, 1000);
  }

  // ─── Alt+C で弾幕ON/OFF ───
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      enabled = !enabled;
      if (!enabled && overlay) {
        while (overlay.firstChild) overlay.firstChild.remove();
        activeDanmakuCount = 0;
      }
    }
  });

  // ─── 初期化 ───
  function init() {
    injectStyles();
    overlay = createOverlay();
    if (!overlay) {
      let attempts = 0;
      const timer = setInterval(() => {
        overlay = createOverlay();
        if (overlay || attempts++ > 30) {
          clearInterval(timer);
          if (overlay) waitForChat();
        }
      }, 1000);
    } else {
      waitForChat();
    }
  }

  init();

  // ─── SPA ナビゲーション対応 ───
  document.addEventListener('yt-navigate-finish', () => {
    if (window.location.pathname === '/watch') {
      if (chatObserver) {
        chatObserver.disconnect();
        chatObserver = null;
        chatObservedItems = null;
      }
      pendingNodes.length = 0;
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = 0; }
      activeDanmakuCount = 0;
      setTimeout(() => {
        overlay = createOverlay();
        waitForChat();
      }, 1500);
    }
  });
})();
