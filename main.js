const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { createBackup, togglePause, cancelBackup } = require('./src/backup');
const configManager = require('./src/config');
const {
  BackupCancelledError,
  DirectoryNotFoundError,
  PermissionDeniedError,
  InvalidConfigError
} = require('./src/errors/BackupError');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 820,
    minHeight: 660,
    resizable: true,
    backgroundColor: '#f6f3ee',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  return mainWindow;
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

/**
 * Normaliza mensagem de progresso
 * @param {string|Object} payload - Payload do progresso
 * @returns {Object} Mensagem normalizada
 */
const normalizeProgressMessage = (payload) => {
  return typeof payload === 'string'
    ? { text: payload }
    : {
        text: '',
        type: 'status',
        ...payload
      };
};

/**
 * Trata erros e retorna mensagem amigável ao usuário
 * @param {Error} error - Erro ocorrido
 * @returns {string} Mensagem de erro amigável
 */
const getErrorMessage = (error) => {
  if (error instanceof BackupCancelledError) {
    return 'Backup cancelado pelo usuário.';
  }
  if (error instanceof DirectoryNotFoundError) {
    return `Diretório não encontrado: ${error.path}`;
  }
  if (error instanceof PermissionDeniedError) {
    return `Permissão negada para acessar: ${error.path}`;
  }
  if (error instanceof InvalidConfigError) {
    return `Configuração inválida: ${error.message}`;
  }
  return error.message || 'Ocorreu um erro inesperado durante o backup.';
};

ipcMain.handle(
  'start-backup',
  async (event, sourceDir = null, destDir = null, includeXampp = false) => {
    const sendProgress = (payload) => {
      const message = normalizeProgressMessage(payload);
      event.sender.send('backup-progress', message);
    };

    try {
      sendProgress({ type: 'status', text: 'Iniciando backup...' });
      const backupPath = await createBackup(sendProgress, sourceDir, destDir, includeXampp);
      sendProgress({ type: 'status', text: 'Backup finalizado com sucesso!' });
      return { success: true, path: backupPath };
    } catch (error) {
      const message = getErrorMessage(error);
      sendProgress({ type: 'status', text: `Falha no backup: ${message}` });
      dialog.showErrorBox('Erro no Backup', message);
      return { success: false, error: message };
    }
  }
);

ipcMain.handle('toggle-pause', async () => {
  const isPaused = togglePause();
  return { isPaused };
});

ipcMain.handle('cancel-backup', async () => {
  cancelBackup();
  return { cancelled: true };
});

/**
 * Handler para selecionar diretório de origem
 */
ipcMain.handle('select-source-dir', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Selecione a pasta de origem para backup'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { cancelled: true };
  }

  const selectedPath = result.filePaths[0];
  await configManager.setSourceDir(selectedPath);
  return { success: true, path: selectedPath };
});

/**
 * Handler para selecionar diretório de destino
 */
ipcMain.handle('select-dest-dir', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Selecione a pasta de destino para salvar o backup'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { cancelled: true };
  }

  const selectedPath = result.filePaths[0];
  await configManager.setDestDir(selectedPath);
  return { success: true, path: selectedPath };
});

/**
 * Handler para obter configuração atual
 */
ipcMain.handle('get-config', async () => {
  const config = await configManager.load();
  return {
    sourceDir: config.sourceDir,
    destDir: config.destDir,
    ignoredDirs: config.ignoredDirs
  };
});
