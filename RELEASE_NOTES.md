# Release Notes v1.0.3

## 🎯 Nova Funcionalidade: Pausar e Continuar Backup

### 🔧 O que mudou nesta versão

- ✅ **Controle de pausa**: Agora você pode pausar o backup em andamento
- ✅ **Continuar de onde parou**: Retome o backup pausado sem perder o progresso
- ✅ **Indicador visual**: Botão muda de cor (laranja = pausar, verde = continuar)
- ✅ **Mensagens claras**: Exibe "⏸️ Backup pausado" e "▶️ Backup retomado"

### 📋 Todas as funcionalidades

- Seleção de pasta de origem para backup
- Seleção de destino para salvar o backup
- **Pausar e continuar backup em andamento** ⭐ NOVO
- Compactação automática em formato ZIP
- Interface gráfica simples e intuitiva (700x670 pixels)
- Suporte para macOS (Apple Silicon e Intel)

### 📦 Como instalar

1. Baixe o arquivo `BackupDeveloper-1.0.3.dmg`
2. Abra o arquivo DMG
3. Arraste o app para a pasta Applications
4. Na primeira execução, vá em **Configurações do Sistema** → **Privacidade e Segurança** → **Abrir mesmo assim**

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

- `BackupDeveloper-1.0.3.dmg` (107 MB) - Instalador para macOS

---

### 🔄 Atualizando de versões anteriores

Se você já tem uma versão anterior instalada, basta:
1. Baixar o novo DMG
2. Arrastar para Applications (substituir quando solicitado)
3. Pronto!

