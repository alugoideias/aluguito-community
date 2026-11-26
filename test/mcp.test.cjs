const{test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
const{McpConnection,mcpUrl,canRead,toolAccess,functionName}=require('../src/mcp.cjs');const{gemini}=require('../src/core.cjs');
test('MCP endpoints require TLS except explicitly local development',()=>{assert.equal(mcpUrl('http://localhost:1234/mcp'),'http://localhost:1234/mcp');for(const url of ['http://example.com/mcp','file:///tmp/mcp','https://name:secret@example.com'])assert.throws(()=>mcpUrl(url));assert.equal(canRead({annotations:{readOnlyHint:true}}),true);assert.equal(canRead({annotations:{readOnlyHint:true,destructiveHint:true}}),false);assert.equal(canRead({}),false);});
test('function calling preserves thought signatures and uses only allowed MCP tools',async()=>{let requests=0,executed=0,second;const name=functionName('list_tasks');const result=await gemini({key:'dummy',model:'test',messages:[{role:'user',text:'Quais tarefas vencem hoje?'}],webSearch:true,detailed:true,mcp:{declarations:[{name,parametersJsonSchema:{type:'object'}}],execute:async tool=>{assert.equal(tool,name);executed++;return{tool:'list_tasks',result:'Uma tarefa'};}},fetcher:async(_url,options)=>{requests++;const body=JSON.parse(options.body);assert.ok(!body.tools[0].googleSearch);if(requests===1)return{ok:true,json:async()=>({candidates:[{content:{role:'model',parts:[{functionCall:{name,args:{}},thoughtSignature:'opaque-signature'}]}}]})};second=body;return{ok:true,json:async()=>({candidates:[{content:{parts:[{text:'Você tem uma tarefa.'}]}}]})};}});assert.equal(executed,1);assert.equal(second.contents[1].parts[0].thoughtSignature,'opaque-signature');assert.ok(second.contents[2].parts[0].functionResponse);assert.deepEqual(result.mcpTools,['list_tasks']);});
test('unapproved model tool calls never execute',async()=>{let executed=false;await assert.rejects(gemini({key:'dummy',model:'test',messages:[],mcp:{declarations:[{name:'allowed'}],execute:async()=>{executed=true;}},fetcher:async()=>({ok:true,json:async()=>({candidates:[{content:{role:'model',parts:[{functionCall:{name:'not_allowed',args:{}}}]}}]})})}),/não autorizada/);assert.equal(executed,false);});
function visit(url){return new Promise((resolve,reject)=>{http.get(url,response=>{response.resume();response.on('end',()=>resolve(response.statusCode));}).on('error',reject);});}
test('remote MCP OAuth verifies PKCE, refreshes the catalog without dropping OAuth and blocks unsupported mutations',async()=>{
 let origin,challenge,verifierChecked=false,called=0,tokenExchanges=0,includeNewTool=false;const data={mcpTransport:'http',mcpAllowed:['list_tasks','delete_post']};
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,origin);let body='';for await(const chunk of req)body+=chunk;const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  if(url.pathname.includes('oauth-protected-resource'))return json({resource:origin+'/mcp',authorization_servers:[origin],scopes_supported:['tasks:read']});
  if(url.pathname.includes('oauth-authorization-server')||url.pathname.includes('openid-configuration'))return json({issuer:origin,authorization_endpoint:origin+'/authorize',token_endpoint:origin+'/token',registration_endpoint:origin+'/register',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],authorization_response_iss_parameter_supported:true});
  if(url.pathname==='/register')return json({...JSON.parse(body),client_id:'aluguito-fixture'},201);
  if(url.pathname==='/token'){tokenExchanges++;const params=new URLSearchParams(body);verifierChecked=crypto.createHash('sha256').update(params.get('code_verifier')).digest('base64url')===challenge;return json({access_token:'fixture-access',refresh_token:'fixture-refresh',token_type:'Bearer',expires_in:3600,scope:'tasks:read'});}
  if(url.pathname!=='/mcp'){res.writeHead(404);return res.end();}
  if(req.headers.authorization!=='Bearer fixture-access'){res.writeHead(401,{'WWW-Authenticate':`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", scope="tasks:read"`});return res.end();}
  if(req.method==='GET'){res.writeHead(405);return res.end();}if(req.method==='DELETE'){res.writeHead(200);return res.end();}
  const rpc=JSON.parse(body);if(rpc.id===undefined){res.writeHead(202);return res.end();}
  let result;
  if(rpc.method==='initialize')result={protocolVersion:rpc.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'Test project',version:'1'}};
  else if(rpc.method==='tools/list')result={tools:[{name:'list_tasks',description:'Lista tarefas',inputSchema:{type:'object',properties:{}},annotations:{readOnlyHint:true}},{name:'delete_post',inputSchema:{type:'object'},annotations:{destructiveHint:true}},...(includeNewTool?[{name:'get_engagement',inputSchema:{type:'object'},annotations:{readOnlyHint:true}}]:[])]};
  else if(rpc.method==='tools/call'){called++;assert.equal(rpc.params.name,'list_tasks');result={content:[{type:'text',text:'Tarefa de teste'}]};}
  else result={};return json({jsonrpc:'2.0',id:rpc.id,result});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;data.mcpUrl=origin+'/mcp';
 const connection=new McpConnection({port:0,read:()=>data,save:async patch=>Object.assign(data,patch),open:async address=>{const url=new URL(address);challenge=url.searchParams.get('code_challenge');const callback=new URL(url.searchParams.get('redirect_uri'));callback.searchParams.set('state',url.searchParams.get('state'));callback.searchParams.set('code','test-code');callback.searchParams.set('iss',origin);assert.equal(await visit(callback),200);}});
 try{const tools=await connection.connect(true);assert.equal(tools.length,2);assert.equal(verifierChecked,true);assert.equal(data.mcpTokens.access_token,'fixture-access');const project=await connection.prepared();assert.equal(project.declarations.length,1);const result=await project.execute(project.declarations[0].name,{});assert.match(result.result,/Tarefa de teste/);assert.equal(called,1);await assert.rejects(project.execute(functionName('delete_post'),{}),/não autorizada/);includeNewTool=true;const refresh=await connection.refreshPermissions();assert.equal(refresh.added,1);assert.equal(tokenExchanges,1);assert.deepEqual(data.mcpAllowed,['list_tasks']);assert.equal((await connection.prepared()).declarations.length,1);data.mcpAllowed.push('get_engagement');assert.equal((await connection.prepared()).declarations.length,2);await connection.disconnect();assert.equal(data.mcpTokens,null);assert.deepEqual(data.mcpAllowed,[]);}finally{await connection.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('supported MCP changes preserve annotations and run only after approval and a fresh permission check', async () => {
 const names = ['criar_tarefa','mudar_status_tarefa','importar_posts_instagram','atualizar_metricas_instagram'];
 const data = {mcpAllowed: [...names, 'delete_post']};
 const connection = new McpConnection({read: () => data});
 const originalAnnotations = {readOnlyHint:false, destructiveHint:false, idempotentHint:false};
 connection.tools = [
  ...names.map(name => ({name, inputSchema:{type:'object'}, annotations: originalAnnotations})),
  {name:'delete_post', inputSchema:{type:'object'}, annotations:{readOnlyHint:false,destructiveHint:true}}
 ];
 const calls = [];
 connection.client = {callTool: async args => {calls.push(args);return {structuredContent:{ok:true}};}};
 assert.ok(names.every(name => toolAccess(connection.tools.find(tool => tool.name === name)) === 'write'));
 assert.equal(toolAccess(connection.tools.at(-1)), 'unavailable');
 const args = {titulo:'Revisar entrega'};
 const noApproval = await connection.prepared();
 await assert.rejects(noApproval.execute(functionName(names[0]), args), /Alteração cancelada/);
 assert.equal(calls.length, 0);
 const granted = await connection.prepared({confirmWrite: async (tool, parameters) => {
  assert.deepEqual(tool.annotations, originalAnnotations);
  assert.deepEqual(parameters, args);
  return true;
 }});
 for (const name of names) await granted.execute(functionName(name), args);
 assert.deepEqual(granted.completedChanges, names);
 assert.deepEqual(calls.map(call => call.name), names);
 await assert.rejects(granted.execute(functionName('delete_post'), {}), /não autorizada/);
 const revoked = await connection.prepared({confirmWrite: async () => {
  data.mcpAllowed = data.mcpAllowed.filter(name => name !== names[0]);
  return true;
 }});
 await assert.rejects(revoked.execute(functionName(names[0]), args), /permissão do MCP mudou/);
 assert.equal(calls.length, names.length);
});
