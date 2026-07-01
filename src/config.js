const path = require('path');
const os = require('os');
const { DEFAULT_IGNORED_DIRS } = require('./constants');

const DEFAULT_SCHEDULE = {
  enabled: false,
  frequency: 'daily',
  time: '18:00',
  weekday: 1,
  profileId: null,
  lastRunKey: null
};

/**
 * Gerenciador de configuração da aplicação
 * Permite armazenar e recuperar configurações do usuário
 */
class ConfigManager {
  constructor() {
    this.configPath = path.join(os.homedir(), '.backup-developer-config.json');
    this.defaultSourceDir = null;
    this.defaultDestDir = null;
    this.defaultConfig = {
      sourceDir: this.defaultSourceDir,
      destDir: this.defaultDestDir,
      ignoredDirs: [...DEFAULT_IGNORED_DIRS],
      history: [],
      profiles: [],
      activeProfileId: null,
      schedule: { ...DEFAULT_SCHEDULE },
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
        this.config = this.normalizeConfig({ ...this.defaultConfig, ...data });
      } else {
        this.config = this.normalizeConfig({ ...this.defaultConfig });
      }
    } catch (error) {
      console.warn('Erro ao carregar configuração, usando padrões:', error.message);
      this.config = this.normalizeConfig({ ...this.defaultConfig });
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
    this.config = this.normalizeConfig({ ...this.config, ...newConfig });
    await fs.writeJson(this.configPath, this.config, { spaces: 2 });
  }

  normalizeDirs(dirs) {
    if (!Array.isArray(dirs)) {
      return [...DEFAULT_IGNORED_DIRS];
    }

    return [
      ...new Set(
        dirs
          .map((dir) => (typeof dir === 'string' ? dir.trim() : ''))
          .filter(Boolean)
          .map((dir) => path.basename(dir))
      )
    ];
  }

  normalizeProfile(profile, fallback = {}) {
    const id = profile.id || fallback.id || `profile-${Date.now()}`;
    return {
      id,
      name: profile.name || fallback.name || 'Principal',
      sourceDir: profile.sourceDir || fallback.sourceDir || null,
      destDir: profile.destDir || fallback.destDir || null,
      ignoredDirs: this.normalizeDirs(profile.ignoredDirs || fallback.ignoredDirs),
      compressionLevel:
        typeof profile.compressionLevel === 'number'
          ? profile.compressionLevel
          : fallback.compressionLevel ?? 1,
      includeXampp: Boolean(profile.includeXampp || fallback.includeXampp)
    };
  }

  normalizeSchedule(schedule = {}) {
    const normalized = { ...DEFAULT_SCHEDULE, ...schedule };
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

    if (!['daily', 'weekly'].includes(normalized.frequency)) {
      normalized.frequency = DEFAULT_SCHEDULE.frequency;
    }
    if (!timePattern.test(normalized.time)) {
      normalized.time = DEFAULT_SCHEDULE.time;
    }
    normalized.weekday = Number(normalized.weekday);
    if (!Number.isInteger(normalized.weekday) || normalized.weekday < 0 || normalized.weekday > 6) {
      normalized.weekday = DEFAULT_SCHEDULE.weekday;
    }
    normalized.enabled = Boolean(normalized.enabled);
    normalized.profileId = normalized.profileId || null;
    normalized.lastRunKey = normalized.lastRunKey || null;

    return normalized;
  }

  normalizeConfig(config) {
    const profiles = Array.isArray(config.profiles)
      ? config.profiles.map((profile) => this.normalizeProfile(profile))
      : [];

    if (profiles.length === 0 && (config.sourceDir || config.destDir)) {
      profiles.push(
        this.normalizeProfile({
          id: 'default',
          name: 'Principal',
          sourceDir: config.sourceDir || null,
          destDir: config.destDir || null,
          ignoredDirs: config.ignoredDirs || DEFAULT_IGNORED_DIRS,
          compressionLevel: config.compressionLevel,
          includeXampp: config.includeXampp
        })
      );
    }

    const activeProfileId =
      profiles.some((profile) => profile.id === config.activeProfileId)
        ? config.activeProfileId
        : profiles[0]?.id || null;
    const activeProfile = profiles.find((profile) => profile.id === activeProfileId);

    return {
      ...config,
      sourceDir: activeProfile?.sourceDir || config.sourceDir || null,
      destDir: activeProfile?.destDir || config.destDir || null,
      ignoredDirs: activeProfile?.ignoredDirs || this.normalizeDirs(config.ignoredDirs),
      compressionLevel:
        typeof activeProfile?.compressionLevel === 'number'
          ? activeProfile.compressionLevel
          : config.compressionLevel ?? 1,
      includeXampp: Boolean(activeProfile?.includeXampp || config.includeXampp),
      profiles,
      activeProfileId,
      schedule: this.normalizeSchedule(config.schedule)
    };
  }

  /**
   * Obtém o diretório de origem configurado ou padrão
   * @returns {Promise<string>}
   */
  async getSourceDir() {
    const config = await this.load();
    return config.sourceDir || null;
  }

  /**
   * Obtém o diretório de destino configurado ou padrão
   * @returns {Promise<string>}
   */
  async getDestDir() {
    const config = await this.load();
    return config.destDir || null;
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
    await this.updateActiveProfile({ sourceDir: dir });
  }

  /**
   * Define o diretório de destino
   * @param {string} dir - Caminho do diretório
   * @returns {Promise<void>}
   */
  async setDestDir(dir) {
    await this.updateActiveProfile({ destDir: dir });
  }

  /**
   * Define os diretórios ignorados
   * @param {string[]} dirs - Lista de nomes de diretórios
   * @returns {Promise<void>}
   */
  async setIgnoredDirs(dirs) {
    await this.updateActiveProfile({ ignoredDirs: this.normalizeDirs(dirs) });
  }

  async getProfiles() {
    const config = await this.load();
    return config.profiles || [];
  }

  async getActiveProfile() {
    const config = await this.load();
    return config.profiles.find((profile) => profile.id === config.activeProfileId) || null;
  }

  async setActiveProfile(profileId) {
    const config = await this.load();
    const profile = config.profiles.find((item) => item.id === profileId);
    if (!profile) {
      throw new Error('Perfil não encontrado.');
    }
    await this.save({
      activeProfileId: profile.id,
      sourceDir: profile.sourceDir,
      destDir: profile.destDir,
      ignoredDirs: profile.ignoredDirs,
      compressionLevel: profile.compressionLevel,
      includeXampp: profile.includeXampp
    });
  }

  async saveProfile(profile) {
    const config = await this.load();
    const id = profile.id || `profile-${Date.now()}`;
    const normalizedProfile = this.normalizeProfile({ ...profile, id });
    const profiles = config.profiles.filter((item) => item.id !== id);
    profiles.push(normalizedProfile);
    await this.save({
      profiles,
      activeProfileId: normalizedProfile.id,
      sourceDir: normalizedProfile.sourceDir,
      destDir: normalizedProfile.destDir,
      ignoredDirs: normalizedProfile.ignoredDirs,
      compressionLevel: normalizedProfile.compressionLevel,
      includeXampp: normalizedProfile.includeXampp
    });
    return normalizedProfile;
  }

  async deleteProfile(profileId) {
    const config = await this.load();
    const profiles = config.profiles.filter((profile) => profile.id !== profileId);
    const activeProfileId =
      config.activeProfileId === profileId ? profiles[0]?.id || null : config.activeProfileId;
    const activeProfile = profiles.find((profile) => profile.id === activeProfileId);

    await this.save({
      profiles,
      activeProfileId,
      sourceDir: activeProfile?.sourceDir || null,
      destDir: activeProfile?.destDir || null,
      ignoredDirs: activeProfile?.ignoredDirs || [...DEFAULT_IGNORED_DIRS],
      compressionLevel: activeProfile?.compressionLevel ?? 1,
      includeXampp: activeProfile?.includeXampp || false
    });
  }

  async updateActiveProfile(changes) {
    const config = await this.load();
    let profiles = config.profiles || [];
    let activeProfileId = config.activeProfileId;

    if (!activeProfileId) {
      const profile = this.normalizeProfile({
        id: 'default',
        name: 'Principal',
        sourceDir: config.sourceDir,
        destDir: config.destDir,
        ignoredDirs: config.ignoredDirs,
        compressionLevel: config.compressionLevel,
        includeXampp: config.includeXampp
      });
      profiles = [profile];
      activeProfileId = profile.id;
    }

    profiles = profiles.map((profile) =>
      profile.id === activeProfileId ? this.normalizeProfile({ ...profile, ...changes }) : profile
    );

    const activeProfile = profiles.find((profile) => profile.id === activeProfileId);
    await this.save({
      profiles,
      activeProfileId,
      sourceDir: activeProfile?.sourceDir || null,
      destDir: activeProfile?.destDir || null,
      ignoredDirs: activeProfile?.ignoredDirs || [...DEFAULT_IGNORED_DIRS],
      compressionLevel: activeProfile?.compressionLevel ?? 1,
      includeXampp: activeProfile?.includeXampp || false
    });
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
    if (!['auto', 'light', 'dark'].includes(theme)) {
      throw new Error('Tema inválido.');
    }
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
    const normalizedLevel = Number(level);
    if (!Number.isInteger(normalizedLevel) || normalizedLevel < 0 || normalizedLevel > 9) {
      throw new Error('O nível de compactação deve ser um número inteiro entre 0 e 9.');
    }

    await this.updateActiveProfile({ compressionLevel: normalizedLevel });
  }

  async setIncludeXampp(includeXampp) {
    await this.updateActiveProfile({ includeXampp: Boolean(includeXampp) });
  }

  async getSchedule() {
    const config = await this.load();
    return this.normalizeSchedule(config.schedule);
  }

  async setSchedule(schedule) {
    const normalizedSchedule = this.normalizeSchedule(schedule);
    await this.save({ schedule: normalizedSchedule });
    return normalizedSchedule;
  }

  async setScheduleLastRunKey(lastRunKey) {
    const schedule = await this.getSchedule();
    await this.save({ schedule: { ...schedule, lastRunKey } });
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
