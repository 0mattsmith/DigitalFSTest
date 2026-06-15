// Built-in lightweight spreadsheet editor.
// Supports text, numbers, basic formulas (=SUM, =AVERAGE, =A1+B1, etc.),
// currency formatting, sorting, merging A:H ranges, and saving snapshots.
// Designed to be just rich enough to mark the practical tasks like the
// Pearson Level 1 spreadsheet task.

import { h } from '../screens/components.js';

export function mountSpreadsheet(container, opts) {
  const { rows = 12, cols = 8, initial = {}, onChange = () => {} } = opts;

  // State: cells[A1] = { raw: "value or =formula", format: "currency"|"number"|"text" }
  const state = {
    cells: {},
    merges: {},          // mergeKey "A1" -> "A1:H1"; cells inside are hidden
    formats: {},         // per-cell formatting metadata
    sheets: ['Sheet1'],  // for chart-on-separate-sheet tasks
    activeSheet: 'Sheet1',
    activeCell: 'A1',
    sortInfo: null,
    chart: null,
  };

  // Seed with initial values from the scenario.
  for (const [addr, v] of Object.entries(initial.cells || {})) {
    state.cells[addr] = typeof v === 'object' ? { ...v } : { raw: v };
  }
  for (const [addr, fmt] of Object.entries(initial.formats || {})) {
    state.formats[addr] = { ...fmt };
  }
  if (initial.merges) Object.assign(state.merges, initial.merges);
  if (initial.sheets) state.sheets = initial.sheets.slice();
  if (initial.activeSheet) state.activeSheet = initial.activeSheet;

  // --- Rendering helpers -------------------------------------------
  const colName = (i) => String.fromCharCode(65 + i);  // A, B, C, ...
  const cellAddr = (r, c) => `${colName(c)}${r + 1}`;
  function parseAddr(addr) {
    const m = addr.match(/^([A-Z]+)(\d+)$/);
    if (!m) return null;
    const c = m[1].charCodeAt(0) - 65;
    return { r: parseInt(m[2], 10) - 1, c };
  }
  function isHiddenByMerge(addr) {
    for (const [topLeft, range] of Object.entries(state.merges)) {
      if (topLeft === addr) return false;
      if (addrInRange(addr, range)) return true;
    }
    return false;
  }
  function addrInRange(addr, range) {
    const [a, b] = range.split(':');
    const ax = parseAddr(a), bx = parseAddr(b), tx = parseAddr(addr);
    if (!ax || !bx || !tx) return false;
    return tx.r >= ax.r && tx.r <= bx.r && tx.c >= ax.c && tx.c <= bx.c;
  }
  function mergeSpanOf(addr) {
    const range = state.merges[addr];
    if (!range) return null;
    const [a, b] = range.split(':');
    const ax = parseAddr(a), bx = parseAddr(b);
    return { rowspan: bx.r - ax.r + 1, colspan: bx.c - ax.c + 1 };
  }

  function evalFormula(raw) {
    // Returns { value, error }
    if (raw == null) return { value: '' };
    const s = String(raw);
    if (!s.startsWith('=')) {
      const n = Number(s);
      if (!Number.isNaN(n) && s.trim() !== '') return { value: n, isNumber: true };
      return { value: s };
    }
    const body = s.slice(1).trim();
    try {
      const v = evalExpr(body);
      return { value: v, isNumber: typeof v === 'number' };
    } catch (e) {
      return { value: '#ERR', error: e.message };
    }
  }

  function getRange(range) {
    const [a, b] = range.split(':');
    const ax = parseAddr(a), bx = parseAddr(b);
    if (!ax || !bx) return [];
    const out = [];
    for (let r = ax.r; r <= bx.r; r++) {
      for (let c = ax.c; c <= bx.c; c++) {
        const addr = cellAddr(r, c);
        out.push({ addr, value: cellValue(addr) });
      }
    }
    return out;
  }

  function cellValue(addr) {
    const cell = state.cells[addr];
    if (!cell) return 0;
    const { value } = evalFormula(cell.raw);
    return value;
  }

  function evalExpr(expr) {
    // Functions first
    expr = expr.replace(/SUM\(([^)]+)\)/gi, (_, args) => {
      return '(' + expandArgsToValues(args).reduce((a, b) => a + numOr0(b), 0) + ')';
    });
    expr = expr.replace(/AVERAGE\(([^)]+)\)/gi, (_, args) => {
      const vals = expandArgsToValues(args).map(numOr0);
      if (!vals.length) return '0';
      return '(' + (vals.reduce((a, b) => a + b, 0) / vals.length) + ')';
    });
    expr = expr.replace(/MAX\(([^)]+)\)/gi, (_, args) =>
      '(' + Math.max(...expandArgsToValues(args).map(numOr0)) + ')');
    expr = expr.replace(/MIN\(([^)]+)\)/gi, (_, args) =>
      '(' + Math.min(...expandArgsToValues(args).map(numOr0)) + ')');
    expr = expr.replace(/COUNT\(([^)]+)\)/gi, (_, args) =>
      '(' + expandArgsToValues(args).filter(v => typeof v === 'number').length + ')');

    // Then expand any remaining cell references
    expr = expr.replace(/\$?([A-Z])\$?(\d+)/g, (_, col, row) => {
      const addr = col + row;
      const v = cellValue(addr);
      return typeof v === 'number' ? String(v) : '0';
    });

    // Safe eval of arithmetic
    if (!/^[\d+\-*/().\s,]+$/.test(expr)) throw new Error('Invalid expression');
    // eslint-disable-next-line no-new-func
    return Function('"use strict";return (' + expr + ')')();
  }
  function numOr0(v) { return typeof v === 'number' ? v : 0; }
  function expandArgsToValues(argsStr) {
    const parts = argsStr.split(',').map(s => s.trim());
    const out = [];
    for (const p of parts) {
      if (/:/.test(p)) {
        for (const cell of getRange(p)) out.push(cell.value);
      } else if (/^[A-Z]+\d+$/.test(p)) {
        out.push(cellValue(p));
      } else {
        out.push(Number(p));
      }
    }
    return out;
  }

  // --- DOM render ---------------------------------------------------
  const root = h('div');
  container.innerHTML = '';
  container.appendChild(root);

  // Toolbar
  const fmtSelect = h('select',
    {},
    h('option', { value: '' }, 'Format…'),
    h('option', { value: 'currency' }, 'Currency (£)'),
    h('option', { value: 'number2' }, 'Number 2dp'),
    h('option', { value: 'text' }, 'Text'));
  fmtSelect.onchange = () => {
    applyFormatToSelection(fmtSelect.value);
    fmtSelect.value = '';
  };

  const mergeBtn = h('button', { onClick: mergeSelection }, 'Merge & center selection');
  const shadeBtn = h('button', { onClick: () => applyShadeToSelection('#dff2c8') }, 'Shade green');
  const sortBtn = h('button', { onClick: openSortDialog }, 'Sort…');
  const chartBtn = h('button', { onClick: openChartDialog }, 'Insert chart…');
  const sheetSelect = h('select', {});
  function rebuildSheetSelect() {
    sheetSelect.innerHTML = '';
    for (const s of state.sheets) {
      sheetSelect.appendChild(h('option', { value: s, selected: s === state.activeSheet ? '' : null }, s));
    }
  }
  rebuildSheetSelect();
  sheetSelect.onchange = () => { state.activeSheet = sheetSelect.value; rerender(); };
  const newSheetBtn = h('button', { onClick: () => {
    const n = 'Sheet' + (state.sheets.length + 1);
    state.sheets.push(n);
    state.activeSheet = n;
    rebuildSheetSelect();
    rerender();
    onChange(getSnapshot());
  } }, '+ Sheet');

  const fontSizeInput = h('input', { type: 'number', value: '11', style: { width: '50px' } });
  fontSizeInput.onchange = () => {
    const sz = parseInt(fontSizeInput.value, 10) || 11;
    applyFontSizeToSelection(sz);
  };

  const selectionLabel = h('span', { class: 'label', id: 'sheet-sel-label' }, 'A1');

  const toolbar = h('div', { class: 'tool-bar' },
    h('span', { class: 'label' }, 'Sheet:'), sheetSelect, newSheetBtn,
    h('span', { style: { width: '12px' } }),
    h('span', { class: 'label' }, 'Cell:'), selectionLabel,
    h('span', { style: { width: '12px' } }),
    fmtSelect, mergeBtn, shadeBtn, sortBtn, chartBtn,
    h('span', { class: 'label' }, 'Size:'), fontSizeInput);

  // Formula bar
  const nameBox = h('div', { class: 'name-box', id: 'sheet-namebox' }, 'A1');
  const formulaInput = h('input', { type: 'text', value: '' });
  formulaInput.oninput = () => {
    setCellRaw(state.activeCell, formulaInput.value);
    renderGrid();
    onChange(getSnapshot());
  };
  const formulaBar = h('div', { class: 'formula-bar' },
    nameBox,
    h('span', {}, 'ƒₓ'),
    formulaInput);

  const gridWrap = h('div', { style: { overflow: 'auto' } });
  const grid = h('table', { class: 'sheet' });
  gridWrap.appendChild(grid);

  root.appendChild(toolbar);
  root.appendChild(formulaBar);
  root.appendChild(gridWrap);

  let selStart = 'A1', selEnd = 'A1';

  function renderGrid() {
    grid.innerHTML = '';
    // header row
    const head = h('tr');
    head.appendChild(h('th', { class: 'row-h' }, ''));
    for (let c = 0; c < cols; c++) head.appendChild(h('th', {}, colName(c)));
    grid.appendChild(head);

    const onSheet = state.activeSheet === 'Sheet1';

    if (!onSheet && state.chart) {
      // Chart sheet — show chart instead.
      const chartHost = h('div', { style: { padding: '14px' } });
      const cvs = h('canvas', { width: 480, height: 320 });
      chartHost.appendChild(h('div', { style: { fontWeight: 'bold' } }, state.chart.title || 'Chart'));
      chartHost.appendChild(cvs);
      drawChart(cvs, state.chart);
      const row = h('tr'); const td = h('td', { colspan: cols + 1 });
      td.appendChild(chartHost); row.appendChild(td); grid.appendChild(row);
      return;
    }

    for (let r = 0; r < rows; r++) {
      const tr = h('tr');
      tr.appendChild(h('th', { class: 'row-h' }, String(r + 1)));
      for (let c = 0; c < cols; c++) {
        const addr = cellAddr(r, c);
        if (isHiddenByMerge(addr)) {
          tr.appendChild(h('td', { class: 'is-merged-hidden' }));
          continue;
        }
        const cell = state.cells[addr];
        const span = mergeSpanOf(addr);
        const fmt = state.formats[addr] || {};
        const td = h('td', {
          ...(span ? { colspan: span.colspan, rowspan: span.rowspan } : {}),
          dataset: { addr },
        });
        if (addr === state.activeCell) td.classList.add('is-active');
        if (fmt.bg) td.style.background = fmt.bg;
        if (fmt.fontSize) td.style.fontSize = fmt.fontSize + 'px';
        if (fmt.align) td.style.textAlign = fmt.align;
        if (fmt.bold) td.style.fontWeight = 'bold';

        const { value, isNumber } = evalFormula(cell ? cell.raw : '');
        let display = value === '' || value == null ? '' : value;
        if (fmt.numFmt === 'currency' && typeof display === 'number') {
          display = '£' + display.toFixed(2);
          td.classList.add('is-currency');
        } else if (fmt.numFmt === 'number2' && typeof display === 'number') {
          display = display.toFixed(2);
          td.classList.add('is-num');
        } else if (typeof display === 'number') {
          td.classList.add('is-num');
        }

        td.appendChild(h('span', { class: 'cell-display' }, String(display)));

        td.onmousedown = (e) => {
          state.activeCell = addr;
          selStart = addr; selEnd = addr;
          if (e.shiftKey) selEnd = addr;
          formulaInput.value = cell ? (cell.raw || '') : '';
          nameBox.textContent = addr;
          selectionLabel.textContent = addr;
          renderGrid();
        };
        td.ondblclick = () => editInline(addr, td);
        tr.appendChild(td);
      }
      grid.appendChild(tr);
    }
  }

  function editInline(addr, td) {
    const cell = state.cells[addr];
    const input = h('input', { class: 'cell-input', type: 'text', value: cell ? cell.raw || '' : '' });
    td.innerHTML = '';
    td.appendChild(input);
    input.focus(); input.select();
    input.onblur = () => commit();
    input.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { renderGrid(); }
    };
    function commit() {
      setCellRaw(addr, input.value);
      formulaInput.value = input.value;
      renderGrid();
      onChange(getSnapshot());
    }
  }

  function setCellRaw(addr, raw) {
    if (!state.cells[addr]) state.cells[addr] = {};
    state.cells[addr].raw = raw;
  }

  function applyFormatToSelection(kind) {
    if (!kind) return;
    for (const addr of currentSelectionAddrs()) {
      state.formats[addr] = state.formats[addr] || {};
      if (kind === 'currency') state.formats[addr].numFmt = 'currency';
      else if (kind === 'number2') state.formats[addr].numFmt = 'number2';
      else if (kind === 'text') delete state.formats[addr].numFmt;
    }
    renderGrid();
    onChange(getSnapshot());
  }

  function applyShadeToSelection(color) {
    for (const addr of currentSelectionAddrs()) {
      state.formats[addr] = state.formats[addr] || {};
      state.formats[addr].bg = color;
    }
    renderGrid();
    onChange(getSnapshot());
  }

  function applyFontSizeToSelection(sz) {
    for (const addr of currentSelectionAddrs()) {
      state.formats[addr] = state.formats[addr] || {};
      state.formats[addr].fontSize = sz;
    }
    renderGrid();
    onChange(getSnapshot());
  }

  function currentSelectionAddrs() {
    // For brevity we treat A1:H1 merge requests via a prompt below.
    return [state.activeCell];
  }

  function mergeSelection() {
    const range = prompt('Merge range (e.g. A1:H1):', 'A1:H1');
    if (!range || !/^[A-Z]+\d+:[A-Z]+\d+$/.test(range)) return;
    const [a] = range.split(':');
    state.merges[a] = range;
    state.formats[a] = state.formats[a] || {};
    state.formats[a].align = 'center';
    renderGrid();
    onChange(getSnapshot());
  }

  function openSortDialog() {
    const range = prompt('Sort range (e.g. A3:F11):', 'A3:F11');
    if (!range) return;
    const sortCol = prompt('Sort by column letter (e.g. B):', 'B');
    if (!sortCol) return;
    const dir = prompt('Direction: asc or desc', 'asc');
    sortRange(range, sortCol.toUpperCase(), dir === 'desc' ? 'desc' : 'asc');
  }

  function sortRange(range, sortCol, direction) {
    const [a, b] = range.split(':');
    const ax = parseAddr(a), bx = parseAddr(b);
    if (!ax || !bx) return;
    // Read all rows of the range
    const rowsOut = [];
    for (let r = ax.r; r <= bx.r; r++) {
      const rowData = {};
      for (let c = ax.c; c <= bx.c; c++) {
        const addr = cellAddr(r, c);
        rowData[colName(c)] = state.cells[addr] ? { ...state.cells[addr] } : null;
        rowData['__fmt_' + colName(c)] = state.formats[addr] ? { ...state.formats[addr] } : null;
      }
      rowsOut.push(rowData);
    }
    rowsOut.sort((x, y) => {
      const xv = x[sortCol] ? Number(x[sortCol].raw) : 0;
      const yv = y[sortCol] ? Number(y[sortCol].raw) : 0;
      return direction === 'asc' ? xv - yv : yv - xv;
    });
    // Write back
    let r = ax.r;
    for (const rowData of rowsOut) {
      for (let c = ax.c; c <= bx.c; c++) {
        const addr = cellAddr(r, c);
        if (rowData[colName(c)]) state.cells[addr] = { ...rowData[colName(c)] };
        else delete state.cells[addr];
        if (rowData['__fmt_' + colName(c)]) state.formats[addr] = { ...rowData['__fmt_' + colName(c)] };
        else delete state.formats[addr];
      }
      r++;
    }
    state.sortInfo = { range, by: sortCol, direction };
    renderGrid();
    onChange(getSnapshot());
  }

  function openChartDialog() {
    const type = prompt('Chart type: bar, column, pie (no line graphs allowed for this task)', 'bar');
    if (!type || !['bar', 'column', 'pie'].includes(type)) return;
    const labels = prompt('Labels range (e.g. A4:A11):', 'A4:A11');
    const values = prompt('Values range (e.g. G4:G11):', 'G4:G11');
    const title = prompt('Chart title:', 'Sandwich sales');
    const onNewSheet = confirm('Place chart on a new sheet?');
    const xAxisLabel = prompt('X-axis / category label:', 'Sandwich type');
    const yAxisLabel = prompt('Y-axis / values label:', 'Sales');
    state.chart = {
      type, labelsRange: labels, valuesRange: values, title,
      xAxisLabel, yAxisLabel,
      showValues: true,
    };
    if (onNewSheet) {
      const newSheet = 'Chart1';
      if (!state.sheets.includes(newSheet)) state.sheets.push(newSheet);
      state.activeSheet = newSheet;
      rebuildSheetSelect();
      sheetSelect.value = newSheet;
    }
    renderGrid();
    onChange(getSnapshot());
  }

  function drawChart(canvas, chart) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const labels = getRange(chart.labelsRange).map(c => String(c.value));
    const values = getRange(chart.valuesRange).map(c => numOr0(c.value));
    const max = Math.max(1, ...values);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#003057';
    ctx.fillText(chart.title || '', 12, 18);

    if (chart.type === 'pie') {
      let total = values.reduce((a,b)=>a+b, 0) || 1;
      let start = -Math.PI / 2;
      const cx = W/2, cy = H/2 + 10, r = 100;
      const palette = ['#f0801f','#003057','#5a8f29','#a3329a','#d83b3b','#1b8f9c','#c2a516','#444'];
      for (let i = 0; i < values.length; i++) {
        const slice = (values[i] / total) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, start, start + slice);
        ctx.closePath();
        ctx.fillStyle = palette[i % palette.length]; ctx.fill();
        if (chart.showValues) {
          const mid = start + slice/2;
          ctx.fillStyle = '#fff';
          ctx.fillText(String(values[i]), cx + Math.cos(mid)*r*0.6 - 6, cy + Math.sin(mid)*r*0.6);
        }
        start += slice;
      }
      // legend
      let ly = 30;
      for (let i = 0; i < labels.length; i++) {
        ctx.fillStyle = palette[i % palette.length]; ctx.fillRect(W - 130, ly, 10, 10);
        ctx.fillStyle = '#222'; ctx.fillText(labels[i], W - 115, ly + 9);
        ly += 14;
      }
    } else {
      // bar/column chart
      const padL = 60, padB = 50, padT = 30, padR = 20;
      const plotW = W - padL - padR, plotH = H - padT - padB;
      const bw = plotW / Math.max(1, values.length) * 0.7;
      ctx.strokeStyle = '#888'; ctx.beginPath();
      ctx.moveTo(padL, padT); ctx.lineTo(padL, H - padB); ctx.lineTo(W - padR, H - padB); ctx.stroke();
      for (let i = 0; i < values.length; i++) {
        const x = padL + (i + 0.15) * (plotW / values.length);
        const barH = (values[i] / max) * plotH;
        ctx.fillStyle = '#f0801f';
        ctx.fillRect(x, H - padB - barH, bw, barH);
        ctx.fillStyle = '#222';
        ctx.fillText(labels[i], x, H - padB + 14);
        if (chart.showValues) ctx.fillText(String(values[i]), x, H - padB - barH - 4);
      }
      ctx.fillStyle = '#003057';
      if (chart.xAxisLabel) ctx.fillText(chart.xAxisLabel, W / 2 - 30, H - 8);
      if (chart.yAxisLabel) {
        ctx.save(); ctx.translate(14, H/2); ctx.rotate(-Math.PI/2);
        ctx.fillText(chart.yAxisLabel, 0, 0); ctx.restore();
      }
    }
  }

  function getSnapshot() {
    return {
      cells: JSON.parse(JSON.stringify(state.cells)),
      formats: JSON.parse(JSON.stringify(state.formats)),
      merges: { ...state.merges },
      sheets: state.sheets.slice(),
      activeSheet: state.activeSheet,
      sortInfo: state.sortInfo,
      chart: state.chart ? { ...state.chart } : null,
    };
  }

  function rerender() { renderGrid(); }
  renderGrid();

  return { getSnapshot, state };
}
