const fs = require('fs-extra');
let nativeFs = require('fs');
if (process.versions && process.versions.electron) {
  try {
    nativeFs = require('original-fs');
  } catch {
    nativeFs = require('fs');
  }
}
const path = require('path');
const archiver = require('archiver');
const BackupState = require('./backupState');
const configManager = require('./config');
const {
  PAUSE_CHECK_INTERVAL_MS,
  FILES_SCAN_PROGRESS_INTERVAL,
  COMPRESSION_LEVEL,
  PROGRESS_UPDATE_INTERVAL_MS,
  STAT_BATCH_SIZE,
  ZIP_PAUSE_CHECK_INTERVAL,
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
 * @param {string} prefix - Prefixo opcional para o caminho no ZIP
 * @returns {string} Caminho relativo com separadores POSIX
 */
const toArchiveEntryName = (baseDir, target, prefix = '') => {
  const rel = path.relative(baseDir, target).split(path.sep).join('/');
  return prefix ? `${prefix}/${rel}` : rel;
};

/**
 * Verifica se o backup está pausado e aguarda retomada
 * @param {Function} onProgress - Callback para atualizar progresso
 * @throws {BackupCancelledError} Se o backup foi cancelado
 */
const checkPause = async (onProgress) => {
  const wasPaused = backupState.getPaused();

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
    await new Promise((resolve) => setTimeout(resolve, PAUSE_CHECK_INTERVAL_MS));
  }

  if (backupState.getCancelled()) {
    throw new BackupCancelledError();
  }

  if (wasPaused && !backupState.getPaused()) {
    onProgress({
      type: 'status',
      text: '▶️ Backup retomado.'
    });
  }
};

/**
 * Coleta entradas e estatísticas dos arquivos no diretório de origem
 * @param {string} sourceDir - Diretório de origem
 * @param {string} prefix - Prefixo opcional para caminhos no ZIP
 * @param {Set<string>} ignoredDirs - Conjunto de diretórios a ignorar
 * @param {Function} onProgress - Callback para atualizar progresso
 * @returns {Promise<{entries: Array<Object>, totalSize: number, totalFiles: number}>}
 */
const collectDirectoryEntries = async (sourceDir, prefix, ignoredDirs, onProgress) => {
  const entries = [];
  let totalSize = 0;
  let totalFiles = 0;
  const stack = [sourceDir];
  const pendingFiles = [];
  const pendingSymlinks = [];

  const flushPendingFiles = async () => {
    if (pendingFiles.length === 0) {
      return;
    }
    const batch = pendingFiles.splice(0);
    const results = await Promise.allSettled(
      batch.map(async ({ fullPath, archivePath }) => {
        const stats = await fsp.stat(fullPath);
        return { fullPath, archivePath, stats };
      })
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        totalSize += result.value.stats.size;
        entries.push({
          type: 'file',
          fullPath: result.value.fullPath,
          archivePath: result.value.archivePath,
          stats: result.value.stats
        });
      }
    }
  };

  const flushPendingSymlinks = async () => {
    if (pendingSymlinks.length === 0) {
      return;
    }
    const batch = pendingSymlinks.splice(0);
    const results = await Promise.allSettled(
      batch.map(async ({ fullPath, archivePath }) => {
        const linkTarget = await fsp.readlink(fullPath);
        return { archivePath, linkTarget };
      })
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        entries.push({
          type: 'symlink',
          archivePath: result.value.archivePath,
          linkTarget: result.value.linkTarget
        });
      }
    }
  };

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
          pendingFiles.push({
            fullPath,
            archivePath: toArchiveEntryName(sourceDir, fullPath, prefix)
          });

          if (pendingFiles.length >= STAT_BATCH_SIZE) {
            await flushPendingFiles();
          }

          if (totalFiles % FILES_SCAN_PROGRESS_INTERVAL === 0) {
            await checkPause(onProgress);
            onProgress({
              type: 'status',
              text: `Escaneando arquivos... ${totalFiles} encontrados`
            });
          }
          continue;
        }

        if (dirent.isSymbolicLink()) {
          totalFiles += 1;
          pendingSymlinks.push({
            fullPath,
            archivePath: toArchiveEntryName(sourceDir, fullPath, prefix)
          });

          if (pendingSymlinks.length >= STAT_BATCH_SIZE) {
            await flushPendingSymlinks();
          }

          if (totalFiles % FILES_SCAN_PROGRESS_INTERVAL === 0) {
            await checkPause(onProgress);
            onProgress({
              type: 'status',
              text: `Escaneando arquivos... ${totalFiles} encontrados`
            });
          }
        }
      }
    } catch (err) {
      if (err.code === 'EACCES') {
        onProgress({
          type: 'status',
          text: `Aviso: sem permissão para ler o diretório ${currentDir}. Pulando...`
        });
        continue;
      }
      onProgress({
        type: 'status',
        text: `Aviso: não foi possível ler ${currentDir}: ${err.message}`
      });
      continue;
    }
  }

  // Flush remaining batches
  await flushPendingFiles();
  await flushPendingSymlinks();

  return { entries, totalSize, totalFiles };
};

/**
 * Cria arquivo ZIP a partir das entradas coletadas
 * @param {Array<Object>} entries - Lista de entradas a compactar
 * @param {string} outPath - Caminho de saída do ZIP
 * @param {number} totalSize - Tamanho total esperado em bytes
 * @param {Function} onProgress - Callback para atualizar progresso
 * @returns {Promise<void>}
 */
const zipEntries = (entries, outPath, totalSize, onProgress) =>
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
        } catch {
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

    (async () => {
      try {
        let fileCount = 0;
        for (const entry of entries) {
          fileCount += 1;
          if (fileCount % ZIP_PAUSE_CHECK_INTERVAL === 0) {
            await checkPause(onProgress);
          }

          if (entry.type === 'symlink') {
            archive.symlink(entry.archivePath, entry.linkTarget);
            continue;
          }

          try {
            const stream = nativeFs.createReadStream(entry.fullPath);
            stream.once('error', (err) => {
              cleanup();
              reject(err);
            });
            archive.append(stream, {
              name: entry.archivePath,
              stats: entry.stats
            });
          } catch (err) {
            if (err.code === 'EACCES') {
              throw new PermissionDeniedError(entry.fullPath);
            }
            throw err;
          }
        }
        await archive.finalize();
      } catch (err) {
        cleanup();
        reject(err);
      }
    })();
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
/**
 * Cria backup do diretório configurado
 * @param {Function} onProgress - Callback para atualizar progresso
 * @param {string} [sourceDir] - Diretório de origem (opcional, usa config se não fornecido)
 * @param {string} [destDir] - Diretório de destino (opcional, usa config se não fornecido)
 * @param {boolean} [includeXampp] - Se deve incluir backups do XAMPP
 * @returns {Promise<string>} Caminho do arquivo de backup criado
 * @throws {BackupError} Em caso de erro durante o backup
 */
const createBackup = async (
  onProgress = () => {},
  sourceDir = null,
  destDir = null,
  includeXampp = false
) => {
  backupState.reset();

  // Carrega configuração ou usa valores fornecidos
  const config = await configManager.load();
  const finalSourceDir = sourceDir || config.sourceDir || configManager.getDefaultSourceDir();
  const finalDestDir = destDir || config.destDir || configManager.getDefaultDestDir();
  const ignoredDirs = await configManager.getIgnoredDirs();

  if (!finalSourceDir || !finalDestDir) {
    throw new Error(
      'Diretórios de origem e destino devem ser configurados. ' +
        'Use a interface para selecionar as pastas.'
    );
  }

  await ensurePaths(finalSourceDir, finalDestDir);

  const entriesToBackup = [{ path: finalSourceDir, prefix: '' }];
  if (includeXampp) {
    const xamppPath = '/Applications/XAMPP/xamppfiles/htdocs';
    if (await fs.pathExists(xamppPath)) {
      entriesToBackup.push({ path: xamppPath, prefix: 'xampp_htdocs' });
    } else {
      onProgress({
        type: 'status',
        text: 'Aviso: Pasta XAMPP selecionada mas não encontrada. Pulando...'
      });
    }
  }

  const timestamp = generateTimestamp();
  const sanitizedTimestamp = sanitizeFilename(timestamp);
  const finalZipPath = path.join(
    finalDestDir,
    `${FINAL_FILE_PREFIX}${sanitizedTimestamp}${FINAL_FILE_SUFFIX}`
  );
  const tmpZipPath = path.join(
    finalDestDir,
    `${TEMP_FILE_PREFIX}${sanitizedTimestamp}${TEMP_FILE_SUFFIX}`
  );

  const update = (payload) => {
    const message = createProgressMessage(payload);
    try {
      onProgress(message);
    } catch {
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
    update({ type: 'status', text: 'Mapeando arquivos e calculando o tamanho total...' });

    const collectedEntries = [];
    let grandTotalSize = 0;
    let grandTotalFiles = 0;

    for (const entry of entriesToBackup) {
      update({
        type: 'status',
        text: `Analisando: ${entry.path}...`
      });
      const { entries, totalSize, totalFiles } = await collectDirectoryEntries(
        entry.path,
        entry.prefix,
        ignoredDirs,
        update
      );
      collectedEntries.push(...entries);
      grandTotalSize += totalSize;
      grandTotalFiles += totalFiles;
    }

    if (backupState.getCancelled()) {
      await cleanup();
      throw new BackupCancelledError();
    }

    update({
      type: 'status',
      text: `Total: ${grandTotalFiles} arquivos (${formatBytes(
        grandTotalSize
      )}). Iniciando compactação...`
    });

    await zipEntries(collectedEntries, tmpZipPath, grandTotalSize, update);

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
      text: 'Arquivo compactado. Finalizando backup...'
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
