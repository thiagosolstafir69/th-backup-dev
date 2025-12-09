const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
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
    width: 700,
    height: 670,
    resizable: false,
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

/**
 * Configura e inicia verificação de atualizações
 */
function setupAutoUpdater() {
  const checkUpdates = async () => {
    try {
      await updater.checkForUpdates((event, data) => {
        sendUpdateMessage(event, data);

        if (event === 'update-available' && data.downloadUrl) {
          // Quando há atualização disponível, mostra diálogo
          dialog
            .showMessageBox(mainWindow, {
              type: 'info',
              title: 'Atualização disponível',
              message: `Uma nova versão está disponível: ${data.version}`,
              detail: 'Deseja baixar e instalar agora?',
              buttons: ['Baixar agora', 'Depois'],
              defaultId: 0,
              cancelId: 1
            })
            .then((result) => {
              if (result.response === 0 && data.downloadUrl) {
                // Abre o link de download no navegador
                shell.openExternal(data.downloadUrl);
              }
            });
        }
      });
    } catch (error) {
      // Erro silencioso - não interrompe o funcionamento do app
      console.error('Erro ao verificar atualizações:', error);
    }
  };

  // Verifica atualizações ao iniciar (com delay de 3 segundos)
  setTimeout(() => {
    checkUpdates();
  }, 3000);

  // Verifica atualizações a cada 4 horas
  setInterval(
    () => {
      checkUpdates();
    },
    4 * 60 * 60 * 1000
  ); // 4 horas
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();

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
