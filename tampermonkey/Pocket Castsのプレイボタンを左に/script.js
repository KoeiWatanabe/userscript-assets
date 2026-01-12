// ==UserScript==
// @name         Pocket Castsのプレイボタンを左に
// @namespace    https://pocketcasts.com/
// @version      1.0
// @description  Move ONLY the right-edge episode list Play/Pause buttons to the left (no DOM move/add). Excludes footer + non-right-edge controls.
// @match        https://pocketcasts.com/*
// @match        https://play.pocketcasts.com/*
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Pocket Castsのプレイボタンを左に/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/Pocket Castsのプレイボタンを左に/script.js
// @icon         https://static.pocketcasts.com/webplayer/favicons/favicon.ico
// ==/UserScript==

(() => {
  "use strict";

  const BTN_MARK = "data-pc-left-btn";
  const ROW_MARK = "data-pc-left-row";
  const ROW_BASE_PAD = "data-pc-base-pad";

  function isVisible(el) {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // 画面下のプレイヤーは触らない
  function isInFooter(btn) {
    return !!btn.closest("footer");
  }

  // ★ここが今回の肝：右端にある Play/Pause だけ対象にする
  function isRightEdgeButton(btn) {
    const r = btn.getBoundingClientRect();
    const rightDist = window.innerWidth - r.right;

    // 画面が広いほど許容を少し広げる（ただし広げすぎない）
    const threshold = Math.min(340, Math.max(180, window.innerWidth * 0.22));

    return rightDist >= 0 && rightDist <= threshold;
  }

  // ボタンの「行コンテナ」を探す（一覧の1行）
  function findRowContainer(btn) {
    const br = btn.getBoundingClientRect();
    let el = btn.parentElement;

    for (let i = 0; i < 14 && el; i++) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);

      const heightOK = r.height >= Math.max(36, br.height) && r.height <= 220;
      const widthOK = r.width >= 500;
      const notHuge = r.height < window.innerHeight * 0.6;

      const nearLeft = r.left < 200;
      const nearRight = (window.innerWidth - r.right) < 200;

      const layoutOK =
        cs.display.includes("flex") ||
        cs.display.includes("grid") ||
        cs.display === "block";

      if (heightOK && widthOK && notHuge && nearLeft && nearRight && layoutOK) {
        return el;
      }

      el = el.parentElement;
    }

    return btn.parentElement;
  }

  function ensureRowPadding(row, neededPadPx) {
    const cs = getComputedStyle(row);

    // 元の padding-left を1回だけ保存
    if (!row.hasAttribute(ROW_BASE_PAD)) {
      const base = parseFloat(cs.paddingLeft || "0") || 0;
      row.setAttribute(ROW_BASE_PAD, String(base));
    }

    const basePad = parseFloat(row.getAttribute(ROW_BASE_PAD)) || 0;
    const targetPad = basePad + neededPadPx;

    row.style.position = "relative";
    row.style.paddingLeft = `${targetPad}px`;
    row.setAttribute(ROW_MARK, "1");
  }

  function leftifyButton(btn, row) {
    const br = btn.getBoundingClientRect();
    const gap = 12;
    const neededPad = Math.round(br.width + gap);

    ensureRowPadding(row, neededPad);

    btn.style.position = "absolute";
    btn.style.left = "0";
    btn.style.top = "50%";
    btn.style.transform = "translateY(-50%)";
    btn.style.zIndex = "5";
    btn.style.margin = "0";
    btn.style.flex = "0 0 auto";
    btn.setAttribute(BTN_MARK, "1");
  }

  function applyAll() {
    const buttons = Array.from(
      document.querySelectorAll('button[aria-label="Play"], button[aria-label="Pause"]')
    ).filter((b) => isVisible(b) && !isInFooter(b) && isRightEdgeButton(b));

    for (const btn of buttons) {
      if (btn.getAttribute(BTN_MARK) === "1") continue;

      const row = findRowContainer(btn);
      if (!row) continue;

      leftifyButton(btn, row);
    }
  }

  // リセット用（困ったらコンソールで window.__pcResetAll()）
  function resetAll() {
    document.querySelectorAll(`[${BTN_MARK}="1"]`).forEach((b) => {
      b.style.position = "";
      b.style.left = "";
      b.style.top = "";
      b.style.transform = "";
      b.style.zIndex = "";
      b.style.margin = "";
      b.style.flex = "";
      b.removeAttribute(BTN_MARK);
    });

    document.querySelectorAll(`[${ROW_MARK}="1"]`).forEach((row) => {
      const basePad = row.getAttribute(ROW_BASE_PAD);
      row.style.position = "";
      row.style.paddingLeft = basePad != null ? `${basePad}px` : "";
      row.removeAttribute(ROW_MARK);
      row.removeAttribute(ROW_BASE_PAD);
    });
  }

  window.__pcResetAll = resetAll;

  // SPA対策：DOM更新に追従（軽く間引き）
  let t = null;
  const mo = new MutationObserver(() => {
    clearTimeout(t);
    t = setTimeout(applyAll, 120);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  applyAll();
})();
