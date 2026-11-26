const {build} = require('./package.json');

const feed = process.env.ALUGUITO_UPDATE_URL;
const publisher = process.env.ALUGUITO_UPDATE_PUBLISHER?.trim();
const qa = process.env.ALUGUITO_INSTALLER_QA === '1';
let publish = null;

if (feed) {
 const url = new URL(feed);
 const local = url.protocol === 'http:' && url.hostname === '127.0.0.1';
 if ((qa ? !local : url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) {
  throw new Error('Configure uma URL HTTPS de distribuição, sem usuário, senha ou parâmetros.');
 }
 if (!qa && !publisher) throw new Error('Informe ALUGUITO_UPDATE_PUBLISHER com o nome do editor no certificado de assinatura.');
 url.pathname = url.pathname.replace(/\/?$/, '/');
 publish = {provider: 'generic', url: url.href, useMultipleRangeRequest: false};
}

if (qa && !publish) throw new Error('O teste do instalador precisa de um canal local.');

module.exports = {
 ...build,
 artifactName: 'Aluguito-Setup-${version}.${ext}',
 publish,
 forceCodeSigning: Boolean(publish && !qa),
 win: {
  ...build.win,
  target: 'nsis',
  signExecutable: Boolean(publish && !qa),
  ...(publish && !qa ? {signtoolOptions: {publisherName: publisher}} : {})
 },
 nsis: {
  oneClick: true,
  perMachine: false,
  createDesktopShortcut: false,
  deleteAppDataOnUninstall: false,
  runAfterFinish: false
 }
};
