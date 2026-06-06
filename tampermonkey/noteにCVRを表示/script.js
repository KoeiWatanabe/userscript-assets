// ==UserScript==
// @name         noteにCVRを表示
// @namespace    https://tampermonkey.net/
// @version      1.1.1
// @description  note.comのアクセス状況にCVRカードとテーブル列を表示します
// @match        https://note.com/sitesettings/stats*
// @updateURL    https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/noteにCVRを表示/script.js
// @downloadURL  https://raw.githubusercontent.com/KoeiWatanabe/userscript-assets/main/tampermonkey/noteにCVRを表示/script.js
// @icon         https://assets.st-note.com/poc-image/manual/note-common-images/production/svg/production.ico
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const CVR_LABEL = 'CVR';
  const EMPTY_CVR = '0.0%';
  const CVR_COLOR = '#d97800';
  const UPDATE_DELAY_MS = 100;
  const CVR_ICON_SVG = `
    <svg viewBox="0 -960 960 960" fill="currentColor" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="m315-336 106-107 72 72 131-130v69h72v-192H504v72h69l-80 80-72-72-157 157 51 51Zm-99 192q-29.7 0-50.85-21.15Q144-186.3 144-216v-528q0-29.7 21.15-50.85Q186.3-816 216-816h528q29.7 0 50.85 21.15Q816-773.7 816-744v528q0 29.7-21.15 50.85Q773.7-144 744-144H216Zm0-72h528v-528H216v528Zm0-528v528-528Z"/>
    </svg>
  `.trim();

  const OVERVIEW_SELECTOR = '.o-statsContent__overview';
  const OVERVIEW_ITEM_SELECTOR = '.o-statsContent__overviewItem';
  const OVERVIEW_VIEW_SELECTOR = '.o-statsContent__overviewItem--type_view';
  const OVERVIEW_SUKI_SELECTOR = '.o-statsContent__overviewItem--type_suki';
  const OVERVIEW_NUM_SELECTOR = '.o-statsContent__overviewNum';
  const OVERVIEW_LABEL_SELECTOR = '.o-statsContent__overviewLabel';
  const OVERVIEW_ICON_SELECTOR = '.o-statsContent__overviewIcon';
  const OVERVIEW_CVR_SELECTOR = '[data-note-cvr-overview="1"]';
  const OVERVIEW_CVR_CLASS = 'o-statsContent__overviewItem note-cvr-overviewItem';

  const TABLE_SELECTOR = 'table.o-statsContent__table';
  const VIEW_CELL_SELECTOR = '.o-statsContent__tableStat--type_view';
  const SUKI_CELL_SELECTOR = '.o-statsContent__tableStat--type_suki';
  const CVR_CELL_SELECTOR = '[data-note-cvr-column="1"]';
  const CVR_CELL_CLASS = 'o-statsContent__tableStat o-statsContent__tableStat--type_suki note-cvr-tableStat';
  const CVR_HEADER_LABEL_CLASS = 'o-statsContent__sortButton note-cvr-headerLabel';

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
        color: ${CVR_COLOR};
        white-space: nowrap;
      }

      ${TABLE_SELECTOR} tbody tr:not(:last-child) .note-cvr-tableStat {
        border-bottom: 1px solid #e6e6e6;
      }

      ${TABLE_SELECTOR} .note-cvr-headerLabel {
        color: ${CVR_COLOR};
        cursor: default;
      }

      ${OVERVIEW_SELECTOR}[data-note-cvr-overview-layout="1"] .o-statsContent__overviewItem {
        width: calc(25% - 9px);
      }

      ${OVERVIEW_SELECTOR}[data-note-cvr-overview-layout="1"] .note-cvr-overviewItem {
        color: ${CVR_COLOR};
      }

      ${OVERVIEW_SELECTOR}[data-note-cvr-overview-layout="1"] .note-cvr-overviewItem .a-svgIcon {
        color: currentColor;
      }

      @media only screen and (max-width: 940px) {
        ${OVERVIEW_SELECTOR}[data-note-cvr-overview-layout="1"] .o-statsContent__overviewItem {
          width: calc(25% - 2.25px);
        }
      }
    `;
    document.head.appendChild(style);
  };

  const createOverviewItem = (template) => {
    const item = template.cloneNode(true);
    item.className = OVERVIEW_CVR_CLASS;
    item.dataset.noteCvrOverview = '1';

    const icon = item.querySelector(OVERVIEW_ICON_SELECTOR);
    if (icon) {
      icon.innerHTML = '<i class="a-svgIcon a-svgIcon--medium" aria-hidden="true"></i>';
      const svgHost = icon.querySelector('.a-svgIcon');
      if (svgHost) {
        svgHost.innerHTML = CVR_ICON_SVG;
      }
    }

    return item;
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

  const updateOverview = () => {
    const overview = document.querySelector(OVERVIEW_SELECTOR);
    if (!overview) return;

    const viewItem = overview.querySelector(OVERVIEW_VIEW_SELECTOR);
    const sukiItem = overview.querySelector(OVERVIEW_SUKI_SELECTOR);
    const template = sukiItem || viewItem || overview.querySelector(OVERVIEW_ITEM_SELECTOR);
    if (!viewItem || !sukiItem || !template) return;

    const views = parseCount(viewItem.querySelector(OVERVIEW_NUM_SELECTOR)?.textContent);
    const likes = parseCount(sukiItem.querySelector(OVERVIEW_NUM_SELECTOR)?.textContent);
    const cvrItem = overview.querySelector(OVERVIEW_CVR_SELECTOR) || createOverviewItem(template);
    const number = cvrItem.querySelector(OVERVIEW_NUM_SELECTOR);
    const label = cvrItem.querySelector(OVERVIEW_LABEL_SELECTOR);

    cvrItem.className = OVERVIEW_CVR_CLASS;
    cvrItem.dataset.noteCvrOverview = '1';
    if (number) {
      number.textContent = formatCvr(views, likes);
    }
    if (label) {
      label.textContent = CVR_LABEL;
    }

    overview.dataset.noteCvrOverviewLayout = '1';
    placeAfter(sukiItem, cvrItem);
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
    updateOverview();

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
