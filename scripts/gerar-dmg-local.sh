#!/bin/bash

# Script para gerar DMG localmente
# Limpa versões antigas e gera nova versão

set -e

echo "🧹 Limpando builds antigos..."

# Remove arquivos antigos do diretório dist, mas mantém a estrutura
rm -rf dist/*.dmg dist/*.blockmap dist/mac-arm64 2>/dev/null || true

# Remove diretório temporário se existir
rm -rf dist-new 2>/dev/null || true

echo "📦 Gerando novo DMG..."

# Temporariamente muda o diretório de saída para evitar problemas de permissão
# com a pasta dist antiga
TEMP_OUTPUT="dist-new"
ORIGINAL_OUTPUT="dist"

# Backup do package.json
cp package.json package.json.backup

# Modifica temporariamente o package.json para usar diretório temporário
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.build.directories.output = '${TEMP_OUTPUT}';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"

# Função para restaurar package.json em caso de erro
restore_package() {
  if [ -f package.json.backup ]; then
    mv package.json.backup package.json
  fi
}

# Garante que o package.json será restaurado mesmo em caso de erro
trap restore_package EXIT

# Executa o build
npm run build:mac

# Restaura o package.json original
if [ -f package.json.backup ]; then
  mv package.json.backup package.json
fi

# Remove o trap já que restaurou manualmente
trap - EXIT

# Move o arquivo gerado para dist
if [ -f "${TEMP_OUTPUT}/BackupDeveloper-"*.dmg ]; then
  mv "${TEMP_OUTPUT}/BackupDeveloper-"*.dmg dist/ 2>/dev/null || cp "${TEMP_OUTPUT}/BackupDeveloper-"*.dmg dist/
  echo "✅ DMG gerado com sucesso!"
  ls -lh dist/*.dmg
else
  echo "❌ Erro: DMG não foi gerado"
  exit 1
fi

# Limpa arquivos temporários
rm -rf "${TEMP_OUTPUT}" 2>/dev/null || true

echo "✨ Concluído!"

