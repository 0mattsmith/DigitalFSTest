// app.js — top-level router and shared state for the renderer.
// Keeps everything in one window: home → section A → section B → results.

import { showHome } from './screens/home.js';
import { showSectionA } from './screens/section-a.js';
import { showSectionB } from './screens/section-b.js';
import { showResults } from './screens/results.js';
import { showHistory } from './screens/history.js';
import { showWorkOn } from './screens/work-on.js';
import { captureWindow, showScreenshotModal, findCurrentScreenshotTask } from './screens/screenshot-tool.js';
import { applyA11yToDocument } from './screens/accessibility.js';
import { startUpdateListener } from './screens/update-banner.js';
import { canInstall, isStandalone, triggerInstall, manualInstallHint } from './screens/install-prompt.js';

// Shared session state. Each test has its own state object that the
// individual screens read from and write into. Routes own their UI; this
// module only orchestrates which one is on screen and provides a place to
// hand state between them.
const state = {
  test: null,          // { id, seed, level, candidate, startedAt }
  bank: null,          // loaded MCQ pool for the level
  scenarios: null,     // loaded scenario pool
  attempt: null,       // current attempt record
};

const routes = {
  home: () => showHome(api, state),
  history: () => showHistory(api, state),
  workOn: () => showWorkOn(api, state),
  sectionA: () => showSectionA(api, state),
  sectionB: () => showSectionB(api, state),
  results: () => showResults(api, state),
};

const screenEl = document.getElementById('screen');
const footerbar = document.getElementById('footerbar');

const api = {
  go(routeName) {
    screenEl.innerHTML = '';
    setFooterMode('hidden');
    routes[routeName]();
  },
  state,
  bridge: window.dfsq,
  setFooter(opts) { setFooterMode(opts); },
};

// Footer controller. Each route opts in to the bits it wants visible.
function setFooterMode(opts) {
  if (opts === 'hidden') {
    footerbar.classList.add('hide');
    return;
  }
  footerbar.classList.remove('hide');
  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');
  const marksBtn = document.getElementById('btn-marks');
  const saveBtn = document.getElementById('btn-save');
  const counter = document.getElementById('page-counter');
  const timerEl = document.getElementById('timer');

  prevBtn.onclick = opts.onPrev || null;
  nextBtn.onclick = opts.onNext || null;
  marksBtn.onclick = opts.onMarks || null;
  saveBtn.onclick = opts.onSave || null;

  prevBtn.disabled = !!opts.disablePrev;
  nextBtn.disabled = !!opts.disableNext;
  marksBtn.disabled = !!opts.disableMarks;

  // Make Next look "highlighted" when it's the path forward
  if (opts.highlightNext) nextBtn.classList.add('is-active');
  else nextBtn.classList.remove('is-active');

  counter.textContent = opts.counter || '';
  if (opts.timerText !== undefined) {
    document.getElementById('timer-text').textContent = opts.timerText;
    timerEl.style.visibility = opts.showTimer === false ? 'hidden' : 'visible';
  } else {
    timerEl.style.visibility = 'hidden';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // Apply any saved accessibility settings before painting the first screen.
  applyA11yToDocument();

  // Mark the body with the running platform so CSS can show only the
  // matching set of title bar controls (dots for macOS, min/max/close
  // squares for Windows + Linux).
  applyPlatformClass();

  // Start listening for auto-update events from the main process so the
  // banner can pop up if a new version is available.
  startUpdateListener();

  // Wire the fake title bar's window controls. The OS title bar is hidden
  // (frame:false in main.js) so these have to actually drive the window.
  wireTitleBarControls();

  // Wire the global screenshot button + keyboard shortcut.
  const ssBtn = document.getElementById('tb-screenshot');
  if (ssBtn) ssBtn.addEventListener('click', triggerScreenshot);
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && k === 's') {
      e.preventDefault();
      triggerScreenshot();
    }
  });

  // Wire the title-bar Install button (web build only). Visible only when:
  //  - we're running in a browser (not the Electron build),
  //  - the app isn't already installed and running standalone,
  //  - the browser has fired beforeinstallprompt (i.e. the OS will accept
  //    an immediate install dialog).
  wireInstallButton();

  api.go('home');
});

function wireInstallButton() {
  const btn = document.getElementById('tb-install');
  if (!btn) return;
  const isWeb = window.dfsq && window.dfsq.platform === 'web';

  // In the Electron build the OS already has its own copy installed, so
  // hide the install button permanently. For the web build, the button
  // is ALWAYS visible (unless the user is already running standalone),
  // so they have a discoverable install entry point even in browsers
  // like Brave where the native beforeinstallprompt is suppressed.
  if (!isWeb || isStandalone()) {
    btn.classList.add('hide');
    return;
  }
  btn.classList.remove('hide');

  // Hide once the user actually installs.
  window.addEventListener('dfsq:install-done', () => btn.classList.add('hide'));

  btn.addEventListener('click', async () => {
    const outcome = await triggerInstall();
    if (outcome === 'accepted') {
      btn.classList.add('hide');
      return;
    }
    if (outcome === 'not-available') {
      // The browser hasn't fired beforeinstallprompt — show manual
      // per-browser instructions in a small popover anchored to the button.
      showInstallPopover();
    }
    // 'dismissed' is the user clicking Cancel on the native dialog — leave
    // the button so they can try again.
  });
}

function showInstallPopover() {
  const existing = document.getElementById('install-popover');
  if (existing) { existing.remove(); return; }
  const pop = document.createElement('div');
  pop.id = 'install-popover';
  pop.className = 'install-popover';
  pop.innerHTML =
    '<button class="install-popover-close" aria-label="Close">×</button>' +
    '<h4>How to install on your browser</h4>' +
    '<p>' + manualInstallHint() + '</p>' +
    '<p style="opacity:0.75;font-size:11px;margin-top:8px">' +
    'Once installed, the app launches in its own window and works offline.' +
    '</p>';
  document.body.appendChild(pop);
  pop.querySelector('.install-popover-close').addEventListener('click', () => pop.remove());
  // Auto-dismiss after 20 seconds in case the user just walks away.
  setTimeout(() => { if (pop.isConnected) pop.remove(); }, 20000);
  // Click outside closes
  setTimeout(() => {
    document.addEventListener('click', function onOutside(e) {
      if (!pop.contains(e.target) && e.target.id !== 'tb-install') {
        pop.remove();
        document.removeEventListener('click', onOutside);
      }
    });
  }, 0);
}

function applyPlatformClass() {
  const p = (window.dfsq && window.dfsq.platform) || 'unknown';
  const body = document.body;
  body.classList.remove('is-mac', 'is-windows', 'is-linux', 'is-web');
  if (p === 'darwin')       body.classList.add('is-mac');
  else if (p === 'win32')   body.classList.add('is-windows');
  else if (p === 'linux')   body.classList.add('is-linux');
  else if (p === 'web')     body.classList.add('is-web');
  else                      body.classList.add('is-windows'); // safe default
}

function wireTitleBarControls() {
  const winApi = (window.dfsq && window.dfsq.window) || null;
  if (!winApi) return;

  // ---- Windows / Linux square buttons --------------------------------
  const minBtn   = document.querySelector('.tb-min');
  const maxBtn   = document.querySelector('.tb-max');
  const closeBtn = document.querySelector('.tb-close');
  if (minBtn)   minBtn.addEventListener('click',   () => winApi.minimize());
  if (maxBtn)   maxBtn.addEventListener('click',   () => winApi.toggleMaximize());
  if (closeBtn) closeBtn.addEventListener('click', () => winApi.close());

  // ---- macOS traffic light dots ---------------------------------------
  const dotClose = document.getElementById('tb-dot-close');
  const dotMin   = document.getElementById('tb-dot-minimize');
  const dotMax   = document.getElementById('tb-dot-maximize');
  if (dotClose) dotClose.addEventListener('click', () => winApi.close());
  if (dotMin)   dotMin.addEventListener('click',   () => winApi.minimize());
  if (dotMax)   dotMax.addEventListener('click',   () => winApi.toggleMaximize());

  // ---- Double-click anywhere on the title bar toggles maximise --------
  // Match the OS-native title bar behaviour. We exclude clicks on the
  // controls themselves so they don't double-fire.
  const titleBar = document.getElementById('player-titlebar');
  if (titleBar) {
    titleBar.addEventListener('dblclick', (e) => {
      // Don't trigger when the user double-clicks a control button.
      const ignore = ['BUTTON', 'svg', 'path'];
      let t = e.target;
      while (t && t !== titleBar) {
        if (ignore.includes(t.tagName)) return;
        if (t.classList && (t.classList.contains('tb-ctl') || t.classList.contains('tb-dot') ||
                            t.classList.contains('tb-screenshot'))) return;
        t = t.parentElement;
      }
      winApi.toggleMaximize();
    });
  }

  // Update the Windows maximise glyph between "□" (will maximise) and
  // "❐" (will restore). Doesn't affect the macOS dots.
  function setMaximizedGlyph(isMax) {
    if (maxBtn) {
      maxBtn.innerHTML = isMax ? '&#10064;' : '&#9633;';
      maxBtn.title = isMax ? 'Restore' : 'Maximise';
    }
  }
  winApi.isMaximized().then(setMaximizedGlyph).catch(() => {});
  winApi.onMaximizedChanged(setMaximizedGlyph);
}

async function triggerScreenshot() {
  const snap = await captureWindow(state);
  if (!snap) return;
  const taskHook = findCurrentScreenshotTask(state);
  showScreenshotModal(snap, {
    taskLabel: taskHook ? taskHook.label : null,
    onSaveToTask: taskHook ? taskHook.attach : null,
  });
}

// Helpful when debugging on Mac via devtools
window.__dfsq = { state, api };
