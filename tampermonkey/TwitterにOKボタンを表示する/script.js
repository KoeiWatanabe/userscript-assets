// ==UserScript==
// @name         TwitterにOKボタンを表示する
// @namespace    https://tampermonkey.net/
// @version      1.0.0
// @description  X/Twitterページ上に動作確認用の大きなOKボタンを表示します。
// @match        https://twitter.com/*
// @match        https://x.com/*
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/TwitterにOKボタンを表示する/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/TwitterにOKボタンを表示する/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/TwitterにOKボタンを表示する/icon_128.png
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const BUTTON_ID = 'codex-twitter-ok-button';
  const MESSAGE_ID = 'codex-twitter-ok-message';

  function showLoadedMessage() {
    let message = document.getElementById(MESSAGE_ID);

    if (!message) {
      message = document.createElement('div');
      message.id = MESSAGE_ID;
      Object.assign(message.style, {
        position: 'fixed',
        top: '104px',
        right: '24px',
        zIndex: '2147483647',
        padding: '18px 24px',
        borderRadius: '10px',
        background: '#0f172a',
        color: '#ffffff',
        fontSize: '24px',
        fontWeight: '700',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.35)',
        pointerEvents: 'none',
      });
      document.documentElement.appendChild(message);
    }

    message.textContent = '読み込めてます';
    window.setTimeout(() => {
      message.remove();
    }, 3000);
  }

  function ensureButton() {
    if (document.getElementById(BUTTON_ID)) {
      return;
    }

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'OK';
    button.setAttribute('aria-label', 'Tampermonkey動作確認');
    Object.assign(button.style, {
      position: 'fixed',
      top: '24px',
      right: '24px',
      zIndex: '2147483647',
      width: '160px',
      height: '72px',
      border: '0',
      borderRadius: '12px',
      background: '#16a34a',
      color: '#ffffff',
      fontSize: '32px',
      fontWeight: '800',
      lineHeight: '1',
      cursor: 'pointer',
      boxShadow: '0 14px 34px rgba(22, 163, 74, 0.42)',
    });

    button.addEventListener('click', showLoadedMessage);
    document.documentElement.appendChild(button);
  }

  ensureButton();
  const observer = new MutationObserver(ensureButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
