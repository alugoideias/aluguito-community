const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {createUpdater} = require('../src/updates.cjs');

test('updater checks and downloads once, reports progress, then flushes before installing', async () => {
 const updater = new EventEmitter();
 const calls = [], states = [];
 updater.checkForUpdates = async () => {
  calls.push('check');
  return {isUpdateAvailable:true, updateInfo:{version:'0.2.12'}};
 };
 updater.downloadUpdate = async () => {
  calls.push('download');
  updater.emit('download-progress', {percent:23.5});
 };
 updater.quitAndInstall = (...args) => calls.push(['install', ...args]);
 const updates = createUpdater(updater, {
  changed: state => states.push(state),
  ready: () => calls.push('ready'),
  beforeInstall: async () => calls.push('flush')
 });
 assert.equal(updater.autoInstallOnAppQuit,false);
 await assert.rejects(updates.install(),/Nenhuma atualização/);
 await Promise.all([updates.check(),updates.check()]);
 assert.deepEqual(calls,['check','download','ready']);
 assert.ok(states.some(state=>state.progress===23));
 assert.equal(updates.status().phase,'ready');
 await updates.install();
 assert.deepEqual(calls.slice(-2),['flush',['install',true,true]]);
 assert.equal(updates.status().phase,'installing');
});

test('network failure can be retried, and an interrupted save leaves a downloaded release available', async () => {
 const updater = new EventEmitter();
 updater.checkForUpdates = async () => {throw new Error('offline');};
 const updates = createUpdater(updater, {beforeInstall:async()=>{throw new Error('arquivo ocupado');}});
 assert.deepEqual(await updates.check(),{phase:'error'});
 updater.checkForUpdates = async () => ({isUpdateAvailable:false});
 assert.deepEqual(await updates.check(),{phase:'current'});
 updater.checkForUpdates = async () => ({isUpdateAvailable:true,updateInfo:{version:'0.2.12'}});
 updater.downloadUpdate = async () => {};
 assert.deepEqual(await updates.check(),{phase:'ready',version:'0.2.12'});
 await assert.rejects(updates.install(),/arquivo ocupado/);
 assert.deepEqual(updates.status(),{phase:'ready',version:'0.2.12',installFailed:true});
 assert.deepEqual(await createUpdater(null).check(),{phase:'disabled'});
});
