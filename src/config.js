const path = require('path');
const os = require('os');
const { DEFAULT_IGNORED_DIRS } = require('./constants');

/**
 * Gerenciador de configuração da aplicação
 * Permite armazenar e recuperar configurações do usuário
 */
class ConfigManager {
  constructor() {
    this.configPath = path.join(os.homedir(), '.backup-developer-config.json');
    // Valores padrão
    this.defaultSourceDir = '/Users/thiago/Developer';
    this.defaultDestDir =
      '/Users/thiago/Library/CloudStorage/GoogleDrive-thiagowip@gmail.com/Meu Drive/Backup-developer';
    this.defaultConfig = {
      sourceDir: this.defaultSourceDir,
      destDir: this.defaultDestDir,
      ignoredDirs: [...DEFAULT_IGNORED_DIRS],
      history: [],
      theme: 'auto',
      compressionLevel: 1
    };
    this.config = null;
  }

  /**
   * Carrega a configuração do arquivo ou retorna padrão
   * @returns {Promise<Object>} Configuração carregada
   */
  async load() {
    if (this.config) {
      return this.config;
    }

    try {
      const fs = require('fs-extra');
      if (await fs.pathExists(this.configPath)) {
        const data = await fs.readJson(this.configPath);
        this.config = { ...this.defaultConfig, ...data };
      } else {
        this.config = { ...this.defaultConfig };
      }
    } catch (error) {
      console.warn('Erro ao carregar configuração, usando padrões:', error.message);
      this.config = { ...this.defaultConfig };
    }

    return this.config;
  }

  /**
   * Salva a configuração no arquivo
   * @param {Object} newConfig - Nova configuração a ser salva
   * @returns {Promise<void>}
   */
  async save(newConfig) {
    const fs = require('fs-extra');
    this.config = { ...this.config, ...newConfig };
    await fs.writeJson(this.configPath, this.config, { spaces: 2 });
  }

  /**
   * Obtém o diretório de origem configurado ou padrão
   * @returns {Promise<string>}
   */
  async getSourceDir() {
    const config = await this.load();
    return config.sourceDir || this.defaultSourceDir;
  }

  /**
   * Obtém o diretório de destino configurado ou padrão
   * @returns {Promise<string>}
   */
  async getDestDir() {
    const config = await this.load();
    return config.destDir || this.defaultDestDir;
  }

  /**
   * Obtém a lista de diretórios ignorados
   * @returns {Promise<Set<string>>}
   */
  async getIgnoredDirs() {
    const config = await this.load();
    return new Set(config.ignoredDirs || DEFAULT_IGNORED_DIRS);
  }

  /**
   * Define o diretório de origem
   * @param {string} dir - Caminho do diretório
   * @returns {Promise<void>}
   */
  async setSourceDir(dir) {
    await this.save({ sourceDir: dir });
  }

  /**
   * Define o diretório de destino
   * @param {string} dir - Caminho do diretório
   * @returns {Promise<void>}
   */
  async setDestDir(dir) {
    await this.save({ destDir: dir });
  }

  /**
   * Define os diretórios ignorados
   * @param {string[]} dirs - Lista de nomes de diretórios
   * @returns {Promise<void>}
   */
  async setIgnoredDirs(dirs) {
    await this.save({ ignoredDirs: dirs });
  }

  /**
   * Obtém o histórico de backups
   * @returns {Promise<Object[]>}
   */
  async getHistory() {
    const config = await this.load();
    return config.history || [];
  }

  /**
   * Adiciona uma entrada ao histórico de backups
   * @param {Object} entry - Entrada de histórico
   * @returns {Promise<void>}
   */
  async addHistoryEntry(entry) {
    const config = await this.load();
    const history = config.history || [];
    history.unshift(entry);
    // Limita o histórico a 15 itens
    if (history.length > 15) {
      history.pop();
    }
    await this.save({ history });
  }

  /**
   * Limpa o histórico de backups
   * @returns {Promise<void>}
   */
  async clearHistory() {
    await this.save({ history: [] });
  }

  /**
   * Obtém o tema atual
   * @returns {Promise<string>}
   */
  async getTheme() {
    const config = await this.load();
    return config.theme || 'auto';
  }

  /**
   * Define o tema
   * @param {string} theme - 'auto', 'light' ou 'dark'
   * @returns {Promise<void>}
   */
  async setTheme(theme) {
    await this.save({ theme });
  }

  /**
   * Obtém o nível de compressão atual
   * @returns {Promise<number>}
   */
  async getCompressionLevel() {
    const config = await this.load();
    return typeof config.compressionLevel === 'number' ? config.compressionLevel : 1;
  }

  /**
   * Define o nível de compressão
   * @param {number} level - Nível de compressão de 0 a 9
   * @returns {Promise<void>}
   */
  async setCompressionLevel(level) {
    await this.save({ compressionLevel: level });
  }

  /**
   * Reseta a configuração para os valores padrão
   * @returns {Promise<void>}
   */
  async reset() {
    this.config = null;
    const fs = require('fs-extra');
    if (await fs.pathExists(this.configPath)) {
      await fs.remove(this.configPath);
    }
  }

  /**
   * Obtém o diretório de origem padrão
   * @returns {string}
   */
  getDefaultSourceDir() {
    return this.defaultSourceDir;
  }

  /**
   * Obtém o diretório de destino padrão
   * @returns {string}
   */
  getDefaultDestDir() {
    return this.defaultDestDir;
  }
}

// Singleton
const configManager = new ConfigManager();

module.exports = configManager;
