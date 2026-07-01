const { app, BrowserWindow, ipcMain, dialog, shell, Notification, clipboard } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const { createBackup, previewBackup, togglePause, cancelBackup } = require('./src/backup');
const configManager = require('./src/config');
const { EXCLUSION_PRESETS } = require('./src/constants');
const { formatBytes } = require('./src/utils/formatUtils');
const {
  BackupCancelledError,
  DirectoryNotFoundError,
  PermissionDeniedError,
  InvalidConfigError
} = require('./src/errors/BackupError');

let mainWindow = null;
let scheduleTimer = null;
let scheduledBackupRunning = false;
let manualBackupRunning = false;

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

const getConfigPathValue = async (explicitValue, getter) => {
  if (explicitValue) {
    return explicitValue;
  }

  return getter();
};

const getDestinationWarning = (destDir) => {
  if (!destDir) {
    return null;
  }

  const normalized = destDir.toLowerCase();
  if (
    normalized.includes('icloud') ||
    normalized.includes('googledrive') ||
    normalized.includes('google drive') ||
    normalized.includes('dropbox') ||
    normalized.includes('onedrive')
  ) {
    return 'O destino parece estar em uma pasta sincronizada na nuvem. Aguarde a sincronização terminar antes de remover backups antigos.';
  }

  return null;
};

const getRunKey = (date, frequency) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  if (frequency === 'weekly') {
    const firstDay = new Date(year, 0, 1);
    const pastDays = Math.floor((date - firstDay) / 86400000);
    const week = String(Math.ceil((pastDays + firstDay.getDay() + 1) / 7)).padStart(2, '0');
    return `${year}-W${week}`;
  }

  return `${year}-${month}-${day}`;
};

const isScheduleDue = (schedule, date = new Date()) => {
  if (!schedule.enabled) {
    return false;
  }

  const [hour, minute] = schedule.time.split(':').map(Number);
  const scheduledMinutes = hour * 60 + minute;
  const currentMinutes = date.getHours() * 60 + date.getMinutes();

  if (currentMinutes < scheduledMinutes) {
    return false;
  }

  if (schedule.frequency === 'weekly' && date.getDay() !== Number(schedule.weekday)) {
    return false;
  }

  return schedule.lastRunKey !== getRunKey(date, schedule.frequency);
};

const addHistoryForBackup = async ({ backupPath, sourceDir, destDir, startedAt, trigger, profile }) => {
  let sizeText = 'N/A';
  try {
    const stats = await fs.stat(backupPath);
    sizeText = formatBytes(stats.size);
  } catch (err) {
    console.error('Erro ao obter tamanho do backup:', err);
  }

  const historyEntry = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    sourceDir,
    destDir,
    size: sizeText,
    durationMs: Date.now() - startedAt,
    path: backupPath,
    success: true,
    trigger,
    profileId: profile?.id || null,
    profileName: profile?.name || null
  };
  await configManager.addHistoryEntry(historyEntry);
  return historyEntry;
};

const notify = (title, body) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
};

const runScheduledBackup = async () => {
  if (scheduledBackupRunning || manualBackupRunning) {
    return;
  }

  const schedule = await configManager.getSchedule();
  if (!isScheduleDue(schedule)) {
    return;
  }

  const profiles = await configManager.getProfiles();
  const profile =
    profiles.find((item) => item.id === schedule.profileId) ||
    (await configManager.getActiveProfile());

  if (!profile?.sourceDir || !profile?.destDir) {
    await configManager.setScheduleLastRunKey(getRunKey(new Date(), schedule.frequency));
    notify('Backup agendado não executado', 'Configure origem e destino para o perfil agendado.');
    return;
  }

  scheduledBackupRunning = true;
  const startedAt = Date.now();

  try {
    const backupPath = await createBackup(
      (message) => {
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('backup-progress', normalizeProgressMessage(message));
        }
      },
      profile.sourceDir,
      profile.destDir,
      profile.includeXampp
    );
    await addHistoryForBackup({
      backupPath,
      sourceDir: profile.sourceDir,
      destDir: profile.destDir,
      startedAt,
      trigger: 'scheduled',
      profile
    });
    await configManager.setScheduleLastRunKey(getRunKey(new Date(), schedule.frequency));
    notify('Backup agendado concluído', `${profile.name}: ${path.basename(backupPath)}`);
  } catch (error) {
    notify('Falha no backup agendado', getErrorMessage(error));
  } finally {
    scheduledBackupRunning = false;
  }
};

const startScheduleTimer = () => {
  if (scheduleTimer) {
    clearInterval(scheduleTimer);
  }
  scheduleTimer = setInterval(() => {
    runScheduledBackup().catch((error) => {
      console.error('Erro no agendamento de backup:', error);
    });
  }, 60000);
  runScheduledBackup().catch((error) => {
    console.error('Erro no agendamento de backup:', error);
  });
};

app.whenReady().then(() => {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    app.setAppUserModelId('com.thiago.backupdeveloper');
  }
  createWindow();
  startScheduleTimer();

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
      manualBackupRunning = true;
      const startedAt = Date.now();
      sendProgress({ type: 'status', text: 'Iniciando backup...' });
      const backupPath = await createBackup(sendProgress, sourceDir, destDir, includeXampp);
      sendProgress({ type: 'status', text: 'Backup finalizado com sucesso!' });

      const activeProfile = await configManager.getActiveProfile();
      const finalSourceDir = await getConfigPathValue(sourceDir, () => configManager.getSourceDir());
      const finalDestDir = await getConfigPathValue(destDir, () => configManager.getDestDir());
      await addHistoryForBackup({
        backupPath,
        sourceDir: finalSourceDir,
        destDir: finalDestDir,
        startedAt,
        trigger: 'manual',
        profile: activeProfile
      });

      notify('✓ Backup Concluído', `O arquivo foi salvo com sucesso em: ${path.basename(backupPath)}`);

      return { success: true, path: backupPath };
    } catch (error) {
      const message = getErrorMessage(error);
      sendProgress({ type: 'status', text: `Falha no backup: ${message}` });
      dialog.showErrorBox('Erro no Backup', message);

      notify('❌ Falha no Backup', message);

      return { success: false, error: message };
    } finally {
      manualBackupRunning = false;
    }
  }
);

ipcMain.handle(
  'preview-backup',
  async (event, sourceDir = null, destDir = null, includeXampp = false) => {
    const sendProgress = (payload) => {
      const message = normalizeProgressMessage(payload);
      event.sender.send('backup-progress', message);
    };

    try {
      const summary = await previewBackup(sendProgress, sourceDir, destDir, includeXampp);
      const history = await configManager.getHistory();
      summary.destinationWarning = getDestinationWarning(summary.destDir);
      summary.recentSimilarBackups = history
        .filter((item) => item.sourceDir === summary.sourceDir && item.destDir === summary.destDir)
        .slice(0, 3);
      return { success: true, summary };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
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
    includeXampp: Boolean(config.includeXampp),
    profiles: config.profiles || [],
    activeProfileId: config.activeProfileId || null,
    schedule: config.schedule,
    theme: config.theme || 'auto',
    compressionLevel: config.compressionLevel !== undefined ? config.compressionLevel : 1
  };
});

ipcMain.handle('get-exclusion-presets', async () => {
  return EXCLUSION_PRESETS;
});

ipcMain.handle('save-profile', async (event, profile) => {
  try {
    const savedProfile = await configManager.saveProfile(profile);
    return { success: true, profile: savedProfile };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-active-profile', async (event, profileId) => {
  try {
    await configManager.setActiveProfile(profileId);
    const config = await configManager.load();
    return { success: true, config };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-profile', async (event, profileId) => {
  try {
    await configManager.deleteProfile(profileId);
    const config = await configManager.load();
    return { success: true, config };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-include-xampp', async (event, includeXampp) => {
  try {
    await configManager.setIncludeXampp(includeXampp);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-schedule', async (event, schedule) => {
  try {
    const savedSchedule = await configManager.setSchedule(schedule);
    startScheduleTimer();
    return { success: true, schedule: savedSchedule };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Handler para definir o nível de compressão
 */
ipcMain.handle('set-compression-level', async (event, level) => {
  try {
    await configManager.setCompressionLevel(Number(level));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
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

ipcMain.handle('export-backup-report', async (event, report) => {
  try {
    const result = await dialog.showSaveDialog({
      title: 'Exportar relatório de backup',
      defaultPath: `backup-report-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (result.canceled || !result.filePath) {
      return { cancelled: true };
    }

    await fs.writeJson(result.filePath, report, { spaces: 2 });
    return { success: true, path: result.filePath };
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
 * Handler para abrir arquivo de backup
 */
ipcMain.handle('open-backup-file', async (event, itemPath) => {
  try {
    const fs = require('fs-extra');
    if (!(await fs.pathExists(itemPath))) {
      return { success: false, error: 'Arquivo não encontrado' };
    }

    const errorMessage = await shell.openPath(itemPath);
    if (errorMessage) {
      return { success: false, error: errorMessage };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * Handler para copiar texto para a área de transferência
 */
ipcMain.handle('copy-text', async (event, text) => {
  try {
    clipboard.writeText(String(text || ''));
    return { success: true };
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
