import {screenPreferences, validateDrawing} from './screen-data.js';

// Requests are scoped to the opener and its origin, never to arbitrary windows.
export function screenClient(output) {
  const pending = new Map();
  addEventListener('message', event => {
    if (event.source !== opener || event.origin !== location.origin || event.data?.type !== 'stageset-screen-response' || event.data.output !== output) return;
    const entry = pending.get(event.data.requestId); if (!entry) return;
    pending.delete(event.data.requestId); clearTimeout(entry.timer);
    if (event.data.error) entry.reject(Error(event.data.error)); else entry.resolve(event.data.result);
  });
  return (action, data = {}) => new Promise((resolve,reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => { pending.delete(requestId); reject(Error('Sem resposta do StageSet. O rascunho continua nesta janela.')); }, 8000);
    pending.set(requestId, {resolve,reject,timer});
    opener?.postMessage({type:'stageset-screen-request',output,requestId,action,...data},location.origin);
  });
}

export function createLyricsScreen({host, viewport, request, extraControls}) {
  host.classList.add('screen-host'); viewport.classList.add('screen-viewport');
  const toolbar = document.createElement('div'); toolbar.className = 'screen-toolbar';
  toolbar.innerHTML = `<button type="button" data-screen="menu" aria-label="Funções deste ecrã" aria-expanded="false">☰ Ecrã</button>
    <div class="screen-panel" hidden>
      <div class="screen-row"><button type="button" data-screen="back" title="Consultar linhas anteriores, sem deslocar o áudio">↑ Anterior</button><button type="button" data-screen="forward" title="Consultar linhas seguintes, sem deslocar o áudio">↓ Seguinte</button><button type="button" data-screen="focus">Voltar ao foco</button></div>
      <div class="screen-row"><button type="button" data-screen="fullscreen">⛶ Ecrã inteiro</button><button type="button" data-screen="edit">Editar letras</button><button type="button" data-screen="paint" aria-pressed="false">✎ Desenhar</button></div>
      <div class="screen-row screen-brushes" hidden><label>Cor <input type="color" data-screen="color" value="#ffdb4d"></label><label>Traço <input type="range" data-screen="width" min="2" max="30" value="5"></label><button type="button" data-screen="eraser" aria-pressed="false">Borracha</button><button type="button" data-screen="undo">Anular</button><button type="button" data-screen="clear">Limpar</button></div>
      <div class="screen-extra screen-row"></div>
      <div class="screen-row"><label>Opacidade <input type="range" data-screen="opacity" min="10" max="100" step="5" value="65"><output data-screen="opacity-value">65%</output></label><label><input type="checkbox" data-screen="autohide" checked> Recolher menu</label></div>
      <small>Roda ou arrasta a letra. Após 5 s sem interação, regressa ao foco.</small>
      <span class="screen-status" role="status"></span><button type="button" data-screen="retry" hidden>Guardar desenho novamente</button>
    </div>`;
  const canvas = document.createElement('canvas'); canvas.className = 'screen-ink'; canvas.setAttribute('aria-label','Anotações desenhadas neste ecrã');
  const editor = document.createElement('section'); editor.className = 'screen-editor'; editor.hidden = true; editor.setAttribute('role','dialog'); editor.setAttribute('aria-label','Editar letras neste ecrã');
  editor.innerHTML = '<strong></strong><p>Os tempos entre parênteses retos são preservados. Guardar altera apenas esta saída.</p><textarea aria-label="Texto das letras nesta saída" spellcheck="false"></textarea><footer><span class="screen-edit-status" role="status"></span><button type="button" data-screen="cancel">Cancelar</button><button type="button" data-screen="save">Guardar letras</button></footer>';
  host.append(canvas,toolbar,editor);
  if (extraControls) {const extra=toolbar.querySelector('.screen-extra');extra.append(extraControls);toolbar.querySelector('.screen-panel').prepend(extra);}
  const el = name => toolbar.querySelector(`[data-screen="${name}"]`), panel = toolbar.querySelector('.screen-panel'), status = toolbar.querySelector('.screen-status');
  let context = {}, prefs = screenPreferences(), prefsDirty=false, manualUntil = 0, manualTop = 0, lastFocus = null, idleTimer, focusTimer;
  let paint = false, eraser = false, strokes = [], revision = 0, stroke = null, loadingNotes = false, saving = false, dirty = false, draft = null, editingBusy = false, generation = 0;
  const unsaved = new Map();
  const key = () => context.songId || '';
  const message = text => {status.textContent = text;};
  function wake() {
    toolbar.dataset.idle = 'false'; clearTimeout(idleTimer);
    if (prefs.autoHide && !paint && editor.hidden) idleTimer = setTimeout(() => {toolbar.dataset.idle = 'true';panel.hidden=true;el('menu').setAttribute('aria-expanded','false');}, 3500);
  }
  function setPrefs(value) {
    prefs = screenPreferences(value); toolbar.style.setProperty('--screen-opacity', prefs.opacity / 100);
    if (document.activeElement !== el('opacity')) el('opacity').value = prefs.opacity;
    el('opacity-value').textContent = prefs.opacity + '%'; el('autohide').checked = prefs.autoHide; wake();
  }
  async function persistPrefs() { try { await request('preferences',{preferences:prefs}); } catch(error) {message(error.message);} finally {prefsDirty=false;} }
  el('opacity').oninput = () => {prefsDirty=true;setPrefs({...prefs,opacity:Number(el('opacity').value)});};
  el('opacity').onchange = persistPrefs;
  el('autohide').onchange = () => {setPrefs({...prefs,autoHide:el('autohide').checked});void persistPrefs();};
  el('menu').onclick = () => {panel.hidden = !panel.hidden;el('menu').setAttribute('aria-expanded',String(!panel.hidden));wake();};
  toolbar.addEventListener('pointermove',wake);
  toolbar.addEventListener('keydown',event => event.stopPropagation());
  editor.addEventListener('keydown',event => {event.stopPropagation();if(event.key==='Escape'){event.preventDefault();editor.querySelector('.screen-edit-status').textContent='Usa Guardar ou Cancelar para fechar o rascunho.';}});
  function currentLine() {return viewport.querySelector('.current') || viewport.querySelector('.lyric-line,.line');}
  function centerFocus() {
    const line = currentLine();
    if (line) { const r=line.getBoundingClientRect(), v=viewport.getBoundingClientRect();viewport.scrollTop += r.top-v.top+r.height/2-v.height/2; }
  }
  function focus() {manualUntil=0;clearTimeout(focusTimer);host.dataset.manual='false';centerFocus();el('focus').textContent='Voltar ao foco';}
  function hold() {
    manualUntil = performance.now()+5000;manualTop=viewport.scrollTop;host.dataset.manual='true';
    clearTimeout(focusTimer); focusTimer=setTimeout(focus,5000);el('focus').textContent='Foco em 5 s';
  }
  function move(delta) {viewport.scrollTop+=delta;hold();}
  el('focus').onclick=focus;
  el('back').onclick=()=>move(-Math.max(36,currentLine()?.getBoundingClientRect().height||48));
  el('forward').onclick=()=>move(Math.max(36,currentLine()?.getBoundingClientRect().height||48));
  host.addEventListener('wheel',event=>{
    if (event.target.closest('.screen-toolbar,.screen-editor') || !viewport.getClientRects().length) return;
    event.preventDefault();move(event.deltaY*(event.deltaMode===1?28:event.deltaMode===2?viewport.clientHeight:1));
  },{passive:false});
  let drag = null;
  viewport.addEventListener('pointerdown',event=>{if(event.button!==0||paint||event.target.closest('a,input,button,textarea,iframe'))return;drag={id:event.pointerId,y:event.clientY};viewport.setPointerCapture(event.pointerId);});
  viewport.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const delta=drag.y-event.clientY;drag.y=event.clientY;if(delta)move(delta);});
  const endDrag=()=>{drag=null;};viewport.addEventListener('pointerup',endDrag);viewport.addEventListener('pointercancel',endDrag);
  async function fullscreen() {
    try {if(document.fullscreenElement===host)await document.exitFullscreen();else if(host.requestFullscreen)await host.requestFullscreen({navigationUI:'hide'});else throw Error('Ecrã inteiro indisponível neste browser.');}catch(error){message(error.message);}
  }
  el('fullscreen').onclick=fullscreen;
  const fullscreenChanged=()=>{el('fullscreen').textContent=document.fullscreenElement===host?'⛶ Sair de ecrã inteiro':'⛶ Ecrã inteiro';resize();};
  document.addEventListener('fullscreenchange',fullscreenChanged);
  function redraw() {
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
    for(const item of [...strokes,...(stroke?[stroke]:[])]) {
      ctx.globalCompositeOperation=item.tool==='eraser'?'destination-out':'source-over';ctx.strokeStyle=item.color;ctx.fillStyle=item.color;ctx.lineWidth=item.width*Math.min(w,h);ctx.lineCap='round';ctx.lineJoin='round';
      ctx.beginPath();item.points.forEach(([x,y],i)=>{if(i)ctx.lineTo(x*w,y*h);else ctx.moveTo(x*w,y*h);});
      if(item.points.length===1){const [x,y]=item.points[0];ctx.arc(x*w,y*h,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();
    }
    ctx.globalCompositeOperation='source-over';
  }
  function resize() {
    const r=host.getBoundingClientRect(),ratio=Math.min(2,devicePixelRatio||1);canvas.width=Math.max(1,Math.round(r.width*ratio));canvas.height=Math.max(1,Math.round(r.height*ratio));
    viewport.style.setProperty('--screen-pad',Math.max(0,viewport.clientHeight/2-30)+'px');redraw();
    if(manualUntil>performance.now())viewport.scrollTop=manualTop;else centerFocus();
  }
  let resizeFrame;
  const observer=new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(resize);});observer.observe(host);
  function drawingButtons() {for(const name of ['undo','clear'])el(name).disabled=!strokes.length||loadingNotes||saving;el('paint').disabled=!key()||loadingNotes;el('retry').hidden=!dirty||saving;}
  function setPaint(value) {paint=value;host.dataset.paint=String(value);el('paint').setAttribute('aria-pressed',String(value));toolbar.querySelector('.screen-brushes').hidden=!value;wake();}
  el('paint').onclick=()=>setPaint(!paint);
  el('eraser').onclick=()=>{eraser=!eraser;el('eraser').setAttribute('aria-pressed',String(eraser));};
  async function saveDrawing() {
    if(!key()||saving||!dirty)return;
    const songId=key(),thisGeneration=generation,data=strokes,savedRevision=revision; saving=true;drawingButtons();message('A guardar desenho…');
    try {
      const result=await request('drawing-save',{songId,revision:savedRevision,strokes:validateDrawing(data)});
      unsaved.delete(songId);
      if(thisGeneration===generation){revision=result.revision;dirty=false;message('Desenho guardado nesta música e saída.');}
    } catch(error) {unsaved.set(songId,{strokes:data,revision:savedRevision});if(thisGeneration===generation)message(error.message);}
    finally {if(thisGeneration===generation){saving=false;drawingButtons();}}
  }
  function changedDrawing() {dirty=true;unsaved.set(key(),{strokes,revision});redraw();void saveDrawing();}
  el('undo').onclick=()=>{if(saving||loadingNotes)return;strokes=strokes.slice(0,-1);changedDrawing();};
  el('clear').onclick=()=>{if(saving||loadingNotes)return;strokes=[];changedDrawing();};el('retry').onclick=saveDrawing;
  const point=event=>{const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(event.clientY-r.top)/r.height))];};
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||!paint||!key()||loadingNotes||saving||stroke)return;
    if(strokes.length>=200){message('Máximo de 200 traços. Anula ou limpa o desenho.');return;}
    event.preventDefault();canvas.setPointerCapture(event.pointerId);
    stroke={tool:eraser?'eraser':'pen',color:el('color').value,width:Number(el('width').value)/1000,points:[point(event)]};redraw();
  });
  canvas.addEventListener('pointermove',event=>{if(!stroke)return;if(stroke.points.length<2000)stroke.points.push(point(event));redraw();});
  function finishStroke(){if(!stroke)return;strokes=[...strokes,stroke];stroke=null;changedDrawing();}
  canvas.addEventListener('pointerup',finishStroke);canvas.addEventListener('pointercancel',finishStroke);
  async function loadDrawing() {
    const songId=key(),thisGeneration=generation;if(!songId)return;
    const cached=unsaved.get(songId);if(cached){strokes=cached.strokes;revision=cached.revision;dirty=true;drawingButtons();redraw();return;}
    loadingNotes=true;drawingButtons();
    try {const data=await request('drawing-read',{songId});if(thisGeneration===generation&&!dirty){strokes=validateDrawing(data.strokes);revision=data.revision;redraw();}}
    catch(error){if(thisGeneration===generation)message(error.message);}
    finally{if(thisGeneration===generation){loadingNotes=false;drawingButtons();}}
  }
  el('edit').onclick=async()=>{
    if(editingBusy)return;editingBusy=true;
    try {
      const data=await request('lyrics-read',{songId:key()});draft=data;
      editor.querySelector('strong').textContent=data.title+' · '+data.outputName;
      editor.querySelector('textarea').value=data.text;editor.querySelector('.screen-edit-status').textContent='';editor.hidden=false;setPaint(false);wake();editor.querySelector('textarea').focus();
    }catch(error){message(error.message);}finally{editingBusy=false;}
  };
  editor.querySelector('[data-screen=cancel]').onclick=()=>{if(editingBusy)return;editor.hidden=true;draft=null;wake();};
  editor.querySelector('[data-screen=save]').onclick=async()=>{
    if(!draft||editingBusy)return;editingBusy=true;const save=editor.querySelector('[data-screen=save]');save.disabled=true;
    try {await request('lyrics-save',{songId:draft.songId,baseText:draft.text,text:editor.querySelector('textarea').value});editor.hidden=true;draft=null;message('Letras guardadas nesta saída.');wake();}
    catch(error){editor.querySelector('.screen-edit-status').textContent=error.message;}
    finally{save.disabled=false;editingBusy=false;}
  };
  function update(data) {
    const changed=context.songId!==data.songId;context=data;
    if(changed){generation++;manualUntil=0;clearTimeout(focusTimer);lastFocus=null;stroke=null;strokes=[];revision=0;dirty=false;saving=false;loadingNotes=false;setPaint(false);redraw();void loadDrawing();}
    else if(key()&&!dirty&&!saving&&!loadingNotes&&Number(data.annotationVersion||0)!==revision)void loadDrawing();
    const nextPrefs=screenPreferences(data.overlay);if(!prefsDirty&&JSON.stringify(nextPrefs)!==JSON.stringify(prefs))setPrefs(nextPrefs);
    el('edit').disabled=!key()||!data.canEdit;el('edit').title=data.canEdit?'Editar apenas as letras desta saída':'Entra no Studio no computador principal para editar';drawingButtons();
    const line=currentLine(),focusId=line?.dataset.sourceIndex||[...viewport.children].indexOf(line);
    if(manualUntil>performance.now())viewport.scrollTop=manualTop;
    else if(line!==lastFocus||focusId!==host.dataset.focus){centerFocus();host.dataset.focus=String(focusId);lastFocus=line;host.dataset.manual='false';}
  }
  setPrefs(prefs);
  return {update,fullscreen,focus,destroy(){observer.disconnect();cancelAnimationFrame(resizeFrame);clearTimeout(focusTimer);clearTimeout(idleTimer);document.removeEventListener('fullscreenchange',fullscreenChanged);toolbar.remove();canvas.remove();editor.remove();}};
}

// Keep the entire lyric available for independent browsing; rebuild only when its content/style changes.
export function renderScreenLines(viewport, data) {
  const signature=JSON.stringify([data.songId,data.htmlLines,data.fontSize,data.baseColor]);
  if(viewport.dataset.lines!==signature){
    viewport.dataset.lines=signature;
    viewport.replaceChildren(...data.lines.map((text,index)=>{const p=document.createElement('p');p.className='line'+(text?'':' blank');p.innerHTML=data.htmlLines[index];p.style.color=data.baseColor;p.style.fontSize=data.fontSize+'px';return p;}));
  }
  [...viewport.children].forEach((p,index)=>{p.classList.toggle('current',index===data.currentIndex);p.style.background=index===data.currentIndex?data.color+'55':'';});
}
