const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('backup', {
  start: (sourceDir, destDir, includeXampp) =>
    ipcRenderer.invoke('start-backup', sourceDir, destDir, includeXampp),
  preview: (sourceDir, destDir, includeXampp) =>
    ipcRenderer.invoke('preview-backup', sourceDir, destDir, includeXampp),
  togglePause: () => ipcRenderer.invoke('toggle-pause'),
  cancel: () => ipcRenderer.invoke('cancel-backup'),
  selectSourceDir: () => ipcRenderer.invoke('select-source-dir'),
  selectDestDir: () => ipcRenderer.invoke('select-dest-dir'),
  setSourceDir: (path) => ipcRenderer.invoke('set-source-dir', path),
  setDestDir: (path) => ipcRenderer.invoke('set-dest-dir', path),
  getConfig: () => ipcRenderer.invoke('get-config'),
  getExclusionPresets: () => ipcRenderer.invoke('get-exclusion-presets'),
  saveProfile: (profile) => ipcRenderer.invoke('save-profile', profile),
  setActiveProfile: (profileId) => ipcRenderer.invoke('set-active-profile', profileId),
  deleteProfile: (profileId) => ipcRenderer.invoke('delete-profile', profileId),
  setIncludeXampp: (includeXampp) => ipcRenderer.invoke('set-include-xampp', includeXampp),
  setSchedule: (schedule) => ipcRenderer.invoke('set-schedule', schedule),
  setIgnoredDirs: (dirs) => ipcRenderer.invoke('set-ignored-dirs', dirs),
  getBackupHistory: () => ipcRenderer.invoke('get-backup-history'),
  clearBackupHistory: () => ipcRenderer.invoke('clear-backup-history'),
  exportBackupReport: (report) => ipcRenderer.invoke('export-backup-report', report),
  revealInFinder: (path) => ipcRenderer.invoke('reveal-in-finder', path),
  openBackupFile: (path) => ipcRenderer.invoke('open-backup-file', path),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  setCompressionLevel: (level) => ipcRenderer.invoke('set-compression-level', level),
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
