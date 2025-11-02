# Backup Developer

Aplicação Electron para facilitar o backup de arquivos e projetos de desenvolvedores.

## 📋 Descrição

O **Backup Developer** é uma aplicação desktop desenvolvida em Electron que permite fazer backup de pastas e arquivos de forma simples e intuitiva. Ideal para desenvolvedores que precisam fazer backups rápidos de seus projetos.

## 🚀 Funcionalidades

- ✅ Seleção de pasta de origem para backup
- ✅ Seleção de destino para salvar o backup
- ✅ Compactação automática em formato ZIP
- ✅ **Pausar e continuar backup em andamento**
- ✅ Interface gráfica simples e intuitiva
- ✅ Suporte para Mac (ARM64 e Intel)

## 📦 Pré-requisitos

Antes de começar, certifique-se de ter instalado:

- **Node.js** (versão 16 ou superior)
- **npm** (geralmente vem com o Node.js)
- **Git**

## 🔧 Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/thiagosolstafir69/backup-dev.git
cd backup-dev
```

### 2. Instale as dependências

```bash
npm install
```

## 🎯 Como usar

### Executar em modo de desenvolvimento

Para testar a aplicação sem gerar o instalador:

```bash
npm start
```

### Gerar o arquivo DMG para instalação

Para criar o arquivo `.dmg` que pode ser distribuído e instalado no macOS:

```bash
npm run build:mac
```

O arquivo DMG será gerado na pasta `dist/` com o nome `BackupDeveloper-1.0.0.dmg`.

## 📂 Estrutura do Projeto

```
backup-dev/
├── src/
│   └── backup.js          # Lógica de backup e compactação
├── index.html             # Interface da aplicação
├── main.js                # Processo principal do Electron
├── preload.js             # Script de pré-carregamento
├── renderer.js            # Processo de renderização
├── package.json           # Configurações e dependências
└── README.md              # Documentação
```

## 🛠️ Tecnologias Utilizadas

- **Electron** - Framework para criar aplicações desktop
- **Node.js** - Ambiente de execução JavaScript
- **Archiver** - Biblioteca para compactação de arquivos
- **fs-extra** - Operações de sistema de arquivos aprimoradas

## 📥 Download da Aplicação

Você pode baixar a versão mais recente do aplicativo diretamente das [Releases do GitHub](https://github.com/thiagosolstafir69/backup-dev/releases).

**Link direto:** [Baixar BackupDeveloper-1.0.3.dmg](https://github.com/thiagosolstafir69/backup-dev/releases/download/v1.0.3/BackupDeveloper-1.0.3.dmg)

## 📱 Instalando o DMG

1. Baixe o arquivo `BackupDeveloper-1.0.3.dmg` das Releases
2. Abra o arquivo DMG
3. Arraste o app **Backup Developer** para a pasta Applications
4. Na primeira execução, vá em **Configurações do Sistema** → **Privacidade e Segurança**
5. Clique em **Abrir mesmo assim** (pois o app não está assinado digitalmente)

## 🔐 Nota sobre Segurança

O aplicativo não está assinado digitalmente com um certificado de desenvolvedor Apple. Isso é normal para aplicações em desenvolvimento. Se você deseja distribuir a aplicação publicamente, será necessário:

1. Obter um certificado de desenvolvedor Apple
2. Assinar o aplicativo com o certificado
3. Notarizar o aplicativo com a Apple

## 📝 Scripts Disponíveis

- `npm start` - Executa a aplicação em modo de desenvolvimento
- `npm run build:mac` - Gera o arquivo DMG para macOS

## 🤝 Como Contribuir

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'feat: Adiciona MinhaFeature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença ISC.

## 👤 Autor

Thiago

## 🐛 Problemas Conhecidos

- O aplicativo não está assinado digitalmente, então o macOS pode exibir um aviso de segurança na primeira execução
- Atualmente suporta apenas macOS

## 🔮 Próximas Melhorias

- [ ] Suporte para Windows
- [ ] Suporte para Linux
- [ ] Opção de escolher formato de compactação (ZIP, TAR, etc.)
- [ ] Histórico de backups realizados
- [ ] Agendamento automático de backups
- [ ] Exclusão de pastas específicas (node_modules, .git, etc.)

---

⭐ Se este projeto foi útil para você, considere dar uma estrela no repositório!

