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
const {
  validateAndNormalizePath,
  isSameOrInsidePath,
  sanitizeFilename
} = require('./utils/pathUtils');
const {
  BackupCancelledError,
  DirectoryNotFoundError,
  PermissionDeniedError,
  InvalidConfigError
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
 * Anexa itens a um array sem estourar a pilha de chamadas (evita push(...items) com arrays grandes)
 * @param {Array} target - Array de destino
 * @param {Array} items - Itens a anexar
 */
const appendAll = (target, items) => {
  for (const item of items) {
    target.push(item);
  }
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
  const skippedEntries = [];
  let totalSize = 0;
  let totalFiles = 0;
  const stack = [sourceDir];
  const visitedDirs = new Set();
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
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') {
        totalSize += result.value.stats.size;
        entries.push({
          type: 'file',
          fullPath: result.value.fullPath,
          archivePath: result.value.archivePath,
          stats: result.value.stats
        });
      } else {
        skippedEntries.push({
          path: batch[index].fullPath,
          reason: result.reason?.message || 'Não foi possível ler o arquivo.'
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
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') {
        entries.push({
          type: 'symlink',
          archivePath: result.value.archivePath,
          linkTarget: result.value.linkTarget
        });
      } else {
        skippedEntries.push({
          path: batch[index].fullPath,
          reason: result.reason?.message || 'Não foi possível ler o link simbólico.'
        });
      }
    }
  };

  while (stack.length > 0) {
    await checkPause(onProgress);
    const currentDir = stack.pop();

    let resolvedDir = currentDir;
    try {
      resolvedDir = await fsp.realpath(currentDir);
    } catch {
      // Mantém currentDir se realpath falhar; o bloco opendir tratará o erro
    }

    if (visitedDirs.has(resolvedDir)) {
      continue;
    }
    visitedDirs.add(resolvedDir);

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
        skippedEntries.push({
          path: currentDir,
          reason: 'Permissão negada.'
        });
        onProgress({
          type: 'status',
          text: `Aviso: sem permissão para ler o diretório ${currentDir}. Pulando...`
        });
        continue;
      }
      skippedEntries.push({
        path: currentDir,
        reason: err.message
      });
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

  return { entries, skippedEntries, totalSize, totalFiles };
};

/**
 * Cria arquivo ZIP a partir das entradas coletadas
 * @param {Array<Object>} entries - Lista de entradas a compactar
 * @param {string} outPath - Caminho de saída do ZIP
 * @param {number} totalSize - Tamanho total esperado em bytes
 * @param {Function} onProgress - Callback para atualizar progresso
 * @returns {Promise<void>}
 */
const zipEntries = (entries, outPath, totalSize, compressionLevel, onProgress) =>
  new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: compressionLevel } });
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
            archive.file(entry.fullPath, {
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

  const sourceStats = await fs.stat(normalizedSource);
  if (!sourceStats.isDirectory()) {
    throw new InvalidConfigError('A origem precisa ser uma pasta.');
  }

  if (isSameOrInsidePath(normalizedSource, normalizedDest)) {
    throw new InvalidConfigError(
      'A pasta de destino não pode ser igual à origem nem ficar dentro dela.'
    );
  }

  await fs.ensureDir(normalizedDest);

  const destStats = await fs.stat(normalizedDest);
  if (!destStats.isDirectory()) {
    throw new InvalidConfigError('O destino precisa ser uma pasta.');
  }

  return {
    sourceDir: normalizedSource,
    destDir: normalizedDest
  };
};

const resolveBackupOptions = async (sourceDir, destDir) => {
  const config = await configManager.load();
  const finalSourceDir = sourceDir || config.sourceDir || configManager.getDefaultSourceDir();
  const finalDestDir = destDir || config.destDir || configManager.getDefaultDestDir();

  if (!finalSourceDir || !finalDestDir) {
    throw new InvalidConfigError('Selecione uma pasta de origem e uma pasta de destino.');
  }

  const normalizedPaths = await ensurePaths(finalSourceDir, finalDestDir);
  const ignoredDirs = await configManager.getIgnoredDirs();
  const compressionLevel = config.compressionLevel !== undefined ? config.compressionLevel : 1;

  return {
    ...normalizedPaths,
    ignoredDirs,
    compressionLevel
  };
};

const getEntriesToBackup = async (sourceDir, includeXampp, onProgress) => {
  const entriesToBackup = [{ path: sourceDir, prefix: '' }];

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

  return entriesToBackup;
};

const collectBackupPlan = async (sourceDir, includeXampp, ignoredDirs, onProgress) => {
  const collectedEntries = [];
  const skippedEntries = [];
  let grandTotalSize = 0;
  let grandTotalFiles = 0;

  const entriesToBackup = await getEntriesToBackup(sourceDir, includeXampp, onProgress);

  for (const entry of entriesToBackup) {
    onProgress({
      type: 'status',
      text: `Analisando: ${entry.path}...`
    });
    const { entries, skippedEntries: skipped, totalSize, totalFiles } =
      await collectDirectoryEntries(entry.path, entry.prefix, ignoredDirs, onProgress);

    appendAll(collectedEntries, entries);
    appendAll(skippedEntries, skipped);
    grandTotalSize += totalSize;
    grandTotalFiles += totalFiles;
  }

  return {
    entries: collectedEntries,
    skippedEntries,
    totalSize: grandTotalSize,
    totalFiles: grandTotalFiles
  };
};

const removePreviousBackups = async (destDir, currentBackupPath, onProgress) => {
  const currentBackupName = path.basename(currentBackupPath);
  const entries = await fs.readdir(destDir, { withFileTypes: true });
  let removedCount = 0;

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const isBackupFile =
      entry.name.startsWith(FINAL_FILE_PREFIX) && entry.name.endsWith(FINAL_FILE_SUFFIX);
    if (!isBackupFile || entry.name === currentBackupName) {
      continue;
    }

    const oldBackupPath = path.join(destDir, entry.name);
    try {
      await fs.remove(oldBackupPath);
      removedCount += 1;
      onProgress({
        type: 'status',
        text: `Backup anterior removido: ${entry.name}`
      });
    } catch (error) {
      onProgress({
        type: 'status',
        text: `Aviso: não foi possível remover backup anterior ${entry.name}: ${error.message}`
      });
    }
  }

  return removedCount;
};

const previewBackup = async (
  onProgress = () => {},
  sourceDir = null,
  destDir = null,
  includeXampp = false
) => {
  backupState.reset();
  const options = await resolveBackupOptions(sourceDir, destDir);
  const update = (payload) => onProgress(createProgressMessage(payload));

  update({ type: 'status', text: 'Mapeando arquivos para gerar resumo...' });
  const plan = await collectBackupPlan(
    options.sourceDir,
    includeXampp,
    options.ignoredDirs,
    update
  );

  return {
    sourceDir: options.sourceDir,
    destDir: options.destDir,
    totalFiles: plan.totalFiles,
    totalSize: plan.totalSize,
    skippedCount: plan.skippedEntries.length,
    skippedEntries: plan.skippedEntries.slice(0, 20),
    ignoredDirs: Array.from(options.ignoredDirs)
  };
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

  const options = await resolveBackupOptions(sourceDir, destDir);

  const timestamp = generateTimestamp();
  const sanitizedTimestamp = sanitizeFilename(timestamp);
  const finalZipPath = path.join(
    options.destDir,
    `${FINAL_FILE_PREFIX}${sanitizedTimestamp}${FINAL_FILE_SUFFIX}`
  );
  const tmpZipPath = path.join(
    options.destDir,
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

    const plan = await collectBackupPlan(
      options.sourceDir,
      includeXampp,
      options.ignoredDirs,
      update
    );

    if (backupState.getCancelled()) {
      await cleanup();
      throw new BackupCancelledError();
    }

    update({
      type: 'status',
      text: `Total: ${plan.totalFiles} arquivos (${formatBytes(
        plan.totalSize
      )}). Iniciando compactação...`
    });

    if (plan.skippedEntries.length > 0) {
      update({
        type: 'status',
        text: `${plan.skippedEntries.length} item(ns) não puderam ser lidos e serão pulados.`
      });
    }

    await zipEntries(plan.entries, tmpZipPath, plan.totalSize, options.compressionLevel, update);

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
    const removedBackups = await removePreviousBackups(options.destDir, finalZipPath, update);
    if (removedBackups > 0) {
      update({
        type: 'status',
        text: `${removedBackups} backup(s) antigo(s) removido(s). Só o backup mais recente permanece no destino.`
      });
    }
    if (plan.skippedEntries.length > 0) {
      update({
        type: 'summary',
        skippedCount: plan.skippedEntries.length,
        skippedEntries: plan.skippedEntries.slice(0, 20),
        text: `Backup concluído com ${plan.skippedEntries.length} item(ns) pulados.`
      });
    }
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
  previewBackup,
  togglePause,
  cancelBackup
};
