// ==UserScript==
// @name         YouTubeをニコニコ風に
// @namespace    https://github.com/tampermonkey-youtube-danmaku
// @version      2.2.8
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
    maxPerFrame: 10,     // 1フレームに処理する最大件数
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
        color: var(--yt-danmaku-color, ${CONFIG.color});
        font-size: var(--yt-danmaku-fs, 32px);
        font-family: ${CONFIG.fontFamily};
        font-weight: ${CONFIG.fontWeight};
        opacity: ${CONFIG.opacity};
        pointer-events: none;
        text-shadow:
          1px 1px 2px ${CONFIG.shadowColor},
          -1px -1px 2px ${CONFIG.shadowColor},
          1px -1px 2px ${CONFIG.shadowColor},
          -1px 1px 2px ${CONFIG.shadowColor};
      }
      .yt-danmaku-item--running {
        animation: yt-danmaku-scroll ${CONFIG.duration}s linear forwards;
      }
      .yt-danmaku-item--highlighted {
        padding: 6px 14px;
        border-radius: 8px;
        background: var(--yt-danmaku-bg, transparent);
      }
      .yt-danmaku-item__header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 2px;
        font-size: calc(var(--yt-danmaku-fs, 32px) * 0.55);
      }
      .yt-danmaku-item__meta {
        opacity: 0.9;
      }
      .yt-danmaku-item__separator {
        opacity: 0.7;
      }
      .yt-danmaku-item__avatar {
        width: calc(var(--yt-danmaku-fs, 32px) * 0.875);
        height: calc(var(--yt-danmaku-fs, 32px) * 0.875);
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
      }
      .yt-danmaku-item__badge {
        width: calc(var(--yt-danmaku-fs, 32px) * 0.55);
        height: calc(var(--yt-danmaku-fs, 32px) * 0.55);
        object-fit: contain;
        flex-shrink: 0;
      }
      .yt-danmaku-emoji {
        height: var(--yt-danmaku-fs, 32px);
        width: var(--yt-danmaku-fs, 32px);
        vertical-align: middle;
        margin: 0 1px;
        object-fit: contain;
      }
      .yt-danmaku-sticker {
        width: calc(var(--yt-danmaku-fs, 32px) * 2);
        height: calc(var(--yt-danmaku-fs, 32px) * 2);
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
      const chatWindow = node.ownerDocument.defaultView;
      info.bgColor = chatWindow.getComputedStyle(node).getPropertyValue(paidColorProp).trim() || 'rgba(230,33,23,0.8)';
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
  const PROCESSED_ID_LIMIT = 500;
  const CHANNEL_NAME_RETRIES = 20;
  const CHANNEL_NAME_INTERVAL = 50;
  const DISCOVERY_LIMIT = 15000;

  let enabled = true;
  let sessionSequence = 0;
  let currentSession = null;

  const processedIds = new Set();
  const processedIdRing = new Array(PROCESSED_ID_LIMIT);
  let processedIdCursor = 0;
  let processedIdCount = 0;

  const pendingQueue = new Array(PERF.maxQueueSize);
  let pendingQueueHead = 0;
  let pendingQueueSize = 0;
  let pendingFrame = 0;

  const pendingChannelNames = new Map();
  let channelNameTimer = 0;

  function disconnect(observer) {
    if (observer) observer.disconnect();
  }

  function isActiveSession(session) {
    return Boolean(session && session.active && currentSession === session);
  }

  function clearProcessedIds() {
    processedIds.clear();
    processedIdRing.fill(undefined);
    processedIdCursor = 0;
    processedIdCount = 0;
  }

  function rememberMessageId(id) {
    if (!id) return true;
    if (processedIds.has(id)) return false;

    if (processedIdCount === PROCESSED_ID_LIMIT) {
      processedIds.delete(processedIdRing[processedIdCursor]);
    } else {
      processedIdCount += 1;
    }

    processedIdRing[processedIdCursor] = id;
    processedIdCursor = (processedIdCursor + 1) % PROCESSED_ID_LIMIT;
    processedIds.add(id);
    return true;
  }

  function clearPendingQueue() {
    if (pendingFrame) cancelAnimationFrame(pendingFrame);
    pendingFrame = 0;
    pendingQueue.fill(undefined);
    pendingQueueHead = 0;
    pendingQueueSize = 0;
  }

  function clearChannelNameQueue() {
    if (channelNameTimer) clearTimeout(channelNameTimer);
    channelNameTimer = 0;
    pendingChannelNames.clear();
  }

  function resetRuntimeState(session, clearProcessed) {
    clearPendingQueue();
    clearChannelNameQueue();
    if (session) session.laneTracker = [];
    if (clearProcessed) clearProcessedIds();
  }

  function enqueueEntry(entry, session) {
    if (!isActiveSession(session) || !enabled) return;
    if (PERF.skipWhenHidden && document.hidden) return;

    if (pendingQueueSize === PERF.maxQueueSize) {
      pendingQueue[pendingQueueHead] = entry;
      pendingQueueHead = (pendingQueueHead + 1) % PERF.maxQueueSize;
    } else {
      const tail = (pendingQueueHead + pendingQueueSize) % PERF.maxQueueSize;
      pendingQueue[tail] = entry;
      pendingQueueSize += 1;
    }

    if (!pendingFrame) pendingFrame = requestAnimationFrame(flushPendingFrame);
  }

  function dequeueEntry() {
    if (!pendingQueueSize) return null;
    const entry = pendingQueue[pendingQueueHead];
    pendingQueue[pendingQueueHead] = undefined;
    pendingQueueHead = (pendingQueueHead + 1) % PERF.maxQueueSize;
    pendingQueueSize -= 1;
    return entry;
  }

  function deferChannelName(node, chatInfo, session) {
    pendingChannelNames.set(node, {
      chatInfo,
      remaining: CHANNEL_NAME_RETRIES,
      session,
    });
    if (!channelNameTimer) channelNameTimer = setTimeout(pollChannelNames, CHANNEL_NAME_INTERVAL);
  }

  function pollChannelNames() {
    channelNameTimer = 0;

    for (const [node, pending] of pendingChannelNames) {
      if (!isActiveSession(pending.session)) {
        pendingChannelNames.delete(node);
        continue;
      }

      const authorEl = node.querySelector('#author-name');
      const name = authorEl ? (authorEl.textContent || '').trim() : '';
      pending.remaining -= 1;

      if (!name.startsWith('@') || pending.remaining <= 0) {
        if (name) pending.chatInfo.authorName = name;
        pendingChannelNames.delete(node);
        enqueueEntry({ node, chatInfo: pending.chatInfo }, pending.session);
      }
    }

    if (pendingChannelNames.size) {
      channelNameTimer = setTimeout(pollChannelNames, CHANNEL_NAME_INTERVAL);
    }
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

  function hideDanmakuToggleTooltip(session) {
    if (session && session.tooltip && session.tooltip.isConnected) session.tooltip.remove();
    if (session) session.tooltip = null;
  }

  function showDanmakuToggleTooltip(session) {
    if (!isActiveSession(session) || !session.button || !session.button.isConnected) return;
    if (!session.player || !session.player.isConnected) return;

    if (!session.tooltip || !session.tooltip.isConnected) {
      session.tooltip = createDanmakuToggleTooltip();
      session.player.appendChild(session.tooltip);
    }

    const buttonRect = session.button.getBoundingClientRect();
    const playerRect = session.player.getBoundingClientRect();
    const tooltipRect = session.tooltip.getBoundingClientRect();
    const left = buttonRect.left - playerRect.left + (buttonRect.width - tooltipRect.width) / 2;
    const top = buttonRect.top - playerRect.top - tooltipRect.height - 22;

    session.tooltip.style.left = Math.max(8, left) + 'px';
    session.tooltip.style.top = Math.max(8, top) + 'px';
    session.tooltip.style.bottom = 'auto';
  }

  function syncDanmakuToggleButtonState(session) {
    if (!session || !session.button) return;
    const labels = getDanmakuToggleLabels();
    const nextLabel = enabled ? labels.disable : labels.enable;

    if (session.buttonPath) {
      const svg = session.buttonPath.ownerSVGElement;
      if (enabled) {
        if (svg) svg.setAttribute('viewBox', DANMAKU_ICON_VIEWBOX);
        session.buttonPath.setAttribute('d', DANMAKU_ICON_ON_PATH);
        session.buttonPath.removeAttribute('stroke');
        session.buttonPath.removeAttribute('stroke-width');
        session.buttonPath.removeAttribute('stroke-linejoin');
        session.buttonPath.removeAttribute('stroke-linecap');
      } else {
        if (svg) svg.setAttribute('viewBox', '0 -960 960 960');
        session.buttonPath.setAttribute('d', DANMAKU_ICON_OFF_PATH);
        session.buttonPath.setAttribute('stroke', '#fff');
        session.buttonPath.setAttribute('stroke-width', '25.0');
        session.buttonPath.setAttribute('stroke-linejoin', 'round');
        session.buttonPath.setAttribute('stroke-linecap', 'round');
      }
    }

    session.button.classList.toggle('yt-danmaku-toggle-button--enabled', enabled);
    session.button.setAttribute('aria-label', nextLabel + ' ' + labels.ariaShortcut);
    session.button.setAttribute('aria-keyshortcuts', DANMAKU_TOGGLE_SHORTCUT);
    session.button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    session.button.setAttribute('title', '');
    session.button.setAttribute('data-title-no-tooltip', labels.title);
    session.button.setAttribute('data-tooltip-title', labels.title);
  }

  function createDanmakuToggleButton(session) {
    injectStyles();
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

    session.buttonPath = path;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleDanmaku();
    });
    button.addEventListener('mouseenter', () => showDanmakuToggleTooltip(session));
    button.addEventListener('focus', () => showDanmakuToggleTooltip(session));
    button.addEventListener('mouseleave', () => hideDanmakuToggleTooltip(session));
    button.addEventListener('blur', () => hideDanmakuToggleTooltip(session));

    return button;
  }

  function ensureDanmakuToggleButton(session) {
    if (!isActiveSession(session)) return false;
    const chatVisible = session.chatFrame && session.chatContainer
      && !session.chatContainer.hasAttribute('collapsed')
      && !session.chatContainer.hidden;

    if (!chatVisible) {
      hideDanmakuToggleTooltip(session);
      if (session.button && session.button.isConnected) session.button.remove();
      return false;
    }

    if (!session.controlsParent || !session.controlsParent.isConnected
      || !session.subtitlesButton || !session.subtitlesButton.isConnected) {
      const rightControls = session.player.querySelector('.ytp-right-controls');
      const subtitlesButton = rightControls && rightControls.querySelector('.ytp-subtitles-button');
      const controlsParent = subtitlesButton && subtitlesButton.parentNode;
      if (!rightControls || !subtitlesButton || !controlsParent || !rightControls.contains(controlsParent)) return false;
      session.subtitlesButton = subtitlesButton;
      session.controlsParent = controlsParent;
    }

    if (!session.button) {
      session.button = createDanmakuToggleButton(session);
      syncDanmakuToggleButtonState(session);
    }

    if (session.button.parentNode !== session.controlsParent
      || session.button.nextSibling !== session.subtitlesButton) {
      session.controlsParent.insertBefore(session.button, session.subtitlesButton);
    }
    return true;
  }

  function toggleDanmaku() {
    enabled = !enabled;
    const session = currentSession;
    if (session && session.overlay && !enabled) session.overlay.replaceChildren();
    resetRuntimeState(session, false);
    if (session) syncDanmakuToggleButtonState(session);
  }

  function updateOverlayBounds(session, observedSize) {
    if (!isActiveSession(session) || !session.overlay || !session.overlay.isConnected) return;

    const playerW = observedSize ? observedSize.width : session.player.clientWidth;
    const playerH = observedSize ? observedSize.height : session.player.clientHeight;
    if (!playerW || !playerH) return;

    const video = session.video;
    let renderW = playerW;
    let renderH = playerH;
    let offsetX = 0;
    let offsetY = 0;

    if (video && video.videoWidth && video.videoHeight) {
      const videoAspect = video.videoWidth / video.videoHeight;
      const playerAspect = playerW / playerH;
      if (playerAspect > videoAspect) {
        renderW = playerH * videoAspect;
        offsetX = (playerW - renderW) / 2;
      } else {
        renderH = playerW / videoAspect;
        offsetY = (playerH - renderH) / 2;
      }
    }

    const nextFontSize = Math.max(1, Math.floor(
      renderH * CONFIG.displayArea / (CONFIG.maxLines * CONFIG.lineHeightRatio),
    ));
    if (session.overlayWidth !== renderW || session.overlayHeight !== renderH) {
      session.laneTracker = [];
    }
    session.overlayWidth = renderW;
    session.overlayHeight = renderH;
    session.fontSize = nextFontSize;
    session.overlay.style.cssText = `top:${offsetY}px;left:${offsetX}px;width:${renderW}px;height:${renderH}px;--yt-danmaku-w:${renderW}px;--yt-danmaku-fs:${nextFontSize}px`;
  }

  function ensureOverlay(session) {
    if (!isActiveSession(session) || !session.player || !session.player.isConnected) return null;
    if (session.overlay && session.overlay.isConnected) return session.overlay;

    injectStyles();
    const staleOverlay = session.player.querySelector('#yt-danmaku-overlay');
    if (staleOverlay) staleOverlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'yt-danmaku-overlay';
    overlay.addEventListener('animationend', (event) => {
      const item = event.target;
      if (item && item.nodeType === 1 && item.parentNode === overlay
        && item.classList.contains('yt-danmaku-item')) {
        item.remove();
      }
    });

    const videoLayer = session.player.querySelector('.html5-video-container');
    if (videoLayer && videoLayer.parentNode === session.player) {
      videoLayer.insertAdjacentElement('afterend', overlay);
    } else {
      session.player.appendChild(overlay);
    }

    session.overlay = overlay;
    session.resizeObserver = new ResizeObserver((entries) => {
      if (entries[0]) updateOverlayBounds(session, entries[0].contentRect);
    });
    session.resizeObserver.observe(session.player);

    if (session.video) {
      session.video.addEventListener('loadedmetadata', () => updateOverlayBounds(session), {
        once: true,
        signal: session.abortController.signal,
      });
    }

    updateOverlayBounds(session);
    return overlay;
  }

  function isLaneSafe(session, previous, now, newSpeed) {
    if (!previous) return true;
    const elapsed = (now - previous.startTime) / 1000;
    if (elapsed < previous.width / previous.speed) return false;
    if (newSpeed <= previous.speed) return true;

    const rightEdge = session.overlayWidth + previous.width - previous.speed * elapsed;
    if (rightEdge <= 0) return true;
    const gap = session.overlayWidth - rightEdge;
    return gap / (newSpeed - previous.speed) > rightEdge / previous.speed;
  }

  function getAvailableLine(session, tall, newSpeed, newWidth) {
    const now = performance.now();
    if (session.laneTracker.length !== CONFIG.maxLines) {
      session.laneTracker = new Array(CONFIG.maxLines).fill(null);
    }

    const needed = tall ? 2 : 1;
    const info = { startTime: now, speed: newSpeed, width: newWidth };
    for (let i = 0; i <= CONFIG.maxLines - needed; i += 1) {
      let available = true;
      for (let j = 0; j < needed; j += 1) {
        if (!isLaneSafe(session, session.laneTracker[i + j], now, newSpeed)) {
          available = false;
          break;
        }
      }
      if (available) {
        for (let j = 0; j < needed; j += 1) session.laneTracker[i + j] = info;
        return i;
      }
    }

    const fallback = Math.floor(Math.random() * (CONFIG.maxLines - needed + 1));
    for (let j = 0; j < needed; j += 1) session.laneTracker[fallback + j] = info;
    return fallback;
  }

  function createMessageDescriptor(node, chatInfo) {
    const message = node.querySelector('#message');
    const sticker = message ? null : node.querySelector('#sticker img, #sticker-container img');
    let fragment = message ? buildMessageFragment(message) : null;

    if (!fragment && sticker) {
      fragment = document.createDocumentFragment();
      const image = document.createElement('img');
      image.src = sticker.getAttribute('src') || '';
      image.alt = sticker.getAttribute('alt') || 'sticker';
      image.className = 'yt-danmaku-emoji yt-danmaku-sticker';
      fragment.appendChild(image);
    }

    if (!fragment) {
      if (!chatInfo.isSpecial || !chatInfo.bgColor) return null;
      const subtext = node.querySelector('#header-subtext');
      if (subtext) fragment = buildMessageFragment(subtext);
      if (!fragment) fragment = document.createDocumentFragment();
    }

    return { chatInfo, fragment };
  }

  function createDanmakuElement(descriptor) {
    const { chatInfo, fragment } = descriptor;
    const item = document.createElement('div');
    item.className = 'yt-danmaku-item';
    item.style.setProperty('--yt-danmaku-color', chatInfo.textColor);

    if (chatInfo.isSpecial) {
      item.classList.add('yt-danmaku-item--special');
      if (chatInfo.bgColor) {
        item.classList.add('yt-danmaku-item--highlighted');
        item.style.setProperty('--yt-danmaku-bg', chatInfo.bgColor);
      }

      const header = document.createElement('div');
      header.className = 'yt-danmaku-item__header';
      if (chatInfo.photoSrc) {
        const avatar = document.createElement('img');
        avatar.src = chatInfo.photoSrc;
        avatar.className = 'yt-danmaku-item__avatar';
        header.appendChild(avatar);
      }
      if (chatInfo.authorName) {
        const author = document.createElement('span');
        author.className = 'yt-danmaku-item__meta';
        author.textContent = chatInfo.authorName;
        header.appendChild(author);
      }
      if (chatInfo.badgeSrc) {
        const badge = document.createElement('img');
        badge.src = chatInfo.badgeSrc;
        badge.className = 'yt-danmaku-item__badge';
        header.appendChild(badge);
      }
      if (chatInfo.amount) {
        const separator = document.createElement('span');
        separator.className = 'yt-danmaku-item__separator';
        separator.textContent = ' - ';
        header.appendChild(separator);
        const amount = document.createElement('span');
        amount.className = 'yt-danmaku-item__meta';
        amount.textContent = chatInfo.amount;
        header.appendChild(amount);
      }
      item.appendChild(header);

      const body = document.createElement('div');
      body.appendChild(fragment);
      item.appendChild(body);
    } else {
      const body = document.createElement('span');
      body.appendChild(fragment);
      item.appendChild(body);
    }
    return item;
  }

  function prepareEntry(entry, session) {
    const node = entry.node;
    let chatInfo = entry.chatInfo;
    if (!node || !MESSAGE_TAGS.has(node.localName)) return null;

    if (!chatInfo) {
      const id = node.getAttribute('id') || node.getAttribute('message-id');
      if (!rememberMessageId(id)) return null;
      chatInfo = extractChatInfo(node);
      if (chatInfo.isSpecial && chatInfo.authorName && chatInfo.authorName.startsWith('@')) {
        deferChannelName(node, chatInfo, session);
        return null;
      }
    }

    return createMessageDescriptor(node, chatInfo);
  }

  function flushPendingFrame() {
    pendingFrame = 0;
    const session = currentSession;
    if (!isActiveSession(session) || !enabled || (PERF.skipWhenHidden && document.hidden)) {
      clearPendingQueue();
      return;
    }

    const descriptors = [];
    for (let i = 0; i < PERF.maxPerFrame && pendingQueueSize; i += 1) {
      const descriptor = prepareEntry(dequeueEntry(), session);
      if (descriptor) descriptors.push(descriptor);
    }

    if (descriptors.length) {
      const overlay = ensureOverlay(session);
      if (overlay) {
        const fragment = document.createDocumentFragment();
        const items = descriptors.map((descriptor) => {
          const item = createDanmakuElement(descriptor);
          fragment.appendChild(item);
          return { item, isSpecial: descriptor.chatInfo.isSpecial };
        });
        overlay.appendChild(fragment);

        const widths = items.map(({ item }) => item.clientWidth);
        for (let i = 0; i < items.length; i += 1) {
          const { item, isSpecial } = items[i];
          const width = widths[i];
          const speed = (width + session.overlayWidth + 20) / CONFIG.duration;
          const line = getAvailableLine(session, isSpecial, speed, width);
          item.style.top = (line * session.fontSize * CONFIG.lineHeightRatio) + 'px';
          item.classList.add('yt-danmaku-item--running');
        }
      }
    }

    if (pendingQueueSize) pendingFrame = requestAnimationFrame(flushPendingFrame);
  }

  function handleChatMutations(mutations, session) {
    if (!isActiveSession(session) || !enabled) return;
    if (PERF.skipWhenHidden && document.hidden) return;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1 && MESSAGE_TAGS.has(node.localName)) {
          enqueueEntry({ node, chatInfo: null }, session);
        }
      }
    }
  }

  function findChatItems(node) {
    if (!node || node.nodeType !== 1) return null;
    if (node.id === 'items' && node.closest('yt-live-chat-item-list-renderer')) return node;
    return node.querySelector('yt-live-chat-item-list-renderer #items');
  }

  function bindChatItems(session, items) {
    if (!isActiveSession(session) || session.chatItems === items) return;
    disconnect(session.chatReadyObserver);
    disconnect(session.chatObserver);
    session.chatReadyObserver = null;
    session.chatItems = items;
    session.chatObserver = new MutationObserver((mutations) => handleChatMutations(mutations, session));
    session.chatObserver.observe(items, { childList: true });
    ensureDanmakuToggleButton(session);
  }

  function bindChatDocument(session) {
    if (!isActiveSession(session) || !session.chatFrame) return;
    disconnect(session.chatObserver);
    disconnect(session.chatReadyObserver);
    session.chatObserver = null;
    session.chatReadyObserver = null;
    session.chatItems = null;

    let chatDocument;
    try {
      chatDocument = session.chatFrame.contentDocument;
    } catch (error) {
      return;
    }
    if (!chatDocument || !chatDocument.body) return;

    const items = chatDocument.querySelector('yt-live-chat-item-list-renderer #items');
    if (items) {
      bindChatItems(session, items);
      return;
    }

    session.chatReadyObserver = new MutationObserver((mutations) => {
      if (!isActiveSession(session)) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          const nextItems = findChatItems(node);
          if (nextItems) {
            bindChatItems(session, nextItems);
            return;
          }
        }
      }
    });
    session.chatReadyObserver.observe(chatDocument.body, { childList: true, subtree: true });
  }

  function teardownChatBinding(session) {
    if (session.chatAbortController) session.chatAbortController.abort();
    session.chatAbortController = null;
    disconnect(session.chatReadyObserver);
    disconnect(session.chatObserver);
    disconnect(session.chatContainerObserver);
    disconnect(session.chatHostObserver);
    disconnect(session.resizeObserver);
    session.chatReadyObserver = null;
    session.chatObserver = null;
    session.chatContainerObserver = null;
    session.chatHostObserver = null;
    session.resizeObserver = null;

    hideDanmakuToggleTooltip(session);
    if (session.button && session.button.isConnected) session.button.remove();
    if (session.overlay && session.overlay.isConnected) session.overlay.remove();
    session.button = null;
    session.buttonPath = null;
    session.tooltip = null;
    session.overlay = null;
    session.overlayWidth = 0;
    session.overlayHeight = 0;
    session.video = null;
    session.chatItems = null;
    session.chatFrame = null;
    session.chatContainer = null;
    session.controlsParent = null;
    session.subtitlesButton = null;
    resetRuntimeState(session, false);
  }

  function stopDiscovery(session) {
    disconnect(session.discoveryObserver);
    session.discoveryObserver = null;
    if (session.discoveryTimer) clearTimeout(session.discoveryTimer);
    session.discoveryTimer = 0;
  }

  function setupSessionElements(session) {
    if (!isActiveSession(session) || !session.player || !session.chatContainer || !session.chatFrame) return false;
    stopDiscovery(session);
    session.video = session.player.querySelector('video');
    session.chatAbortController = new AbortController();
    session.chatContainerObserver = new MutationObserver(() => ensureDanmakuToggleButton(session));
    session.chatContainerObserver.observe(session.chatContainer, {
      attributes: true,
      attributeFilter: ['collapsed', 'hidden'],
    });
    const chatHost = session.chatContainer.parentNode;
    if (chatHost) {
      session.chatHostObserver = new MutationObserver(() => {
        if (!isActiveSession(session)) return;
        if (session.chatContainer && session.chatContainer.isConnected
          && session.chatFrame && session.chatFrame.isConnected) return;
        teardownChatBinding(session);
        discoverSessionElements(session);
      });
      session.chatHostObserver.observe(chatHost, { childList: true });
    }
    session.chatFrame.addEventListener('load', () => bindChatDocument(session), {
      signal: session.chatAbortController.signal,
    });
    bindChatDocument(session);
    return true;
  }

  function inspectAddedNode(session, node) {
    if (!node || node.nodeType !== 1) return;
    if (!session.player) {
      session.player = node.matches('#movie_player') ? node : node.querySelector('#movie_player');
    }
    if (!session.chatContainer) {
      session.chatContainer = node.matches('ytd-live-chat-frame#chat')
        ? node
        : node.querySelector('ytd-live-chat-frame#chat');
    }
    if (!session.chatFrame) {
      session.chatFrame = node.matches('#chatframe') ? node : node.querySelector('#chatframe');
    }
  }

  function discoverSessionElements(session) {
    session.player = document.querySelector('#movie_player');
    session.chatContainer = document.querySelector('ytd-live-chat-frame#chat');
    session.chatFrame = session.chatContainer && session.chatContainer.querySelector('#chatframe');
    if (setupSessionElements(session)) return;

    session.discoveryObserver = new MutationObserver((mutations) => {
      if (!isActiveSession(session)) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) inspectAddedNode(session, node);
      }
      setupSessionElements(session);
    });
    session.discoveryObserver.observe(document.body, { childList: true, subtree: true });
    session.discoveryTimer = setTimeout(() => stopDiscovery(session), DISCOVERY_LIMIT);
  }

  function stopWatchSession(clearProcessed) {
    const session = currentSession;
    if (!session) {
      resetRuntimeState(null, clearProcessed);
      return;
    }

    session.active = false;
    currentSession = null;
    session.abortController.abort();
    stopDiscovery(session);
    teardownChatBinding(session);
    resetRuntimeState(session, clearProcessed);
  }

  function isWatchPage() {
    const path = window.location.pathname;
    return path === '/watch' || path.startsWith('/live/');
  }

  function startWatchSession() {
    stopWatchSession(true);
    if (!isWatchPage()) return;

    const session = {
      id: ++sessionSequence,
      active: true,
      abortController: new AbortController(),
      player: null,
      video: null,
      chatContainer: null,
      chatFrame: null,
      chatItems: null,
      controlsParent: null,
      subtitlesButton: null,
      button: null,
      buttonPath: null,
      tooltip: null,
      overlay: null,
      overlayWidth: 0,
      overlayHeight: 0,
      fontSize: 32,
      laneTracker: [],
      discoveryObserver: null,
      discoveryTimer: 0,
      chatAbortController: null,
      chatReadyObserver: null,
      chatObserver: null,
      chatContainerObserver: null,
      chatHostObserver: null,
      resizeObserver: null,
    };
    currentSession = session;
    discoverSessionElements(session);
  }

  document.addEventListener('visibilitychange', clearPendingQueue);
  document.addEventListener('keydown', (event) => {
    if (event.altKey && (event.key === 'l' || event.key === 'L')) {
      event.preventDefault();
      toggleDanmaku();
    }
  });
  document.addEventListener('yt-navigate-finish', startWatchSession);

  startWatchSession();
})();
