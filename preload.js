const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('backup', {
  start: () => ipcRenderer.invoke('start-backup'),
  togglePause: () => ipcRenderer.invoke('toggle-pause'),
  cancel: () => ipcRenderer.invoke('cancel-backup'),
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
