const fs = require('fs-extra');
let nativeFs = require('fs');
if (process.versions && process.versions.electron) {
  try {
    nativeFs = require('original-fs');
  } catch (err) {
    nativeFs = require('fs');
  }
}
const path = require('path');
const os = require('os');
const archiver = require('archiver');
const BackupState = require('./backupState');
const configManager = require('./config');
const {
  PAUSE_CHECK_INTERVAL_MS,
  FILES_SCAN_PROGRESS_INTERVAL,
  COMPRESSION_LEVEL,
  PROGRESS_UPDATE_INTERVAL_MS,
  MIN_PROGRESS_PERCENT,
  MAX_PROGRESS_PERCENT,
  TEMP_FILE_PREFIX,
  TEMP_FILE_SUFFIX,
  FINAL_FILE_PREFIX,
  FINAL_FILE_SUFFIX
} = require('./constants');
const { generateTimestamp } = require('./utils/dateUtils');
const { formatBytes } = require('./utils/formatUtils');
const { validateAndNormalizePath, sanitizeFilename } = require('./utils/pathUtils');
const {
  BackupCancelledError,
  DirectoryNotFoundError,
  PermissionDeniedError
} = require('./errors/BackupError');

const fsp = nativeFs.promises;

// Instância única do estado do backup
const backupState = new BackupState();

/**
 * Normaliza caminhos para o formato usado dentro do ZIP
 * @param {string} baseDir - Diretório raiz
 * @param {string} target - Caminho completo do arquivo
 * @returns {string} Caminho relativo com separadores POSIX
 */
const toArchiveEntryName = (baseDir, target) =>
  path.relative(baseDir, target).split(path.sep).join('/');

/**
 * Verifica se o backup está pausado e aguarda retomada
 * @param {Function} onProgress - Callback para atualizar progresso
 * @throws {BackupCancelledError} Se o backup foi cancelado
 */
const checkPause = async (onProgress) => {
  while (backupState.getPaused() && !backupState.getCancelled()) {
    if (!backupState.hasPauseResolve()) {
      onProgress({
        type: 'status',
        text: '⏸️ Backup pausado. Clique em "Continuar" para retomar.'
      });
      await new Promise((resolve) => {
        backupState.setPauseResolve(resolve);
      });
      backupState.clearPauseResolve();
    }
    await new Promise((resolve) =>
      setTimeout(resolve, PAUSE_CHECK_INTERVAL_MS)
    );
  }

  if (backupState.getCancelled()) {
    throw new BackupCancelledError();
  }

  if (!backupState.getPaused()) {
    onProgress({
      type: 'status',
      text: '▶️ Backup retomado.'
    });
  }
};

/**
 * Coleta estatísticas dos arquivos no diretório de origem
 * @param {string} sourceDir - Diretório de origem
 * @param {Set<string>} ignoredDirs - Conjunto de diretórios a ignorar
 * @param {Function} onProgress - Callback para atualizar progresso
 * @returns {Promise<{totalSize: number, totalFiles: number}>}
 */
const collectSourceStats = async (sourceDir, ignoredDirs, onProgress) => {
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
          if (ignoredDirs.has(dirent.name)) {
            continue;
          }
          stack.push(fullPath);
          continue;
        }

        if (dirent.isFile()) {
          totalFiles += 1;
          if (totalFiles % FILES_SCAN_PROGRESS_INTERVAL === 0) {
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
            if (err.code === 'EACCES') {
              throw new PermissionDeniedError(fullPath);
            }
            onProgress({
              type: 'status',
              text: `Aviso: não foi possível acessar ${fullPath}: ${err.message}`
            });
          }
          continue;
        }

        if (dirent.isSymbolicLink()) {
          totalFiles += 1;
          if (totalFiles % FILES_SCAN_PROGRESS_INTERVAL === 0) {
            onProgress({
              type: 'status',
              text: `Escaneando arquivos... ${totalFiles} encontrados`
            });
          }
        }
      }
    } catch (err) {
      if (err.code === 'EACCES') {
        throw new PermissionDeniedError(currentDir);
      }
      onProgress({
        type: 'status',
        text: `Aviso: não foi possível ler ${currentDir}: ${err.message}`
      });
      continue;
    }
  }

  return { totalSize, totalFiles };
};

/**
 * Cria arquivo ZIP do diretório
 * @param {string} sourceDir - Diretório de origem
 * @param {string} outPath - Caminho de saída do ZIP
 * @param {number} totalSize - Tamanho total esperado em bytes
 * @param {Set<string>} ignoredDirs - Conjunto de diretórios a ignorar
 * @param {Function} onProgress - Callback para atualizar progresso
 * @returns {Promise<void>}
 */
const zipDirectory = (
  sourceDir,
  outPath,
  totalSize,
  ignoredDirs,
  onProgress
) =>
  new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: COMPRESSION_LEVEL } });
    backupState.setArchiveInstance(archive);
    let lastPercent = -1;
    let checkInterval = null;

    const cleanup = () => {
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }
      backupState.clearArchiveInstance();
    };

    // Verificar cancelamento periodicamente
    checkInterval = setInterval(() => {
      if (backupState.getCancelled()) {
        cleanup();
        try {
          archive.abort();
          output.destroy();
        } catch (err) {
          // Ignora erros durante cleanup
        }
        reject(new BackupCancelledError());
      }
    }, PROGRESS_UPDATE_INTERVAL_MS);

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
      if (backupState.getPaused() && !backupState.getCancelled()) {
        archive.pause();
        try {
          await checkPause(onProgress);
          if (!backupState.getCancelled()) {
            archive.resume();
          }
        } catch (err) {
          cleanup();
          reject(err);
        }
      }

      const processedBytes = progress.fs?.processedBytes ?? 0;
      if (totalSize > 0) {
        const percent = Math.min(
          MAX_PROGRESS_PERCENT,
          Math.max(
            MIN_PROGRESS_PERCENT,
            Math.round((processedBytes / totalSize) * MAX_PROGRESS_PERCENT)
          )
        );
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
          text: 'Compactando arquivos...'
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
    const appendDirectoryContents = async () => {
      const stack = [sourceDir];

      while (stack.length > 0) {
        await checkPause(onProgress);
        const currentDir = stack.pop();
        let dirHandle;

        try {
          dirHandle = await fsp.opendir(currentDir);
        } catch (err) {
          if (err.code === 'EACCES') {
            throw new PermissionDeniedError(currentDir);
          }
          throw err;
        }

        for await (const dirent of dirHandle) {
          const fullPath = path.join(currentDir, dirent.name);

          if (dirent.isDirectory()) {
            if (ignoredDirs.has(dirent.name)) {
              continue;
            }
            stack.push(fullPath);
            continue;
          }

          if (dirent.isSymbolicLink()) {
            try {
              const linkTarget = await fsp.readlink(fullPath);
              archive.symlink(toArchiveEntryName(sourceDir, fullPath), linkTarget);
            } catch (err) {
              if (err.code === 'EACCES') {
                throw new PermissionDeniedError(fullPath);
              }
              throw err;
            }
            continue;
          }

          if (!dirent.isFile()) {
            continue;
          }

          let stats;
          try {
            stats = await fsp.stat(fullPath);
          } catch (err) {
            if (err.code === 'EACCES') {
              throw new PermissionDeniedError(fullPath);
            }
            throw err;
          }

          try {
            const stream = nativeFs.createReadStream(fullPath);
            stream.once('error', (err) => {
              cleanup();
              reject(err);
            });
            archive.append(stream, {
              name: toArchiveEntryName(sourceDir, fullPath),
              stats
            });
          } catch (err) {
            if (err.code === 'EACCES') {
              throw new PermissionDeniedError(fullPath);
            }
            throw err;
          }
        }
      }
    };

    appendDirectoryContents()
      .then(() => archive.finalize())
      .catch((err) => {
        cleanup();
        reject(err);
      });
  });

/**
 * Valida e garante que os caminhos existem
 * @param {string} sourceDir - Diretório de origem
 * @param {string} destDir - Diretório de destino
 * @returns {Promise<void>}
 * @throws {DirectoryNotFoundError} Se o diretório de origem não existir
 */
const ensurePaths = async (sourceDir, destDir) => {
  const normalizedSource = validateAndNormalizePath(sourceDir);
  const normalizedDest = validateAndNormalizePath(destDir);

  const sourceExists = await fs.pathExists(normalizedSource);
  if (!sourceExists) {
    throw new DirectoryNotFoundError(normalizedSource);
  }

  await fs.ensureDir(normalizedDest);
};

/**
 * Cria progress message normalizado
 * @param {string|Object} payload - Payload do progresso
 * @returns {Object} Mensagem normalizada
 */
const createProgressMessage = (payload) => {
  return typeof payload === 'string'
    ? { text: payload }
    : {
        text: '',
        type: 'status',
        ...payload
      };
};

/**
 * Cria backup do diretório configurado
 * @param {Function} onProgress - Callback para atualizar progresso
 * @param {string} [sourceDir] - Diretório de origem (opcional, usa config se não fornecido)
 * @param {string} [destDir] - Diretório de destino (opcional, usa config se não fornecido)
 * @returns {Promise<string>} Caminho do arquivo de backup criado
 * @throws {BackupError} Em caso de erro durante o backup
 */
const createBackup = async (
  onProgress = () => {},
  sourceDir = null,
  destDir = null
) => {
  backupState.reset();

  // Carrega configuração ou usa valores fornecidos
  const config = await configManager.load();
  const finalSourceDir =
    sourceDir || config.sourceDir || configManager.getDefaultSourceDir();
  const finalDestDir =
    destDir || config.destDir || configManager.getDefaultDestDir();
  const ignoredDirs = await configManager.getIgnoredDirs();

  if (!finalSourceDir || !finalDestDir) {
    throw new Error(
      'Diretórios de origem e destino devem ser configurados. Use a interface para selecionar as pastas.'
    );
  }

  await ensurePaths(finalSourceDir, finalDestDir);

  const timestamp = generateTimestamp();
  const sanitizedTimestamp = sanitizeFilename(timestamp);
  const tmpZipPath = path.join(
    os.tmpdir(),
    `${TEMP_FILE_PREFIX}${sanitizedTimestamp}${TEMP_FILE_SUFFIX}`
  );
  const finalZipPath = path.join(
    finalDestDir,
    `${FINAL_FILE_PREFIX}${sanitizedTimestamp}${FINAL_FILE_SUFFIX}`
  );

  const update = (payload) => {
    const message = createProgressMessage(payload);
    try {
      onProgress(message);
    } catch (err) {
      // Ignora erros do listener para manter o backup funcionando
    }
  };

  const cleanup = async () => {
    try {
      if (await fs.pathExists(tmpZipPath)) {
        await fs.remove(tmpZipPath);
        update({ type: 'status', text: 'Arquivo temporário removido.' });
      }
    } catch (err) {
      console.error('Erro ao limpar arquivo temporário:', err);
    }
  };

  update({ type: 'status', text: 'Preparando arquivos para compactação...' });

  try {
    update({ type: 'status', text: 'Calculando tamanho total dos arquivos...' });
    const { totalSize, totalFiles } = await collectSourceStats(
      finalSourceDir,
      ignoredDirs,
      update
    );

    if (backupState.getCancelled()) {
      await cleanup();
      throw new BackupCancelledError();
    }

    update({
      type: 'status',
      text: `Encontrados ${totalFiles} arquivos (${formatBytes(
        totalSize
      )}). Iniciando compactação...`
    });

    await zipDirectory(finalSourceDir, tmpZipPath, totalSize, ignoredDirs, update);

    if (backupState.getCancelled()) {
      await cleanup();
      throw new BackupCancelledError();
    }

    update({
      type: 'progress',
      percent: MAX_PROGRESS_PERCENT,
      text: 'Compactação finalizada.'
    });
    update({
      type: 'status',
      text: 'Arquivo compactado. Movendo para o destino...'
    });
    await fs.move(tmpZipPath, finalZipPath, { overwrite: true });
    update({
      type: 'status',
      text: `Backup salvo em: ${finalZipPath}`
    });
    return finalZipPath;
  } catch (error) {
    await cleanup();
    throw error;
  }
};

/**
 * Alterna o estado de pausa do backup
 * @returns {boolean} Novo estado de pausa (true = pausado, false = em execução)
 */
const togglePause = () => {
  if (backupState.getPaused()) {
    backupState.resume();
  } else {
    backupState.pause();
  }
  return backupState.getPaused();
};

/**
 * Cancela o backup em andamento
 */
const cancelBackup = () => {
  backupState.cancel();
};

module.exports = {
  createBackup,
  togglePause,
  cancelBackup
};
