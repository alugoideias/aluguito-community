const fs = require('node:fs/promises');
const path = require('node:path');
function createStore({file,encrypt,decrypt,initial}) {
  let data={...initial},queue=Promise.resolve(),loadFailed=false;
  return {
    get data(){return data;},
    async load(){try{data={...initial,...JSON.parse(await decrypt(await fs.readFile(file)))};loadFailed=false;}catch(error){if(error.code!=='ENOENT'){loadFailed=true;throw error;}}return data;},
    save(patch){queue=queue.catch(()=>{}).then(async()=>{if(loadFailed)throw new Error('As configurações protegidas não puderam ser abertas. O arquivo original foi preservado.');const next={...data,...patch};const bytes=await encrypt(JSON.stringify(next));await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',bytes);await fs.rename(file+'.tmp',file);data=next;return data;});return queue;},
    flush(){return queue;}
  };
}
module.exports={createStore};
