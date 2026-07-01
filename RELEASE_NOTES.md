# Release Notes

## v1.2.2

- Corrige o erro ao revelar backups antigos que ja foram removidos pela regra de manter apenas um arquivo.
- O historico remove entradas cujo arquivo fisico nao existe mais.
- Se o ZIP antigo sumiu mas a pasta de destino existe, o app abre a pasta e mostra uma mensagem informativa.

## v1.2.1

- Mantem apenas o backup mais recente em cada pasta de destino.
- Remove automaticamente ZIPs antigos `backup-developer-*.zip` depois que o backup novo termina.
- O backup antigo so e removido apos sucesso do novo backup; falhas e cancelamentos preservam o arquivo anterior.
- Historico passa a manter apenas a entrada mais recente por destino.

## v1.2.0

- Perfis de backup com origem, destino, filtros, compactacao e XAMPP por perfil.
- Backup programado diario ou semanal enquanto o app estiver aberto.
- Presets de exclusao para Node.js, PHP/XAMPP, Python, Mobile e macOS.
- Previa mais rica antes da execucao, com alerta para destino sincronizado na nuvem.
- Historico com busca, perfil, tipo de execucao, duracao, abrir arquivo, revelar e copiar caminho.
- Exportacao de relatorio JSON com historico, eventos da sessao e ultima previa.
- Remocao completa da atualizacao automatica/manual.
- Guia de distribuicao macOS em `docs/MAC_DISTRIBUTION.md`.

# Release Notes v1.0.6

## 🚀 Nova Funcionalidade: Ignora node_modules Automaticamente

### 🔧 O que mudou nesta versão

- ✅ **Ignora node_modules**: Pastas `node_modules` não são mais incluídas no backup
- ✅ **Backup mais rápido**: Sem escanear milhares de arquivos desnecessários
- ✅ **Arquivo menor**: ZIP final muito menor sem dependências do Node
- ✅ **Configurável**: Sistema preparado para ignorar outras pastas no futuro

### 💡 Por que isso é importante?

**Antes (v1.0.5)**:

- ❌ Backup incluía todas as pastas `node_modules`
- ❌ Milhares de arquivos desnecessários
- ❌ Backup muito lento
- ❌ Arquivo ZIP gigante

**Agora (v1.0.6)**:

- ✅ Ignora automaticamente `node_modules`
- ✅ Backup muito mais rápido
- ✅ Arquivo ZIP até 90% menor
- ✅ Apenas código-fonte é salvo

### 📋 Todas as funcionalidades

- Seleção de pasta de origem para backup
- Seleção de destino para salvar o backup
- **Ignora automaticamente node_modules** ⭐ NOVO
- Pausar e continuar backup em andamento
- Cancelar backup a qualquer momento
- Compactação automática em formato ZIP
- Interface gráfica simples e intuitiva (700x670 pixels)
- Suporte para macOS (Apple Silicon e Intel)

### 📦 Como instalar

1. Baixe o arquivo `BackupDeveloper-1.0.6.dmg`
2. Abra o arquivo DMG
3. Arraste o app para a pasta Applications
4. Na primeira execução, vá em **Configurações do Sistema** → **Privacidade e Segurança** → **Abrir mesmo assim**

### 🎮 Como usar os controles

- **Botão azul "Executar backup"**: Inicia o processo de backup
- **Botão laranja "Pausar"**: Pausa o backup (muda para verde "Continuar")
- **Botão verde "Continuar"**: Retoma o backup de onde parou
- **Botão vermelho "Cancelar"**: Cancela completamente o backup

### 🖥️ Compatibilidade

- macOS 10.13 ou superior
- Funciona em Apple Silicon (M1/M2/M3) e processadores Intel

### 🛠️ Tecnologias

- Electron 39.0.0
- Node.js
- Archiver (compactação ZIP)
- fs-extra (operações de arquivos)

---

⚠️ **Nota de Segurança**: O aplicativo não está assinado digitalmente com certificado de desenvolvedor Apple. Na primeira execução, o macOS exibirá um aviso de segurança. Você pode autorizar a execução em **Configurações do Sistema** → **Privacidade e Segurança**.

---

### 📝 Arquivo disponível para download

- `BackupDeveloper-1.0.6.dmg` (107 MB) - Instalador para macOS

---

### 🔄 Atualizando de versões anteriores

Se você já tem uma versão anterior instalada, basta:

1. Baixar o novo DMG
2. Arrastar para Applications (substituir quando solicitado)
3. Pronto!

### 📊 Histórico de versões

**v1.0.6** - Nova funcionalidade: Ignora node_modules automaticamente  
**v1.0.5** - Correção: Cancelamento agora funciona corretamente  
**v1.0.4** - Adiciona botão de cancelar e corrige pausa  
**v1.0.3** - Adiciona pausa e continuar  
**v1.0.2** - Aumenta altura da janela  
**v1.0.1** - Aumenta tamanho da janela  
**v1.0.0** - Versão inicial

### 🎯 Benefícios da v1.0.6

| Aspecto             | Antes       | Agora                     |
| ------------------- | ----------- | ------------------------- |
| Velocidade          | Lento       | **Muito mais rápido** ⚡  |
| Tamanho do ZIP      | Gigante     | **Até 90% menor** 📦      |
| Arquivos escaneados | Todos       | **Apenas necessários** ✅ |
| node_modules        | ✅ Incluído | ❌ **Ignorado** 🎉        |
