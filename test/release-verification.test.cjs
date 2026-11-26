const {test} = require('node:test');
const assert = require('node:assert/strict');
const {generateKeyPairSync,sign} = require('node:crypto');
const {mkdtemp,writeFile,unlink,rmdir} = require('node:fs/promises');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {EventEmitter} = require('node:events');
const {createReleaseVerifier,releasePayload} = require('../src/release-verification.cjs');
const {createUpdater} = require('../src/updates.cjs');

test('pilot verifies the exact installer, version and repository against the embedded key', async () => {
 const folder = await mkdtemp(join(tmpdir(),'aluguito-release-verification-'));
 const file = join(folder,'installer.exe');
 try {
  const repository = 'alugoideias/aluguito-community';
  const version = '0.2.13';
  await writeFile(file,'test installer');
  const keys = generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({type:'spki',format:'der'}).toString('base64');
  const signature = sign(null,await releasePayload(repository,version,file),keys.privateKey);
  const urls = [];
  const fetcher = async url => {
   urls.push(url);
   return new Response(signature);
  };
  const verify = createReleaseVerifier({repository,publicKey},fetcher);
  await verify(version,file);
  assert.equal(urls[0],'https://github.com/alugoideias/aluguito-community/releases/download/v0.2.13/Aluguito-Setup-0.2.13.exe.sig');
  await assert.rejects(verify('0.2.14',file),/assinatura/);
  const other = createReleaseVerifier({repository:'example/fork',publicKey},fetcher);
  await assert.rejects(other(version,file),/assinatura/);
  await writeFile(file,'altered installer');
  await assert.rejects(verify(version,file),/assinatura/);
 } finally {
  await unlink(file).catch(error => {if(error.code!=='ENOENT')throw error;});
  await rmdir(folder);
 }
});

test('updater never runs an installer rejected by the pilot verifier', async () => {
 const engine = new EventEmitter();
 engine.checkForUpdates = async () => ({isUpdateAvailable:true,updateInfo:{version:'0.2.13'}});
 engine.downloadUpdate = async () => {};
 engine.installerPath = 'installer.exe';
 let accepted = false, installs = 0;
 engine.quitAndInstall = () => {installs++;};
 const updates = createUpdater(engine,{verifyDownloaded:async () => {if(!accepted)throw new Error('Bad signature');}});
 assert.equal((await updates.check()).phase,'error');
 await assert.rejects(updates.install(),/Nenhuma atualização/);
 accepted = true;
 assert.equal((await updates.check()).phase,'ready');
 accepted = false;
 await assert.rejects(updates.install(),/Bad signature/);
 assert.equal(updates.status().phase,'error');
 assert.equal(installs,0);
 assert.equal(engine.disableWebInstaller,true);
});
