// ==UserScript==
// @name         Geminiに自動送信する
// @namespace    http://tampermonkey.net/
// @version      1.3.4
// @description  URLクエリパラメータ ?q= の内容をGeminiのチャットに自動入力して送信する
// @author       You
// @match        https://gemini.google.com/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Geminiに自動送信する/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Geminiに自動送信する/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Geminiに自動送信する/icon_128.png
// ==/UserScript==

(function () {
    'use strict';

    // --- 設定 ---
    const PARAM_NAME = 'q';         // 使用するURLパラメータ名
    const MODE_PARAM = 'mode';      // モード指定パラメータ名（think / fast / pro）
    const DEFAULT_MODE = 'fast';    // デフォルトモード（URLに ?mode= がない場合に使用）
    const INPUT_DELAY_MS = 1000;     // 入力後、送信ボタンを押すまでの待機時間(ms)
    const MAX_WAIT_MS = 15000;    // 要素を待つ最大時間(ms)

    // モード名とメニュー内テキストのマッピング（日本語UI・英語UI両対応 実機確認済み 2026-04-19）
    // 英語UI（無料会員で確認）: Fast / Thinking / Pro、日本語UI: 高速モード / 思考モード / Pro
    const MODE_TEXT_MAP = {
        think: ['思考モード', 'Thinking'],  // ?mode=think
        fast: ['高速モード', 'Fast'],        // ?mode=fast
        pro: ['Pro'],                        // ?mode=pro
    };

    // モード切替ボタンのセレクタ（日本語UI・英語UI両対応）
    const MODE_BUTTON_SELECTORS = [
        'button[aria-label="モード選択ツールを開く"]', // 日本語UI
        'button[aria-label="Open mode picker"]',      // 英語UI（無料会員で確認 2026-04-19）
    ];

    // --- メイン処理 ---

    const params = new URLSearchParams(window.location.search);
    const query = params.get(PARAM_NAME);
    if (!query) return;

    const modeKey = params.get(MODE_PARAM) ?? DEFAULT_MODE; // 'think' | 'fast' | 'pro'

    // セッション内で同じクエリを二重送信しないためのガード
    const storageKey = 'gemini-auto-submit:' + btoa(encodeURIComponent(query)).slice(0, 32);
    if (sessionStorage.getItem(storageKey)) return;

    // --- ユーティリティ ---

    /**
     * CSSセレクタのいずれかにマッチする要素が見つかるまで待機する
     * @param {string[]} selectors
     * @param {number} timeout
     * @returns {Promise<Element>}
     */
    function waitForElement(selectors, timeout = MAX_WAIT_MS) {
        return new Promise((resolve, reject) => {
            const deadline = Date.now() + timeout;
            const check = () => {
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) { resolve(el); return; }
                }
                if (Date.now() >= deadline) {
                    reject(new Error(`要素が見つかりませんでした: ${selectors.join(', ')}`));
                    return;
                }
                setTimeout(check, 200);
            };
            check();
        });
    }

    /**
     * contenteditable要素にテキストを挿入する
     * execCommand は非推奨だが現状のブラウザでは最も確実に動作する
     * @param {Element} el
     * @param {string} text
     */
    function insertTextIntoContentEditable(el, text) {
        el.focus();

        // 既存テキストをクリア
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);

        // テキストを挿入（inputイベントを伴う）
        document.execCommand('insertText', false, text);

        // execCommand が効かない環境向けのフォールバック
        if (el.textContent.trim() !== text.trim()) {
            el.textContent = text;
            el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: text }));
        }
    }

    /**
     * 送信ボタンが有効になるまで待ってクリックする
     * @param {string[]} selectors
     * @param {number} timeout
     * @returns {Promise<void>}
     */
    function waitAndClickSend(selectors, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const deadline = Date.now() + timeout;
            const check = () => {
                for (const sel of selectors) {
                    const btn = document.querySelector(sel);
                    if (btn && !btn.disabled && !btn.hasAttribute('disabled')) {
                        btn.click();
                        resolve();
                        return;
                    }
                }
                if (Date.now() >= deadline) {
                    reject(new Error('送信ボタンが見つからないか、無効状態です'));
                    return;
                }
                setTimeout(check, 100);
            };
            check();
        });
    }

    // --- モード選択 ---

    /**
     * モード切替ボタンを開き、指定モードのメニュー項目をクリックする
     * @param {string[]} targetTexts  候補テキスト配列（日本語・英語UIの両方を含む）
     */
    async function selectMode(targetTexts) {
        console.log(`[Gemini Auto Submit] モードを選択します: ${targetTexts.join(' / ')}`);

        // モード切替ボタンを探す（短めのタイムアウトでフェイルソフト）
        // 無料会員など一部UIではモードボタンが存在しない／UI言語でaria-labelが異なるため、
        // 見つからなければスキップしてテキスト挿入に進む
        const modeBtn = await waitForElement(MODE_BUTTON_SELECTORS, 3000);

        // 既に選択済みなら何もしない
        if (targetTexts.some(t => modeBtn.textContent.includes(t))) {
            console.log('[Gemini Auto Submit] 既に選択中のモードです。スキップします。');
            return;
        }

        modeBtn.click();

        // メニュー項目が現れるまで待機（実機確認済み: .mat-mdc-menu-item 2026-03-07）
        await waitForElement(['.mat-mdc-menu-item'], 3000);
        await new Promise(r => setTimeout(r, 200)); // Angular アニメーション待ち

        const items = document.querySelectorAll('.mat-mdc-menu-item');
        const target = [...items].find(el => targetTexts.some(t => el.textContent.includes(t)));

        if (!target) {
            throw new Error(`モード項目が見つかりませんでした: ${targetTexts.join(' / ')}`);
        }

        target.click();
        console.log(`[Gemini Auto Submit] モード選択完了: ${target.textContent.trim()}`);

        // メニューが閉じるのを待つ
        await new Promise(r => setTimeout(r, 400));
    }

    // --- 自動送信処理 ---

    async function autoSubmit() {
        try {
            // モード指定があれば先に切り替える
            // モード選択はベストエフォート: 失敗してもテキスト挿入・送信は続行する
            // （無料会員や一部UI言語ではモードボタンが存在しない・セレクタが一致しないケースがある）
            if (modeKey && MODE_TEXT_MAP[modeKey]) {
                try {
                    await selectMode(MODE_TEXT_MAP[modeKey]);
                } catch (modeErr) {
                    console.warn('[Gemini Auto Submit] モード選択をスキップします:', modeErr.message);
                }
            }

            // Geminiの入力欄セレクタ（実機確認済み 2026-03-02）
            const inputSelectors = [
                'rich-textarea .ql-editor[contenteditable="true"]', // 最優先・最も具体的
                'div.ql-editor[contenteditable="true"]',            // フォールバック
                'div[contenteditable="true"][data-placeholder]',    // フォールバック
            ];

            // 送信ボタンのセレクタ（日本語UI・英語UI両対応 実機確認済み）
            const sendSelectors = [
                'button[aria-label="プロンプトを送信"]', // 日本語UI
                'button[aria-label="Send prompt"]',      // 英語UI
                'button[aria-label="Send message"]',     // 英語UI別バリアント
                'button.send-button',                    // クラス名フォールバック（無料会員でも存在確認済み 2026-04-19）
            ];

            console.log('[Gemini Auto Submit] 入力欄を待機中...');
            const inputEl = await waitForElement(inputSelectors);

            console.log('[Gemini Auto Submit] テキストを挿入します:', query);
            insertTextIntoContentEditable(inputEl, query);

            console.log(`[Gemini Auto Submit] ${INPUT_DELAY_MS}ms 待機後に送信します`);
            await new Promise(r => setTimeout(r, INPUT_DELAY_MS));

            await waitAndClickSend(sendSelectors);

            console.log('[Gemini Auto Submit] 送信完了');
            sessionStorage.setItem(storageKey, '1');

        } catch (err) {
            console.error('[Gemini Auto Submit] エラー:', err.message);
        }
    }

    // DOMContentLoaded を待つ（既に完了している場合は即実行）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoSubmit);
    } else {
        autoSubmit();
    }

})();
