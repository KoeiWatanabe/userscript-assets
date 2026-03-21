// ==UserScript==
// @name         YouTubeをニコニコ風にする
// @namespace    https://github.com/tampermonkey-youtube-danmaku
// @version      2.0.4
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
    notifyIcon: "https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeをニコニコ風に/icon_128.png",       // 通知アイコンURL（null ならデフォルトアイコン）
  };

  // ─── 動的フォントサイズ（画面サイズから自動計算）───
  let fontSize = 32; // 初期値（overlay作成後に上書き）

  function updateFontSize() {
    if (!overlayHeight) return;
    fontSize = Math.floor(overlayHeight * CONFIG.displayArea / (CONFIG.maxLines * CONFIG.lineHeightRatio));
    if (overlay) {
      overlay.style.setProperty('--yt-danmaku-fs', fontSize + 'px');
    }
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

    // オーバーレイの実サイズを更新
    overlayWidth = renderW;
    overlayHeight = renderH;
    overlay.style.setProperty('--yt-danmaku-w', overlayWidth + 'px');
    updateFontSize();
  }

  // ─── バッチ処理設定 ───
  const PERF = {
    batchDelay: 80,      // バッチ処理の間隔 (ms)
    batchSize: 10,       // 1回に処理する最大件数
    maxQueueSize: 60,    // キューの最大サイズ（超過分は古いものを捨てる）
    skipWhenHidden: true, // タブ非表示時はスキップ
  };

  // ─── 共通スタイルの注入 ───
  function injectStyles() {
    if (document.getElementById('yt-danmaku-style')) return;
    const style = document.createElement('style');
    style.id = 'yt-danmaku-style';
    style.textContent = `
      #yt-danmaku-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
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
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-radius: 14px;
        padding: 10px 14px;
        pointer-events: none;
        z-index: 2022;
        min-width: 260px;
        max-width: 340px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: -apple-system, BlinkMacSystemFont, "Noto Sans JP", "Helvetica Neue", sans-serif;
        animation: yt-danmaku-notify-in 3s cubic-bezier(0.32, 0.72, 0, 1) forwards;
      }
      .yt-danmaku-notify.--dark {
        background: rgba(30, 30, 30, 0.88);
        box-shadow: 0 4px 24px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(255,255,255,0.1) inset;
      }
      .yt-danmaku-notify.--light {
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 4px 24px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.06);
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
      .yt-danmaku-notify__body { display: flex; flex-direction: column; gap: 1px; }
      .yt-danmaku-notify__title { font-size: 13px; font-weight: 600; letter-spacing: 0.2px; }
      .yt-danmaku-notify__msg   { font-size: 12px; font-weight: 400; }
      .yt-danmaku-notify__time  { font-size: 11px; margin-left: auto; align-self: flex-start; flex-shrink: 0; }
      .yt-danmaku-notify.--dark .yt-danmaku-notify__title { color: rgba(255,255,255,0.95); }
      .yt-danmaku-notify.--dark .yt-danmaku-notify__msg   { color: rgba(255,255,255,0.6); }
      .yt-danmaku-notify.--dark .yt-danmaku-notify__time  { color: rgba(255,255,255,0.35); }
      .yt-danmaku-notify.--light .yt-danmaku-notify__title { color: rgba(0,0,0,0.88); }
      .yt-danmaku-notify.--light .yt-danmaku-notify__msg   { color: rgba(0,0,0,0.5); }
      .yt-danmaku-notify.--light .yt-danmaku-notify__time  { color: rgba(0,0,0,0.3); }
    `;
    document.head.appendChild(style);
  }

  // ── iOS風トグル通知 ──
  let notifyTimer = 0;
  function showToggleNotify(isEnabled) {
    const player = document.querySelector('#movie_player');
    if (!player) return;

    // 既存の通知を除去
    const existing = player.querySelector('.yt-danmaku-notify');
    if (existing) existing.remove();
    if (notifyTimer) { clearTimeout(notifyTimer); notifyTimer = 0; }

    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const banner = document.createElement('div');
    banner.className = 'yt-danmaku-notify ' + (isDark ? '--dark' : '--light');

    // アイコン
    if (CONFIG.notifyIcon) {
      const img = document.createElement('img');
      img.className = 'yt-danmaku-notify__icon-img';
      img.src = CONFIG.notifyIcon;
      img.onerror = () => {
        // 読み込み失敗時はデフォルトアイコンにフォールバック
        const fallback = document.createElement('div');
        fallback.className = 'yt-danmaku-notify__icon-fallback';
        fallback.textContent = '\u5F3E';
        img.replaceWith(fallback);
      };
      banner.appendChild(img);
    } else {
      const icon = document.createElement('div');
      icon.className = 'yt-danmaku-notify__icon-fallback';
      icon.textContent = '\u5F3E'; // 「弾」
      banner.appendChild(icon);
    }

    // テキスト
    const body = document.createElement('div');
    body.className = 'yt-danmaku-notify__body';
    const title = document.createElement('div');
    title.className = 'yt-danmaku-notify__title';
    title.textContent = 'YouTubeをニコニコ風にする';
    const msg = document.createElement('div');
    msg.className = 'yt-danmaku-notify__msg';
    msg.textContent = isEnabled ? '弾幕をオンにしました' : '弾幕をオフにしました';
    body.appendChild(title);
    body.appendChild(msg);

    // 時刻ラベル
    const time = document.createElement('div');
    time.className = 'yt-danmaku-notify__time';
    time.textContent = '今';

    banner.appendChild(body);
    banner.appendChild(time);
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
          if (text) {
            parentFragment.appendChild(document.createTextNode(text));
          }
        } else if (child.nodeType === 1) { // ELEMENT_NODE
          const tag = child.tagName.toLowerCase();
          if (tag === 'img') {
            const src = child.getAttribute('src');
            if (src) {
              hasContent = true;
              const img = document.createElement('img');
              img.src = src;
              img.alt = child.getAttribute('alt') || '';
              img.className = 'yt-danmaku-emoji';
              parentFragment.appendChild(img);
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
    const tagName = node.tagName.toLowerCase();
    const authorType = node.getAttribute('author-type');
    const authorNameEl = node.querySelector('#author-name');
    const authorName = authorNameEl ? (authorNameEl.textContent || '').trim() : '';
    const photoEl = node.querySelector('#author-photo img');
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

    // スーパーチャット
    // ※ YouTube は低額帯(緑・水色)で header-color を黒に設定するが、
    //   弾幕は動画上に表示するため文字色は常に白を使う
    if (tagName === 'yt-live-chat-paid-message-renderer') {
      const amountEl = node.querySelector('#purchase-amount, #purchase-amount-chip');
      info.amount = amountEl ? (amountEl.textContent || '').trim() : null;
      const cs = getComputedStyle(node);
      info.bgColor = cs.getPropertyValue('--yt-live-chat-paid-message-primary-color').trim() || 'rgba(230,33,23,0.8)';
      info.textColor = '#FFFFFF';
      info.isSpecial = true;
    }

    // スティッカースパチャ
    if (tagName === 'yt-live-chat-paid-sticker-renderer') {
      const amountEl = node.querySelector('#purchase-amount, #purchase-amount-chip');
      info.amount = amountEl ? (amountEl.textContent || '').trim() : null;
      const cs = getComputedStyle(node);
      info.bgColor = cs.getPropertyValue('--yt-live-chat-paid-sticker-background-color').trim() || 'rgba(230,33,23,0.8)';
      info.textColor = '#FFFFFF';
      info.isSpecial = true;
    }

    // メンバー加入
    if (tagName === 'yt-live-chat-membership-item-renderer') {
      info.bgColor = 'rgba(15,157,88,0.8)';
      info.isSpecial = true;
    }

    // チャンネル主
    if (authorType === 'owner') {
      info.textColor = CONFIG.ownerColor;
      info.isSpecial = true;
    }

    // モデレーター
    if (authorType === 'moderator') {
      info.textColor = CONFIG.modColor;
      info.isSpecial = true;
    }

    // 背景色の不透明度をCONFIG.bgOpacityで上書き
    if (info.bgColor) {
      const rgbaMatch = info.bgColor.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
      if (rgbaMatch) {
        info.bgColor = `rgba(${rgbaMatch[1]},${rgbaMatch[2]},${rgbaMatch[3]},${CONFIG.bgOpacity})`;
      }
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
  let chatObserver = null;
  let chatObservedItems = null;
  let chatPollTimer = 0;
  const processedIds = new Set(); // 重複コメント排除用
  const processedIdQueue = [];   // FIFO順で管理

  // ── バッチ処理キュー ──
  let pendingNodes = [];
  let flushTimer = 0;

  function enqueueNode(node) {
    if (!node || node.nodeType !== 1) return;
    pendingNodes.push(node);
    // キューが溢れたら古いものを捨てる
    if (pendingNodes.length > PERF.maxQueueSize) {
      pendingNodes.splice(0, pendingNodes.length - PERF.maxQueueSize);
    }
    if (!flushTimer) {
      flushTimer = setTimeout(flushPendingNodes, PERF.batchDelay);
    }
  }

  function flushPendingNodes() {
    flushTimer = 0;
    // タブ非表示時はスキップ
    if (PERF.skipWhenHidden && document.hidden) {
      pendingNodes.length = 0;
      return;
    }
    const batch = pendingNodes.splice(0, PERF.batchSize);
    for (const node of batch) {
      processNode(node);
    }
    // まだキューに残っていれば次のバッチをスケジュール
    if (pendingNodes.length) {
      flushTimer = setTimeout(flushPendingNodes, PERF.batchDelay);
    }
  }

  // ── オーバーレイ作成 ──
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

    // ResizeObserverでプレイヤーサイズ変更を監視 → 映像領域を再計算
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(() => {
      updateOverlayBounds();
    });
    resizeObserver.observe(player);

    // video のメタデータ読み込み時にも再計算（アスペクト比が確定するタイミング）
    const video = player.querySelector('video');
    if (video) {
      video.addEventListener('loadedmetadata', () => updateOverlayBounds(), { once: true });
    }

    // 初期値
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

    // 新コメント左端(overlayWidth) と前コメント右端の現在の間隔
    const gap = overlayWidth - rightEdge;

    // 追いつくまでの時間 vs 前コメントが画面外に出るまでの時間
    const catchTime = gap / (newSpeed - prev.speed);
    const exitTime = rightEdge / prev.speed;

    return catchTime > exitTime;
  }

  // ── 行割り当て（衝突検知付き・特殊コメントは2行分確保）──
  function getAvailableLine(tall, newSpeed, newWidth) {
    const now = Date.now();
    const maxLines = CONFIG.maxLines;
    if (laneTracker.length !== maxLines) {
      laneTracker = new Array(maxLines).fill(null);
    }
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
    if (!overlay || !overlay.isConnected) {
      overlay = createOverlay();
    }
    if (!overlay) return;

    const isSpecial = chatInfo.isSpecial;

    // 外枠（共通スタイルはCSSクラスで適用、差分のみインラインで設定）
    const el = document.createElement('div');
    el.className = 'yt-danmaku-item';
    el.style.color = chatInfo.textColor;

    if (isSpecial && chatInfo.bgColor) {
      el.style.background = chatInfo.bgColor;
      el.style.borderRadius = '8px';
      el.style.padding = '6px 14px';
    }

    if (isSpecial) {
      // ── 1行目: アイコン + 名前 + 金額 ──
      const headerRow = document.createElement('div');
      headerRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 2px;
      `;

      // アイコン
      if (chatInfo.photoSrc) {
        const icon = document.createElement('img');
        icon.src = chatInfo.photoSrc;
        icon.style.cssText = `
          width: ${Math.round(fontSize * 0.875)}px;
          height: ${Math.round(fontSize * 0.875)}px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
        `;
        headerRow.appendChild(icon);
      }

      // 名前
      if (chatInfo.authorName) {
        const nameSpan = document.createElement('span');
        nameSpan.textContent = chatInfo.authorName;
        nameSpan.style.cssText = `
          font-size: ${Math.round(fontSize * 0.55)}px;
          opacity: 0.9;
        `;
        headerRow.appendChild(nameSpan);
      }

      // 金額（スパチャ）
      if (chatInfo.amount) {
        const sep = document.createElement('span');
        sep.textContent = ' - ';
        sep.style.cssText = `font-size: ${Math.round(fontSize * 0.55)}px; opacity: 0.7;`;
        headerRow.appendChild(sep);

        const amountSpan = document.createElement('span');
        amountSpan.textContent = chatInfo.amount;
        amountSpan.style.cssText = `
          font-size: ${Math.round(fontSize * 0.55)}px;
          opacity: 0.9;
        `;
        headerRow.appendChild(amountSpan);
      }

      el.appendChild(headerRow);

      // ── 2行目: メッセージ本文 ──
      const msgRow = document.createElement('div');
      msgRow.style.fontSize = fontSize + 'px';
      msgRow.appendChild(messageFragment);
      el.appendChild(msgRow);
    } else {
      // 通常コメント: 1行表示
      const msgSpan = document.createElement('span');
      msgSpan.style.fontSize = fontSize + 'px';
      msgSpan.appendChild(messageFragment);
      el.appendChild(msgSpan);
    }

    // DOM に追加して幅を測定（left:100% なので画面外、アニメーション未設定）
    overlay.appendChild(el);
    const elWidth = el.clientWidth;
    const speed = (elWidth + overlayWidth + 20) / CONFIG.duration; // px/s

    // 衝突検知付きレーン割り当て
    const line = getAvailableLine(isSpecial, speed, elWidth);
    const lineHeight = fontSize * CONFIG.lineHeightRatio;
    const areaHeight = overlayHeight * CONFIG.displayArea;
    const topPos = (line * lineHeight) % areaHeight;

    // 位置とアニメーションを設定（ここからスクロール開始）
    el.style.top = topPos + 'px';
    el.style.animation = 'yt-danmaku-scroll ' + CONFIG.duration + 's linear forwards';

    // animationend でクリーンアップ（setTimeout のフォールバック付き）
    const cleanup = () => {
      if (el.parentNode) el.remove();
    };
    const fallbackTimer = setTimeout(cleanup, CONFIG.duration * 1000 + 1000);
    el.addEventListener('animationend', () => {
      clearTimeout(fallbackTimer);
      cleanup();
    }, { once: true });
  }

  // ── チャットメッセージの処理 ──
  function processNode(node) {
    const tagName = node.tagName.toLowerCase();
    if (!MESSAGE_TAGS.has(tagName)) return;

    // 重複排除: message-id があれば既に処理済みかチェック (FIFO管理)
    const msgId = node.getAttribute('id') || node.getAttribute('message-id');
    if (msgId) {
      if (processedIds.has(msgId)) return;
      processedIds.add(msgId);
      processedIdQueue.push(msgId);
      if (processedIdQueue.length > 500) {
        const old = processedIdQueue.shift();
        processedIds.delete(old);
      }
    }

    const chatInfo = extractChatInfo(node);

    // メッセージ本文を取得（スティッカーの場合は #sticker にフォールバック）
    const msgEl = node.querySelector('#message');
    const stickerEl = !msgEl ? node.querySelector('#sticker img, #sticker-container img') : null;

    let fragment;
    if (msgEl) {
      fragment = buildMessageFragment(msgEl);
    } else if (stickerEl) {
      // スティッカー画像を弾幕用に生成
      fragment = document.createDocumentFragment();
      const img = document.createElement('img');
      img.src = stickerEl.getAttribute('src') || '';
      img.alt = stickerEl.getAttribute('alt') || 'sticker';
      img.className = 'yt-danmaku-emoji';
      img.style.height = (fontSize * 2) + 'px';
      img.style.width = (fontSize * 2) + 'px';
      fragment.appendChild(img);
    }

    // 本文なしでも special 系（スパチャ・メンバー加入）はヘッダーだけで表示する
    if (!fragment) {
      if (!chatInfo.isSpecial || !chatInfo.bgColor) return;
      // メンバー加入は #header-subtext にテキストがある場合がある
      const subtext = node.querySelector('#header-subtext');
      if (subtext) {
        fragment = buildMessageFragment(subtext);
      }
      if (!fragment) {
        // 空の fragment を作成（ヘッダーのみ表示）
        fragment = document.createDocumentFragment();
      }
    }

    spawnDanmaku(fragment, chatInfo);
  }

  // ── ランタイム状態リセット ──
  function resetRuntimeState(clearProcessed) {
    laneTracker = [];
    pendingNodes.length = 0;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = 0;
    }
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
        if (node.nodeType !== 1) continue;
        enqueueNode(node);
      }
    }
  }

  // ── iframeのチャットDOMを監視 ──
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

    // Top chat / Live chat 切替時に #items が差し替わるのを検知するポーリング
    if (!chatPollTimer) {
      chatPollTimer = setInterval(() => {
        try {
          const cf = document.querySelector('#chatframe');
          if (!cf) return;
          const cd = cf.contentDocument;
          if (!cd) return;
          const newItems = cd.querySelector('yt-live-chat-item-list-renderer #items');
          if (newItems && newItems !== chatObservedItems) {
            observeChat();
          }
        } catch (e) { /* ignore */ }
      }, 2000);
    }

    return true;
  }

  // ── iframeの準備完了を待つ ──
  function waitForChat() {
    if (observeChat()) return;

    const chatFrame = document.querySelector('#chatframe');
    if (chatFrame) {
      chatFrame.addEventListener('load', () => {
        retryObserveChat(0);
      });
    }

    const pageObserver = new MutationObserver(() => {
      const cf = document.querySelector('#chatframe');
      if (cf) {
        pageObserver.disconnect();
        cf.addEventListener('load', () => {
          retryObserveChat(0);
        });
        retryObserveChat(0);
      }
    });
    pageObserver.observe(document.body, { childList: true, subtree: true });
  }

  function retryObserveChat(attempt) {
    // ※ ポーリングはここでリセットしない。
    //   observeChat() が「同一 #items → 早期リターン」するパスでは
    //   ポーリングが再起動されないため、停止すると切替検知が永久に失われる。
    //   ポーリングのリセットは yt-navigate-finish（ページ遷移）時のみ行う。
    if (observeChat()) return;
    if (attempt < 15) {
      setTimeout(() => retryObserveChat(attempt + 1), 1000);
    }
  }

  // ── タブ復帰時にキューをクリア ──
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      pendingNodes.length = 0;
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = 0;
      }
    }
  });

  // ── Alt+C で弾幕ON/OFF ──
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      enabled = !enabled;
      if (!enabled && overlay) {
        overlay.textContent = '';
      }
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
    overlay = createOverlay();
    if (!overlay) {
      const waitPlayer = new MutationObserver(() => {
        if (document.querySelector('#movie_player')) {
          waitPlayer.disconnect();
          overlay = createOverlay();
          waitForChat();
        }
      });
      waitPlayer.observe(document.body, { childList: true, subtree: true });
    } else {
      waitForChat();
    }
  }

  init();

  // ── SPA ナビゲーション対応 ──
  document.addEventListener('yt-navigate-finish', () => {
    if (isWatchPage()) {
      if (chatObserver) {
        chatObserver.disconnect();
        chatObserver = null;
        chatObservedItems = null;
      }
      if (chatPollTimer) {
        clearInterval(chatPollTimer);
        chatPollTimer = 0;
      }
      resetRuntimeState(true);
      setTimeout(() => {
        overlay = createOverlay();
        waitForChat();
      }, 1500);
    }
  });
})();