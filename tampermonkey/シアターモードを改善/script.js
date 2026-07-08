// ==UserScript==
// @name         シアターモードを改善
// @namespace    https://tampermonkey.net/
// @version      1.6.0
// @description  YouTube のシアターモード（Theater mode）表示を Default view 相当に固定し、動画アスペクト比に追従して黒帯・クリップを排除する。プレイヤー周辺に Default view 相当の余白を確保し、チャット上部をプレイヤーに揃える。シアターモード時のヘッダー強制ダーク化も抑制
// @match        https://www.youtube.com/*
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/シアターモードを改善/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/シアターモードを改善/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/シアターモードを改善/icon_128.png
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'yt-tdv-style';
  const CSS = `
ytd-watch-flexy[theater] #full-bleed-container,
ytd-watch-flexy[theater] #cinematics-full-bleed-container,
ytd-watch-flexy[theater] #panels-full-bleed-container,
ytd-watch-flexy[theater] #player-full-bleed-container {
  display: none !important;
}

ytd-watch-flexy[theater] {
  position: relative !important;
  container-type: inline-size;
  --tdv-h-max: max(320px, calc(100vh - 56px - 12px - 92px));
  --tdv-avail-w: calc(100cqw - var(--tdv-chat-w, 0px) - 32px);
  --tdv-w: min(calc(var(--tdv-h-max) * var(--tdv-ratio, 1.77778)), calc(var(--tdv-h-max) * 2), var(--tdv-avail-w));
  --tdv-h: calc(var(--tdv-w) / var(--tdv-ratio, 1.77778));
}

ytd-watch-flexy[theater] #player {
  display: block !important;
  position: absolute !important;
  top: 12px !important;
  left: 16px !important;
  right: calc(var(--tdv-chat-w, 0px) + 16px) !important;
  margin: 0 !important;
  height: var(--tdv-h, 656px) !important;
}

ytd-watch-flexy[theater] #player-container-inner { display: none !important; }

ytd-watch-flexy[theater] #player-container-outer {
  display: block !important;
  margin: 0 auto !important;
  box-sizing: content-box !important;
  width: var(--tdv-w, 1166.22px) !important;
  height: var(--tdv-h, 656px) !important;
  max-width: var(--tdv-w, 1166.22px) !important;
  min-width: 0 !important;
  position: relative !important;
  border-radius: 12px !important;
  overflow: hidden !important;
}

ytd-watch-flexy[theater] #columns {
  margin-top: calc(var(--tdv-h, 656px) + 12px) !important;
}

ytd-watch-flexy[theater] #player-container-outer > #movie_player {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  background-color: transparent !important;
}

ytd-watch-flexy[theater] #movie_player .html5-video-container {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
}

ytd-watch-flexy[theater] #movie_player .html5-main-video {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
}

ytd-watch-flexy[theater][live-chat-present-and-expanded] ytd-live-chat-frame#chat {
  margin-top: 12px !important;
  height: calc(100vh - 56px - 12px) !important;
}
`;

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function chatWidth(flexy) {
    if (!flexy || !flexy.hasAttribute('live-chat-present-and-expanded')) return 0;
    const chat = document.querySelector('ytd-live-chat-frame#chat');
    if (!chat) return 0;
    const w = chat.getBoundingClientRect().width;
    return w > 0 ? Math.ceil(w) : 0;
  }

  let originalParent = null;
  let vidHooked = null;
  let mastheadMo = null;
  let mo = null;
  // ponytail: 要素キャッシュ。apply() 呼び出し毎の querySelector を省く
  let flexyEl = null, mpEl = null, slotEl = null, vidEl = null, mastheadEl = null;
  // ponytail: チャット幅は属性変化/resize 時のみ再計測。apply() 毎の getBoundingClientRect を省く
  let chatW = 0, chatWDirty = true;
  let lastChatW = -1;

  function stripTheaterMastheadDark() {
    const flexy = flexyEl || document.querySelector('ytd-watch-flexy');
    if (!flexy || !flexy.hasAttribute('theater')) return;
    const m = mastheadEl || (mastheadEl = document.querySelector('ytd-masthead#masthead'));
    if (m && m.hasAttribute('dark')) m.removeAttribute('dark');
  }

  function watchMasthead() {
    const m = mastheadEl || (mastheadEl = document.querySelector('ytd-masthead#masthead'));
    if (!m) return;
    // ponytail: 既に観測中なら再観測しない（SPA 遷移で masthead は持続するため再取得不要）
    if (mastheadMo) return;
    mastheadMo = new MutationObserver(stripTheaterMastheadDark);
    mastheadMo.observe(m, { attributes: true, attributeFilter: ['dark'] });
    stripTheaterMastheadDark();
  }

  function apply() {
    const flexy = flexyEl || document.querySelector('ytd-watch-flexy');
    if (!flexy) return;
    const mp = mpEl || document.querySelector('#movie_player');
    if (!mp) return;
    const slot = slotEl || document.querySelector('#primary-inner > #player > #player-container-outer');
    if (!slot) return;

    if (flexy.hasAttribute('theater')) {
      if (!originalParent && mp.parentElement && mp.parentElement !== slot) {
        originalParent = mp.parentElement;
      }
      if (mp.parentElement !== slot) slot.appendChild(mp);

      stripTheaterMastheadDark();

      // ponytail: チャット幅は dirty 時のみ再計測
      if (chatWDirty) {
        chatW = chatWidth(flexy);
        chatWDirty = false;
      }
      if (chatW !== lastChatW) {
        flexy.style.setProperty('--tdv-chat-w', chatW + 'px');
        lastChatW = chatW;
      }

      // ponytail: サイズ計算は CSS（min/calc/100cqw）が算出。JS は ratio のみ設定
      let v = vidEl;
      if (!v || !mp.contains(v)) {
        v = mp.querySelector('video');
        vidEl = v;
      }
      if (v && v !== vidHooked) {
        vidHooked = v;
        if (v.videoWidth && v.videoHeight) {
          flexy.style.setProperty('--tdv-ratio', String(v.videoWidth / v.videoHeight));
        } else {
          v.addEventListener('loadedmetadata', () => {
            if (v.videoWidth && v.videoHeight) {
              flexy.style.setProperty('--tdv-ratio', String(v.videoWidth / v.videoHeight));
            }
          }, { once: true });
        }
      }
    } else {
      const defaultParent = originalParent || document.querySelector('ytd-player > #container');
      if (defaultParent && mp.parentElement !== defaultParent) {
        defaultParent.appendChild(mp);
      }
    }
  }

  // ponytail: rAF デバウンス。MO / resize の連続発火を1フレーム1回に束ねる
  let rafId = 0;
  function schedule() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = 0; apply(); });
  }

  function watch() {
    const flexy = document.querySelector('ytd-watch-flexy');
    if (!flexy) return false;
    flexyEl = flexy;
    mpEl = document.querySelector('#movie_player');
    slotEl = document.querySelector('#primary-inner > #player > #player-container-outer');
    watchMasthead();
    if (mo) mo.disconnect();
    mo = new MutationObserver(() => {
      // ponytail: チャット展開/折畳で幅が変わるので dirty 化
      chatWDirty = true;
      schedule();
    });
    // ponytail: attributes のみ監視。subtree/childList を落とし再生中の無駄発火を排除
    mo.observe(flexy, {
      attributes: true,
      attributeFilter: ['theater', 'live-chat-present-and-expanded'],
    });
    return true;
  }

  // ponytail: subtree MO 廃止。ナビ遷移後〜0.5s だけ rAF で試行、以降は yt-navigate-finish 待ち
  function retryWatch(n) {
    if (watch()) { schedule(); return; }
    if (n < 30) requestAnimationFrame(() => retryWatch(n + 1));
  }

  function onNavigate() {
    originalParent = null;
    vidHooked = null;
    vidEl = null;
    flexyEl = mpEl = slotEl = null;
    chatWDirty = true;
    lastChatW = -1;
    retryWatch(0);
    schedule();
  }

  function bootstrap() {
    installStyle();
    window.addEventListener('yt-navigate-finish', onNavigate);
    retryWatch(0);
  }

  window.addEventListener('resize', () => { chatWDirty = true; schedule(); });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
