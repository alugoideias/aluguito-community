const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');
const {systemInstruction,gemini,groundingResult}=require('../src/core.cjs');
const {accountIntent,lookupAccount}=require('../src/account-query.cjs');
const {createStore}=require('../src/store.cjs');const {migrateConversations,createConversation,getConversation}=require('../src/conversations.cjs');
const success=()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:'Resposta'}]}}]})});
test('clock uses local date across UTC midnight and refreshes on next request',()=>{const a=systemInstruction({now:new Date('2026-11-26T01:00:00Z'),timeZone:'America/Sao_Paulo'}),b=systemInstruction({now:new Date('2026-11-26T04:00:00Z'),timeZone:'America/Sao_Paulo'});assert.match(a,/25 de novembro de 2026/);assert.match(a,/22:00:00/);assert.match(b,/26 de novembro de 2026/);assert.match(a,/America\/Sao_Paulo/);});
test('503 retries same model and key then recovers without duplicate result',async()=>{let attempts=0;const delays=[],notices=[],urls=[];const answer=await gemini({key:'private',model:'gemini-3.5-flash',messages:[{role:'user',text:'Olá'}],wait:async ms=>delays.push(ms),onRetry:m=>notices.push(m),fetcher:async(url,options)=>{urls.push(url);assert.equal(options.headers['x-goog-api-key'],'private');return++attempts<3?{ok:false,status:503}:success();}});assert.equal(answer,'Resposta');assert.equal(attempts,3);assert.equal(delays.length,2);assert.ok(delays[1]>delays[0]);assert.equal(new Set(urls).size,1);assert.equal(notices.length,2);});
test('persistent 503 stops and explains saved credentials',async()=>{let attempts=0;await assert.rejects(gemini({key:'private',model:'test',messages:[],wait:async()=>{},fetcher:async()=>{attempts++;return{ok:false,status:503};}}),/Sua chave continua salva/);assert.equal(attempts,3);});
test('invalid credentials never trigger retry',async()=>{let attempts=0;await assert.rejects(gemini({key:'private',model:'test',messages:[],fetcher:async()=>{attempts++;return{ok:false,status:403};}}),/recusou/);assert.equal(attempts,1);});
test('web tool is enabled explicitly and excludes private account context',async()=>{let request;await gemini({key:'test',model:'test',messages:[{role:'user',text:'email privado',private:true,context:'private metadata'},{role:'model',text:'resumo privado',private:true},{role:'user',text:'Notícias'}],webSearch:true,includeImages:true,fetcher:async(_url,options)=>{request=JSON.parse(options.body);return success();}});assert.ok(request.tools[0].googleSearch.searchTypes.imageSearch);assert.equal(request.contents.length,1);assert.ok(!JSON.stringify(request).includes('private metadata'));assert.match(request.systemInstruction.parts[0].text,/Google Search/);});
test('unsupported image tool falls back to web text without changing model',async()=>{const requests=[];const answer=await gemini({key:'test',model:'test',messages:[],webSearch:true,includeImages:true,detailed:true,fetcher:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return requests.length===1?{ok:false,status:400,json:async()=>({error:{message:'imageSearch is unsupported'}})}:success();}});assert.equal(requests.length,2);assert.ok(requests[0].body.tools[0].googleSearch.searchTypes);assert.deepEqual(requests[1].body.tools[0].googleSearch,{});assert.equal(requests[0].url,requests[1].url);assert.ok(answer.imageNotice);});
test('sources and image attribution reject unsafe URLs',()=>{const result=groundingResult({candidates:[{content:{parts:[{text:'Texto'}]},groundingMetadata:{groundingChunks:[{web:{uri:'javascript:bad',title:'bad'}},{web:{uri:'https://example.com',title:'Fonte'}},{image:{imageUri:'https://example.com/image.jpg',sourceUri:'https://example.com/page',title:'Imagem'}},{image:{imageUri:'file:///private',sourceUri:'https://example.com'}}]}}]});assert.equal(result.sources.length,1);assert.equal(result.images.length,1);assert.equal(result.images[0].source,'https://example.com/page');});
test('only personal account questions request account data',()=>{assert.equal(accountIntent('Veja minha agenda de hoje'),'agenda');assert.equal(accountIntent('Quais meus e-mails?'),'emails');assert.equal(accountIntent('Explique como funciona o Google Agenda'),null);assert.equal(accountIntent('O que é um e-mail?'),null);assert.equal(accountIntent('Nada da Aurora nos e-mails?'),'emails');assert.equal(accountIntent('Tenho algum compromisso hoje?'),'agenda');assert.equal(accountIntent('Escreva um e-mail para a Aurora'),null);});
test('legacy conversation migrates without loss and marks private email turns',()=>{const previous=[{role:'user',text:'Oi'},{role:'model',text:'Olá'},{role:'user',text:'<email>privado</email>'},{role:'model',text:'resumo'}];const migrated=migrateConversations({history:previous});assert.equal(getConversation(migrated).messages.length,4);assert.equal(getConversation(migrated).messages[2].private,true);assert.equal(getConversation(migrated).messages[3].private,true);assert.equal(getConversation(migrated).messages[0].private,false);});
test('encrypted store reload retains key and all conversations after unrelated saves',async()=>{const directory=await fs.mkdtemp(path.join(os.tmpdir(),'aluguito-store-test-'));const file=path.join(directory,'vault');const encrypt=async text=>Buffer.from(text).reverse(),decrypt=async bytes=>Buffer.from(bytes).reverse().toString();const initial={model:'test',...migrateConversations({})};const store=createStore({file,encrypt,decrypt,initial});await store.save({key:'do-not-log'});const second=createConversation();await Promise.all([store.save({reminderMinutes:10}),store.save({conversations:[...store.data.conversations,second]})]);const reopened=createStore({file,encrypt,decrypt,initial});await reopened.load();assert.equal(reopened.data.key,'do-not-log');assert.equal(reopened.data.reminderMinutes,10);assert.equal(reopened.data.conversations.length,2);assert.equal((await fs.readFile(file)).includes(Buffer.from('do-not-log')),false);await fs.rm(directory,{recursive:true,force:true});});
test('failed storage write does not pretend a new key is saved',async()=>{const store=createStore({file:path.join(os.tmpdir(),'unused-aluguito-failure'),initial:{key:'original'},encrypt:async()=>{throw new Error('locked');},decrypt:async()=>''});await assert.rejects(store.save({key:'replacement'}),/locked/);assert.equal(store.data.key,'original');});
test('unreadable vault is never replaced by empty defaults',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'aluguito-vault-test-'));const file=path.join(dir,'vault'),original=Buffer.from('protected-original');await fs.writeFile(file,original);const store=createStore({file,initial:{history:[]},encrypt:async text=>Buffer.from(text),decrypt:async()=>{throw new Error('temporarily locked');}});await assert.rejects(store.load(),/temporarily locked/);await assert.rejects(store.save({history:[]}),/preservado/);assert.deepEqual(await fs.readFile(file),original);assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'aluguito-vault-test-'));await fs.rm(dir,{recursive:true,force:true});});

test('chat account lookups search Gmail by term and restrict Agenda to the requested local day', async () => {
 const now = new Date(2026, 10, 26, 15);
 const google = {
  async emails(query) {
   assert.equal(query, 'in:inbox {from:"Aurora" "Aurora"}');
   return [{subject: 'Resumo *mensal*', from: 'Equipe', snippet: 'Prévia para revisão.', link: 'https://mail.google.com/mail/#all/abc'}];
  },
  async events({start, end}) {
   assert.equal(start.getTime(), new Date(2026, 10, 26, 0).getTime());
   assert.equal(end.getTime(), new Date(2026, 10, 27, 0).getTime());
   return [
    {title: 'Reunião de pauta', start: now.toISOString()},
    {title: 'Cancelado', start: now.toISOString(), status: 'cancelled'},
    {title: 'Sem horário', start: '2026-11-26', allDay: true}
   ];
  }
 };
 const gmail = await lookupAccount(google, 'emails', 'Nada da Aurora nos e-mails?', now);
 assert.ok(gmail.text.includes('Resumo \\*mensal\\*'));
 assert.match(gmail.text, /Prévia para revisão/);
 assert.equal(gmail.sources[0].url, 'https://mail.google.com/mail/#all/abc');
 const calendar = await lookupAccount(google, 'agenda', 'Tenho algum compromisso hoje?', now);
 assert.match(calendar.text, /Agenda principal — hoje/);
 assert.match(calendar.text, /Reunião de pauta/);
 assert.match(calendar.text, /dia todo/);
 assert.doesNotMatch(calendar.text, /Cancelado/);
 await lookupAccount({
  async events({start, end}) {
   assert.equal(start.getTime(), new Date(2026, 10, 27, 0).getTime());
   assert.equal(end.getTime(), new Date(2026, 10, 28, 0).getTime());
   return [];
  }
 }, 'agenda', 'O que tenho amanhã?', now).then(result => assert.match(result.text, /Não encontrei compromissos.*amanhã/));
 await lookupAccount({
  async emails(query) {
   const after = new Date(2026, 10, 23).getTime() / 1000;
   const before = new Date(2026, 10, 30).getTime() / 1000;
   assert.equal(query, 'in:inbox after:' + after + ' before:' + before);
   return [];
  }
 }, 'emails', 'Recebi algum e-mail importante nesta semana?', now).then(result => assert.match(result.text, /Não encontrei e-mails.*esta semana/));
});
