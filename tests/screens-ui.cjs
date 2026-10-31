module.exports=async({win,mosaic,evaluate,children})=>{
  const fs=require('node:fs/promises'),path=require('node:path');
  const band=children.find(c=>!c.isDestroyed()&&c.webContents.getURL().includes('lyric-window.html?output=2'));
  const audience=children.find(c=>!c.isDestroyed()&&c.webContents.getURL().includes('lyric-window.html?output=3'));
  const js=(w,code)=>w.webContents.executeJavaScript(`(async()=>{${code}})()`,true);
  const wait=async(fn,label)=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,30));}throw Error(label);};
  await evaluate(`
    document.getElementById('close-settings').click();
    document.getElementById('lyrics-edit-button').click();output('main');
    window.screenLyrics=Array.from({length:70},(_,i)=>'[00:'+String(Math.floor(i*.04)).padStart(2,'0')+'.'+String((i*4)%100).padStart(2,'0')+'] Linha '+String(i+1).padStart(2,'0')).join('\\n');
    field('lyrics-editor-text',screenLyrics);output('2');field('lyrics-editor-text',screenLyrics+'\\nBanda');
    document.getElementById('lyrics-editor-form').requestSubmit();await until(()=>document.getElementById('lyrics-editor-modal').hidden,'Fixture lyrics not saved');
    window.screenSongId=(await getSongs()).find(s=>s.title==='MIDI sem silencio').id;
    document.getElementById('progress').value='200';document.getElementById('progress').dispatchEvent(new Event('input'));
  `);
  await wait(()=>js(band,`return document.querySelectorAll('#lines .line').length===70`),'Full lyrics absent in output');
  // Each view browses locally. Moving playback during the hold must return to the NEW focus.
  const mainPosition=await js(win,`return document.getElementById('progress').value`);
  await js(band,`document.querySelector('[data-screen=menu]').click();window.initialTop=document.getElementById('lines').scrollTop;document.getElementById('lines').dispatchEvent(new WheelEvent('wheel',{deltaY:650,bubbles:true,cancelable:true}));`);
  await js(mosaic,`document.querySelector('.tile .screen-viewport').dispatchEvent(new WheelEvent('wheel',{deltaY:420,bubbles:true,cancelable:true}));`);
  if(!await js(band,`return document.getElementById('stage').dataset.manual==='true'&&document.getElementById('lines').scrollTop>initialTop+500`))throw Error('Wheel browsing failed');
  if(await js(audience,`return document.getElementById('stage').dataset.manual`)==='true')throw Error('Wheel moved another output');
  if(await js(win,`return document.getElementById('progress').value`)!==mainPosition)throw Error('Browsing changed playback');
  await evaluate(`document.getElementById('progress').value='800';document.getElementById('progress').dispatchEvent(new Event('input'));`);
  const expectedFocus=await js(win,`return document.querySelector('#lyrics-content .current').textContent`);
  await new Promise(r=>setTimeout(r,2700));
  await js(band,`document.querySelector('[data-screen=forward]').click();`);
  await new Promise(r=>setTimeout(r,2700));
  if(!await js(band,`return document.getElementById('stage').dataset.manual==='true'`))throw Error('Five-second timer did not reset on interaction');
  await new Promise(r=>setTimeout(r,2500));
  await wait(()=>js(band,`return document.getElementById('stage').dataset.manual==='false'`),'Timed focus return missing');
  const focus=await js(band,`const v=document.getElementById('lines').getBoundingClientRect(),p=document.querySelector('#lines .current').getBoundingClientRect();return {manual:document.getElementById('stage').dataset.manual,offset:Math.abs(p.top+p.height/2-v.top-v.height/2),text:document.querySelector('#lines .current').textContent};`);
  if(focus.manual!=='false'||focus.offset>3||focus.text!==expectedFocus)throw Error('Latest focus not restored after inactivity '+JSON.stringify(focus));
  if(await js(win,`return document.getElementById('progress').value`)!=='800')throw Error('Focus reset moved transport');
  if(!await js(band,`return document.querySelector('.screen-panel').hidden`))throw Error('Menu did not automatically collapse');
  await js(band,`document.querySelector('[data-screen=menu]').click();`);
  if(await js(band,`return document.querySelector('.screen-panel').hidden`))throw Error('Menu does not reopen with one click');
  // Main screen uses the same local browse controls.
  await evaluate(`document.querySelector('#lyrics-stage [data-screen=forward]').click();check(document.getElementById('lyrics-stage').dataset.manual==='true','Main browse absent');document.querySelector('#lyrics-stage [data-screen=focus]').click();check(document.getElementById('lyrics-stage').dataset.manual==='false','Manual focus reset absent');`);
  // HTML fullscreen is tested without taking over the user's physical display.
  band.setSkipTaskbar(true);band.setPosition(-30000,-30000);band.showInactive();
  await js(band,`document.querySelector('[data-screen=fullscreen]').click();`);
  try {await wait(()=>js(band,`return document.fullscreenElement?.id==='stage'`),'HTML fullscreen failed');}
  catch(error){throw Error(error.message+' '+await js(band,`return JSON.stringify({message:document.querySelector('.screen-status').textContent,enabled:document.fullscreenEnabled,visible:document.visibilityState,focus:document.hasFocus()})`));}
  const bounds=await js(band,`const r=document.getElementById('stage').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,w:innerWidth,h:innerHeight,border:getComputedStyle(document.getElementById('stage')).borderWidth};`);
  if(bounds.x||bounds.y||bounds.width!==bounds.w||bounds.height!==bounds.h||bounds.border!=='0px')throw Error('Fullscreen does not fill viewport without border '+JSON.stringify(bounds));
  // Edit stays inside the fullscreen output. Saving must preserve the main lyrics.
  await js(band,`document.querySelector('[data-screen=edit]').click();`);
  await wait(()=>js(band,`return !document.querySelector('.screen-editor').hidden`),'Inline editor absent');
  await js(band,`document.querySelector('.screen-editor textarea').value+='\\nSó nesta saída';document.querySelector('[data-screen=save]').click();`);
  await wait(()=>js(band,`return document.querySelector('.screen-editor').hidden`),'Inline save failed');
  await evaluate(`const song=(await getSongs()).find(s=>s.id===screenSongId);check(song.lyricOutputLyrics['2'].includes('Só nesta saída')&&!song.lyricsText.includes('Só nesta saída'),'Inline output overwrote main');`);
  await js(band,`await document.exitFullscreen();const opacity=document.querySelector('[data-screen=opacity]');opacity.value='30';opacity.dispatchEvent(new Event('input'));opacity.dispatchEvent(new Event('change'));const hide=document.querySelector('[data-screen=autohide]');hide.checked=false;hide.dispatchEvent(new Event('change'));`);
  await wait(()=>js(win,`return JSON.parse(localStorage.getItem('stageset-display-outputs')).find(o=>o.id==='2').overlay?.opacity===30`),'Opacity not saved');
  // Paint actual pointer input; pen, eraser, undo and persistence are exercised through UI.
  await js(band,`document.querySelector('[data-screen=paint]').click();`);
  async function draw(){
    const r=await js(band,`const r=document.querySelector('.screen-ink').getBoundingClientRect();return {x:Math.round(r.width*.2),y:Math.round(r.height*.65)};`);
    band.webContents.sendInputEvent({type:'mouseMove',x:r.x,y:r.y});band.webContents.sendInputEvent({type:'mouseDown',x:r.x,y:r.y,button:'left',clickCount:1});
    band.webContents.sendInputEvent({type:'mouseMove',x:r.x+120,y:r.y-80});band.webContents.sendInputEvent({type:'mouseUp',x:r.x+120,y:r.y-80,button:'left',clickCount:1});
  }
  await draw();
  await wait(()=>js(band,`return document.querySelector('.screen-status').textContent.includes('Desenho guardado')`),'Paint did not save');
  await js(band,`document.querySelector('[data-screen=eraser]').click();`);await draw();
  await wait(()=>js(win,`const songs=await getSongs();return songs.find(s=>s.id===screenSongId)?.lyricAnnotations?.['2']?.strokes.length===2`),'Eraser stroke absent');
  await js(band,`document.querySelector('[data-screen=undo]').click();`);
  await wait(()=>js(band,`return !document.querySelector('[data-screen=undo]').disabled&&document.querySelector('.screen-status').textContent.includes('guardado')`),'Undo not saved');
  await evaluate(`const song=(await getSongs()).find(s=>s.id===screenSongId);check(song.lyricAnnotations['2'].strokes.length===1&&song.lyricAnnotations['2'].strokes[0].tool==='pen'&&!song.lyricAnnotations.main,'Paint isolation/undo failed');`);
  // A concurrent edit in the mosaic must never silently overwrite a draft.
  await js(band,`document.querySelector('[data-screen=paint]').click();document.querySelector('[data-screen=edit]').click();`);
  await wait(()=>js(band,`return !document.querySelector('.screen-editor').hidden`),'Second inline editor absent');
  await js(mosaic,`document.querySelector('[data-output="2"] [data-screen=edit]').click();`);
  await wait(()=>js(mosaic,`return !document.querySelector('[data-output="2"] .screen-editor').hidden`),'Mosaic inline editor absent');
  await js(mosaic,`document.querySelector('[data-output="2"] textarea').value+='\\nAlteração concorrente';document.querySelector('[data-output="2"] [data-screen=save]').click();`);
  await wait(()=>js(mosaic,`return document.querySelector('[data-output="2"] .screen-editor').hidden`),'Mosaic save failed');
  await js(band,`document.querySelector('.screen-editor textarea').value+='\\nRascunho protegido';document.querySelector('[data-screen=save]').click();`);
  await wait(()=>js(band,`return document.querySelector('.screen-edit-status').textContent.includes('mudaram')`),'Concurrent draft not protected');
  if(!await js(band,`return document.querySelector('.screen-editor textarea').value.includes('Rascunho protegido')&&!document.querySelector('.screen-editor').hidden`))throw Error('Conflicting draft discarded');
  await js(band,`document.querySelector('[data-screen=cancel]').click();`);
  // A draft remains tied to its original song even when the main transport selects another.
  await js(band,`document.querySelector('[data-screen=edit]').click();`);
  await wait(()=>js(band,`return !document.querySelector('.screen-editor').hidden`),'Pinned draft absent');
  await evaluate(`[...document.querySelectorAll('.library-select')].find(b=>b.textContent.includes('Smoke song')).click();`);
  await wait(()=>js(win,`return document.querySelector('.library-song.selected').textContent.includes('Smoke song')`),'Song switch failed');
  await js(band,`document.querySelector('.screen-editor textarea').value+='\\nRascunho da música original';document.querySelector('[data-screen=save]').click();`);
  await wait(()=>js(band,`return document.querySelector('.screen-editor').hidden`),'Pinned draft save failed');
  await evaluate(`const songs=await getSongs();check(songs.find(s=>s.id===screenSongId).lyricOutputLyrics['2'].includes('Rascunho da música original'),'Draft saved to wrong song');check(!songs.find(s=>s.title==='Smoke song').lyricOutputLyrics['2'].includes('Rascunho da música original'),'Other song overwritten');[...document.querySelectorAll('.library-select')].find(b=>b.textContent.includes('MIDI sem silencio')).click();`);
  await wait(()=>js(win,`return document.querySelector('.library-song.selected').textContent.includes('MIDI sem silencio')`),'Song restore failed');
  // Paint and controls are restored after reopening; backup includes them.
  await band.reload();await wait(()=>js(band,`return document.querySelector('.line')&&document.querySelector('[data-screen=opacity]').value==='30'&&!document.querySelector('[data-screen=undo]').disabled`),'Screen preferences/drawing did not restore');
  await evaluate(`
    const {createBackup,readBackup}=await import('./backup.js');const songs=await getSongs();const backup=await readBackup(createBackup(songs,{}));check(backup.songs.find(s=>s.id===screenSongId).lyricAnnotations['2'].strokes.length===1,'Drawings absent from show backup');
    document.getElementById('studio-mode-toggle').click();
  `);
  await wait(()=>js(band,`return document.querySelector('[data-screen=edit]').disabled`),'Live mode permits inline editing');
  await evaluate(`await enter();check(!testErrors.length,testErrors.join('; '));`);
  await js(band,`document.querySelector('[data-screen=menu]').click();document.querySelector('[data-screen=paint]').click();`);
  band.setSkipTaskbar(true);band.setPosition(-30000,-30000);band.showInactive();await new Promise(r=>setTimeout(r,200));
  await fs.writeFile(path.join(__dirname,'../dist/qa/screen-overlay.png'),(await band.webContents.capturePage()).toPNG());band.hide();
  console.log('Screen overlays: isolated browsing/5-second focus, fullscreen, independent edits/conflicts, paint/eraser/undo, opacity, reload and backup: OK');
};
