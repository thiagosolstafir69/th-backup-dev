/**
 * Constantes utilizadas em todo o projeto
 */

// Intervalos e limites
const PAUSE_CHECK_INTERVAL_MS = 100;
const FILES_SCAN_PROGRESS_INTERVAL = 1000;
const COMPRESSION_LEVEL = 1;
const PROGRESS_UPDATE_INTERVAL_MS = 100;
const STAT_BATCH_SIZE = 64;
const ZIP_PAUSE_CHECK_INTERVAL = 100;

// Níveis de progresso
const MIN_PROGRESS_PERCENT = 0;
const MAX_PROGRESS_PERCENT = 100;

// Formatação de bytes
const BYTES_BASE = 1024;
const BYTES_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];
const BYTES_DECIMAL_PLACES_THRESHOLD = 10;

// Pastas ignoradas por padrão
const DEFAULT_IGNORED_DIRS = ['node_modules', 'dist', 'build', '.DS_Store'];

// Nomes de arquivos
const TEMP_FILE_PREFIX = '.backup-developer-';
const TEMP_FILE_SUFFIX = '.partial.zip';
const FINAL_FILE_PREFIX = 'backup-developer-';
const FINAL_FILE_SUFFIX = '.zip';

module.exports = {
  PAUSE_CHECK_INTERVAL_MS,
  FILES_SCAN_PROGRESS_INTERVAL,
  COMPRESSION_LEVEL,
  PROGRESS_UPDATE_INTERVAL_MS,
  STAT_BATCH_SIZE,
  ZIP_PAUSE_CHECK_INTERVAL,
  MIN_PROGRESS_PERCENT,
  MAX_PROGRESS_PERCENT,
  BYTES_BASE,
  BYTES_UNITS,
  BYTES_DECIMAL_PLACES_THRESHOLD,
  DEFAULT_IGNORED_DIRS,
  TEMP_FILE_PREFIX,
  TEMP_FILE_SUFFIX,
  FINAL_FILE_PREFIX,
  FINAL_FILE_SUFFIX
};
