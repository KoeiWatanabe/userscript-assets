// ==UserScript==
// @name         Twitchをニコニコ風にする
// @namespace    https://github.com/tampermonkey-twitch-danmaku
// @version      1.2.1
// @description  Twitchチャットのコメントをニコニコ動画風に動画上へ弾幕表示する（ライブ・VOD両対応）
// @author       You
// @match        https://www.twitch.tv/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Twitchをニコニコ風に/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Twitchをニコニコ風に/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Twitchをニコニコ風に/icon_128.png
// ==/UserScript==

(function () {
  'use strict';

  // ─── 設定 ───
  const CONFIG = {
    fontFamily: '"Noto Sans JP", sans-serif',
    fontWeight: 'bold',
    opacity: 0.9,
    duration: 6,
    maxLines: 15,
    lineHeightRatio: 1.4,
    color: '#FFFFFF',
    shadowColor: '#000000',
    displayArea: 1.0,
    broadcasterColor: '#FFD600',
    modColor: '#5E84F1',
    vipColor: '#E005B9',
    notifyIcon: "https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Twitchをニコニコ風に/icon_128.png",
  };

  // ─── 動的フォントサイズ ───
  let fontSize = 32;

  function updateFontSize() {
    if (!overlayHeight) return;
    fontSize = Math.floor(overlayHeight * CONFIG.displayArea / (CONFIG.maxLines * CONFIG.lineHeightRatio));

    if (fontSize < 24) {
      fontSize = 24;
    }

    if (overlay) {
      overlay.style.setProperty('--tw-danmaku-fs', fontSize + 'px');
    }
  }

  // ─── 映像領域に合わせてオーバーレイの位置・サイズを更新 ───
  function updateOverlayBounds() {
    if (!overlay) return;
    const player = overlay.parentElement;
    if (!player) return;
    const video = player.querySelector('video');
    if (!video || !video.videoWidth || !video.videoHeight) {
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlayWidth = player.clientWidth;
      overlayHeight = player.clientHeight;
      overlay.style.setProperty('--tw-danmaku-w', overlayWidth + 'px');
      updateFontSize();
      return;
    }

    const playerW = player.clientWidth;
    const playerH = player.clientHeight;
    const videoAspect = video.videoWidth / video.videoHeight;
    const playerAspect = playerW / playerH;

    let renderW, renderH, offsetX, offsetY;

    if (playerAspect > videoAspect) {
      renderH = playerH;
      renderW = playerH * videoAspect;
      offsetX = (playerW - renderW) / 2;
      offsetY = 0;
    } else {
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
    overlay.style.setProperty('--tw-danmaku-w', overlayWidth + 'px');
    updateFontSize();
  }

  // ─── バッチ処理設定 ───
  const PERF = {
    batchDelay: 80,
    batchSize: 10,
    maxQueueSize: 60,
    skipWhenHidden: true,
  };

  // ─── 共通スタイルの注入 ───
  function injectStyles() {
    if (document.getElementById('tw-danmaku-style')) return;
    const style = document.createElement('style');
    style.id = 'tw-danmaku-style';
    style.textContent = `
      #tw-danmaku-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        overflow: hidden;
        z-index: 9999;
        contain: layout paint;
      }
      #tw-danmaku-overlay .tw-danmaku-emoji {
        height: var(--tw-danmaku-fs, 32px) !important;
        max-height: none !important;
        min-height: var(--tw-danmaku-fs, 32px) !important;
        width: auto !important;
        object-fit: contain !important;
      }
      @keyframes tw-danmaku-scroll {
        from { transform: translateX(0); }
        to   { transform: translateX(calc(-100% - var(--tw-danmaku-w, 1600px) - 20px)); }
      }
      .tw-danmaku-item {
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
      @keyframes tw-danmaku-notify-in {
        0%   { opacity: 0; transform: translate(-50%, -100%); }
        8%   { opacity: 1; transform: translate(-50%, 0); }
        80%  { opacity: 1; transform: translate(-50%, 0); }
        100% { opacity: 0; transform: translate(-50%, -100%); }
      }
      .tw-danmaku-notify {
        position: absolute;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-radius: 14px;
        padding: 10px 14px;
        pointer-events: none;
        z-index: 10000;
        min-width: 260px;
        max-width: 340px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: -apple-system, BlinkMacSystemFont, "Noto Sans JP", "Helvetica Neue", sans-serif;
        animation: tw-danmaku-notify-in 3s cubic-bezier(0.32, 0.72, 0, 1) forwards;
      }
      .tw-danmaku-notify.--dark {
        background: rgba(30, 30, 30, 0.88);
        box-shadow: 0 4px 24px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(255,255,255,0.1) inset;
      }
      .tw-danmaku-notify__icon-fallback {
        width: 36px; height: 36px;
        border-radius: 8px;
        background: linear-gradient(135deg, #9146FF, #B983FF);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        color: #fff; font-size: 18px; font-weight: bold;
      }
      .tw-danmaku-notify__icon-img {
        width: 36px; height: 36px;
        border-radius: 8px;
        object-fit: cover;
        flex-shrink: 0;
      }
      .tw-danmaku-notify__body { display: flex; flex-direction: column; gap: 1px; }
      .tw-danmaku-notify__title { font-size: 13px; font-weight: 600; letter-spacing: 0.2px; }
      .tw-danmaku-notify__msg   { font-size: 12px; font-weight: 400; }
      .tw-danmaku-notify__time  { font-size: 11px; margin-left: auto; align-self: flex-start; flex-shrink: 0; }
      .tw-danmaku-notify.--dark .tw-danmaku-notify__title { color: rgba(255,255,255,0.95); }
      .tw-danmaku-notify.--dark .tw-danmaku-notify__msg   { color: rgba(255,255,255,0.6); }
      .tw-danmaku-notify.--dark .tw-danmaku-notify__time  { color: rgba(255,255,255,0.35); }
    `;
    document.head.appendChild(style);
  }

  // ── iOS風トグル通知 ──
  let notifyTimer = 0;
  function showToggleNotify(isEnabled) {
    const player = getPlayerContainer();
    if (!player) return;

    const existing = player.querySelector('.tw-danmaku-notify');
    if (existing) existing.remove();
    if (notifyTimer) { clearTimeout(notifyTimer); notifyTimer = 0; }

    const banner = document.createElement('div');
    banner.className = 'tw-danmaku-notify --dark';

    if (CONFIG.notifyIcon) {
      const img = document.createElement('img');
      img.className = 'tw-danmaku-notify__icon-img';
      img.src = CONFIG.notifyIcon;
      img.onerror = () => {
        const fallback = document.createElement('div');
        fallback.className = 'tw-danmaku-notify__icon-fallback';
        fallback.textContent = '\u5F3E';
        img.replaceWith(fallback);
      };
      banner.appendChild(img);
    } else {
      const icon = document.createElement('div');
      icon.className = 'tw-danmaku-notify__icon-fallback';
      icon.textContent = '\u5F3E';
      banner.appendChild(icon);
    }

    const body = document.createElement('div');
    body.className = 'tw-danmaku-notify__body';
    const title = document.createElement('div');
    title.className = 'tw-danmaku-notify__title';
    title.textContent = 'Twitchをニコニコ風にする';
    const msg = document.createElement('div');
    msg.className = 'tw-danmaku-notify__msg';
    msg.textContent = isEnabled ? '弾幕をオンにしました' : '弾幕をオフにしました';
    body.appendChild(title);
    body.appendChild(msg);

    const time = document.createElement('div');
    time.className = 'tw-danmaku-notify__time';
    time.textContent = '今';

    banner.appendChild(body);
    banner.appendChild(time);
    player.appendChild(banner);

    notifyTimer = setTimeout(() => { banner.remove(); notifyTimer = 0; }, 3500);
  }

  // ── ページ種別判定 ──
  function isVOD() {
    return /^\/videos\/\d+/.test(window.location.pathname);
  }

  function isChannel() {
    // ライブ配信ページ: /username or /username 以外の動画ページでないもの
    const path = window.location.pathname;
    if (path === '/' || path.startsWith('/directory') || path.startsWith('/settings')) return false;
    if (isVOD()) return false;
    // /username パターン
    return /^\/[a-zA-Z0-9_]+\/?$/.test(path);
  }

  function isTwitchVideoPage() {
    return isVOD() || isChannel();
  }

  // ── プレイヤーコンテナ取得 ──
  function getPlayerContainer() {
    return document.querySelector('.video-player__container');
  }

  // ── メッセージ要素からDOMノード群をクローンして返す ──
  function buildMessageFragment(msgBody) {
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

          // エモート画像（Twitch公式 + 7TV/BTTV/FFZ）
          if (tag === 'img' && (
            child.classList.contains('chat-line__message--emote') ||
            child.classList.contains('bttv-emote-image') ||
            child.classList.contains('chat-image')
          )) {
            const src = child.getAttribute('src');
            if (src) {
              hasContent = true;
              const img = document.createElement('img');
              img.src = src;
              img.alt = child.getAttribute('alt') || '';
              img.className = 'tw-danmaku-emoji';
              parentFragment.appendChild(img);
            }
            continue;
          }

          // テキストフラグメント
          // ※ VODではtext-fragment内にBTTV/7TVエモートラッパーが含まれる場合がある
          //   textContentだとツールチップテキストも取得されるため、再帰で処理する
          if (child.classList.contains('text-fragment') || child.classList.contains('mention-fragment')) {
            walk(child, parentFragment);
            continue;
          }

          // ツールチップ要素はスキップ（BTTV/7TVのエモートツールチップ）
          if (child.classList && (child.classList.contains('bttv-tooltip') || child.classList.contains('seventv-tooltip'))) {
            continue;
          }

          // ツールチップ用の大きなプレビュー画像はスキップ
          if (tag === 'img' && child.classList.contains('bttv-tooltip-emote-image')) {
            continue;
          }

          // エモートボタンコンテナ（中のimgを取得）
          if (child.classList.contains('chat-line__message--emote-button') ||
              child.className.includes('chat-image__container')) {
            const emoteImg = child.querySelector('img.chat-line__message--emote, img.bttv-emote-image, img.chat-image');
            if (emoteImg) {
              const src = emoteImg.getAttribute('src');
              if (src) {
                hasContent = true;
                const img = document.createElement('img');
                img.src = src;
                img.alt = emoteImg.getAttribute('alt') || '';
                img.className = 'tw-danmaku-emoji';
                parentFragment.appendChild(img);
              }
            }
            continue;
          }

          // BTTV/7TV エモートラッパー（中のエモート画像のみ取得、ツールチップはスキップ）
          if (child.className.includes('bttv-tooltip-wrapper') || child.className.includes('bttv-emote')) {
            const emoteImg = child.querySelector('img.chat-line__message--emote, img.bttv-emote-image');
            if (emoteImg) {
              const src = emoteImg.getAttribute('src');
              if (src) {
                hasContent = true;
                const img = document.createElement('img');
                img.src = src;
                img.alt = emoteImg.getAttribute('alt') || '';
                img.className = 'tw-danmaku-emoji';
                parentFragment.appendChild(img);
              }
            }
            continue; // ツールチップへの再帰を防止
          }

          // その他の要素は再帰
          walk(child, parentFragment);
        }
      }
    }

    walk(msgBody, fragment);
    return hasContent ? fragment : null;
  }

  // ── チャット情報抽出（ライブ・VOD共通）──
  function extractChatInfo(node) {
    // バッジからユーザー種別を判定し、文字色を決定
    const badges = node.querySelectorAll('img.chat-badge');
    for (const badge of badges) {
      const alt = (badge.alt || '').toLowerCase();
      if (alt.includes('broadcaster') || alt.includes('配信者')) return { textColor: CONFIG.broadcasterColor };
      if (alt.includes('moderator') || alt.includes('モデレーター')) return { textColor: CONFIG.modColor };
      if (alt.includes('vip')) return { textColor: CONFIG.vipColor };
    }
    return { textColor: CONFIG.color };
  }

  // ── メッセージ本文要素を取得 ──
  function getMessageBody(node) {
    // ライブ: [data-a-target="chat-line-message-body"]
    // VOD: username の後のテキスト/エモート要素
    const liveBody = node.querySelector('[data-a-target="chat-line-message-body"]');
    if (liveBody) return liveBody;

    // VOD: .vod-message の場合、コロンの後の部分がメッセージ
    // テキストフラグメントやエモートを含む親要素を探す
    const textFragments = node.querySelectorAll('.text-fragment');
    const emotes = node.querySelectorAll('img.chat-line__message--emote, img.bttv-emote-image');

    if (textFragments.length > 0 || emotes.length > 0) {
      // コロン(:)セパレータの後にある要素群を含む親を特定
      // VODメッセージではコロンの後の兄弟要素がメッセージ本文
      // 注意: querySelectorAll で全 InjectLayout を走査し、テキストが ":" のものを探す
      //       （最初の InjectLayout はタイムスタンプなど別の要素の場合がある）
      const allInjectLayouts = node.querySelectorAll('[class*="InjectLayout"]');
      let colon = null;
      for (const el of allInjectLayouts) {
        if (el.textContent.trim() === ':') { colon = el; break; }
      }
      if (colon) {
        // コロンの親の中でコロンの後にある要素を集めたフラグメントを返す
        const parent = colon.parentElement;
        if (parent) {
          // コロンの後の兄弟要素を仮の div にまとめる
          const wrapper = document.createElement('div');
          let afterColon = false;
          for (const child of parent.childNodes) {
            if (child === colon) {
              afterColon = true;
              continue;
            }
            if (afterColon) {
              wrapper.appendChild(child.cloneNode(true));
            }
          }
          if (wrapper.childNodes.length > 0) return wrapper;
        }
      }
    }

    return null;
  }

  // ─── メインロジック ───
  let overlay = null;
  let overlayWidth = 0;
  let overlayHeight = 0;
  let resizeObserver = null;
  let laneTracker = [];
  let enabled = true;
  let chatObserver = null;
  let chatObservedTarget = null;
  const processedNodes = new WeakSet();

  // ── バッチ処理キュー ──
  let pendingNodes = [];
  let flushTimer = 0;

  function enqueueNode(node) {
    if (!node || node.nodeType !== 1) return;
    if (processedNodes.has(node)) return;
    processedNodes.add(node);
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

  // ── オーバーレイ作成 ──
  function createOverlay() {
    const player = getPlayerContainer();
    if (!player) return null;

    const existing = player.querySelector('#tw-danmaku-overlay');
    if (existing) existing.remove();

    injectStyles();

    const el = document.createElement('div');
    el.id = 'tw-danmaku-overlay';
    player.style.position = 'relative';
    player.appendChild(el);

    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(() => {
      updateOverlayBounds();
    });
    resizeObserver.observe(player);

    const video = player.querySelector('video');
    if (video) {
      video.addEventListener('loadedmetadata', () => updateOverlayBounds(), { once: true });
    }

    updateOverlayBounds();

    return el;
  }

  // ── レーンの衝突安全判定 ──
  function isLaneSafe(prev, now, newSpeed) {
    if (!prev) return true;
    const elapsed = (now - prev.startTime) / 1000;
    if (elapsed < prev.width / prev.speed) return false;
    if (newSpeed <= prev.speed) return true;
    const rightEdge = overlayWidth + prev.width - prev.speed * elapsed;
    if (rightEdge <= 0) return true;
    const gap = overlayWidth - rightEdge;
    const catchTime = gap / (newSpeed - prev.speed);
    const exitTime = rightEdge / prev.speed;
    return catchTime > exitTime;
  }

  // ── 行割り当て ──
  function getAvailableLine(newSpeed, newWidth) {
    const now = Date.now();
    const maxLines = CONFIG.maxLines;
    if (laneTracker.length !== maxLines) {
      laneTracker = new Array(maxLines).fill(null);
    }
    const info = { startTime: now, speed: newSpeed, width: newWidth };

    for (let i = 0; i < maxLines; i++) {
      if (isLaneSafe(laneTracker[i], now, newSpeed)) {
        laneTracker[i] = info;
        return i;
      }
    }
    const fallback = Math.floor(Math.random() * maxLines);
    laneTracker[fallback] = info;
    return fallback;
  }

  // ── 弾幕生成 ──
  function spawnDanmaku(messageFragment, chatInfo) {
    if (!enabled) return;
    if (!overlay || !overlay.isConnected) {
      overlay = createOverlay();
    }
    if (!overlay) return;

    const el = document.createElement('div');
    el.className = 'tw-danmaku-item';
    el.style.color = chatInfo.textColor;

    const msgSpan = document.createElement('span');
    msgSpan.style.fontSize = fontSize + 'px';
    msgSpan.style.lineHeight = (fontSize * CONFIG.lineHeightRatio) + 'px';
    msgSpan.appendChild(messageFragment);
    el.appendChild(msgSpan);

    el.style.visibility = 'hidden';
    overlay.appendChild(el);

    const images = el.querySelectorAll('img');
    const imagePromises = Array.from(images).map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        setTimeout(resolve, 3000);
      });
    });

    Promise.all(imagePromises).then(() => {
      const targetHeight = fontSize;
      Array.from(images).forEach(img => {
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        if (nw > 0 && nh > 0) {
          const w = Math.round(targetHeight * (nw / nh));
          img.style.cssText = 'width: ' + w + 'px !important; height: ' + targetHeight + 'px !important; max-height: none !important; min-height: ' + targetHeight + 'px !important; max-width: none !important; vertical-align: middle !important; display: inline-block !important; object-fit: contain !important;';
        } else {
          img.style.cssText = 'height: ' + targetHeight + 'px !important; width: auto !important; max-height: none !important; vertical-align: middle !important; display: inline-block !important;';
        }
      });

      requestAnimationFrame(() => {
        const elWidth = el.clientWidth;
        const speed = (elWidth + overlayWidth + 20) / CONFIG.duration;

        const line = getAvailableLine(speed, elWidth);
        const lineHeight = fontSize * CONFIG.lineHeightRatio;
        const areaHeight = overlayHeight * CONFIG.displayArea;
        const topPos = (line * lineHeight) % areaHeight;

        el.style.visibility = 'visible';
        el.style.top = topPos + 'px';
        el.style.animation = 'tw-danmaku-scroll ' + CONFIG.duration + 's linear forwards';

        const cleanup = () => {
          if (el.parentNode) el.remove();
        };
        const fallbackTimer = setTimeout(cleanup, CONFIG.duration * 1000 + 1000);
        el.addEventListener('animationend', () => {
          clearTimeout(fallbackTimer);
          cleanup();
        }, { once: true });
      });
    });
  }

  // ── チャットメッセージの処理 ──
  function processNode(node) {
    // ライブ: .chat-line__message-container の中にユーザー名とメッセージがある
    // VOD: .vod-message の中にタイムスタンプ・ユーザー名・メッセージがある
    const isLiveMsg = node.querySelector('.chat-line__message-container') || node.classList.contains('chat-line__message-container');
    const isVodMsg = node.classList.contains('vod-message') || node.querySelector('.vod-message');

    const target = isLiveMsg ? (node.querySelector('.chat-line__message-container') || node) :
                   isVodMsg ? (node.classList.contains('vod-message') ? node : node.querySelector('.vod-message')) :
                   node;

    // ユーザー名があるか確認（最低限のバリデーション）
    const hasUsername = target.querySelector('[data-a-target="chat-message-username"], .chat-author__display-name');
    if (!hasUsername) return;

    const chatInfo = extractChatInfo(target);
    const msgBody = getMessageBody(target);
    if (!msgBody) return;

    const fragment = buildMessageFragment(msgBody);
    if (!fragment) return;

    spawnDanmaku(fragment, chatInfo);
  }

  // ── ランタイム状態リセット ──
  function resetRuntimeState() {
    laneTracker = [];
    pendingNodes.length = 0;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = 0;
    }
  }

  // ── Mutation処理 ──
  function handleChatMutation(mutations) {
    if (!enabled) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        enqueueNode(node);
      }
    }
  }

  // ── チャットDOMの監視開始 ──
  function observeChat() {
    // ライブチャットコンテナ
    const liveContainer = document.querySelector('.chat-scrollable-area__message-container');
    // VODチャットコンテナ
    const vodListWrapper = document.querySelector('.video-chat__message-list-wrapper');
    const vodContainer = vodListWrapper ? vodListWrapper.querySelector('[class*="InjectLayout"]') : null;

    const target = liveContainer || vodContainer;
    if (!target) return false;
    if (chatObservedTarget === target) return true;

    if (chatObserver) {
      chatObserver.disconnect();
    }

    chatObserver = new MutationObserver(handleChatMutation);
    chatObserver.observe(target, { childList: true, subtree: true });
    chatObservedTarget = target;

    return true;
  }

  // ── チャットの準備完了を待つ ──
  let chatWaitObserver = null;
  let chatRetryTimer = 0;

  function waitForChat() {
    if (observeChat()) return;

    // ポーリングでチャットコンテナの出現を待つ
    let attempt = 0;
    function retry() {
      if (observeChat()) return;
      attempt++;
      if (attempt < 30) {
        chatRetryTimer = setTimeout(retry, 1000);
      }
    }
    chatRetryTimer = setTimeout(retry, 1000);

    // DOM変更も監視
    if (chatWaitObserver) chatWaitObserver.disconnect();
    chatWaitObserver = new MutationObserver(() => {
      if (observeChat()) {
        chatWaitObserver.disconnect();
        chatWaitObserver = null;
        if (chatRetryTimer) {
          clearTimeout(chatRetryTimer);
          chatRetryTimer = 0;
        }
      }
    });
    chatWaitObserver.observe(document.body, { childList: true, subtree: true });
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
      resetRuntimeState();
      showToggleNotify(enabled);
    }
  });

  // ── 初期化 ──
  function init() {
    if (!isTwitchVideoPage()) return;
    overlay = createOverlay();
    if (!overlay) {
      const waitPlayer = new MutationObserver(() => {
        if (getPlayerContainer()) {
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

  // ── クリーンアップ ──
  function cleanup() {
    if (chatObserver) {
      chatObserver.disconnect();
      chatObserver = null;
      chatObservedTarget = null;
    }
    if (chatWaitObserver) {
      chatWaitObserver.disconnect();
      chatWaitObserver = null;
    }
    if (chatRetryTimer) {
      clearTimeout(chatRetryTimer);
      chatRetryTimer = 0;
    }
    resetRuntimeState();
  }

  init();

  // ── SPA ナビゲーション対応（Twitchはpushstateベースのナビゲーション）──
  let lastPath = window.location.pathname;

  // popstate（ブラウザ戻る/進む）
  window.addEventListener('popstate', () => {
    handleNavigation();
  });

  // pushState / replaceState のフック
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;
  history.pushState = function () {
    origPushState.apply(this, arguments);
    handleNavigation();
  };
  history.replaceState = function () {
    origReplaceState.apply(this, arguments);
    handleNavigation();
  };

  function handleNavigation() {
    const newPath = window.location.pathname;
    if (newPath === lastPath) return;
    lastPath = newPath;

    cleanup();

    if (isTwitchVideoPage()) {
      setTimeout(() => {
        overlay = createOverlay();
        waitForChat();
      }, 2000);
    }
  }
})();