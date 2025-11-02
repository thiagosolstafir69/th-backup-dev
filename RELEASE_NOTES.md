# Release Notes v1.0.4

## 🛠️ Correções e Melhorias Importantes

### 🔧 O que mudou nesta versão

- ✅ **Pausa corrigida**: Agora a pausa funciona durante todo o processo, inclusive na compactação
- ✅ **Botão de cancelar**: Novo botão vermelho para cancelar o backup completamente
- ✅ **Cancelamento efetivo**: Para imediatamente todo o processo de backup
- ✅ **Limpeza de recursos**: Remove arquivos temporários ao cancelar
- ✅ **Verificação contínua**: Sistema verifica pausa e cancelamento periodicamente
- ✅ **Mensagens claras**: Exibe "❌ Backup cancelado" quando cancelado

### 🆕 Novo Botão de Cancelar

- **Cor vermelha** para fácil identificação
- **Para completamente** o backup em andamento
- **Limpa recursos** e arquivos temporários
- Aparece junto com o botão de pausar durante o backup

### 📋 Todas as funcionalidades

- Seleção de pasta de origem para backup
- Seleção de destino para salvar o backup
- **Pausar e continuar backup em andamento** (CORRIGIDO)
- **Cancelar backup a qualquer momento** ⭐ NOVO
- Compactação automática em formato ZIP
- Interface gráfica simples e intuitiva (700x670 pixels)
- Suporte para macOS (Apple Silicon e Intel)

### 📦 Como instalar

1. Baixe o arquivo `BackupDeveloper-1.0.4.dmg`
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

- `BackupDeveloper-1.0.4.dmg` (107 MB) - Instalador para macOS

---

### 🔄 Atualizando de versões anteriores

Se você já tem uma versão anterior instalada, basta:
1. Baixar o novo DMG
2. Arrastar para Applications (substituir quando solicitado)
3. Pronto!

### 🐛 Correções da v1.0.3

- Corrigido: Backup continuava mesmo quando pausado
- Corrigido: Não havia como cancelar o backup uma vez iniciado
- Adicionado: Verificação de pausa durante a compactação ZIP
- Adicionado: Sistema de cancelamento com limpeza de recursos
