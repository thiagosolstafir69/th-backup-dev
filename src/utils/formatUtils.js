const {
  BYTES_BASE,
  BYTES_UNITS,
  BYTES_DECIMAL_PLACES_THRESHOLD
} = require('../constants');

/**
 * Utilitários para formatação de dados
 */

/**
 * Formata bytes em formato legível (B, KB, MB, GB, TB)
 * @param {number} bytes - Quantidade de bytes
 * @returns {string} String formatada (ex: "1.5 MB")
 */
const formatBytes = (bytes) => {
  if (bytes === 0) {
    return '0 B';
  }

  const i = Math.floor(Math.log(bytes) / Math.log(BYTES_BASE));
  const value = bytes / Math.pow(BYTES_BASE, i);
  const decimalPlaces =
    value >= BYTES_DECIMAL_PLACES_THRESHOLD || i === 0 ? 0 : 1;
  return `${value.toFixed(decimalPlaces)} ${BYTES_UNITS[i]}`;
};

module.exports = {
  formatBytes
};

