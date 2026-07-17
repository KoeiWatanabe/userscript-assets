// ==UserScript==
// @name         ニコニコにシアターモードを追加
// @namespace    https://tampermonkey.net/
// @version      1.1.0
// @description  ニコニコ動画の watch ページを常時シアターモード風に変更する。プレイヤーをヘッダー下の縦空間いっぱいに動画の実アスペクト比で表示して黒帯を排除し、右側パネル（コメントリスト等）はプレイヤー下へ移動する
// @match        https://www.nicovideo.jp/*
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/ニコニコにシアターモードを追加/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/ニコニコにシアターモードを追加/script.js
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'ntm-style';

  // watch ページのレイアウトは <section> のインライン CSS 変数
  // (--watch-player-width 等) で駆動されているため、スタイルシート側の
  // !important で変数ごと上書きする（インライン style の通常宣言には勝てる）。
  // フルスクリーンは body が fullscreenElement になるため、
  // body:not(:fullscreen) で全ルールを無効化してニコニコ標準の挙動に戻す。
  const CSS = `
body:not(:fullscreen) section[style*="--watch-player-width"] {
  /* プレイヤー下にタイトル + 投稿日時・再生数・コメント数の行
     (計約56px + グリッド間隔) が見える高さを確保する */
  --ntm-bottom-reserve: 80px;
  --watch-player-width-by-browser: calc(100vw - var(--watch-layout-gap-width) * 2 - var(--scrollbar-width)) !important;
  --watch-player-height-by-browser: calc(
    100vh
    - var(--common-header-height)
    - var(--web-header-height)
    - var(--watch-controller-height)
    - var(--watch-actionbar-height)
    - var(--watch-player-actionbar-gap-height)
    - var(--watch-layout-gap-height)
    - var(--ntm-bottom-reserve)
  ) !important;
  --watch-player-possible-width: min(
    var(--watch-player-width-by-browser),
    var(--watch-player-height-by-browser) * var(--ntm-ratio, 1.77778)
  ) !important;
  --watch-player-width: min(var(--watch-player-max-width), var(--watch-player-possible-width)) !important;
  --watch-player-height: calc(var(--watch-player-width) / var(--ntm-ratio, 1.77778)) !important;
  grid-template-areas:
    "player player"
    "bottom sidebar"
    "bottom sidebar" !important;
  grid-template-columns: minmax(0, 1fr) var(--watch-sidebar-width) !important;
}

body:not(:fullscreen) section[style*="--watch-player-width"] > [data-styling-name="fullscreen-target"]:not(:fullscreen) > div {
  width: var(--watch-player-width) !important;
  max-width: 100% !important;
  margin-inline: auto !important;
}

body:not(:fullscreen) section[style*="--watch-player-width"] [data-styling-name="fullscreen-target"]:not(:fullscreen) .asp_16\\:9 {
  aspect-ratio: var(--ntm-ratio, 1.77778) !important;
}

body:not(:fullscreen) [data-styling-name="fullscreen-target"]:not(:fullscreen) [data-name="stage"] {
  --aspect-ratio: var(--ntm-ratio, 1.77778) !important;
  --stage-aspect-ratio: var(--ntm-ratio, 1.77778) !important;
}

/* stage の親は top/left 50% + translate(-50%,-50%) + 16:9 計算サイズで
   中央配置されているため、枠いっぱいに固定し直す */
body:not(:fullscreen) [data-styling-name="fullscreen-target"]:not(:fullscreen) div:has(> div[data-name="stage"]) {
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  transform: none !important;
}
`;

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function setRatio(w, h) {
    if (!w || !h) return;
    document.documentElement.style.setProperty('--ntm-ratio', String(w / h));
  }

  function onVideoEvent(e) {
    const t = e.target;
    if (!t || t.tagName !== 'VIDEO' || !t.closest('[data-name="stage"]')) return;
    setRatio(t.videoWidth, t.videoHeight);
  }

  function initScan() {
    const v = document.querySelector('[data-name="stage"] video');
    if (v) setRatio(v.videoWidth, v.videoHeight);
  }

  function bootstrap() {
    installStyle();
    initScan();
  }

  // loadedmetadata / resize はバブリングしないためキャプチャ段階で拾う。
  // SPA 遷移（連続再生・関連動画クリック）でも新しい動画の
  // loadedmetadata がここに届くので比率が追従する。
  document.addEventListener('loadedmetadata', onVideoEvent, true);
  document.addEventListener('resize', onVideoEvent, true);

  installStyle();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
