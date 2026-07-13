// ==UserScript==
// @name         シアターモードを改善
// @namespace    https://tampermonkey.net/
// @version      1.7.2
// @description  YouTube のシアターモード（Theater mode）表示を Default view 相当に固定し、動画アスペクト比に追従して黒帯・クリップを排除する。プレイヤー周辺に Default view 相当の余白を確保し、チャット上部をプレイヤーに揃える。シアターモード時のヘッダー強制ダーク化も抑制
// @match        https://www.youtube.com/*
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/シアターモードを改善/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/シアターモードを改善/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/シアターモードを改善/icon.svg
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'yt-tdv-style';
  const CSS = `
ytd-watch-flexy[theater]:not([fullscreen]) {
  position: relative !important;
  container-type: inline-size;
  --tdv-chat-w: 0px;
  --tdv-h-max: max(320px, calc(100vh - 56px - 12px - 92px));
  --tdv-avail-w: calc(100cqw - var(--tdv-chat-w) - 32px);
  --tdv-w: min(calc(var(--tdv-h-max) * var(--tdv-ratio, 1.77778)), calc(var(--tdv-h-max) * 2), var(--tdv-avail-w));
  --tdv-h: calc(var(--tdv-w) / var(--tdv-ratio, 1.77778));
}

ytd-watch-flexy[theater]:not([fullscreen])[live-chat-present-and-expanded] {
  --tdv-chat-w: var(--ytd-watch-flexy-sidebar-width);
}

ytd-watch-flexy[theater]:not([fullscreen]) #cinematics-full-bleed-container,
ytd-watch-flexy[theater]:not([fullscreen]) #panels-full-bleed-container {
  display: none !important;
}

ytd-watch-flexy[theater]:not([fullscreen]) #full-bleed-container {
  display: block !important;
  height: calc(var(--tdv-h) + 12px) !important;
  max-height: none !important;
  min-height: 0 !important;
  overflow: visible !important;
  background-color: transparent !important;
}

ytd-watch-flexy[theater]:not([fullscreen]) #player-full-bleed-container {
  display: block !important;
  position: relative !important;
  width: 100% !important;
  height: 100% !important;
}

ytd-watch-flexy[theater]:not([fullscreen]) #player-full-bleed-container > #player-container {
  position: absolute !important;
  top: 12px !important;
  left: 16px !important;
  right: calc(var(--tdv-chat-w) + 16px) !important;
  width: auto !important;
  height: var(--tdv-h) !important;
}

ytd-watch-flexy[theater]:not([fullscreen]) #player-full-bleed-container > #player-container > ytd-player {
  display: block !important;
  width: var(--tdv-w) !important;
  height: var(--tdv-h) !important;
  margin: 0 auto !important;
  border-radius: 12px !important;
  overflow: hidden !important;
}

ytd-watch-flexy[theater]:not([fullscreen]) #movie_player {
  background-color: transparent !important;
}

ytd-watch-flexy[theater]:not([fullscreen]) #movie_player .html5-video-container {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
}

ytd-watch-flexy[theater]:not([fullscreen]) #movie_player .html5-main-video {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
}

ytd-watch-flexy[theater]:not([fullscreen])[live-chat-present-and-expanded] ytd-live-chat-frame#chat {
  margin-top: 12px !important;
  height: calc(100vh - 56px - 12px) !important;
}
`;

  let videoEl = null;
  let mastheadEl = null;
  let mastheadMo = null;

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function updateRatio() {
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return;
    const flexy = document.querySelector('ytd-watch-flexy');
    if (flexy) {
      flexy.style.setProperty('--tdv-ratio', String(videoEl.videoWidth / videoEl.videoHeight));
    }
  }

  function bindVideo() {
    const nextVideo = document.querySelector('#movie_player video');
    if (nextVideo !== videoEl) {
      if (videoEl) videoEl.removeEventListener('loadedmetadata', updateRatio);
      videoEl = nextVideo;
      if (videoEl) videoEl.addEventListener('loadedmetadata', updateRatio);
    }
    updateRatio();
  }

  function stripTheaterMastheadDark() {
    const flexy = document.querySelector('ytd-watch-flexy');
    if (!flexy || !flexy.hasAttribute('theater')) return;
    if (mastheadEl && mastheadEl.hasAttribute('dark')) {
      mastheadEl.removeAttribute('dark');
    }
  }

  function watchMasthead() {
    const nextMasthead = document.querySelector('ytd-masthead#masthead');
    if (!nextMasthead || nextMasthead === mastheadEl) {
      stripTheaterMastheadDark();
      return;
    }
    if (mastheadMo) mastheadMo.disconnect();
    mastheadEl = nextMasthead;
    mastheadMo = new MutationObserver(stripTheaterMastheadDark);
    mastheadMo.observe(mastheadEl, { attributes: true, attributeFilter: ['dark'] });
    stripTheaterMastheadDark();
  }

  function syncPage() {
    bindVideo();
    watchMasthead();
  }

  function bootstrap() {
    installStyle();
    window.addEventListener('yt-navigate-finish', syncPage);
    syncPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
