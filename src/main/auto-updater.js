// Auto-updater wired to electron-updater's GitHub provider.
//
// On launch the app silently checks GitHub Releases for a newer build than
// the one currently running. If one exists, the renderer is notified and
// shows a small banner with "Download" and "Later" actions. The user is
// always in control — nothing downloads or installs without their consent.
//
// All updater events are forwarded to the renderer as `app:update` IPC
// messages with the shape { kind, ... } so the UI can react to them
// without needing to import anything from the main process.
//
// This module exports a single setup() function that wires everything up
// against a BrowserWindow. Call it once, after the main window is loaded.

const { app, ipcMain } = require('electron');

let mainWindow = null;
let updaterReady = false;
let latestStatus = { kind: 'idle' };

function send(kind, payload = {}) {
  latestStatus = { kind, ...payload };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:update', latestStatus);
  }
}

function loadUpdater() {
  try {
    const mod = require('electron-updater');
    return mod && mod.autoUpdater ? mod.autoUpdater : null;
  } catch (err) {
    console.warn('electron-updater not available:', err.message);
    return null;
  }
}

function setup(win) {
  mainWindow = win;
  const autoUpdater = loadUpdater();
  if (!autoUpdater) {
    send('disabled', { reason: 'electron-updater module not installed' });
    return;
  }

  // Don't auto-download or auto-install — keep the student in control.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Useful logs while we're debugging — they go to the user data folder
  // alongside attempts so we can grab them if anything misbehaves.
  autoUpdater.logger = {
    info:  (m) => console.log('[updater]', m),
    warn:  (m) => console.warn('[updater]', m),
    error: (m) => console.error('[updater]', m),
    debug: (m) => process.env.DFSQ_UPDATER_DEBUG && console.log('[updater debug]', m),
  };

  autoUpdater.on('checking-for-update',  () => send('checking'));
  autoUpdater.on('update-not-available', (info) => send('up-to-date', { currentVersion: app.getVersion(), latestVersion: info?.version }));
  autoUpdater.on('update-available',     (info) => send('available', { version: info.version, releaseNotes: info.releaseNotes }));
  autoUpdater.on('download-progress',    (p) => send('downloading', { percent: Math.round(p.percent), bytesPerSecond: p.bytesPerSecond, transferred: p.transferred, total: p.total }));
  autoUpdater.on('update-downloaded',    (info) => send('downloaded', { version: info.version }));
  autoUpdater.on('error',                (err) => send('error', { message: (err && err.message) || String(err) }));

  // --- IPC ---------------------------------------------------------------
  ipcMain.handle('updates:check', async () => {
    try {
      const r = await autoUpdater.checkForUpdates();
      return { ok: true, info: r && r.updateInfo };
    } catch (err) {
      send('error', { message: err.message });
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('updates:download', async () => {
    try {
      const r = await autoUpdater.downloadUpdate();
      return { ok: true, paths: r };
    } catch (err) {
      send('error', { message: err.message });
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('updates:installAndRestart', async () => {
    // quitAndInstall: closes the app and runs the new installer immediately.
    // On Windows this swaps the installed binary then relaunches the app.
    // On macOS the same — replaces the .app bundle and relaunches.
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });

  ipcMain.handle('updates:status', () => latestStatus);

  ipcMain.handle('updates:version', () => ({
    version: app.getVersion(),
    name: app.getName(),
  }));

  updaterReady = true;

  // Kick off a silent check shortly after the window appears so the first
  // paint isn't blocked by network IO.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      send('error', { message: err.message });
    });
  }, 4000);
}

function isReady() { return updaterReady; }

module.exports = { setup, isReady };
