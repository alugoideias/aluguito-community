const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const crypto=require('node:crypto');const {Google}=require('../src/google.cjs');
function visit(url){return new Promise((resolve,reject)=>{http.get(url,response=>{response.resume();response.on('end',()=>resolve(response.statusCode));}).on('error',reject);});}
test('desktop OAuth verifies callback state, PKCE exchange and connected identity',async()=>{
 const originalFetch=global.fetch;let auth,exchange;const data={googleClient:{client_id:'test.apps.googleusercontent.com',client_secret:'dummy'}};
 global.fetch=async(url,options)=>{if(url==='https://oauth2.googleapis.com/token'){exchange=new URLSearchParams(options.body);return{ok:true,json:async()=>({access_token:'fake',refresh_token:'fake-refresh',expires_in:3600})};}if(url.endsWith('/gmail/v1/users/me/profile'))return{ok:true,json:async()=>({emailAddress:'test@example.com'})};throw new Error('Unexpected request');};
 try{const google=new Google({read:()=>data,save:async patch=>Object.assign(data,patch),open:async address=>{auth=new URL(address);const redirect=auth.searchParams.get('redirect_uri');assert.equal(new URL(redirect).hostname,'127.0.0.1');assert.equal(await visit(redirect+'?state='+encodeURIComponent('é'.repeat(48))+'&code=bad'),400);assert.equal(await visit(redirect+'?state='+auth.searchParams.get('state')+'&code=approved'),200);}});await google.connect();assert.equal(google.pending,false);assert.equal(data.googleEmail,'test@example.com');assert.equal(data.googleTokens.refresh_token,'fake-refresh');assert.equal(exchange.get('code'),'approved');assert.equal(exchange.get('redirect_uri'),auth.searchParams.get('redirect_uri'));assert.equal(crypto.createHash('sha256').update(exchange.get('code_verifier')).digest('base64url'),auth.searchParams.get('code_challenge'));assert.match(auth.searchParams.get('scope'),/gmail.readonly/);assert.match(auth.searchParams.get('scope'),/calendar.events.readonly/);}finally{global.fetch=originalFetch;}
});

test('Gmail extracts subject, sender and date from mixed-case metadata headers', async () => {
 const google = new Google({read: () => ({googleEmail:'test@example.com'})});
 google.request = async path => {
  const url = new URL(path, 'https://www.googleapis.com');
  if (url.pathname.endsWith('/messages')) {
   assert.equal(url.searchParams.get('q'), 'in:inbox Aurora');
   return {messages:[{id:'abc'}]};
  }
  assert.equal(url.searchParams.get('format'), 'metadata');
  assert.deepEqual(url.searchParams.getAll('metadataHeaders'), ['Subject', 'From', 'Date']);
  return {snippet:'Prévia',payload:{headers:[
   {name:'sUbJeCt',value:'Relatório semanal'},
   {name:'FROM',value:'relatorios@example.com'},
   {name:'date',value:'Thu, 26 Nov 2026 14:00:00 -0300'}
  ]}};
 };
 const [email] = await google.emails('in:inbox Aurora');
 assert.equal(email.subject, 'Relatório semanal');
 assert.equal(email.from, 'relatorios@example.com');
 assert.equal(email.date, 'Thu, 26 Nov 2026 14:00:00 -0300');
 assert.equal(email.snippet, 'Prévia');
});
