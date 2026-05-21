/**
 * Classe base para erros de backup
 */
class BackupError extends Error {
  constructor(message, code = 'BACKUP_ERROR') {
    super(message);
    this.name = 'BackupError';
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Erro quando diretório não é encontrado
 */
class DirectoryNotFoundError extends BackupError {
  constructor(path) {
    super(`Diretório não encontrado: ${path}`, 'DIRECTORY_NOT_FOUND');
    this.name = 'DirectoryNotFoundError';
    this.path = path;
  }
}

/**
 * Erro quando backup é cancelado pelo usuário
 */
class BackupCancelledError extends BackupError {
  constructor() {
    super('Backup cancelado pelo usuário', 'BACKUP_CANCELLED');
    this.name = 'BackupCancelledError';
  }
}

/**
 * Erro quando não há espaço em disco suficiente
 */
class InsufficientDiskSpaceError extends BackupError {
  constructor(required, available) {
    super(
      `Espaço em disco insuficiente. Necessário: ${required}, Disponível: ${available}`,
      'INSUFFICIENT_DISK_SPACE'
    );
    this.name = 'InsufficientDiskSpaceError';
    this.required = required;
    this.available = available;
  }
}

/**
 * Erro quando não há permissão para acessar arquivo/diretório
 */
class PermissionDeniedError extends BackupError {
  constructor(path) {
    super(`Permissão negada para acessar: ${path}`, 'PERMISSION_DENIED');
    this.name = 'PermissionDeniedError';
    this.path = path;
  }
}

/**
 * Erro quando configuração está inválida
 */
class InvalidConfigError extends BackupError {
  constructor(message) {
    super(`Configuração inválida: ${message}`, 'INVALID_CONFIG');
    this.name = 'InvalidConfigError';
  }
}

module.exports = {
  BackupError,
  DirectoryNotFoundError,
  BackupCancelledError,
  InsufficientDiskSpaceError,
  PermissionDeniedError,
  InvalidConfigError
};
