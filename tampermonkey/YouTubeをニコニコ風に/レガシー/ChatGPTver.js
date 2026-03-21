// ==UserScript==
// @name         YouTube Live Chat Danmaku (ニコニコ風コメント)
// @namespace    https://github.com/tampermonkey-youtube-danmaku
// @version      1.4.0
// @description  YouTubeライブチャットのコメントをニコニコ動画風に動画上へ弾幕表示する
// @author       You
// @match        https://www.youtube.com/watch*
// @match        https://www.youtube.com/live_chat*
// @match        https://www.youtube.com/live_chat_replay*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const OVERLAY_ID = 'yt-danmaku-overlay';
    const STYLE_ID = 'yt-danmaku-style';

    // ─── 設定 ───
    const CONFIG = {
        fontSize: 32, // フォントサイズ (px)
        fontFamily: '"Noto Sans JP", sans-serif',
        fontWeight: 'bold',
        opacity: 0.85, // コメント不透明度
        duration: 6, // コメントが画面を横切る秒数
        maxLines: 17, // 同時表示行数上限
        color: '#FFFFFF', // デフォルト文字色
        shadowColor: '#000000', // 文字影の色
        displayArea: 1.0, // 表示領域（動画の上から何割）
        ownerColor: '#FFD600', // チャンネル主の文字色
        modColor: '#5E84F1', // モデレーターの文字色
        iconSize: 28, // アイコンサイズ (px)
        bgOpacity: 0.35, // 特殊コメント背景の不透明度 (0.0〜1.0)
    };

    const PERF = {
        nodeReadyDelay: 60,
        batchDelay: 80,
        batchSize: 12,
        maxQueueSize: 120,
    };

    const MESSAGE_TAGS = new Set([
        'yt-live-chat-text-message-renderer',
        'yt-live-chat-paid-message-renderer',
        'yt-live-chat-paid-sticker-renderer',
        'yt-live-chat-membership-item-renderer',
    ]);

    const LINE_HEIGHT = CONFIG.fontSize * 1.55;
    const META_FONT_SIZE = CONFIG.fontSize * 0.55;
    const TEXT_SHADOW = `
    1px 1px 2px ${CONFIG.shadowColor},
    -1px -1px 2px ${CONFIG.shadowColor},
    1px -1px 2px ${CONFIG.shadowColor},
    -1px 1px 2px ${CONFIG.shadowColor}
  `;

    let overlay = null;
    let overlayWidth = 0;
    let overlayHeight = 0;
    let overlayResizeObserver = null;
    let lineTracker = [];
    let enabled = true;
    let chatObserver = null;
    let chatObservedItems = null;
    let pageObserver = null;
    let pendingNodes = [];
    let flushTimer = 0;

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
      #${OVERLAY_ID} {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        pointer-events: none;
        z-index: 2021;
        contain: layout style paint;
      }

      .yt-danmaku-item {
        position: absolute;
        top: 0;
        left: 100%;
        white-space: nowrap;
        pointer-events: none;
        font-family: ${CONFIG.fontFamily};
        font-weight: ${CONFIG.fontWeight};
        color: ${CONFIG.color};
        opacity: ${CONFIG.opacity};
        text-shadow: ${TEXT_SHADOW};
        transform: translate3d(0, 0, 0);
        transition-property: transform;
        transition-timing-function: linear;
        box-sizing: border-box;
        overflow: visible;
        padding: 2px 4px 6px;
      }

      .yt-danmaku-item--special {
        border-radius: 8px;
        padding: 8px 18px 12px;
      }

      .yt-danmaku-header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 2px;
        line-height: 1.25;
      }

      .yt-danmaku-icon {
        width: ${CONFIG.iconSize}px;
        height: ${CONFIG.iconSize}px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
      }

      .yt-danmaku-name,
      .yt-danmaku-amount {
        font-size: ${META_FONT_SIZE}px;
        opacity: 0.9;
        line-height: 1.25;
      }

      .yt-danmaku-sep {
        font-size: ${META_FONT_SIZE}px;
        opacity: 0.7;
        line-height: 1.25;
      }

      .yt-danmaku-message {
        font-size: ${CONFIG.fontSize}px;
        line-height: 1.25;
      }

      .yt-danmaku-emoji {
        width: ${CONFIG.fontSize}px;
        height: ${CONFIG.fontSize}px;
        margin: 0 1px;
        vertical-align: middle;
        object-fit: contain;
      }
    `;
        document.head.appendChild(style);
    }

    function observeOverlaySize(target) {
        if (overlayResizeObserver) {
            overlayResizeObserver.disconnect();
            overlayResizeObserver = null;
        }

        overlayWidth = target.clientWidth;
        overlayHeight = target.clientHeight;

        if (typeof ResizeObserver === 'undefined') return;

        overlayResizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                overlayWidth = entry.contentRect.width;
                overlayHeight = entry.contentRect.height;
            }
        });

        overlayResizeObserver.observe(target);
    }

    // メッセージ要素からDOMノード群を構築して返す
    // 中身が空なら null を返す
    function buildMessageFragment(msgEl) {
        const fragment = document.createDocumentFragment();
        let hasContent = false;

        function walk(node, parentFragment) {
            for (const child of node.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) {
                    const text = child.textContent || '';
                    if (text.trim()) {
                        hasContent = true;
                    }
                    if (text) {
                        parentFragment.appendChild(document.createTextNode(text));
                    }
                    continue;
                }

                if (child.nodeType !== Node.ELEMENT_NODE) continue;

                const tag = child.tagName.toLowerCase();
                if (tag === 'img') {
                    const src = child.getAttribute('src');
                    if (!src) continue;

                    hasContent = true;

                    const img = document.createElement('img');
                    img.src = src;
                    img.alt = child.getAttribute('alt') || '';
                    img.className = 'yt-danmaku-emoji';
                    parentFragment.appendChild(img);
                    continue;
                }

                walk(child, parentFragment);
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
        const authorName = authorNameEl
            ? (authorNameEl.textContent || '').trim()
            : '';

        const photoEl = node.querySelector(
            '#author-photo img, #author-photo yt-img-shadow img, yt-img-shadow img'
        );
        const photoSrc = photoEl
            ? photoEl.currentSrc || photoEl.src || photoEl.getAttribute('src')
            : null;

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
        if (tagName === 'yt-live-chat-paid-message-renderer') {
            const amountEl = node.querySelector(
                '#purchase-amount, #purchase-amount-chip'
            );
            info.amount = amountEl ? (amountEl.textContent || '').trim() : null;
            info.bgColor =
                node.style.getPropertyValue(
                    '--yt-live-chat-paid-message-primary-color'
                ) || 'rgba(230,33,23,0.8)';
            info.textColor =
                node.style.getPropertyValue(
                    '--yt-live-chat-paid-message-header-color'
                ) || '#FFFFFF';
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

        // 背景色の不透明度を CONFIG.bgOpacity で上書き
        if (info.bgColor) {
            const rgbaMatch = info.bgColor.match(
                /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/
            );
            if (rgbaMatch) {
                info.bgColor = `rgba(${rgbaMatch[1]},${rgbaMatch[2]},${rgbaMatch[3]
                    },${CONFIG.bgOpacity})`;
            }
        }

        return info;
    }

    function createOverlay() {
        const player = document.querySelector('#movie_player');
        if (!player) return null;

        const existing = player.querySelector(`#${OVERLAY_ID}`);
        if (existing) existing.remove();

        const el = document.createElement('div');
        el.id = OVERLAY_ID;

        player.style.position = 'relative';
        player.appendChild(el);

        observeOverlaySize(el);
        return el;
    }

    // 行割り当て（特殊コメントは2行分確保）
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
                if (now - lineTracker[i + j] <= clearTime) {
                    ok = false;
                    break;
                }
            }
            if (!ok) continue;

            for (let j = 0; j < needed; j++) {
                lineTracker[i + j] = now;
            }
            return i;
        }

        const fallback = Math.floor(Math.random() * (maxLines - needed + 1));
        for (let j = 0; j < needed; j++) {
            lineTracker[fallback + j] = now;
        }
        return fallback;
    }

    function spawnDanmaku(messageFragment, chatInfo) {
        if (!enabled) return;

        if (!overlay || !overlay.isConnected) {
            overlay = createOverlay();
        }
        if (!overlay) return;

        const width = overlayWidth || overlay.clientWidth;
        const height = overlayHeight || overlay.clientHeight;
        if (!width || !height) return;

        const isSpecial = chatInfo.isSpecial;
        const line = getAvailableLine(isSpecial);
        const areaHeight = Math.max(height * CONFIG.displayArea, LINE_HEIGHT);
        const topPos = (line * LINE_HEIGHT) % areaHeight;

        const el = document.createElement('div');
        el.className = 'yt-danmaku-item';
        el.style.top = `${topPos}px`;
        el.style.color = chatInfo.textColor;
        el.style.transitionDuration = `${CONFIG.duration}s`;

        if (isSpecial && chatInfo.bgColor) {
            el.classList.add('yt-danmaku-item--special');
            el.style.background = chatInfo.bgColor;
        }

        if (isSpecial) {
            const headerRow = document.createElement('div');
            headerRow.className = 'yt-danmaku-header';

            if (chatInfo.photoSrc) {
                const icon = document.createElement('img');
                icon.src = chatInfo.photoSrc;
                icon.className = 'yt-danmaku-icon';
                headerRow.appendChild(icon);
            }

            if (chatInfo.authorName) {
                const nameSpan = document.createElement('span');
                nameSpan.className = 'yt-danmaku-name';
                nameSpan.textContent = chatInfo.authorName;
                headerRow.appendChild(nameSpan);
            }

            if (chatInfo.amount) {
                const sep = document.createElement('span');
                sep.className = 'yt-danmaku-sep';
                sep.textContent = ' - ';
                headerRow.appendChild(sep);

                const amountSpan = document.createElement('span');
                amountSpan.className = 'yt-danmaku-amount';
                amountSpan.textContent = chatInfo.amount;
                headerRow.appendChild(amountSpan);
            }

            el.appendChild(headerRow);

            const msgRow = document.createElement('div');
            msgRow.className = 'yt-danmaku-message';
            msgRow.appendChild(messageFragment);
            el.appendChild(msgRow);
        } else {
            const msgSpan = document.createElement('span');
            msgSpan.className = 'yt-danmaku-message';
            msgSpan.appendChild(messageFragment);
            el.appendChild(msgSpan);
        }

        el.addEventListener(
            'transitionend',
            (event) => {
                if (event.propertyName === 'transform' && el.parentNode) {
                    el.remove();
                }
            },
            { once: true }
        );

        overlay.appendChild(el);

        requestAnimationFrame(() => {
            if (!el.isConnected) return;

            const currentOverlayWidth = overlayWidth || overlay.clientWidth;
            const distance = currentOverlayWidth + el.clientWidth + 32;
            el.style.transform = `translate3d(-${distance}px, 0, 0)`;
        });
    }

    function processNode(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE || !node.isConnected) {
            return;
        }

        const tagName = node.tagName.toLowerCase();
        if (!MESSAGE_TAGS.has(tagName)) return;

        const msgEl = node.querySelector('#message');
        if (!msgEl) return;

        const fragment = buildMessageFragment(msgEl);
        if (!fragment) return;

        const chatInfo = extractChatInfo(node);
        spawnDanmaku(fragment, chatInfo);
    }

    function clearPendingNodes() {
        pendingNodes.length = 0;

        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = 0;
        }
    }

    function scheduleFlush(delay) {
        if (flushTimer) return;
        flushTimer = window.setTimeout(flushPendingNodes, delay);
    }

    function enqueueNode(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE || document.hidden) {
            return;
        }

        pendingNodes.push({
            node,
            readyAt: performance.now() + PERF.nodeReadyDelay,
        });

        if (pendingNodes.length > PERF.maxQueueSize) {
            pendingNodes.splice(0, pendingNodes.length - PERF.maxQueueSize);
        }

        scheduleFlush(PERF.batchDelay);
    }

    function flushPendingNodes() {
        flushTimer = 0;

        if (document.hidden) {
            pendingNodes.length = 0;
            return;
        }

        const now = performance.now();
        let processed = 0;

        while (processed < PERF.batchSize && pendingNodes.length) {
            const entry = pendingNodes[0];
            if (entry.readyAt > now) break;

            pendingNodes.shift();
            processNode(entry.node);
            processed++;
        }

        if (!pendingNodes.length) return;

        const remaining = pendingNodes[0].readyAt - performance.now();
        const nextDelay = remaining > 0 ? Math.max(16, Math.ceil(remaining)) : 80;
        scheduleFlush(nextDelay);
    }

    function handleChatMutation(mutations) {
        if (document.hidden) return;

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                enqueueNode(node);
            }
        }
    }

    function observeChat() {
        const chatFrame = document.querySelector('#chatframe');
        if (!chatFrame) return false;

        let chatDoc;
        try {
            chatDoc = chatFrame.contentDocument;
        } catch (error) {
            return false;
        }

        if (!chatDoc || !chatDoc.body) return false;

        const itemList = chatDoc.querySelector(
            'yt-live-chat-item-list-renderer #items'
        );
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

    function onChatFrameLoad() {
        retryObserveChat(0);
    }

    function bindChatFrameLoad(chatFrame) {
        if (!chatFrame || chatFrame.dataset.ytDanmakuLoadBound === '1') return;

        chatFrame.addEventListener('load', onChatFrameLoad);
        chatFrame.dataset.ytDanmakuLoadBound = '1';
    }

    function waitForChat() {
        if (observeChat()) return;

        const chatFrame = document.querySelector('#chatframe');
        if (chatFrame) {
            bindChatFrameLoad(chatFrame);
        }

        if (pageObserver) {
            pageObserver.disconnect();
        }

        pageObserver = new MutationObserver(() => {
            const currentChatFrame = document.querySelector('#chatframe');
            if (!currentChatFrame) return;

            bindChatFrameLoad(currentChatFrame);

            if (observeChat()) {
                pageObserver.disconnect();
                pageObserver = null;
            }
        });

        pageObserver.observe(document.body, { childList: true, subtree: true });
    }

    function retryObserveChat(attempt) {
        if (observeChat()) return;

        if (attempt < 15) {
            setTimeout(() => retryObserveChat(attempt + 1), 1000);
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearPendingNodes();
        }
    });

    // Alt+C で弾幕ON/OFF
    document.addEventListener('keydown', (e) => {
        if (e.altKey && (e.key === 'c' || e.key === 'C')) {
            e.preventDefault();
            enabled = !enabled;
            if (!enabled && overlay) {
                while (overlay.firstChild) {
                    overlay.firstChild.remove();
                }
            }
        }
    });

    function init() {
        injectStyles();

        overlay = createOverlay();
        if (!overlay) {
            const waitPlayer = new MutationObserver(() => {
                if (!document.querySelector('#movie_player')) return;

                waitPlayer.disconnect();
                overlay = createOverlay();
                waitForChat();
            });

            waitPlayer.observe(document.body, { childList: true, subtree: true });
            return;
        }

        waitForChat();
    }

    init();

    // SPA ナビゲーション対応
    document.addEventListener('yt-navigate-finish', () => {
        if (window.location.pathname !== '/watch') return;

        clearPendingNodes();

        if (chatObserver) {
            chatObserver.disconnect();
            chatObserver = null;
            chatObservedItems = null;
        }

        if (pageObserver) {
            pageObserver.disconnect();
            pageObserver = null;
        }

        setTimeout(() => {
            overlay = createOverlay();
            waitForChat();
        }, 1500);
    });
})();