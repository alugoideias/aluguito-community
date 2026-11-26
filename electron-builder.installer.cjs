const {createPublicKey} = require('node:crypto');
const {readFileSync} = require('node:fs');
const {build} = require('./package.json');

const feed = process.env.ALUGUITO_UPDATE_URL;
const github = process.env.ALUGUITO_UPDATE_GITHUB;
const publisher = process.env.ALUGUITO_UPDATE_PUBLISHER?.trim();
const thumbprint = process.env.ALUGUITO_SIGNING_THUMBPRINT?.trim();
const pilotPublicKey = process.env.ALUGUITO_UPDATE_PUBLIC_KEY;
const qa = process.env.ALUGUITO_INSTALLER_QA === '1';
let publish = null;

if (github && (feed || qa)) {
 throw new Error('Escolha um canal de atualização. O modo de teste usa o canal local.');
}
if (github) {
 if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(github)) {
  throw new Error('Configure ALUGUITO_UPDATE_GITHUB como dono/repositorio.');
 }
 const [owner, repo] = github.split('/');
 publish = {provider: 'github', owner, repo, private: false};
} else if (feed) {
 const url = new URL(feed);
 const local = url.protocol === 'http:' && url.hostname === '127.0.0.1';
 if ((qa ? !local : url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) {
  throw new Error('Configure uma URL HTTPS de distribuição, sem usuário, senha ou parâmetros.');
 }
 url.pathname = url.pathname.replace(/\/?$/, '/');
 publish = {provider: 'generic', url: url.href, useMultipleRangeRequest: false};
}

if (qa && !publish) throw new Error('O teste do instalador precisa de um canal local.');
if (pilotPublicKey && (!github || publisher)) throw new Error('Use um canal GitHub e apenas uma identidade de assinatura.');
if (publish && !qa && !publisher && !pilotPublicKey) {
 throw new Error('Informe ALUGUITO_UPDATE_PUBLISHER com o nome do editor no certificado de assinatura.');
}
if (thumbprint && !/^[a-f0-9]{40}$/i.test(thumbprint)) {
 throw new Error('Informe a impressão digital SHA-1 do certificado de assinatura.');
}

let pilot;
if (pilotPublicKey) {
 const key = createPublicKey(readFileSync(pilotPublicKey));
 if (key.asymmetricKeyType !== 'ed25519') throw new Error('Use uma chave pública de atualização Ed25519.');
 pilot = {repository:github,publicKey:key.export({type:'spki',format:'der'}).toString('base64')};
}
const authenticode = Boolean(publish && !qa && !pilot);
const signing = authenticode
 ? {verifyUpdateCodeSignature: true, signtoolOptions: {publisherName: publisher,
  ...(thumbprint ? {certificateSha1: thumbprint} : {})}}
 : pilot ? {verifyUpdateCodeSignature: false} : {};

module.exports = {
 ...build,
 artifactName: 'Aluguito-Setup-${version}.${ext}',
 publish,
 forceCodeSigning: authenticode,
 ...(pilot ? {extraMetadata:{aluguitoReleaseVerification:pilot}} : {}),
 win: {
  ...build.win,
  target: 'nsis',
  signExecutable: authenticode,
  ...signing
 },
 nsis: {
  oneClick: true,
  perMachine: false,
  createDesktopShortcut: true,
  createStartMenuShortcut: true,
  deleteAppDataOnUninstall: false,
  runAfterFinish: true
 }
};
