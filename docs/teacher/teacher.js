// Teacher dashboard logic.
//
// Reads class code from the input (or ?class=CODE in the URL), subscribes
// to Firestore for attempts in that class, and renders:
//   - A sortable leaderboard table
//   - A class-wide "weak topics" panel showing where the class is missing
//     the most marks overall
//
// All data lives in Firestore. Security rules ensure only documents in
// the matching classCode are accessible.

const AREA_LABELS = {
  '1.1-devices': 'Using devices', '1.2-applications': 'Application software',
  '1.3-settings': 'System settings (E3)', '1.3-sponsored': 'Sponsored search results',
  '1.4-search-files': 'Searching for files', '1.5-search': 'Searching the internet',
  '1.5-folders': 'Folder structure', '1.6-cloud': 'Cloud storage',
  '1.6-files': 'Reading & storing files', '1.7-files': 'Files & extensions',
  '1.7-storage': 'Storage units (KB/MB/GB/TB)', '1.8-problems': 'System vs user errors',
  '1.8-compression': 'File compression', '1.9-problems': 'Tech problem solving',
  '1.9-online-help': 'Using online resources', '1.2-reliable': 'Reliability & copyright',
  '2.2-layout': 'Document layout', '2.3-image-edit': 'Image editing',
  '2.4-formulae': 'Spreadsheet formulae', '2.5-sort': 'Sorting & filtering',
  '2.6-format': 'Number formatting', '2.7-charts': 'Charts',
  '3.1-contacts': 'Contacts', '3.1-email': 'Composing emails',
  '3.2-email': 'Email headers', '3.2-messages': 'Online messages',
  '3.3-video': 'Video calls', '3.3-footprint': 'Limiting digital footprint',
  '3.4-footprint': 'Digital footprint', '4.1-account': 'Account settings',
  '4.1-transacting': 'Online buying & forms', '4.2-verification': 'Form verification',
  '4.3-transaction-safety': 'Safe transactions', '5.1-data-rights': 'Data protection rights',
  '5.1-safety': 'Staying safe online', '5.2-personal-info': 'Protecting personal info',
  '5.2-protect': 'Privacy & 2FA', '5.3-authentication': 'Authentication',
  '5.3-cloud-backup': 'Cloud backup', '5.4-security-software': 'Anti-virus',
  '5.4-malware': 'Malware', '5.5-stress': 'Physical strain',
  '5.5-health': 'Health & screen time',
};
const labelFor = (code) => AREA_LABELS[code] || code;

const $ = (sel) => document.querySelector(sel);
let unsubscribe = null;
let currentSort = { key: 'finishedAt', dir: 'desc' };
let currentItems = [];         // raw items from Firestore
let visibleItems = [];         // after filters applied
let currentClassCode = null;   // null = all-classes / master view
let filters = { search: '', class: '', level: '', grade: '' };

function isFirebaseConfigured() {
  return !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey && window.FIREBASE_CONFIG.projectId);
}

// ---------- Initial state ----------
window.addEventListener('DOMContentLoaded', () => {
  if (!isFirebaseConfigured()) {
    $('#firebase-warning').classList.remove('hide');
  }
  $('#class-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = ($('#class-code-input').value || '').trim().toUpperCase();
    if (!code) return;
    location.hash = '#class=' + encodeURIComponent(code);
    loadClass(code);
  });
  $('#all-classes-btn').addEventListener('click', () => {
    location.hash = '#all';
    loadAllClasses();
  });
  $('#change-class').addEventListener('click', () => {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    currentClassCode = null;
    location.hash = '';
    $('#dashboard').classList.add('hide');
    $('#class-picker').classList.remove('hide');
  });

  // Filter inputs (only used in all-classes view)
  ['filter-search', 'filter-class', 'filter-level', 'filter-grade'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const evt = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      filters = {
        search: $('#filter-search').value || '',
        class:  $('#filter-class').value  || '',
        level:  $('#filter-level').value  || '',
        grade:  $('#filter-grade').value  || '',
      };
      renderAll();
    });
  });
  $('#export-csv').addEventListener('click', () => exportCsv());

  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort');
      if (currentSort.key === key) currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
      else { currentSort.key = key; currentSort.dir = 'asc'; }
      renderLeaderboard();
    });
  });

  // Auto-load based on URL hash:
  //   #all                → all-classes / master view
  //   #class=YR11-DFSQ    → single class
  if (/^#all\b/.test(location.hash)) {
    loadAllClasses();
  } else {
    const m = /class=([^&]+)/.exec(location.hash);
    if (m) {
      const code = decodeURIComponent(m[1]).toUpperCase();
      $('#class-code-input').value = code;
      loadClass(code);
    }
  }
});

// ---------- Subscription ----------
let firebaseModule = null;
async function getFirebase() {
  if (firebaseModule) return firebaseModule;
  const SDK = 'https://www.gstatic.com/firebasejs/10.7.1';
  const appMod = await import(SDK + '/firebase-app.js');
  const fsMod  = await import(SDK + '/firebase-firestore.js');
  const app = appMod.initializeApp(window.FIREBASE_CONFIG);
  const db = fsMod.getFirestore(app);
  firebaseModule = { db, ...fsMod };
  return firebaseModule;
}

async function loadClass(code) {
  if (!isFirebaseConfigured()) {
    $('#class-error').textContent = 'Firebase isn\'t configured for this site.';
    $('#class-error').classList.remove('hide');
    return;
  }
  $('#class-error').classList.add('hide');
  currentClassCode = code;
  $('#class-title').textContent = 'Class ' + code;
  $('#leaderboard-title').textContent = 'Leaderboard';
  $('#weak-title').textContent = 'Class-wide weak topics';
  $('#filter-bar').classList.add('hide');
  $('#th-class').classList.add('hide');

  const fb = await getFirebase();
  const q = fb.query(
    fb.collection(fb.db, 'attempts'),
    fb.where('classCode', '==', code),
    fb.orderBy('finishedAt', 'desc'),
    fb.limit(500),
  );
  if (unsubscribe) unsubscribe();
  unsubscribe = fb.onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
    currentItems = items;
    renderAll();
  }, (err) => {
    $('#class-error').textContent = 'Couldn\'t load attempts: ' + err.message;
    $('#class-error').classList.remove('hide');
  });

  $('#class-picker').classList.add('hide');
  $('#dashboard').classList.remove('hide');
}

// Load ALL attempts across every class. Filters are applied client-side.
async function loadAllClasses() {
  if (!isFirebaseConfigured()) {
    $('#class-error').textContent = 'Firebase isn\'t configured for this site.';
    $('#class-error').classList.remove('hide');
    return;
  }
  $('#class-error').classList.add('hide');
  currentClassCode = null;
  $('#class-title').textContent = 'All-time history';
  $('#leaderboard-title').textContent = 'All attempts';
  $('#weak-title').textContent = 'Overall weak topics';
  $('#filter-bar').classList.remove('hide');
  $('#th-class').classList.remove('hide');

  const fb = await getFirebase();
  const q = fb.query(
    fb.collection(fb.db, 'attempts'),
    fb.orderBy('finishedAt', 'desc'),
    fb.limit(1000),
  );
  if (unsubscribe) unsubscribe();
  unsubscribe = fb.onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
    currentItems = items;
    populateClassFilter();
    renderAll();
  }, (err) => {
    $('#class-error').textContent = 'Couldn\'t load attempts: ' + err.message;
    $('#class-error').classList.remove('hide');
  });

  $('#class-picker').classList.add('hide');
  $('#dashboard').classList.remove('hide');
}

// Populate the class filter dropdown with all distinct class codes
// found in the loaded data.
function populateClassFilter() {
  const sel = $('#filter-class');
  if (!sel) return;
  const previous = sel.value;
  const codes = Array.from(new Set(currentItems.map(i => i.classCode || '—'))).sort();
  sel.innerHTML = '<option value="">All classes</option>' +
    codes.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  sel.value = previous;
}

// Apply current filters
function applyFilters(items) {
  const q = (filters.search || '').toLowerCase().trim();
  return items.filter((it) => {
    if (filters.class && it.classCode !== filters.class) return false;
    if (filters.level && it.level !== filters.level) return false;
    if (filters.grade && it.grade !== filters.grade) return false;
    if (q) {
      const hay = ((it.studentName || '') + ' ' + (it.classCode || '') +
                   ' ' + (it.registration || '')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ---------- Render ----------
function renderAll() {
  visibleItems = currentClassCode ? currentItems : applyFilters(currentItems);
  const students = new Set(visibleItems.map(i => i.studentName)).size;
  const totals = currentItems.length;
  const visible = visibleItems.length;
  $('#class-stats').textContent =
    visible + (visible !== totals ? ' of ' + totals : '') +
    ' attempt' + (visible === 1 ? '' : 's') +
    ' · ' + students + ' student' + (students === 1 ? '' : 's');
  const sumEl = $('#filter-summary');
  if (sumEl) {
    if (currentClassCode) sumEl.textContent = '';
    else sumEl.textContent = visible !== totals
      ? 'Filtered (' + (totals - visible) + ' hidden)'
      : 'Showing all';
  }
  renderLeaderboard();
  renderWeakTopics();
}

function renderLeaderboard() {
  const tbody = $('#leaderboard tbody');
  tbody.innerHTML = '';
  const sorted = visibleItems.slice().sort((a, b) => {
    const va = a[currentSort.key] || '';
    const vb = b[currentSort.key] || '';
    if (typeof va === 'number' && typeof vb === 'number') {
      return currentSort.dir === 'asc' ? va - vb : vb - va;
    }
    return currentSort.dir === 'asc'
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va));
  });

  // Update sort indicators
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    const k = th.getAttribute('data-sort');
    const base = th.textContent.replace(/[↑↓]/g, '').trim();
    th.textContent = base + (k === currentSort.key
      ? ' ' + (currentSort.dir === 'asc' ? '↑' : '↓') : '');
  });

  const showClass = !currentClassCode;
  for (const it of sorted) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(it.finishedAt)}${it.backfilled ? ' <span class="pill" title="Past attempt backfilled from a student\\'s device">↑</span>' : ''}</td>
      <td>${esc(it.studentName)}</td>
      ${showClass ? `<td class="mono">${esc(it.classCode || '—')}</td>` : ''}
      <td>${esc((it.level || '').toUpperCase())}</td>
      <td>${it.totalScore ?? 0} / ${it.totalMax ?? 0}</td>
      <td>
        <span class="pill ${it.pct >= 60 ? 'ok' : 'bad'}">${it.pct ?? 0}%</span>
      </td>
      <td>
        <span class="pill ${it.grade === 'Pass' ? 'ok' : 'bad'}">${esc(it.grade || '—')}</span>
      </td>
      <td>${esc(it.mode || 'both')}</td>
      <td class="mono">${esc(it.seed || '')}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderWeakTopics() {
  // Roll up areaStats from every visible attempt (respects filters).
  const agg = {};
  for (const it of visibleItems) {
    const s = it.areaStats || {};
    for (const [area, stats] of Object.entries(s)) {
      if (!agg[area]) agg[area] = { correct: 0, total: 0 };
      agg[area].correct += stats.correct || 0;
      agg[area].total   += stats.total   || 0;
    }
  }
  const rows = Object.entries(agg)
    .map(([area, s]) => ({
      area, correct: s.correct, total: s.total,
      accuracy: s.total ? s.correct / s.total : 0,
    }))
    .filter(r => r.total >= 2)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 12);

  const host = $('#weak-topics');
  host.innerHTML = '';
  if (!rows.length) {
    host.innerHTML = '<p class="muted">No data yet — students need to complete at least a couple of attempts first.</p>';
    return;
  }
  for (const r of rows) {
    const pct = Math.round(r.accuracy * 100);
    const tier = pct < 50 ? 'weak' : pct < 75 ? 'improving' : 'strong';
    const row = document.createElement('div');
    row.className = 'weak-row tier-' + tier;
    row.innerHTML = `
      <div>
        <strong>${esc(labelFor(r.area))}</strong>
        <div class="muted small">${esc(r.area)}</div>
      </div>
      <div class="weak-bar"><span style="width:${pct}%"></span></div>
      <div class="mono">${r.correct} / ${r.total} (${pct}%)</div>
    `;
    host.appendChild(row);
  }
}

// ---------- CSV export ----------
function exportCsv() {
  if (!visibleItems.length) return;
  const cols = ['finishedAt', 'studentName', 'classCode', 'level', 'totalScore', 'totalMax', 'pct', 'grade', 'mode', 'seed', 'registration', 'backfilled'];
  const lines = [cols.join(',')];
  for (const it of visibleItems) {
    lines.push(cols.map(c => csvCell(it[c])).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const label = currentClassCode ? 'class-' + currentClassCode : 'all-classes';
  a.download = 'dfsq-' + label + '-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
}

// ---------- helpers ----------
function esc(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c])); }
function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}
