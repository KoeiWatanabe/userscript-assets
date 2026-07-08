// ==UserScript==
// @name         シアターモードを改善
// @namespace    https://tampermonkey.net/
// @version      1.4.1
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

ytd-watch-flexy[theater] { position: relative !important; }

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

  function maxHeight() {
    return Math.max(320, window.innerHeight - 56 - 12 - 92);
  }

  function chatWidth(flexy) {
    if (!flexy || !flexy.hasAttribute('live-chat-present-and-expanded')) return 0;
    const chat = document.querySelector('ytd-live-chat-frame#chat');
    if (!chat) return 0;
    const w = chat.getBoundingClientRect().width;
    return w > 0 ? Math.ceil(w) : 0;
  }

  function sizeFor(video, availW) {
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    const h = maxHeight();
    const wHard = h * 2;
    const wMax = Math.min(wHard, Math.max(0, availW));
    const ratio = video.videoWidth / video.videoHeight;
    let w = ratio * h;
    let h2 = h;
    if (w > wMax) {
      w = wMax;
      h2 = wMax / ratio;
    }
    return { w: Math.round(w * 100) / 100, h: Math.round(h2 * 100) / 100 };
  }

  let originalParent = null;
  let vidHooked = null;
  let mastheadMo = null;
  let mo = null;
  // ponytail: flexy / mp / slot をキャッシュ。apply() 呼び出し毎の querySelector を省く
  let flexyEl = null, mpEl = null, slotEl = null;

  function stripTheaterMastheadDark() {
    const flexy = flexyEl || document.querySelector('ytd-watch-flexy');
    if (!flexy || !flexy.hasAttribute('theater')) return;
    const m = document.querySelector('ytd-masthead#masthead');
    if (m && m.hasAttribute('dark')) m.removeAttribute('dark');
  }

  function watchMasthead() {
    const m = document.querySelector('ytd-masthead#masthead');
    if (!m) return;
    if (mastheadMo) mastheadMo.disconnect();
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

      const chatW = chatWidth(flexy);
      flexy.style.setProperty('--tdv-chat-w', chatW + 'px');
      const availW = Math.max(0, flexy.clientWidth - chatW - 32);

      const v = mp.querySelector('video');
      const size = sizeFor(v, availW);
      if (size) {
        flexy.style.setProperty('--tdv-w', size.w + 'px');
        flexy.style.setProperty('--tdv-h', size.h + 'px');
      } else if (v && v !== vidHooked) {
        vidHooked = v;
        v.addEventListener('loadedmetadata', schedule, { once: true });
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
      schedule();
      // ponytail: Polymer の dom-move が非同期の場合に備え遅延再適用。属性変化はユーザー操作時のみで稀
      setTimeout(schedule, 100);
    });
    // ponytail: attributes のみ監視。subtree/childList を落とし再生中の無駄発火を排除
    mo.observe(flexy, {
      attributes: true,
      attributeFilter: ['theater', 'live-chat-present-and-expanded'],
    });
    return true;
  }

  function bootstrap() {
    installStyle();
    watchMasthead();
    if (!watch()) {
      const obs = new MutationObserver((_, o) => {
        if (watch()) {
          o.disconnect();
          schedule();
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    } else {
      schedule();
    }
  }

  // SPA 遷移。動画切り替えで #player-container が再構築されるため、キャッシュと originalParent は再取得
  window.addEventListener('yt-navigate-finish', () => {
    originalParent = null;
    vidHooked = null;
    flexyEl = mpEl = slotEl = null;
    setTimeout(() => { watch(); schedule(); }, 50);
    setTimeout(schedule, 300);
    setTimeout(schedule, 1000);
  });

  window.addEventListener('resize', schedule);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
