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

O instalador é por usuário e conserva o mesmo diretório de dados do portátil. Feche a versão portátil antes de abrir a versão instalada pela primeira vez.

| Comando | Pacote |
| --- | --- |
| `npm run dist` | ZIP portátil |
| `npm run dist:installer` | Instalador local para teste |

### Canal de atualização

Para gerar um instalador conectado a um canal, configure `ALUGUITO_UPDATE_URL` com o endereço HTTPS dos arquivos e `ALUGUITO_UPDATE_PUBLISHER` com o nome do editor no certificado de assinatura do Windows. Configure a identidade de assinatura do electron-builder no ambiente de build. Guarde as credenciais no gerenciador de segredos e mantenha a mesma identidade de assinatura em todas as versões do canal.

Para publicar uma nova versão, atualize o número em `package.json` e `package-lock.json` e gere o instalador. Envie o arquivo `Aluguito-Setup-*.exe` e seu `.blockmap` para o canal. Publique o `latest.yml` por último, depois que os outros arquivos estiverem disponíveis. Conserve o instalador e o `.blockmap` da versão anterior para download diferencial. Cada instalação verifica se há uma nova versão ao iniciar e permite instalar ao reiniciar em **Ajustes → Windows e dados**.
