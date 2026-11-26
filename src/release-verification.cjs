const {createHash, createPublicKey, verify} = require('node:crypto');
const {createReadStream} = require('node:fs');

const stableVersion = /^\d+\.\d+\.\d+$/;
const repositoryName = /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/;

async function releasePayload(repository, version, file) {
 if (!repositoryName.test(repository) || !stableVersion.test(version)) throw new Error('Versão de release inválida.');
 const hash = createHash('sha512');
 for await (const chunk of createReadStream(file)) hash.update(chunk);
 return Buffer.from(['Aluguito Windows Release v1',repository,version,hash.digest('hex')].join('\n'));
}

function createReleaseVerifier({repository, publicKey}, fetcher = fetch) {
 if (!repositoryName.test(repository) || typeof publicKey !== 'string') throw new Error('Chave de atualização inválida.');
 const key = createPublicKey({key:Buffer.from(publicKey,'base64'),type:'spki',format:'der'});
 if (key.asymmetricKeyType !== 'ed25519') throw new Error('Chave de atualização inválida.');
 return async (version, installer) => {
  if (!stableVersion.test(version) || !installer) throw new Error('Instalador de atualização inválido.');
  const url = 'https://github.com/' + repository + '/releases/download/v' + version + '/Aluguito-Setup-' + version + '.exe.sig';
  const response = await fetcher(url,{signal:AbortSignal.timeout(15000)});
  if (!response.ok || !response.body) throw new Error('Não foi possível obter a assinatura da atualização.');
  const chunks = [];
  let bytes = 0;
  for await (const data of response.body) {
   bytes += data.length;
   if (bytes > 64) throw new Error('Assinatura de atualização inválida.');
   chunks.push(data);
  }
  const signature = Buffer.concat(chunks);
  const payload = await releasePayload(repository,version,installer);
  if (signature.length !== 64 || !verify(null,payload,key,signature)) {
   throw new Error('A assinatura da atualização não confere.');
  }
 };
}

module.exports = {createReleaseVerifier, releasePayload};
