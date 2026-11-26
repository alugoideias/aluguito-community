const {app,BrowserWindow,ipcMain,safeStorage,shell,dialog,Tray,Menu,Notification,screen,nativeImage}=require('electron');
const {existsSync}=require('node:fs');
const {createUpdater}=require('./updates.cjs');
const {createReleaseVerifier}=require('./release-verification.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url');
const {gemini,safeLink,dueReminders,redactError,listModels}=require('./core.cjs');
const {Google}=require('./google.cjs');
const {accountIntent,lookupAccount}=require('./account-query.cjs');
const {dailyOverview,loadTaskProjects,trackWorkDeadlines}=require('./daily-overview.cjs');
const {PersonalReminders,parseReminder}=require('./personal-reminders.cjs');
const {createStore}=require('./store.cjs');
const {mcpUrl,toolAccess,taskListTool}=require('./mcp.cjs');
const {McpProfiles,migrateProfiles,projectMessages}=require('./mcp-profiles.cjs');
const {memoryValue,memoryContext,preferredName}=require('./memory.cjs');
const {builtins,skinList,imageFormat,coffeeDuration}=require('./skins.cjs');
const {focusConfig,focusView,focusAction,focusTransition,nextPhrase}=require('./focus.cjs');
let focusTickBusy=false,focusInterval,personalInterval,workInterval,updateInterval;
let motionStop, nextAmbientAt = 0, previousAmbient;
const ambientMotions = ['walking', 'jumping', 'flying'];
const {createConversation,migrateConversations,listConversations,getConversation,titleFromText}=require('./conversations.cjs');
const {petSize,computeLayout,appearance:layoutAppearance,clamp}=require('./layout.cjs');
const smoke=process.argv.includes('--smoke');
app.setName('Aluguito');app.setAppUserModelId('com.alugoideias.aluguito');
if(smoke)app.setPath('userData',path.join(os.tmpdir(),`aluguito-qa-${Date.now()}`));
let win,tray,store,google,mcp,expanded=false,chatBusy=false,quitting=false,polling=false,backgroundError='',moveTimer;
let liveLayout=null,petRect=null,draft=null,gesture=null,gestureTimer,gestureTimeout,applyingLayout=false;
const initial={model:'gemini-3.5-flash-lite',reminderMinutes:5,workDaysAhead:1,history:[],webSearch:true,includeImages:true,ambientMotion:true,petScale:.8,conversationPosition:'left',conversationSize:{width:520,height:640}};
const read=()=>store.data,save=patch=>store.save(patch),sent=new Set();
const personal = new PersonalReminders({read,save});
const preferences=()=>({...read(),...draft});
let updates = createUpdater(null);
const launchPath=()=>process.env.PORTABLE_EXECUTABLE_FILE||app.getPath('exe');
const trusted=pathToFileURL(path.join(__dirname,'index.html')).href;
async function encrypt(text){if(!await safeStorage.isAsyncEncryptionAvailable())throw new Error('A proteção de credenciais do Windows não está disponível.');return safeStorage.encryptStringAsync(text);}
async function decrypt(bytes){return(await safeStorage.decryptStringAsync(bytes)).result;}
async function open(value){const url=safeLink(value);if(!url)throw new Error('O link precisa começar com https://.');await shell.openExternal(url);}
function broadcast(channel,value){if(win&&!win.isDestroyed())win.webContents.send(channel,value);}
function status(){const d=read(),md=mcp.config();return{focus:focusView(d),memory:d.memory||{text:"",enabled:false,name:"Minha memória.md"},namePromptSeen:Boolean(d.namePromptSeen),skinId:d.skinId||"default",skins:skinList(d),mcpSettingsId:mcp.selected,mcpProfiles:d.mcpProfiles.map(p=>({id:p.id,name:p.name,ready:Boolean(p.mcpConnected&&p.mcpAllowed?.length)})),mcpName:md.name,version:app.getVersion(),update:updates.status(),hasKey:Boolean(d.key),model:d.model,webSearch:d.webSearch,includeImages:d.includeImages,ambientMotion:d.ambientMotion,petScale:d.petScale,expanded,...(liveLayout?layoutAppearance(liveLayout,preferences().petScale,expanded):{}),googleConfigured:Boolean(d.googleClient),googleConnected:Boolean(d.googleTokens),googleEmail:d.googleEmail||'',mcpUrl:md.mcpUrl||'',mcpTransport:md.mcpTransport||'http',mcpClientId:md.mcpClientId||'',mcpAuthorized:Boolean(md.mcpConnected),mcpHasAuth:Boolean(md.mcpTokens),mcpAllowed:md.mcpAllowed||[],mcpTools:(md.mcpTools||[]).map(t=>({name:t.name,description:t.description,access:toolAccess(t),annotations:t.annotations})),reminderMinutes:d.reminderMinutes,workDaysAhead:d.workDaysAhead,startOnLogin:app.getLoginItemSettings({path:launchPath()}).openAtLogin,history:getConversation(d).messages,conversations:listConversations(d),activeConversationId:d.activeConversationId,backgroundError};}
function handle(name,fn){ipcMain.handle(name,async(event,...args)=>{if(event.senderFrame?.url!==trusted)return{ok:false,error:'Origem não autorizada.'};try{return{ok:true,value:await fn(...args)};}catch(error){const d=read();return{ok:false,error:redactError(error,[d.key,d.googleTokens?.access_token,d.googleTokens?.refresh_token,d.googleClient?.client_secret,d.mcpTokens?.access_token,d.mcpTokens?.refresh_token,d.mcpClientInformation?.client_secret,...(d.mcpProfiles||[]).flatMap(p=>[p.mcpTokens?.access_token,p.mcpTokens?.refresh_token,p.mcpClientInformation?.client_secret])])};}});}
function resizeWindow(){
 const prefs=preferences(),size=petSize(prefs.petScale);
 if(!petRect)petRect={...win.getBounds()};
 if(petRect.width!==size.width||petRect.height!==size.height)petRect={x:petRect.x+petRect.width-size.width,y:petRect.y+petRect.height-size.height,...size};
 const area=screen.getDisplayMatching(petRect).workArea;
 liveLayout=computeLayout({pet:petRect,area,expanded,position:prefs.conversationPosition||'left',size:prefs.conversationSize,offset:prefs.conversationOffset,autoSide:gesture?.mode==='pet-move'});petRect={...liveLayout.pet};
 applyingLayout=true;win.setResizable(false);win.setMinimumSize(0,0);win.setMaximumSize(area.width,area.height);win.setBounds(liveLayout.bounds);applyingLayout=false;
 broadcast('appearance',layoutAppearance(liveLayout,prefs.petScale,expanded));
}
function showPanel(tab='chat'){stopMotion();expanded=true;resizeWindow();win.show();win.focus();broadcast('navigate',tab);}
function collapse(){expanded=false;resizeWindow();}
async function setScale(scale){await save({petScale:scale});resizeWindow();await saveAnchor();}
function saveAnchor(){return save({petAnchor:{right:petRect.x+petRect.width,bottom:petRect.y+petRect.height}});}
async function setConversation(position,size){await save({conversationPosition:position||preferences().conversationPosition,...(position?{conversationOffset:null}:{}),...(size?{conversationSize:size}:{})});resizeWindow();await saveAnchor();}
function reposition(){const a=screen.getPrimaryDisplay().workArea,s=petSize(preferences().petScale);petRect={x:a.x+a.width-s.width-12,y:a.y+a.height-s.height-12,...s};resizeWindow();saveAnchor().catch(()=>{});win.show();}
function beginGesture(mode,point=screen.getCursorScreenPoint(),simulated=false){
 if(!['pet-move','pet-resize','panel-move','panel-n','panel-s','panel-e','panel-w','panel-ne','panel-nw','panel-se','panel-sw'].includes(mode))throw new Error('Movimento inválido.');
 stopMotion();if(gesture)throw new Error('Conclua o movimento atual.');if(mode.startsWith('panel')&&!expanded)return;
 gesture={mode,start:point,pet:{...petRect},panel:liveLayout.panel?{...liveLayout.panel}:null,prefs:{...preferences()},moved:false};win.focus();
 if(!simulated){gestureTimer=setInterval(()=>applyGesturePoint(screen.getCursorScreenPoint()),16);gestureTimeout=setTimeout(()=>endGesture().catch(()=>{}),30000);}return true;
}
function applyGesturePoint(point){
 if(!gesture)return;const g=gesture,dx=point.x-g.start.x,dy=point.y-g.start.y;if(!g.moved&&Math.hypot(dx,dy)<4)return;g.moved=true;
 if(g.mode==='pet-move'){petRect={...g.pet,x:g.pet.x+dx,y:g.pet.y+dy};draft={...g.prefs};}
 else if(g.mode==='pet-resize'){const scale=clamp(g.prefs.petScale+(dx/192+dy/208)/2,.45,1.6);draft={...g.prefs,petScale:Math.round(scale*100)/100};petRect={x:g.pet.x,y:g.pet.y,...petSize(draft.petScale)};}
 else{const p={...g.panel},direction=g.mode.slice(6);if(g.mode==='panel-move'){p.x+=dx;p.y+=dy;}else{if(direction.includes('e'))p.width=Math.max(340,g.panel.width+dx);if(direction.includes('s'))p.height=Math.max(360,g.panel.height+dy);if(direction.includes('w')){p.width=Math.max(340,g.panel.width-dx);p.x=g.panel.x+g.panel.width-p.width;}if(direction.includes('n')){p.height=Math.max(360,g.panel.height-dy);p.y=g.panel.y+g.panel.height-p.height;}}petRect={...g.pet};draft={...g.prefs,conversationPosition:'free',conversationSize:{width:Math.round(p.width),height:Math.round(p.height)},conversationOffset:{x:p.x-g.pet.x,y:p.y-g.pet.y}};}
 resizeWindow();
}
async function endGesture(){clearInterval(gestureTimer);clearTimeout(gestureTimeout);const g=gesture;if(!g)return{moved:true};gesture=null;
 if(g.moved){const prefs=preferences(),position=liveLayout.position;await save({petScale:prefs.petScale,conversationPosition:position,conversationSize:liveLayout.panel?{width:liveLayout.panel.width,height:liveLayout.panel.height}:prefs.conversationSize,conversationOffset:position==='free'&&liveLayout.panel?{x:liveLayout.panel.x-petRect.x,y:liveLayout.panel.y-petRect.y}:null,petAnchor:{right:petRect.x+petRect.width,bottom:petRect.y+petRect.height}});}
 draft=null;resizeWindow();return{moved:g.moved};
}
function localNotification(title, message, motion = 'jumping') {
 if (smoke) return;
 if (Notification.isSupported()) {
  new Notification({title, body: message, icon: path.join(__dirname, '../assets/icon.png')}).show();
 }
 broadcast('pet-toast', message);
 if (!chatBusy && !gesture) showMotion(motion);
}
async function focusTick() {
 if (focusTickBusy) return;
 focusTickBusy = true;
 try {
  const now = new Date();
  const transition = focusTransition(read(), +now);
  if (transition) {
   await save({focusTimer: transition.timer});
   localNotification('Aluguito · Pomodoro', transition.message);
  }
  const data = read(), config = focusConfig(data.focusConfig);
  const daytime = now.getHours() >= 8 && now.getHours() < 20;
  if (config.phrases) {
   if (!data.nextPhraseAt) await save({nextPhraseAt: +now + config.interval * 60000});
   else if (+now >= data.nextPhraseAt && daytime && !focusView(data).running && !chatBusy) {
    const phrase = nextPhrase(data.lastPhraseIndex);
    await save({lastPhraseIndex: phrase.index, nextPhraseAt: +now + config.interval * 60000});
    localNotification('Aluguito', phrase.text, phrase.index === 1 ? 'coffee' : 'waving');
   }
  }
  maybeAnimate(now);
  broadcast('focus-update', focusView(read()));
 } catch {
  // Keep the saved timer state for the next tick.
 } finally {
  focusTickBusy = false;
 }
}
function stopMotion() {
 clearTimeout(motionStop);
 motionStop = null;
 broadcast('pet-state', 'idle');
}
function showMotion(type) {
 clearTimeout(motionStop);
 broadcast('pet-state', type);
 const usesOriginalArt = builtins.some(skin => skin.id === (read().skinId || 'default'));
 const durations = {coffee: usesOriginalArt ? coffeeDuration : 2300, jumping: 1200, waving: 1400};
 motionStop = setTimeout(stopMotion, durations[type] || 2400);
}
async function playMotion(type) {
 if (!['idle', ...ambientMotions, 'coffee'].includes(type)) throw new Error('Movimento inválido.');
 if (gesture || chatBusy) throw new Error('Aguarde o movimento ou a resposta atual.');
 if (type === 'idle') stopMotion();
 else showMotion(type);
}
function maybeAnimate(now) {
 const data = read();
 if (!data.ambientMotion) {
  nextAmbientAt = 0;
  return;
 }
 if (!nextAmbientAt) {
  nextAmbientAt = +now + (30 + Math.random() * 30) * 60000;
  return;
 }
 if (+now < nextAmbientAt || now.getHours() < 8 || now.getHours() >= 20 ||
     expanded || chatBusy || gesture || motionStop || !win?.isVisible() ||
     focusView(data).running || data.skins?.some(skin => skin.id === data.skinId && skin.animated === false)) return;
 const choices = ambientMotions.filter(type => type !== previousAmbient);
 previousAmbient = choices[Math.floor(Math.random() * choices.length)];
 showMotion(previousAmbient);
 nextAmbientAt = +now + (30 + Math.random() * 30) * 60000;
}
function petMenu(){Menu.buildFromTemplate([
 {label:expanded?'Recolher conversa':'Vamos conversar',click:()=>expanded?collapse():showPanel('chat')},
 {label:'Posição da conversa',submenu:[['left','À esquerda do Aluguito'],['right','À direita do Aluguito'],['above','Acima do Aluguito']].map(([position,label])=>({label,type:'radio',checked:read().conversationPosition===position,click:()=>setConversation(position)}))},
 {label:'Tamanho da conversa',submenu:[['Compacta',420,500],['Padrão',520,640],['Ampla',680,760]].map(([label,width,height])=>({label,click:()=>setConversation(null,{width,height})}))},
 {label:'Tamanho do Aluguito',submenu:[[.6,'Pequeno'],[.8,'Normal'],[1,'Grande'],[1.25,'Maior']].map(([scale,label])=>({label,type:'radio',checked:read().petScale===scale,click:()=>setScale(scale)}))},
 {label:'Reposicionar no canto direito',click:reposition},
 {label:'Minimizar',click:()=>{collapse();win.hide();}},
 {label:'Pomodoro',submenu:[{label:'Iniciar ou retomar',click:async()=>{await save({focusTimer:focusAction(read(),'start')});broadcast('focus-update',focusView(read()));}},{label:'Pausar',click:async()=>{await save({focusTimer:focusAction(read(),'pause')});broadcast('focus-update',focusView(read()));}},{label:'Reiniciar',click:async()=>{await save({focusTimer:focusAction(read(),'reset')});broadcast('focus-update',focusView(read()));}}]},{label:'Movimentos',submenu:[['walking','Andar'],['flying','Voar'],['jumping','Pular'],['coffee','Tomar um café'],['idle','Parar']].map(([motion,label])=>({label,click:()=>playMotion(motion).catch(()=>{})}))},{label:'Aparência',submenu:skinList(read()).map(s=>({label:s.name,type:'radio',checked:(read().skinId||'default')===s.id,click:async()=>{await save({skinId:s.id});broadcast('skin-changed',s.id);}}))},{label:'Ajustes',click:()=>showPanel('settings')},{type:'separator'},{label:'Sair do Aluguito',click:()=>app.quit()}
]).popup({window:win});}
async function reminders(){if(polling||!read().googleTokens||smoke)return;polling=true;try{const events=await google.events();backgroundError='';if(sent.size>1000)sent.clear();for(const e of dueReminders(events,Date.now(),read().reminderMinutes,sent)){if(!Notification.isSupported())break;sent.add(`${e.id}:${e.start}`);const time=new Date(e.start).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});const n=new Notification({title:'Aluguito: sua reunião está chegando',body:`${e.title} às ${time}. ${e.link?'Clique para entrar.':'Clique para ver a agenda.'}`,icon:path.join(__dirname,'../assets/icon.png')});n.on('click',()=>e.link?open(e.link).catch(()=>showPanel('agenda')):showPanel('agenda'));n.show();broadcast('reminder',{title:e.title,time});if(!chatBusy&&!gesture&&!motionStop)showMotion('jumping');}}catch(error){backgroundError=redactError(error);}finally{polling=false;}}
handle('status',status);
handle('settings',async input=>{
 if(!input||typeof input!=='object')throw new Error('Ajustes inválidos.');const patch={};
 if(typeof input.key==='string'&&input.key.trim()){if(input.key.length>500)throw new Error('Chave inválida.');patch.key=input.key.trim();}
 if(input.removeKey)patch.key=null;
 if(input.focusConfig){const config=focusConfig(input.focusConfig);patch.focusConfig=config;if(!focusView(read()).running&&(config.work!==(read().focusConfig?.work||25)||config.rest!==(read().focusConfig?.rest||5)))patch.focusTimer={phase:'focus',remaining:config.work*60,endAt:null};if(config.phrases!==Boolean(read().focusConfig?.phrases)||config.interval!==(read().focusConfig?.interval||60))patch.nextPhraseAt=Date.now()+config.interval*60000;}
 if(typeof input.model==='string'){if(!/^[\w.-]{1,120}$/.test(input.model))throw new Error('Modelo inválido.');patch.model=input.model;}
 for(const field of ['webSearch','includeImages','ambientMotion'])if(typeof input[field]==='boolean')patch[field]=input[field];
 if (input.workDaysAhead !== undefined) {
  if (![-1,0,1,3,7].includes(input.workDaysAhead)) throw new Error('Antecedência inválida.');
  patch.workDaysAhead = input.workDaysAhead;
 }
 if(input.reminderMinutes!==undefined){const n=Number(input.reminderMinutes);if(![1,5,10,15,30].includes(n))throw new Error('Antecedência inválida.');patch.reminderMinutes=n;}
 if(input.mcpUrl!==undefined){const md=mcp.config(),url=input.mcpUrl.trim()?mcpUrl(input.mcpUrl.trim()):'',transport=input.mcpTransport==='sse'?'sse':'http',clientId=String(input.mcpClientId||'').trim().slice(0,1000),name=String(input.mcpName||md.name).trim().slice(0,60);if(!name)throw new Error('Dê um nome ao MCP.');if(read().mcpProfiles.some(p=>p.id!==md.id&&p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw new Error('Já existe um MCP com esse nome.');const changed=url!==(md.mcpUrl||'')||transport!==(md.mcpTransport||'http')||clientId!==(md.mcpClientId||'');const mp={name,mcpUrl:url,mcpTransport:transport,mcpClientId:clientId};if(changed){if(mcp.pending||chatBusy)throw new Error('Aguarde a consulta ou conexão atual antes de trocar o MCP.');await mcp.connection().close();Object.assign(mp,{mcpTokens:null,mcpClientInformation:null,mcpDiscovery:null,mcpTools:[],mcpAllowed:[],mcpConnected:false});}else if(Array.isArray(input.mcpAllowed)){const permitted=new Set((md.mcpTools||[]).filter(t=>toolAccess(t)!=='unavailable').map(t=>t.name));mp.mcpAllowed=input.mcpAllowed.filter(name=>typeof name==='string'&&permitted.has(name)).slice(0,30);}await mcp.update(md.id,mp);}
 await save(patch);if(typeof input.startOnLogin==='boolean'&&!smoke)app.setLoginItemSettings({openAtLogin:input.startOnLogin,path:launchPath()});return status();
});
handle('test-key',async()=>{await gemini({key:read().key,model:read().model,messages:[{role:'user',text:'Responda apenas: conexão funcionando.'}],onRetry:message=>broadcast('retry',message)});return'Conexão com o Gemini funcionando.';});
handle('list-models',()=>listModels({key:read().key}));
async function confirmMcpWrite(profile, tool, args) {
 const parameters = JSON.stringify(args, null, 2).replace(/[\p{Cf}]/gu,
  character => '\\u{' + character.codePointAt(0).toString(16) + '}');
 if (parameters.length > 12000) throw new Error('A alteração tem parâmetros demais para revisar. Divida a solicitação.');
 const {response} = await dialog.showMessageBox(win, {
  type: 'question', title: 'Confirmar alteração no MCP',
  message: 'Executar ' + tool.name + ' em ' + profile.name + '?',
  detail: 'Servidor: ' + new URL(profile.mcpUrl).origin + '\n\nParâmetros que serão enviados:\n' + parameters,
  buttons: ['Cancelar', 'Executar alteração'], defaultId: 0, cancelId: 0, noLink: true
 });
 return response === 1;
}
handle('chat',async input=>{
 const text=typeof input==='string'?input:input?.text;let privateMessage=Boolean(input?.private);
 if(chatBusy)throw new Error('Aguarde a resposta atual.');if(typeof text!=='string'||!text.trim()||text.length>24000)throw new Error('Digite uma mensagem de até 24 mil caracteres.');
 stopMotion();let responseReady=false;chatBusy=true;broadcast('pet-state','thinking');
 try {
 const intent = privateMessage || input?.mcp ? null : accountIntent(text);
 const data = read(), conversation = getConversation(data);
 const useMcp = Boolean(input?.mcp) && !intent && !privateMessage;
 let project = null, accountResult;
 if (intent) {
  privateMessage = true;
  if (!data.googleTokens) throw new Error('Conecte sua conta em Ajustes → Conta Google para consultar o Gmail ou a agenda.');
  accountResult = await lookupAccount(google, intent, text);
 }
 const mcpId=useMcp?(typeof input.mcpId==='string'?input.mcpId:mcp.selected):null;
 if (useMcp) {
  privateMessage = true;
  const profile = mcp.config(mcpId);
  project = await mcp.connection(mcpId).prepared({
   confirmWrite: (tool, args) => confirmMcpWrite(profile, tool, args)
  });
 }
 const scope = privateMessage ? (useMcp ? 'mcp:' + mcpId : intent ? 'google:lookup' : 'google') : undefined;
 const history = [...conversation.messages, {role:'user',text:text.trim(),private:privateMessage,...(scope?{scope}:{})}];
 const messages = useMcp ? projectMessages(history, mcpId) :
  history.filter(message => message.scope !== 'google:lookup' && !String(message.scope || '').startsWith('mcp:'));
 const result = accountResult || await gemini({key:data.key,model:data.model,messages,
  webSearch:!privateMessage&&data.webSearch&&input?.webSearch!==false,includeImages:data.includeImages,
  memory:memoryContext(data.memory),preferredName:data.memory?.preferredName,mcp:project,detailed:true,
  onRetry:message=>broadcast('retry',message)}).catch(error => {
   const completedChanges = project?.completedChanges || [];
   if (!completedChanges.length) throw error;
   const reason = error.message === 'Alteração cancelada.' ? 'Uma alteração posterior foi cancelada.' : 'A resposta ficou incompleta.';
   return {text: 'Alterações realizadas: ' + completedChanges.join(', ') + '. ' + reason, mcpTools: completedChanges};
  });
 if(useMcp)result.mcpName=mcp.config(mcpId).name;
 const updated={...conversation,title:conversation.messages.length?conversation.title:titleFromText(text),updatedAt:new Date().toISOString(),messages:[...history,{role:'model',...result,private:privateMessage,...(scope?{scope}:{})}]};
 await save({conversations:read().conversations.map(c=>c.id===conversation.id?updated:c)});responseReady=true;return{...result,conversationId:conversation.id};
 }finally{chatBusy=false;if(responseReady)showMotion('jumping');else stopMotion();}
});
handle('clear-history',async()=>{if(chatBusy)throw new Error('Aguarde a resposta antes de apagar o histórico.');const choice=await dialog.showMessageBox(win,{type:'question',message:'Limpar as mensagens da conversa atual?',buttons:['Cancelar','Limpar'],defaultId:0,cancelId:0});if(choice.response===1)await save({conversations:read().conversations.map(c=>c.id===read().activeConversationId?{...c,messages:[],updatedAt:new Date().toISOString()}:c)});return status();});
handle('new-conversation',async()=>{if(chatBusy)throw new Error('Aguarde a resposta atual.');const c=createConversation();await save({conversations:[c,...read().conversations],activeConversationId:c.id});return status();});
handle('select-conversation',async id=>{if(chatBusy)throw new Error('Aguarde a resposta atual.');getConversation(read(),id);await save({activeConversationId:id});return status();});
handle('rename-conversation',async(id,title)=>{getConversation(read(),id);if(typeof title!=='string'||!title.trim()||title.length>100)throw new Error('Use um título de até 100 caracteres.');await save({conversations:read().conversations.map(c=>c.id===id?{...c,title:title.trim()}:c)});return status();});
handle('delete-conversation',async id=>{if(chatBusy)throw new Error('Aguarde a resposta atual.');const c=getConversation(read(),id);const choice=await dialog.showMessageBox(win,{type:'question',message:`Excluir a conversa “${c.title}” deste computador?`,buttons:['Cancelar','Excluir'],defaultId:0,cancelId:0});if(choice.response!==1)return status();let conversations=read().conversations.filter(c=>c.id!==id);if(!conversations.length)conversations=[createConversation()];await save({conversations,activeConversationId:read().activeConversationId===id?conversations[0].id:read().activeConversationId});return status();});
handle('import-google',async()=>{
 if(google.pending)throw new Error('Aguarde a conexão em andamento.');
 const result=await dialog.showOpenDialog(win,{title:'Configuração Google para aplicativo de computador',filters:[{name:'Configuração Google',extensions:['json']}],properties:['openFile']});
 if(result.canceled)return status();const stat=await fs.stat(result.filePaths[0]);if(stat.size>100000)throw new Error('Arquivo inválido.');
 let value;try{value=JSON.parse(await fs.readFile(result.filePaths[0],'utf8')).installed;}catch{throw new Error('Selecione o JSON de uma credencial Google do tipo Aplicativo para computador.');}
 if(!value?.client_id?.endsWith('.apps.googleusercontent.com'))throw new Error('O arquivo precisa ser uma credencial Google de Aplicativo para computador.');
 google.generation++;await save({googleClient:{client_id:value.client_id,client_secret:value.client_secret||''},googleTokens:null,googleEmail:''});sent.clear();return status();
});
handle('connect-google',async()=>{if(!read().googleClient){showPanel('settings');throw new Error('Siga o passo a passo de conexão Google em Ajustes e importe o JSON para conectar.');}await google.connect();backgroundError='';reminders();return status();});
handle('disconnect-google',async()=>{await google.disconnect();sent.clear();backgroundError='';return status();});
handle('connect-mcp',async()=>{await mcp.connection().connect(true);return status();});
handle('refresh-mcp-permissions',async()=>{if(chatBusy||mcp.pending)throw new Error('Aguarde a consulta ou autorização atual.');const result=await mcp.connection().refreshPermissions();return{state:status(),added:result.added};});
handle('disconnect-mcp',async()=>{if(chatBusy||mcp.pending)throw new Error('Aguarde a consulta ou autorização atual.');await mcp.connection().disconnect();return status();});
handle('select-mcp',async id=>{if(chatBusy||mcp.pending)throw new Error('Aguarde a consulta ou autorização atual.');await mcp.select(id);return status();});
handle('add-mcp',async()=>{if(chatBusy||mcp.pending)throw new Error('Aguarde a consulta ou autorização atual.');await mcp.add('Projeto '+(read().mcpProfiles.length+1));return status();});
handle('remove-mcp',async id=>{if(chatBusy||mcp.pending)throw new Error('Aguarde a consulta ou autorização atual.');await mcp.remove(id);return status();});
handle('save-memory', async input => {
 const name = input?.preferredName ?? read().memory?.preferredName;
 await save({memory: memoryValue({...input, preferredName: name}), ...(name && {namePromptSeen: true})});
 return status();
});
handle('save-preferred-name', async input => {
 const name = preferredName(input);
 const memory = read().memory || {text: '', enabled: false, name: 'Minha memória.md'};
 await save({namePromptSeen: true, memory: memoryValue({...memory, preferredName: name})});
 return status();
});
handle('import-memory',async()=>{const result=await dialog.showOpenDialog(win,{title:'Importar memória Markdown',filters:[{name:'Markdown',extensions:['md','markdown']}],properties:['openFile']});if(result.canceled)return null;const file=result.filePaths[0];if(!/\.(md|markdown)$/i.test(file)||(await fs.stat(file)).size>120000)throw new Error('Selecione um arquivo MD de até 120 KB.');return memoryValue({text:await fs.readFile(file,'utf8'),enabled:true,name:path.basename(file)});});
handle('export-memory',async input=>{const value=memoryValue(input),result=await dialog.showSaveDialog(win,{title:'Exportar memória',defaultPath:'Aluguito-memoria.md',filters:[{name:'Markdown',extensions:['md']}]});if(!result.canceled)await fs.writeFile(result.filePath,value.text,'utf8');return!result.canceled;});
const coffeeAssets = new Map();
handle('skin-image', async () => {
 const data = read(), id = data.skinId || 'default';
 const builtin = builtins.find(skin => skin.id === id);
 const skin = builtin || (data.skins || []).find(skin => skin.id === id);
 if (!skin) return null;
 try {
  const assets = path.join(__dirname, '../assets');
  const coffeeFile = builtin?.coffeeFile || 'aluguito-coffee-cores.png';
  if (!coffeeAssets.has(coffeeFile)) {
   coffeeAssets.set(coffeeFile, 'data:image/png;base64,' +
    (await fs.readFile(path.join(assets, coffeeFile))).toString('base64'));
  }
  const file = builtin ? path.join(assets, builtin.file) : path.join(app.getPath('userData'), 'skins', id + '.png');
  return {
   url: 'data:image/png;base64,' + (await fs.readFile(file)).toString('base64'),
   id, animated: skin.animated !== false, format: skin.format || 'original', rows: skin.rows,
   softPalette: Boolean(builtin?.softPalette), coffeeDuration: builtin ? coffeeDuration : 2160,
   coffeeUrl: coffeeAssets.get(coffeeFile), coffeeRow: builtin?.coffeeRow ?? 0
  };
 } catch {
  return null;
 }
});
handle('select-skin',async id=>{if(!skinList(read()).some(s=>s.id===id))throw new Error('Skin não encontrada.');await save({skinId:id});broadcast('skin-changed',id);return status();});
handle('import-skin',async name=>{if(typeof name!=='string'||!name.trim()||name.length>60)throw new Error('Dê um nome à skin, com até 60 caracteres.');const result=await dialog.showOpenDialog(win,{title:'Importar skin',filters:[{name:'Imagem ou atlas do mascote',extensions:['png','webp']}],properties:['openFile']});if(result.canceled)return status();const file=result.filePaths[0];if((await fs.stat(file)).size>20000000)throw new Error('Use uma imagem de até 20 MB.');const img=nativeImage.createFromPath(file),size=img.getSize();if(img.isEmpty()||size.width<32||size.height<32||size.width>4096||size.height>4096)throw new Error('Use uma imagem PNG ou WebP válida, entre 32 e 4096 pixels por lado.');const format=imageFormat(size),animated=format!=='static';const id=require('node:crypto').randomUUID(),dir=path.join(app.getPath('userData'),'skins');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,id+'.png'),img.toPNG());await save({skins:[...(read().skins||[]),{id,name:name.trim(),animated,format,rows:format==='original'?size.height/208:4}],skinId:id});broadcast('skin-changed',id);return status();});
let dailyRequest, taskProjectsRequest, workTickBusy = false, personalTickBusy = false;
function getTaskProjects() {
 if (!taskProjectsRequest) taskProjectsRequest = loadTaskProjects(mcp, read())
  .finally(() => { taskProjectsRequest = null; });
 return taskProjectsRequest;
}
function reminderNotification(title, body, section) {
 if (!Notification.isSupported() || quitting) return;
 const notification = new Notification({title, body, icon:path.join(__dirname,'../assets/icon.png')});
 notification.on('click', () => showPanel(section));
 notification.show();
}
async function personalTick() {
 if (personalTickBusy || quitting || !Notification.isSupported()) return;
 personalTickBusy = true;
 try {
  const due = await personal.takeDue();
  for (const item of due) reminderNotification('Aluguito · Pessoal', item.title, 'personal');
  if (due.length) broadcast('personal-update', personal.list());
 } catch (error) {
  console.error(redactError(error));
 } finally {
  personalTickBusy = false;
 }
}
async function workTick() {
 if (workTickBusy || chatBusy || mcp.pending || quitting || read().workDaysAhead < 0 || !Notification.isSupported()) return;
 workTickBusy = true;
 try {
  const projects = await getTaskProjects();
  if (quitting || read().workDaysAhead < 0) return;
  const allowed = new Set(read().mcpProfiles.filter(profile => taskListTool(profile)).map(profile => profile.id));
  const previous = read().workDeadlines || {};
  const {tracked, due} = trackWorkDeadlines(previous, projects, allowed, read().workDaysAhead);
  if (JSON.stringify(previous) !== JSON.stringify(tracked)) await save({workDeadlines:tracked});
  if (read().workDaysAhead < 0) return;
  const current = due.filter(task => read().mcpProfiles.some(profile => profile.id === tracked[task.key].projectId && taskListTool(profile)));
  const first = current[0];
  if (first) {
   const body = current.length === 1
    ? first.project + ' · ' + first.title + (first.today ? ' vence hoje.' : ' está perto do prazo.')
    : current.length + ' tarefas estão perto do prazo. Veja os projetos no Meu dia.';
   reminderNotification('Aluguito · Trabalho', body, 'daily');
  }
 } catch (error) {
  console.error(redactError(error));
 } finally {
  workTickBusy = false;
 }
}
handle('daily-overview', () => {
 if (!dailyRequest) dailyRequest = dailyOverview({google, mcp, data:read(), taskProjects:getTaskProjects()})
  .finally(() => { dailyRequest = null; });
 return dailyRequest;
});
handle('personal-list', () => personal.list());
handle('personal-parse', text => typeof text === 'string' && text.length <= 24000 ? parseReminder(text) : null);
handle('personal-create', async input => {await personal.create(input);return personal.list();});
handle('personal-action', async (id, action) => {
 if (!['done','remove','snooze'].includes(action)) throw new Error('Ação inválida.');
 await personal.act(id, action);
 return personal.list();
});
handle('check-update', () => updates.check());
handle('install-update', () => updates.install());
handle('events',()=>google.events());handle('emails',q=>{if(typeof q!=='string')throw new Error('Busca inválida.');return google.emails(q);});
handle('open-link',open);handle('panel',tab=>showPanel(['chat','agenda','emails','memory','settings','daily','personal'].includes(tab)?tab:'chat'));
handle('hide-panel',collapse);handle('pet-menu',petMenu);handle('toggle-panel',()=>expanded?collapse():showPanel(read().key?'chat':'settings'));
handle('focus-action',async action=>{await save({focusTimer:focusAction(read(),action)});broadcast('focus-update',focusView(read()));return focusView(read());});
handle('play-motion',playMotion);
handle('begin-gesture',mode=>beginGesture(mode));handle('end-gesture',endGesture);
handle('pet-state',state=>broadcast('pet-state',['idle','waving','jumping','walking','flying','coffee'].includes(state)?state:'idle'));
if(!app.requestSingleInstanceLock()&&!smoke)app.quit();else{
app.on('second-instance',()=>win&&showPanel('chat'));
app.whenReady().then(async()=>{
 Menu.setApplicationMenu(null);
 store=createStore({file:path.join(app.getPath('userData'),'cofre.bin'),encrypt,decrypt,initial});
 try{await store.load();}catch{await dialog.showMessageBox({type:'error',title:'Aluguito',message:'Não foi possível abrir as configurações protegidas.',detail:'Seus dados foram preservados. Feche e abra o Aluguito novamente na mesma conta do Windows. O aplicativo não vai substituir sua chave nem suas conversas por dados vazios.',buttons:['Fechar']});app.exit(1);return;}
 const modelPatch=!read().modelMigrated020&&['gemini-2.5-flash','gemini-3.5-flash'].includes(read().model)?{model:'gemini-3.5-flash-lite'}:{};
 const layoutPatch=!read().layoutMigrated021&&read().petScale===1?{petScale:.8}:{};
 await save({...migrateProfiles(read()),...migrateConversations(read()),history:[],...modelPatch,...layoutPatch,modelMigrated020:true,layoutMigrated021:true});
 google=new Google({read,save,open});
 mcp=new McpProfiles({read,save,open:url=>shell.openExternal(mcpUrl(url))});
 const area=screen.getPrimaryDisplay().workArea;
 const anchor=read().petAnchor||{right:area.x+area.width-12,bottom:area.y+area.height-12};
 const initialSize=petSize(read().petScale);petRect={x:anchor.right-initialSize.width,y:anchor.bottom-initialSize.height,...initialSize};
 win=new BrowserWindow({...petRect,show:false,frame:false,transparent:true,roundedCorners:true,resizable:false,alwaysOnTop:true,skipTaskbar:true,autoHideMenuBar:true,title:'Aluguito',icon:path.join(__dirname,'../assets/icon.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
 win.webContents.setWindowOpenHandler(({url})=>{open(url).catch(()=>{});return{action:'deny'};});
 win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.session.setPermissionRequestHandler((_wc,_p,callback)=>callback(false));
 win.webContents.on('context-menu',(_event,params)=>{const items=[];if(params.isEditable)items.push({role:'undo',label:'Desfazer'},{role:'redo',label:'Refazer'},{type:'separator'},{role:'cut',label:'Recortar'},{role:'copy',label:'Copiar'},{role:'paste',label:'Colar'},{role:'selectAll',label:'Selecionar tudo'});else if(params.selectionText)items.push({role:'copy',label:'Copiar'});if(items.length)Menu.buildFromTemplate(items).popup({window:win});});
 win.on('close',e=>{if(!quitting&&!smoke){e.preventDefault();win.hide();}});
 win.on('move',()=>{if(applyingLayout||!liveLayout)return;const b=win.getBounds(),dx=b.x-liveLayout.bounds.x,dy=b.y-liveLayout.bounds.y;if(!dx&&!dy)return;petRect={...petRect,x:petRect.x+dx,y:petRect.y+dy};liveLayout={...liveLayout,bounds:b,pet:{...petRect},panel:liveLayout.panel?{...liveLayout.panel,x:liveLayout.panel.x+dx,y:liveLayout.panel.y+dy}:null};if(!smoke){clearTimeout(moveTimer);moveTimer=setTimeout(()=>saveAnchor().catch(()=>{}),400);}});
 win.on('blur',()=>{if(gesture&&!smoke)endGesture().catch(()=>{});});
 await win.loadFile(path.join(__dirname,'index.html'));resizeWindow();
 if(smoke){try{
  const assert=require('node:assert/strict');const marker='aluguito-regression-key';
  const retained=await win.webContents.executeJavaScript(`(async()=>{await window.aluguito.call('settings',{key:'${marker}',model:'gemini-3.5-flash-lite'});return(await window.aluguito.call('settings',{key:''})).hasKey})()`);assert.equal(retained,true);
  await store.load();assert.equal(read().key,marker);const bytes=await fs.readFile(path.join(app.getPath('userData'),'cofre.bin'));assert.equal(bytes.includes(Buffer.from(marker)),false);
  const closed=await win.webContents.executeJavaScript('document.querySelector("#conversation-panel").hidden');assert.equal(closed,true);
  const qaDir=process.env.ALUGUITO_QA_DIR||app.getPath('userData');await fs.mkdir(qaDir,{recursive:true});
  showPanel('chat');
  await win.webContents.executeJavaScript("ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))");
  await fs.writeFile(path.join(qaDir, 'Aluguito-primeiro-uso.png'), (await win.webContents.capturePage()).toPNG());
  const ui=await win.webContents.executeJavaScript('window.runSmoke()');assert.equal(ui.toolbarWorks,true);assert.equal(ui.nestedSettings,true);assert.equal(ui.nameIntroWorks,true);assert.equal(ui.historyDrawerWorks,true);assert.equal(ui.settingsCategories,true);assert.equal(ui.settingsModalWorks,true);assert.equal(ui.memoryWorks,true);assert.equal(ui.multipleMcpWorks,true);assert.equal(ui.keyNotExposed,true);assert.equal(ui.savedKeyVisible,true);assert.equal(ui.markdownSafe,true);assert.equal(ui.noOverflow,true);assert.equal(ui.imagesSafe,true);assert.equal(ui.historyWorks,true);assert.equal(ui.sideBySide,true);assert.equal(BrowserWindow.getAllWindows().length,1);
  const personalWorks = await win.webContents.executeJavaScript(
   '(async()=>{const before=(await api.call("status")).history.length;' +
   '$("message").value="Me lembra de ir à academia às 18h nas segundas, quartas e sextas";' +
   'await $("chat-form").onsubmit({preventDefault(){}});' +
   'const drafted=!$("personal-reminders").hidden&&$("messages").hidden&&$("daily-overview").hidden&&' +
   '$("personal-title").value==="ir à academia"&&$("personal-time").value==="18:00";' +
   'await $("personal-form").onsubmit({preventDefault(){}});' +
   'const rows=await api.call("personal-list");' +
   'return drafted&&rows.length===1&&rows[0].days.join(",")==="1,3,5"&&' +
   '$("personal-list").textContent.includes("ir à academia")&&' +
   '(await api.call("status")).history.length===before;})()'
  );
  assert.equal(personalWorks,true);
  await store.load();
  assert.equal(personal.list().length,1);
  await win.webContents.executeJavaScript("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  await fs.writeFile(path.join(qaDir,'Aluguito-pessoal.png'),(await win.webContents.capturePage()).toPNG());
  await personal.act(personal.list()[0].id,'remove');
  await win.webContents.executeJavaScript('closePersonal()');
  const realGoogleRequest = google.request;
  await save({googleTokens:{access_token:'fake-google',expires_at:Date.now()+3600000},key:null});
  try {
   google.request = async address => {
    const url = new URL(address, 'https://www.googleapis.com');
    if (url.pathname.endsWith('/messages')) {
     const query = url.searchParams.get('q');
     assert.ok(/from:"Aurora"/.test(query) || query === 'in:inbox newer_than:7d is:unread {is:important is:starred}');
     return {messages:[{id:'smoke-mail'}]};
    }
    if (url.pathname.endsWith('/messages/smoke-mail')) {
     return {snippet:'Prévia de teste',payload:{headers:[
      {name:'Subject',value:'Relatório da Aurora'}, {name:'From',value:'Equipe de teste'}
     ]}};
    }
    assert.match(url.pathname, /calendar/);
    const start = new Date(url.searchParams.get('timeMin'));
    const end = new Date(url.searchParams.get('timeMax'));
    assert.equal(start.getHours(), 0);
    assert.equal(end.getHours(), 0);
    assert.equal(end.getDate(), new Date(start.getFullYear(), start.getMonth(), start.getDate()+1).getDate());
    return {items:[{summary:'Reunião de revisão',start:{dateTime:new Date(start.getTime()+3600000).toISOString()}}]};
   };
   const verified = await win.webContents.executeJavaScript(
    '(async()=>{renderState(await api.call("status"));navigate("chat");' +
    'for(const [text,expected] of [["Nada da Aurora nos e-mails?","Relatório da Aurora"],' +
    '["Tenho algum compromisso hoje?","Reunião de revisão"]]){' +
    '$("message").value=text;await $("chat-form").onsubmit({preventDefault(){}});' +
    'if(!$("messages").textContent.includes(expected))return false;}' +
    'return state.history.slice(-4).every(turn=>turn.private&&turn.scope==="google:lookup");})()'
   );
   assert.equal(verified, true);
   const initialProfile = mcp.config();
   const dailyTool = {name:'listar_tarefas',inputSchema:{type:'object'},annotations:{readOnlyHint:true}};
   const dailyIds = [initialProfile.id];
   for (const name of ['Estúdio', 'Sem permissão', 'Indisponível']) dailyIds.push(await mcp.add(name));
   const called = [];
   const today = new Date();
   const localToday = [today.getFullYear(), today.getMonth()+1, today.getDate()]
    .map((value, index) => String(value).padStart(index ? 2 : 4, '0')).join('-');
   for (const [index, id] of dailyIds.entries()) {
    const tool = index === 1 ? {...dailyTool, name:'list_tasks'} : dailyTool;
    await mcp.update(id, {mcpConnected:true,mcpTools:[tool],mcpAllowed:index === 2 ? [] : [tool.name]});
    const connection = mcp.connection(id);
    connection.tools = [tool];
    connection.client = {close: async () => {}, callTool: async call => {
     called.push(id);
     assert.deepEqual(call, {name: tool.name, arguments: {}});
     if (index === 3) throw new Error('Servidor de teste indisponível');
     const task = index === 0 ? {titulo:'Revisar proposta',data_vencimento:'2020-01-01'} :
      {title:'Enviar materiais',due_date:localToday};
     return index === 0 ? {structuredContent:{tarefas:[task,{titulo:'Ocultar concluída',status:'Concluída'}]}} :
      {content:[{type:'text',text:JSON.stringify({tasks:[task]})}]};
    }};
   }
   try {
    const verifiedDaily = await win.webContents.executeJavaScript(
     '(async()=>{const before=(await api.call("status")).history.length;const button=$("open-daily");' +
     'await button.onclick();const card=$("daily-overview"), text=card.textContent;' +
     'const buttonWorks=!card.hidden&&button.getAttribute("aria-expanded")==="true"&&' +
     'card.querySelectorAll("h3").length===3&&text.includes("Reunião de revisão")&&' +
     'text.includes("Relatório da Aurora")&&text.includes("Vence hoje")&&' +
     'text.includes("Indisponíveis: Indisponível")&&!text.includes("Sem permissão")&&' +
     '!text.includes("Ocultar concluída")&&text.indexOf("Revisar proposta")<text.indexOf("Enviar materiais");' +
     '$("close-daily").click();const focus=card.hidden&&document.activeElement===button;' +
     '$("message").value="O que eu tenho para hoje?";await $("chat-form").onsubmit({preventDefault(){}});' +
     'return buttonWorks&&focus&&!card.hidden&&(await api.call("status")).history.length===before;})()'
    );
    assert.equal(verifiedDaily, true);
    assert.deepEqual(called.sort(), [dailyIds[0],dailyIds[1],dailyIds[3],dailyIds[0],dailyIds[1],dailyIds[3]].sort());
    await win.webContents.executeJavaScript("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    await fs.writeFile(path.join(qaDir, 'Aluguito-meu-dia.png'), (await win.webContents.capturePage()).toPNG());
    const savedGoogle = read().googleTokens;
    await save({googleTokens:null});
    const withoutGoogle = await dailyOverview({google, mcp, data:read()});
    assert.equal(withoutGoogle.agenda.status, 'disconnected');
    assert.equal(withoutGoogle.emails.status, 'disconnected');
    assert.equal(withoutGoogle.tasks.length, 2);
    await save({googleTokens:savedGoogle});
    await win.webContents.executeJavaScript('closeDaily()');
   } finally {
    await mcp.connection(initialProfile.id).close();
    await mcp.update(initialProfile.id, {
     mcpConnected:initialProfile.mcpConnected,mcpTools:initialProfile.mcpTools,mcpAllowed:initialProfile.mcpAllowed
    });
    for (const id of dailyIds.slice(1)) await mcp.remove(id);
    await mcp.select(initialProfile.id);
   }
  } finally {
   google.request = realGoogleRequest;
   await save({googleTokens:null,key:marker});
  }
  const profileId = mcp.selected;
  const writes = ['criar_tarefa','mudar_status_tarefa','importar_posts_instagram','atualizar_metricas_instagram'];
  await mcp.update(profileId, {mcpUrl:'https://example.com/mcp',mcpConnected:true,
   mcpTools:writes.map(name=>({name,annotations:{readOnlyHint:false}})),mcpTokens:{access_token:'fake-mcp'}});
  const selectionSaved = await win.webContents.executeJavaScript(
   '(async()=>{renderState(await api.call("status"));openSettings("mcp");' +
   'const rows=[...document.querySelectorAll(".mcp-tool")];' +
   'if(rows.length!==4||rows.some(row=>row.disabled||row.checked))return false;' +
   'for(const row of rows)row.checked=true;return (await saveSettings()).mcpAllowed.length===4;})()'
  );
  assert.equal(selectionSaved, true);
  assert.equal(mcp.config(profileId).mcpTokens.access_token,'fake-mcp');
  await mcp.update(profileId,{mcpUrl:'',mcpConnected:false,mcpTools:[],mcpAllowed:[],mcpTokens:null});
  await save({memory:memoryValue({text:'# Memória de teste',enabled:true})});await store.load();assert.equal(read().memory.text,'# Memória de teste');assert.equal(read().namePromptSeen,true);assert.equal(read().key,marker);await save({memory:memoryValue({text:'',enabled:false})});
  const focusStarted=await win.webContents.executeJavaScript("window.aluguito.call('focus-action','start')");assert.equal(focusStarted.running,true);const focusPaused=await win.webContents.executeJavaScript("window.aluguito.call('focus-action','pause')");assert.equal(focusPaused.running,false);await win.webContents.executeJavaScript("window.aluguito.call('focus-action','reset')");
  const skinDir=path.join(app.getPath('userData'),'skins');await fs.mkdir(skinDir,{recursive:true});await fs.copyFile(path.join(__dirname,'../assets/aluguito.png'),path.join(skinDir,'qa.png'));await save({skins:[{id:'qa',name:'Skin de teste'}]});
  const skinBefore={...petRect};await win.webContents.executeJavaScript("window.aluguito.call('select-skin','qa')");assert.ok((await win.webContents.executeJavaScript("window.aluguito.call('skin-image')")).url.startsWith('data:image/png;base64,'));assert.deepEqual(petRect,skinBefore);
  await fs.copyFile(path.join(__dirname,'../assets/icon.png'),path.join(skinDir,'qa-static.png'));await save({skins:[...read().skins,{id:'qa-static',name:'Imagem de teste',animated:false}]});await win.webContents.executeJavaScript("window.aluguito.call('select-skin','qa-static')");assert.equal(await win.webContents.executeJavaScript("(async()=>{for(let n=0;n<20;n++){const img=document.getElementById('sprite');if(img.classList.contains('static-skin'))return getComputedStyle(img).width==='192px';await new Promise(r=>setTimeout(r,20));}return false;})()"),true);
  await win.webContents.executeJavaScript("window.aluguito.call('select-skin','default')");await save({skins:[]});
  const beforePanelMove={...petRect};beginGesture('panel-move',{x:0,y:0},true);applyGesturePoint({x:14,y:12});await endGesture();assert.deepEqual(petRect,beforePanelMove);assert.equal(read().conversationPosition,'free');
  const previousWidth=liveLayout.panel.width;beginGesture('panel-e',{x:0,y:0},true);applyGesturePoint({x:40,y:0});await endGesture();assert.ok(liveLayout.panel.width>=previousWidth);assert.deepEqual(petRect,beforePanelMove);
  beginGesture('pet-resize',{x:0,y:0},true);applyGesturePoint({x:-24,y:-24});await endGesture();assert.ok(read().petScale<.8);await setScale(.8);await setConversation('left',{width:520,height:640});
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const petPoint=()=>win.webContents.executeJavaScript('(()=>{const r=document.getElementById("talk").getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');
  win.show();win.focus();await pause(200);let point=await petPoint();win.webContents.sendInputEvent({type:'mouseMove',...point});await pause(50);win.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});for(let attempt=0;attempt<20&&!gesture;attempt++)await pause(30);assert.equal(gesture?.mode,'pet-move');clearInterval(gestureTimer);applyGesturePoint({x:gesture.start.x-18,y:gesture.start.y-10});await pause(40);point=await petPoint();win.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});await pause(100);await store.flush();assert.equal(gesture,null);assert.equal(expanded,true);
  async function activatePet() {
   const previous = expanded;
   await win.webContents.executeJavaScript("document.getElementById('talk').click()");
   for (let attempt = 0; attempt < 30 && expanded === previous; attempt++) await pause(20);
  }
  await activatePet();assert.equal(expanded,false);await activatePet();assert.equal(expanded,true);
  await setConversation('left',{width:340,height:420});await pause(30);assert.equal(await win.webContents.executeJavaScript('(()=>{const p=document.getElementById("conversation-panel");return p.scrollWidth<=p.clientWidth})()'),true);await setConversation('left',{width:520,height:640});
  win.show();await new Promise(r=>setTimeout(r,400));
  await fs.writeFile(path.join(qaDir,'Aluguito-previa.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript("navigate('chat');setHistoryOpen(true)");
  await pause(100);
  await fs.writeFile(path.join(qaDir, 'Aluguito-conversas.png'), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript("openSettings('system')");
  await pause(100);
  await fs.writeFile(path.join(qaDir, 'Aluguito-assinatura.png'), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript("openSettings('appearance')");
  await pause(100);
  await fs.writeFile(path.join(qaDir, 'Aluguito-ajustes.png'), (await win.webContents.capturePage()).toPNG());
  await setConversation('left',{width:340,height:400});
  await win.webContents.executeJavaScript("navigate('chat')");
  await pause(100);
  assert.equal(await win.webContents.executeJavaScript(
   "(() => {const bar=document.querySelector('.mast');return bar.scrollWidth<=bar.clientWidth;})()"
  ),true);
  await fs.writeFile(path.join(qaDir, 'Aluguito-conversa-compacta.png'), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript("openSettings('mcp')");
  await pause(100);
  const compactSettings = await win.webContents.executeJavaScript(
   "(() => {const p=document.querySelector('.settings-content'); const f=document.querySelector('.settings-footer'); return p.scrollHeight>p.clientHeight && p.scrollWidth<=p.clientWidth && f.getBoundingClientRect().bottom<=innerHeight;})()"
  );
  assert.equal(compactSettings, true);
  await fs.writeFile(path.join(qaDir, 'Aluguito-ajustes-compacto.png'), (await win.webContents.capturePage()).toPNG());
  await setConversation('left',{width:520,height:640});
  await save({memory:memoryValue({text:'# Sobre mim\n\n## Preferências\n- Prefiro respostas objetivas em português.\n- Organize as tarefas por prazo.\n\n## Meus projetos\n- Alugo Ideias: clarear ideias e criar soluções.\n- Explora: guia de aprendizagem.',enabled:true})});await win.webContents.executeJavaScript("(async()=>{renderState(await window.aluguito.call('status'));navigate('memory')})()");await pause(100);await fs.writeFile(path.join(qaDir,'Aluguito-memoria.png'),(await win.webContents.capturePage()).toPNG());await save({memory:memoryValue({text:'',enabled:false})});
  showPanel('chat');
  await win.webContents.executeJavaScript("(async()=>{renderState(await window.aluguito.call('status'));navigate('chat')})()");
  await pause(80);
  for(const id of ['cartoon','natal','aventureiro']){await win.webContents.executeJavaScript("window.aluguito.call('select-skin','"+id+"')");await pause(200);assert.equal(await win.webContents.executeJavaScript("document.getElementById('sprite').dataset.format"),'atlas24');broadcast('pet-state','idle');await pause(80);
   const animatedFace = await win.webContents.executeJavaScript("(async()=>{const canvas=document.getElementById('pet-animation');const ctx=canvas.getContext('2d'); const before=ctx.getImageData(65,72,70,32).data;await new Promise(r=>setTimeout(r,240));const after=ctx.getImageData(65,72,70,32).data;return !canvas.hidden&&canvas.classList.contains('soft-palette')&&before.some((value,index)=>value!==after[index])})()");
   assert.equal(animatedFace,true);
   await fs.writeFile(path.join(qaDir,'Aluguito-'+id+'.png'),(await win.webContents.capturePage()).toPNG());const anchor={...petRect},bounds=win.getBounds();await playMotion('coffee');await pause(350);assert.deepEqual(petRect,anchor);assert.deepEqual(win.getBounds(),bounds);await fs.writeFile(path.join(qaDir,'Aluguito-'+id+'-cafe.png'),(await win.webContents.capturePage()).toPNG());stopMotion();}
  await win.webContents.executeJavaScript("window.aluguito.call('select-skin','cientista')");
  const scientistWorks = await win.webContents.executeJavaScript(
   '(async()=>{for(let n=0;n<40;n++){if(skinData?.id==="cientista"&&petAnimation?.frame)break;' +
   'await new Promise(r=>setTimeout(r,50));}if(!petAnimation?.frame)return false;' +
   'for(const motion of ["walking","jumping","flying","coffee","idle"]){' +
   'changePet(motion);if(animationCanvas.hidden)return false;}return true;})()'
  );
  assert.equal(scientistWorks,true);
  await win.webContents.executeJavaScript("window.aluguito.call('select-skin','natal')");await pause(100);await playMotion('coffee');await pause(350);assert.equal(await win.webContents.executeJavaScript("document.getElementById('sprite').dataset.motion"),'coffee');await fs.writeFile(path.join(qaDir,'Aluguito-coffee.png'),(await win.webContents.capturePage()).toPNG());stopMotion();
  await win.webContents.executeJavaScript("window.aluguito.call('select-skin','default')");
  collapse();const anchorBefore={...petRect},boundsBefore=win.getBounds();
  for(const type of ['walking','flying','jumping','coffee']){await playMotion(type);assert.ok(motionStop);await pause(250);assert.deepEqual(petRect,anchorBefore);assert.deepEqual(win.getBounds(),boundsBefore);assert.equal(await win.webContents.executeJavaScript("document.getElementById('sprite').dataset.motion"),type);stopMotion();}
  const daytime = new Date(2026, 10, 26, 12);
  nextAmbientAt = +daytime - 1;
  maybeAnimate(new Date(2026, 10, 26, 2));
  assert.equal(motionStop, null);
  await save({focusTimer: focusAction(read(), 'start')});
  maybeAnimate(daytime);
  assert.equal(motionStop, null);
  await save({focusTimer: focusAction(read(), 'reset')});
  maybeAnimate(daytime);
  assert.ok(motionStop);
  await pause(100);
  const spontaneous = await win.webContents.executeJavaScript("document.getElementById('sprite').dataset.motion");
  assert.ok(ambientMotions.includes(spontaneous));
  assert.deepEqual(win.getBounds(), boundsBefore);
  stopMotion();
  nextAmbientAt = +daytime - 1;
  maybeAnimate(daytime);
  assert.notEqual(previousAmbient, spontaneous);
  stopMotion();
  await save({ambientMotion:false});
  maybeAnimate(daytime);
  assert.equal(motionStop, null);
  assert.equal(BrowserWindow.getAllWindows().length,1);assert.equal(await win.webContents.executeJavaScript('document.querySelector("#conversation-panel").hidden'),true);
  if (process.env.ALUGUITO_MOTION_QA) {
   const frames = {
    idle: [0, 220, 410, 820, 860, 945],
    coffee: [700, 1800, 3300, 4020, 4900, 6450],
    walking: [0, 180, 360, 540, 720, 900],
    jumping: [0, 180, 360, 540, 720, 900],
    flying: [0, 180, 360, 540, 720, 900]
   };
   await win.webContents.executeJavaScript('clearInterval(spriteTick)');
   for (const {id} of builtins) {
    await win.webContents.executeJavaScript('window.aluguito.call("select-skin",' + JSON.stringify(id) + ')');
    const loaded = await win.webContents.executeJavaScript(
     '(async()=>{for(let n=0;n<40;n++){if(skinData?.id===' + JSON.stringify(id) +
     '&&petAnimation?.coffee)return true;await new Promise(r=>setTimeout(r,50));}return false;})()'
    );
    assert.equal(loaded, true);
    if (process.env.ALUGUITO_COFFEE_CLIP) {
     const sequence = await win.webContents.executeJavaScript(
      '(() => {changePet("coffee");clearInterval(animationTick);clearTimeout(petReset);' +
      'const preview=new OffscreenCanvas(192,208);const ctx=preview.getContext("2d");' +
      'const filter=getComputedStyle(animationCanvas).filter;const images=[];' +
      'const buffer=document.createElement("canvas");buffer.width=192;buffer.height=208;const out=buffer.getContext("2d");' +
      'for(let t=0;t<skinData.coffeeDuration;t+=100){petAnimation.coffee(t,"coffee");' +
      'ctx.clearRect(0,0,192,208);ctx.filter=filter;ctx.drawImage(animationCanvas,0,0);' +
      'out.clearRect(0,0,192,208);out.drawImage(preview,0,0);images.push(buffer.toDataURL("image/png").split(",")[1]);}' +
      'return images;})()'
     );
     assert.equal(sequence.length * 100, coffeeDuration);
     const clips = path.join(qaDir, 'coffee-clips', id);
     await fs.mkdir(clips,{recursive:true});
     await Promise.all(sequence.map((encoded,index)=>fs.writeFile(
      path.join(clips,String(index).padStart(2,'0')+'.png'), Buffer.from(encoded,'base64')
     )));
    }
    for (const [motion, times] of Object.entries(frames)) {
     for (let i = 0; i < times.length; i++) {
      const time = times[i];
      const shot = await win.webContents.executeJavaScript(
       '(() => {changePet(' + JSON.stringify(motion) + '); clearInterval(animationTick); clearTimeout(petReset);' +
       'for(const animation of petFrameBox.getAnimations()){animation.pause();animation.currentTime=' + time + ';}' +
       'if (!animationCanvas.hidden && (petState==="coffee" || idleStates.includes(petState))) {const draw=petState==="coffee"?petAnimation.coffee:petAnimation.idle;draw(' + time + ',petState);}' +
       'else {petFrame=' + Math.floor(time / 180) + ';drawPetFrame();}' +
       'const box=talk.getBoundingClientRect(); return {x:Math.floor(box.x),y:Math.floor(box.y),width:Math.ceil(box.width),height:Math.ceil(box.height)};' +
       '})()'
      );
      await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const capture = await win.webContents.capturePage(shot);
      await fs.writeFile(path.join(qaDir, id + '-' + motion + '-' + i + '.png'), capture.toPNG());
     }
    }
   }
  }
  console.log(JSON.stringify({passed:true,ui,googleAccountChat:true,personalReminders:true,dailyOverview:true,mcpWriteSettings:true,compactSettings:true,animatedFace:true,ambientMotion:true,pomodoro:true,coffeeAnimation:true,scientistWorks,animatedSkins:true,walkingAndFlying:true,anchoredMotions:true,plainCartoon:true,freeResize:true,independentPanelMove:true,mouseDrag:true,mascotActivation:true,singleWindow:true,collapsed:true,keyRetainedAfterReload:true,encryptedStorage:true}));app.exit(0);
 }catch(e){await fs.writeFile(path.join(app.getPath('userData'),'failure.png'),(await win.webContents.capturePage()).toPNG()).catch(()=>{});console.error(redactError(e.stack||e));app.exit(1);}}else{
  focusInterval=setInterval(focusTick,1000);focusTick();win.show();tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'../assets/icon.png')).crop({x:76,y:63,width:104,height:83}).resize({width:32}));tray.setToolTip('Aluguito');tray.setContextMenu(Menu.buildFromTemplate([{label:'Conversar',click:()=>showPanel('chat')},{label:'Agenda',click:()=>showPanel('agenda')},{label:'Meu dia',click:()=>showPanel('daily')},{label:'Pessoal',click:()=>showPanel('personal')},{label:'Ajustes',click:()=>showPanel('settings')},{label:'Mostrar Aluguito',click:()=>{win.show();win.focus();}},{type:'separator'},{label:'Sair',click:()=>app.quit()}]));tray.on('double-click',()=>{win.show();win.focus();});setInterval(reminders,30000);reminders();
  if (process.platform === 'win32' && app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE &&
      existsSync(path.join(process.resourcesPath,'app-update.yml'))) {
   const identity = require('../package.json').aluguitoReleaseVerification;
   const verifyDownloaded = identity === undefined ? undefined : createReleaseVerifier(identity);
   updates = createUpdater(require('electron-updater').autoUpdater, {
    verifyDownloaded,
    changed: state => broadcast('update-status', state),
    ready: state => {
     if (!Notification.isSupported()) return;
     const message = new Notification({title:'Aluguito · Atualização pronta',
      body:'A versão ' + state.version + ' será instalada quando você escolher reiniciar.',
      icon:path.join(__dirname,'../assets/icon.png')});
     message.on('click', () => showPanel('system'));
     message.show();
    },
    beforeInstall: async () => {
     if (chatBusy || mcp.pending || google.pending || gesture || workTickBusy) {
      throw new Error('Aguarde a operação atual terminar e tente reiniciar de novo.');
     }
     await store.flush();
    }
   });
   broadcast('update-status', updates.status());
   setTimeout(() => { if (!quitting) updates.check(); }, 8000).unref();
   updateInterval = setInterval(() => updates.check(), 6 * 3600000);
  }
  personalInterval=setInterval(personalTick,5000);personalTick();
  workInterval=setInterval(workTick,5*60000);workTick();
 }
}).catch(e=>{console.error(redactError(e));app.exit(1);});}
app.on('before-quit',event=>{if(!quitting&&store){event.preventDefault();quitting=true;clearInterval(focusInterval);clearInterval(personalInterval);clearInterval(workInterval);clearInterval(updateInterval);stopMotion();clearTimeout(moveTimer);clearInterval(gestureTimer);clearTimeout(gestureTimeout);Promise.all([store.flush().catch(()=>{}),mcp?.close().catch(()=>{})]).finally(()=>app.quit());}});
app.on('window-all-closed',()=>{if(quitting)app.quit();});
