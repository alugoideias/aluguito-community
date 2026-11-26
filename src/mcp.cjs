const http=require('node:http'),crypto=require('node:crypto');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {SSEClientTransport}=require('@modelcontextprotocol/sdk/client/sse.js');
const {UnauthorizedError}=require('@modelcontextprotocol/sdk/client/auth.js');
function mcpUrl(value){let url;try{url=new URL(value);}catch{throw new Error('Informe o endereço completo do servidor MCP.');}if(url.username||url.password||url.hash)throw new Error('Use um endereço MCP sem senha ou fragmento.');if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('Use HTTPS, ou HTTP apenas para um servidor local.');return url.href;}
function canRead(tool){return tool.annotations?.readOnlyHint===true&&tool.annotations?.destructiveHint!==true;}
const confirmedWrites = new Set([
 'criar_tarefa', 'mudar_status_tarefa', 'importar_posts_instagram', 'atualizar_metricas_instagram'
]);
function toolAccess(tool) {
 if (confirmedWrites.has(tool.name)) return 'write';
 return canRead(tool) ? 'read' : 'unavailable';
}
function taskListTool(profile, tools = profile.mcpTools || []) {
 if (!profile.mcpConnected) return undefined;
 return ['listar_tarefas', 'list_tasks'].map(name => tools.find(tool => tool.name === name &&
  profile.mcpAllowed?.includes(name) && toolAccess(tool) === 'read')).find(Boolean);
}
function functionName(name){return'mcp_'+crypto.createHash('sha256').update(name).digest('hex').slice(0,8)+'_'+name.replace(/[^a-zA-Z0-9_]/g,'_').slice(0,45);}
class McpConnection{
 constructor({read,save,open,port=35691}){this.read=read;this.save=save;this.open=open;this.port=port;this.client=null;this.pending=false;this.tools=[];this.redirectUrl=`http://127.0.0.1:${port}/mcp/oauth/callback`;}
 async close(){if(this.client)await this.client.close().catch(()=>{});this.client=null;}
 provider(interactive,state){const self=this;let verifier;
  return{
   get redirectUrl(){return self.redirectUrl;},
   get clientMetadata(){return{client_name:'Aluguito',redirect_uris:[self.redirectUrl],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none',application_type:'native'};},
   state:()=>state,
   clientInformation:()=>self.read().mcpClientInformation||(self.read().mcpClientId?{client_id:self.read().mcpClientId}:undefined),
   saveClientInformation:value=>self.save({mcpClientInformation:value}),
   tokens:()=>self.read().mcpTokens||undefined,
   saveTokens:value=>self.save({mcpTokens:value}),
   saveCodeVerifier:value=>{verifier=value;},codeVerifier:()=>{if(!verifier)throw new Error('Reinicie a autorização MCP.');return verifier;},
   saveDiscoveryState:value=>self.save({mcpDiscovery:value}),discoveryState:()=>self.read().mcpDiscovery||undefined,
   redirectToAuthorization:async url=>{if(!interactive)throw new Error('Autorize novamente o servidor MCP em Ajustes.');await self.open(mcpUrl(url.href));},
   invalidateCredentials:scope=>self.save(scope==='all'?{mcpTokens:null,mcpClientInformation:null,mcpDiscovery:null}:scope==='client'?{mcpClientInformation:null}:scope==='tokens'?{mcpTokens:null}:scope==='discovery'?{mcpDiscovery:null}:{})
  };
 }
 transport(provider){const d=this.read(),Transport=d.mcpTransport==='sse'?SSEClientTransport:StreamableHTTPClientTransport;return new Transport(new URL(mcpUrl(d.mcpUrl)),{authProvider:provider,redirectPolicy:'same-origin'});}
 async connect(interactive=false){
  if(this.pending)throw new Error('A conexão MCP já está em andamento.');if(!this.read().mcpUrl)throw new Error('Configure o endereço MCP em Ajustes.');
  this.pending=true;await this.close();let server,timer,callback;
  const state=crypto.randomBytes(24).toString('hex');
  try{
   if(interactive){
    let resolveCode,rejectCode;callback=new Promise((resolve,reject)=>{resolveCode=resolve;rejectCode=reject;});callback.catch(()=>{});
    server=http.createServer((req,res)=>{const url=new URL(req.url,'http://127.0.0.1');if(url.pathname!=='/mcp/oauth/callback'){res.writeHead(404);return res.end();}const incoming=Buffer.from(url.searchParams.get('state')||''),expected=Buffer.from(state);if(incoming.length!==expected.length||!crypto.timingSafeEqual(incoming,expected)){res.writeHead(400);return res.end('Autorizacao invalida.');}
     const discovery=this.read().mcpDiscovery,metadata=discovery?.authorizationServerMetadata,issuer=metadata?.issuer;
     if(issuer&&((metadata.authorization_response_iss_parameter_supported&&!url.searchParams.has('iss'))||(url.searchParams.has('iss')&&url.searchParams.get('iss')!==issuer))){res.writeHead(400);return res.end('Emissor de autorizacao invalido.');}
     res.setHeader('Content-Type','text/plain; charset=utf-8');res.end('Autorização recebida. Volte ao Aluguito.');if(url.searchParams.has('error'))return rejectCode(new Error('Autorização MCP cancelada.'));const code=url.searchParams.get('code');if(!code)return rejectCode(new Error('O servidor não enviou o código de autorização.'));resolveCode(code);
    });
    await new Promise((resolve,reject)=>{server.once('error',()=>reject(new Error('Não foi possível abrir o retorno de login MCP na porta 35691. Feche outra autorização em andamento e tente novamente.')));server.listen(this.port,'127.0.0.1',resolve);});
    this.redirectUrl=`http://127.0.0.1:${server.address().port}/mcp/oauth/callback`;timer=setTimeout(()=>rejectCode(new Error('O tempo de autorização MCP terminou. Tente conectar novamente.')),180000);
   }
   const provider=this.provider(interactive,state);let client=new Client({name:'Aluguito',version:'0.2.3'},{capabilities:{}}),transport=this.transport(provider);
   try{await client.connect(transport,{timeout:20000});}
   catch(error){if(!interactive||!(error instanceof UnauthorizedError||error.code===401)){await client.close().catch(()=>{});throw error;}const code=await callback;await transport.finishAuth(code);await client.close().catch(()=>{});client=new Client({name:'Aluguito',version:'0.2.3'},{capabilities:{}});transport=this.transport(provider);await client.connect(transport,{timeout:20000});}
   this.client=client;let cursor,tools=[];do{const page=await client.listTools(cursor?{cursor}:{},{timeout:20000});tools.push(...page.tools);cursor=page.nextCursor;}while(cursor&&tools.length<100);
   this.tools=tools.slice(0,100).filter(t=>JSON.stringify(t.inputSchema||{}).length<=24000).map(t=>({name:t.name,description:String(t.description||'').slice(0,1600),inputSchema:t.inputSchema||{type:'object'},annotations:t.annotations||{}}));
   await this.save({mcpTools:this.tools,mcpConnected:true});return this.tools;
  }catch(error){await this.close();if(interactive)await this.save({mcpConnected:false});if(/registration|client registration|client_id/i.test(error.message))throw new Error('O servidor exige um ID de aplicativo OAuth. Cadastre o Aluguito no seu provedor, use o retorno http://127.0.0.1:35691/mcp/oauth/callback e informe o ID em Ajustes.');if(/Unauthorized|401/.test(error.message))throw new Error('O MCP precisa de autorização. Use Conectar MCP em Ajustes.');throw error;}
  finally{clearTimeout(timer);server?.close();this.pending=false;}
 }
 async refreshPermissions() {
  if (this.pending) throw new Error('Aguarde a autorização MCP em andamento.');
  const previous = new Set((this.read().mcpTools || []).map(tool => tool.name));
  const tools = await this.connect(true);
  const available = new Set(tools.filter(tool => toolAccess(tool) !== 'unavailable').map(tool => tool.name));
  await this.save({mcpAllowed: (this.read().mcpAllowed || []).filter(name => available.has(name))});
  return {added: tools.filter(tool => !previous.has(tool.name)).length};
 }
 async ensureConnected() {
  if (this.connecting) return this.connecting;
  if (this.client) return;
  this.connecting = this.connect(false).finally(() => { this.connecting = null; });
  await this.connecting;
 }
 async listDailyTasks() {
  if (!taskListTool(this.read())) throw new Error('Listagem de tarefas não autorizada.');
  await this.ensureConnected();
  const client = this.client;
  const tool = taskListTool(this.read(), this.tools);
  if (!tool) throw new Error('Listagem de tarefas não autorizada.');
  const params = {};
  for (const field of tool.inputSchema?.required || []) {
   const schema = Object.hasOwn(tool.inputSchema.properties || {}, field) && tool.inputSchema.properties[field];
   if (!schema || !Object.hasOwn(schema, 'default')) {
    throw new Error('A listagem de tarefas exige filtros.');
   }
   Object.defineProperty(params, field, {value: schema.default, enumerable: true});
  }
  const result = await client.callTool({name: tool.name, arguments: params}, undefined, {timeout: 30000});
  if (this.client !== client || taskListTool(this.read(), this.tools)?.name !== tool.name || result.isError) {
   throw new Error('Não foi possível listar as tarefas.');
  }
  return result.structuredContent ?? result.content ?? [];
 }
 async prepared({confirmWrite = async () => false} = {}) {
  await this.ensureConnected();
  const client = this.client;
  const allowed = new Set(this.read().mcpAllowed || []);
  const selected = this.tools.filter(tool => allowed.has(tool.name) && toolAccess(tool) !== 'unavailable').slice(0, 30);
  if (!selected.length) throw new Error('Selecione ferramentas do MCP em Ajustes e salve.');
  const completedChanges = [];
  const execute = async (name, args) => {
   const tool = selected.find(item => functionName(item.name) === name);
   if (!tool) throw new Error('Ferramenta MCP não autorizada.');
   const access = toolAccess(tool);
   const stillAllowed = () => this.client === client && (this.read().mcpAllowed || []).includes(tool.name) &&
    this.tools.some(current => current.name === tool.name && toolAccess(current) === access);
   if (!stillAllowed()) throw new Error('Ferramenta MCP não autorizada.');
   const parameters = structuredClone(args || {});
   if (access === 'write' && !await confirmWrite(tool, parameters)) {
    throw new Error('Alteração cancelada.');
   }
   if (!stillAllowed()) throw new Error('A permissão do MCP mudou. Revise a seleção antes de tentar novamente.');
   const result = await client.callTool({name: tool.name, arguments: parameters}, undefined, {timeout: 30000});
   if (access === 'write' && !result.isError) completedChanges.push(tool.name);
   return {tool: tool.name, isError: Boolean(result.isError),
    result: JSON.stringify(result.structuredContent ?? result.content ?? []).slice(0, 30000)};
  };
  const declarations = selected.map(tool => ({
   name: functionName(tool.name),
   description: (toolAccess(tool) === 'write' ? 'Altera dados e exige confirmação do usuário. ' : '') + tool.description,
   parametersJsonSchema: tool.inputSchema
  }));
  return {declarations, execute, completedChanges};
 }
 async disconnect(){const d=this.read(),tokens=d.mcpTokens,metadata=d.mcpDiscovery?.authorizationServerMetadata,clientId=d.mcpClientInformation?.client_id||d.mcpClientId;await this.close();await this.save({mcpTokens:null,mcpClientInformation:null,mcpDiscovery:null,mcpTools:[],mcpAllowed:[],mcpConnected:false});this.tools=[];if(tokens&&metadata?.revocation_endpoint&&(!tokens.issuer||tokens.issuer===metadata.issuer)){try{await fetch(mcpUrl(metadata.revocation_endpoint),{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:tokens.refresh_token||tokens.access_token,token_type_hint:tokens.refresh_token?'refresh_token':'access_token',...(clientId?{client_id:clientId}:{})}),signal:AbortSignal.timeout(5000)});}catch{/* Local authorization was removed; provider-side revocation may also be done in the account settings. */}}}
}
module.exports={McpConnection,mcpUrl,canRead,toolAccess,functionName,taskListTool};
