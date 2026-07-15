// ==UserScript==
// @name         Geminiに自動送信する
// @namespace    http://tampermonkey.net/
// @version      3.0.0
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

    const DEFAULT_MODEL = 'pro';
    const MAX_WAIT_MS = 15000;

    // メニュー項目のモデル名は日本語UIでも英語表記（例: "3.5 Flash あらゆる場面でサポート"）。
    // バージョン番号（3.1 等）は更新で変わるためパターンに含めない。
    const MODEL_MAP = {
        'flash-lite': { aliases: ['flashlite', 'lite'], pattern: /\bflash[\s-]*lite\b/i },
        flash: { aliases: ['fast'], pattern: /\bflash\b(?![\s-]*lite)/i },
        pro: { aliases: ['think'], pattern: /\bpro\b/i },
    };
    const EXTENDED_ALIASES = ['extended', 'expand', 'expanded', '拡張'];

    const MODE_BUTTON_SELECTOR = 'button[data-test-id="bard-mode-menu-button"]';
    const MENU_ITEM_SELECTOR = '[role="menuitem"]';

    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    if (!query) return;

    const normalize = value => String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
    const resolveModelKey = rawValue => {
        const normalized = normalize(rawValue);
        if (!normalized) return null;
        return Object.keys(MODEL_MAP).find(key =>
            key === normalized || MODEL_MAP[key].aliases.includes(normalized)) ?? null;
    };

    // model= が正式。mode= は旧URL互換（mode=think は Pro+拡張思考の意味だった）
    const rawModel = params.get('model');
    const rawMode = params.get('mode');
    const modelKey = resolveModelKey(rawModel) ?? resolveModelKey(rawMode) ?? DEFAULT_MODEL;
    const wantExtended = EXTENDED_ALIASES.includes(normalize(params.get('thinking')))
        || (!rawModel && normalize(rawMode) === 'think');
    const submitRaw = params.get('submit');
    const shouldSubmit = !(submitRaw === '0' || submitRaw === 'false');

    const storageSeed = [query, modelKey, wantExtended, shouldSubmit].join('');
    const storageKey = 'gemini-auto-submit:' + btoa(encodeURIComponent(storageSeed)).slice(0, 48);
    if (sessionStorage.getItem(storageKey)) return;

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function waitFor(selector, { predicate = () => true, timeout = MAX_WAIT_MS, interval = 200 } = {}) {
        return new Promise((resolve, reject) => {
            const deadline = Date.now() + timeout;
            const tick = () => {
                const el = document.querySelector(selector);
                if (el && predicate(el)) return resolve(el);
                if (Date.now() >= deadline) return reject(new Error(`要素なし: ${selector}`));
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
        for (const line of text.split('\n')) {
            const p = document.createElement('p');
            if (line) {
                p.textContent = line;
            } else {
                p.appendChild(document.createElement('br'));
            }
            el.appendChild(p);
        }
        const range = document.createRange();
        range.setStart(el.lastElementChild, 0);
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
    }

    function getVisibleMenuItems() {
        return [...document.querySelectorAll(MENU_ITEM_SELECTOR)].filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });
    }

    async function openModeMenu() {
        const modeBtn = await waitFor(MODE_BUTTON_SELECTOR, { timeout: 3000 });
        if (!getVisibleMenuItems().length) {
            modeBtn.click();
            await waitFor(MENU_ITEM_SELECTOR, { timeout: 3000 });
            await sleep(200); // Angular アニメーション待ち
        }
    }

    async function closeModeMenu() {
        document.body.click();
        await sleep(250);
    }

    // モデルはメニュー内の .selected クラスで現在値を判定（UI言語非依存）。
    // 項目クリックでメニューは自動的に閉じる。
    async function selectModel() {
        await openModeMenu();
        const target = getVisibleMenuItems().find(el => MODEL_MAP[modelKey].pattern.test(el.textContent));
        if (!target) throw new Error(`モデル項目なし: ${modelKey}`);
        if (target.classList.contains('selected')) {
            await closeModeMenu();
            return;
        }
        target.click();
        await sleep(400);
    }

    // 「強化版思考モード」はトグル式のメニュー項目。モデル項目と違い
    // data-test-id="bard-mode-option-*" を持たないことで言語非依存に識別できる。
    // ON状態は .selected クラスで判定。
    async function setExtendedThinking() {
        await openModeMenu();
        const toggle = getVisibleMenuItems().find(el =>
            !(el.getAttribute('data-test-id') ?? '').startsWith('bard-mode-option'));
        if (!toggle) throw new Error('強化版思考モード項目なし');
        if (toggle.classList.contains('selected') === wantExtended) {
            await closeModeMenu();
            return;
        }
        toggle.click();
        await sleep(400);
    }

    async function autoSubmit() {
        // モデル/思考モード選択は失敗しても送信は続行（UI未対応環境向けフェイルソフト）
        await selectModel().catch(() => {});
        await setExtendedThinking().catch(() => {});

        const inputEl = await waitFor('rich-textarea .ql-editor[contenteditable="true"]');
        insertText(inputEl, query);

        sessionStorage.setItem(storageKey, '1');

        // submit=0 のときは入力のみで終了（ユーザーが自分で編集・送信する用途）
        if (!shouldSubmit) return;

        // 送信ボタンは入力が反映されて初めてDOMに現れるため、待機がそのまま入力完了待ちを兼ねる
        const sendBtn = await waitFor('gem-icon-button.send-button button',
            { predicate: el => !el.disabled, timeout: 5000, interval: 100 });
        sendBtn.click();
    }

    autoSubmit();
})();
