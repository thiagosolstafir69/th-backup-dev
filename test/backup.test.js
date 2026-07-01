const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { spawnSync } = require('node:child_process');

const configManager = require('../src/config');
const { createBackup, previewBackup } = require('../src/backup');
const { DirectoryNotFoundError, InvalidConfigError } = require('../src/errors/BackupError');
const {
  isSameOrInsidePath,
  sanitizeFilename,
  validateAndNormalizePath
} = require('../src/utils/pathUtils');
const { formatBytes } = require('../src/utils/formatUtils');
const { pad } = require('../src/utils/dateUtils');

const DEFAULT_IGNORED_DIRS = ['node_modules', 'dist', 'build', '.DS_Store'];

const makeTempDir = async (prefix) => {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
};

const listZipEntries = (zipPath) => {
  const result = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || 'Falha ao listar ZIP');
  return result.stdout
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const withMockedConfig = async (fn) => {
  const originalLoad = configManager.load;
  const originalGetIgnoredDirs = configManager.getIgnoredDirs;

  configManager.load = async () => ({
    sourceDir: null,
    destDir: null,
    ignoredDirs: [...DEFAULT_IGNORED_DIRS]
  });
  configManager.getIgnoredDirs = async () => new Set(DEFAULT_IGNORED_DIRS);

  try {
    await fn();
  } finally {
    configManager.load = originalLoad;
    configManager.getIgnoredDirs = originalGetIgnoredDirs;
    configManager.config = null;
  }
};

const withTempConfigPath = async (fn) => {
  const originalConfigPath = configManager.configPath;
  const originalConfig = configManager.config;
  const workspaceDir = await makeTempDir('backup-dev-config-');

  configManager.configPath = path.join(workspaceDir, 'config.json');
  configManager.config = null;

  try {
    await fn();
  } finally {
    configManager.configPath = originalConfigPath;
    configManager.config = originalConfig;
    await fs.rm(workspaceDir, { recursive: true, force: true });
  }
};

test('createBackup gera ZIP, ignora diretórios configurados e remove arquivo parcial', async () => {
  await withMockedConfig(async () => {
    const workspaceDir = await makeTempDir('backup-dev-test-');
    const sourceDir = path.join(workspaceDir, 'source');
    const destDir = path.join(workspaceDir, 'dest', 'nested');

    await fs.mkdir(path.join(sourceDir, 'src', 'nested'), { recursive: true });
    await fs.mkdir(path.join(sourceDir, 'node_modules', 'left-pad'), { recursive: true });
    await fs.mkdir(path.join(sourceDir, 'dist'), { recursive: true });
    await fs.mkdir(path.join(sourceDir, 'build'), { recursive: true });
    await fs.mkdir(path.join(sourceDir, 'many'), { recursive: true });

    await fs.writeFile(path.join(sourceDir, 'src', 'app.js'), 'console.log("ok");\n');
    await fs.writeFile(path.join(sourceDir, 'src', 'nested', 'notes.txt'), 'backup content\n');
    await fs.writeFile(path.join(sourceDir, 'node_modules', 'left-pad', 'index.js'), 'ignored\n');
    await fs.writeFile(path.join(sourceDir, 'dist', 'bundle.js'), 'ignored dist\n');
    await fs.writeFile(path.join(sourceDir, 'build', 'artifact.txt'), 'ignored build\n');

    for (let index = 0; index < 80; index += 1) {
      await fs.writeFile(path.join(sourceDir, 'many', `file-${index}.txt`), `content-${index}\n`);
    }

    await fs.symlink(
      path.join(sourceDir, 'src', 'app.js'),
      path.join(sourceDir, 'src', 'app-link.js')
    );

    const progressMessages = [];
    const backupPath = await createBackup(
      (message) => {
        progressMessages.push(message);
      },
      sourceDir,
      destDir,
      false
    );

    const archiveEntries = listZipEntries(backupPath);
    const destFiles = await fs.readdir(destDir);

    assert.match(path.basename(backupPath), /^backup-developer-.*\.zip$/);
    assert.equal(
      destFiles.some((name) => name.endsWith('.partial.zip')),
      false
    );
    assert.equal(archiveEntries.includes('src/app.js'), true);
    assert.equal(archiveEntries.includes('src/nested/notes.txt'), true);
    assert.equal(archiveEntries.includes('src/app-link.js'), true);
    assert.equal(archiveEntries.includes('node_modules/left-pad/index.js'), false);
    assert.equal(archiveEntries.includes('dist/bundle.js'), false);
    assert.equal(archiveEntries.includes('build/artifact.txt'), false);
    assert.equal(archiveEntries.filter((entry) => entry.startsWith('many/file-')).length, 80);
    assert.equal(
      progressMessages.some(
        (message) =>
          typeof message.text === 'string' && message.text.includes('Iniciando compactação')
      ),
      true
    );

    await fs.rm(workspaceDir, { recursive: true, force: true });
  });
});

test('createBackup suporta pastas com muitos arquivos sem estourar a pilha', async () => {
  await withMockedConfig(async () => {
    const workspaceDir = await makeTempDir('backup-dev-large-');
    const sourceDir = path.join(workspaceDir, 'source');
    const destDir = path.join(workspaceDir, 'dest');
    const manyDir = path.join(sourceDir, 'many');

    await fs.mkdir(manyDir, { recursive: true });

    const fileCount = 15000;
    for (let index = 0; index < fileCount; index += 1) {
      await fs.writeFile(path.join(manyDir, `file-${index}.txt`), `content-${index}\n`);
    }

    const backupPath = await createBackup(() => {}, sourceDir, destDir, false);
    const archiveEntries = listZipEntries(backupPath);

    assert.equal(archiveEntries.filter((entry) => entry.startsWith('many/file-')).length, fileCount);

    await fs.rm(workspaceDir, { recursive: true, force: true });
  });
});

test('createBackup lança erro quando o diretório de origem não existe', async () => {
  await withMockedConfig(async () => {
    const workspaceDir = await makeTempDir('backup-dev-missing-source-');
    const sourceDir = path.join(workspaceDir, 'missing-source');
    const destDir = path.join(workspaceDir, 'dest');

    await assert.rejects(
      () => createBackup(() => {}, sourceDir, destDir, false),
      (error) => {
        assert.equal(error instanceof DirectoryNotFoundError, true);
        assert.equal(error.path, sourceDir);
        return true;
      }
    );

    await fs.rm(workspaceDir, { recursive: true, force: true });
  });
});

test('createBackup bloqueia destino dentro da origem', async () => {
  await withMockedConfig(async () => {
    const workspaceDir = await makeTempDir('backup-dev-dest-inside-source-');
    const sourceDir = path.join(workspaceDir, 'source');
    const destDir = path.join(sourceDir, 'backups');

    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'app.js'), 'console.log("ok");\n');

    await assert.rejects(
      () => createBackup(() => {}, sourceDir, destDir, false),
      (error) => {
        assert.equal(error instanceof InvalidConfigError, true);
        assert.match(error.message, /destino não pode/);
        return true;
      }
    );

    await fs.rm(workspaceDir, { recursive: true, force: true });
  });
});

test('createBackup remove backups antigos do mesmo destino', async () => {
  await withMockedConfig(async () => {
    const workspaceDir = await makeTempDir('backup-dev-retention-');
    const sourceDir = path.join(workspaceDir, 'source');
    const destDir = path.join(workspaceDir, 'dest');

    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'app.js'), 'console.log("ok");\n');
    await fs.writeFile(path.join(destDir, 'backup-developer-old.zip'), 'old backup\n');
    await fs.writeFile(path.join(destDir, 'backup-developer-older.zip'), 'older backup\n');
    await fs.writeFile(path.join(destDir, 'manual-file.zip'), 'unrelated\n');

    const progressMessages = [];
    const backupPath = await createBackup(
      (message) => progressMessages.push(message),
      sourceDir,
      destDir,
      false
    );
    const destFiles = await fs.readdir(destDir);
    const appBackupFiles = destFiles.filter(
      (name) => name.startsWith('backup-developer-') && name.endsWith('.zip')
    );

    assert.deepEqual(appBackupFiles, [path.basename(backupPath)]);
    assert.equal(destFiles.includes('manual-file.zip'), true);
    assert.equal(
      progressMessages.some(
        (message) => typeof message.text === 'string' && message.text.includes('antigo')
      ),
      true
    );

    await fs.rm(workspaceDir, { recursive: true, force: true });
  });
});

test('previewBackup retorna resumo antes de compactar', async () => {
  await withMockedConfig(async () => {
    const workspaceDir = await makeTempDir('backup-dev-preview-');
    const sourceDir = path.join(workspaceDir, 'source');
    const destDir = path.join(workspaceDir, 'dest');

    await fs.mkdir(path.join(sourceDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'src', 'app.js'), 'console.log("ok");\n');

    const summary = await previewBackup(() => {}, sourceDir, destDir, false);

    assert.equal(summary.totalFiles, 1);
    assert.equal(summary.totalSize > 0, true);
    assert.equal(summary.sourceDir, sourceDir);
    assert.equal(summary.destDir, destDir);
    assert.deepEqual(summary.skippedEntries, []);

    await fs.rm(workspaceDir, { recursive: true, force: true });
  });
});

test('config valida compactação e normaliza pastas ignoradas', async () => {
  await withTempConfigPath(async () => {
    await assert.rejects(
      () => configManager.setCompressionLevel(10),
      /nível de compactação/
    );
    await configManager.setCompressionLevel(9);
    assert.equal(await configManager.getCompressionLevel(), 9);

    await configManager.setIgnoredDirs(['node_modules', 'dist/', '/tmp/cache', '', 'dist']);
    assert.deepEqual(Array.from(await configManager.getIgnoredDirs()), [
      'node_modules',
      'dist',
      'cache'
    ]);
  });
});

test('config gerencia perfis e agenda de backup', async () => {
  await withTempConfigPath(async () => {
    const workspaceDir = await makeTempDir('backup-dev-profiles-');
    const sourceA = path.join(workspaceDir, 'source-a');
    const sourceB = path.join(workspaceDir, 'source-b');
    const destA = path.join(workspaceDir, 'dest-a');
    const destB = path.join(workspaceDir, 'dest-b');

    const firstProfile = await configManager.saveProfile({
      name: 'Projetos',
      sourceDir: sourceA,
      destDir: destA,
      ignoredDirs: ['node_modules', 'coverage'],
      compressionLevel: 1,
      includeXampp: false
    });
    const secondProfile = await configManager.saveProfile({
      name: 'Clientes',
      sourceDir: sourceB,
      destDir: destB,
      ignoredDirs: ['vendor'],
      compressionLevel: 5,
      includeXampp: true
    });

    await configManager.setActiveProfile(firstProfile.id);
    assert.equal(await configManager.getSourceDir(), sourceA);
    assert.equal(await configManager.getDestDir(), destA);

    await configManager.setActiveProfile(secondProfile.id);
    assert.equal(await configManager.getSourceDir(), sourceB);
    assert.equal(await configManager.getCompressionLevel(), 5);
    assert.equal((await configManager.load()).includeXampp, true);

    const schedule = await configManager.setSchedule({
      enabled: true,
      frequency: 'weekly',
      weekday: 5,
      time: '22:30',
      profileId: secondProfile.id
    });
    assert.equal(schedule.enabled, true);
    assert.equal(schedule.frequency, 'weekly');
    assert.equal(schedule.weekday, 5);
    assert.equal(schedule.time, '22:30');
    assert.equal(schedule.profileId, secondProfile.id);

    await configManager.deleteProfile(secondProfile.id);
    assert.equal((await configManager.getActiveProfile()).id, firstProfile.id);

    await fs.rm(workspaceDir, { recursive: true, force: true });
  });
});

test('config mantém apenas o histórico mais recente por destino', async () => {
  await withTempConfigPath(async () => {
    const destDir = path.join(os.tmpdir(), 'backup-dev-history-dest');

    await configManager.addHistoryEntry({
      id: 'old',
      timestamp: new Date(0).toISOString(),
      destDir,
      path: path.join(destDir, 'backup-developer-old.zip')
    });
    await configManager.addHistoryEntry({
      id: 'new',
      timestamp: new Date().toISOString(),
      destDir,
      path: path.join(destDir, 'backup-developer-new.zip')
    });

    const history = await configManager.getHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].id, 'new');
  });
});

test('config remove entradas de histórico sem arquivo físico', async () => {
  await withTempConfigPath(async () => {
    const workspaceDir = await makeTempDir('backup-dev-history-prune-');
    const existingBackup = path.join(workspaceDir, 'backup-developer-existing.zip');
    const missingBackup = path.join(workspaceDir, 'backup-developer-missing.zip');

    await fs.writeFile(existingBackup, 'backup\n');
    await configManager.save({
      history: [
        {
          id: 'existing',
          destDir: workspaceDir,
          path: existingBackup
        },
        {
          id: 'missing',
          destDir: workspaceDir,
          path: missingBackup
        }
      ]
    });

    const history = await configManager.pruneMissingHistoryEntries();

    assert.equal(history.length, 1);
    assert.equal(history[0].id, 'existing');

    await fs.rm(workspaceDir, { recursive: true, force: true });
  });
});

test('utilitários formatam e sanitizam valores esperados', () => {
  const absolutePath = path.join(os.tmpdir(), 'backup-dev-utils');

  assert.equal(sanitizeFilename('backup:dev?.zip'), 'backup_dev_.zip');
  assert.equal(validateAndNormalizePath(absolutePath), absolutePath);
  assert.throws(() => validateAndNormalizePath(''), /Caminho inválido/);
  assert.equal(isSameOrInsidePath('/tmp/project', '/tmp/project/backups'), true);
  assert.equal(isSameOrInsidePath('/tmp/project', '/tmp/project'), true);
  assert.equal(isSameOrInsidePath('/tmp/project', '/tmp/project-other'), false);
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(pad(7), '07');
});
