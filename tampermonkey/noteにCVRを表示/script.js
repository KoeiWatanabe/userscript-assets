// ==UserScript==
// @name         noteにCVRを表示
// @namespace    https://tampermonkey.net/
// @version      1.0.6
// @description  note.comのアクセス状況テーブルにスキ/ビューのCVR列を表示します
// @match        https://note.com/sitesettings/stats*
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/noteにCVRを表示/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/noteにCVRを表示/script.js
// @icon         https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/noteにCVRを表示/icon_128.png
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const TABLE_SELECTOR = 'table.o-statsContent__table';
  const VIEW_CELL_SELECTOR = '.o-statsContent__tableStat--type_view';
  const SUKI_CELL_SELECTOR = '.o-statsContent__tableStat--type_suki';
  const CVR_CELL_SELECTOR = '[data-note-cvr-column="1"]';
  const CVR_CELL_CLASS = 'o-statsContent__tableStat o-statsContent__tableStat--type_suki note-cvr-tableStat';
  const CVR_HEADER_LABEL_CLASS = 'o-statsContent__sortButton note-cvr-headerLabel';
  const CVR_LABEL = 'CVR';
  const EMPTY_CVR = '0.0%';
  const UPDATE_DELAY_MS = 100;

  let updateTimer = 0;

  const parseCount = (text) => {
    const normalized = String(text ?? '').replace(/[^\d.-]/g, '');
    if (!normalized) return NaN;
    return Number(normalized);
  };

  const formatCvr = (views, likes) => {
    if (!Number.isFinite(views) || !Number.isFinite(likes) || views <= 0) {
      return EMPTY_CVR;
    }
    return `${((likes / views) * 100).toFixed(1)}%`;
  };

  const ensureStyle = () => {
    if (document.querySelector('style[data-note-cvr-style="1"]')) return;

    const style = document.createElement('style');
    style.dataset.noteCvrStyle = '1';
    style.textContent = `
      ${TABLE_SELECTOR} .note-cvr-tableStat {
        color: #d97800;
        white-space: nowrap;
      }

      ${TABLE_SELECTOR} tbody tr:not(:last-child) .note-cvr-tableStat {
        border-bottom: 1px solid #e6e6e6;
      }

      ${TABLE_SELECTOR} .note-cvr-headerLabel {
        color: #d97800;
        cursor: default;
      }
    `;
    document.head.appendChild(style);
  };

  const createHeaderCell = (sukiHeader) => {
    const cell = document.createElement('th');
    cell.className = CVR_CELL_CLASS;
    cell.scope = sukiHeader.getAttribute('scope') || 'col';
    cell.dataset.noteCvrColumn = '1';

    const label = document.createElement('span');
    label.className = CVR_HEADER_LABEL_CLASS;
    label.textContent = CVR_LABEL;
    cell.appendChild(label);

    return cell;
  };

  const createBodyCell = () => {
    const cell = document.createElement('td');
    cell.className = CVR_CELL_CLASS;
    cell.dataset.noteCvrColumn = '1';
    return cell;
  };

  const placeAfter = (anchor, cell) => {
    if (anchor.nextElementSibling !== cell) {
      anchor.parentElement.insertBefore(cell, anchor.nextSibling);
    }
  };

  const updateHeader = (table) => {
    const headerRow = table.tHead?.rows?.[0] ?? table.querySelector('thead tr');
    if (!headerRow) return;

    const sukiHeader = headerRow.querySelector(SUKI_CELL_SELECTOR);
    if (!sukiHeader) return;

    const cvrHeader = headerRow.querySelector(CVR_CELL_SELECTOR) || createHeaderCell(sukiHeader);
    cvrHeader.className = CVR_CELL_CLASS;
    let label = cvrHeader.querySelector('.note-cvr-headerLabel');
    if (!label) {
      cvrHeader.textContent = '';
      label = document.createElement('span');
      label.className = CVR_HEADER_LABEL_CLASS;
      cvrHeader.appendChild(label);
    }
    label.textContent = CVR_LABEL;
    placeAfter(sukiHeader, cvrHeader);
  };

  const updateBodyRows = (table) => {
    const rows = Array.from(table.tBodies).flatMap((tbody) => Array.from(tbody.rows));

    for (const row of rows) {
      const viewCell = row.querySelector(VIEW_CELL_SELECTOR);
      const sukiCell = row.querySelector(SUKI_CELL_SELECTOR);
      if (!viewCell || !sukiCell) continue;

      const cvrCell = row.querySelector(CVR_CELL_SELECTOR) || createBodyCell();
      cvrCell.className = CVR_CELL_CLASS;
      const views = parseCount(viewCell.textContent);
      const likes = parseCount(sukiCell.textContent);

      cvrCell.textContent = formatCvr(views, likes);
      placeAfter(sukiCell, cvrCell);
    }
  };

  const updateTables = () => {
    ensureStyle();

    for (const table of document.querySelectorAll(TABLE_SELECTOR)) {
      updateHeader(table);
      updateBodyRows(table);
    }
  };

  const scheduleUpdate = () => {
    window.clearTimeout(updateTimer);
    updateTimer = window.setTimeout(updateTables, UPDATE_DELAY_MS);
  };

  const startObserver = () => {
    if (!document.body) return;

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  };

  const init = () => {
    updateTables();
    startObserver();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
