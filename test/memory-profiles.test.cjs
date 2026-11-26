const{test}=require('node:test'),assert=require('node:assert/strict');
const{McpProfiles,migrateProfiles,projectMessages}=require('../src/mcp-profiles.cjs');
const{memoryValue,memoryContext}=require('../src/memory.cjs');
const{gemini}=require('../src/core.cjs');
test('legacy MCP migration preserves authorization and clears duplicate credentials',()=>{
 const original={key:'gemini-key',mcpUrl:'https://example.com/mcp',mcpTokens:{access_token:'old-token'},mcpAllowed:['tasks'],mcpConnected:true};const patch=migrateProfiles(original),profile=patch.mcpProfiles[0];assert.equal(profile.mcpTokens.access_token,'old-token');assert.deepEqual(profile.mcpAllowed,['tasks']);assert.equal(patch.mcpSettingsId,profile.id);assert.equal(patch.mcpTokens,null);assert.equal(original.key,'gemini-key');assert.deepEqual(migrateProfiles({...original,...patch}),{});
});
test('MCP callbacks retain their own profile after selecting another connection',async()=>{
 let data=migrateProfiles({mcpUrl:'https://a.example/mcp',mcpTokens:{access_token:'a'}});const configs=[];
 class Fake{constructor(config){Object.assign(this,config);configs.push(this);}async close(){} }
 const manager=new McpProfiles({read:()=>data,save:async patch=>{data={...data,...patch};},open:()=>{},Connection:Fake}),first=manager.selected,connectionA=manager.connection();const second=await manager.add('Posts'),connectionB=manager.connection();
 await Promise.all([connectionA.save({mcpTokens:{access_token:'renewed-a'},mcpAllowed:['a-tool']}),connectionB.save({mcpTokens:{access_token:'b'},mcpAllowed:['b-tool']})]);assert.equal(connectionA.read().id,first);assert.equal(connectionB.read().id,second);assert.equal(manager.config(first).mcpTokens.access_token,'renewed-a');assert.equal(manager.config(second).mcpTokens.access_token,'b');assert.deepEqual(manager.config(first).mcpAllowed,['a-tool']);await manager.select(first);assert.equal(manager.connection(),connectionA);await manager.remove(second);assert.equal(data.mcpProfiles.length,1);assert.throws(()=>manager.connection(second),/cadastrado/);
});
test('project context excludes other MCP and Google private messages',()=>{const messages=[{text:'public'},{text:'A',private:true,scope:'mcp:a'},{text:'B',private:true,scope:'mcp:b'},{text:'old MCP',private:true,scope:'mcp'},{text:'email',private:true,scope:'google'}];assert.deepEqual(projectMessages(messages,'b').map(m=>m.text),['public','B']);});
test('memory validation bounds imports and disabled memory is absent from request',async()=>{
 assert.throws(()=>memoryValue({text:'x'.repeat(30001)}),/30 mil/);assert.throws(()=>memoryValue({text:'bad\0file'}),/inválidos/);let request;
 const run=memory=>gemini({key:'fake',model:'test',messages:[{role:'user',text:'Olá'}],memory:memoryContext(memory),fetcher:async(_url,options)=>{request=JSON.parse(options.body);return{ok:true,json:async()=>({candidates:[{content:{parts:[{text:'Olá'}]}}]})};}});
 const memory=memoryValue({text:'# Projeto\nMeu contexto pessoal.',enabled:true,name:'projeto.md'});await run(memory);assert.ok(JSON.stringify(request).includes('Meu contexto pessoal.'));assert.match(request.systemInstruction.parts[1].text,/não altera as permissões/);await run({...memory,enabled:false});assert.ok(!JSON.stringify(request).includes('Meu contexto pessoal.'));
});

test('preferred name personalizes direct replies without entering web or MCP requests', async () => {
 const memory = memoryValue({text: '', preferredName: '  Joana   Lima  '});
 assert.equal(memory.preferredName, 'Joana Lima');
 assert.throws(() => memoryValue({text: '', preferredName: 'Joana\nLima'}), /nome/);
 const requests = [];
 const options = {
  key: 'fake', model: 'test', messages: [{role: 'user', text: 'Olá'}],
  preferredName: memory.preferredName,
  fetcher: async (_url, input) => {
   requests.push(input.body);
   return {ok: true, json: async () => ({candidates: [{content: {parts: [{text: 'Olá'}]}}]})};
  }
 };
 await gemini(options);
 await gemini({...options, webSearch: true});
 await gemini({...options, mcp: {declarations: []}});
 assert.ok(requests[0].includes('Joana Lima'));
 assert.ok(!requests[1].includes('Joana Lima'));
 assert.ok(!requests[2].includes('Joana Lima'));
});
