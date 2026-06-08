// Update banner — listens to main-process update events and shows a
// small, non-intrusive notification at the top right of the window when
// an update is available. The user is always in charge: nothing
// downloads or installs without them clicking.
//
// Visual states:
//   - available     : "Version X.X.X available — [Download] [Later]"
//   - downloading   : progress bar + percentage
//   - downloaded    : "Update ready — [Restart to install] [Later]"
//   - error         : "Couldn't check for updates" (auto-dismisses)
//   - up-to-date / checking / idle : banner is hidden

import { h } from './components.js';

let bannerEl = null;
let dismissedVersion = null;     // user clicked "Later" for this version
let lastStatus = { kind: 'idle' };

function ensureBanner() {
  if (bannerEl && document.body.contains(bannerEl)) return bannerEl;
  bannerEl = h('div', { id: 'update-banner', class: 'update-banner is-hidden' });
  document.body.appendChild(bannerEl);
  return bannerEl;
}

function hide() {
  if (bannerEl) bannerEl.classList.add('is-hidden');
}

function show() {
  ensureBanner().classList.remove('is-hidden');
}

function renderBanner(status) {
  const b = ensureBanner();
  b.innerHTML = '';

  // Generic close (X) button — always available
  const closeX = h('button', { class: 'ub-close', title: 'Dismiss', onClick: () => {
    if (status.kind === 'available' || status.kind === 'downloaded') {
      dismissedVersion = status.version;
    }
    hide();
  } }, '×');

  if (status.kind === 'available') {
    if (dismissedVersion === status.version) { hide(); return; }
    b.classList.remove('ub-progress', 'ub-done', 'ub-error');
    b.appendChild(h('div', { class: 'ub-row' },
      h('div', { class: 'ub-icon' }, '↓'),
      h('div', { class: 'ub-text' },
        h('div', { class: 'ub-title' }, 'Update available'),
        h('div', { class: 'ub-sub' }, 'Version ' + status.version + ' is ready to download.'))));
    b.appendChild(h('div', { class: 'ub-actions' },
      h('button', { class: 'ub-btn ub-btn-primary', onClick: () => window.dfsq.updates.download() }, 'Download'),
      h('button', { class: 'ub-btn', onClick: () => { dismissedVersion = status.version; hide(); } }, 'Later')));
    b.appendChild(closeX);
    show();
    return;
  }

  if (status.kind === 'downloading') {
    b.classList.add('ub-progress');
    const pct = Math.max(0, Math.min(100, status.percent || 0));
    b.appendChild(h('div', { class: 'ub-row' },
      h('div', { class: 'ub-icon' }, '↓'),
      h('div', { class: 'ub-text' },
        h('div', { class: 'ub-title' }, 'Downloading update…'),
        h('div', { class: 'ub-sub' }, pct + '% complete'))));
    const bar = h('div', { class: 'ub-bar' });
    const fill = h('div', { class: 'ub-bar-fill', style: { width: pct + '%' } });
    bar.appendChild(fill);
    b.appendChild(bar);
    b.appendChild(closeX);
    show();
    return;
  }

  if (status.kind === 'downloaded') {
    if (dismissedVersion === status.version + '-installed') { hide(); return; }
    b.classList.remove('ub-progress');
    b.classList.add('ub-done');
    b.appendChild(h('div', { class: 'ub-row' },
      h('div', { class: 'ub-icon' }, '✓'),
      h('div', { class: 'ub-text' },
        h('div', { class: 'ub-title' }, 'Update ready'),
        h('div', { class: 'ub-sub' }, 'Restart to install version ' + status.version + '.'))));
    b.appendChild(h('div', { class: 'ub-actions' },
      h('button', { class: 'ub-btn ub-btn-primary', onClick: () => window.dfsq.updates.installAndRestart() }, 'Restart now'),
      h('button', { class: 'ub-btn', onClick: () => { dismissedVersion = status.version + '-installed'; hide(); } }, 'Later')));
    b.appendChild(closeX);
    show();
    return;
  }

  if (status.kind === 'error') {
    // Don't pop up the banner for errors during the silent startup check —
    // they're often just "no network". A manual check shows them via toast.
    return;
  }

  if (status.kind === 'up-to-date') {
    // Only show this after a manual check (we track that with a flag)
    if (manualCheckPending) {
      manualCheckPending = false;
      flashToast('You\'re on the latest version (' + (status.currentVersion || '?') + ').');
    }
    hide();
    return;
  }

  // Other kinds: checking / idle / disabled — banner stays hidden.
  hide();
}

let manualCheckPending = false;

function flashToast(msg) {
  const t = h('div', { class: 'ub-toast' }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('is-leaving'), 2200);
  setTimeout(() => t.remove(), 2700);
}

export function startUpdateListener() {
  if (!window.dfsq || !window.dfsq.updates) return;
  window.dfsq.updates.onEvent((status) => {
    lastStatus = status;
    renderBanner(status);
  });
  // Pull any status the main process already has (e.g. if we navigated back
  // to the home screen after a check completed)
  window.dfsq.updates.status().then((s) => {
    if (s && s.kind && s.kind !== 'idle') {
      lastStatus = s;
      renderBanner(s);
    }
  }).catch(() => {});
}

export async function manualCheck() {
  if (!window.dfsq || !window.dfsq.updates) {
    flashToast('Auto-updates are not enabled in this build.');
    return;
  }
  manualCheckPending = true;
  flashToast('Checking for updates…');
  await window.dfsq.updates.check();
}

export async function getCurrentVersion() {
  if (!window.dfsq || !window.dfsq.updates) return null;
  try { return await window.dfsq.updates.version(); }
  catch { return null; }
}
