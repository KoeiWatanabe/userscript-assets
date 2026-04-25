// ==UserScript==
// @name         Geminiに自動送信する
// @namespace    http://tampermonkey.net/
// @version      2.2.2
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
    const MODE_PARAM = 'mode';
    const SUBMIT_PARAM = 'submit';
    const DEFAULT_MODE = 'fast';
    const INPUT_DELAY_MS = 1000;
    const MAX_WAIT_MS = 15000;

    // 一次=data-test-id（言語非依存） / フォールバック=UI言語別テキスト照合
    const MODE_MAP = {
        think: { testId: 'bard-mode-option-thinking', texts: ['思考モード', 'Thinking'] },
        fast:  { testId: 'bard-mode-option-fast',     texts: ['高速モード', 'Fast'] },
        pro:   { testId: 'bard-mode-option-pro',      texts: ['Pro'] },
    };

    // 一次=data-test-id / 二次=日本語UI / 三次=英語UI
    const MODE_BUTTON_SELECTORS = [
        'button[data-test-id="bard-mode-menu-button"]',
        'button[aria-label="モード選択ツールを開く"]',
        'button[aria-label="Open mode picker"]',
    ];

    const params = new URLSearchParams(window.location.search);
    const query = params.get(PARAM_NAME);
    if (!query) return;
    const modeKey = params.get(MODE_PARAM) ?? DEFAULT_MODE;
    const submitRaw = params.get(SUBMIT_PARAM);
    const shouldSubmit = !(submitRaw === '0' || submitRaw === 'false');

    const storageKey = 'gemini-auto-submit:' + btoa(encodeURIComponent(query)).slice(0, 32);
    if (sessionStorage.getItem(storageKey)) return;

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

    async function selectMode({ testId, texts }) {
        // 無料会員など一部UIではモードボタンが存在しないため短めのタイムアウトで失敗させる
        const modeBtn = await waitFor(MODE_BUTTON_SELECTORS, { timeout: 3000 });

        // 軽量判定: ボタン表示テキストに現在モード名が含まれていれば既選択
        if (texts.some(t => modeBtn.textContent.includes(t))) return;

        modeBtn.click();
        await waitFor(['.mat-mdc-menu-item'], { timeout: 3000 });
        await new Promise(r => setTimeout(r, 200)); // Angular アニメーション待ち

        let target = document.querySelector(`[data-test-id="${testId}"]`);
        if (!target) {
            target = [...document.querySelectorAll('.mat-mdc-menu-item')]
                .find(el => texts.some(t => el.textContent.includes(t)));
        }
        if (!target) throw new Error(`モード項目なし: ${testId}`);

        // ボタンテキスト判定で漏れた既選択ケースの保険（data-test-id ヒット時）
        if (target.getAttribute('aria-current') === 'true') {
            document.body.click();
            await new Promise(r => setTimeout(r, 300));
            return;
        }

        target.click();
        await new Promise(r => setTimeout(r, 400));
    }

    async function autoSubmit() {
        // モード選択は失敗しても送信は続行（UI未対応環境向けフェイルソフト）
        if (MODE_MAP[modeKey]) {
            await selectMode(MODE_MAP[modeKey]).catch(() => {});
        }

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
