const https = require('https');
const { app } = require('electron');

const OWNER = 'thiagosolstafir69';
const REPO = 'th-backup-dev';
const CURRENT_VERSION = app.getVersion();

/**
 * Compara duas versões semânticas
 * @param {string} v1 - Versão 1
 * @param {string} v2 - Versão 2
 * @returns {number} -1 se v1 < v2, 0 se v1 === v2, 1 se v1 > v2
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 < part2) {
      return -1;
    }
    if (part1 > part2) {
      return 1;
    }
  }

  return 0;
}

/**
 * Busca a última release do GitHub usando a API pública
 * @returns {Promise<Object|null>} Informações da release ou null
 */
function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${OWNER}/${REPO}/releases/latest`,
      method: 'GET',
      headers: {
        'User-Agent': 'Backup-Developer-Updater',
        Accept: 'application/vnd.github.v3+json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const release = JSON.parse(data);
            resolve({
              version: release.tag_name.replace(/^v/, ''),
              name: release.name,
              body: release.body,
              publishedAt: release.published_at,
              downloadUrl: release.assets.find((asset) => asset.name.endsWith('.dmg'))
                ?.browser_download_url
            });
          } catch (error) {
            reject(new Error('Erro ao processar resposta da API'));
          }
        } else if (res.statusCode === 404) {
          // Repositório privado ou release não encontrada
          // Retorna null silenciosamente - não é um erro crítico
          console.log(
            'Release não encontrada (404) - repositório pode ser privado ou sem releases públicas'
          );
          resolve(null);
        } else if (res.statusCode === 403) {
          // Rate limit ou acesso negado (repositório privado)
          console.log('Acesso negado (403) - pode ser rate limit ou repositório privado');
          resolve(null);
        } else {
          console.log(`Erro HTTP ${res.statusCode}: ${res.statusMessage}`);
          reject(new Error(`Erro HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Timeout ao verificar atualizações'));
    });

    req.end();
  });
}

/**
 * Verifica se há atualizações disponíveis
 * @param {Function} onStatus - Callback para status da verificação
 * @returns {Promise<Object|null>} Informações da atualização ou null
 */
async function checkForUpdates(onStatus) {
  try {
    if (onStatus) {
      onStatus('checking-for-update');
    }

    const latestRelease = await fetchLatestRelease();

    if (!latestRelease) {
      if (onStatus) {
        onStatus('update-not-available', { version: CURRENT_VERSION });
      }
      return null;
    }

    const hasUpdate = compareVersions(CURRENT_VERSION, latestRelease.version) < 0;

    if (hasUpdate) {
      if (onStatus) {
        onStatus('update-available', {
          version: latestRelease.version,
          releaseDate: latestRelease.publishedAt,
          downloadUrl: latestRelease.downloadUrl
        });
      }
      return latestRelease;
    } else {
      if (onStatus) {
        onStatus('update-not-available', { version: CURRENT_VERSION });
      }
      return null;
    }
  } catch (error) {
    // Para repositórios privados, não mostra erro crítico
    // Apenas loga e retorna null silenciosamente
    console.log(
      'Não foi possível verificar atualizações (repositório pode ser privado):',
      error.message
    );
    if (onStatus) {
      onStatus('update-not-available', { version: CURRENT_VERSION });
    }
    return null;
  }
}

module.exports = {
  checkForUpdates,
  compareVersions,
  CURRENT_VERSION
};
