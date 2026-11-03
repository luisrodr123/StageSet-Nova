export function createHostSetlist(host){
  let prefs={mode:'auto',seconds:8};try{prefs={...prefs,...JSON.parse(localStorage.getItem('host-setlist')||'{}')};}catch{}
  const button=document.createElement('button');button.type='button';button.className='host-setlist-toggle';button.textContent='☷ Setlist';button.setAttribute('aria-controls','host-setlist');
  const panel=document.createElement('aside');panel.id='host-setlist';panel.className='host-setlist';panel.setAttribute('aria-label','Setlist do StageSet');
  panel.innerHTML='<h2>Setlist</h2><label>Visibilidade<select data-list="mode"><option value="auto">Ocultar após…</option><option value="always">Sempre visível</option></select></label><label data-list="timeout">Segundos<input data-list="seconds" type="number" min="1" max="300" step="1"></label><ol></ol><p data-list="empty">Setlist vazia</p>';
  host.append(panel,button);const mode=panel.querySelector('[data-list=mode]'),seconds=panel.querySelector('[data-list=seconds]'),list=panel.querySelector('ol');
  let timer,signature='',songId,visible=true;
  function show(value){visible=value;panel.hidden=!value;host.dataset.setlistVisible=String(value);button.setAttribute('aria-expanded',String(value));arm();}
  function arm(){clearTimeout(timer);if(visible&&prefs.mode==='auto')timer=setTimeout(()=>{if(panel.contains(document.activeElement)){arm();return;}show(false);},prefs.seconds*1000);}
  function configure(){prefs.mode=mode.value==='always'?'always':'auto';prefs.seconds=Math.max(1,Math.min(300,Math.round(Number(seconds.value)||8)));seconds.value=prefs.seconds;panel.querySelector('[data-list=timeout]').hidden=prefs.mode==='always';try{localStorage.setItem('host-setlist',JSON.stringify(prefs));}catch{}show(true);}
  mode.value=prefs.mode==='always'?'always':'auto';seconds.value=prefs.seconds;configure();
  mode.onchange=configure;seconds.onchange=configure;button.onclick=()=>show(!visible);
  for(const name of ['pointerdown','pointermove','keydown','focusout','wheel'])panel.addEventListener(name,arm,{passive:true});
  return {update(frame){
    const entries=Array.isArray(frame?.setlist)?frame.setlist:[],next=JSON.stringify([entries,frame?.songId]);
    if(next!==signature){signature=next;list.replaceChildren(...entries.map((entry,index)=>{const row=document.createElement('li');row.classList.toggle('played',!!entry.played);row.classList.toggle('active',entry.id===frame.songId);if(entry.id===frame.songId)row.setAttribute('aria-current','true');const number=document.createElement('span'),title=document.createElement('span');number.className='host-setlist-number';number.textContent=String(index+1).padStart(2,'0');title.textContent=entry.title;row.append(number,title);return row;}));panel.querySelector('[data-list=empty]').hidden=!!entries.length;}
    if(songId!==frame?.songId){songId=frame?.songId;show(true);list.querySelector('.active')?.scrollIntoView({block:'nearest'});}
  }};
}
