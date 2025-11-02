const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { createBackup } = require('./src/backup');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 700,
    height: 600,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('start-backup', async (event) => {
  const sendProgress = (payload) => {
    const message =
      typeof payload === 'string'
        ? { text: payload }
        : {
            text: '',
            type: 'status',
            ...payload
          };
    event.sender.send('backup-progress', message);
  };

  try {
    sendProgress({ type: 'status', text: 'Iniciando backup...' });
    const backupPath = await createBackup(sendProgress);
    sendProgress({ type: 'status', text: 'Backup finalizado com sucesso!' });
    return { success: true, path: backupPath };
  } catch (error) {
    const message = error.message || 'Ocorreu um erro inesperado.';
    sendProgress({ type: 'status', text: `Falha no backup: ${message}` });
    dialog.showErrorBox('Erro no Backup', message);
    return { success: false, error: message };
  }
});
