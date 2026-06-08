// Built-in screenshot tool. Two entry points:
//
//   captureToCurrentTask(state, api)
//      Captures the current app window, saves it to the attempt folder,
//      adds it to the active screenshot task (if there is one), and shows
//      a confirmation modal.
//
//   captureAndShow(state, api, { onSaveToTask })
//      Captures, saves to attempt folder, shows a preview modal with the
//      image plus a "Use for current task" / "Download" / "Close" choice.
//
// The capture uses Electron's BrowserWindow.capturePage() via the
// `dfsq.captureWindow` preload bridge — no permission popups, no extra
// dependencies, and works identically on macOS and Windows.

import { h } from './components.js';

let busy = false;

export async function captureWindow(state, opts = {}) {
  if (busy) return null;
  busy = true;
  // Briefly hide the screenshot button itself so it doesn't appear in the
  // capture. Without this the student would always see the button in the
  // corner of every screenshot they take.
  const btn = document.getElementById('tb-screenshot');
  const prevVis = btn ? btn.style.visibility : '';
  if (btn) btn.style.visibility = 'hidden';
  // Force a paint, then capture
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    const filename = opts.filename ||
      `screenshot_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    const res = await window.dfsq.captureWindow({
      attemptId: state.attempt ? state.attempt.id : null,
      filename,
    });
    if (!res.ok) {
      console.error('Screenshot capture failed:', res.error);
      return null;
    }
    return { dataUrl: res.dataUrl, filename };
  } finally {
    if (btn) btn.style.visibility = prevVis;
    busy = false;
  }
}

// Show a modal with the captured screenshot + actions.
export function showScreenshotModal(snapshot, { onSaveToTask, taskLabel } = {}) {
  // Remove any pre-existing modal
  const existing = document.getElementById('screenshot-modal');
  if (existing) existing.remove();

  const modal = h('div', { id: 'screenshot-modal', class: 'ss-modal-backdrop',
    onClick: (e) => { if (e.target.id === 'screenshot-modal') close(); } });
  const card = h('div', { class: 'ss-modal' });

  card.appendChild(h('div', { class: 'ss-modal-head' },
    h('strong', {}, 'Screenshot captured'),
    h('button', { class: 'btn-mini', onClick: () => close() }, 'Close ✕')));

  card.appendChild(h('img', {
    src: snapshot.dataUrl,
    alt: 'Screenshot preview',
    class: 'ss-modal-img',
  }));

  card.appendChild(h('div', { class: 'ss-modal-meta' },
    h('span', { class: 'muted' }, snapshot.filename, ' · saved to your attempt folder')));

  const actions = h('div', { class: 'ss-modal-actions' });
  if (onSaveToTask) {
    actions.appendChild(h('button', { class: 'orange-btn', onClick: () => {
      onSaveToTask(snapshot);
      close();
    } }, taskLabel ? 'Add to "' + taskLabel + '"' : 'Add to current task'));
  }
  actions.appendChild(h('button', { class: 'btn-mini', onClick: () => downloadAs(snapshot) },
    'Download a copy'));
  actions.appendChild(h('button', { class: 'btn-mini', onClick: () => close() }, 'Done'));
  card.appendChild(actions);

  modal.appendChild(card);
  document.body.appendChild(modal);

  function close() { modal.remove(); }
}

function downloadAs(snapshot) {
  const a = document.createElement('a');
  a.href = snapshot.dataUrl;
  a.download = snapshot.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Look at the current screen to see if there's an active screenshot task we
// can route this image into. Currently we rely on app state which gets set
// by section-b.js when it renders a screenshot task.
export function findCurrentScreenshotTask(state) {
  return state.__activeScreenshotTask || null;
}
