const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('backup', {
  start: (sourceDir, destDir, includeXampp) =>
    ipcRenderer.invoke('start-backup', sourceDir, destDir, includeXampp),
  togglePause: () => ipcRenderer.invoke('toggle-pause'),
  cancel: () => ipcRenderer.invoke('cancel-backup'),
  selectSourceDir: () => ipcRenderer.invoke('select-source-dir'),
  selectDestDir: () => ipcRenderer.invoke('select-dest-dir'),
  setSourceDir: (path) => ipcRenderer.invoke('set-source-dir', path),
  setDestDir: (path) => ipcRenderer.invoke('set-dest-dir', path),
  getConfig: () => ipcRenderer.invoke('get-config'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: (downloadUrl) => ipcRenderer.invoke('install-update', downloadUrl),
  setIgnoredDirs: (dirs) => ipcRenderer.invoke('set-ignored-dirs', dirs),
  getBackupHistory: () => ipcRenderer.invoke('get-backup-history'),
  clearBackupHistory: () => ipcRenderer.invoke('clear-backup-history'),
  revealInFinder: (path) => ipcRenderer.invoke('reveal-in-finder', path),
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  onProgress: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const channel = 'backup-progress';
    const handler = (_event, message) => {
      callback(message);
    };

    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  }
});
