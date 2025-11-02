# Release Notes v1.0.5

## 🐛 Correção Crítica: Cancelamento Agora Funciona Corretamente

### 🔧 O que foi corrigido nesta versão

- ✅ **Cancelamento efetivo**: Agora quando você cancela, o arquivo ZIP NÃO é gerado
- ✅ **Arquivo não é movido**: O backup cancelado não vai para a pasta de destino
- ✅ **Limpeza automática**: Arquivo temporário é removido automaticamente ao cancelar
- ✅ **Verificação mais rápida**: Checa cancelamento a cada 100ms (antes era 200ms)
- ✅ **Mensagem de limpeza**: Exibe "Arquivo temporário removido" quando cancela

### 🐛 Problema corrigido da v1.0.4

**Antes (v1.0.4)**: 
- ❌ Arquivo ZIP continuava sendo gerado mesmo após cancelar
- ❌ Arquivo era movido para o destino
- ❌ Backup "cancelado" ficava salvo

**Agora (v1.0.5)**:
- ✅ Processo para imediatamente ao cancelar
- ✅ Arquivo temporário é removido
- ✅ Nada é salvo no destino

### 📋 Todas as funcionalidades

- Seleção de pasta de origem para backup
- Seleção de destino para salvar o backup
- Pausar e continuar backup em andamento
- **Cancelar backup a qualquer momento** (CORRIGIDO)
- Compactação automática em formato ZIP
- Interface gráfica simples e intuitiva (700x670 pixels)
- Suporte para macOS (Apple Silicon e Intel)

### 📦 Como instalar

1. Baixe o arquivo `BackupDeveloper-1.0.5.dmg`
2. Abra o arquivo DMG
3. Arraste o app para a pasta Applications
4. Na primeira execução, vá em **Configurações do Sistema** → **Privacidade e Segurança** → **Abrir mesmo assim**

### 🎮 Como usar os controles

- **Botão azul "Executar backup"**: Inicia o processo de backup
- **Botão laranja "Pausar"**: Pausa o backup (muda para verde "Continuar")
- **Botão verde "Continuar"**: Retoma o backup de onde parou
- **Botão vermelho "Cancelar"**: Cancela completamente o backup ✅ AGORA FUNCIONA

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

- `BackupDeveloper-1.0.5.dmg` (107 MB) - Instalador para macOS

---

### 🔄 Atualizando de versões anteriores

Se você já tem uma versão anterior instalada, basta:
1. Baixar o novo DMG
2. Arrastar para Applications (substituir quando solicitado)
3. Pronto!

### 📊 Histórico de correções

**v1.0.5** - Correção: Cancelamento agora funciona corretamente  
**v1.0.4** - Adiciona botão de cancelar e corrige pausa  
**v1.0.3** - Adiciona pausa e continuar  
**v1.0.2** - Aumenta altura da janela  
**v1.0.1** - Aumenta tamanho da janela  
**v1.0.0** - Versão inicial
