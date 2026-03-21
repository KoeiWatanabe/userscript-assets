// ==UserScript==
// @name         AI Chat History Saver
// @namespace    https://github.com/koei/ai-chat-saver
// @version      1.2.1
// @description  ChatGPT、Gemini、Claude のチャット履歴をMarkdownファイルとして保存する
// @author       Koei
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://gemini.google.com/*
// @match        https://claude.ai/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // --- Button Style (DOM API to avoid Trusted Types violation) ---

    function injectStyles() {
        if (document.getElementById('ai-chat-saver-style')) return;
        const style = document.createElement('style');
        style.id = 'ai-chat-saver-style';
        style.textContent = `
            #ai-chat-saver-btn {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 999999;
                width: 48px;
                height: 48px;
                border-radius: 50%;
                border: none;
                background: #4a90d9;
                color: white;
                font-size: 22px;
                cursor: pointer;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.2s, background 0.2s;
            }
            #ai-chat-saver-btn:hover {
                transform: scale(1.1);
                background: #357abd;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    // --- Utility Functions ---

    function getServiceName() {
        const host = location.hostname;
        if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt';
        if (host.includes('gemini.google.com')) return 'gemini';
        if (host.includes('claude.ai')) return 'claude';
        return null;
    }

    function formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d} ${h}.${min}`;
    }

    function sanitizeFilename(name) {
        return name.replace(/[\\/:*?"<>|]/g, '_').trim();
    }

    function downloadMarkdown(filename, content) {
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // --- HTML to Markdown Converter ---

    function htmlToMarkdown(element) {
        if (!element) return '';
        return convertNode(element).trim();
    }

    /**
     * ChatGPT のコードブロックから言語名とコード本文を抽出する。
     * ChatGPT は CodeMirror ベースのエディタを使い、<pre> の中に
     *   .sticky ヘッダー (言語ラベル + ボタン) と .cm-content (コード) を持つ。
     */
    function extractChatGPTCodeBlock(preNode) {
        // --- 言語名 ---
        let lang = '';
        const header = preNode.querySelector('.sticky');
        if (header) {
            // ヘッダーの最初の flex 行 → 最初の子 div がラベル
            const row = header.querySelector('.flex.w-full');
            if (row && row.children[0]) {
                lang = row.children[0].textContent.trim().toLowerCase();
            }
        }

        // --- コード本文 ---
        let code = '';
        const cmContent = preNode.querySelector('.cm-content');
        if (cmContent) {
            // CodeMirror の各行は .cm-line
            const lines = cmContent.querySelectorAll('.cm-line');
            if (lines.length > 0) {
                code = Array.from(lines).map(l => l.textContent).join('\n');
            } else {
                code = cmContent.textContent;
            }
        }
        return { lang, code };
    }

    /**
     * Gemini のコードブロックから言語とコードを抽出する。
     * Gemini は <code-block> カスタム要素を使い、言語ラベルは
     * .code-block-decoration に、コードは <pre><code> に格納される。
     */
    function extractGeminiCodeBlock(preNode) {
        let lang = '';
        // <pre> の祖先にある <code-block> or .code-block コンテナから言語ラベルを取得
        const codeBlockContainer = preNode.closest('code-block') || preNode.closest('.code-block');
        if (codeBlockContainer) {
            const decoration = codeBlockContainer.querySelector('.code-block-decoration');
            if (decoration) {
                const labelText = decoration.textContent.trim();
                // 「コード スニペット」等の汎用ラベルは言語名ではないので無視
                if (labelText && !labelText.includes('スニペット') && !labelText.includes('snippet')) {
                    lang = labelText.toLowerCase();
                }
            }
        }
        const codeEl = preNode.querySelector('code');
        const code = codeEl ? codeEl.textContent : preNode.textContent;
        return { lang, code };
    }

    /**
     * Claude のコードブロック（<pre> 内の <code>）から言語とコードを抽出する。
     */
    function extractStandardCodeBlock(preNode) {
        const codeEl = preNode.querySelector('code');
        const lang = codeEl ? (codeEl.className.match(/language-(\S+)/)?.[1] || '') : '';
        const code = codeEl ? codeEl.textContent : preNode.textContent;
        return { lang, code };
    }

    function convertNode(node, insideLI = false) {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        const tag = node.tagName;

        // --- STYLE タグはスキップ（CSS がテキストとして混入するのを防ぐ）---
        if (tag === 'STYLE') return '';

        // --- INPUT (チェックボックス) ---
        if (tag === 'INPUT' && node.type === 'checkbox') {
            return node.checked ? '[x] ' : '[ ] ';
        }

        // --- BUTTON: 各種 UI ボタンをスキップ ---
        if (tag === 'BUTTON') {
            const btnText = node.textContent.trim();
            // Claude の「画像を表示」ボタン（バッジ等、復元不可）
            if (btnText === '画像を表示') return '';
            // ChatGPT のコードブロック内ボタン（コピー/実行）
            if (node.closest('pre') && (
                btnText === 'コピーする' || btnText.includes('実行する') ||
                btnText === 'Copy' || btnText === 'Copy code' ||
                btnText === 'Run'
            )) {
                return '';
            }
            // その他の UI ボタン（思考過程トグル等）
            return '';
        }

        // --- Gemini のコードブロック装飾（言語ラベル）をスキップ ---
        // 言語名は extractGeminiCodeBlock で PRE 処理時に取得済み
        if (tag === 'DIV' && node.classList && node.classList.contains('code-block-decoration')) {
            return '';
        }

        // --- Claude の可視化ウィジェット / ツール使用カードをスキップ ---
        if (tag === 'DIV' && node.classList) {
            // font-ui クラスを持つ border 付きカード（「visualizeに接続中...」等）
            if (node.classList.contains('font-ui') && node.classList.contains('my-3')) {
                return '';
            }
        }

        // LI 内の子要素を処理する際に insideLI フラグを伝播
        const isLI = (tag === 'LI');
        const children = Array.from(node.childNodes)
            .map(child => convertNode(child, insideLI || isLI))
            .join('');

        switch (tag) {
            case 'P':
                // LI 内の P は余分な空行を生成しない（ネストリストが壊れる）
                if (insideLI) return children;
                return '\n\n' + children + '\n\n';
            case 'BR':
                return '\n';
            case 'H1':
                return '\n\n# ' + children.trim() + '\n\n';
            case 'H2':
                return '\n\n## ' + children.trim() + '\n\n';
            case 'H3':
                return '\n\n### ' + children.trim() + '\n\n';
            case 'H4':
                return '\n\n#### ' + children.trim() + '\n\n';
            case 'H5':
                return '\n\n##### ' + children.trim() + '\n\n';
            case 'H6':
                return '\n\n###### ' + children.trim() + '\n\n';
            case 'STRONG':
            case 'B':
                return '**' + children + '**';
            case 'EM':
            case 'I':
                return '*' + children + '*';
            case 'CODE':
                if (node.parentElement && node.parentElement.tagName === 'PRE') {
                    return children;
                }
                return '`' + children + '`';
            case 'PRE': {
                const service = getServiceName();
                let lang, code;
                if (service === 'chatgpt') {
                    ({ lang, code } = extractChatGPTCodeBlock(node));
                } else if (service === 'gemini') {
                    ({ lang, code } = extractGeminiCodeBlock(node));
                } else {
                    ({ lang, code } = extractStandardCodeBlock(node));
                }
                // 「markdown」ラベルの例示コードブロックも正しく処理
                return '\n\n```' + lang + '\n' + code.trim() + '\n```\n\n';
            }
            case 'A': {
                const href = node.getAttribute('href') || '';
                return '[' + children + '](' + href + ')';
            }
            case 'UL':
                return '\n' + convertListItems(node, '- ') + '\n';
            case 'OL':
                return '\n' + convertOrderedListItems(node) + '\n';
            case 'LI':
                return children;
            case 'BLOCKQUOTE':
                return '\n\n' + children.trim().split('\n').map(l => '> ' + l).join('\n') + '\n\n';
            case 'HR':
                return '\n\n---\n\n';
            case 'TABLE':
                return '\n\n' + convertTable(node) + '\n\n';
            case 'IMG': {
                const alt = node.getAttribute('alt') || 'image';
                const src = node.getAttribute('src') || '';
                // data: URI の画像（Mermaid SVG 等）はスキップ
                if (src.startsWith('data:')) return '';
                return `![${alt}](${src})`;
            }
            case 'DEL':
            case 'S':
                return '~~' + children + '~~';
            case 'SUP':
                return '<sup>' + children + '</sup>';
            case 'SUB':
                return '<sub>' + children + '</sub>';
            case 'MARK':
                return '<mark>' + children + '</mark>';
            case 'KBD':
                return '<kbd>' + children + '</kbd>';
            case 'DETAILS':
                return '\n\n<details>\n' + children + '\n</details>\n\n';
            case 'SUMMARY':
                return '<summary>' + children.trim() + '</summary>\n\n';
            case 'DIV':
            case 'SPAN':
            case 'SECTION':
            case 'ARTICLE':
            case 'MAIN':
            case 'HEADER':
            case 'FOOTER':
                return children;
            // SVG はスキップ（アイコン等）
            case 'svg':
            case 'SVG':
                return '';
            default:
                return children;
        }
    }

    /**
     * LI の中身を取得し、空行を除去してクリーンな行配列にする
     */
    function getLIContent(li) {
        const raw = convertNode(li, true).trim();
        // 空行を除去してネストの整合性を保つ
        return raw.split('\n').filter(l => l.trim() !== '');
    }

    function convertListItems(ul, prefix) {
        const items = Array.from(ul.children).filter(c => c.tagName === 'LI');
        return items.map(li => {
            // タスクリスト検出: LI 内に checkbox がある場合
            const checkbox = li.querySelector('input[type="checkbox"]');
            if (checkbox) {
                const taskPrefix = checkbox.checked ? '- [x] ' : '- [ ] ';
                const lines = getLIContent(li);
                // checkbox 出力 "[x] " / "[ ] " を先頭から除去
                if (lines.length > 0) {
                    lines[0] = lines[0].replace(/^\[x\]\s*/, '').replace(/^\[ \]\s*/, '');
                }
                return taskPrefix + lines[0] + (lines.length > 1 ? '\n' + lines.slice(1).map(l => '  ' + l).join('\n') : '');
            }

            const lines = getLIContent(li);
            if (lines.length === 0) return prefix + '';
            return prefix + lines[0] + (lines.length > 1 ? '\n' + lines.slice(1).map(l => '  ' + l).join('\n') : '');
        }).join('\n');
    }

    function convertOrderedListItems(ol) {
        const items = Array.from(ol.children).filter(c => c.tagName === 'LI');
        return items.map((li, i) => {
            const lines = getLIContent(li);
            if (lines.length === 0) return (i + 1) + '. ';
            return (i + 1) + '. ' + lines[0] + (lines.length > 1 ? '\n' + lines.slice(1).map(l => '   ' + l).join('\n') : '');
        }).join('\n');
    }

    function convertTable(table) {
        const rows = Array.from(table.querySelectorAll('tr'));
        if (rows.length === 0) return '';

        const result = [];
        rows.forEach((row, i) => {
            const cells = Array.from(row.querySelectorAll('th, td'));
            const cellTexts = cells.map(c => convertNode(c).trim().replace(/\|/g, '\\|'));
            result.push('| ' + cellTexts.join(' | ') + ' |');
            if (i === 0) {
                result.push('|' + cells.map(() => ':---').join('|') + '|');
            }
        });
        return result.join('\n');
    }

    function cleanMarkdown(md) {
        return md
            .replace(/\n{3,}/g, '\n\n')
            .replace(/^\s+/, '')
            .replace(/\s+$/, '');
    }

    // --- Service-Specific Extractors ---

    function extractChatGPT() {
        const title = document.title || 'Untitled';
        const messages = [];
        const turns = document.querySelectorAll('[data-testid^="conversation-turn"]');

        function processUser(el) {
            const textEl = el.querySelector('.whitespace-pre-wrap');
            const text = textEl ? textEl.textContent.trim() : el.innerText.trim();
            if (text) messages.push({ role: 'user', content: text });
        }

        function processAssistant(el) {
            const mdEl = el.querySelector('.markdown');
            if (mdEl) {
                const md = cleanMarkdown(htmlToMarkdown(mdEl));
                if (md) messages.push({ role: 'assistant', content: md });
            } else {
                const text = el.innerText.trim();
                if (text) messages.push({ role: 'assistant', content: text });
            }
        }

        if (turns.length > 0) {
            turns.forEach(turn => {
                const userEl = turn.querySelector('[data-message-author-role="user"]');
                const assistantEl = turn.querySelector('[data-message-author-role="assistant"]');
                if (userEl) processUser(userEl);
                if (assistantEl) processAssistant(assistantEl);
            });
        } else {
            const allMsgs = document.querySelectorAll('[data-message-author-role]');
            allMsgs.forEach(el => {
                const role = el.getAttribute('data-message-author-role');
                if (role === 'user') processUser(el);
                else if (role === 'assistant') processAssistant(el);
            });
        }

        // モデル名の取得
        let model = '';
        const modelSelector = document.querySelector('button[aria-label*="モデル"], button[aria-label*="Model"]');
        if (modelSelector) {
            const t = modelSelector.textContent.trim();
            if (t.length < 30) model = t;
        }
        if (!model) {
            const modelBtns = document.querySelectorAll('button');
            for (const btn of modelBtns) {
                const t = btn.textContent.trim();
                if (t.match(/^(GPT-|ChatGPT|o[134]|gpt)/i) && t.length < 30) {
                    model = t;
                    break;
                }
            }
        }

        return { title, messages, model, service: 'ChatGPT' };
    }

    function extractGemini() {
        const messages = [];

        // タイトル取得
        let title = '';
        const activeTitle = document.querySelector('.selected .conversation-title, .active .conversation-title');
        if (activeTitle) {
            title = activeTitle.textContent.trim();
        }
        if (!title) {
            title = document.title.replace(' - Google Gemini', '').replace('Google Gemini', '').trim() || 'Untitled';
        }

        // 会話ターンの取得
        const userQueries = document.querySelectorAll('user-query');
        const modelResponses = document.querySelectorAll('model-response');

        const maxLen = Math.max(userQueries.length, modelResponses.length);
        for (let i = 0; i < maxLen; i++) {
            if (i < userQueries.length) {
                const queryText = userQueries[i].querySelector('.query-text');
                let text = queryText ? queryText.textContent.trim() : userQueries[i].innerText.trim();
                text = text.replace(/^あなたのプロンプト\s*/, '').trim();
                if (text) messages.push({ role: 'user', content: text });
            }
            if (i < modelResponses.length) {
                // 思考ブロック（thinking）を除外
                const mdEl = modelResponses[i].querySelector('message-content .markdown');
                if (mdEl) {
                    const md = cleanMarkdown(htmlToMarkdown(mdEl));
                    if (md) messages.push({ role: 'assistant', content: md });
                } else {
                    const responseText = modelResponses[i].querySelector('.model-response-text');
                    const text = responseText ? responseText.innerText.trim() : '';
                    if (text) messages.push({ role: 'assistant', content: text });
                }
            }
        }

        let model = '';
        return { title, messages, model, service: 'Gemini' };
    }

    function extractClaude() {
        // タイトル取得
        const titleBtn = document.querySelector('[data-testid="chat-title-button"]');
        const title = titleBtn ? titleBtn.textContent.trim() : document.title.replace(' - Claude', '').trim() || 'Untitled';

        const messages = [];

        // ユーザーメッセージとアシスタント応答をDOM順で取得
        const allMsgEls = document.querySelectorAll('[data-testid="user-message"], .font-claude-response');

        allMsgEls.forEach(el => {
            if (el.matches('[data-testid="user-message"]')) {
                const text = el.innerText.trim();
                if (text) messages.push({ role: 'user', content: text });
            } else if (el.matches('.font-claude-response')) {
                const md = cleanMarkdown(htmlToMarkdown(el));
                if (md) messages.push({ role: 'assistant', content: md });
            }
        });

        // モデル名
        let model = '';
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
            const t = btn.textContent.trim();
            if (t.match(/^(Sonnet|Opus|Haiku|Claude)/i) && t.length < 30) {
                model = t;
                break;
            }
        }

        return { title, messages, model, service: 'Claude' };
    }

    // --- Markdown Generation ---

    function generateMarkdown(data) {
        const lines = [];

        lines.push('# ' + data.title);
        lines.push('');

        if (data.model) {
            lines.push('Model: ' + data.model);
        }
        lines.push('Created: ' + new Date().toLocaleString());
        lines.push('Exported from: ' + data.service);
        lines.push('');

        for (const msg of data.messages) {
            if (msg.role === 'user') {
                lines.push('### User');
                lines.push('');
                lines.push(msg.content);
                lines.push('');
            } else if (msg.role === 'assistant') {
                lines.push('### Assistant');
                lines.push('');
                lines.push(msg.content);
                lines.push('');
            }
        }

        return lines.join('\n');
    }

    // --- Main Export Function ---

    function exportChat() {
        const service = getServiceName();
        if (!service) {
            alert('このサイトはサポートされていません。');
            return;
        }

        let data;
        try {
            switch (service) {
                case 'chatgpt':
                    data = extractChatGPT();
                    break;
                case 'gemini':
                    data = extractGemini();
                    break;
                case 'claude':
                    data = extractClaude();
                    break;
            }
        } catch (e) {
            alert('チャット履歴の取得中にエラーが発生しました: ' + e.message);
            console.error('AI Chat History Saver error:', e);
            return;
        }

        if (!data || data.messages.length === 0) {
            alert('チャット履歴が見つかりませんでした。チャットページを開いてから実行してください。');
            return;
        }

        const markdown = generateMarkdown(data);
        const filename = sanitizeFilename(data.title) + ' - ' + formatDate(new Date()) + '.md';
        downloadMarkdown(filename, markdown);
    }

    // --- UI: Add Download Button ---

    function createButton() {
        injectStyles();
        const btn = document.createElement('button');
        btn.id = 'ai-chat-saver-btn';
        btn.textContent = '💾';
        btn.title = 'チャット履歴をMarkdownとして保存 (Alt+S)';
        btn.addEventListener('click', exportChat);
        document.body.appendChild(btn);
    }

    // --- Keyboard Shortcut ---

    function setupShortcut() {
        document.addEventListener('keydown', (e) => {
            if (e.altKey && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                exportChat();
            }
        });
    }

    // --- Initialization ---

    function init() {
        const service = getServiceName();
        if (!service) return;

        // ページの読み込みを待つ
        const checkReady = setInterval(() => {
            if (document.body) {
                clearInterval(checkReady);
                if (!document.getElementById('ai-chat-saver-btn')) {
                    createButton();
                }
                setupShortcut();
            }
        }, 500);

        // SPA ナビゲーション対応: URL 変更時にボタンを再挿入
        let lastUrl = location.href;
        const observer = new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                setTimeout(() => {
                    if (!document.getElementById('ai-chat-saver-btn')) {
                        createButton();
                    }
                }, 1000);
            }
        });
        observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }

    init();
})();