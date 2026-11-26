function createUpdater(updater, {changed = () => {}, ready = () => {}, beforeInstall = async () => {}} = {}) {
 let state = {phase: updater ? 'idle' : 'disabled'};
 let pending;
 const report = (phase, details = {}) => {
  state = {phase, ...details};
  changed(state);
 };
 if (updater) {
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.on('error', () => {
   if (state.phase === 'installing') report('ready', {version: state.version, installFailed: true});
  });
  updater.on('download-progress', ({percent}) => {
   if (state.phase !== 'downloading' || !Number.isFinite(percent)) return;
   const progress = Math.max(0, Math.min(100, Math.floor(percent)));
   if (progress !== state.progress) report('downloading', {version: state.version, progress});
  });
 }
 return {
  status: () => state,
  check() {
   if (!updater || ['ready', 'installing'].includes(state.phase)) return Promise.resolve(state);
   if (pending) return pending;
   report('checking');
   pending = (async () => {
    try {
     const result = await updater.checkForUpdates();
     if (!result?.isUpdateAvailable) {
      report('current');
      return state;
     }
     const {version} = result.updateInfo;
     report('downloading', {version, progress: 0});
     await updater.downloadUpdate();
     report('ready', {version});
     ready(state);
    } catch {
     report('error');
    }
    return state;
   })().finally(() => { pending = null; });
   return pending;
  },
  async install() {
   if (state.phase !== 'ready') throw new Error('Nenhuma atualização está pronta para instalar.');
   const {version} = state;
   report('installing', {version});
   try {
    await beforeInstall();
    updater.quitAndInstall(true, true);
   } catch (error) {
    report('ready', {version, installFailed: true});
    throw error;
   }
   return state;
  }
 };
}

module.exports = {createUpdater};
