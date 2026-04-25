// ==UserScript==
// @name         YouTubeをニコニコ風にする
// @namespace    https://github.com/tampermonkey-youtube-danmaku
// @version      2.1.2
// @description  YouTubeライブチャットのコメントをニコニコ動画風に動画上へ弾幕表示する
// @author       You
// @match        https://www.youtube.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeをニコニコ風に/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeをニコニコ風に/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeをニコニコ風に/icon_128.png
// ==/UserScript==

(function () {
  'use strict';

  // iframe 内では実行しない（chat iframe で無駄に動くのを防止）
  if (window.top !== window.self) return;

  // ─── 設定 ───
  const CONFIG = {
    fontFamily: '"Noto Sans JP", sans-serif',
    fontWeight: 'bold',
    opacity: 0.9,          // コメント不透明度
    duration: 6,            // コメントが画面を横切る秒数
    maxLines: 14,           // 同時表示行数（画面を何分割するか）
    lineHeightRatio: 1.4,   // 行の高さ = fontSize × この値
    color: '#FFFFFF',       // デフォルト文字色
    shadowColor: '#000000', // 文字影の色
    displayArea: 1.0,       // 表示領域（動画の上から何割）
    ownerColor: '#FFD600',  // チャンネル主の文字色
    modColor: '#5E84F1',    // モデレーターの文字色
    bgOpacity: 0.35,        // 特殊コメント背景の不透明度 (0.0〜1.0)
    notifyIcon: "https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeをニコニコ風に/icon_128.png",
  };

  // ─── バッチ処理設定 ───
  const PERF = {
    batchDelay: 80,      // バッチ処理の間隔 (ms)
    batchSize: 10,       // 1回に処理する最大件数
    maxQueueSize: 60,    // キューの最大サイズ（超過分は古いものを捨てる）
    skipWhenHidden: true, // タブ非表示時はスキップ
  };

  // ─── スーパーチャット / スティッカーのCSS変数マップ ───
  const PAID_TAGS = {
    'yt-live-chat-paid-message-renderer': '--yt-live-chat-paid-message-primary-color',
    'yt-live-chat-paid-sticker-renderer': '--yt-live-chat-paid-sticker-background-color',
  };

  // ─── DOM生成ヘルパー ───
  // h('div', { className: 'foo', style: 'color:red' }, [child1, 'text'])
  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (k === 'style') el.style.cssText = v;
      else el[k] = v;
    }
    if (children != null) {
      const list = Array.isArray(children) ? children : [children];
      for (const c of list) {
        if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return el;
  }

  // ─── 動的フォントサイズ（画面サイズから自動計算）───
  let fontSize = 32; // 初期値（overlay作成後に上書き）

  function updateFontSize() {
    if (!overlayHeight) return;
    fontSize = Math.floor(overlayHeight * CONFIG.displayArea / (CONFIG.maxLines * CONFIG.lineHeightRatio));
    if (overlay) overlay.style.setProperty('--yt-danmaku-fs', fontSize + 'px');
  }

  // ─── 映像領域に合わせてオーバーレイの位置・サイズを更新 ───
  function updateOverlayBounds() {
    if (!overlay) return;
    const player = overlay.parentElement;
    if (!player) return;
    const video = player.querySelector('video');
    if (!video || !video.videoWidth || !video.videoHeight) {
      // 映像情報が未取得の場合はフル表示
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlayWidth = player.clientWidth;
      overlayHeight = player.clientHeight;
      overlay.style.setProperty('--yt-danmaku-w', overlayWidth + 'px');
      updateFontSize();
      return;
    }

    const playerW = player.clientWidth;
    const playerH = player.clientHeight;
    const videoAspect = video.videoWidth / video.videoHeight;
    const playerAspect = playerW / playerH;

    let renderW, renderH, offsetX, offsetY;

    if (playerAspect > videoAspect) {
      // プレイヤーが横長 → 左右に黒帯（ピラーボックス）
      renderH = playerH;
      renderW = playerH * videoAspect;
      offsetX = (playerW - renderW) / 2;
      offsetY = 0;
    } else {
      // プレイヤーが縦長 → 上下に黒帯（レターボックス）
      renderW = playerW;
      renderH = playerW / videoAspect;
      offsetX = 0;
      offsetY = (playerH - renderH) / 2;
    }

    overlay.style.top = offsetY + 'px';
    overlay.style.left = offsetX + 'px';
    overlay.style.width = renderW + 'px';
    overlay.style.height = renderH + 'px';
    overlayWidth = renderW;
    overlayHeight = renderH;
    overlay.style.setProperty('--yt-danmaku-w', overlayWidth + 'px');
    updateFontSize();
  }

  // ─── 共通スタイルの注入 ───
  function injectStyles() {
    if (document.getElementById('yt-danmaku-style')) return;
    const style = document.createElement('style');
    style.id = 'yt-danmaku-style';
    style.textContent = `
      #yt-danmaku-overlay {
        position: absolute;
        top: 0; left: 0; width: 100%; height: 100%;
        pointer-events: none;
        overflow: hidden;
        z-index: 2021;
        contain: layout paint;
      }
      @keyframes yt-danmaku-scroll {
        from { transform: translateX(0); }
        to   { transform: translateX(calc(-100% - var(--yt-danmaku-w, 1600px) - 20px)); }
      }
      .yt-danmaku-item {
        position: absolute;
        white-space: nowrap;
        left: 100%;
        font-family: ${CONFIG.fontFamily};
        font-weight: ${CONFIG.fontWeight};
        opacity: ${CONFIG.opacity};
        pointer-events: none;
        text-shadow:
          1px 1px 2px ${CONFIG.shadowColor},
          -1px -1px 2px ${CONFIG.shadowColor},
          1px -1px 2px ${CONFIG.shadowColor},
          -1px 1px 2px ${CONFIG.shadowColor};
        backface-visibility: hidden;
      }
      .yt-danmaku-emoji {
        height: var(--yt-danmaku-fs, 32px);
        width: var(--yt-danmaku-fs, 32px);
        vertical-align: middle;
        margin: 0 1px;
        object-fit: contain;
      }
      @keyframes yt-danmaku-notify-in {
        0%   { opacity: 0; transform: translate(-50%, -100%); }
        8%   { opacity: 1; transform: translate(-50%, 0); }
        80%  { opacity: 1; transform: translate(-50%, 0); }
        100% { opacity: 0; transform: translate(-50%, -100%); }
      }
      .yt-danmaku-notify {
        position: absolute;
        top: 12px; left: 50%;
        transform: translateX(-50%);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-radius: 14px;
        padding: 10px 14px;
        pointer-events: none;
        z-index: 2022;
        min-width: 260px; max-width: 340px;
        display: flex; align-items: center; gap: 10px;
        font-family: -apple-system, BlinkMacSystemFont, "Noto Sans JP", "Helvetica Neue", sans-serif;
        animation: yt-danmaku-notify-in 3s cubic-bezier(0.32, 0.72, 0, 1) forwards;
      }
      .yt-danmaku-notify.--dark {
        background: rgba(30, 30, 30, 0.88);
        box-shadow: 0 4px 24px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(255,255,255,0.1) inset;
        --nt-title: rgba(255,255,255,0.95); --nt-msg: rgba(255,255,255,0.6); --nt-time: rgba(255,255,255,0.35);
      }
      .yt-danmaku-notify.--light {
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 4px 24px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.06);
        --nt-title: rgba(0,0,0,0.88); --nt-msg: rgba(0,0,0,0.5); --nt-time: rgba(0,0,0,0.3);
      }
      .yt-danmaku-notify__icon-fallback {
        width: 36px; height: 36px;
        border-radius: 8px;
        background: linear-gradient(135deg, #FF3B30, #FF6B6B);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        color: #fff; font-size: 18px; font-weight: bold;
      }
      .yt-danmaku-notify__icon-img {
        width: 36px; height: 36px;
        border-radius: 8px;
        object-fit: cover;
        flex-shrink: 0;
      }
      .yt-danmaku-notify__body  { display: flex; flex-direction: column; gap: 1px; }
      .yt-danmaku-notify__title { font-size: 13px; font-weight: 600; letter-spacing: 0.2px; color: var(--nt-title); }
      .yt-danmaku-notify__msg   { font-size: 12px; font-weight: 400; color: var(--nt-msg); }
      .yt-danmaku-notify__time  { font-size: 11px; margin-left: auto; align-self: flex-start; flex-shrink: 0; color: var(--nt-time); }
    `;
    document.head.appendChild(style);
  }

  // ── iOS風トグル通知 ──
  let notifyTimer = 0;
  function showToggleNotify(isEnabled) {
    const player = document.querySelector('#movie_player');
    if (!player) return;

    const existing = player.querySelector('.yt-danmaku-notify');
    if (existing) existing.remove();
    if (notifyTimer) { clearTimeout(notifyTimer); notifyTimer = 0; }

    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const fallbackIcon = () => h('div', { className: 'yt-danmaku-notify__icon-fallback' }, '\u5F3E');

    const iconEl = CONFIG.notifyIcon
      ? h('img', {
          className: 'yt-danmaku-notify__icon-img',
          src: CONFIG.notifyIcon,
          onerror() { this.replaceWith(fallbackIcon()); },
        })
      : fallbackIcon();

    const banner = h('div', { className: 'yt-danmaku-notify ' + (isDark ? '--dark' : '--light') }, [
      iconEl,
      h('div', { className: 'yt-danmaku-notify__body' }, [
        h('div', { className: 'yt-danmaku-notify__title' }, 'YouTubeをニコニコ風にする'),
        h('div', { className: 'yt-danmaku-notify__msg' }, isEnabled ? '弾幕をオンにしました' : '弾幕をオフにしました'),
      ]),
      h('div', { className: 'yt-danmaku-notify__time' }, '今'),
    ]);

    player.appendChild(banner);
    notifyTimer = setTimeout(() => { banner.remove(); notifyTimer = 0; }, 3500);
  }

  // メッセージ要素からDOMノード群をクローンして返す（空なら null）
  // isEmptyMessage() と cloneMessageNodes() を統合し、1回の走査で処理
  function buildMessageFragment(msgEl) {
    const fragment = document.createDocumentFragment();
    let hasContent = false;

    function walk(node, parentFragment) {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) { // TEXT_NODE
          const text = child.textContent || '';
          if (text.trim()) hasContent = true;
          if (text) parentFragment.appendChild(document.createTextNode(text));
        } else if (child.nodeType === 1) { // ELEMENT_NODE
          if (child.localName === 'img') {
            const src = child.getAttribute('src');
            if (src) {
              hasContent = true;
              parentFragment.appendChild(h('img', { src, alt: child.getAttribute('alt') || '', className: 'yt-danmaku-emoji' }));
            }
          } else {
            walk(child, parentFragment);
          }
        }
      }
    }

    walk(msgEl, fragment);
    return hasContent ? fragment : null;
  }

  // チャットノードからメタ情報を抽出
  function extractChatInfo(node) {
    const tagName = node.localName;
    const authorType = node.getAttribute('author-type');
    const paidColorProp = PAID_TAGS[tagName];
    const isMembership = tagName === 'yt-live-chat-membership-item-renderer';
    const isOwner = authorType === 'owner';
    const isModerator = authorType === 'moderator';
    const isSpecial = Boolean(paidColorProp || isMembership || isOwner || isModerator);

    const info = {
      tagName,
      authorType,
      authorName: '',
      photoSrc: null,
      badgeSrc: null,
      amount: null,
      bgColor: null,
      textColor: isOwner ? CONFIG.ownerColor : isModerator ? CONFIG.modColor : CONFIG.color,
      isSpecial,
    };

    if (!isSpecial) return info;

    const authorNameEl = node.querySelector('#author-name');
    const photoEl = node.querySelector('#author-photo img');
    const badgeEl = node.querySelector('#chat-badges yt-live-chat-author-badge-renderer img');
    info.authorName = authorNameEl ? (authorNameEl.textContent || '').trim() : '';
    info.photoSrc = photoEl ? photoEl.getAttribute('src') : null;
    info.badgeSrc = badgeEl ? badgeEl.getAttribute('src') : null;

    // スーパーチャット / スティッカースパチャ（テーブル駆動で統合）
    // ※ YouTube は低額帯(緑・水色)で header-color を黒に設定するが、
    //   弾幕は動画上に表示するため文字色は常に白を使う
    if (paidColorProp) {
      const amountEl = node.querySelector('#purchase-amount, #purchase-amount-chip');
      info.amount = amountEl ? (amountEl.textContent || '').trim() : null;
      info.bgColor = getComputedStyle(node).getPropertyValue(paidColorProp).trim() || 'rgba(230,33,23,0.8)';
      info.textColor = '#FFFFFF';
    }

    // メンバー加入
    if (isMembership) {
      info.bgColor = 'rgba(15,157,88,0.8)';
    }

    // 背景色の不透明度をCONFIG.bgOpacityで上書き
    if (info.bgColor) {
      const m = info.bgColor.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
      if (m) info.bgColor = `rgba(${m[1]},${m[2]},${m[3]},${CONFIG.bgOpacity})`;
    }

    return info;
  }

  // ─── 対象メッセージのタグ名 ───
  const MESSAGE_TAGS = new Set([
    'yt-live-chat-text-message-renderer',
    'yt-live-chat-paid-message-renderer',
    'yt-live-chat-paid-sticker-renderer',
    'yt-live-chat-membership-item-renderer',
  ]);

  // ─── メインロジック ───
  let overlay = null;
  let overlayWidth = 0;
  let overlayHeight = 0;
  let resizeObserver = null;
  let laneTracker = []; // 各レーンの最後のコメント情報 { startTime, speed, width }
  let enabled = true;
  let watchSession = 0;
  let chatObserver = null;
  let chatItemsHostObserver = null;
  let chatObservedItems = null;
  let chatItemsHost = null;
  let pageObserver = null;
  let waitPlayerObserver = null;
  let chatRetryTimer = 0;
  let chatFrameLoadTarget = null;
  let chatFrameLoadHandler = null;
  let chatFrameLoadSession = 0;
  const processedIds = new Set(); // 重複コメント排除用
  const processedIdQueue = [];   // FIFO順で管理
  const channelNameTimers = new Set();

  // ── バッチ処理キュー ──
  let pendingNodes = [];
  let flushTimer = 0;

  function clearTimeoutId(timerId) {
    if (timerId) clearTimeout(timerId);
    return 0;
  }

  function disconnectObserver(observer) {
    if (observer) observer.disconnect();
    return null;
  }

  function nextWatchSession() {
    watchSession += 1;
    return watchSession;
  }

  function isActiveWatchSession(session) {
    return session === watchSession;
  }

  function clearChannelNameTimers() {
    for (const timerId of channelNameTimers) clearTimeout(timerId);
    channelNameTimers.clear();
  }

  function detachChatFrameLoad() {
    if (chatFrameLoadTarget && chatFrameLoadHandler) {
      chatFrameLoadTarget.removeEventListener('load', chatFrameLoadHandler);
    }
    chatFrameLoadTarget = null;
    chatFrameLoadHandler = null;
    chatFrameLoadSession = 0;
  }

  function stopChatTracking() {
    chatObserver = disconnectObserver(chatObserver);
    chatItemsHostObserver = disconnectObserver(chatItemsHostObserver);
    pageObserver = disconnectObserver(pageObserver);
    chatObservedItems = null;
    chatItemsHost = null;
    chatRetryTimer = clearTimeoutId(chatRetryTimer);
    detachChatFrameLoad();
  }

  function stopPlayerWait() {
    waitPlayerObserver = disconnectObserver(waitPlayerObserver);
  }

  function stopOverlay() {
    resizeObserver = disconnectObserver(resizeObserver);
    if (overlay && overlay.isConnected) overlay.remove();
    overlay = null;
    overlayWidth = 0;
    overlayHeight = 0;
  }

  function resetWatchState(clearProcessed) {
    nextWatchSession();
    stopChatTracking();
    stopPlayerWait();
    stopOverlay();
    resetRuntimeState(clearProcessed);
  }

  function waitForPlayer(session) {
    waitPlayerObserver = disconnectObserver(waitPlayerObserver);
    waitPlayerObserver = new MutationObserver(() => {
      if (!isActiveWatchSession(session)) return;
      if (!document.querySelector('#movie_player')) return;
      waitPlayerObserver = disconnectObserver(waitPlayerObserver);
      overlay = createOverlay();
      if (overlay) waitForChat(session);
    });
    waitPlayerObserver.observe(document.body, { childList: true, subtree: true });
  }

  function startWatchSession(session) {
    overlay = createOverlay();
    if (overlay) {
      waitForChat(session);
      return;
    }
    waitForPlayer(session);
  }

  function enqueueNode(node) {
    if (!node || node.nodeType !== 1) return;
    pendingNodes.push(node);
    // キューが溢れたら古いものを捨てる
    if (pendingNodes.length > PERF.maxQueueSize) {
      pendingNodes.splice(0, pendingNodes.length - PERF.maxQueueSize);
    }
    if (!flushTimer) flushTimer = setTimeout(flushPendingNodes, PERF.batchDelay);
  }

  function flushPendingNodes() {
    flushTimer = 0;
    if (PERF.skipWhenHidden && document.hidden) {
      pendingNodes.length = 0;
      return;
    }
    const batch = pendingNodes.splice(0, PERF.batchSize);
    for (const node of batch) processNode(node);
    // まだキューに残っていれば次のバッチをスケジュール
    if (pendingNodes.length) flushTimer = setTimeout(flushPendingNodes, PERF.batchDelay);
  }

  // ── オーバーレイ作成 ──
  function createOverlay() {
    const player = document.querySelector('#movie_player');
    if (!player) return null;

    const existing = player.querySelector('#yt-danmaku-overlay');
    if (existing) existing.remove();

    injectStyles();

    const el = h('div', { id: 'yt-danmaku-overlay' });
    player.style.position = 'relative';
    player.appendChild(el);

    // ResizeObserverでプレイヤーサイズ変更を監視 → 映像領域を再計算
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(() => updateOverlayBounds());
    resizeObserver.observe(player);

    // video のメタデータ読み込み時にも再計算（アスペクト比が確定するタイミング）
    const video = player.querySelector('video');
    if (video) video.addEventListener('loadedmetadata', () => updateOverlayBounds(), { once: true });

    updateOverlayBounds();
    return el;
  }

  // ── レーンの衝突安全判定 ──
  // 前のコメントに新しいコメントが追いつかないか検査
  function isLaneSafe(prev, now, newSpeed) {
    if (!prev) return true; // 空きレーン

    const elapsed = (now - prev.startTime) / 1000; // 秒

    // 前のコメントが画面内に完全に入ったか？ (右端が画面右端を通過)
    if (elapsed < prev.width / prev.speed) return false;

    // 新コメントが遅いか同速なら追いつかない
    if (newSpeed <= prev.speed) return true;

    // 前コメントの右端の現在位置
    const rightEdge = overlayWidth + prev.width - prev.speed * elapsed;
    if (rightEdge <= 0) return true; // 既に画面外

    // 追いつくまでの時間 vs 前コメントが画面外に出るまでの時間
    const gap = overlayWidth - rightEdge;
    return gap / (newSpeed - prev.speed) > rightEdge / prev.speed;
  }

  // ── 行割り当て（衝突検知付き・特殊コメントは2行分確保）──
  function getAvailableLine(tall, newSpeed, newWidth) {
    const now = Date.now();
    const maxLines = CONFIG.maxLines;
    if (laneTracker.length !== maxLines) laneTracker = new Array(maxLines).fill(null);
    const needed = tall ? 2 : 1;
    const info = { startTime: now, speed: newSpeed, width: newWidth };

    for (let i = 0; i <= maxLines - needed; i++) {
      let ok = true;
      for (let j = 0; j < needed; j++) {
        if (!isLaneSafe(laneTracker[i + j], now, newSpeed)) { ok = false; break; }
      }
      if (ok) {
        for (let j = 0; j < needed; j++) laneTracker[i + j] = info;
        return i;
      }
    }
    // 全レーン埋まっている場合: ランダムにフォールバック
    const fallback = Math.floor(Math.random() * (maxLines - needed + 1));
    for (let j = 0; j < needed; j++) laneTracker[fallback + j] = info;
    return fallback;
  }

  // ── 弾幕生成 ──
  function spawnDanmaku(messageFragment, chatInfo) {
    if (!enabled) return;
    if (!overlay || !overlay.isConnected) overlay = createOverlay();
    if (!overlay) return;

    const isSpecial = chatInfo.isSpecial;
    const el = h('div', { className: 'yt-danmaku-item' });
    el.style.color = chatInfo.textColor;

    if (isSpecial && chatInfo.bgColor) {
      el.style.background = chatInfo.bgColor;
      el.style.borderRadius = '8px';
      el.style.padding = '6px 14px';
    }

    if (isSpecial) {
      const smallFs = Math.round(fontSize * 0.55) + 'px';
      const iconSize = Math.round(fontSize * 0.875) + 'px';

      // ── 1行目: アイコン + 名前 + バッジ + 金額 ──
      const headerChildren = [];
      if (chatInfo.photoSrc) {
        headerChildren.push(h('img', {
          src: chatInfo.photoSrc,
          style: `width:${iconSize};height:${iconSize};border-radius:50%;object-fit:cover;flex-shrink:0`,
        }));
      }
      if (chatInfo.authorName) {
        headerChildren.push(h('span', { style: `font-size:${smallFs};opacity:0.9` }, chatInfo.authorName));
      }
      if (chatInfo.badgeSrc) {
        headerChildren.push(h('img', {
          src: chatInfo.badgeSrc,
          style: `width:${smallFs};height:${smallFs};object-fit:contain;flex-shrink:0`,
        }));
      }
      if (chatInfo.amount) {
        headerChildren.push(h('span', { style: `font-size:${smallFs};opacity:0.7` }, ' - '));
        headerChildren.push(h('span', { style: `font-size:${smallFs};opacity:0.9` }, chatInfo.amount));
      }

      el.appendChild(h('div', { style: 'display:flex;align-items:center;gap:6px;margin-bottom:2px' }, headerChildren));
      // ── 2行目: メッセージ本文 ──
      el.appendChild(h('div', { style: `font-size:${fontSize}px` }, messageFragment));
    } else {
      // 通常コメント: 1行表示
      el.appendChild(h('span', { style: `font-size:${fontSize}px` }, messageFragment));
    }

    // DOM に追加して幅を測定（left:100% なので画面外、アニメーション未設定）
    overlay.appendChild(el);
    const elWidth = el.clientWidth;
    const speed = (elWidth + overlayWidth + 20) / CONFIG.duration; // px/s

    // 衝突検知付きレーン割り当て
    const line = getAvailableLine(isSpecial, speed, elWidth);
    const topPos = (line * fontSize * CONFIG.lineHeightRatio) % (overlayHeight * CONFIG.displayArea);

    // 位置とアニメーションを設定（ここからスクロール開始）
    el.style.top = topPos + 'px';
    el.style.animation = `yt-danmaku-scroll ${CONFIG.duration}s linear forwards`;

    // animationend でクリーンアップ（setTimeout のフォールバック付き）
    const cleanup = () => { if (el.parentNode) el.remove(); };
    const fallbackTimer = setTimeout(cleanup, CONFIG.duration * 1000 + 1000);
    el.addEventListener('animationend', () => { clearTimeout(fallbackTimer); cleanup(); }, { once: true });
  }

  // ── チャットメッセージの処理 ──
  function processNode(node) {
    const tagName = node.localName;
    if (!MESSAGE_TAGS.has(tagName)) return;

    // 重複排除: message-id があれば既に処理済みかチェック (FIFO管理)
    const msgId = node.getAttribute('id') || node.getAttribute('message-id');
    if (msgId) {
      if (processedIds.has(msgId)) return;
      processedIds.add(msgId);
      processedIdQueue.push(msgId);
      if (processedIdQueue.length > 500) processedIds.delete(processedIdQueue.shift());
    }

    const chatInfo = extractChatInfo(node);

    // special系（スパチャ・メンバー加入等）で名前が@ハンドルの場合、チャンネル名読み込みを待つ
    if (chatInfo.isSpecial && chatInfo.authorName && chatInfo.authorName.startsWith('@')) {
      waitForChannelName(node, chatInfo, 20, watchSession); // 50ms間隔 × 最大20回 = 最大1秒
      return;
    }

    spawnFromNode(node, chatInfo);
  }

  // special系コメントの@ハンドル → チャンネル名の読み込みを待つ
  function waitForChannelName(node, chatInfo, remaining, session) {
    if (!isActiveWatchSession(session)) return;
    if (remaining <= 0) { spawnFromNode(node, chatInfo); return; }

    const timerId = setTimeout(() => {
      channelNameTimers.delete(timerId);
      if (!isActiveWatchSession(session)) return;
      const el = node.querySelector('#author-name');
      const name = el ? (el.textContent || '').trim() : '';
      if (name.startsWith('@')) {
        waitForChannelName(node, chatInfo, remaining - 1, session);
      } else {
        chatInfo.authorName = name;
        spawnFromNode(node, chatInfo);
      }
    }, 50);
    channelNameTimers.add(timerId);
  }

  // ノードからメッセージを組み立てて弾幕を発射
  function spawnFromNode(node, chatInfo) {
    // メッセージ本文を取得（スティッカーの場合は #sticker にフォールバック）
    const msgEl = node.querySelector('#message');
    const stickerEl = !msgEl ? node.querySelector('#sticker img, #sticker-container img') : null;

    let fragment;
    if (msgEl) {
      fragment = buildMessageFragment(msgEl);
    } else if (stickerEl) {
      // スティッカー画像を弾幕用に生成
      const size = (fontSize * 2) + 'px';
      fragment = document.createDocumentFragment();
      fragment.appendChild(h('img', {
        src: stickerEl.getAttribute('src') || '',
        alt: stickerEl.getAttribute('alt') || 'sticker',
        className: 'yt-danmaku-emoji',
        style: `height:${size};width:${size}`,
      }));
    }

    // 本文なしでも special 系（スパチャ・メンバー加入）はヘッダーだけで表示する
    if (!fragment) {
      if (!chatInfo.isSpecial || !chatInfo.bgColor) return;
      // メンバー加入は #header-subtext にテキストがある場合がある
      const subtext = node.querySelector('#header-subtext');
      if (subtext) fragment = buildMessageFragment(subtext);
      if (!fragment) fragment = document.createDocumentFragment(); // ヘッダーのみ表示
    }

    spawnDanmaku(fragment, chatInfo);
  }

  // ── ランタイム状態リセット ──
  function resetRuntimeState(clearProcessed) {
    laneTracker = [];
    pendingNodes.length = 0;
    clearChannelNameTimers();
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = 0; }
    if (clearProcessed) {
      processedIds.clear();
      processedIdQueue.length = 0;
    }
  }

  // ── Mutation処理（バッチキューに積む）──
  function handleChatMutation(mutations) {
    if (!enabled) return; // OFF時は処理コストを払わない
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) enqueueNode(node);
      }
    }
  }

  // ── iframeのチャットDOMを監視 ──
  function bindChatFrameLoad(chatFrame, session) {
    if (chatFrameLoadTarget === chatFrame && chatFrameLoadSession === session) return;
    detachChatFrameLoad();

    chatFrameLoadHandler = () => {
      if (!isActiveWatchSession(session)) return;
      chatObserver = disconnectObserver(chatObserver);
      chatItemsHostObserver = disconnectObserver(chatItemsHostObserver);
      chatObservedItems = null;
      chatItemsHost = null;
      observeChat(session) || retryObserveChat(0, session);
    };
    chatFrame.addEventListener('load', chatFrameLoadHandler);
    chatFrameLoadTarget = chatFrame;
    chatFrameLoadSession = session;
  }

  function observeChat(session) {
    const chatFrame = document.querySelector('#chatframe');
    if (!chatFrame) return false;
    bindChatFrameLoad(chatFrame, session);

    let chatDoc;
    try { chatDoc = chatFrame.contentDocument; } catch (e) { return false; }
    if (!chatDoc || !chatDoc.body) return false;

    const itemsHost = chatDoc.querySelector('yt-live-chat-item-list-renderer');
    if (itemsHost && chatItemsHost !== itemsHost) {
      chatItemsHostObserver = disconnectObserver(chatItemsHostObserver);
      chatItemsHost = itemsHost;
      chatItemsHostObserver = new MutationObserver(() => {
        if (!isActiveWatchSession(session)) return;
        const nextItems = chatItemsHost ? chatItemsHost.querySelector('#items') : null;
        if (nextItems && nextItems !== chatObservedItems) observeChat(session);
      });
      chatItemsHostObserver.observe(itemsHost, { childList: true });
    }

    const itemList = itemsHost ? itemsHost.querySelector('#items') : chatDoc.querySelector('yt-live-chat-item-list-renderer #items');
    if (!itemList) return false;
    if (chatObservedItems === itemList) return true;

    chatObserver = disconnectObserver(chatObserver);
    chatObserver = new MutationObserver(handleChatMutation);
    chatObserver.observe(itemList, { childList: true });
    chatObservedItems = itemList;
    chatRetryTimer = clearTimeoutId(chatRetryTimer);
    pageObserver = disconnectObserver(pageObserver);

    return true;
  }

  // ── iframeの準備完了を待つ ──
  function waitForChat(session) {
    if (observeChat(session)) return;

    const chatFrame = document.querySelector('#chatframe');
    if (chatFrame) {
      bindChatFrameLoad(chatFrame, session);
      retryObserveChat(0, session);
      return;
    }

    pageObserver = disconnectObserver(pageObserver);
    pageObserver = new MutationObserver(() => {
      if (!isActiveWatchSession(session)) return;
      const cf = document.querySelector('#chatframe');
      if (!cf) return;
      pageObserver = disconnectObserver(pageObserver);
      bindChatFrameLoad(cf, session);
      observeChat(session) || retryObserveChat(0, session);
    });
    pageObserver.observe(document.body, { childList: true, subtree: true });
  }

  function retryObserveChat(attempt, session) {
    if (!isActiveWatchSession(session)) return;
    chatRetryTimer = clearTimeoutId(chatRetryTimer);
    if (observeChat(session) || attempt >= 15) return;
    chatRetryTimer = setTimeout(() => {
      chatRetryTimer = 0;
      retryObserveChat(attempt + 1, session);
    }, 1000);
  }

  // ── タブ復帰時にキューをクリア ──
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      pendingNodes.length = 0;
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = 0; }
    }
  });

  // ── Alt+L で弾幕ON/OFF ──
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      enabled = !enabled;
      if (!enabled && overlay) overlay.textContent = '';
      resetRuntimeState(false);
      showToggleNotify(enabled);
    }
  });

  // ── 動画ページかどうか判定 ──
  function isWatchPage() {
    const path = window.location.pathname;
    return path === '/watch' || path.startsWith('/live/');
  }

  // ── 初期化 ──
  function init() {
    if (!isWatchPage()) return; // 動画ページ以外では何もしない
    const session = nextWatchSession();
    startWatchSession(session);
  }

  init();

  // ── SPA ナビゲーション対応 ──
  document.addEventListener('yt-navigate-finish', () => {
    resetWatchState(true);
    if (!isWatchPage()) return;

    const session = nextWatchSession();
    setTimeout(() => {
      if (!isActiveWatchSession(session) || !isWatchPage()) return;
      startWatchSession(session);
    }, 1500);
  });
})();
