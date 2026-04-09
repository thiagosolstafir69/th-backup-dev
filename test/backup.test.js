const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { spawnSync } = require('node:child_process');

const configManager = require('../src/config');
const { createBackup } = require('../src/backup');
const { DirectoryNotFoundError } = require('../src/errors/BackupError');
const { sanitizeFilename, validateAndNormalizePath } = require('../src/utils/pathUtils');
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
    const backupPath = await createBackup((message) => {
      progressMessages.push(message);
    }, sourceDir, destDir, false);

    const archiveEntries = listZipEntries(backupPath);
    const destFiles = await fs.readdir(destDir);

    assert.match(path.basename(backupPath), /^backup-developer-.*\.zip$/);
    assert.equal(destFiles.some((name) => name.endsWith('.partial.zip')), false);
    assert.equal(archiveEntries.includes('src/app.js'), true);
    assert.equal(archiveEntries.includes('src/nested/notes.txt'), true);
    assert.equal(archiveEntries.includes('src/app-link.js'), true);
    assert.equal(archiveEntries.includes('node_modules/left-pad/index.js'), false);
    assert.equal(archiveEntries.includes('dist/bundle.js'), false);
    assert.equal(archiveEntries.includes('build/artifact.txt'), false);
    assert.equal(
      archiveEntries.filter((entry) => entry.startsWith('many/file-')).length,
      80
    );
    assert.equal(
      progressMessages.some((message) =>
        typeof message.text === 'string' &&
        message.text.includes('Iniciando compactação')
      ),
      true
    );

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

test('utilitários formatam e sanitizam valores esperados', () => {
  const absolutePath = path.join(os.tmpdir(), 'backup-dev-utils');

  assert.equal(sanitizeFilename('backup:dev?.zip'), 'backup_dev_.zip');
  assert.equal(validateAndNormalizePath(absolutePath), absolutePath);
  assert.throws(() => validateAndNormalizePath(''), /Caminho inválido/);
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(pad(7), '07');
});
