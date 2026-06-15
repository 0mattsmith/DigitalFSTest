// Lightweight rich-text document editor styled to look like Microsoft
// Word (Office 365 / 2019). Uses contentEditable under the hood but
// presents a Word-style title bar, ribbon tabs (Home / Insert / Layout),
// grouped buttons with labels, and an A4 paper on a grey canvas.
// Designed to cover the formatting tasks the DFSQ Level 1 flyer asks
// for: landscape orientation toggle, font selection, font size, font
// colour, bold / italic / underline, page border, image insertion,
// alignment, tables.

import { h } from '../screens/components.js';

export function mountDocEditor(container, opts) {
  const { initialHtml = '', initialLandscape = false, images = [], onChange = () => {} } = opts;

  const state = {
    landscape: initialLandscape,
    border: false,
    activeTab: 'home',
    docName: 'Document1',
  };

  // --- Paper ---------------------------------------------------------
  const paper = h('div', {
    class: 'doc-paper' + (state.landscape ? ' landscape' : ''),
    contenteditable: 'true',
    spellcheck: 'false',
  });
  paper.innerHTML = initialHtml;
  paper.addEventListener('input', () => { updateWordCount(); onChange(getSnapshot()); });
  paper.addEventListener('mouseup', updateActiveStates);
  paper.addEventListener('keyup', updateActiveStates);

  // --- Title bar (with Quick Access Toolbar + doc name) -------------
  const qatUndo = h('button', { class: 'qat-btn', title: 'Undo (Ctrl+Z)', onClick: () => exec('undo') }, '↶');
  const qatRedo = h('button', { class: 'qat-btn', title: 'Redo (Ctrl+Y)', onClick: () => exec('redo') }, '↷');
  const qatSave = h('button', { class: 'qat-btn', title: 'Save', onClick: () => onChange(getSnapshot()) }, '💾');
  const titleBar = h('div', { class: 'word-titlebar' },
    h('div', { class: 'qat' }, qatSave, qatUndo, qatRedo),
    h('div', { class: 'doc-name' }, state.docName + ' — Word'));

  // --- Tabs ----------------------------------------------------------
  function tabBtn(id, label) {
    const b = h('button', { class: 'tab' + (state.activeTab === id ? ' is-active' : ''),
      onClick: () => { state.activeTab = id; rebuildTabs(); rebuildRibbon(); } }, label);
    return b;
  }
  const tabs = h('div', { class: 'word-tabs' });
  function rebuildTabs() {
    tabs.innerHTML = '';
    tabs.appendChild(tabBtn('file', 'File'));
    tabs.appendChild(tabBtn('home', 'Home'));
    tabs.appendChild(tabBtn('insert', 'Insert'));
    tabs.appendChild(tabBtn('layout', 'Layout'));
    tabs.appendChild(tabBtn('view', 'View'));
  }

  // --- Ribbon groups -------------------------------------------------
  const ribbon = h('div', { class: 'word-ribbon' });

  function group(label, ...content) {
    return h('div', { class: 'ribbon-group' },
      h('div', { class: 'group-content' }, ...content),
      h('div', { class: 'group-label' }, label));
  }

  // Reusable controls (kept around so we can re-mount them across tabs).
  const fontSel = h('select', { class: 'ribbon-select font-name' },
    ...['Calibri','Arial','Times New Roman','Georgia','Comic Sans MS','Verdana','Courier New','Cambria','Tahoma']
      .map(f => h('option', { value: f }, f)));
  fontSel.value = 'Calibri';
  fontSel.onchange = () => exec('fontName', fontSel.value);

  const sizeSel = h('select', { class: 'ribbon-select font-size' });
  for (const s of [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]) sizeSel.appendChild(h('option', { value: s }, String(s)));
  sizeSel.value = '11';
  sizeSel.onchange = () => execFontSize(parseInt(sizeSel.value, 10));

  const colorInput = h('input', { type: 'color', class: 'ribbon-color', value: '#000000', title: 'Font color' });
  colorInput.onchange = () => exec('foreColor', colorInput.value);

  function rBtn(label, icon, onClick, title, dataKey) {
    const b = h('button', { class: 'ribbon-btn', title: title || label, onClick }, icon);
    if (dataKey) b.dataset.cmd = dataKey;
    return b;
  }

  const boldBtn = rBtn('Bold', h('span', { style: { fontWeight: 'bold' } }, 'B'),
    () => exec('bold'), 'Bold (Ctrl+B)', 'bold');
  const italicBtn = rBtn('Italic', h('span', { style: { fontStyle: 'italic' } }, 'I'),
    () => exec('italic'), 'Italic (Ctrl+I)', 'italic');
  const underBtn = rBtn('Underline', h('span', { style: { textDecoration: 'underline' } }, 'U'),
    () => exec('underline'), 'Underline (Ctrl+U)', 'underline');
  const strikeBtn = rBtn('Strikethrough', h('span', { style: { textDecoration: 'line-through' } }, 'abc'),
    () => exec('strikeThrough'), 'Strikethrough', 'strikeThrough');

  const alignLBtn = rBtn('Align Left', '⯇', () => exec('justifyLeft'), 'Align Left', 'justifyLeft');
  const alignCBtn = rBtn('Center', '☰', () => exec('justifyCenter'), 'Center', 'justifyCenter');
  const alignRBtn = rBtn('Align Right', '⯈', () => exec('justifyRight'), 'Align Right', 'justifyRight');
  const alignJBtn = rBtn('Justify', '☷', () => exec('justifyFull'), 'Justify', 'justifyFull');

  const bulletBtn = rBtn('Bullets', '•≡', () => exec('insertUnorderedList'), 'Bulleted list', 'insertUnorderedList');
  const numberBtn = rBtn('Numbering', '1≡', () => exec('insertOrderedList'), 'Numbered list', 'insertOrderedList');

  const insertTableBtn = h('button', { class: 'ribbon-btn tall', onClick: insertTablePrompt, title: 'Insert table' },
    h('div', { class: 'icon' }, '▦'),
    h('div', { class: 'label' }, 'Table'));
  const insertImageBtn = h('button', { class: 'ribbon-btn tall', onClick: insertImagePrompt, title: 'Insert picture' },
    h('div', { class: 'icon' }, '🖼'),
    h('div', { class: 'label' }, 'Pictures'));
  const insertLinkBtn = h('button', { class: 'ribbon-btn tall', onClick: insertLinkPrompt, title: 'Insert hyperlink' },
    h('div', { class: 'icon' }, '🔗'),
    h('div', { class: 'label' }, 'Link'));

  const orientBtn = h('button', { class: 'ribbon-btn tall', onClick: () => {
    state.landscape = !state.landscape;
    paper.classList.toggle('landscape', state.landscape);
    rebuildRibbon();
    onChange(getSnapshot());
  }, title: 'Toggle orientation' },
    h('div', { class: 'icon' }, '▭'),
    h('div', { class: 'label' }, state.landscape ? 'Landscape' : 'Portrait'));

  const borderBtn = h('button', { class: 'ribbon-btn tall', onClick: () => {
    state.border = !state.border;
    paper.style.border = state.border ? '3px double #2b579a' : '1px solid #c8c6c4';
    rebuildRibbon();
    onChange(getSnapshot());
  }, title: 'Page borders' },
    h('div', { class: 'icon' }, '⬚'),
    h('div', { class: 'label' }, state.border ? 'Border ✓' : 'Borders'));

  const marginsBtn = h('button', { class: 'ribbon-btn tall', onClick: () => {
    const m = prompt('Page margin (inches):', '1');
    const n = parseFloat(m);
    if (!isNaN(n) && n >= 0.2 && n <= 2) {
      paper.style.padding = n + 'in';
      onChange(getSnapshot());
    }
  }, title: 'Page margins' },
    h('div', { class: 'icon' }, '⬜'),
    h('div', { class: 'label' }, 'Margins'));

  function rebuildRibbon() {
    ribbon.innerHTML = '';
    if (state.activeTab === 'home') {
      ribbon.appendChild(group('Clipboard',
        rBtn('Paste', '📋', () => exec('paste'), 'Paste'),
        rBtn('Cut', '✂', () => exec('cut'), 'Cut'),
        rBtn('Copy', '⎘', () => exec('copy'), 'Copy')));
      ribbon.appendChild(group('Font',
        fontSel, sizeSel,
        h('div', { style: { display: 'flex', gap: '4px', width: '100%', marginTop: '4px' } },
          boldBtn, italicBtn, underBtn, strikeBtn, colorInput)));
      ribbon.appendChild(group('Paragraph',
        h('div', { style: { display: 'flex', gap: '4px' } },
          alignLBtn, alignCBtn, alignRBtn, alignJBtn),
        h('div', { style: { display: 'flex', gap: '4px', marginTop: '4px' } },
          bulletBtn, numberBtn)));
      ribbon.appendChild(group('Styles',
        rBtn('Heading 1', 'H1', () => exec('formatBlock', 'H1'), 'Heading 1'),
        rBtn('Heading 2', 'H2', () => exec('formatBlock', 'H2'), 'Heading 2'),
        rBtn('Normal', '¶', () => exec('formatBlock', 'P'), 'Normal')));
    } else if (state.activeTab === 'insert') {
      ribbon.appendChild(group('Tables', insertTableBtn));
      ribbon.appendChild(group('Illustrations', insertImageBtn));
      ribbon.appendChild(group('Links', insertLinkBtn));
    } else if (state.activeTab === 'layout') {
      ribbon.appendChild(group('Page Setup', orientBtn, marginsBtn));
      ribbon.appendChild(group('Page Background', borderBtn));
    } else if (state.activeTab === 'view') {
      ribbon.appendChild(group('Zoom',
        rBtn('Zoom in', '+', () => zoom(0.1), 'Zoom in'),
        rBtn('Zoom out', '−', () => zoom(-0.1), 'Zoom out'),
        rBtn('100%', '100%', () => setZoom(1), 'Reset zoom')));
    } else if (state.activeTab === 'file') {
      ribbon.appendChild(group('File',
        rBtn('Save', '💾', () => onChange(getSnapshot()), 'Save')));
    }
    updateActiveStates();
  }

  function execFontSize(px) {
    // execCommand fontSize only accepts 1-7. Use insertHTML with a span instead.
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) {
      // No selection — set default style for next-typed text via execCommand
      document.execCommand('fontSize', false, 7);
      const fonts = paper.querySelectorAll('font[size="7"]');
      for (const f of fonts) {
        f.removeAttribute('size');
        f.style.fontSize = px + 'pt';
      }
    } else {
      const span = document.createElement('span');
      span.style.fontSize = px + 'pt';
      span.appendChild(range.extractContents());
      range.insertNode(span);
    }
    paper.focus();
    onChange(getSnapshot());
  }

  function exec(cmd, arg) {
    document.execCommand(cmd, false, arg);
    paper.focus();
    updateActiveStates();
    onChange(getSnapshot());
  }

  function updateActiveStates() {
    for (const btn of ribbon.querySelectorAll('.ribbon-btn[data-cmd]')) {
      const cmd = btn.dataset.cmd;
      try {
        btn.classList.toggle('is-active', !!document.queryCommandState(cmd));
      } catch {}
    }
  }

  function insertTablePrompt() {
    const rowsN = parseInt(prompt('Number of rows:', '3'), 10) || 3;
    const colsN = parseInt(prompt('Number of columns:', '2'), 10) || 2;
    let html = '<table>';
    for (let r = 0; r < rowsN; r++) {
      html += '<tr>';
      for (let c = 0; c < colsN; c++) {
        html += '<td>&nbsp;</td>';
      }
      html += '</tr>';
    }
    html += '</table><p></p>';
    document.execCommand('insertHTML', false, html);
    onChange(getSnapshot());
  }

  function insertLinkPrompt() {
    const url = prompt('URL:', 'https://');
    if (!url) return;
    document.execCommand('createLink', false, url);
    onChange(getSnapshot());
  }

  function insertImagePrompt() {
    // Build a small image picker dialog
    const back = h('div', { class: 'modal-back', onClick: (e) => { if (e.target === back) close(); } });
    function close() { back.remove(); }
    const modal = h('div', { class: 'modal' },
      h('h2', {}, 'Insert picture'));
    if (images.length === 0) {
      modal.appendChild(h('p', { class: 'muted' }, 'No scenario images available. You can use Insert → Picture in Word during the real exam.'));
      modal.appendChild(h('input', { type: 'file', accept: 'image/*', onChange: (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = () => {
          document.execCommand('insertHTML', false, `<img src="${r.result}" style="max-width:300px"/>`);
          onChange(getSnapshot()); close();
        };
        r.readAsDataURL(file);
      } }));
    } else {
      const gallery = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '10px' } });
      for (const img of images) {
        const thumb = h('div', { style: { border: '1px solid #c8c6c4', borderRadius: '4px', padding: '6px', cursor: 'pointer', textAlign: 'center' },
          onClick: () => {
            document.execCommand('insertHTML', false,
              `<img src="${img.src}" data-img-id="${img.id}" style="max-width:300px;display:inline-block;margin:6px" />`);
            onChange(getSnapshot()); close();
          } },
          h('img', { src: img.src, style: { maxWidth: '100%', maxHeight: '80px' } }),
          h('div', { style: { fontSize: '11px', marginTop: '4px' } }, img.id));
        gallery.appendChild(thumb);
      }
      modal.appendChild(gallery);
    }
    modal.appendChild(h('div', { class: 'modal-actions' },
      h('button', { class: 'btn-mini', onClick: close }, 'Cancel')));
    back.appendChild(modal);
    document.body.appendChild(back);
  }

  // --- Zoom ---------------------------------------------------------
  let zoomLevel = 1;
  function zoom(delta) { setZoom(Math.max(0.5, Math.min(2, zoomLevel + delta))); }
  function setZoom(z) {
    zoomLevel = z;
    paper.style.transform = `scale(${z})`;
    paper.style.transformOrigin = 'top center';
    statusZoom.textContent = Math.round(z * 100) + '%';
  }

  // --- Status bar ---------------------------------------------------
  const statusPage = h('span', { class: 'status-item' }, 'Page 1 of 1');
  const statusWords = h('span', { class: 'status-item' }, '0 words');
  const statusZoom = h('span', { class: 'status-item' }, '100%');
  const status = h('div', { class: 'word-statusbar' },
    statusPage, statusWords,
    h('span', { class: 'spacer' }),
    statusZoom);

  function updateWordCount() {
    const text = paper.innerText || '';
    const words = text.split(/\s+/).filter(Boolean).length;
    statusWords.textContent = words + ' word' + (words === 1 ? '' : 's');
  }

  // --- Compose final layout ----------------------------------------
  const canvas = h('div', { class: 'word-canvas' }, paper);
  const app = h('div', { class: 'word-app' },
    titleBar, tabs, ribbon, canvas, status);

  container.innerHTML = '';
  container.appendChild(app);

  rebuildTabs();
  rebuildRibbon();
  updateWordCount();
  // Auto-focus the paper so typing works immediately
  setTimeout(() => paper.focus(), 0);

  function getSnapshot() {
    return {
      html: paper.innerHTML,
      landscape: state.landscape,
      border: state.border,
    };
  }

  return { getSnapshot };
}
