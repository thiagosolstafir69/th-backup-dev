const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('backup', {
  start: (sourceDir, destDir) =>
    ipcRenderer.invoke('start-backup', sourceDir, destDir),
  togglePause: () => ipcRenderer.invoke('toggle-pause'),
  cancel: () => ipcRenderer.invoke('cancel-backup'),
  selectSourceDir: () => ipcRenderer.invoke('select-source-dir'),
  selectDestDir: () => ipcRenderer.invoke('select-dest-dir'),
  getConfig: () => ipcRenderer.invoke('get-config'),
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
