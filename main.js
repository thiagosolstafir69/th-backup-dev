const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron');
const path = require('path');
const { createBackup, togglePause, cancelBackup } = require('./src/backup');
const configManager = require('./src/config');
const updater = require('./src/updater');
const {
  BackupCancelledError,
  DirectoryNotFoundError,
  PermissionDeniedError,
  InvalidConfigError
} = require('./src/errors/BackupError');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 960,
    minHeight: 720,
    resizable: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  return mainWindow;
}

/**
 * Envia mensagem de atualização para o renderer
 * @param {string} event - Nome do evento
 * @param {Object} data - Dados a serem enviados
 */
function sendUpdateMessage(event, data) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('update-message', { event, ...data });
  }
}

app.whenReady().then(() => {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    app.setAppUserModelId('com.thiago.backupdeveloper');
  }
  createWindow();

  // Verifica atualizações ao iniciar (com delay de 3 segundos)
  setTimeout(async () => {
    try {
      await updater.checkForUpdates((event, data) => {
        sendUpdateMessage(event, data);
      });
    } catch (error) {
      console.error('Erro ao verificar atualizações automáticas:', error);
    }
  }, 3000);

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

      // Adiciona a entrada ao histórico
      let sizeText = 'N/A';
      try {
        const fs = require('fs-extra');
        const stats = await fs.stat(backupPath);
        const { formatBytes } = require('./src/utils/formatUtils');
        sizeText = formatBytes(stats.size);
      } catch (err) {
        console.error('Erro ao obter tamanho do backup:', err);
      }

      const historyEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        sourceDir: sourceDir || (await configManager.getSourceDir()),
        destDir: destDir || (await configManager.getDestDir()),
        size: sizeText,
        path: backupPath,
        success: true
      };
      await configManager.addHistoryEntry(historyEntry);

      // Dispara notificação nativa
      if (Notification.isSupported()) {
        new Notification({
          title: '✓ Backup Concluído',
          body: `O arquivo foi salvo com sucesso em: ${path.basename(backupPath)}`
        }).show();
      }

      return { success: true, path: backupPath };
    } catch (error) {
      const message = getErrorMessage(error);
      sendProgress({ type: 'status', text: `Falha no backup: ${message}` });
      dialog.showErrorBox('Erro no Backup', message);

      // Dispara notificação nativa de erro
      if (Notification.isSupported()) {
        new Notification({
          title: '❌ Falha no Backup',
          body: message
        }).show();
      }

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
 * Handler para definir manualmente o diretório de origem (ex: via Drag & Drop)
 */
ipcMain.handle('set-source-dir', async (event, dirPath) => {
  try {
    const fs = require('fs-extra');
    const exists = await fs.pathExists(dirPath);
    if (!exists) {
      return { success: false, error: 'O diretório informado não existe.' };
    }
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      return { success: false, error: 'O caminho informado não é uma pasta.' };
    }
    await configManager.setSourceDir(dirPath);
    return { success: true, path: dirPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Handler para definir manualmente o diretório de destino (ex: via Drag & Drop)
 */
ipcMain.handle('set-dest-dir', async (event, dirPath) => {
  try {
    const fs = require('fs-extra');
    const exists = await fs.pathExists(dirPath);
    if (!exists) {
      return { success: false, error: 'O diretório informado não existe.' };
    }
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      return { success: false, error: 'O caminho informado não é uma pasta.' };
    }
    await configManager.setDestDir(dirPath);
    return { success: true, path: dirPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Handler para obter configuração atual
 */
ipcMain.handle('get-config', async () => {
  const config = await configManager.load();
  return {
    sourceDir: config.sourceDir,
    destDir: config.destDir,
    ignoredDirs: config.ignoredDirs ? Array.from(config.ignoredDirs) : [],
    theme: config.theme || 'auto'
  };
});

/**
 * Handler para definir diretórios ignorados
 */
ipcMain.handle('set-ignored-dirs', async (event, dirs) => {
  try {
    await configManager.setIgnoredDirs(dirs);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Handler para obter histórico de backups
 */
ipcMain.handle('get-backup-history', async () => {
  try {
    const history = await configManager.getHistory();
    return { success: true, history };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Handler para limpar histórico de backups
 */
ipcMain.handle('clear-backup-history', async () => {
  try {
    await configManager.clearHistory();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Handler para revelar arquivo no Finder
 */
ipcMain.handle('reveal-in-finder', async (event, itemPath) => {
  try {
    const fs = require('fs-extra');
    if (await fs.pathExists(itemPath)) {
      shell.showItemInFolder(itemPath);
      return { success: true };
    } else {
      return { success: false, error: 'Arquivo não encontrado' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Handler para definir preferência de tema
 */
ipcMain.handle('set-theme', async (event, theme) => {
  try {
    await configManager.setTheme(theme);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Handler para verificar atualizações manualmente
 */
ipcMain.handle('check-for-updates', async () => {
  try {
    const update = await updater.checkForUpdates((event, data) => {
      sendUpdateMessage(event, data);
    });
    return { success: true, update };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Handler para abrir página de download da atualização
 */
ipcMain.handle('install-update', async (event, downloadUrl) => {
  try {
    if (downloadUrl) {
      shell.openExternal(downloadUrl);
      return { success: true };
    }
    // Se não tiver URL, abre a página de releases
    shell.openExternal(`https://github.com/thiagosolstafir69/th-backup-dev/releases/latest`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
