// Electron main process for the DFSQ Practice app.
// Creates the application window and routes file IO requests from
// the renderer through a small IPC surface defined here and in preload.js.

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fssync = require('fs');
const os = require('os');
const autoUpdate = require('./auto-updater');

const APP_NAME = 'DFSQ Practice';

// User-writable data lives next to the app's userData folder so each OS user
// gets its own copy of attempts and exported files. Works on Mac & Windows.
function userDataRoot() {
  const root = path.join(app.getPath('userData'), 'dfsq-data');
  fssync.mkdirSync(root, { recursive: true });
  fssync.mkdirSync(path.join(root, 'attempts'), { recursive: true });
  return root;
}

function attemptsDir() { return path.join(userDataRoot(), 'attempts'); }
function historyFile() { return path.join(userDataRoot(), 'history.json'); }

// Banks live inside the app bundle (read-only at runtime).
function banksDir() {
  return path.join(app.getAppPath(), 'assets', 'banks');
}
function scenariosDir() {
  return path.join(app.getAppPath(), 'assets', 'scenarios');
}

async function readJson(file, fallback) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: APP_NAME,
    backgroundColor: '#2a2a2a',
    // No native OS title bar — the renderer draws its own "Test Player
    // Preview" style title bar to mimic the Pearson sample assessment look.
    // The fake title bar wires its dots and min/max/close buttons via IPC.
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Let the renderer know when the window's maximised state changes so the
  // maximise/restore icon can be kept in sync.
  win.on('maximize',   () => win.webContents.send('window:maximizedChanged', true));
  win.on('unmaximize', () => win.webContents.send('window:maximizedChanged', false));

  // Hook up the auto-updater once the window exists so events can be
  // forwarded to it. Failures are swallowed — the app still works without
  // updates enabled.
  try { autoUpdate.setup(win); } catch (err) { console.warn('auto-updater setup failed:', err); }

  if (process.env.DFSQ_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

// --- IPC -----------------------------------------------------------------

ipcMain.handle('banks:load', async (_evt, level) => {
  const file = path.join(banksDir(), `${level}.json`);
  return readJson(file, { mcqs: [] });
});

ipcMain.handle('scenarios:load', async (_evt, level) => {
  const file = path.join(scenariosDir(), `${level}.json`);
  return readJson(file, { scenarios: [] });
});

ipcMain.handle('history:list', async () => {
  return readJson(historyFile(), { attempts: [] });
});

ipcMain.handle('history:save', async (_evt, attempt) => {
  const hist = await readJson(historyFile(), { attempts: [] });
  hist.attempts.unshift(attempt);
  // Keep at most 200 entries to avoid unbounded growth.
  hist.attempts = hist.attempts.slice(0, 200);
  await writeJson(historyFile(), hist);
  return { ok: true };
});

ipcMain.handle('attempt:saveFile', async (_evt, payload) => {
  // payload: { attemptId, filename, content, encoding }
  const dir = path.join(attemptsDir(), payload.attemptId);
  await fs.mkdir(dir, { recursive: true });
  const out = path.join(dir, payload.filename);
  if (payload.encoding === 'base64') {
    await fs.writeFile(out, Buffer.from(payload.content, 'base64'));
  } else {
    await fs.writeFile(out, payload.content, 'utf8');
  }
  return { path: out };
});

ipcMain.handle('attempt:listFiles', async (_evt, attemptId) => {
  const dir = path.join(attemptsDir(), attemptId);
  try {
    const items = await fs.readdir(dir);
    return items.map(name => ({
      name,
      fullPath: path.join(dir, name),
    }));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
});

ipcMain.handle('attempt:openFolder', async (_evt, attemptId) => {
  const dir = path.join(attemptsDir(), attemptId);
  await fs.mkdir(dir, { recursive: true });
  await shell.openPath(dir);
  return { path: dir };
});

ipcMain.handle('shell:openExternalFile', async (_evt, fullPath) => {
  const result = await shell.openPath(fullPath);
  return { ok: result === '', error: result || undefined };
});

ipcMain.handle('shell:exportToDownloads', async (_evt, payload) => {
  // Lets a student export an edited document to a chosen location.
  const { defaultName, content, encoding } = payload;
  const win = BrowserWindow.getFocusedWindow();
  const res = await dialog.showSaveDialog(win, {
    title: 'Export file',
    defaultPath: path.join(app.getPath('downloads'), defaultName || 'export.bin'),
  });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };
  if (encoding === 'base64') {
    await fs.writeFile(res.filePath, Buffer.from(content, 'base64'));
  } else {
    await fs.writeFile(res.filePath, content, 'utf8');
  }
  return { ok: true, path: res.filePath };
});

// Window controls (driven by the fake title bar in the renderer).
ipcMain.handle('window:minimize', () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (win) win.minimize();
});
ipcMain.handle('window:toggleMaximize', () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!win) return false;
  if (win.isMaximized()) { win.unmaximize(); return false; }
  win.maximize(); return true;
});
ipcMain.handle('window:close', () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (win) win.close();
});
ipcMain.handle('window:isMaximized', () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  return win ? win.isMaximized() : false;
});

// Capture the current app window as a PNG. The renderer can request this
// for the built-in screenshot tool — no permission popups needed, the
// student just sees the window contents grab themselves.
ipcMain.handle('screenshot:captureWindow', async (_evt, opts = {}) => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!win) return { ok: false, error: 'No window to capture' };
  const img = await win.capturePage();
  const dataUrl = img.toDataURL();        // 'data:image/png;base64,...'
  const base64 = dataUrl.split(',')[1];

  // Optionally save into the attempt folder right away
  if (opts.attemptId && opts.filename) {
    const dir = path.join(attemptsDir(), opts.attemptId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, opts.filename), Buffer.from(base64, 'base64'));
  }
  return { ok: true, dataUrl, filename: opts.filename };
});

ipcMain.handle('app:meta', async () => ({
  appName: APP_NAME,
  appVersion: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  node: process.versions.node,
  electron: process.versions.electron,
  userData: userDataRoot(),
  home: os.homedir(),
}));

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
