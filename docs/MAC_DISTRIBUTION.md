# Distribuicao macOS

Este app pode gerar DMG local sem certificado Apple com:

```bash
npm run build:mac
```

Para distribuir publicamente sem alertas fortes do Gatekeeper, use uma conta Apple Developer
e configure assinatura/notarizacao no ambiente antes do build:

```bash
export APPLE_ID="seu-email@icloud.com"
export APPLE_APP_SPECIFIC_PASSWORD="senha-especifica-do-app"
export APPLE_TEAM_ID="TEAMID"
export CSC_LINK="/caminho/certificado.p12"
export CSC_KEY_PASSWORD="senha-do-certificado"
npm run build:mac
```

Notas:

- O certificado deve ser do tipo Developer ID Application.
- A senha precisa ser uma app-specific password do Apple ID.
- Sem essas credenciais, o build local continua usando assinatura ad-hoc.
- O app nao possui atualizacao automatica; a distribuicao recomendada e anexar o DMG em uma
  GitHub Release.
