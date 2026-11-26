const companionApi=window.aluguito,sprite=document.getElementById('sprite');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const originalStates={idle:{row:0,count:6},waving:{row:3,count:4},thinking:{row:6,count:6},jumping:{row:4,count:5},walking:{row:1,count:8},flying:{row:4,count:1,start:2}};const atlasStates={idle:{row:0,count:6},waving:{row:0,count:6},thinking:{row:0,count:6},jumping:{row:2,count:6},walking:{row:1,count:6},flying:{row:3,count:6}};let petStates=originalStates,cellHeight=208,rowCount=11,skinData=null;
let focusStatus=null,toastText='',toastTimer;function updateBubble(){const b=document.getElementById('bubble');b.textContent=toastText||(focusStatus?.running?focusStatus.label:document.body.classList.contains('collapsed')?'Vamos conversar?':'Recolher conversa');b.title=toastText||'Abrir ou recolher conversa';const q=document.getElementById('focus-quick');q.title=focusStatus?.running?'Pausar Pomodoro ('+focusStatus.label+')':'Iniciar Pomodoro';q.setAttribute('aria-label',q.title);}
let petState='idle',petFrame=0,petReset;
let petAnimation, animationTick, motionStarted = performance.now();
const animationCanvas = document.getElementById('pet-animation');
const idleStates = ['idle', 'waving', 'thinking'];
function syncPetAnimation() {
 clearInterval(animationTick);
 const coffee = petState === 'coffee';
 const draw = coffee ? petAnimation?.coffee : idleStates.includes(petState) && petAnimation?.idle;
 animationCanvas.hidden = !draw || (reducedMotion.matches && !coffee);
 if (animationCanvas.hidden) return;
 if (reducedMotion.matches) {
  draw(1000, petState);
  return;
 }
 const render = () => {
  if (!document.hidden) draw(performance.now() - motionStarted, petState);
 };
 render();
 animationTick = setInterval(render, 42);
}
reducedMotion.addEventListener('change', syncPetAnimation);
const petArt = sprite.parentElement;
const petFrameBox = petArt.parentElement;
function applySkinVisual() {
 const coffee = petState === 'coffee' && !petAnimation?.coffee;
 const atlas = coffee || skinData?.format === 'atlas24';
 const staticImage = !coffee && skinData?.animated === false;
 petStates = atlas ? atlasStates : originalStates;
 cellHeight = atlas ? 192 : 208;
 rowCount = atlas ? 4 : skinData?.rows || 11;
 sprite.style.width = (staticImage ? 192 : atlas ? 1152 : 1536) + 'px';
 sprite.style.height = (staticImage ? 208 : rowCount * cellHeight) + 'px';
 sprite.style.top = atlas ? '16px' : '0';
 sprite.classList.toggle('static-skin', staticImage);
 sprite.classList.toggle('smooth-skin', (atlas && (!coffee || skinData?.coffeeRow !== 0)) || staticImage);
 for (const element of [sprite, animationCanvas]) {
  element.classList.toggle('soft-palette', Boolean(skinData?.softPalette));
 }
 animationCanvas.classList.toggle('pixel-art', skinData?.id === 'default');
 const src = (coffee ? skinData?.coffeeUrl : skinData?.url) || '../assets/aluguito.png';
 if (sprite.getAttribute('src') !== src) sprite.src = src;
 sprite.dataset.motion = petState;
 petFrameBox.classList.toggle('flight-effect', petState === 'flying');
 syncPetAnimation();
}
function drawPetFrame() {
 const coffee = petState === 'coffee' && !petAnimation?.coffee;
 const step = coffee ? {row: skinData?.coffeeRow || 0, count: 6} : petStates[petState] || petStates.idle;
 const steady = reducedMotion.matches || (petState === 'coffee' && !coffee);
 const frame = (steady ? 0 : petFrame % step.count) + (step.start || 0);
 const columns = coffee || petStates === atlasStates ? 6 : 8;
 sprite.style.transform = 'translate(' + (-frame * 192) + 'px,' + (-step.row * cellHeight) + 'px)';
 sprite.style.clipPath = sprite.classList.contains('static-skin') ? 'none' :
  'inset(' + (step.row * cellHeight) + 'px ' + ((columns - frame - 1) * 192) + 'px ' +
  ((rowCount - step.row - 1) * cellHeight) + 'px ' + (frame * 192) + 'px)';
}
function changePet(next) {
 petState = next === 'coffee' || petStates[next] ? next : 'idle';
 petFrame = 0;
 motionStarted = performance.now();
 clearTimeout(petReset);
 applySkinVisual();
 const durations = {coffee: petAnimation?.coffee ? skinData.coffeeDuration : 2160, jumping: petStates.jumping.count * 180, waving: 1400};
 if (durations[petState]) petReset = setTimeout(() => changePet('idle'), durations[petState]);
 drawPetFrame();
}
function place(element,rect){if(!rect)return;for(const [css,key]of[['left','x'],['top','y'],['width','width'],['height','height']])element.style[css]=rect[key]+'px';if(element.id==='conversation-panel')element.classList.toggle('compact',rect.width<430);}
function appearance(value){document.body.classList.toggle('collapsed',!value.expanded);document.getElementById('conversation-panel').hidden=!value.expanded;document.documentElement.style.setProperty('--pet-scale',value.petScale||.8);updateBubble();if(value.layout){place(document.querySelector('.companion'),value.layout.pet);place(document.getElementById('conversation-panel'),value.layout.panel);}}
function bindGesture(element,mode,onClick){let active=null;
 element.addEventListener('pointerdown',event=>{if(event.button!==0||active!==null)return;if(mode==='panel-move'&&event.target.closest('button,input,select,a,textarea'))return;event.preventDefault();active=event.pointerId;element.setPointerCapture(active);document.body.classList.add('gesturing');companionApi.call('begin-gesture',mode).catch(()=>{});});
 async function end(event,cancelled=false){if(active!==event.pointerId)return;const id=active;active=null;if(element.hasPointerCapture(id))element.releasePointerCapture(id);document.body.classList.remove('gesturing');try{const result=await companionApi.call('end-gesture');if(!cancelled&&!result.moved&&onClick)onClick();}catch{}}
 element.addEventListener('pointerup',event=>end(event));element.addEventListener('pointercancel',event=>end(event,true));element.addEventListener('lostpointercapture',event=>end(event,true));
}
function toggle(){changePet('waving');companionApi.call('toggle-panel').catch(()=>{});}
const spriteTick = setInterval(() => { petFrame++; drawPetFrame(); }, 180);companionApi.on('pet-state',changePet);companionApi.on('appearance',appearance);
const talk=document.getElementById('talk');bindGesture(talk,'pet-move',toggle);talk.onclick=event=>{if(event.detail===0)toggle();};
document.getElementById('bubble').onclick=toggle;
document.getElementById('pet-menu').onclick=()=>companionApi.call('pet-menu').catch(()=>{});
const visual=document.createElement('div');visual.className='pet-visual';talk.replaceWith(visual);visual.append(talk);
const petResize=document.createElement('button');petResize.className='pet-resize';petResize.textContent='↘';petResize.title='Arraste para redimensionar o Aluguito';petResize.setAttribute('aria-label',petResize.title);visual.append(petResize);bindGesture(petResize,'pet-resize');
bindGesture(document.querySelector('.mast'),'panel-move');
bindGesture(document.querySelector('.settings-header'),'panel-move');
for(const direction of['n','s','e','w','ne','nw','se','sw']){const handle=document.createElement('div');handle.className='panel-resize '+direction;handle.title='Arraste para redimensionar a conversa';handle.setAttribute('aria-hidden','true');document.getElementById('conversation-panel').append(handle);bindGesture(handle,'panel-'+direction);}
document.querySelector('.companion').addEventListener('contextmenu',event=>{event.preventDefault();companionApi.call('pet-menu').catch(()=>{});});
companionApi.call('status').then(value=>{focusStatus=value.focus;appearance(value);}).catch(()=>{});
companionApi.on('focus-update',value=>{focusStatus=value;updateBubble();});companionApi.on('pet-toast',text=>{toastText=text;updateBubble();clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toastText='';updateBubble();},12000);});document.getElementById('focus-quick').onclick=()=>companionApi.call('focus-action',focusStatus?.running?'pause':'start').then(value=>{focusStatus=value;updateBubble();}).catch(()=>{});

let skinLoad = 0;
async function loadSkin() {
 const ticket = ++skinLoad;
 try {
  const image = await companionApi.call('skin-image');
  const animation = image && await createPetAnimation(animationCanvas, image.url, image.id)?.catch(() => null);
  if (ticket !== skinLoad) return;
  skinData = image;
  petAnimation = animation;
  sprite.dataset.format = image?.format || 'original';
  motionStarted = performance.now();
  applySkinVisual();
  petFrame = 0;
  drawPetFrame();
 } catch {
  if (ticket !== skinLoad) return;
  petAnimation = null;
  skinData = null;
  applySkinVisual();
  drawPetFrame();
 }
}
companionApi.on('skin-changed', loadSkin);
loadSkin();
