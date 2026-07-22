// ==UserScript==
// @name         YouTubeのGeminiをリダイレクト
// @namespace    http://tampermonkey.net/
// @version      1.2.3
// @description  YouTubeのAskボタンからGemini・ChatGPT・Claudeを選び、動画URLまたはトランスクリプトを入力する（送信はしない）
// @author       You
// @match        https://www.youtube.com/*
// @match        https://chatgpt.com/*
// @match        https://claude.ai/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeのGeminiをリダイレクト/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeのGeminiをリダイレクト/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeのGeminiをリダイレクト/icon.svg
// ==/UserScript==

(function () {
    'use strict';

    const SELECTED_AI_KEY = 'tm-youtube-ask-selected-ai';
    const TRANSFER_KEY_PREFIX = 'tm-youtube-ask-transfer-';
    const TRANSFER_HASH_KEY = 'tm-youtube-ask';
    const TRANSFER_TTL = 5 * 60 * 1000;
    const MAX_WAIT_MS = 15000;

    const PROVIDERS = {
        gemini: {
            label: 'Gemini',
            url: 'https://gemini.google.com/app',
            viewBox: '0 -960 960 960',
            path: 'M480-80q0-83-31.5-156T363-363q-54-54-127-85.5T80-480q83 0 156-31.5T363-597q54-54 85.5-127T480-880q0 83 31.5 156T597-597q54 54 127 85.5T880-480q-83 0-156 31.5T597-363q-54 54-85.5 127T480-80Z',
        },
        chatgpt: {
            label: 'ChatGPT',
            url: 'https://chatgpt.com/',
            inputSelector: '#prompt-textarea[contenteditable="true"]',
            viewBox: '0 0 256 260',
            scale: 0.83,
            path: 'M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z',
        },
        claude: {
            label: 'Claude',
            url: 'https://claude.ai/new',
            inputSelector: '[data-testid="chat-input"][contenteditable="true"]',
            viewBox: '0 0 256 257',
            scale: 0.83,
            path: 'm50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z',
        },
    };

    const hostname = location.hostname;
    if (hostname === 'chatgpt.com') {
        void receivePrompt('chatgpt');
        return;
    }
    if (hostname === 'claude.ai') {
        void receivePrompt('claude');
        return;
    }
    if (hostname !== 'www.youtube.com') return;

    const ASK_BUTTON_SELECTOR = 'button-view-model.you-chat-entrypoint-button';
    const STYLE_ID = 'tm-youtube-ask-style';
    const MENU_ID = 'tm-youtube-ask-menu';
    const PANEL_SELECTOR = 'ytd-engagement-panel-section-list-renderer';
    const SHOW_BUTTON_SELECTOR =
        'ytd-video-description-transcript-section-renderer #primary-button button';
    const PRIMARY_SHOW_BUTTON_SELECTOR = `ytd-watch-metadata ${SHOW_BUTTON_SELECTOR}`;
    const TRANSCRIPT_DOMS = [
        {
            segment: 'transcript-segment-view-model',
            text: '.ytAttributedStringHost',
        },
        {
            segment: 'ytd-transcript-segment-renderer',
            text: '.segment-text',
        },
    ];

    let selectedProvider = getStoredProvider();
    let activeMenuTrigger = null;
    let decorateQueued = false;
    let preparingPrompt = false;

    function getStoredProvider() {
        const stored = GM_getValue(SELECTED_AI_KEY, 'gemini');
        return Object.hasOwn(PROVIDERS, stored) ? stored : 'gemini';
    }

    function createSvg(provider, className = '') {
        const config = PROVIDERS[provider];
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', config.viewBox);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.setAttribute('aria-hidden', 'true');
        if (className) svg.setAttribute('class', className);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', config.path);
        path.setAttribute('fill', 'currentColor');
        if (config.scale && config.scale !== 1) {
            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            const [, , vbWidth, vbHeight] = config.viewBox.split(' ').map(Number);
            group.setAttribute(
                'transform',
                `translate(${vbWidth / 2} ${vbHeight / 2}) scale(${config.scale}) translate(${-vbWidth / 2} ${-vbHeight / 2})`,
            );
            group.appendChild(path);
            svg.appendChild(group);
        } else {
            svg.appendChild(path);
        }
        return svg;
    }

    function replaceAskIcon(host) {
        const oldSvg = host.querySelector('.ytSpecButtonShapeNextIcon svg');
        if (!oldSvg) return;
        const svg = createSvg(selectedProvider);
        svg.dataset.tmYoutubeAskProvider = selectedProvider;
        for (const attribute of ['width', 'height', 'focusable']) {
            const value = oldSvg.getAttribute(attribute);
            if (value !== null) svg.setAttribute(attribute, value);
        }
        oldSvg.replaceWith(svg);
        const button = host.querySelector('button');
        if (button) button.title = `${PROVIDERS[selectedProvider].label}に聞く`;
    }

    function syncTriggerAppearance(trigger, askButton) {
        const style = getComputedStyle(askButton);
        trigger.style.setProperty('--tm-youtube-ask-control-background', style.backgroundColor);
        trigger.style.color = style.color;
        trigger.style.borderStyle = style.borderStyle;
        trigger.style.borderWidth = style.borderTopWidth;
        trigger.style.borderColor = style.borderTopColor;
    }

    function addStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .tm-youtube-ask-split {
                --tm-youtube-ask-foreground: #0f0f0f;
                --tm-youtube-ask-control-background: rgba(0, 0, 0, .05);
                --tm-youtube-ask-control-hover: rgba(0, 0, 0, .10);
                display: inline-flex !important;
                align-items: stretch !important;
                position: relative;
                vertical-align: middle;
            }
            .tm-youtube-ask-split > ${ASK_BUTTON_SELECTOR} > button {
                border-top-right-radius: 4px !important;
                border-bottom-right-radius: 4px !important;
            }
            ${ASK_BUTTON_SELECTOR}[data-tm-youtube-ask] .ytSpecButtonShapeNextIcon svg {
                display: block;
                width: 100%;
                height: 100%;
            }
            ${ASK_BUTTON_SELECTOR}[data-tm-youtube-ask] .ytSpecButtonShapeNextIcon path {
                fill: currentColor !important;
            }
            .tm-youtube-ask-trigger {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                box-sizing: border-box;
                min-width: 30px;
                margin: 0 0 0 2px;
                padding: 0 8px;
                border-width: 0;
                border-style: solid;
                border-radius: 4px 9999px 9999px 4px;
                color: var(--tm-youtube-ask-foreground);
                background: var(--tm-youtube-ask-control-background);
                cursor: pointer;
                font: inherit;
            }
            .tm-youtube-ask-trigger:hover,
            .tm-youtube-ask-trigger:focus-visible {
                background: var(--tm-youtube-ask-control-hover);
                outline: none;
            }
            html[dark] .tm-youtube-ask-split {
                --tm-youtube-ask-foreground: #f1f1f1;
                --tm-youtube-ask-control-background: rgba(255, 255, 255, .10);
                --tm-youtube-ask-control-hover: rgba(255, 255, 255, .20);
            }
            .tm-youtube-ask-trigger svg {
                display: block;
                width: 18px;
                height: 18px;
                fill: currentColor;
                pointer-events: none;
            }
            #${MENU_ID} {
                --tm-youtube-ask-menu-foreground: #0f0f0f;
                --tm-youtube-ask-menu-background: #fff;
                --tm-youtube-ask-menu-border: rgba(0, 0, 0, .12);
                --tm-youtube-ask-menu-hover: rgba(0, 0, 0, .08);
                --tm-youtube-ask-menu-shadow: rgba(0, 0, 0, .20);
                position: fixed;
                z-index: 2200;
                display: flex;
                flex-direction: column;
                gap: 2px;
                min-width: 176px;
                padding: 8px;
                border: 1px solid var(--tm-youtube-ask-menu-border);
                border-radius: 12px;
                color: var(--tm-youtube-ask-menu-foreground);
                background: var(--tm-youtube-ask-menu-background);
                box-shadow: 0 8px 28px var(--tm-youtube-ask-menu-shadow);
                font-family: Roboto, Arial, sans-serif;
            }
            html[dark] #${MENU_ID} {
                --tm-youtube-ask-menu-foreground: #f1f1f1;
                --tm-youtube-ask-menu-background: #282828;
                --tm-youtube-ask-menu-border: rgba(255, 255, 255, .14);
                --tm-youtube-ask-menu-hover: rgba(255, 255, 255, .10);
                --tm-youtube-ask-menu-shadow: rgba(0, 0, 0, .45);
            }
            #${MENU_ID}[hidden] { display: none; }
            .tm-youtube-ask-option {
                display: grid;
                grid-template-columns: 24px 1fr 18px;
                align-items: center;
                gap: 10px;
                width: 100%;
                padding: 9px 10px;
                border: 0;
                border-radius: 8px;
                color: inherit;
                background: transparent;
                cursor: pointer;
                font: 500 14px/20px Roboto, Arial, sans-serif;
                text-align: left;
            }
            .tm-youtube-ask-option:hover,
            .tm-youtube-ask-option:focus-visible {
                background: var(--tm-youtube-ask-menu-hover);
                outline: none;
            }
            .tm-youtube-ask-option > svg {
                width: 22px;
                height: 22px;
            }
            .tm-youtube-ask-check {
                visibility: hidden;
                font-size: 16px;
                text-align: center;
            }
            .tm-youtube-ask-option[aria-checked="true"] .tm-youtube-ask-check {
                visibility: visible;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function makeTrigger() {
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'tm-youtube-ask-trigger';
        trigger.setAttribute('aria-haspopup', 'menu');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-label', `AIを選択（現在: ${PROVIDERS[selectedProvider].label}）`);
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M18.707 8.793a1 1 0 00-1.414 0L12 14.086 6.707 8.793a1 1 0 10-1.414 1.414L12 16.914l6.707-6.707a1 1 0 000-1.414Z');
        svg.appendChild(path);
        trigger.appendChild(svg);
        return trigger;
    }

    function decorateAskButtons() {
        addStyle();
        for (const trigger of document.querySelectorAll('.tm-youtube-ask-trigger')) {
            const host = trigger.previousElementSibling;
            if (host?.matches?.(ASK_BUTTON_SELECTOR)) continue;
            const parent = trigger.parentElement;
            trigger.remove();
            if (parent && !parent.querySelector(ASK_BUTTON_SELECTOR)) {
                parent.classList.remove('tm-youtube-ask-split');
            }
        }
        for (const host of document.querySelectorAll(ASK_BUTTON_SELECTOR)) {
            if (host.closest('yt-player-quick-action-buttons')) continue;
            const askButton = host.querySelector('button');
            if (host.dataset.tmYoutubeAsk) {
                const svg = host.querySelector('.ytSpecButtonShapeNextIcon svg');
                if (svg?.dataset.tmYoutubeAskProvider !== selectedProvider) replaceAskIcon(host);
                const trigger = host.nextElementSibling;
                if (askButton && trigger?.matches('.tm-youtube-ask-trigger')) syncTriggerAppearance(trigger, askButton);
                continue;
            }
            const parent = host.parentElement;
            if (!parent) continue;
            host.dataset.tmYoutubeAsk = 'true';
            parent.classList.add('tm-youtube-ask-split');
            const trigger = makeTrigger();
            host.insertAdjacentElement('afterend', trigger);
            replaceAskIcon(host);
            if (askButton) syncTriggerAppearance(trigger, askButton);
        }
    }

    function queueDecoration() {
        if (decorateQueued) return;
        decorateQueued = true;
        requestAnimationFrame(() => {
            decorateQueued = false;
            decorateAskButtons();
        });
    }

    function getMenu() {
        let menu = document.getElementById(MENU_ID);
        if (menu) return menu;
        menu = document.createElement('div');
        menu.id = MENU_ID;
        menu.hidden = true;
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', '質問するAIを選択');
        for (const provider of Object.keys(PROVIDERS)) {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'tm-youtube-ask-option';
            option.dataset.provider = provider;
            option.setAttribute('role', 'menuitemradio');
            option.appendChild(createSvg(provider));
            const label = document.createElement('span');
            label.textContent = PROVIDERS[provider].label;
            const check = document.createElement('span');
            check.className = 'tm-youtube-ask-check';
            check.textContent = '✓';
            option.append(label, check);
            menu.appendChild(option);
        }
        document.body.appendChild(menu);
        return menu;
    }

    function updateMenuSelection(menu = document.getElementById(MENU_ID)) {
        if (!menu) return;
        for (const option of menu.querySelectorAll('.tm-youtube-ask-option')) {
            option.setAttribute('aria-checked', String(option.dataset.provider === selectedProvider));
        }
    }

    function openMenu(trigger) {
        const menu = getMenu();
        if (activeMenuTrigger === trigger && !menu.hidden) {
            closeMenu(true);
            return;
        }
        closeMenu(false);
        activeMenuTrigger = trigger;
        trigger.setAttribute('aria-expanded', 'true');
        updateMenuSelection(menu);
        menu.hidden = false;

        const rect = trigger.getBoundingClientRect();
        const width = menu.offsetWidth;
        const height = menu.offsetHeight;
        const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
        const top = rect.bottom + height + 8 <= window.innerHeight
            ? rect.bottom + 6
            : Math.max(8, rect.top - height - 6);
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.querySelector('.tm-youtube-ask-option[aria-checked="true"]')?.focus();
    }

    function closeMenu(restoreFocus = false) {
        const menu = document.getElementById(MENU_ID);
        if (menu) menu.hidden = true;
        if (activeMenuTrigger) {
            activeMenuTrigger.setAttribute('aria-expanded', 'false');
            if (restoreFocus) activeMenuTrigger.focus();
        }
        activeMenuTrigger = null;
    }

    function selectProvider(provider) {
        if (!Object.hasOwn(PROVIDERS, provider)) return;
        selectedProvider = provider;
        GM_setValue(SELECTED_AI_KEY, provider);
        for (const host of document.querySelectorAll(`${ASK_BUTTON_SELECTOR}[data-tm-youtube-ask]`)) {
            replaceAskIcon(host);
        }
        for (const trigger of document.querySelectorAll('.tm-youtube-ask-trigger')) {
            trigger.setAttribute('aria-label', `AIを選択（現在: ${PROVIDERS[provider].label}）`);
        }
        updateMenuSelection();
    }

    function getCleanVideoUrl() {
        const url = new URL(location.href);
        if (url.pathname === '/watch') {
            const videoId = url.searchParams.get('v');
            if (videoId) return `${url.origin}/watch?v=${videoId}`;
        }
        return `${url.origin}${url.pathname}`;
    }

    function getPlayerResponse() {
        try {
            return document.querySelector('#movie_player')?.getPlayerResponse?.() || null;
        } catch {
            return null;
        }
    }

    function getVideoTitle() {
        const response = getPlayerResponse();
        const title = response?.microformat?.playerMicroformatRenderer?.title?.simpleText;
        return title?.trim() || document.title.replace(/ - YouTube$/, '').trim() || 'YouTube動画';
    }

    function getTranscriptDom(panel) {
        return TRANSCRIPT_DOMS.find((dom) => panel.querySelector(dom.segment)) || null;
    }

    function findLoadedTranscriptPanel() {
        let loaded = null;
        for (const panel of document.querySelectorAll(PANEL_SELECTOR)) {
            if (!getTranscriptDom(panel)) continue;
            if (panel.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED') return panel;
            loaded ||= panel;
        }
        return loaded;
    }

    function findExpandedTranscriptPanel() {
        for (const panel of document.querySelectorAll(PANEL_SELECTOR)) {
            if (
                getTranscriptDom(panel)
                && panel.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED'
            ) return panel;
        }
        return null;
    }

    function waitForTranscript(timeout = MAX_WAIT_MS) {
        const loaded = findLoadedTranscriptPanel();
        if (loaded) return Promise.resolve(loaded);
        const panels = document.querySelector('ytd-watch-flexy #panels');
        if (!panels) return Promise.reject(new Error('文字起こしパネルの領域が見つかりませんでした。'));

        return new Promise((resolve, reject) => {
            let finished = false;
            const observer = new MutationObserver(() => {
                const panel = findLoadedTranscriptPanel();
                if (panel) finish(panel);
            });
            const timer = setTimeout(() => finish(null), timeout);
            const finish = (panel) => {
                if (finished) return;
                finished = true;
                observer.disconnect();
                clearTimeout(timer);
                if (panel) resolve(panel);
                else reject(new Error('文字起こしの読み込みがタイムアウトしました。'));
            };
            observer.observe(panels, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['visibility'],
            });
            const panel = findLoadedTranscriptPanel();
            if (panel) finish(panel);
        });
    }

    async function loadTranscript() {
        const alreadyExpanded = Boolean(findExpandedTranscriptPanel());
        let panel = findLoadedTranscriptPanel();
        let openedByScript = false;
        if (!panel) {
            const button = document.querySelector(PRIMARY_SHOW_BUTTON_SELECTOR);
            if (!button) throw new Error('この動画には利用できる文字起こしがありません。');
            button.click();
            openedByScript = !alreadyExpanded;
            try {
                panel = await waitForTranscript();
            } catch (error) {
                if (openedByScript) closeTranscriptPanel(findExpandedTranscriptPanel());
                throw error;
            }
        }

        try {
            const dom = getTranscriptDom(panel);
            if (!dom) throw new Error('文字起こしの形式を認識できませんでした。');
            const lines = [];
            for (const segment of panel.querySelectorAll(dom.segment)) {
                const text = (segment.querySelector(dom.text)?.textContent || '')
                    .replace(/\s+/g, ' ')
                    .trim();
                if (text) lines.push(text);
            }
            if (!lines.length) throw new Error('文字起こしに取得できる本文がありませんでした。');
            return { text: lines.join('\n'), panel, openedByScript };
        } catch (error) {
            if (openedByScript) closeTranscriptPanel(panel);
            throw error;
        }
    }

    function closeTranscriptPanel(panel) {
        if (panel?.getAttribute('visibility') !== 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED') return;
        panel.querySelector('#visibility-button button')?.click();
    }

    function openGemini() {
        const target = new URL(PROVIDERS.gemini.url);
        target.searchParams.set('q', `${getCleanVideoUrl()}\n\n`);
        target.searchParams.set('submit', '0');
        const popup = window.open(target.toString(), '_blank');
        if (!popup) {
            alert('Geminiを開けませんでした。YouTubeのポップアップを許可してください。');
            return;
        }
        popup.opener = null;
    }

    function createTransferToken() {
        return globalThis.crypto?.randomUUID?.()
            || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    }

    async function openWithTranscript(provider) {
        if (preparingPrompt) {
            alert('別のAI向けに文字起こしを準備中です。完了してから再試行してください。');
            return;
        }
        preparingPrompt = true;
        let transcriptResult = null;
        let transferStored = false;
        try {
            transcriptResult = await loadTranscript();
            const prompt = [
                `動画タイトル: ${getVideoTitle()}`,
                `動画URL: ${getCleanVideoUrl()}`,
                '',
                'トランスクリプト:',
                transcriptResult.text,
                '',
                '',
            ].join('\n');
            const token = createTransferToken();
            GM_setValue(`${TRANSFER_KEY_PREFIX}${provider}`, {
                token,
                prompt,
                createdAt: Date.now(),
            });
            transferStored = true;
            const destination = `${PROVIDERS[provider].url}#${TRANSFER_HASH_KEY}=${encodeURIComponent(token)}`;
            const openedTab = GM_openInTab(destination, {
                active: true,
                insert: true,
                setParent: false,
            });
            if (!openedTab) throw new Error(`${PROVIDERS[provider].label}を開けませんでした。`);
        } catch (error) {
            if (transferStored) GM_deleteValue(`${TRANSFER_KEY_PREFIX}${provider}`);
            alert(error instanceof Error ? error.message : '文字起こしを取得できませんでした。');
        } finally {
            if (transcriptResult?.openedByScript) closeTranscriptPanel(transcriptResult.panel);
            preparingPrompt = false;
        }
    }

    function handleClick(event) {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') return;

        const option = target.closest('.tm-youtube-ask-option');
        if (option) {
            event.preventDefault();
            event.stopImmediatePropagation();
            selectProvider(option.dataset.provider);
            closeMenu(true);
            return;
        }

        const trigger = target.closest('.tm-youtube-ask-trigger');
        if (trigger) {
            event.preventDefault();
            event.stopImmediatePropagation();
            openMenu(trigger);
            return;
        }

        const host = target.closest(ASK_BUTTON_SELECTOR);
        if (host && !host.closest('yt-player-quick-action-buttons')) {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeMenu(false);
            if (selectedProvider === 'gemini') openGemini();
            else void openWithTranscript(selectedProvider);
            return;
        }

        closeMenu(false);
    }

    function initializeYouTube() {
        const start = () => {
            addStyle();
            decorateAskButtons();
            const observer = new MutationObserver(queueDecoration);
            observer.observe(document.documentElement, { childList: true, subtree: true });
        };
        if (document.documentElement) start();
        else document.addEventListener('DOMContentLoaded', start, { once: true });

        document.addEventListener('click', handleClick, true);
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && activeMenuTrigger) {
                event.preventDefault();
                closeMenu(true);
            }
        }, true);
        window.addEventListener('scroll', () => closeMenu(false), true);
        window.addEventListener('resize', () => closeMenu(false));
        window.addEventListener('yt-navigate-finish', () => {
            closeMenu(false);
            queueDecoration();
        });
    }

    initializeYouTube();

    async function receivePrompt(provider) {
        const params = new URLSearchParams(location.hash.slice(1));
        const token = params.get(TRANSFER_HASH_KEY);
        if (!token) return;
        const storageKey = `${TRANSFER_KEY_PREFIX}${provider}`;
        const transfer = GM_getValue(storageKey, null);
        if (!transfer || transfer.token !== token || typeof transfer.prompt !== 'string') {
            alert('YouTubeから受け取るプロンプトが見つかりませんでした。Askボタンからもう一度開いてください。');
            return;
        }
        if (!Number.isFinite(transfer.createdAt) || Date.now() - transfer.createdAt > TRANSFER_TTL) {
            GM_deleteValue(storageKey);
            history.replaceState(history.state, '', location.pathname + location.search);
            alert('YouTubeから受け取るプロンプトの有効期限が切れました。Askボタンからもう一度開いてください。');
            return;
        }

        try {
            const input = await waitForElement(PROVIDERS[provider].inputSelector, MAX_WAIT_MS);
            insertMultilineText(input, transfer.prompt);
            GM_deleteValue(storageKey);
            history.replaceState(history.state, '', location.pathname + location.search);
        } catch {
            alert(`${PROVIDERS[provider].label}の入力欄を見つけられませんでした。ページを再読み込みして再試行してください。`);
        }
    }

    function waitForElement(selector, timeout) {
        return new Promise((resolve, reject) => {
            const deadline = Date.now() + timeout;
            const tick = () => {
                const element = document.querySelector(selector);
                if (element && isVisible(element)) {
                    resolve(element);
                    return;
                }
                if (Date.now() >= deadline) {
                    reject(new Error(`要素なし: ${selector}`));
                    return;
                }
                setTimeout(tick, 200);
            };
            tick();
        });
    }

    function isVisible(element) {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
            && style.visibility !== 'hidden'
            && rect.width > 0
            && rect.height > 0;
    }

    function insertMultilineText(element, text) {
        element.focus();
        element.replaceChildren();
        const paragraph = document.createElement('p');
        const lines = text.split('\n');
        for (let index = 0; index < lines.length; index++) {
            if (index) paragraph.appendChild(document.createElement('br'));
            if (lines[index]) paragraph.appendChild(document.createTextNode(lines[index]));
        }
        element.appendChild(paragraph);

        const range = document.createRange();
        range.selectNodeContents(paragraph);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        element.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: text,
        }));
    }
})();
