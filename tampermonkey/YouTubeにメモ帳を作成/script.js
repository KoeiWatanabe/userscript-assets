// ==UserScript==
// @name         YouTubeにメモ帳を作成する
// @namespace    http://tampermonkey.net/
// @version      8.6
// @description  自分専用のMarkdown対応タイムスタンプメモ（OSテーマ追従）+ GeminiWebタイムスタンプ生成
// @match        *://*.youtube.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @require      https://cdn.jsdelivr.net/npm/marked/marked.min.js
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeにメモ帳を作成/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeにメモ帳を作成/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeにメモ帳を作成/icon.svg
// ==/UserScript==

(function() {
    'use strict';

    GM_registerMenuCommand('GAS URLを再設定', () => {
        const current = GM_getValue('GAS_URL', '');
        const input = prompt(
            'Google Apps Script のデプロイURLを入力してください:\n' +
            '（現在の値: ' + (current || '未設定') + '）'
        );
        if (input === null) return;
        if (input.trim().startsWith('https://script.google.com/')) {
            GM_setValue('GAS_URL', input.trim());
            alert('GAS URLを更新しました。');
        } else if (input.trim() === '') {
            GM_setValue('GAS_URL', '');
            alert('GAS URLをクリアしました。');
        } else {
            alert('無効なURLです。https://script.google.com/ で始まるURLを入力してください。');
        }
    });

    // =====================================================
    //  ★ プリセットサイズ設定（ここを書き換えて調整）
    // =====================================================
    const PRESET_MIN = { w: 0.20, h: 0.40 };
    const PRESET_MAX = { w: 0.30, h: 0.65 };

    marked.setOptions({
        breaks: true,
        gfm: true
    });

    const _html =
        typeof trustedTypes !== 'undefined' && trustedTypes.createPolicy
            ? trustedTypes.createPolicy('yt-note-policy', {
                  createHTML: s => s
              })
            : { createHTML: s => s };

    const container = document.createElement('div');
    container.id = 'custom-yt-note-container';

    // =====================================================
    //  CSS（カスタムプロパティでテーマ管理）
    // =====================================================

    const style = document.createElement('style');
    style.textContent = `
        #custom-yt-note-container {
            position: fixed;
            bottom: 30px;
            right: 0;
            z-index: 9999;
            font-family: 'Roboto', 'Segoe UI', Arial, sans-serif;
            pointer-events: none;

            --panel-bg: rgba(30, 30, 30, 0.95);
            --panel-border: #444;
            --panel-text: #fff;
            --btn-bg: #444;
            --btn-hover: #555;
            --btn-text: white;
            --trim-bg: #555;
            --trim-hover: #666;
            --input-bg: #000;
            --input-text: #ccc;
            --input-border: #555;
            --view-bg: #111;
            --h1-color: #fff;
            --h2-color: #eee;
            --h3-color: #ddd;
            --del-color: #888;
            --bq-border: #555;
            --bq-text: #aaa;
            --bq-bg: rgba(255, 255, 255, 0.05);
            --code-bg: #333;
            --code-color: #ffb74d;
            --pre-bg: #000;
            --pre-border: #333;
            --pre-code-color: #a5d6ff;
            --th-bg: #222;
            --hr-border: #555;
        }

        #custom-yt-note-container * {
            color-scheme: only dark;
        }

        @media (prefers-color-scheme: light) {
            #custom-yt-note-container {
                --panel-bg: rgba(255, 255, 255, 0.98);
                --panel-border: #ddd;
                --panel-text: #111;
                --btn-bg: #eee;
                --btn-hover: #e0e0e0;
                --btn-text: #111;
                --trim-bg: #eee;
                --trim-hover: #e0e0e0;
                --input-bg: #fff;
                --input-text: #111;
                --input-border: #ccc;
                --view-bg: #fff;
                --h1-color: #111;
                --h2-color: #222;
                --h3-color: #333;
                --del-color: #777;
                --bq-border: #ddd;
                --bq-text: #555;
                --bq-bg: #f6f6f6;
                --code-bg: #f0f0f0;
                --code-color: #b45309;
                --pre-bg: #f6f8fa;
                --pre-border: #ddd;
                --pre-code-color: #0550ae;
                --th-bg: #f0f0f0;
                --hr-border: #ddd;
            }
            #custom-yt-note-container * {
                color-scheme: only light;
            }
        }

        #yt-note-tab-wrap {
            overflow: hidden;
            width: 44px;
            pointer-events: auto;
            filter: drop-shadow(-3px 2px 8px rgba(0, 0, 0, 0.30));
            transition: filter 0.25s;
        }

        #yt-note-tab-wrap:hover,
        #yt-note-tab-wrap.is-open {
            filter: drop-shadow(-5px 3px 14px rgba(0, 0, 0, 0.45));
        }

        #yt-note-toggle {
            background-color: #3a3a3a;
            color: white;
            border: none;
            border-radius: 8px 0 0 8px;
            width: 44px;
            height: 72px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transform: translateX(14px);
            transition:
                transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                background-color 0.2s;
        }

        #yt-note-tab-wrap:hover #yt-note-toggle {
            transform: translateX(0);
            background-color: #4e4e4e;
        }

        #yt-note-toggle.is-open {
            background-color: #4e4e4e;
        }

        #yt-note-toggle svg {
            flex-shrink: 0;
        }

        #yt-note-panel {
            display: none;
            position: fixed;
            pointer-events: auto;
            background: var(--panel-bg);
            border: 1px solid var(--panel-border);
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
            color: var(--panel-text);
            box-sizing: border-box;
            flex-direction: column;
            left: 0;
            top: 0;
            will-change: transform;
            contain: layout style paint;
            backface-visibility: hidden;
            transform: translate3d(0, 0, 0);
        }

        .yt-rz {
            position: absolute;
            z-index: 10;
            transition: background 0.1s;
            touch-action: none;
            user-select: none;
        }

        .yt-rz:hover,
        .yt-rz.dragging {
            background: rgba(255, 255, 255, 0.10);
        }

        #yt-rz-n, #yt-rz-s { left: 18px; right: 18px; height: 8px; cursor: ns-resize; }
        #yt-rz-w, #yt-rz-e { top: 18px; bottom: 18px; width: 8px; cursor: ew-resize; }
        #yt-rz-nw, #yt-rz-ne, #yt-rz-sw, #yt-rz-se { width: 18px; height: 18px; z-index: 11; }
        #yt-rz-n  { top: 0;    border-radius: 8px 8px 0 0; }
        #yt-rz-s  { bottom: 0; border-radius: 0 0 8px 8px; }
        #yt-rz-w  { left: 0;   border-radius: 8px 0 0 8px; }
        #yt-rz-e  { right: 0;  border-radius: 0 8px 8px 0; }
        #yt-rz-nw { top: 0; left: 0;     cursor: nwse-resize; border-radius: 8px 0 0 0; }
        #yt-rz-ne { top: 0; right: 0;    cursor: nesw-resize; border-radius: 0 8px 0 0; }
        #yt-rz-sw { bottom: 0; left: 0;  cursor: nesw-resize; border-radius: 0 0 0 8px; }
        #yt-rz-se { bottom: 0; right: 0; cursor: nwse-resize; border-radius: 0 0 8px 0; }

        #yt-note-panel.is-dragging #yt-note-textarea,
        #yt-note-panel.is-dragging #yt-note-view {
            pointer-events: none;
        }

        #yt-note-panel.is-dragging {
            transition: none !important;
        }

        #yt-note-move-handle {
            cursor: move;
            user-select: none;
            touch-action: none;
            flex: 1;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        #yt-note-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            font-size: 14px;
            font-weight: bold;
            flex-shrink: 0;
        }

        #yt-note-header-btns {
            display: flex;
            gap: 6px;
            align-items: center;
        }

        .yt-icon-btn {
            border: none;
            border-radius: 4px;
            cursor: pointer;
            width: 28px;
            height: 28px;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .yt-icon-btn-plain {
            border: none;
            background: none;
            cursor: pointer;
            width: 22px;
            height: 22px;
            padding: 2px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            opacity: 0.6;
            transition: opacity 0.15s;
        }

        .yt-icon-btn-plain:hover {
            opacity: 1;
        }

        #yt-note-mode-btn,
        #yt-note-trim-btn {
            color: var(--btn-text);
        }

        #yt-note-mode-btn {
            background: var(--btn-bg);
        }

        #yt-note-mode-btn:hover {
            background: var(--btn-hover);
        }

        #yt-note-trim-btn {
            background: var(--trim-bg);
        }

        #yt-note-trim-btn:hover {
            background: var(--trim-hover);
        }

        #yt-note-gemini-wrap {
            display: flex;
            align-items: stretch;
            background: #1869d4;
            border-radius: 4px;
            overflow: hidden;
            height: 28px;
            flex-shrink: 0;
        }

        #yt-note-gemini-btn,
        #yt-note-gemini-mode-btn {
            background: transparent;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            transition: background 0.15s;
        }

        #yt-note-gemini-btn {
            padding: 0;
            width: 28px;
            flex-shrink: 0;
        }

        #yt-note-gemini-btn:hover,
        #yt-note-gemini-mode-btn:hover {
            background: rgba(0, 0, 0, 0.18);
        }

        #yt-note-gemini-mode-btn {
            padding: 0 5px;
        }

        #yt-note-textarea {
            width: 100%;
            flex: 1;
            min-height: 0;
            background: var(--input-bg);
            color: var(--input-text);
            border: 1px solid var(--input-border);
            border-radius: 4px;
            padding: 10px;
            box-sizing: border-box;
            resize: none;
            font-size: 13px;
            line-height: 1.5;
            font-family: monospace;
            overscroll-behavior: contain;
        }

        #yt-note-view {
            width: 100%;
            flex: 1;
            min-height: 0;
            background: var(--view-bg);
            border: 1px solid var(--input-border);
            border-radius: 4px;
            padding: 10px;
            box-sizing: border-box;
            overflow-y: auto;
            font-size: 13px;
            line-height: 1.6;
            display: none;
            overscroll-behavior: contain;
        }

        #yt-note-view h1 {
            font-size: 18px;
            border-bottom: 1px solid var(--hr-border);
            padding-bottom: 5px;
            margin: 10px 0;
            color: var(--h1-color);
        }

        #yt-note-view h2 {
            font-size: 16px;
            margin: 10px 0;
            color: var(--h2-color);
        }

        #yt-note-view h3 {
            font-size: 14px;
            margin: 8px 0;
            color: var(--h3-color);
        }

        #yt-note-view p {
            margin: 0 0 10px 0;
        }

        #yt-note-view ul,
        #yt-note-view ol {
            margin: 0 0 10px 20px;
            padding: 0;
        }

        #yt-note-view li {
            margin-bottom: 4px;
        }

        #yt-note-view strong {
            color: #648c50;
        }

        #yt-note-view em {
            color: #81d4fa;
            font-style: italic;
        }

        #yt-note-view del {
            color: var(--del-color);
        }

        #yt-note-view blockquote {
            border-left: 4px solid var(--bq-border);
            padding-left: 10px;
            color: var(--bq-text);
            margin: 5px 0 10px 0;
            background: var(--bq-bg);
        }

        #yt-note-view code {
            background: var(--code-bg);
            padding: 2px 4px;
            border-radius: 3px;
            font-family: monospace;
            color: var(--code-color);
        }

        #yt-note-view pre {
            background: var(--pre-bg);
            padding: 10px;
            border-radius: 5px;
            overflow-x: auto;
            border: 1px solid var(--pre-border);
            margin: 0 0 10px 0;
        }

        #yt-note-view pre code {
            background: none;
            padding: 0;
            color: var(--pre-code-color);
            border: none;
        }

        #yt-note-view table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 10px;
            font-size: 12px;
        }

        #yt-note-view th,
        #yt-note-view td {
            border: 1px solid var(--panel-border);
            padding: 6px;
            text-align: left;
        }

        #yt-note-view th {
            background: var(--th-bg);
        }

        #yt-note-view img {
            max-width: 100%;
            height: auto;
            border-radius: 4px;
        }

        #yt-note-view a {
            color: #065fd4;
            text-decoration: none;
        }

        #yt-note-view a:hover {
            text-decoration: underline;
        }

        #yt-note-view hr {
            border: none;
            border-top: 1px solid var(--hr-border);
            margin: 12px 0;
        }

        .yt-timestamp-link {
            color: #065fd4 !important;
            font-weight: bold;
            cursor: pointer;
            text-decoration: none;
        }

        .yt-timestamp-link:hover {
            text-decoration: underline;
        }

        #yt-note-ts-btn {
            position: absolute;
            right: 30px;
            bottom: 30px;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: none;
            background: var(--btn-bg);
            color: var(--btn-text);
            cursor: pointer;
            display: none;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
            z-index: 5;
            transition: background 0.15s, transform 0.1s;
        }

        #yt-note-ts-btn:hover {
            background: var(--btn-hover);
        }

        #yt-note-ts-btn:active {
            transform: scale(0.92);
        }

        #yt-note-panel.is-dragging #yt-note-ts-btn {
            pointer-events: none;
        }
    `;
    document.head.appendChild(style);

    // =====================================================
    //  HTML テンプレート
    // =====================================================

    container.innerHTML = _html.createHTML(`
        <div id="yt-note-panel" data-darkreader-ignore>
            <div id="yt-rz-n"  class="yt-rz"></div>
            <div id="yt-rz-s"  class="yt-rz"></div>
            <div id="yt-rz-w"  class="yt-rz"></div>
            <div id="yt-rz-e"  class="yt-rz"></div>
            <div id="yt-rz-nw" class="yt-rz"></div>
            <div id="yt-rz-ne" class="yt-rz"></div>
            <div id="yt-rz-sw" class="yt-rz"></div>
            <div id="yt-rz-se" class="yt-rz"></div>
            <div id="yt-note-header">
                <div id="yt-note-move-handle">
                    <span>📝 メモ帳</span>
                    <button id="yt-note-size-toggle-btn" class="yt-icon-btn-plain" title="拡大"></button>
                </div>
                <div id="yt-note-header-btns">
                    <div id="yt-note-gemini-wrap">
                        <button id="yt-note-gemini-btn" title="タイムスタンプを作成（見出しあり）"></button>
                        <svg id="yt-gemini-divider" width="1" height="16" viewBox="0 0 1 16" style="align-self:center;flex-shrink:0;">
                            <rect width="1" height="16" fill="rgba(255,255,255,0.35)"/>
                        </svg>
                        <button id="yt-note-gemini-mode-btn" title="見出しなしに切り替え">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="12" height="12" fill="currentColor">
                                <path d="M480-360 280-560h400L480-360Z"/>
                            </svg>
                        </button>
                    </div>
                    <button id="yt-note-trim-btn" class="yt-icon-btn" title="不要な部分をカット">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="18" height="18" fill="currentColor">
                            <path d="M744-144 480-407l-87 88q8 16 11.5 33t3.5 34q0 65-45 110.5T252-96q-64 0-110-45.5T96-252q0-65 45.5-110.5T252-408q17 0 34 4t33 12l88-87-88-88q-16 8-33 11.5t-34 3.5q-65 0-110.5-45.5T96-708q0-65 45.5-110.5T252-864q65 0 110.5 45.5T408-708q0 17-3.5 34T393-641l471 469v28H744ZM595-520l-74-74 223-222h120v28L595-520ZM311.5-648.5Q336-673 336-708t-24.5-59.5Q287-792 252-792t-59.5 24.5Q168-743 168-708t24.5 59.5Q217-624 252-624t59.5-24.5ZM497-463q7-7 7-17t-7-17q-7-7-17-7t-17 7q-7 7-7 17t7 17q7 7 17 7t17-7ZM311.5-192.5Q336-217 336-252t-24.5-59.5Q287-336 252-336t-59.5 24.5Q168-287 168-252t24.5 59.5Q217-168 252-168t59.5-24.5Z"/>
                        </svg>
                    </button>
                    <button id="yt-note-mode-btn" class="yt-icon-btn" title="Viewモードに切り替え"></button>
                </div>
            </div>
            <textarea id="yt-note-textarea" placeholder="# 見出し&#10;- 箇条書き&#10;1:23 タイムスタンプ"></textarea>
            <div id="yt-note-view"></div>
            <button id="yt-note-ts-btn" title="現在の再生位置のタイムスタンプを挿入"></button>
        </div>
        <div id="yt-note-tab-wrap">
            <button id="yt-note-toggle" title="メモ帳を開く">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="22" height="22" fill="currentColor">
                    <path d="M160-400v-80h280v80H160Zm0-160v-80h440v80H160Zm0-160v-80h440v80H160Zm360 560v-123l221-220q9-9 20-13t22-4q12 0 23 4.5t20 13.5l37 37q8 9 12.5 20t4.5 22q0 11-4 22.5T863-380L643-160H520Zm300-263-37-37 37 37ZM580-220h38l121-122-18-19-19-18-122 121v38Zm141-141-19-18 37 37-18-19Z"/>
                </svg>
            </button>
        </div>
    `);

    document.body.appendChild(container);

    // =====================================================
    //  DOM参照
    // =====================================================

    const toggleBtn = document.getElementById('yt-note-toggle');
    const tabWrap = document.getElementById('yt-note-tab-wrap');
    const panel = document.getElementById('yt-note-panel');
    const modeBtn = document.getElementById('yt-note-mode-btn');
    const textarea = document.getElementById('yt-note-textarea');
    const viewArea = document.getElementById('yt-note-view');
    const geminiBtn = document.getElementById('yt-note-gemini-btn');
    const geminiModeBtn = document.getElementById('yt-note-gemini-mode-btn');
    const trimBtn = document.getElementById('yt-note-trim-btn');
    const sizeToggleBtn = document.getElementById('yt-note-size-toggle-btn');
    const tsBtn = document.getElementById('yt-note-ts-btn');

    // =====================================================
    //  State + ユーティリティ
    // =====================================================

    const state = {
        videoId: '',
        isOpen: false,
        isEditMode: true,
        panelSizeInitialized: false,
        sizeIsMax: true,
        geminiStructured: true,
        panelRect: { left: 0, top: 0, width: 0, height: 0 },
    };

    function debounce(fn, ms) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), ms);
        };
    }

    function getGasUrl() {
        return GM_getValue('GAS_URL', '');
    }

    function ensureGasUrl() {
        if (getGasUrl()) return;
        const input = prompt(
            '【初回設定】Google Apps Script のデプロイURLを入力してください:\n' +
            '（例: https://script.google.com/macros/s/xxxxx/exec）'
        );
        if (input && input.trim().startsWith('https://script.google.com/')) {
            GM_setValue('GAS_URL', input.trim());
        } else {
            alert('有効なGAS URLが入力されませんでした。メモの保存・読込機能は無効です。\nページを再読込すると再入力できます。');
        }
    }

    function setPanelOpen(open) {
        state.isOpen = open;
        panel.style.display = open ? 'flex' : 'none';
        toggleBtn.classList.toggle('is-open', open);
        tabWrap.classList.toggle('is-open', open);
        toggleBtn.title = open ? 'メモ帳を閉じる' : 'メモ帳を開く';
    }

    // =====================================================
    //  SVGアイコン ヘルパー
    // =====================================================

    const svgIcon = (d, size = 18) =>
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" ` +
        `width="${size}" height="${size}" fill="currentColor"><path d="${d}"/></svg>`;

    const ICON_VIEW = svgIcon('M264-288q47.35 0 92.17 12Q401-264 444-246v-454q-42-22-87-33t-93.22-11q-36.94 0-73.36 6.5T120-716v452q35-13 70.81-18.5Q226.63-288 264-288Zm252 42q43-20 87.83-31 44.82-11 92.17-11 37 0 73.5 4.5T840-264v-452q-35-13-71.19-20.5t-72.89-7.5Q648-744 603-733t-87 33v454Zm-36 102q-49-32-103-52t-113-20q-38 0-76 7.5T115-186q-24 10-45.5-3.53T48-229v-503q0-14 7.5-26T76-776q45-20 92.04-30 47.04-10 95.96-10 56.95 0 111.44 13.5Q429.93-789 480-762q51-26 105.19-40 54.18-14 110.81-14 48.92 0 95.96 10Q839-796 884-776q13 6 21 18t8 26v503q0 25-15.5 40t-32.5 7q-40-18-82.48-26-42.47-8-86.52-8-59 0-113 20t-103 52ZM283-495Z');
    const ICON_EDIT = svgIcon('M96 0v-192h768V0H96Zm168-360h51l279-279-26-27-25-24-279 279v51Zm-72 72v-152.92L594-843q11-11 23.84-16 12.83-5 27-5 14.16 0 27.16 5t24.1 15.94L747-792q11 11 16 24t5 27.4q0 13.49-4.95 26.54-4.95 13.05-15.75 23.85L345-288H192Zm503-455-51-49 51 49ZM594-639l-26-27-25-24 51 51Z');
    const ICON_SIZE_MAX = svgIcon('M240-240v-240h72v168h168v72H240Zm408-240v-168H480v-72h240v240h-72Z');
    const ICON_SIZE_MIN = svgIcon('M432-432v240h-72v-168H192v-72h240Zm168-336v168h168v72H528v-240h72Z');
    const ICON_GEMINI_SIMPLE = svgIcon('M480-80q0-83-31.5-156T363-363q-54-54-127-85.5T80-480q83 0 156-31.5T363-597q54-54 85.5-127T480-880q0 83 31.5 156T597-597q54 54 127 85.5T880-480q-83 0-156 31.5T597-363q-54 54-85.5 127T480-80Z', 22);
    const ICON_GEMINI_STRUCTURED = '<img id="yt-gemini-icon" src="https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg" width="16" height="16" alt="Gemini">';
    const ICON_TIMESTAMP = svgIcon('M301-170.5q-61-26.5-106.5-72t-72-106.5Q96-410 96-480t26.5-131q26.5-61 72-106.5t106.5-72Q362-816 432-816q12 0 24 1t24 3v73q-11-2-23.5-3.5T432-744q-109 0-186.5 77.5T168-480q0 109 77.5 186.5T432-216q109 0 186.5-77.5T696-480q0-12-1.5-24.5T691-528h73q2 12 3 24t1 24q0 70-26.5 131t-72 106.5Q624-197 563-170.5T432-144q-70 0-131-26.5ZM545-313 396-462v-210h72v180l128 128-51 51Zm139-311v-108H576v-72h108v-108h72v108h108v72H756v108h-72Z', 22);

    // =====================================================
    //  モード管理
    // =====================================================

    function setMode(edit) {
        state.isEditMode = edit;
        textarea.style.display = edit ? 'block' : 'none';
        viewArea.style.display = edit ? 'none' : 'block';
        tsBtn.style.display = edit ? 'flex' : 'none';
        modeBtn.innerHTML = _html.createHTML(edit ? ICON_VIEW : ICON_EDIT);
        modeBtn.title = edit ? 'Viewモードに切り替え' : 'Editモードに切り替え';
        if (!edit) renderView();
    }

    // =====================================================
    //  イベントリスナー
    // =====================================================

    toggleBtn.addEventListener('click', e => {
        e.stopPropagation();

        if (!state.isOpen && !state.panelSizeInitialized) {
            applyPresetSize(PRESET_MAX);
            const r = state.panelRect;
            applyPanelRect(window.innerWidth - r.width - 54, window.innerHeight - r.height - 30, r.width, r.height);
            state.panelSizeInitialized = true;
        }

        setPanelOpen(!state.isOpen);
    });

    document.addEventListener('keydown', e => {
        if (e.altKey && (e.key === 'm' || e.key === 'M')) {
            e.preventDefault();
            toggleBtn.click();
        }
    });

    panel.addEventListener('click', e => {
        e.stopPropagation();
    });

    document.addEventListener('click', () => {
        if (state.isOpen) setPanelOpen(false);
    });

    panel.addEventListener(
        'wheel',
        e => {
            e.stopPropagation();
            const scrollTarget = e.target.closest(
                '#yt-note-textarea, #yt-note-view'
            );
            if (!scrollTarget) {
                e.preventDefault();
            }
        },
        { passive: false }
    );

    modeBtn.addEventListener('click', () => {
        if (state.isEditMode) {
            saveToLocal();
            saveToRemote();
        }
        setMode(!state.isEditMode);
    });

    textarea.addEventListener('input', onTextInput);

    viewArea.addEventListener('click', e => {
        const tsLink = e.target.closest('.yt-timestamp-link');
        if (tsLink) {
            e.preventDefault();
            seekVideo(tsLink.dataset.time);
        }
    });

    tsBtn.innerHTML = _html.createHTML(ICON_TIMESTAMP);

    function formatVideoTimestamp(seconds) {
        const t = Math.max(0, Math.floor(seconds));
        const h = Math.floor(t / 3600);
        const m = Math.floor((t % 3600) / 60);
        const s = t % 60;
        const ss = String(s).padStart(2, '0');
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
        return `${m}:${ss}`;
    }

    tsBtn.addEventListener('click', e => {
        e.stopPropagation();
        const video = document.querySelector('video');
        if (!video) return;
        const ts = `${formatVideoTimestamp(video.currentTime)} `;
        const current = textarea.value;
        const prefix = current.length === 0 || current.endsWith('\n') ? '' : '\n';
        textarea.value = current + prefix + ts;
        const caret = textarea.value.length;
        textarea.focus();
        textarea.setSelectionRange(caret, caret);
        textarea.scrollTop = textarea.scrollHeight;
        onTextInput();
    });

    // =====================================================
    //  レンダリング・シーク
    // =====================================================

    function renderView() {
        const html = marked.parse(textarea.value).replace(
            /(?:[0-5]?[0-9]:)?[0-5]?[0-9]:[0-5][0-9]/g,
            m => `<a class="yt-timestamp-link" data-time="${m}">${m}</a>`
        );

        viewArea.innerHTML = _html.createHTML(html);

        viewArea.querySelectorAll('a[href]').forEach(link => {
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
        });
    }

    function seekVideo(timeStr) {
        const video = document.querySelector('video');
        if (!video) return;
        video.currentTime = timeStr.split(':').reverse()
            .reduce((s, p, i) => s + parseInt(p, 10) * 60 ** i, 0);
        video.play();
    }

    const getVideoId = () => {
        const v = new URLSearchParams(location.search).get('v');
        if (v) return v;
        const m = location.pathname.match(/^\/live\/([^/?#]+)/);
        return m ? m[1] : null;
    };

    // =====================================================
    //  永続化
    // =====================================================

    let lastSavedContent = '';

    function saveToLocal() {
        if (!state.videoId) return;
        localStorage.setItem(`yt_note_${state.videoId}`, textarea.value);
    }

    function saveToRemote() {
        if (!state.videoId) return;
        const gasUrl = getGasUrl();
        if (!gasUrl) return;
        const content = textarea.value;
        if (content === lastSavedContent) return;
        lastSavedContent = content;
        GM_xmlhttpRequest({
            method: 'POST',
            url: gasUrl,
            data: JSON.stringify({
                videoId: state.videoId,
                content: content
            }),
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const debouncedLocalSave = debounce(saveToLocal, 300);
    const debouncedRemoteSave = debounce(saveToRemote, 3000);

    function onTextInput() {
        debouncedLocalSave();
        debouncedRemoteSave();
    }

    function loadNote() {
        if (!document.body.contains(container)) document.body.appendChild(container);

        const newVideoId = getVideoId();

        if (!newVideoId) {
            setPanelOpen(false);
            toggleBtn.style.display = 'none';
            state.videoId = '';
            return;
        }

        if (newVideoId === state.videoId) return;

        state.videoId = newVideoId;
        lastSavedContent = '';
        toggleBtn.style.display = 'block';

        const localNote = localStorage.getItem(`yt_note_${newVideoId}`) || '';
        textarea.value = localNote;
        setMode(!localNote.trim());
        loadRemoteNote();
    }

    function loadRemoteNote() {
        const gasUrl = getGasUrl();
        if (!gasUrl) return;

        const videoIdAtRequest = state.videoId;

        GM_xmlhttpRequest({
            method: 'GET',
            url: `${gasUrl}?videoId=${state.videoId}`,
            onload(response) {
                if (!response.responseText) return;
                if (state.videoId !== videoIdAtRequest) return;

                textarea.value = response.responseText;
                localStorage.setItem(
                    `yt_note_${state.videoId}`,
                    response.responseText
                );
                lastSavedContent = response.responseText;
                setMode(false);
            }
        });
    }

    // =====================================================
    //  整形機能
    // =====================================================

    const TS_CORE = /\d{1,2}:\d{2}(?::\d{2})?/.source;
    const RE_TS_NESTED_DROP   = new RegExp(`\\s*\\[\\[${TS_CORE}\\]\\([^)]*\\)\\]`, 'g');
    const RE_TS_FLAT_DROP     = new RegExp(`\\s*\\[${TS_CORE}\\]\\([^)]*\\)`, 'g');
    const RE_TS_NESTED_UNWRAP = new RegExp(`\\[\\[(${TS_CORE})\\]\\([^)]*\\)\\]`, 'g');
    const RE_TS_FLAT_UNWRAP   = new RegExp(`\\[(${TS_CORE})\\]\\([^)]*\\)`, 'g');
    const RE_CITE             = /\s*\[cite:\s*\d+(?:\s*,\s*\d+)*\]/gi;

    trimBtn.addEventListener('click', () => {
        const lines = textarea.value.split('\n');
        const isMd = l => /^[#|]/.test(l.trim());
        const firstIdx = lines.findIndex(isMd);

        if (firstIdx === -1) {
            alert('整形できるMarkdown（見出しや表）が見つかりませんでした。');
            return;
        }

        let trimmed = lines.slice(firstIdx, lines.findLastIndex(isMd) + 1).join('\n').trim();

        trimmed = trimmed
            .split('\n')
            .map(line => {
                if (!line.trim().startsWith('|')) return line;

                const cells = line.split('|');
                for (let i = 2; i < cells.length - 1; i++) {
                    cells[i] = cells[i]
                        .replace(RE_TS_NESTED_DROP, '')
                        .replace(RE_TS_FLAT_DROP, '');
                }
                return cells.join('|');
            })
            .join('\n');

        trimmed = trimmed
            .replace(RE_TS_NESTED_UNWRAP, '$1')
            .replace(RE_TS_FLAT_UNWRAP, '$1');

        trimmed = trimmed.replace(/\b00:0?(\d{1,2}):(\d{2})\b/g, '$1:$2');

        trimmed = trimmed.replace(RE_CITE, '');

        textarea.value = trimmed;
        saveToLocal();
        saveToRemote();
        setMode(false);
    });

    // =====================================================
    //  Gemini タイムスタンプ生成
    // =====================================================

    const PROMPT_BASE = url =>
        `${url}\n\n動画を見返す時に展開と構造がわかりやすいように、タイムスタンプを作ってほしい。トピックを一覧にしてまとめて、マークダウン形式で見やすく整えて。形式は以下の通り。\n\n# 🕒 タイムスタンプ`;

    const PROMPT_FORMAT_STRUCTURED = `
### 絵文字付き見出し
| タイムスタンプ | トピック |
| --- | --- |
| MM:SS | トピック |`;

    const PROMPT_FORMAT_SIMPLE = `
### 1. 見出し
| タイムスタンプ | トピック |
| --- | --- |
| MM:SS | 一言まとめ： 詳細 |

### 2. 見出し
| タイムスタンプ | トピック |
| --- | --- |
| MM:SS | 一言まとめ： 詳細 |`;

    function updateGeminiModeAppearance() {
        if (state.geminiStructured) {
            geminiBtn.innerHTML = _html.createHTML(ICON_GEMINI_STRUCTURED);
            geminiBtn.title = 'タイムスタンプを作成（見出しあり）';
            geminiModeBtn.title = '見出しなしに切り替え';
        } else {
            geminiBtn.innerHTML = _html.createHTML(ICON_GEMINI_SIMPLE);
            geminiBtn.title = 'タイムスタンプを作成（見出しなし）';
            geminiModeBtn.title = '見出しありに切り替え';
        }
    }

    geminiModeBtn.addEventListener('click', () => {
        state.geminiStructured = !state.geminiStructured;
        updateGeminiModeAppearance();
    });

    geminiBtn.addEventListener('click', () => {
        if (!state.videoId) {
            alert(
                '動画が検出できませんでした。YouTube動画のページで実行してください。'
            );
            return;
        }

        const videoUrl = `https://www.youtube.com/watch?v=${state.videoId}`;
        const prompt = PROMPT_BASE(videoUrl) +
            (state.geminiStructured ? PROMPT_FORMAT_STRUCTURED : PROMPT_FORMAT_SIMPLE);

        window.open(
            `https://gemini.google.com/app?q=${encodeURIComponent(prompt)}`,
            '_blank'
        );
    });

    updateGeminiModeAppearance();

    // =====================================================
    //  パネル配置・ドラッグ/リサイズ
    //   - pointermove / pointerrawupdate では座標記録のみ
    //   - 実描画は requestAnimationFrame で1フレーム1回
    // =====================================================

    const MIN_PANEL_WIDTH = 250;
    const MIN_CONTENT_HEIGHT = 150;
    const PANEL_MARGIN = 20;

    const clampW = (w, vw) =>
        Math.min(
            Math.max(w, MIN_PANEL_WIDTH),
            (vw || window.innerWidth) - PANEL_MARGIN * 2
        );

    const clampH = (h, vh) =>
        Math.min(
            Math.max(h, MIN_CONTENT_HEIGHT),
            (vh || window.innerHeight) - PANEL_MARGIN * 2
        );

    function commitPanelPos() {
        const r = state.panelRect;
        panel.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
    }

    function applyPanelRect(left, top, w, h) {
        const r = state.panelRect;
        w = clampW(w);
        h = clampH(h);
        r.width = w;
        r.height = h;
        panel.style.width = `${w}px`;
        panel.style.height = `${h}px`;
        r.left = Math.min(Math.max(left, PANEL_MARGIN), window.innerWidth - w - PANEL_MARGIN);
        r.top  = Math.min(Math.max(top,  PANEL_MARGIN), window.innerHeight - h - PANEL_MARGIN);
        commitPanelPos();
    }

    let dragState = null;
    let dragRafId = 0;

    function scheduleDragRender() {
        if (dragRafId) return;
        dragRafId = requestAnimationFrame(renderDragFrame);
    }

    function renderDragFrame() {
        dragRafId = 0;
        if (!dragState) return;

        const r = state.panelRect;
        const dx = dragState.lastX - dragState.startX;
        const dy = dragState.lastY - dragState.startY;

        let l = dragState.startLeft;
        let t = dragState.startTop;
        let w = dragState.startW;
        let h = dragState.startH;

        if (dragState.type === 'move') {
            l = Math.min(
                Math.max(dragState.startLeft + dx, PANEL_MARGIN),
                dragState.vw - dragState.startW - PANEL_MARGIN
            );
            t = Math.min(
                Math.max(dragState.startTop + dy, PANEL_MARGIN),
                dragState.vh - dragState.startH - PANEL_MARGIN
            );

            if (l !== r.left || t !== r.top) {
                r.left = l;
                r.top = t;
                commitPanelPos();
            }
            return;
        }

        if (dragState.type.includes('n')) {
            const nextH = clampH(dragState.startH - dy, dragState.vh);
            t = dragState.startTop + (dragState.startH - nextH);
            h = nextH;
        }

        if (dragState.type.includes('s')) {
            h = clampH(dragState.startH + dy, dragState.vh);
        }

        if (dragState.type.includes('w')) {
            const nextW = clampW(dragState.startW - dx, dragState.vw);
            l = dragState.startLeft + (dragState.startW - nextW);
            w = nextW;
        }

        if (dragState.type.includes('e')) {
            w = clampW(dragState.startW + dx, dragState.vw);
        }

        applyPanelRect(l, t, w, h);
    }

    const MOVE_EVENT = 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove';

    function attachDragHandler(el, type) {
        const moveHandler = e => {
            if (!dragState || dragState.pointerId !== e.pointerId) return;

            const coalesced = e.getCoalescedEvents?.();
            const lastEvent =
                coalesced && coalesced.length > 0
                    ? coalesced[coalesced.length - 1]
                    : e;

            dragState.lastX = lastEvent.clientX;
            dragState.lastY = lastEvent.clientY;
            scheduleDragRender();
        };

        const endHandler = e => {
            if (!dragState || dragState.pointerId !== e.pointerId) return;

            dragState.lastX = e.clientX;
            dragState.lastY = e.clientY;

            if (dragRafId) {
                cancelAnimationFrame(dragRafId);
                dragRafId = 0;
            }
            renderDragFrame();

            if (el.hasPointerCapture(e.pointerId)) {
                el.releasePointerCapture(e.pointerId);
            }

            dragState = null;
            el.classList.remove('dragging');
            panel.classList.remove('is-dragging');
            document.body.style.userSelect = '';
            document.body.style.cursor = '';

            el.removeEventListener(MOVE_EVENT, moveHandler);
            el.removeEventListener('pointerup', endHandler);
            el.removeEventListener('pointercancel', endHandler);
        };

        el.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;

            if (
                type === 'move' &&
                e.target.closest('button, a, input, select, textarea')
            ) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            const r = state.panelRect;
            dragState = {
                type,
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                lastX: e.clientX,
                lastY: e.clientY,
                startLeft: r.left,
                startTop: r.top,
                startW: r.width,
                startH: r.height,
                vw: window.innerWidth,
                vh: window.innerHeight
            };

            el.setPointerCapture(e.pointerId);
            el.classList.add('dragging');
            panel.classList.add('is-dragging');

            document.body.style.userSelect = 'none';
            document.body.style.cursor =
                type === 'move' ? 'move' : getComputedStyle(el).cursor;

            el.addEventListener(MOVE_EVENT, moveHandler);
            el.addEventListener('pointerup', endHandler);
            el.addEventListener('pointercancel', endHandler);
        });
    }

    ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'].forEach(dir => {
        attachDragHandler(document.getElementById(`yt-rz-${dir}`), dir);
    });

    attachDragHandler(
        document.getElementById('yt-note-move-handle'),
        'move'
    );

    // =====================================================
    //  ウィンドウリサイズ時のパネル位置・サイズ補正
    // =====================================================

    window.addEventListener('resize', () => {
        if (!state.isOpen || dragState) return;
        const r = state.panelRect;
        applyPanelRect(r.left, r.top, r.width, r.height);
    });

    // =====================================================
    //  プリセットサイズボタン
    // =====================================================

    function applyPresetSize(preset) {
        const r = state.panelRect;
        const newW = Math.round(clampW(window.innerWidth * preset.w));
        const newH = Math.round(clampH(window.innerHeight * preset.h));
        const anchorRight  = r.left + r.width  / 2 > window.innerWidth  / 2;
        const anchorBottom = r.top  + r.height / 2 > window.innerHeight / 2;
        const newLeft = anchorRight  ? r.left - (newW - r.width)  : r.left;
        const newTop  = anchorBottom ? r.top  - (newH - r.height) : r.top;
        applyPanelRect(newLeft, newTop, newW, newH);
    }

    function updateSizeToggleIcon() {
        sizeToggleBtn.innerHTML = _html.createHTML(
            state.sizeIsMax ? ICON_SIZE_MIN : ICON_SIZE_MAX
        );
        sizeToggleBtn.title = state.sizeIsMax ? '縮小' : '拡大';
    }

    sizeToggleBtn.addEventListener('click', e => {
        e.stopPropagation();
        state.sizeIsMax = !state.sizeIsMax;
        applyPresetSize(state.sizeIsMax ? PRESET_MAX : PRESET_MIN);
        updateSizeToggleIcon();
    });

    updateSizeToggleIcon();

    // =====================================================
    //  復活・ライフサイクル
    // =====================================================

    document.addEventListener('fullscreenchange', () => {
        container.style.display = document.fullscreenElement ? 'none' : '';
    });

    window.addEventListener('yt-navigate-finish', loadNote);
    window.addEventListener('yt-page-data-updated', loadNote);

    const bodyObserver = new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const node of m.removedNodes) {
                if (node === container || node.contains?.(container)) {
                    document.body.appendChild(container);
                    return;
                }
            }
        }
    });
    bodyObserver.observe(document.body, { childList: true });

    ensureGasUrl();
    loadNote();
})();
