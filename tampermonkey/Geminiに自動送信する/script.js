// ==UserScript==
// @name         Geminiに自動送信する
// @namespace    http://tampermonkey.net/
// @version      2.3.0
// @description  URLクエリパラメータ ?q= の内容をGeminiのチャットに自動入力して送信する（?submit=0 で送信抑止）
// @author       You
// @match        https://gemini.google.com/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Geminiに自動送信する/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Geminiに自動送信する/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Geminiに自動送信する/icon_128.png
// ==/UserScript==

(function () {
    'use strict';

    const PARAM_NAME = 'q';
    const MODEL_PARAM = 'model';
    const MODE_PARAM = 'mode';
    const THINKING_PARAM = 'thinking';
    const SUBMIT_PARAM = 'submit';
    const DEFAULT_MODEL = 'pro';
    const DEFAULT_THINKING = 'standard';
    const INPUT_DELAY_MS = 1000;
    const MAX_WAIT_MS = 15000;

    const MODEL_MAP = {
        'flash-lite': {
            aliases: ['flash-lite', 'flashlite', 'lite'],
            currentPatterns: [/\bflash[\s-]*lite\b/i],
            menuPatterns: [/^3\.1\s*flash-lite\b/i, /^flash-lite\b/i],
        },
        flash: {
            aliases: ['flash', 'fast'],
            currentPatterns: [/\bflash\b/i],
            currentExcludePatterns: [/\blite\b/i],
            menuPatterns: [/^3\.5\s*flash\b/i, /^flash\b/i],
            menuExcludePatterns: [/\blite\b/i],
        },
        pro: {
            aliases: ['pro', 'think'],
            currentPatterns: [/\bpro\b/i],
            menuPatterns: [/^3\.1\s*pro\b/i, /^pro\b/i],
        },
    };

    const THINKING_MAP = {
        standard: {
            aliases: ['standard', 'std', 'normal', '標準'],
            currentPatterns: [/標準/, /\bstandard\b/i],
            menuPatterns: [/^標準\b/, /^standard\b/i],
        },
        extended: {
            aliases: ['extended', 'expand', 'expanded', '拡張'],
            currentPatterns: [/拡張/, /\bextended\b/i],
            menuPatterns: [/^拡張\b/, /^extended\b/i],
        },
    };

    // 一次=data-test-id / 二次=日本語UI / 三次=英語UI
    const MODE_BUTTON_SELECTORS = [
        'button[data-test-id="bard-mode-menu-button"]',
        'button[aria-label="モード選択ツールを開く"]',
        'button[aria-label="Open mode picker"]',
    ];
    const MODE_MENU_ITEM_SELECTOR = '[role="menuitem"], .mat-mdc-menu-item';
    const THINKING_PARENT_PATTERNS = [/^思考レベル\b/, /^thinking level\b/i];

    const params = new URLSearchParams(window.location.search);
    const query = params.get(PARAM_NAME);
    if (!query) return;
    const explicitModelKey = resolveConfigKey(params.get(MODEL_PARAM), MODEL_MAP);
    const legacyModeKey = resolveConfigKey(params.get(MODE_PARAM), MODEL_MAP);
    const modelKey = explicitModelKey ?? legacyModeKey ?? DEFAULT_MODEL;
    const thinkingKey = resolveThinkingKey(params.get(THINKING_PARAM), {
        modelSpecified: explicitModelKey != null,
        legacyModeKey,
    });
    const submitRaw = params.get(SUBMIT_PARAM);
    const shouldSubmit = !(submitRaw === '0' || submitRaw === 'false');

    const storageSeed = [query, modelKey, thinkingKey, shouldSubmit ? 'submit' : 'hold'].join('\u001f');
    const storageKey = 'gemini-auto-submit:' + btoa(encodeURIComponent(storageSeed)).slice(0, 48);
    if (sessionStorage.getItem(storageKey)) return;

    function compactText(text) {
        return String(text ?? '').replace(/\s+/g, ' ').trim();
    }

    function matchesPatterns(text, includePatterns, excludePatterns = []) {
        if (!includePatterns?.length) return false;
        const compact = compactText(text);
        return includePatterns.some(pattern => pattern.test(compact))
            && !excludePatterns.some(pattern => pattern.test(compact));
    }

    function resolveConfigKey(rawValue, configMap) {
        if (!rawValue) return null;
        const normalized = compactText(rawValue).toLowerCase().replace(/[\s_]+/g, '-');
        for (const [key, config] of Object.entries(configMap)) {
            if (normalized === key) return key;
            if (config.aliases?.includes(normalized)) return key;
        }
        return null;
    }

    function resolveThinkingKey(rawValue, { modelSpecified, legacyModeKey }) {
        const explicitThinkingKey = resolveConfigKey(rawValue, THINKING_MAP);
        if (explicitThinkingKey) return explicitThinkingKey;
        if (!modelSpecified && legacyModeKey === 'pro' && compactText(params.get(MODE_PARAM)).toLowerCase() === 'think') {
            return 'extended';
        }
        return DEFAULT_THINKING;
    }

    function waitFor(selectors, { predicate = () => true, timeout = MAX_WAIT_MS, interval = 200 } = {}) {
        return new Promise((resolve, reject) => {
            const deadline = Date.now() + timeout;
            const tick = () => {
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el && predicate(el)) return resolve(el);
                }
                if (Date.now() >= deadline) return reject(new Error(`要素なし: ${selectors.join(', ')}`));
                setTimeout(tick, interval);
            };
            tick();
        });
    }

    // 複数行テキストは Quill の execCommand('insertParagraph') と insertText が
    // 競合して先行行が欠落することがあるため DOM API で組み立てる。
    // GeminiはTrusted Typesポリシー下にあり innerHTML= は弾かれるので createElement 系で構築する必要がある。
    function insertMultilineViaDom(el, text) {
        el.focus();
        while (el.firstChild) el.removeChild(el.firstChild);
        const lines = text.split('\n');
        for (const line of lines) {
            const p = document.createElement('p');
            if (line) {
                p.textContent = line;
            } else {
                p.appendChild(document.createElement('br'));
            }
            el.appendChild(p);
        }
        const lastP = el.lastElementChild;
        const range = document.createRange();
        range.setStart(lastP, 0);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
    }

    // execCommand は非推奨だが contenteditable への確実な挿入手段として現状最良
    function insertText(el, text) {
        if (text.includes('\n')) {
            insertMultilineViaDom(el, text);
            return;
        }
        el.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        document.execCommand('insertText', false, text);
        if (el.textContent.trim() !== text.trim()) {
            el.textContent = text;
            el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: text }));
        }
    }

    function getVisibleMenuItems() {
        return [...document.querySelectorAll(MODE_MENU_ITEM_SELECTOR)]
            .filter(el => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden';
            });
    }

    function isSelectedMenuItem(el) {
        return el.classList.contains('selected')
            || el.getAttribute('aria-current') === 'true'
            || el.getAttribute('aria-selected') === 'true';
    }

    async function closeModeMenu() {
        document.body.click();
        await new Promise(r => setTimeout(r, 250));
    }

    async function openModeMenu() {
        const modeBtn = await waitFor(MODE_BUTTON_SELECTORS, { timeout: 3000 });
        if (!getVisibleMenuItems().length) {
            modeBtn.click();
            await waitFor([MODE_MENU_ITEM_SELECTOR], { timeout: 3000 });
            await new Promise(r => setTimeout(r, 200)); // Angular アニメーション待ち
        }
        return modeBtn;
    }

    function findVisibleMenuItem({ includePatterns, excludePatterns = [] }) {
        return getVisibleMenuItems().find(el => matchesPatterns(el.textContent, includePatterns, excludePatterns));
    }

    async function selectModel(modelConfig) {
        // 無料会員など一部UIではモードボタンが存在しないため短めのタイムアウトで失敗させる
        const modeBtn = await openModeMenu();

        if (matchesPatterns(modeBtn.textContent, modelConfig.currentPatterns, modelConfig.currentExcludePatterns ?? [])) {
            await closeModeMenu();
            return;
        }

        const target = findVisibleMenuItem({
            includePatterns: modelConfig.menuPatterns,
            excludePatterns: modelConfig.menuExcludePatterns ?? [],
        });
        if (!target) throw new Error(`モデル項目なし: ${modelKey}`);

        if (isSelectedMenuItem(target)) {
            await closeModeMenu();
            return;
        }

        target.click();
        await new Promise(r => setTimeout(r, 400));
    }

    async function selectThinkingLevel(levelConfig) {
        await openModeMenu();

        const thinkingMenu = findVisibleMenuItem({ includePatterns: THINKING_PARENT_PATTERNS });
        if (!thinkingMenu) throw new Error('思考レベル項目なし');

        if (matchesPatterns(thinkingMenu.textContent, levelConfig.currentPatterns)) {
            await closeModeMenu();
            return;
        }

        thinkingMenu.click();
        await new Promise(r => setTimeout(r, 250));

        const target = findVisibleMenuItem({ includePatterns: levelConfig.menuPatterns });
        if (!target) throw new Error(`思考レベル項目なし: ${thinkingKey}`);

        if (isSelectedMenuItem(target)) {
            await closeModeMenu();
            return;
        }

        target.click();
        await new Promise(r => setTimeout(r, 400));
    }

    async function autoSubmit() {
        // モデル/思考レベル選択は失敗しても送信は続行（UI未対応環境向けフェイルソフト）
        await selectModel(MODEL_MAP[modelKey]).catch(() => {});
        await selectThinkingLevel(THINKING_MAP[thinkingKey]).catch(() => {});

        // 入力欄: 構造セレクタのみ（言語非依存）
        const inputEl = await waitFor([
            'rich-textarea .ql-editor[contenteditable="true"]',
            'div.ql-editor[contenteditable="true"]',
            'div[contenteditable="true"][data-placeholder]',
        ]);
        insertText(inputEl, query);

        sessionStorage.setItem(storageKey, '1');

        // submit=0 のときは入力のみで終了（ユーザーが自分で編集・送信する用途）
        if (!shouldSubmit) return;

        await new Promise(r => setTimeout(r, INPUT_DELAY_MS));

        // 送信ボタン: 日本語UI / 英語UI / クラスフォールバック
        const sendBtn = await waitFor([
            'button[aria-label="プロンプトを送信"]',
            'button[aria-label="Send prompt"]',
            'button[aria-label="Send message"]',
            'button.send-button',
        ], { predicate: el => !el.disabled, timeout: 5000, interval: 100 });
        sendBtn.click();
    }

    autoSubmit();
})();
