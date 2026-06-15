// Update banner — listens to main-process update events and shows a
// small, non-intrusive notification at the top right of the window when
// an update is available. The user is always in charge: nothing
// downloads or installs without them clicking.
//
// Visual states (status.kind):
//   - available       : "Version X.X.X available — [Download] [Later]"
//   - downloading     : progress bar + percentage
//   - downloaded      : "Update ready — [Restart to install] [Later]"
//   - portable-update : "Update available, manual install needed — [Open GitHub]"
//   - error           : "Update failed — [Open GitHub] [Dismiss]"
//   - up-to-date / checking / idle / disabled : banner hidden
//
// Important: renderBanner clears the banner's innerHTML on every call. If
// a code path doesn't append new content AND show(), it MUST call hide()
// explicitly — otherwise the banner stays visible as an empty thin strip.

import { h } from './components.js';

let bannerEl = null;
let dismissedVersion = null;     // user clicked "Later" for this version
let lastStatus = { kind: 'idle' };
let manualCheckPending = false;

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

function openReleasePage(url) {
  const target = url || 'https://github.com/0mattsmith/DigitalFSTest/releases';
  try { window.dfsq && window.dfsq.openUrl && window.dfsq.openUrl(target); }
  catch (e) { console.warn('openUrl failed:', e); }
}

function buildCloseButton(status) {
  return h('button', { class: 'ub-close', title: 'Dismiss', onClick: () => {
    if (status.kind === 'available' || status.kind === 'downloaded' || status.kind === 'portable-update') {
      dismissedVersion = status.version || 'dismissed';
    }
    hide();
  } }, '×');
}

function renderBanner(status) {
  const b = ensureBanner();
  b.innerHTML = '';
  // Reset any colour modifiers from previous states so the banner doesn't
  // inherit the wrong tint.
  b.classList.remove('ub-progress', 'ub-done', 'ub-error', 'ub-info');

  const closeX = buildCloseButton(status);

  switch (status.kind) {
    case 'available': {
      if (dismissedVersion === status.version) { hide(); return; }
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

    case 'downloading': {
      b.classList.add('ub-progress');
      const pct = Math.max(0, Math.min(100, status.percent || 0));
      b.appendChild(h('div', { class: 'ub-row' },
        h('div', { class: 'ub-icon' }, '↓'),
        h('div', { class: 'ub-text' },
          h('div', { class: 'ub-title' }, 'Downloading update…'),
          h('div', { class: 'ub-sub' }, pct + '% complete'))));
      const bar = h('div', { class: 'ub-bar' });
      bar.appendChild(h('div', { class: 'ub-bar-fill', style: { width: pct + '%' } }));
      b.appendChild(bar);
      b.appendChild(closeX);
      show();
      return;
    }

    case 'downloaded': {
      const dismissKey = (status.version || '?') + '-installed';
      if (dismissedVersion === dismissKey) { hide(); return; }
      b.classList.add('ub-done');
      b.appendChild(h('div', { class: 'ub-row' },
        h('div', { class: 'ub-icon' }, '✓'),
        h('div', { class: 'ub-text' },
          h('div', { class: 'ub-title' }, 'Update ready'),
          h('div', { class: 'ub-sub' }, 'Restart to install version ' + (status.version || 'the new release') + '.'))));
      b.appendChild(h('div', { class: 'ub-actions' },
        h('button', { class: 'ub-btn ub-btn-primary', onClick: () => window.dfsq.updates.installAndRestart() }, 'Restart now'),
        h('button', { class: 'ub-btn', onClick: () => { dismissedVersion = dismissKey; hide(); } }, 'Later')));
      b.appendChild(closeX);
      show();
      return;
    }

    case 'portable-update': {
      // Portable build can't replace itself while running — direct the
      // student to the release page so they can grab the new portable .exe.
      if (dismissedVersion === status.version) { hide(); return; }
      b.classList.add('ub-info');
      b.appendChild(h('div', { class: 'ub-row' },
        h('div', { class: 'ub-icon' }, 'i'),
        h('div', { class: 'ub-text' },
          h('div', { class: 'ub-title' }, 'Update available'),
          h('div', { class: 'ub-sub' },
            (status.version ? 'Version ' + status.version + ' is on GitHub. ' : '') +
            'The portable build can\'t install itself — download the new portable .exe from GitHub.'))));
      b.appendChild(h('div', { class: 'ub-actions' },
        h('button', { class: 'ub-btn ub-btn-primary', onClick: () => openReleasePage(status.url) }, 'Open GitHub'),
        h('button', { class: 'ub-btn', onClick: () => { dismissedVersion = status.version; hide(); } }, 'Later')));
      b.appendChild(closeX);
      show();
      return;
    }

    case 'error': {
      // If this fires during the silent startup check (no manual check
      // pending), stay quiet — it's almost always "no network".
      if (!manualCheckPending && lastStatus.kind !== 'downloading') {
        hide();
        return;
      }
      manualCheckPending = false;
      b.classList.add('ub-error');
      b.appendChild(h('div', { class: 'ub-row' },
        h('div', { class: 'ub-icon' }, '!'),
        h('div', { class: 'ub-text' },
          h('div', { class: 'ub-title' }, 'Update failed'),
          h('div', { class: 'ub-sub' }, status.message || 'Something went wrong updating the app.'))));
      b.appendChild(h('div', { class: 'ub-actions' },
        h('button', { class: 'ub-btn ub-btn-primary', onClick: () => openReleasePage(status.url) }, 'Open GitHub'),
        h('button', { class: 'ub-btn', onClick: () => hide() }, 'Dismiss')));
      b.appendChild(closeX);
      show();
      return;
    }

    case 'up-to-date': {
      if (manualCheckPending) {
        manualCheckPending = false;
        flashToast('You\'re on the latest version (' + (status.currentVersion || '?') + ').');
      }
      hide();
      return;
    }

    case 'checking':
    case 'idle':
    case 'disabled':
    default: {
      hide();
      return;
    }
  }
}

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
