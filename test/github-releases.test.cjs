const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {join} = require('node:path');

function installerConfig(overrides = {}) {
 const env = {...process.env};
 for (const key of ['ALUGUITO_UPDATE_URL','ALUGUITO_UPDATE_GITHUB','ALUGUITO_UPDATE_PUBLISHER',
  'ALUGUITO_SIGNING_THUMBPRINT','ALUGUITO_INSTALLER_QA','ALUGUITO_UPDATE_PUBLIC_KEY']) delete env[key];
 env.GH_TOKEN = 'simulated-publisher-credential';
 Object.assign(env, overrides);
 return spawnSync(process.execPath, ['-p', 'JSON.stringify(require("./electron-builder.installer.cjs"))'],
  {env, cwd: join(__dirname,'..'), encoding: 'utf8'});
}

test('GitHub update config uses public releases and verifies the Windows publisher', () => {
 const run = installerConfig({ALUGUITO_UPDATE_GITHUB:'alugoideias/aluguito-community',
  ALUGUITO_UPDATE_PUBLISHER:'Alugo Ideias QA'});
 assert.equal(run.status,0);
 const config = JSON.parse(run.stdout);
 assert.deepEqual(config.publish,{provider:'github',owner:'alugoideias',repo:'aluguito-community',private:false});
 assert.equal(config.forceCodeSigning,true);
 assert.equal(config.win.verifyUpdateCodeSignature,true);
 assert.equal(config.win.signtoolOptions.publisherName,'Alugo Ideias QA');
 assert.ok(!run.stdout.includes('simulated-publisher-credential'));
});

test('local installer stays offline and an official GitHub channel rejects missing signing or mixed hosts', () => {
 assert.equal(JSON.parse(installerConfig().stdout).publish,null);
 const target = {ALUGUITO_UPDATE_GITHUB:'alugoideias/aluguito-community'};
 assert.match(installerConfig(target).stderr,/ALUGUITO_UPDATE_PUBLISHER/);
 assert.match(installerConfig({...target, ALUGUITO_UPDATE_URL:'https://example.com/'}).stderr,/Escolha um canal/);
 assert.match(installerConfig({ALUGUITO_UPDATE_GITHUB:'https://github.com/project'}).stderr,/dono\/repositorio/);
});
