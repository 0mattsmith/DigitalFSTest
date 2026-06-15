// web-bridge.js
//
// Polyfills the same `window.dfsq` surface that the Electron preload script
// exposes, so the renderer (src/renderer/app.js + screens + editors) can
// run unchanged in a normal browser deployed to GitHub Pages.
//
// Storage strategy:
//   - localStorage: history index (small)
//   - IndexedDB:    per-attempt files (screenshots, document snapshots,
//                   form values) — much higher size limit than localStorage.
//
// Screenshots: rendered with html2canvas (loaded from CDN by index.html).
// External "open in default app" actions just trigger a browser download.
// Window controls and the auto-updater are no-ops (browser handles its own
// chrome, and the deployed Pages site is always the latest version).

(function () {
  'use strict';

  // ------------------------------------------------------------------
  //  Constants
  // ------------------------------------------------------------------
  const HISTORY_KEY = 'dfsq.history.v1';
  const APP_VERSION = 'web';
  const APP_NAME    = 'DFSQ Practice (Web)';

  // ------------------------------------------------------------------
  //  IndexedDB helper for per-attempt files
  // ------------------------------------------------------------------
  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('dfsq-attempts', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('files')) {
          const store = db.createObjectStore('files', { keyPath: 'key' });
          store.createIndex('byAttempt', 'attemptId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
    return dbPromise;
  }

  async function saveFile({ attemptId, filename, content, encoding }) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      const key = attemptId + '/' + filename;
      tx.objectStore('files').put({
        key, attemptId, filename, content, encoding,
        savedAt: new Date().toISOString(),
      });
      tx.oncomplete = () => resolve({ path: 'browser://' + key });
      tx.onerror    = () => reject(tx.error);
    });
  }

  async function listFiles(attemptId) {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('files', 'readonly');
      const idx = tx.objectStore('files').index('byAttempt');
      const req = idx.getAll(IDBKeyRange.only(attemptId));
      req.onsuccess = () => {
        resolve((req.result || []).map((f) => ({
          name: f.filename,
          fullPath: f.key,
          savedAt: f.savedAt,
        })));
      };
      req.onerror = () => resolve([]);
    });
  }

  async function readFile(fullPath) {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('files', 'readonly');
      const req = tx.objectStore('files').get(fullPath);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => resolve(null);
    });
  }

  // ------------------------------------------------------------------
  //  History (localStorage)
  // ------------------------------------------------------------------
  function readHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '{"attempts":[]}');
    } catch {
      return { attempts: [] };
    }
  }
  function writeHistory(h) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch {}
  }

  async function listHistory() { return readHistory(); }

  async function saveHistory(attempt) {
    const h = readHistory();
    // Deduplicate: replace any existing entry with the same id so an
    // attempt updates in place instead of stacking duplicates.
    h.attempts = h.attempts.filter((a) => a.id !== attempt.id);
    h.attempts.unshift(attempt);
    h.attempts = h.attempts.slice(0, 200);
    writeHistory(h);
    return { ok: true };
  }

  // ------------------------------------------------------------------
  //  JSON bank / scenario loading via fetch
  // ------------------------------------------------------------------
  async function loadJSON(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Failed to load ' + url + ': ' + res.status);
    return res.json();
  }

  // ------------------------------------------------------------------
  //  Screenshot capture via html2canvas
  // ------------------------------------------------------------------
  async function captureWindow(opts = {}) {
    if (!window.html2canvas) {
      return { ok: false, error: 'Screenshot library still loading. Try again in a moment.' };
    }
    // Hide the global screenshot button briefly so it isn't in the capture.
    const btn = document.getElementById('tb-screenshot');
    const prev = btn ? btn.style.visibility : '';
    if (btn) btn.style.visibility = 'hidden';
    try {
      const canvas = await window.html2canvas(document.body, {
        logging: false, backgroundColor: '#ffffff', useCORS: true,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const filename = opts.filename || 'screenshot_' +
        new Date().toISOString().replace(/[:.]/g, '-') + '.png';
      if (opts.attemptId) {
        await saveFile({
          attemptId: opts.attemptId, filename,
          content: dataUrl.split(',')[1], encoding: 'base64',
        });
      }
      return { ok: true, dataUrl, filename };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      if (btn) btn.style.visibility = prev;
    }
  }

  // ------------------------------------------------------------------
  //  Downloads (replaces shell:exportToDownloads + openAttemptFolder)
  // ------------------------------------------------------------------
  function base64ToBlob(b64, mime = 'application/octet-stream') {
    const chars = atob(b64);
    const bytes = new Uint8Array(chars.length);
    for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function exportToDownloads(payload) {
    const filename = payload.defaultName || 'export';
    let blob;
    if (payload.encoding === 'base64') {
      blob = base64ToBlob(payload.content, guessMime(filename));
    } else {
      blob = new Blob([payload.content], { type: guessMime(filename) });
    }
    triggerDownload(blob, filename);
    return { ok: true, path: filename };
  }

  function guessMime(filename) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    return {
      html: 'text/html', htm: 'text/html',
      txt:  'text/plain',
      csv:  'text/csv',
      json: 'application/json',
      png:  'image/png',
      jpg:  'image/jpeg', jpeg: 'image/jpeg',
      pdf:  'application/pdf',
    }[ext] || 'application/octet-stream';
  }

  function triggerDownload(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
  }

  async function openAttemptFolder(attemptId) {
    const files = await listFiles(attemptId);
    if (!files.length) {
      alert('No saved files yet for this attempt. They appear here as you complete tasks.');
      return { ok: true };
    }
    // Show a small modal listing the files with per-file download buttons.
    showFilesModal(attemptId, files);
    return { ok: true };
  }

  function showFilesModal(attemptId, files) {
    const existing = document.getElementById('web-files-modal');
    if (existing) existing.remove();
    const back = document.createElement('div');
    back.id = 'web-files-modal';
    back.className = 'ss-modal-backdrop';
    back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });

    const card = document.createElement('div');
    card.className = 'ss-modal';
    card.innerHTML =
      '<div class="ss-modal-head"><strong>Saved files for this attempt</strong>' +
      '<button class="btn-mini" id="close-files-modal">Close ✕</button></div>' +
      '<div style="padding:14px;max-height:60vh;overflow:auto"><ul id="files-list" style="list-style:none;padding:0;margin:0"></ul></div>';
    back.appendChild(card);
    document.body.appendChild(back);

    document.getElementById('close-files-modal').onclick = () => back.remove();
    const ul = document.getElementById('files-list');
    for (const f of files) {
      const li = document.createElement('li');
      li.style.cssText = 'padding:8px 0;border-bottom:1px solid #eee;display:flex;align-items:center;gap:10px';
      li.innerHTML = '<span style="flex:1;font-family:Menlo,monospace;font-size:12px">' + f.name + '</span>';
      const btn = document.createElement('button');
      btn.className = 'btn-mini'; btn.textContent = 'Download';
      btn.onclick = async () => {
        const rec = await readFile(f.fullPath);
        if (!rec) return;
        const blob = rec.encoding === 'base64'
          ? base64ToBlob(rec.content, guessMime(rec.filename))
          : new Blob([rec.content], { type: guessMime(rec.filename) });
        triggerDownload(blob, rec.filename);
      };
      li.appendChild(btn);
      ul.appendChild(li);
    }
  }

  async function openExternalFile() {
    alert('In the web version, finished files appear in your browser\'s Downloads folder when you click "Open in default app". The web build can\'t open them in your local Excel/Word for you.');
    return { ok: false, error: 'unsupported in web build' };
  }

  async function openUrl(url) {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      window.open(url, '_blank', 'noopener');
      return { ok: true };
    }
    return { ok: false, error: 'Invalid URL' };
  }

  // ------------------------------------------------------------------
  //  No-ops for window controls + auto-updater (irrelevant in browser)
  // ------------------------------------------------------------------
  const windowApi = {
    minimize:           () => Promise.resolve(),
    toggleMaximize:     () => Promise.resolve(),
    close:              () => Promise.resolve(),
    isMaximized:        () => Promise.resolve(false),
    onMaximizedChanged: () => {},
  };

  const updates = {
    check:             () => Promise.resolve({ ok: true, info: null }),
    download:          () => Promise.resolve({ ok: false }),
    installAndRestart: () => Promise.resolve({ ok: false }),
    status:            () => Promise.resolve({ kind: 'idle' }),
    version:           () => Promise.resolve({ name: APP_NAME, version: APP_VERSION }),
    onEvent:           () => {},
  };

  // ------------------------------------------------------------------
  //  Final API surface (must match Electron's preload exactly)
  // ------------------------------------------------------------------
  window.dfsq = {
    platform: 'web',

    loadBank:        (level) => loadJSON('assets/banks/' + level + '.json'),
    loadScenarios:   (level) => loadJSON('assets/scenarios/' + level + '.json'),

    listHistory,
    saveHistory,

    saveAttemptFile: saveFile,
    listAttemptFiles: listFiles,
    openAttemptFolder,

    openExternalFile,
    openUrl,
    exportToDownloads,

    captureWindow,

    meta: () => Promise.resolve({
      appName: APP_NAME, appVersion: APP_VERSION,
      platform: 'web', arch: 'web',
    }),

    window: windowApi,
    updates,
  };

  // Tiny startup log so you can confirm in DevTools that the bridge is live.
  console.log('[dfsq] Web bridge initialised. Storage: localStorage + IndexedDB(dfsq-attempts).');
})();
