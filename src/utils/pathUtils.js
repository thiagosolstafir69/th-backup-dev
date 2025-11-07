const path = require('path');

/**
 * Utilitários para manipulação de caminhos
 */

/**
 * Valida e normaliza um caminho de diretório
 * @param {string} dirPath - Caminho a ser validado
 * @returns {string} Caminho normalizado e validado
 * @throws {Error} Se o caminho for inválido
 */
const validateAndNormalizePath = (dirPath) => {
  if (!dirPath || typeof dirPath !== 'string') {
    throw new Error('Caminho inválido: deve ser uma string não vazia');
  }

  const normalized = path.normalize(dirPath);
  const resolved = path.resolve(normalized);

  // Previne path traversal attacks
  if (resolved !== normalized && !resolved.startsWith(normalized)) {
    throw new Error('Caminho inválido: tentativa de path traversal detectada');
  }

  return resolved;
};

/**
 * Sanitiza nome de arquivo removendo caracteres inválidos
 * @param {string} filename - Nome do arquivo
 * @returns {string} Nome sanitizado
 */
const sanitizeFilename = (filename) => {
  return filename.replace(/[<>:"/\\|?*]/g, '_');
};

module.exports = {
  validateAndNormalizePath,
  sanitizeFilename
};

