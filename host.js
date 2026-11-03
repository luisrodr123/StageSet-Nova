import {createHostSetlist} from './host-setlist.js';
import {createLyricsScreen,renderScreenLines} from './lyrics-screen.js';
import {applyBackground} from './backgrounds.js';
import {receiverFrame,syncSettings} from './host-sync.js';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const store=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
let token='',frame=null,installPrompt,preferences=read('host-overlay',{}),mediaKey='',staticKey='',cursor='',receivedAt=0,age=0,rtt=0,failures=0;
let sync=syncSettings(read('host-sync',{})),fonts=read('host-fonts',{}),fontTimer;
try{document.getElementById('name').value=localStorage.getItem('host-name')||'';}catch{}
let wakeLock,authBusy=false;
async function keepAwake(){if(!token||document.visibilityState!=='visible'||wakeLock)return;try{wakeLock=await navigator.wakeLock?.request('screen');wakeLock?.addEventListener('release',()=>{wakeLock=null;});}catch{}}
addEventListener('visibilitychange',()=>{void keepAwake();});
const stage=document.getElementById('stage'),viewport=document.getElementById('lines'),status=document.getElementById('connection');
const setlist=createHostSetlist(stage);
const network=document.createElement('div');network.className='host-network';
network.innerHTML='<button type="button" data-sync="forget">Esquecer autorização neste dispositivo</button><strong>Sincronização Wi-Fi</strong><label><input type="checkbox" data-sync="auto"> Compensação automática</label><label>Ajuste <input type="range" min="-1000" max="1000" step="10" data-sync="offset"><output data-sync="value"></output></label><small>− atrasa · + adianta as letras. Não altera o áudio.</small><button type="button" data-sync="reset">Sem atraso adicional</button><span data-sync="quality" role="status"></span>';
const control=name=>network.querySelector('[data-sync='+name+']');
control('forget').onclick=async()=>{if(token){try{await api('forget',{});}catch{}}store('host-device',null);token='';frame=null;stage.hidden=true;document.getElementById('join').hidden=false;document.getElementById('code').value='';status.textContent='Autorização esquecida';void wakeLock?.release();};
function updateNetwork(){control('auto').checked=sync.automatic;control('offset').value=sync.offset;control('value').textContent=(sync.offset>0?'+':'')+sync.offset+' ms';}
function saveSync(){sync=syncSettings({automatic:control('auto').checked,offset:control('offset').value});store('host-sync',sync);updateNetwork();paintFrame();}
control('auto').onchange=saveSync;control('offset').oninput=saveSync;
control('reset').onclick=()=>{sync={automatic:true,offset:0};store('host-sync',sync);updateNetwork();paintFrame();};updateNetwork();
const fontKey=()=>frame?frame.output+':'+frame.songId:'';
const fontSize=()=>Math.max(14,Math.min(120,Number(fonts[fontKey()])||Number(frame?.fontSize)||42));
const screen=createLyricsScreen({host:stage,viewport,extraControls:network,fontControl:{get:fontSize,set:value=>{if(!frame)return;const key=fontKey();delete fonts[key];if(value!==null)fonts[key]=value;fonts=Object.fromEntries(Object.entries(fonts).slice(-300));clearTimeout(fontTimer);fontTimer=setTimeout(()=>store('host-fonts',fonts),200);paintFrame();}},request:async(action,data)=>{
  if(action==='preferences'){preferences=data.preferences;store('host-overlay',preferences);return preferences;}
  if(action==='drawing-read'&&frame?.readOnly)return frame?.drawing||{revision:0,strokes:[]};
  if(!frame||!token)throw Error('Sem ligação. O rascunho continua neste dispositivo.');
  const response=await api('screen',{action,data:{...data,output:frame.output}},10000);return response.result;
}});
async function api(route,data,timeout=5000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);try{const r=await fetch('/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data),signal:controller.signal});const body=await r.json();if(!r.ok)throw Object.assign(Error(body.error||'Sem ligação'),{status:r.status});return body;}finally{clearTimeout(timer);}}
function paintFrame(){if(!frame)return;const display=receiverFrame(frame,{elapsed:performance.now()-receivedAt,age,rtt,settings:sync});renderScreenLines(viewport,{...display,fontSize:fontSize()});screen.update({...display,remote:true,canInsertEvents:false,overlay:preferences});}
async function ping(){if(!token)return;const started=performance.now();try{await api('ping',{});const sample=performance.now()-started;rtt=rtt?Math.min(sample,rtt*.8+sample*.2):sample;control('quality').textContent='Ligação: '+Math.round(rtt)+' ms ida e volta · envio imediato';}catch{control('quality').textContent='A restabelecer a ligação…';}}
async function receive(session){while(token===session){try{
  const result=await api('poll',{mediaKey,staticKey,cursor,wait:true});if(token!==session)return;failures=0;cursor=result.cursor;
  if(!result.frame){viewport.querySelectorAll('video').forEach(v=>v.pause());viewport.replaceChildren();delete viewport.dataset.lines;viewport._lyricEvents=[];frame=null;mediaKey='';staticKey='';screen.update({songId:'',readOnly:true});setlist.update(null);status.textContent='Ligado · sem saída atribuída';continue;}
  const oldOutput=frame?.output;frame=result.delta?{...frame,...result.frame}:result.frame;mediaKey=result.mediaKey;staticKey=result.staticKey;receivedAt=performance.now();age=result.age||0;
  if(oldOutput!==frame.output)viewport._lyricEvents=[];
  setlist.update(frame);status.textContent='● '+frame.name+' · '+frame.title;applyBackground(stage,frame.background);paintFrame();
}catch(error){
  viewport.querySelectorAll('video').forEach(v=>v.pause());if(frame)frame={...frame,playing:false};
  status.textContent='Sem sinal · a tentar novamente. '+(error.name==='AbortError'?'':error.message);control('quality').textContent='Sem sinal';
  if(error.status===401){token='';void wakeLock?.release();if(!await reconnect())document.getElementById('join').hidden=false;return;}
  await new Promise(resolve=>setTimeout(resolve,Math.min(2000,250*++failures)));
}}}
function connected(result){token=result.token;mediaKey='';staticKey='';cursor='';document.getElementById('join').hidden=true;document.getElementById('code').value='';document.getElementById('error').textContent='';stage.hidden=false;status.textContent='Ligado · aguarda seleção da saída no StageSet';failures=0;void keepAwake();void ping();void receive(token);}
async function reconnect(){
  const deviceToken=read('host-device',null);if(!deviceToken||authBusy)return false;authBusy=true;
  try{status.textContent='A restabelecer a ligação guardada…';connected(await api('resume',{deviceToken,name:document.getElementById('name').value}));return true;}
  catch(error){if(error.status===403){store('host-device',null);document.getElementById('error').textContent=error.message;}else status.textContent='A aguardar o StageSet no endereço guardado…';return false;}
  finally{authBusy=false;}
}
document.getElementById('join').onsubmit=async e=>{e.preventDefault();if(authBusy)return;authBusy=true;const button=e.submitter||document.querySelector('#join button');button.disabled=true;
  try{const name=document.getElementById('name').value,remember=document.getElementById('remember').checked,result=await api('join',{name,code:document.getElementById('code').value,remember});try{localStorage.setItem('host-name',name);}catch{}store('host-device',result.rememberToken||null);connected(result);}
  catch(error){document.getElementById('error').textContent=error.message;}finally{button.disabled=false;authBusy=false;}};
void reconnect();
setInterval(()=>{if(!token&&!document.getElementById('code').value)void reconnect();},3000);
setInterval(()=>{if(frame&&token&&frame.playing&&performance.now()-receivedAt<2500)paintFrame();},50);
setInterval(ping,5000);
addEventListener('pagehide',()=>store('host-fonts',fonts));
if('serviceWorker' in navigator&&isSecureContext)navigator.serviceWorker.register('./host-sw.js').catch(()=>{});
addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;document.getElementById('install').hidden=false;});
document.getElementById('install').onclick=async()=>{if(!installPrompt)return;await installPrompt.prompt();installPrompt=null;document.getElementById('install').hidden=true;};
addEventListener('appinstalled',()=>{document.getElementById('install').hidden=true;document.getElementById('installation').textContent='StageSet Host instalado. Abre pelo ícone do ecrã principal.';});
const native=/StageSetHost\//.test(navigator.userAgent),ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
document.getElementById('installation').textContent=native?'Aplicação Host · atribui a saída no computador StageSet.':standalone?'Aplicação instalada · mantém este dispositivo na mesma rede do StageSet.':!isSecureContext?'Para instalar a versão web, abre o endereço HTTPS com o certificado do StageSet confiado neste dispositivo. O Host nativo também aceita HTTP na rede local.':ios?'No iPad ou iPhone: abre em Safari → Partilhar → Adicionar ao ecrã principal → Abrir como aplicação → Adicionar. Depois abre o ícone StageSet Host.':'No Android: menu do Chrome → Adicionar ao ecrã principal → Instalar. Também podes usar o botão Instalar aplicação quando disponível.';
