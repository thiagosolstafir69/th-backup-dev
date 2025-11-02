const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const archiver = require('archiver');

const fsp = fs.promises;
const SOURCE_DIR = '/Users/thiago/Developer';
const DEST_DIR =
  '/Users/thiago/Library/CloudStorage/GoogleDrive-thiagowip@gmail.com/Meu Drive/Backup-developer';

// Controle de pausa e cancelamento
let isPaused = false;
let isCancelled = false;
let pauseResolve = null;
let archiveInstance = null;

const pad = (value) => value.toString().padStart(2, '0');

const generateTimestamp = () => {
  const now = new Date();
  const day = pad(now.getDate());
  const month = pad(now.getMonth() + 1);
  const year = now.getFullYear();
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  return `${day}-${month}-${year}_${hours}-${minutes}-${seconds}`;
};

const formatBytes = (bytes) => {
  if (bytes === 0) {
    return '0 B';
  }

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
};

const checkPause = async (onProgress) => {
  while (isPaused && !isCancelled) {
    if (!pauseResolve) {
      onProgress({
        type: 'status',
        text: '⏸️ Backup pausado. Clique em "Continuar" para retomar.'
      });
      await new Promise((resolve) => {
        pauseResolve = resolve;
      });
      pauseResolve = null;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  if (isCancelled) {
    throw new Error('Backup cancelado pelo usuário');
  }
  
  if (!isPaused) {
    onProgress({
      type: 'status',
      text: '▶️ Backup retomado.'
    });
  }
};

const collectSourceStats = async (sourceDir, onProgress) => {
  let totalSize = 0;
  let totalFiles = 0;
  const stack = [sourceDir];

  while (stack.length > 0) {
    await checkPause(onProgress);
    const currentDir = stack.pop();
    try {
      const dirHandle = await fsp.opendir(currentDir);

      for await (const dirent of dirHandle) {
        const fullPath = path.join(currentDir, dirent.name);

        if (dirent.isDirectory()) {
          stack.push(fullPath);
          continue;
        }

        if (dirent.isFile()) {
          totalFiles += 1;
          if (totalFiles % 500 === 0) {
            await checkPause(onProgress);
            onProgress({
              type: 'status',
              text: `Escaneando arquivos... ${totalFiles} encontrados`
            });
          }

          try {
            const stats = await fsp.stat(fullPath);
            totalSize += stats.size;
          } catch (err) {
            onProgress({
              type: 'status',
              text: `Aviso: não foi possível acessar ${fullPath}: ${err.message}`
            });
          }
          continue;
        }

        if (dirent.isSymbolicLink()) {
          totalFiles += 1;
          if (totalFiles % 500 === 0) {
            onProgress({
              type: 'status',
              text: `Escaneando arquivos... ${totalFiles} encontrados`
            });
          }
        }
      }
    } catch (err) {
      onProgress({
        type: 'status',
        text: `Aviso: não foi possível ler ${currentDir}: ${err.message}`
      });
      continue;
    }
  }

  return { totalSize, totalFiles };
};

const zipDirectory = (sourceDir, outPath, totalSize, onProgress) =>
  new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archiveInstance = archive;
    let lastPercent = -1;
    let checkInterval = null;

    const cleanup = () => {
      if (checkInterval) {
        clearInterval(checkInterval);
      }
      archiveInstance = null;
    };

    // Verificar cancelamento periodicamente
    checkInterval = setInterval(() => {
      if (isCancelled) {
        cleanup();
        archive.abort();
        output.destroy();
        reject(new Error('Backup cancelado pelo usuário'));
      }
    }, 200);

    output.on('close', () => {
      cleanup();
      resolve();
    });
    output.on('end', () => {
      cleanup();
      resolve();
    });
    output.on('error', (err) => {
      cleanup();
      reject(err);
    });

    archive.on('progress', async (progress) => {
      // Verificar pausa durante a compactação
      if (isPaused && !isCancelled) {
        archive.pause();
        await checkPause(onProgress);
        if (!isCancelled) {
          archive.resume();
        }
      }

      const processedBytes = progress.fs?.processedBytes ?? 0;
      if (totalSize > 0) {
        const percent = Math.min(100, Math.round((processedBytes / totalSize) * 100));
        if (percent !== lastPercent) {
          lastPercent = percent;
          onProgress({
            type: 'progress',
            percent,
            text: `Compactando arquivos... ${percent}%`
          });
        }
      } else if (lastPercent !== progress.entries?.processed) {
        lastPercent = progress.entries?.processed ?? 0;
        onProgress({
          type: 'progress',
          percent: null,
          text: `Compactando arquivos...`
        });
      }
    });
    
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        return;
      }
      cleanup();
      reject(err);
    });
    
    archive.on('error', (err) => {
      cleanup();
      reject(err);
    });

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });

const ensurePaths = async () => {
  const sourceExists = await fs.pathExists(SOURCE_DIR);
  if (!sourceExists) {
    throw new Error(`Diretório de origem não encontrado: ${SOURCE_DIR}`);
  }
  await fs.ensureDir(DEST_DIR);
};

const togglePause = () => {
  if (isPaused) {
    isPaused = false;
    if (pauseResolve) {
      pauseResolve();
      pauseResolve = null;
    }
  } else {
    isPaused = true;
  }
  return isPaused;
};

const cancelBackup = () => {
  isCancelled = true;
  isPaused = false;
  if (pauseResolve) {
    pauseResolve();
    pauseResolve = null;
  }
  if (archiveInstance) {
    archiveInstance.abort();
  }
};

const resetBackupState = () => {
  isPaused = false;
  isCancelled = false;
  pauseResolve = null;
  archiveInstance = null;
};

const createBackup = async (onProgress = () => {}) => {
  resetBackupState();
  await ensurePaths();

  const timestamp = generateTimestamp();
  const tmpZipPath = path.join(os.tmpdir(), `backup-developer-${timestamp}.zip`);
  const finalZipPath = path.join(DEST_DIR, `backup-developer-${timestamp}.zip`);

  const update = (payload) => {
    const message =
      typeof payload === 'string'
        ? { text: payload }
        : {
            text: '',
            type: 'status',
            ...payload
          };
    try {
      onProgress(message);
    } catch (err) {
      // ignore listener errors to keep backup going
    }
  };

  update({ type: 'status', text: 'Preparando arquivos para compactação...' });

  try {
    update({ type: 'status', text: 'Calculando tamanho total dos arquivos...' });
    const { totalSize, totalFiles } = await collectSourceStats(SOURCE_DIR, update);
    update({
      type: 'status',
      text: `Encontrados ${totalFiles} arquivos (${formatBytes(totalSize)}). Iniciando compactação...`
    });

    await zipDirectory(SOURCE_DIR, tmpZipPath, totalSize, update);
    update({ type: 'progress', percent: 100, text: 'Compactação finalizada.' });
    update({ type: 'status', text: 'Arquivo compactado. Movendo para o destino...' });
    await fs.move(tmpZipPath, finalZipPath, { overwrite: true });
    update({ type: 'status', text: `Backup salvo em: ${finalZipPath}` });
    return finalZipPath;
  } catch (error) {
    if (await fs.pathExists(tmpZipPath)) {
      await fs.remove(tmpZipPath);
    }
    throw error;
  }
};

module.exports = {
  createBackup,
  togglePause,
  cancelBackup
};
