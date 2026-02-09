// ==UserScript==
// @name         Obsidianに保存する
// @namespace    local.obsidian.capture
// @version      0.4
// @description  選択があれば選択範囲、なければ直近で触った返答をObsidianのDaily Noteに追記（ダークモード対応）
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://gemini.google.com/*
// @match        https://t3.chat/*
// @grant        GM_setClipboard
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Obsidianに保存する/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Obsidianに保存する/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Obsidianに保存する/icon_128.png
// ==/UserScript==

(() => {
  "use strict";

  const VAULT_NAME = "iCloud Vault";
  const BUTTON_TEXT = "📌 Dailyへ追記";
  const PREFIX = "\n\n";
  const SUFFIX = "\n";

  function getSelectionText() {
    const sel = window.getSelection?.();
    const txt = sel ? sel.toString().trim() : "";
    return txt || "";
  }

  let lastPointedEl = null;
  document.addEventListener("mouseover", (e) => { lastPointedEl = e.target; }, true);
  document.addEventListener("mousedown", (e) => { lastPointedEl = e.target; }, true);

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function textFromEl(el) {
    if (!el) return "";
    return (el.innerText || el.textContent || "").trim();
  }

  function closestBySelectors(startEl, selectors) {
    let el = startEl;
    while (el && el !== document.documentElement) {
      for (const sel of selectors) {
        try { if (el.matches && el.matches(sel)) return el; } catch {}
      }
      el = el.parentElement;
    }
    return null;
  }

  function findWholeReplyElement() {
    const host = location.hostname;
    const fromPointer = (() => {
      const el = lastPointedEl;
      if (!el) return null;
      if (host.includes("chatgpt.com") || host.includes("chat.openai.com")) {
        return closestBySelectors(el, ['[data-message-author-role="assistant"]', 'article']);
      }
      if (host.includes("gemini.google.com")) {
        return closestBySelectors(el, ['message-content', 'div[role="article"]', 'main div[role="main"] div', 'main div']);
      }
      if (host.includes("t3.chat")) {
        return closestBySelectors(el, ['[data-message-role="assistant"]', 'article', 'div[role="article"]']);
      }
      return null;
    })();
    if (fromPointer && isVisible(fromPointer) && textFromEl(fromPointer)) return fromPointer;

    if (host.includes("chatgpt.com") || host.includes("chat.openai.com")) {
      const nodes = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
      return nodes.length ? nodes[nodes.length - 1] : null;
    }
    if (host.includes("gemini.google.com")) {
      const candidates = Array.from(document.querySelectorAll("main *"))
        .filter(el => el instanceof Element && isVisible(el))
        .filter(el => (el.innerText || "").trim().length > 200);
      return candidates.length ? candidates[candidates.length - 1] : null;
    }
    if (host.includes("t3.chat")) {
      const nodes = Array.from(document.querySelectorAll("article, div[role='article']"));
      for (let i = nodes.length - 1; i >= 0; i--) {
        const t = textFromEl(nodes[i]);
        if (t && t.length > 80) return nodes[i];
      }
      return null;
    }
    return null;
  }

  async function copyToClipboard(text) {
    if (typeof GM_setClipboard === "function") {
      GM_setClipboard(text, "text");
      return;
    }
    await navigator.clipboard.writeText(text);
  }

  function openObsidianAppendFromClipboard() {
    const url = `obsidian://advanced-uri?vault=${encodeURIComponent(VAULT_NAME)}&daily=true&clipboard=true&mode=append`;
    window.location.href = url;
  }

  async function onClick() {
    const selected = getSelectionText();
    let payload = selected;
    if (!payload) {
      const replyEl = findWholeReplyElement();
      payload = textFromEl(replyEl);
      if (!payload) {
        alert("保存する返答を特定できなかった。");
        return;
      }
    }
    const textToAppend = PREFIX + payload + SUFFIX;
    try {
      await copyToClipboard(textToAppend);
      openObsidianAppendFromClipboard();
    } catch (e) {
      alert("コピーに失敗しました。");
    }
  }

  function injectButton() {
    // スタイルを <style> タグとして注入
    const style = document.createElement("style");
    style.textContent = `
      .obsidian-capture-btn {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 999999;
        padding: 10px 14px;
        border-radius: 10px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s ease;
        /* ライトモード用デフォルト */
        background-color: #ffffff !important;
        color: #333333 !important;
        border: 1px solid rgba(0,0,0,0.15) !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
      }
      .obsidian-capture-btn:hover {
        background-color: #f5f5f5 !important;
        transform: translateY(-1px);
      }
      /* ダークモード検知 (OS設定、またはサイトのクラス) */
      @media (prefers-color-scheme: dark) {
        .obsidian-capture-btn {
          background-color: #2d2d2d !important;
          color: #efefef !important;
          border: 1px solid rgba(255,255,255,0.2) !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
        }
        .obsidian-capture-btn:hover {
          background-color: #3d3d3d !important;
        }
      }
      /* ChatGPT/Geminiのダークモード用クラスがhtml/bodyにある場合 */
      html.dark .obsidian-capture-btn,
      body.dark .obsidian-capture-btn,
      [data-theme="dark"] .obsidian-capture-btn {
          background-color: #2d2d2d !important;
          color: #efefef !important;
          border: 1px solid rgba(255,255,255,0.2) !important;
      }
    `;
    document.head.appendChild(style);

    const btn = document.createElement("button");
    btn.textContent = BUTTON_TEXT;
    btn.type = "button";
    btn.className = "obsidian-capture-btn";
    btn.addEventListener("click", onClick);
    document.body.appendChild(btn);
  }

  injectButton();
})();