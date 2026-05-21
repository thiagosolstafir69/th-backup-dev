/**
 * Utilitários para formatação de datas
 */

/**
 * Adiciona zero à esquerda se necessário
 * @param {number} value - Valor a ser formatado
 * @returns {string} Valor formatado com zero à esquerda se necessário
 */
const pad = (value) => value.toString().padStart(2, '0');

/**
 * Gera timestamp formatado para uso em nomes de arquivo
 * Formato: DD-MM-YYYY_HH-MM-SS
 * @returns {string} Timestamp formatado
 */
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

module.exports = {
  pad,
  generateTimestamp
};
