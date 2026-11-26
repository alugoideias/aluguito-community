const {spawnSync} = require('node:child_process');
const {generateKeyPairSync, createPrivateKey, createPublicKey, sign} = require('node:crypto');
const {existsSync, mkdirSync, readFileSync, writeFileSync} = require('node:fs');
const {join} = require('node:path');
const {releasePayload} = require('../src/release-verification.cjs');

function signingFiles() {
 if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) throw new Error('Use a conta Windows de publicação do Aluguito.');
 const folder = join(process.env.LOCALAPPDATA,'Aluguito Release Signing');
 return {folder, publicPath:join(folder,'public.pem'), privatePath:join(folder,'private.dpapi')};
}
function protect(operation, value) {
 const command = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.Security',
  '$data = [Convert]::FromBase64String([Console]::In.ReadToEnd())',
  '$result = [Security.Cryptography.ProtectedData]::' + operation +
   '($data, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)',
  '[Console]::Write([Convert]::ToBase64String($result))'
 ].join(';\n');
 const result = spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',command],
  {input:value.toString('base64'),encoding:'utf8',windowsHide:true});
 if (result.error || result.status !== 0 || !result.stdout?.trim()) throw new Error('Falha ao acessar a chave protegida do Windows.');
 return Buffer.from(result.stdout.trim(),'base64');
}

function initialize() {
 const files = signingFiles();
 if (existsSync(files.publicPath) && existsSync(files.privatePath)) return files.publicPath;
 if (existsSync(files.publicPath) || existsSync(files.privatePath)) throw new Error('O conjunto de chaves está incompleto.');
 const {publicKey, privateKey} = generateKeyPairSync('ed25519');
 const raw = privateKey.export({type:'pkcs8',format:'der'});
 try {
  const encrypted = protect('Protect',raw);
  mkdirSync(files.folder,{recursive:true});
  writeFileSync(files.privatePath, encrypted, {flag:'wx'});
  writeFileSync(files.publicPath, publicKey.export({type:'spki',format:'pem'}), {flag:'wx'});
 } finally {
  raw.fill(0);
 }
 return files.publicPath;
}
async function signInstaller(repository,version,file) {
 const files = signingFiles();
 const raw = protect('Unprotect',readFileSync(files.privatePath));
 try {
  const privateKey = createPrivateKey({key:raw,type:'pkcs8',format:'der'});
  const exported = createPublicKey(privateKey).export({type:'spki',format:'der'});
  const expected = createPublicKey(readFileSync(files.publicPath)).export({type:'spki',format:'der'});
  if (!exported.equals(expected)) throw new Error('As chaves de publicação não correspondem.');
  writeFileSync(file + '.sig', sign(null,await releasePayload(repository,version,file),privateKey));
 } finally {
  raw.fill(0);
 }
}
if (require.main === module) {
 try { console.log(initialize()); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {signInstaller,signingFiles};
