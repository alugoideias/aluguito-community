const {randomUUID}=require('node:crypto');
const {McpConnection}=require('./mcp.cjs');
const fields=['mcpUrl','mcpTransport','mcpClientId','mcpTokens','mcpClientInformation','mcpDiscovery','mcpTools','mcpAllowed','mcpConnected'];
function migrateProfiles(data){
 if(Array.isArray(data.mcpProfiles)&&data.mcpProfiles.length)return{};
 const profile={id:randomUUID(),name:'Meu projeto'};
 for(const key of fields)if(data[key]!==undefined)profile[key]=data[key];
 return{mcpProfiles:[profile],mcpSettingsId:profile.id,...Object.fromEntries(fields.map(key=>[key,null]))};
}
class McpProfiles{
 constructor({read,save,open,Connection=McpConnection}){Object.assign(this,{read,save,open,Connection});this.clients=new Map();this.queue=Promise.resolve();}
 get selected(){return this.read().mcpSettingsId||this.read().mcpProfiles[0].id;}
 config(id=this.selected){const profile=this.read().mcpProfiles.find(p=>p.id===id);if(!profile)throw new Error('Este MCP não está cadastrado.');return profile;}
 update(id,patch){const run=async()=>{this.config(id);await this.save({mcpProfiles:this.read().mcpProfiles.map(p=>p.id===id?{...p,...patch}:p)});};const result=this.queue.then(run);this.queue=result.catch(()=>{});return result;}
 get pending(){return[...this.clients.values()].some(c=>c.pending);}
 connection(id=this.selected){this.config(id);if(!this.clients.has(id))this.clients.set(id,new this.Connection({read:()=>this.config(id),save:patch=>this.update(id,patch),open:this.open}));return this.clients.get(id);}
 async add(name='Novo projeto'){if(this.read().mcpProfiles.length>=20)throw new Error('Você pode cadastrar até 20 MCPs.');const base=String(name).trim().slice(0,50)||'Novo projeto',names=new Set(this.read().mcpProfiles.map(p=>p.name.toLocaleLowerCase()));let unique=base,n=2;while(names.has(unique.toLocaleLowerCase()))unique=base+' ('+(n++)+')';const profile={id:randomUUID(),name:unique};await this.save({mcpProfiles:[...this.read().mcpProfiles,profile],mcpSettingsId:profile.id});return profile.id;}
 async select(id){this.config(id);await this.save({mcpSettingsId:id});}
 async remove(id){this.config(id);if(this.read().mcpProfiles.length===1)throw new Error('Mantenha pelo menos um cadastro MCP. Você pode apagar seu endereço para deixá-lo vazio.');await this.clients.get(id)?.close();this.clients.delete(id);const profiles=this.read().mcpProfiles.filter(p=>p.id!==id);await this.save({mcpProfiles:profiles,mcpSettingsId:this.selected===id?profiles[0].id:this.selected});}
 close(){return Promise.all([...this.clients.values()].map(c=>c.close()));}
}
function projectMessages(history,id){return history.filter(m=>!m.private||m.scope===`mcp:${id}`);}
module.exports={McpProfiles,migrateProfiles,projectMessages};
