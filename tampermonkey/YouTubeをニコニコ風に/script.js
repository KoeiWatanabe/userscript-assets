// ==UserScript==
// @name         YouTubeをニコニコ風に
// @namespace    https://github.com/tampermonkey-youtube-danmaku
// @version      2.2.7
// @description  YouTubeライブチャットのコメントをニコニコ動画風に動画上へ弾幕表示する
// @author       You
// @match        https://www.youtube.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeをニコニコ風に/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeをニコニコ風に/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/YouTubeをニコニコ風に/icon_128.png
// ==/UserScript==

(function () {
  'use strict';

  // iframe 内では実行しない（chat iframe で無駄に動くのを防止）
  if (window.top !== window.self) return;

  // ─── 設定 ───
  const CONFIG = {
    fontFamily: '"Noto Sans JP", sans-serif',
    fontWeight: 'bold',
    opacity: 0.9,          // コメント不透明度
    duration: 6,            // コメントが画面を横切る秒数
    maxLines: 14,           // 同時表示行数（画面を何分割するか）
    lineHeightRatio: 1.4,   // 行の高さ = fontSize × この値
    color: '#FFFFFF',       // デフォルト文字色
    shadowColor: '#000000', // 文字影の色
    displayArea: 1.0,       // 表示領域（動画の上から何割）
    ownerColor: '#FFD600',  // チャンネル主の文字色
    modColor: '#5E84F1',    // モデレーターの文字色
    bgOpacity: 0.35,        // 特殊コメント背景の不透明度 (0.0〜1.0)
  };

  // ─── バッチ処理設定 ───
  const PERF = {
    batchDelay: 80,      // バッチ処理の間隔 (ms)
    batchSize: 10,       // 1回に処理する最大件数
    maxQueueSize: 60,    // キューの最大サイズ（超過分は古いものを捨てる）
    skipWhenHidden: true, // タブ非表示時はスキップ
  };

  // ─── スーパーチャット / スティッカーのCSS変数マップ ───
  const PAID_TAGS = {
    'yt-live-chat-paid-message-renderer': '--yt-live-chat-paid-message-primary-color',
    'yt-live-chat-paid-sticker-renderer': '--yt-live-chat-paid-sticker-background-color',
  };

  const DANMAKU_ICON_VIEWBOX = '0 0 796 796';
  const DANMAKU_ICON_OFF_PATH = 'M 58.8 -754.8 L 45.6 -734.4 L 38.4 -718.8 L 38.4 -716.4 L 34.8 -708 L 33.6 -699.6 L 32.4 -698.4 L 31.2 -682.8 L 30 -681.6 L 30 -218.4 L 31.2 -217.2 L 32.4 -202.8 L 36 -193.2 L 36 -189.6 L 48 -163.2 L 61.2 -144 L 80.4 -124.8 L 90 -117.6 L 111.6 -105.6 L 114 -105.6 L 123.6 -100.8 L 130.8 -99.6 L 135.6 -97.2 L 141.6 -97.2 L 142.8 -96 L 148.8 -96 L 150 -94.8 L 214.8 -94.8 L 238.8 -67.2 L 238.8 -66 L 244.8 -60 L 244.8 -58.8 L 250.8 -52.8 L 250.8 -51.6 L 256.8 -45.6 L 262.8 -37.2 L 270 -30 L 274.8 -22.8 L 283.2 -15.6 L 288 -13.2 L 296.4 -12 L 297.6 -10.8 L 309.6 -12 L 313.2 -14.4 L 315.6 -14.4 L 322.8 -19.2 L 390 -94.8 L 562.8 -94.8 L 573.6 -84 L 573.6 -82.8 L 583.2 -73.2 L 583.2 -72 L 633.6 -16.8 L 644.4 -12 L 656.4 -10.8 L 657.6 -12 L 666 -13.2 L 678 -21.6 L 687.6 -34.8 L 694.8 -42 L 694.8 -43.2 L 700.8 -49.2 L 706.8 -57.6 L 739.2 -94.8 L 804 -94.8 L 805.2 -96 L 818.4 -97.2 L 819.6 -98.4 L 823.2 -98.4 L 824.4 -99.6 L 834 -102 L 837.6 -104.4 L 840 -104.4 L 846 -108 L 850.8 -109.2 L 871.2 -122.4 L 890.4 -140.4 L 890.4 -141.6 L 898.8 -151.2 L 906 -162 L 915.6 -181.2 L 916.8 -187.2 L 919.2 -190.8 L 919.2 -194.4 L 921.6 -200.4 L 921.6 -205.2 L 922.8 -206.4 L 922.8 -212.4 L 924 -213.6 L 924 -333.6 L 925.2 -334.8 L 924 -336 L 924 -409.2 L 925.2 -410.4 L 924 -412.8 L 924 -428.4 L 925.2 -429.6 L 925.2 -445.2 L 924 -446.4 L 924 -639.6 L 925.2 -640.8 L 925.2 -654 L 924 -655.2 L 924 -687.6 L 922.8 -688.8 L 922.8 -696 L 921.6 -697.2 L 920.4 -706.8 L 919.2 -708 L 915.6 -721.2 L 906 -740.4 L 894 -757.2 L 873.6 -777.6 L 858 -788.4 L 840 -798 L 837.6 -798 L 834 -800.4 L 831.6 -800.4 L 823.2 -804 L 813.6 -805.2 L 812.4 -806.4 L 806.4 -806.4 L 805.2 -807.6 L 795.6 -807.6 L 794.4 -808.8 L 582 -808.8 L 580.8 -810 L 673.2 -902.4 L 676.8 -907.2 L 680.4 -915.6 L 681.6 -926.4 L 680.4 -927.6 L 679.2 -936 L 675.6 -943.2 L 668.4 -950.4 L 657.6 -955.2 L 643.2 -955.2 L 642 -954 L 636 -952.8 L 633.6 -950.4 L 630 -949.2 L 610.8 -930 L 610.8 -928.8 L 608.4 -927.6 L 607.2 -925.2 L 604.8 -924 L 601.2 -919.2 L 598.8 -918 L 592.8 -912 L 592.8 -910.8 L 589.2 -908.4 L 586.8 -904.8 L 584.4 -903.6 L 583.2 -901.2 L 578.4 -896.4 L 577.2 -896.4 L 577.2 -895.2 L 565.2 -883.2 L 564 -883.2 L 564 -882 L 560.4 -879.6 L 554.4 -873.6 L 554.4 -872.4 L 546 -864 L 544.8 -864 L 544.8 -862.8 L 490.8 -808.8 L 464.4 -808.8 L 326.4 -948 L 319.2 -952.8 L 316.8 -952.8 L 312 -955.2 L 296.4 -955.2 L 286.8 -950.4 L 279.6 -943.2 L 276 -937.2 L 274.8 -930 L 273.6 -928.8 L 273.6 -920.4 L 278.4 -907.2 L 280.8 -903.6 L 374.4 -810 L 373.2 -808.8 L 160.8 -808.8 L 159.6 -807.6 L 141.6 -806.4 L 140.4 -805.2 L 127.2 -802.8 L 123.6 -800.4 L 117.6 -799.2 L 98.4 -789.6 L 75.6 -772.8 Z M 105.6 -714 L 121.2 -730.8 L 132 -738 L 150 -745.2 L 163.2 -746.4 L 164.4 -747.6 L 788.4 -747.6 L 789.6 -746.4 L 799.2 -746.4 L 800.4 -745.2 L 805.2 -745.2 L 806.4 -744 L 812.4 -742.8 L 831.6 -732 L 846 -717.6 L 852 -709.2 L 858 -696 L 858 -693.6 L 860.4 -688.8 L 860.4 -682.8 L 861.6 -681.6 L 861.6 -220.8 L 860.4 -219.6 L 860.4 -214.8 L 859.2 -213.6 L 858 -206.4 L 849.6 -189.6 L 831.6 -170.4 L 814.8 -160.8 L 812.4 -160.8 L 804 -157.2 L 798 -157.2 L 796.8 -156 L 716.4 -156 L 715.2 -154.8 L 711.6 -154.8 L 702 -150 L 652.8 -90 L 644.4 -98.4 L 644.4 -99.6 L 601.2 -148.8 L 590.4 -154.8 L 586.8 -154.8 L 585.6 -156 L 368.4 -156 L 367.2 -154.8 L 363.6 -154.8 L 352.8 -148.8 L 301.2 -90 L 296.4 -94.8 L 288 -106.8 L 280.8 -114 L 266.4 -133.2 L 259.2 -140.4 L 255.6 -146.4 L 249.6 -151.2 L 242.4 -154.8 L 238.8 -154.8 L 237.6 -156 L 158.4 -156 L 157.2 -157.2 L 151.2 -157.2 L 150 -158.4 L 142.8 -159.6 L 126 -168 L 121.2 -171.6 L 104.4 -189.6 L 96 -206.4 L 94.8 -213.6 L 93.6 -214.8 L 93.6 -219.6 L 92.4 -220.8 L 92.4 -681.6 L 93.6 -682.8 L 93.6 -687.6 L 94.8 -688.8 L 94.8 -692.4 L 97.2 -696 L 97.2 -698.4 Z M 369.6 -631.2 L 368.4 -630 L 361.2 -628.8 L 350.4 -621.6 L 344.4 -614.4 L 339.6 -604.8 L 339.6 -601.2 L 338.4 -600 L 338.4 -300 L 339.6 -298.8 L 339.6 -295.2 L 342 -289.2 L 354 -276 L 363.6 -271.2 L 367.2 -271.2 L 368.4 -270 L 381.6 -270 L 382.8 -271.2 L 390 -272.4 L 397.2 -276 L 399.6 -278.4 L 403.2 -279.6 L 405.6 -282 L 427.2 -294 L 433.2 -298.8 L 442.8 -303.6 L 448.8 -308.4 L 458.4 -313.2 L 464.4 -318 L 474 -322.8 L 480 -327.6 L 483.6 -328.8 L 486 -331.2 L 501.6 -339.6 L 507.6 -344.4 L 523.2 -352.8 L 529.2 -357.6 L 538.8 -362.4 L 544.8 -367.2 L 550.8 -369.6 L 576 -386.4 L 579.6 -387.6 L 597.6 -399.6 L 613.2 -408 L 622.8 -415.2 L 628.8 -417.6 L 639.6 -427.2 L 646.8 -440.4 L 646.8 -445.2 L 648 -446.4 L 648 -458.4 L 646.8 -459.6 L 645.6 -466.8 L 640.8 -475.2 L 627.6 -487.2 L 618 -492 L 612 -496.8 L 596.4 -505.2 L 586.8 -512.4 L 574.8 -518.4 L 553.2 -532.8 L 547.2 -535.2 L 529.2 -547.2 L 525.6 -548.4 L 505.2 -561.6 L 499.2 -564 L 493.2 -568.8 L 487.2 -571.2 L 475.2 -579.6 L 469.2 -582 L 463.2 -586.8 L 457.2 -589.2 L 454.8 -591.6 L 451.2 -592.8 L 436.8 -602.4 L 430.8 -604.8 L 424.8 -609.6 L 418.8 -612 L 410.4 -618 L 404.4 -620.4 L 396 -626.4 L 382.8 -631.2 Z M 400.8 -552 L 403.2 -550.8 L 402 -548.4 L 403.2 -548.4 L 402 -549.6 L 404.4 -550.8 L 406.8 -548.4 L 410.4 -547.2 L 412.8 -544.8 L 434.4 -532.8 L 440.4 -528 L 444 -526.8 L 458.4 -517.2 L 464.4 -514.8 L 470.4 -510 L 474 -508.8 L 476.4 -506.4 L 498 -494.4 L 504 -489.6 L 519.6 -481.2 L 541.2 -466.8 L 562.8 -454.8 L 566.4 -451.2 L 555.6 -444 L 552 -442.8 L 549.6 -440.4 L 546 -439.2 L 543.6 -436.8 L 540 -435.6 L 534 -430.8 L 524.4 -426 L 518.4 -421.2 L 508.8 -416.4 L 502.8 -411.6 L 499.2 -410.4 L 496.8 -408 L 475.2 -396 L 469.2 -391.2 L 459.6 -386.4 L 453.6 -381.6 L 441.6 -375.6 L 432 -368.4 L 428.4 -367.2 L 422.4 -362.4 L 418.8 -361.2 L 416.4 -358.8 L 412.8 -357.6 L 402 -350.4 L 399.6 -351.6 L 399.6 -550.8 Z';
  const DANMAKU_ICON_ON_PATH = 'M 49 171 L 38 188 L 32 201 L 32 203 L 29 210 L 28 217 L 27 218 L 26 231 L 25 232 L 25 618 L 26 619 L 27 631 L 30 639 L 30 642 L 40 664 L 51 680 L 67 696 L 75 702 L 93 712 L 95 712 L 103 716 L 109 717 L 113 719 L 118 719 L 119 720 L 124 720 L 125 721 L 179 721 L 199 744 L 199 745 L 204 750 L 204 751 L 209 756 L 209 757 L 214 762 L 219 769 L 225 775 L 229 781 L 236 787 L 240 789 L 247 790 L 248 791 L 258 790 L 261 788 L 263 788 L 269 784 L 325 721 L 469 721 L 478 730 L 478 731 L 486 739 L 486 740 L 528 786 L 537 790 L 547 791 L 548 790 L 555 789 L 565 782 L 573 771 L 579 765 L 579 764 L 584 759 L 589 752 L 616 721 L 670 721 L 671 720 L 682 719 L 683 718 L 686 718 L 687 717 L 695 715 L 698 713 L 700 713 L 705 710 L 709 709 L 726 698 L 742 683 L 742 682 L 749 674 L 755 665 L 763 649 L 764 644 L 766 641 L 766 638 L 768 633 L 768 629 L 769 628 L 769 623 L 770 622 L 770 522 L 771 521 L 770 520 L 770 459 L 771 458 L 770 456 L 770 443 L 771 442 L 771 429 L 770 428 L 770 267 L 771 266 L 771 255 L 770 254 L 770 227 L 769 226 L 769 220 L 768 219 L 767 211 L 766 210 L 763 199 L 755 183 L 745 169 L 728 152 L 715 143 L 700 135 L 698 135 L 695 133 L 693 133 L 686 130 L 678 129 L 677 128 L 672 128 L 671 127 L 663 127 L 662 126 L 485 126 L 484 125 L 561 48 L 564 44 L 567 37 L 568 28 L 567 27 L 566 20 L 563 14 L 557 8 L 548 4 L 536 4 L 535 5 L 530 6 L 528 8 L 525 9 L 509 25 L 509 26 L 507 27 L 506 29 L 504 30 L 501 34 L 499 35 L 494 40 L 494 41 L 491 43 L 489 46 L 487 47 L 486 49 L 482 53 L 481 53 L 481 54 L 471 64 L 470 64 L 470 65 L 467 67 L 462 72 L 462 73 L 455 80 L 454 80 L 454 81 L 409 126 L 387 126 L 272 10 L 266 6 L 264 6 L 260 4 L 247 4 L 239 8 L 233 14 L 230 19 L 229 25 L 228 26 L 228 33 L 232 44 L 234 47 L 312 125 L 311 126 L 134 126 L 133 127 L 118 128 L 117 129 L 106 131 L 103 133 L 98 134 L 82 142 L 63 156 Z M 334 340 L 336 341 L 335 343 L 336 343 L 335 342 L 337 341 L 339 343 L 342 344 L 344 346 L 362 356 L 367 360 L 370 361 L 382 369 L 387 371 L 392 375 L 395 376 L 397 378 L 415 388 L 420 392 L 433 399 L 451 411 L 469 421 L 472 424 L 463 430 L 460 431 L 458 433 L 455 434 L 453 436 L 450 437 L 445 441 L 437 445 L 432 449 L 424 453 L 419 457 L 416 458 L 414 460 L 396 470 L 391 474 L 383 478 L 378 482 L 368 487 L 360 493 L 357 494 L 352 498 L 349 499 L 347 501 L 344 502 L 335 508 L 333 507 L 333 341 Z';
  const DANMAKU_TOGGLE_LABELS = {
    ja: {
      title: '弾幕',
      enable: '弾幕をオンにする',
      disable: '弾幕をオフにする',
      shortcutText: 'Alt + L',
      ariaShortcut: 'キーボード ショートカット Alt+L',
    },
    en: {
      title: 'Danmaku',
      enable: 'Turn on danmaku',
      disable: 'Turn off danmaku',
      shortcutText: 'Alt + L',
      ariaShortcut: 'keyboard shortcut Alt+L',
    },
  };
  const DANMAKU_TOGGLE_SHORTCUT = 'Alt+L';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ─── DOM生成ヘルパー ───
  // h('div', { className: 'foo', style: 'color:red' }, [child1, 'text'])
  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (k === 'style') el.style.cssText = v;
      else el[k] = v;
    }
    if (children != null) {
      const list = Array.isArray(children) ? children : [children];
      for (const c of list) {
        if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return el;
  }

  // ─── 動的フォントサイズ（画面サイズから自動計算）───
  let fontSize = 32; // 初期値（overlay作成後に上書き）

  function updateFontSize() {
    if (!overlayHeight) return;
    fontSize = Math.floor(overlayHeight * CONFIG.displayArea / (CONFIG.maxLines * CONFIG.lineHeightRatio));
    if (overlay) overlay.style.setProperty('--yt-danmaku-fs', fontSize + 'px');
  }

  // ─── 映像領域に合わせてオーバーレイの位置・サイズを更新 ───
  function updateOverlayBounds() {
    if (!overlay) return;
    const player = document.querySelector('#movie_player');
    const host = overlay.parentElement;
    if (!player || !host) return;
    const video = player.querySelector('video');
    const playerRect = player.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const baseLeft = playerRect.left - hostRect.left;
    const baseTop = playerRect.top - hostRect.top;

    if (!video || !video.videoWidth || !video.videoHeight) {
      // 映像情報が未取得の場合はフル表示
      overlay.style.top = baseTop + 'px';
      overlay.style.left = baseLeft + 'px';
      overlay.style.width = player.clientWidth + 'px';
      overlay.style.height = player.clientHeight + 'px';
      overlayWidth = player.clientWidth;
      overlayHeight = player.clientHeight;
      overlay.style.setProperty('--yt-danmaku-w', overlayWidth + 'px');
      updateFontSize();
      return;
    }

    const playerW = player.clientWidth;
    const playerH = player.clientHeight;
    const videoAspect = video.videoWidth / video.videoHeight;
    const playerAspect = playerW / playerH;

    let renderW, renderH, offsetX, offsetY;

    if (playerAspect > videoAspect) {
      // プレイヤーが横長 → 左右に黒帯（ピラーボックス）
      renderH = playerH;
      renderW = playerH * videoAspect;
      offsetX = (playerW - renderW) / 2;
      offsetY = 0;
    } else {
      // プレイヤーが縦長 → 上下に黒帯（レターボックス）
      renderW = playerW;
      renderH = playerW / videoAspect;
      offsetX = 0;
      offsetY = (playerH - renderH) / 2;
    }

    overlay.style.top = (baseTop + offsetY) + 'px';
    overlay.style.left = (baseLeft + offsetX) + 'px';
    overlay.style.width = renderW + 'px';
    overlay.style.height = renderH + 'px';
    overlayWidth = renderW;
    overlayHeight = renderH;
    overlay.style.setProperty('--yt-danmaku-w', overlayWidth + 'px');
    updateFontSize();
  }

  // ─── 共通スタイルの注入 ───
  function injectStyles() {
    if (document.getElementById('yt-danmaku-style')) return;
    const style = document.createElement('style');
    style.id = 'yt-danmaku-style';
    style.textContent = `
      #yt-danmaku-overlay {
        position: absolute;
        top: 0; left: 0; width: 100%; height: 100%;
        pointer-events: none;
        overflow: hidden;
        z-index: 11;
        contain: layout paint;
      }
      #movie_player .ytp-caption-window-container {
        z-index: 12;
      }
      @keyframes yt-danmaku-scroll {
        from { transform: translateX(0); }
        to   { transform: translateX(calc(-100% - var(--yt-danmaku-w, 1600px) - 20px)); }
      }
      .yt-danmaku-item {
        position: absolute;
        white-space: nowrap;
        left: 100%;
        font-family: ${CONFIG.fontFamily};
        font-weight: ${CONFIG.fontWeight};
        opacity: ${CONFIG.opacity};
        pointer-events: none;
        text-shadow:
          1px 1px 2px ${CONFIG.shadowColor},
          -1px -1px 2px ${CONFIG.shadowColor},
          1px -1px 2px ${CONFIG.shadowColor},
          -1px 1px 2px ${CONFIG.shadowColor};
        backface-visibility: hidden;
      }
      .yt-danmaku-emoji {
        height: var(--yt-danmaku-fs, 32px);
        width: var(--yt-danmaku-fs, 32px);
        vertical-align: middle;
        margin: 0 1px;
        object-fit: contain;
      }
      .yt-danmaku-toggle-button {
        position: relative;
      }
      .yt-danmaku-toggle-button .yt-danmaku-toggle-button__icon {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 22px;
        height: 22px;
        pointer-events: none;
        transform: translate(-50%, -50%);
      }
      .yt-danmaku-toggle-button .yt-danmaku-toggle-button__icon path {
        fill: #fff;
      }
      .yt-danmaku-toggle-tooltip.ytp-tooltip {
        position: absolute;
        z-index: 2024;
        display: block;
        max-width: 300px;
        bottom: auto;
        pointer-events: none;
        color: #eee;
        font-family: "YouTube Noto", Roboto, Arial, Helvetica, sans-serif;
        font-size: 12.98px;
        font-weight: 500;
        line-height: 15px;
      }
      .yt-danmaku-toggle-tooltip .ytp-tooltip-text-wrapper {
        position: relative;
        z-index: 1;
        padding: 0;
      }
      .yt-danmaku-toggle-tooltip .ytp-tooltip-bottom-text {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px 9px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.3);
        color: #eee;
        white-space: nowrap;
      }
      .yt-danmaku-toggle-tooltip .ytp-tooltip-text {
        display: inline-block;
      }
      .yt-danmaku-toggle-tooltip .ytp-tooltip-keyboard-shortcut {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 11px;
        min-height: 15px;
        padding: 0 2px;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: #fff;
        font-size: 12.98px;
        font-weight: 500;
        line-height: 15px;
      }
    `;
    document.head.appendChild(style);
  }

  // メッセージ要素からDOMノード群をクローンして返す（空なら null）
  // isEmptyMessage() と cloneMessageNodes() を統合し、1回の走査で処理
  function buildMessageFragment(msgEl) {
    const fragment = document.createDocumentFragment();
    let hasContent = false;

    function walk(node, parentFragment) {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) { // TEXT_NODE
          const text = child.textContent || '';
          if (text.trim()) hasContent = true;
          if (text) parentFragment.appendChild(document.createTextNode(text));
        } else if (child.nodeType === 1) { // ELEMENT_NODE
          if (child.localName === 'img') {
            const src = child.getAttribute('src');
            if (src) {
              hasContent = true;
              parentFragment.appendChild(h('img', { src, alt: child.getAttribute('alt') || '', className: 'yt-danmaku-emoji' }));
            }
          } else {
            walk(child, parentFragment);
          }
        }
      }
    }

    walk(msgEl, fragment);
    return hasContent ? fragment : null;
  }

  // チャットノードからメタ情報を抽出
  function extractChatInfo(node) {
    const tagName = node.localName;
    const authorType = node.getAttribute('author-type');
    const paidColorProp = PAID_TAGS[tagName];
    const isMembership = tagName === 'yt-live-chat-membership-item-renderer';
    const isOwner = authorType === 'owner';
    const isModerator = authorType === 'moderator';
    const isSpecial = Boolean(paidColorProp || isMembership || isOwner || isModerator);

    const info = {
      tagName,
      authorType,
      authorName: '',
      photoSrc: null,
      badgeSrc: null,
      amount: null,
      bgColor: null,
      textColor: isOwner ? CONFIG.ownerColor : isModerator ? CONFIG.modColor : CONFIG.color,
      isSpecial,
    };

    if (!isSpecial) return info;

    const authorNameEl = node.querySelector('#author-name');
    const photoEl = node.querySelector('#author-photo img');
    const badgeEl = node.querySelector('#chat-badges yt-live-chat-author-badge-renderer img');
    info.authorName = authorNameEl ? (authorNameEl.textContent || '').trim() : '';
    info.photoSrc = photoEl ? photoEl.getAttribute('src') : null;
    info.badgeSrc = badgeEl ? badgeEl.getAttribute('src') : null;

    // スーパーチャット / スティッカースパチャ（テーブル駆動で統合）
    // ※ YouTube は低額帯(緑・水色)で header-color を黒に設定するが、
    //   弾幕は動画上に表示するため文字色は常に白を使う
    if (paidColorProp) {
      const amountEl = node.querySelector('#purchase-amount, #purchase-amount-chip');
      info.amount = amountEl ? (amountEl.textContent || '').trim() : null;
      info.bgColor = getComputedStyle(node).getPropertyValue(paidColorProp).trim() || 'rgba(230,33,23,0.8)';
      info.textColor = '#FFFFFF';
    }

    // メンバー加入
    if (isMembership) {
      info.bgColor = 'rgba(15,157,88,0.8)';
    }

    // 背景色の不透明度をCONFIG.bgOpacityで上書き
    if (info.bgColor) {
      const m = info.bgColor.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
      if (m) info.bgColor = `rgba(${m[1]},${m[2]},${m[3]},${CONFIG.bgOpacity})`;
    }

    return info;
  }

  // ─── 対象メッセージのタグ名 ───
  const MESSAGE_TAGS = new Set([
    'yt-live-chat-text-message-renderer',
    'yt-live-chat-paid-message-renderer',
    'yt-live-chat-paid-sticker-renderer',
    'yt-live-chat-membership-item-renderer',
  ]);

  // ─── メインロジック ───
  let overlay = null;
  let overlayWidth = 0;
  let overlayHeight = 0;
  let resizeObserver = null;
  let laneTracker = []; // 各レーンの最後のコメント情報 { startTime, speed, width }
  let enabled = true;
  let watchSession = 0;
  let chatObserver = null;
  let chatItemsHostObserver = null;
  let chatObservedItems = null;
  let chatItemsHost = null;
  let pageObserver = null;
  let waitPlayerObserver = null;
  let controlsObserver = null;
  let danmakuToggleButton = null;
  let danmakuToggleTooltip = null;
  let chatRetryTimer = 0;
  let chatFrameLoadTarget = null;
  let chatFrameLoadHandler = null;
  let chatFrameLoadSession = 0;
  const processedIds = new Set(); // 重複コメント排除用
  const processedIdQueue = [];   // FIFO順で管理
  const channelNameTimers = new Set();

  // ── バッチ処理キュー ──
  let pendingNodes = [];
  let flushTimer = 0;

  function clearTimeoutId(timerId) {
    if (timerId) clearTimeout(timerId);
    return 0;
  }

  function disconnectObserver(observer) {
    if (observer) observer.disconnect();
    return null;
  }

  function nextWatchSession() {
    watchSession += 1;
    return watchSession;
  }

  function isActiveWatchSession(session) {
    return session === watchSession;
  }

  function clearChannelNameTimers() {
    for (const timerId of channelNameTimers) clearTimeout(timerId);
    channelNameTimers.clear();
  }

  function detachChatFrameLoad() {
    if (chatFrameLoadTarget && chatFrameLoadHandler) {
      chatFrameLoadTarget.removeEventListener('load', chatFrameLoadHandler);
    }
    chatFrameLoadTarget = null;
    chatFrameLoadHandler = null;
    chatFrameLoadSession = 0;
  }

  function stopChatTracking() {
    chatObserver = disconnectObserver(chatObserver);
    chatItemsHostObserver = disconnectObserver(chatItemsHostObserver);
    pageObserver = disconnectObserver(pageObserver);
    chatObservedItems = null;
    chatItemsHost = null;
    chatRetryTimer = clearTimeoutId(chatRetryTimer);
    detachChatFrameLoad();
  }

  function stopPlayerWait() {
    waitPlayerObserver = disconnectObserver(waitPlayerObserver);
  }

  function stopControlsObserver() {
    controlsObserver = disconnectObserver(controlsObserver);
    hideDanmakuToggleTooltip();
    if (danmakuToggleButton && danmakuToggleButton.isConnected) danmakuToggleButton.remove();
    danmakuToggleButton = null;
  }

  function stopOverlay() {
    resizeObserver = disconnectObserver(resizeObserver);
    if (overlay && overlay.isConnected) overlay.remove();
    overlay = null;
    overlayWidth = 0;
    overlayHeight = 0;
  }

  function resetWatchState(clearProcessed) {
    nextWatchSession();
    stopChatTracking();
    stopPlayerWait();
    stopControlsObserver();
    stopOverlay();
    resetRuntimeState(clearProcessed);
  }

  function waitForPlayer(session) {
    waitPlayerObserver = disconnectObserver(waitPlayerObserver);
    waitPlayerObserver = new MutationObserver(() => {
      if (!isActiveWatchSession(session)) return;
      if (!document.querySelector('#movie_player')) return;
      waitPlayerObserver = disconnectObserver(waitPlayerObserver);
      overlay = createOverlay();
      if (overlay) {
        startControlsObserver(session);
        waitForChat(session);
      }
    });
    waitPlayerObserver.observe(document.body, { childList: true, subtree: true });
  }

  function startWatchSession(session) {
    overlay = createOverlay();
    if (overlay) {
      startControlsObserver(session);
      waitForChat(session);
      return;
    }
    waitForPlayer(session);
  }

  function createDanmakuToggleButton() {
    const button = document.createElement('button');
    button.className = 'ytp-button yt-danmaku-toggle-button';
    button.type = 'button';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.classList.add('yt-danmaku-toggle-button__icon');
    svg.setAttribute('viewBox', DANMAKU_ICON_VIEWBOX);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('fill-rule', 'evenodd');
    svg.appendChild(path);
    button.appendChild(svg);

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDanmaku();
    });
    button.addEventListener('mouseenter', showDanmakuToggleTooltip);
    button.addEventListener('focus', showDanmakuToggleTooltip);
    button.addEventListener('mouseleave', hideDanmakuToggleTooltip);
    button.addEventListener('blur', hideDanmakuToggleTooltip);

    return button;
  }

  function getDanmakuToggleLabels() {
    const lang = (document.documentElement.lang || navigator.language || '').toLowerCase();
    return lang.startsWith('ja') ? DANMAKU_TOGGLE_LABELS.ja : DANMAKU_TOGGLE_LABELS.en;
  }

  function createDanmakuToggleTooltip() {
    const labels = getDanmakuToggleLabels();
    return h('div', { className: 'yt-danmaku-toggle-tooltip ytp-tooltip ytp-bottom' }, [
      h('div', { className: 'ytp-tooltip-text-wrapper', ariaHidden: 'true' }, [
        h('div', { className: 'ytp-tooltip-bottom-text' }, [
          h('span', { className: 'ytp-tooltip-text' }, labels.title),
          h('div', { className: 'ytp-tooltip-keyboard-shortcut' }, labels.shortcutText),
        ]),
      ]),
    ]);
  }

  function showDanmakuToggleTooltip() {
    if (!danmakuToggleButton || !danmakuToggleButton.isConnected) return;

    const player = document.querySelector('#movie_player');
    if (!player) return;

    if (!danmakuToggleTooltip || !danmakuToggleTooltip.isConnected) {
      danmakuToggleTooltip = createDanmakuToggleTooltip();
      player.appendChild(danmakuToggleTooltip);
    }

    const buttonRect = danmakuToggleButton.getBoundingClientRect();
    const playerRect = player.getBoundingClientRect();
    const tooltipRect = danmakuToggleTooltip.getBoundingClientRect();
    const left = buttonRect.left - playerRect.left + (buttonRect.width / 2) - (tooltipRect.width / 2);
    const top = buttonRect.top - playerRect.top - tooltipRect.height - 22;

    danmakuToggleTooltip.style.left = Math.max(8, left) + 'px';
    danmakuToggleTooltip.style.top = Math.max(8, top) + 'px';
    danmakuToggleTooltip.style.bottom = 'auto';
  }

  function hideDanmakuToggleTooltip() {
    if (danmakuToggleTooltip && danmakuToggleTooltip.isConnected) danmakuToggleTooltip.remove();
    danmakuToggleTooltip = null;
  }

  function syncDanmakuToggleButtonState() {
    if (!danmakuToggleButton) return;

    const labels = getDanmakuToggleLabels();
    const nextLabel = enabled ? labels.disable : labels.enable;
    const path = danmakuToggleButton.querySelector('path');
    const svg = danmakuToggleButton.querySelector('svg');
    if (path && svg) {
      if (enabled) {
        svg.setAttribute('viewBox', DANMAKU_ICON_VIEWBOX);
        path.setAttribute('d', DANMAKU_ICON_ON_PATH);
        path.removeAttribute('stroke');
        path.removeAttribute('stroke-width');
        path.removeAttribute('stroke-linejoin');
        path.removeAttribute('stroke-linecap');
      } else {
        svg.setAttribute('viewBox', '0 -960 960 960');
        path.setAttribute('d', DANMAKU_ICON_OFF_PATH);
        path.setAttribute('stroke', '#fff');
        path.setAttribute('stroke-width', '25.0');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('stroke-linecap', 'round');
      }
    }

    danmakuToggleButton.classList.toggle('yt-danmaku-toggle-button--enabled', enabled);
    danmakuToggleButton.setAttribute('aria-label', nextLabel + ' ' + labels.ariaShortcut);
    danmakuToggleButton.setAttribute('aria-keyshortcuts', DANMAKU_TOGGLE_SHORTCUT);
    danmakuToggleButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    danmakuToggleButton.setAttribute('title', '');
    danmakuToggleButton.setAttribute('data-title-no-tooltip', labels.title);
    danmakuToggleButton.setAttribute('data-tooltip-title', labels.title);
  }

  function ensureDanmakuToggleButton() {
    // チャットパネルが存在しない、または非表示(collapsed)の場合はボタンを隠す
    const chatContainer = document.querySelector('ytd-live-chat-frame#chat');
    const chatFrame = document.querySelector('#chatframe');
    const chatVisible = chatFrame && chatContainer && !chatContainer.hasAttribute('collapsed') && !chatContainer.hidden;
    if (!chatVisible) {
      if (danmakuToggleButton && danmakuToggleButton.isConnected) danmakuToggleButton.remove();
      return false;
    }

    const rightControls = document.querySelector('#movie_player .ytp-right-controls');
    const subtitlesButton = rightControls ? rightControls.querySelector('.ytp-subtitles-button') : null;
    if (!rightControls || !subtitlesButton) return false;

    const insertionParent = subtitlesButton.parentNode;
    if (!insertionParent || !rightControls.contains(insertionParent)) return false;

    if (!danmakuToggleButton || !danmakuToggleButton.isConnected) {
      danmakuToggleButton = createDanmakuToggleButton();
    }

    syncDanmakuToggleButtonState();

    if (danmakuToggleButton.parentNode !== insertionParent || danmakuToggleButton.nextSibling !== subtitlesButton) {
      insertionParent.insertBefore(danmakuToggleButton, subtitlesButton);
    }

    return true;
  }

  function startControlsObserver(session) {
    controlsObserver = disconnectObserver(controlsObserver);
    ensureDanmakuToggleButton();

    const player = document.querySelector('#movie_player');
    if (!player) return;

    controlsObserver = new MutationObserver(() => {
      if (!isActiveWatchSession(session)) return;
      ensureDanmakuToggleButton();
    });
    controlsObserver.observe(player, { childList: true, subtree: true });
  }

  function toggleDanmaku() {
    enabled = !enabled;
    if (!enabled && overlay) overlay.textContent = '';
    resetRuntimeState(false);
    syncDanmakuToggleButtonState();
  }

  function enqueueNode(node) {
    if (!node || node.nodeType !== 1) return;
    pendingNodes.push(node);
    // キューが溢れたら古いものを捨てる
    if (pendingNodes.length > PERF.maxQueueSize) {
      pendingNodes.splice(0, pendingNodes.length - PERF.maxQueueSize);
    }
    if (!flushTimer) flushTimer = setTimeout(flushPendingNodes, PERF.batchDelay);
  }

  function flushPendingNodes() {
    flushTimer = 0;
    if (PERF.skipWhenHidden && document.hidden) {
      pendingNodes.length = 0;
      return;
    }
    const batch = pendingNodes.splice(0, PERF.batchSize);
    for (const node of batch) processNode(node);
    // まだキューに残っていれば次のバッチをスケジュール
    if (pendingNodes.length) flushTimer = setTimeout(flushPendingNodes, PERF.batchDelay);
  }

  // ── オーバーレイ作成 ──
  function createOverlay() {
    const player = document.querySelector('#movie_player');
    if (!player) return null;
    const videoLayer = player.querySelector('.html5-video-container');

    const existing = player.querySelector('#yt-danmaku-overlay');
    if (existing) existing.remove();

    injectStyles();

    const el = h('div', { id: 'yt-danmaku-overlay' });
    player.style.position = 'relative';

    if (videoLayer && videoLayer.parentNode === player) {
      videoLayer.insertAdjacentElement('afterend', el);
    } else {
      player.appendChild(el);
    }

    // ResizeObserverでプレイヤーサイズ変更を監視 → 映像領域を再計算
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(() => updateOverlayBounds());
    resizeObserver.observe(player);

    // video のメタデータ読み込み時にも再計算（アスペクト比が確定するタイミング）
    const playerVideo = player.querySelector('video');
    if (playerVideo) playerVideo.addEventListener('loadedmetadata', () => updateOverlayBounds(), { once: true });

    updateOverlayBounds();
    return el;
  }

  // ── レーンの衝突安全判定 ──
  // 前のコメントに新しいコメントが追いつかないか検査
  function isLaneSafe(prev, now, newSpeed) {
    if (!prev) return true; // 空きレーン

    const elapsed = (now - prev.startTime) / 1000; // 秒

    // 前のコメントが画面内に完全に入ったか？ (右端が画面右端を通過)
    if (elapsed < prev.width / prev.speed) return false;

    // 新コメントが遅いか同速なら追いつかない
    if (newSpeed <= prev.speed) return true;

    // 前コメントの右端の現在位置
    const rightEdge = overlayWidth + prev.width - prev.speed * elapsed;
    if (rightEdge <= 0) return true; // 既に画面外

    // 追いつくまでの時間 vs 前コメントが画面外に出るまでの時間
    const gap = overlayWidth - rightEdge;
    return gap / (newSpeed - prev.speed) > rightEdge / prev.speed;
  }

  // ── 行割り当て（衝突検知付き・特殊コメントは2行分確保）──
  function getAvailableLine(tall, newSpeed, newWidth) {
    const now = Date.now();
    const maxLines = CONFIG.maxLines;
    if (laneTracker.length !== maxLines) laneTracker = new Array(maxLines).fill(null);
    const needed = tall ? 2 : 1;
    const info = { startTime: now, speed: newSpeed, width: newWidth };

    for (let i = 0; i <= maxLines - needed; i++) {
      let ok = true;
      for (let j = 0; j < needed; j++) {
        if (!isLaneSafe(laneTracker[i + j], now, newSpeed)) { ok = false; break; }
      }
      if (ok) {
        for (let j = 0; j < needed; j++) laneTracker[i + j] = info;
        return i;
      }
    }
    // 全レーン埋まっている場合: ランダムにフォールバック
    const fallback = Math.floor(Math.random() * (maxLines - needed + 1));
    for (let j = 0; j < needed; j++) laneTracker[fallback + j] = info;
    return fallback;
  }

  // ── 弾幕生成 ──
  function spawnDanmaku(messageFragment, chatInfo) {
    if (!enabled) return;
    if (!overlay || !overlay.isConnected) overlay = createOverlay();
    if (!overlay) return;

    const isSpecial = chatInfo.isSpecial;
    const el = h('div', { className: 'yt-danmaku-item' });
    el.style.color = chatInfo.textColor;

    if (isSpecial && chatInfo.bgColor) {
      el.style.background = chatInfo.bgColor;
      el.style.borderRadius = '8px';
      el.style.padding = '6px 14px';
    }

    if (isSpecial) {
      const smallFs = Math.round(fontSize * 0.55) + 'px';
      const iconSize = Math.round(fontSize * 0.875) + 'px';

      // ── 1行目: アイコン + 名前 + バッジ + 金額 ──
      const headerChildren = [];
      if (chatInfo.photoSrc) {
        headerChildren.push(h('img', {
          src: chatInfo.photoSrc,
          style: `width:${iconSize};height:${iconSize};border-radius:50%;object-fit:cover;flex-shrink:0`,
        }));
      }
      if (chatInfo.authorName) {
        headerChildren.push(h('span', { style: `font-size:${smallFs};opacity:0.9` }, chatInfo.authorName));
      }
      if (chatInfo.badgeSrc) {
        headerChildren.push(h('img', {
          src: chatInfo.badgeSrc,
          style: `width:${smallFs};height:${smallFs};object-fit:contain;flex-shrink:0`,
        }));
      }
      if (chatInfo.amount) {
        headerChildren.push(h('span', { style: `font-size:${smallFs};opacity:0.7` }, ' - '));
        headerChildren.push(h('span', { style: `font-size:${smallFs};opacity:0.9` }, chatInfo.amount));
      }

      el.appendChild(h('div', { style: 'display:flex;align-items:center;gap:6px;margin-bottom:2px' }, headerChildren));
      // ── 2行目: メッセージ本文 ──
      el.appendChild(h('div', { style: `font-size:${fontSize}px` }, messageFragment));
    } else {
      // 通常コメント: 1行表示
      el.appendChild(h('span', { style: `font-size:${fontSize}px` }, messageFragment));
    }

    // DOM に追加して幅を測定（left:100% なので画面外、アニメーション未設定）
    overlay.appendChild(el);
    const elWidth = el.clientWidth;
    const speed = (elWidth + overlayWidth + 20) / CONFIG.duration; // px/s

    // 衝突検知付きレーン割り当て
    const line = getAvailableLine(isSpecial, speed, elWidth);
    const topPos = (line * fontSize * CONFIG.lineHeightRatio) % (overlayHeight * CONFIG.displayArea);

    // 位置とアニメーションを設定（ここからスクロール開始）
    el.style.top = topPos + 'px';
    el.style.animation = `yt-danmaku-scroll ${CONFIG.duration}s linear forwards`;

    // animationend でクリーンアップ（setTimeout のフォールバック付き）
    const cleanup = () => { if (el.parentNode) el.remove(); };
    const fallbackTimer = setTimeout(cleanup, CONFIG.duration * 1000 + 1000);
    el.addEventListener('animationend', () => { clearTimeout(fallbackTimer); cleanup(); }, { once: true });
  }

  // ── チャットメッセージの処理 ──
  function processNode(node) {
    const tagName = node.localName;
    if (!MESSAGE_TAGS.has(tagName)) return;

    // 重複排除: message-id があれば既に処理済みかチェック (FIFO管理)
    const msgId = node.getAttribute('id') || node.getAttribute('message-id');
    if (msgId) {
      if (processedIds.has(msgId)) return;
      processedIds.add(msgId);
      processedIdQueue.push(msgId);
      if (processedIdQueue.length > 500) processedIds.delete(processedIdQueue.shift());
    }

    const chatInfo = extractChatInfo(node);

    // special系（スパチャ・メンバー加入等）で名前が@ハンドルの場合、チャンネル名読み込みを待つ
    if (chatInfo.isSpecial && chatInfo.authorName && chatInfo.authorName.startsWith('@')) {
      waitForChannelName(node, chatInfo, 20, watchSession); // 50ms間隔 × 最大20回 = 最大1秒
      return;
    }

    spawnFromNode(node, chatInfo);
  }

  // special系コメントの@ハンドル → チャンネル名の読み込みを待つ
  function waitForChannelName(node, chatInfo, remaining, session) {
    if (!isActiveWatchSession(session)) return;
    if (remaining <= 0) { spawnFromNode(node, chatInfo); return; }

    const timerId = setTimeout(() => {
      channelNameTimers.delete(timerId);
      if (!isActiveWatchSession(session)) return;
      const el = node.querySelector('#author-name');
      const name = el ? (el.textContent || '').trim() : '';
      if (name.startsWith('@')) {
        waitForChannelName(node, chatInfo, remaining - 1, session);
      } else {
        chatInfo.authorName = name;
        spawnFromNode(node, chatInfo);
      }
    }, 50);
    channelNameTimers.add(timerId);
  }

  // ノードからメッセージを組み立てて弾幕を発射
  function spawnFromNode(node, chatInfo) {
    // メッセージ本文を取得（スティッカーの場合は #sticker にフォールバック）
    const msgEl = node.querySelector('#message');
    const stickerEl = !msgEl ? node.querySelector('#sticker img, #sticker-container img') : null;

    let fragment;
    if (msgEl) {
      fragment = buildMessageFragment(msgEl);
    } else if (stickerEl) {
      // スティッカー画像を弾幕用に生成
      const size = (fontSize * 2) + 'px';
      fragment = document.createDocumentFragment();
      fragment.appendChild(h('img', {
        src: stickerEl.getAttribute('src') || '',
        alt: stickerEl.getAttribute('alt') || 'sticker',
        className: 'yt-danmaku-emoji',
        style: `height:${size};width:${size}`,
      }));
    }

    // 本文なしでも special 系（スパチャ・メンバー加入）はヘッダーだけで表示する
    if (!fragment) {
      if (!chatInfo.isSpecial || !chatInfo.bgColor) return;
      // メンバー加入は #header-subtext にテキストがある場合がある
      const subtext = node.querySelector('#header-subtext');
      if (subtext) fragment = buildMessageFragment(subtext);
      if (!fragment) fragment = document.createDocumentFragment(); // ヘッダーのみ表示
    }

    spawnDanmaku(fragment, chatInfo);
  }

  // ── ランタイム状態リセット ──
  function resetRuntimeState(clearProcessed) {
    laneTracker = [];
    pendingNodes.length = 0;
    clearChannelNameTimers();
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = 0; }
    if (clearProcessed) {
      processedIds.clear();
      processedIdQueue.length = 0;
    }
  }

  // ── Mutation処理（バッチキューに積む）──
  function handleChatMutation(mutations) {
    if (!enabled) return; // OFF時は処理コストを払わない
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) enqueueNode(node);
      }
    }
  }

  // ── iframeのチャットDOMを監視 ──
  function bindChatFrameLoad(chatFrame, session) {
    if (chatFrameLoadTarget === chatFrame && chatFrameLoadSession === session) return;
    detachChatFrameLoad();

    chatFrameLoadHandler = () => {
      if (!isActiveWatchSession(session)) return;
      chatObserver = disconnectObserver(chatObserver);
      chatItemsHostObserver = disconnectObserver(chatItemsHostObserver);
      chatObservedItems = null;
      chatItemsHost = null;
      observeChat(session) || retryObserveChat(0, session);
    };
    chatFrame.addEventListener('load', chatFrameLoadHandler);
    chatFrameLoadTarget = chatFrame;
    chatFrameLoadSession = session;
  }

  function observeChat(session) {
    const chatFrame = document.querySelector('#chatframe');
    if (!chatFrame) return false;
    bindChatFrameLoad(chatFrame, session);

    let chatDoc;
    try { chatDoc = chatFrame.contentDocument; } catch (e) { return false; }
    if (!chatDoc || !chatDoc.body) return false;

    const itemsHost = chatDoc.querySelector('yt-live-chat-item-list-renderer');
    if (itemsHost && chatItemsHost !== itemsHost) {
      chatItemsHostObserver = disconnectObserver(chatItemsHostObserver);
      chatItemsHost = itemsHost;
      chatItemsHostObserver = new MutationObserver(() => {
        if (!isActiveWatchSession(session)) return;
        const nextItems = chatItemsHost ? chatItemsHost.querySelector('#items') : null;
        if (nextItems && nextItems !== chatObservedItems) observeChat(session);
      });
      chatItemsHostObserver.observe(itemsHost, { childList: true });
    }

    const itemList = itemsHost ? itemsHost.querySelector('#items') : chatDoc.querySelector('yt-live-chat-item-list-renderer #items');
    if (!itemList) return false;
    if (chatObservedItems === itemList) return true;

    chatObserver = disconnectObserver(chatObserver);
    chatObserver = new MutationObserver(handleChatMutation);
    chatObserver.observe(itemList, { childList: true });
    chatObservedItems = itemList;
    chatRetryTimer = clearTimeoutId(chatRetryTimer);
    pageObserver = disconnectObserver(pageObserver);
    ensureDanmakuToggleButton();

    return true;
  }

  // ── iframeの準備完了を待つ ──
  function waitForChat(session) {
    if (observeChat(session)) return;

    const chatFrame = document.querySelector('#chatframe');
    if (chatFrame) {
      bindChatFrameLoad(chatFrame, session);
      retryObserveChat(0, session);
      return;
    }

    pageObserver = disconnectObserver(pageObserver);
    pageObserver = new MutationObserver(() => {
      if (!isActiveWatchSession(session)) return;
      const cf = document.querySelector('#chatframe');
      if (!cf) return;
      pageObserver = disconnectObserver(pageObserver);
      bindChatFrameLoad(cf, session);
      ensureDanmakuToggleButton();
      observeChat(session) || retryObserveChat(0, session);
    });
    pageObserver.observe(document.body, { childList: true, subtree: true });
  }

  function retryObserveChat(attempt, session) {
    if (!isActiveWatchSession(session)) return;
    chatRetryTimer = clearTimeoutId(chatRetryTimer);
    if (observeChat(session) || attempt >= 15) return;
    chatRetryTimer = setTimeout(() => {
      chatRetryTimer = 0;
      retryObserveChat(attempt + 1, session);
    }, 1000);
  }

  // ── タブ復帰時にキューをクリア ──
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      pendingNodes.length = 0;
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = 0; }
    }
  });

  // ── Alt+L で弾幕ON/OFF ──
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      toggleDanmaku();
    }
  });

  // ── 動画ページかどうか判定 ──
  function isWatchPage() {
    const path = window.location.pathname;
    return path === '/watch' || path.startsWith('/live/');
  }

  // ── 初期化 ──
  function init() {
    if (!isWatchPage()) return; // 動画ページ以外では何もしない
    const session = nextWatchSession();
    startWatchSession(session);
  }

  init();

  // ── SPA ナビゲーション対応 ──
  document.addEventListener('yt-navigate-finish', () => {
    resetWatchState(true);
    if (!isWatchPage()) return;

    const session = nextWatchSession();
    setTimeout(() => {
      if (!isActiveWatchSession(session) || !isWatchPage()) return;
      startWatchSession(session);
    }, 1500);
  });
})();
