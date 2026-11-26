const {spawnSync} = require('node:child_process');
const {existsSync} = require('node:fs');
const {join} = require('node:path');
const {version} = require('../package.json');
const {signInstaller,signingFiles} = require('./release-signing.cjs');

const repository = 'alugoideias/aluguito-community';
const root = join(__dirname, '..');
const directory = join(root, 'dist', 'github', version);
const installer = join(directory, 'Aluguito-Setup-' + version + '.exe');
const assets = [installer, installer + '.blockmap', join(directory, 'latest.yml')];
const env = {...process.env, ALUGUITO_UPDATE_GITHUB: repository};

function run(file, args, options = {}) {
 const result = spawnSync(file, args, {cwd: root, stdio: 'inherit', env, ...options});
 if (result.error) throw result.error;
 if (result.status !== 0) throw new Error(file + ' terminou com código ' + (result.status ?? result.signal) + '.');
}

async function main() {
 const args = process.argv.slice(2);
 if (args.length && !(args.length === 1 && args[0] === '--publish')) {
  throw new Error('Use npm run dist:github ou npm run release:github.');
 }
 if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Use uma versão estável para o canal oficial.');
 const authenticode = Boolean(env.ALUGUITO_UPDATE_PUBLISHER?.trim());
 const {publicPath,privatePath} = signingFiles();
 const hasPublicKey = existsSync(publicPath), hasPrivateKey = existsSync(privatePath);
 if (hasPublicKey !== hasPrivateKey) throw new Error('O conjunto de chaves de atualização está incompleto.');
 if (!authenticode) {
  if (!hasPrivateKey) throw new Error('Gere a chave do piloto com npm run signing:init.');
  env.ALUGUITO_UPDATE_PUBLIC_KEY = publicPath;
 }
 if (env.ALUGUITO_UPDATE_URL || env.ALUGUITO_INSTALLER_QA === '1') {
  throw new Error('Desative o canal alternativo ou o modo de teste antes de empacotar para GitHub.');
 }
 const cli = require.resolve('electron-builder/out/cli/cli.js');
 run(process.execPath, [cli, '--config', 'electron-builder.installer.cjs', '--win', 'nsis', '--x64',
  '--publish', 'never', '--config.directories.output=' + directory]);
 if (!assets.every(file => existsSync(file))) throw new Error('O empacotamento não gerou todos os arquivos da release.');
 if (hasPrivateKey) {
  await signInstaller(repository,version,installer);
  assets.push(installer + '.sig');
 }
 if (args.length && authenticode) {
  const verify = 'if ((Get-AuthenticodeSignature -LiteralPath $env:ALUGUITO_RELEASE_INSTALLER).Status -ne "Valid") { exit 1 }';
  run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', verify],
   {env: {...env, ALUGUITO_RELEASE_INSTALLER: installer}});
 }
 if (args.length) {
  run('gh', ['release', 'create', 'v' + version, ...assets, '--repo', repository,
   '--title', 'Aluguito ' + version, '--generate-notes', '--verify-tag']);
 } else {
  console.log(directory);
 }
}

main().catch(error => {
 console.error(error.message);
 process.exitCode = 1;
});
