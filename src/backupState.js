/**
 * Gerenciador de estado do backup
 * Substitui variáveis globais por uma classe encapsulada
 */
class BackupState {
  constructor() {
    this.isPaused = false;
    this.isCancelled = false;
    this.pauseResolve = null;
    this.archiveInstance = null;
  }

  /**
   * Verifica se o backup está pausado
   * @returns {boolean}
   */
  getPaused() {
    return this.isPaused;
  }

  /**
   * Verifica se o backup foi cancelado
   * @returns {boolean}
   */
  getCancelled() {
    return this.isCancelled;
  }

  /**
   * Pausa o backup
   */
  pause() {
    this.isPaused = true;
  }

  /**
   * Retoma o backup
   */
  resume() {
    this.isPaused = false;
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
  }

  /**
   * Cancela o backup
   */
  cancel() {
    this.isCancelled = true;
    this.isPaused = false;
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
    if (this.archiveInstance) {
      this.archiveInstance.abort();
    }
  }

  /**
   * Define a função de resolução da pausa
   * @param {Function} resolve - Função para resolver a promise de pausa
   */
  setPauseResolve(resolve) {
    this.pauseResolve = resolve;
  }

  /**
   * Limpa a função de resolução da pausa
   */
  clearPauseResolve() {
    this.pauseResolve = null;
  }

  /**
   * Verifica se há uma função de resolução de pausa configurada
   * @returns {boolean}
   */
  hasPauseResolve() {
    return this.pauseResolve !== null;
  }

  /**
   * Define a instância do arquivo sendo criado
   * @param {Object} archive - Instância do archiver
   */
  setArchiveInstance(archive) {
    this.archiveInstance = archive;
  }

  /**
   * Limpa a instância do arquivo
   */
  clearArchiveInstance() {
    this.archiveInstance = null;
  }

  /**
   * Reseta todo o estado para valores iniciais
   */
  reset() {
    this.isPaused = false;
    this.isCancelled = false;
    this.pauseResolve = null;
    this.archiveInstance = null;
  }
}

module.exports = BackupState;
