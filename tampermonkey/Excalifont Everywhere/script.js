// ==UserScript==
// @name         Excalifont Everywhere
// @namespace    https://tampermonkey.net/
// @version      1.2.0
// @description  Excalidraw風-可変幅 をページ全体のフォントとして適用します
// @author       You
// @match        *://*/*
// @exclude      *://www.bbc.com/*
// @exclude      *://fonts.google.com/*
// @exclude      *://www.canva.com/*
// @grant        GM_addStyle
// @run-at       document-start
// @icon         https://excalidraw.framalab.org/apple-touch-icon.png
// ==/UserScript==

(function () {
  'use strict';

  GM_addStyle(`
    @font-face {
      font-family: "BoostExcalifont";
      src:
        local("Excalifont"),
        local("Excalifont Regular");
    }

    @font-face {
      font-family: "BoostSetoFont";
      src:
        local("SetoFont"),
        local("瀬戸フォント"),
        local("Seto Font");
    }

    @font-face {
      font-family: "BoostXiaolai";
      src:
        local("Xiaolai SC"),
        local("Xiaolai"),
        local("小赖字体 SC"),
        local("小賴字體 SC");
    }
    @font-face {
      font-family: "BoostExcalidrawVarWidth";
      src:
        local("Excalidraw風-可変幅"),
        local("Excalidraw風-可変幅 Regular"),
        local("Excalidraw-Style-Proportional"),
        local("Excalidraw-Style-Proportional Regular"),
        local("Excalidraw-Style-Proportional-Regular");
    }
    @font-face {
      font-family: "BoostExcalidrawMono";
      src:
        local("Excalidraw風-等幅"),
        local("Excalidraw風-等幅 Regular"),
        local("Excalidraw-style-Mono"),
        local("Excalidraw-style-Mono Regular"),
        local("ExcalidrawStyleMono-Regular");
    }

    body,
    body *:not(
      .material-symbols-outlined,
      .material-symbols-rounded,
      .material-symbols-sharp,
      .material-icons,
      .material-icons-outlined,
      .material-icons-round,
      .material-icons-sharp,
      [class*="icon"],
      [class*="Icon"],
      [aria-hidden="true"],
      [role="img"],
      [data-icon],
      [data-testid*="icon" i],
      [class*="icon" i],
      [class*="material" i],
      [class*="symbol" i],
      [class*="lucide" i],
      [class*="fa-" i],
      [class*="codicon" i],
      i,
      svg,
      svg *
    ) {
      font-family: "BoostExcalidrawVarWidth", sans-serif !important;
    }
  `);
})();