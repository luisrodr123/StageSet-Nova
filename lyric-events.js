export function validateEvent(e){
  if(!e||!['midi','picture','video','dmx'].includes(e.kind)||!Number.isFinite(e.time)||e.time<0||e.time>86400)throw Error('Tipo ou tempo do evento inválido.');
  const result={id:typeof e.id==='string'&&/^[a-z0-9-]{1,80}$/i.test(e.id)?e.id:crypto.randomUUID(),kind:e.kind,time:e.time};
  const integer=(v,min,max)=>{if(!Number.isInteger(v)||v<min||v>max)throw Error('Valor do evento fora do intervalo.');return v;};
  if(e.kind==='midi'){
    if(!['cc','program','noteOn','noteOff','pitch','pressure','start','stop','continue','song'].includes(e.message))throw Error('Mensagem MIDI inválida.');
    Object.assign(result,{message:e.message,channel:integer(e.channel,1,16),number:integer(e.number,0,127),value:integer(e.value,0,e.message==='pitch'?16383:127)});
  }else if(e.kind==='dmx')Object.assign(result,{universe:integer(e.universe,0,32767),channel:integer(e.channel,1,512),value:integer(e.value,0,255),fade:integer(e.fade,0,60000)});
  else {
    const pattern=e.kind==='picture'?/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/:/^data:video\/(mp4|webm|ogg);base64,[A-Za-z0-9+/=]+$/;
    if(typeof e.data!=='string'||e.data.length>12000000||!pattern.test(e.data))throw Error('Multimédia inválida ou demasiado grande.');
    Object.assign(result,{data:e.data,name:String(e.name||e.kind).slice(0,120),width:integer(e.width,40,1600),height:integer(e.height,40,1200)});
  }return result;
}
export function eventMidiBytes(e){const c=e.channel-1;return ({cc:[0xb0|c,e.number,e.value],program:[0xc0|c,e.number],noteOn:[0x90|c,e.number,e.value],noteOff:[0x80|c,e.number,e.value],pitch:[0xe0|c,e.value&127,(e.value>>7)&127],pressure:[0xd0|c,e.value],start:[0xfa],stop:[0xfc],continue:[0xfb],song:[0xf3,e.number]})[e.message];}
export function eventMarkup(html){return html.replace(/\[stage:([a-z0-9-]{1,80})\]/gi,'<span class="lyric-event" data-event-id="$1"></span>');}
// Untimed media inserted into timed lyrics must remain visible without converting plain lyrics to timed mode.
export function withEventRows(raw,timed,events=[]){
  if(!timed.length)return timed;
  const result=[...timed],included=new Set(timed.map(line=>line.sourceIndex));
  String(raw||'').split(/\r?\n/).forEach((text,sourceIndex)=>{
    if(included.has(sourceIndex))return;
    const ids=[...text.matchAll(/\[stage:([a-z0-9-]{1,80})\]/gi)].map(m=>m[1]);
    const matches=events.filter(e=>ids.includes(e.id));
    if(matches.length)result.push({time:Math.min(...matches.map(e=>e.time)),text,sourceIndex});
  });
  return result.sort((a,b)=>a.time-b.time||a.sourceIndex-b.sourceIndex);
}
const mediaCaches=new WeakMap();
export function hydrateEvents(viewport,events=[],position=0,playing=false){
  let cache=mediaCaches.get(viewport);if(!cache){cache=new Map();mediaCaches.set(viewport,cache);}
  for(const placeholder of viewport.querySelectorAll('[data-event-id]')){
    const e=events.find(item=>item.id===placeholder.dataset.eventId);if(!e)continue;
    if(e.kind==='midi'||e.kind==='dmx'){placeholder.hidden=true;continue;}
    let node=cache.get(e.id);
    if(!node||node._mediaData!==e.data){node=document.createElement(e.kind==='picture'?'img':'video');node.src=e.data;node._mediaData=e.data;node.dataset.eventId=e.id;node.className='lyric-event-media';node.style.objectFit='contain';node.style.maxWidth='100%';if(e.kind==='video'){node.muted=true;node.playsInline=true;node.preload='auto';}else node.alt=e.name;cache.set(e.id,node);}
    node.style.width=e.width+'px';node.style.height=e.height+'px';if(placeholder!==node)placeholder.replaceWith(node);
    if(e.kind==='video'){const t=Math.max(0,position-e.time);if(Number.isFinite(node.duration)&&Math.abs(node.currentTime-Math.min(t,node.duration))>.4)node.currentTime=Math.min(t,node.duration);if(playing&&position>=e.time&&t<node.duration){if(node.paused)void node.play().catch(()=>{});}else node.pause();}
  }
  for(const [id,node] of cache)if(!events.some(e=>e.id===id)){if(node.tagName==='VIDEO')node.pause();cache.delete(id);}
}
export function attachEventInserter(textarea,{context,save,root}){
  const menu=document.createElement('div');menu.className='event-insert-menu';menu.hidden=true;menu.innerHTML='<button type="button">＋ Inserir evento…</button>';root.append(menu);
  const dialog=document.createElement('section');dialog.className='event-insert-dialog';dialog.hidden=true;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','Inserir evento');
  dialog.innerHTML=`<h3>Inserir evento</h3><label>Tipo <select name="kind"><option value="midi">MIDI</option><option value="picture">Imagem</option><option value="dmx">DMX · SL04 / Art-Net</option><option value="video">Vídeo</option></select></label><label>Tempo (segundos) <input name="time" type="number" min="0" max="86400" step="0.01" value="0"></label>
  <fieldset data-kind="midi"><label>Mensagem <select name="message"><option value="cc">Control Change</option><option value="program">Program Change</option><option value="noteOn">Note On</option><option value="noteOff">Note Off</option><option value="pitch">Pitch Bend</option><option value="pressure">Channel Pressure</option><option value="song">Song Select</option><option value="start">Start</option><option value="stop">Stop</option><option value="continue">Continue</option></select></label><label>Canal MIDI <input name="midiChannel" type="number" min="1" max="16" value="1"></label><label><span data-number-label>Número CC</span> <input name="number" type="number" min="0" max="127" value="0"></label><label>Valor <input name="value" type="number" min="0" max="127" value="0"></label><small>Programa e notas: 0–127. Note Off deve ser inserido separadamente. A saída MIDI é a configurada no mixer.</small></fieldset>
  <fieldset data-kind="dmx"><label>Universo Art-Net (0–32767) <input name="universe" type="number" min="0" max="32767" value="0"></label><label>Canal DMX <input name="dmxChannel" type="number" min="1" max="512" value="1"></label><label>Valor <input name="dmxValue" type="number" min="0" max="255" value="0"></label><label>Transição (ms) <input name="fade" type="number" min="0" max="60000" value="0"></label><small>A saída SL04 deve estar ligada nas Configurações.</small></fieldset>
  <fieldset data-kind="media"><label>Importar ficheiro <input name="file" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/ogg"></label><label>Largura (px) <input name="width" type="number" min="40" max="1600" value="480"></label><label>Altura (px) <input name="height" type="number" min="40" max="1200" value="270"></label><small>Até 8 MB por ficheiro e 20 MB por música. Vídeos sem som, sincronizados com a música.</small></fieldset><p role="status"></p><footer><button type="button" data-action="cancel">Cancelar</button><button type="button" data-action="insert">Inserir</button></footer>`;
  root.append(dialog);const field=name=>dialog.querySelector('[name='+name+']');let pinned,selection=0,selectionEnd=0,busy=false;
  const update=()=>{const kind=field('kind').value;for(const group of dialog.querySelectorAll('fieldset'))group.hidden=group.dataset.kind!==(kind==='picture'||kind==='video'?'media':kind);const message=field('message').value;dialog.querySelector('[data-number-label]').textContent=({cc:'Número CC',program:'Programa',noteOn:'Nota',noteOff:'Nota',song:'Número da música'})[message]||'Número';field('number').parentElement.hidden=!['cc','program','noteOn','noteOff','song'].includes(message);field('value').parentElement.hidden=['program','song','start','stop','continue'].includes(message);field('value').max=message==='pitch'?16383:127;field('midiChannel').parentElement.hidden=['song','start','stop','continue'].includes(message);};
  field('kind').onchange=update;field('message').onchange=update;update();
  textarea.addEventListener('contextmenu',event=>{if(!context()?.songId)return;event.preventDefault();event.stopPropagation();selection=textarea.selectionStart;selectionEnd=textarea.selectionEnd;menu.hidden=false;menu.style.left='12px';menu.style.top='12px';});
  menu.querySelector('button').onclick=()=>{pinned=context();if(!pinned?.songId){menu.hidden=true;return;}field('time').value=(pinned.position||0).toFixed(2);menu.hidden=true;dialog.hidden=false;dialog.querySelector('[role=status]').textContent='';};
  root.querySelector('#lyrics-insert-event')?.addEventListener('click',()=>{pinned=context();if(!pinned?.songId)return;field('time').value=(pinned.position||0).toFixed(2);dialog.hidden=false;dialog.querySelector('[role=status]').textContent='';});
  dialog.addEventListener('keydown',e=>e.stopPropagation());dialog.querySelector('[data-action=cancel]').onclick=()=>{if(!busy)dialog.hidden=true;};
  dialog.querySelector('[data-action=insert]').onclick=async()=>{
    if(busy)return;busy=true;const button=dialog.querySelector('[data-action=insert]');button.disabled=true;
    try{
      const kind=field('kind').value,e={kind,time:Number(field('time').value),message:field('message').value,channel:Number(field(kind==='dmx'?'dmxChannel':'midiChannel').value),number:Number(field('number').value),value:Number(field(kind==='dmx'?'dmxValue':'value').value),universe:Number(field('universe').value),fade:Number(field('fade').value)};
      if(kind==='picture'||kind==='video'){const file=field('file').files[0];if(!file||file.size>8*1024*1024)throw Error('Escolhe um ficheiro até 8 MB.');e.name=file.name;e.width=Number(field('width').value);e.height=Number(field('height').value);e.data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
      const event=validateEvent(e);await save(pinned,event);const tag='[stage:'+event.id+']';textarea.setRangeText(tag,selection,selectionEnd,'end');textarea.dispatchEvent(new Event('input',{bubbles:true}));dialog.hidden=true;textarea.focus();
    }catch(error){dialog.querySelector('[role=status]').textContent=error.message;}finally{busy=false;button.disabled=false;}
  };
}
