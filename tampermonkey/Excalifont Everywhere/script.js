// ==UserScript==
// @name         Excalifont Everywhere
// @namespace    https://tampermonkey.net/
// @version      1.0.0
// @description  Excalifont / Xiaolai をページ全体のフォントとして適用します
// @author       You
// @match        *://*/*
// @exclude      *://www.bbc.com/*
// @exclude      *://fonts.google.com/*
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
      font-family: "BoostXiaolai";
      src:
        local("Xiaolai SC"),
        local("Xiaolai"),
        local("小赖字体 SC"),
        local("小賴字體 SC");
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
      font-family: "BoostExcalifont", "BoostXiaolai", sans-serif !important;
    }
  `);
})();