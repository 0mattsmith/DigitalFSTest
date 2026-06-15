// Preload script: exposes a safe API to the renderer via contextBridge.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dfsq', {
  // Sync values for the renderer to use without a round-trip.
  platform: process.platform,   // 'darwin' | 'win32' | 'linux'

  loadBank: (level) => ipcRenderer.invoke('banks:load', level),
  loadScenarios: (level) => ipcRenderer.invoke('scenarios:load', level),
  listHistory: () => ipcRenderer.invoke('history:list'),
  saveHistory: (attempt) => ipcRenderer.invoke('history:save', attempt),
  saveAttemptFile: (payload) => ipcRenderer.invoke('attempt:saveFile', payload),
  listAttemptFiles: (attemptId) => ipcRenderer.invoke('attempt:listFiles', attemptId),
  openAttemptFolder: (attemptId) => ipcRenderer.invoke('attempt:openFolder', attemptId),
  openExternalFile: (fullPath) => ipcRenderer.invoke('shell:openExternalFile', fullPath),
  openUrl: (url) => ipcRenderer.invoke('shell:openUrl', url),
  exportToDownloads: (payload) => ipcRenderer.invoke('shell:exportToDownloads', payload),
  captureWindow: (opts) => ipcRenderer.invoke('screenshot:captureWindow', opts || {}),
  meta: () => ipcRenderer.invoke('app:meta'),
  window: {
    minimize:        () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize:  () => ipcRenderer.invoke('window:toggleMaximize'),
    close:           () => ipcRenderer.invoke('window:close'),
    isMaximized:     () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizedChanged: (handler) => {
      // Subscribe to the main process telling us when max state changes.
      ipcRenderer.on('window:maximizedChanged', (_e, value) => handler(value));
    },
  },
  updates: {
    check:             () => ipcRenderer.invoke('updates:check'),
    download:          () => ipcRenderer.invoke('updates:download'),
    installAndRestart: () => ipcRenderer.invoke('updates:installAndRestart'),
    status:            () => ipcRenderer.invoke('updates:status'),
    version:           () => ipcRenderer.invoke('updates:version'),
    onEvent: (handler) => {
      ipcRenderer.on('app:update', (_e, payload) => handler(payload));
    },
  },
});
