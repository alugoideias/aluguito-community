# Aluguito

Assistente portátil para Windows com mascote animado, chat com Gemini, histórico local, memória em Markdown e Pomodoro. O aplicativo também pode consultar Gmail, Google Agenda e servidores MCP após autorização.

## Crie sua versão

O código está sob a [licença MIT](LICENSE). Consulte as [condições de uso da marca e dos recursos visuais](MARCA.md) antes de distribuir uma versão modificada.

Cada instalação usa suas próprias autorizações. Configure sua chave Gemini, sua credencial Google OAuth de desktop e os servidores MCP em Ajustes. Guarde credenciais e arquivos de assinatura fora do repositório. Para distribuir um instalador modificado, use um identificador de aplicativo e um canal de atualização seus.

## Desenvolvimento no Windows

Com Node.js e npm instalados, execute na raiz do projeto:

```powershell
npm ci
npm test
npm start
```

Use `npm run smoke` para conferir a interface com um perfil temporário. `npm run dist` gera o ZIP portátil em `dist/`.

O [guia de uso](LEIA-ME.md) explica como configurar o Gemini, a conta Google e os servidores MCP no aplicativo.

## Instalador para Windows

O instalador é por usuário e conserva o mesmo diretório de dados do portátil. Feche a versão portátil antes de instalar. Ao concluir uma instalação normal, você encontra o Aluguito na Área de Trabalho e no menu Iniciar, e o mascote abre automaticamente. O executável fica em `%LOCALAPPDATA%\Programs\Aluguito\Aluguito.exe`.

| Comando | Pacote |
| --- | --- |
| `npm run dist` | ZIP portátil |
| `npm run dist:installer` | Instalador local para teste |
| `npm run dist:github` | Instalador com canal GitHub Releases |

### Canal no GitHub Releases

O canal de distribuição é `alugoideias/aluguito-community`. A autenticação do GitHub fica na máquina que publica. As instalações do time consultam releases públicas sem credencial do GitHub.

#### Assinatura das atualizações

- **Piloto com chave própria**. Rode `npm run signing:init` na conta Windows que publica. A chave privada é protegida pelo Windows em `%LOCALAPPDATA%\\Aluguito Release Signing`. O instalador contém a chave pública e o app verifica a assinatura Ed25519 do instalador baixado antes de liberar e antes de executar a atualização. O Windows pode sinalizar ou bloquear o instalador inicial, porque essa assinatura é verificada pelo Aluguito.
- **Certificado de assinatura de código**. Defina `ALUGUITO_UPDATE_PUBLISHER` com o nome que consta no certificado. Se usar o repositório de certificados do Windows, `ALUGUITO_SIGNING_THUMBPRINT` seleciona o certificado. Continue publicando o arquivo de assinatura do piloto durante a migração para que as instalações antigas aceitem a nova versão.

Guarde a chave privada e credenciais fora do código. A conta Windows que criou a chave é usada para assinar versões futuras. Se a chave for perdida, será preciso instalar manualmente uma nova versão com uma nova identidade de atualização.

#### Publicação

1. Atualize a versão em `package.json` e `package-lock.json`. Sincronize a edição pública e crie nela a tag da versão, por exemplo `v0.2.13`.
2. Rode `npm run dist:github`. Confira o conteúdo em `dist/github/<versão>/`. Publique numa mesma Release o instalador, `latest.yml`, o arquivo `.blockmap` e, para instalações do piloto, o arquivo `.exe.sig`.
3. Com o GitHub CLI autenticado, `npm run release:github` gera e publica o conjunto na tag já existente. Mantenha os arquivos das Releases anteriores disponíveis para atualizações diferenciais.

O time instala a primeira versão uma vez. As próximas aparecem em **Ajustes → Windows e dados → Buscar atualização**.

Para usar outro repositório em um fork, configure `ALUGUITO_UPDATE_GITHUB` como `dono/repositorio` e rode `npm run dist:installer` com a identidade de assinatura do seu projeto. Um canal HTTPS genérico pode usar `ALUGUITO_UPDATE_URL` e um certificado de assinatura de código.
