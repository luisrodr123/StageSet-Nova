// Hidden Electron integration tests use a temporary profile, never the musician's library.
const {app,BrowserWindow,session,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url');
const logPath=path.resolve(__dirname,'../dist/smoke-result.json');
let win,server,profile;const errors=[],children=[];
async function evaluate(code){const result=await win.webContents.executeJavaScript('(async()=>{try{'+code+';return {ok:true}}catch(error){return {ok:false,error:error.stack}}})()',true);if(!result.ok)throw new Error(result.error);}
async function run(){
  profile=await fs.mkdtemp(path.join(os.tmpdir(),'stageset-smoke-'));app.setPath('userData',profile);
  await app.whenReady();
  session.defaultSession.setPermissionCheckHandler(()=>false);
  session.defaultSession.setPermissionRequestHandler((_,__,done)=>done(false));
  const testRoot=process.env.STAGESET_TEST_ROOT||path.resolve(__dirname,'..');
  const expectedVersion='v'+JSON.parse(await fs.readFile(path.join(testRoot,'package.json'),'utf8')).version.split('.').slice(0,2).join('.');
  const {createStageSetServer}=await import(pathToFileURL(path.join(testRoot,'server.mjs')).href);
  server=createStageSetServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  win=new BrowserWindow({show:false,width:1273,height:930,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'allow',overrideBrowserWindowOptions:{show:false,width:1100,height:700,webPreferences:{backgroundThrottling:false}}}));
  win.webContents.on('did-create-window',child=>children.push(child));
  win.webContents.on('console-message',event=>{if(event.level==='error'&&!/permission|MIDI|device|media|404/i.test(event.message))errors.push(event.message);});
  const url=`http://127.0.0.1:${server.address().port}/`;
  await win.loadURL(url);
  await evaluate(`
    window.testErrors=[];window.addEventListener('error',e=>testErrors.push(e.message));window.addEventListener('unhandledrejection',e=>testErrors.push(String(e.reason)));
    window.check=(value,message)=>{if(!value)throw new Error(message);};
    window.until=async(fn,message)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw new Error(message);};
    window.enter=async()=>{
      document.getElementById('studio-mode-toggle').click();
      document.getElementById('studio-password-input').value='smoke-only-123';document.getElementById('studio-password-confirm').value='smoke-only-123';
      document.getElementById('studio-password-form').requestSubmit();
      await until(()=>document.body.classList.contains('studio-mode'),'Studio login failed');
    };
    await new Promise(r=>setTimeout(r,250));await enter();
    document.getElementById('create-song').click();check(!document.getElementById('new-song-modal').hidden,'New song did not open');
    document.getElementById('new-song-name').value='Smoke song';document.getElementById('new-song-empty').click();
    await until(()=>document.querySelector('.library-song'),'Empty song not created');
    document.querySelector('.library-add').click();
    document.getElementById('lyrics-edit-button').click();
    check(!document.getElementById('lyrics-editor-modal').hidden,'Editor did not open');
    document.getElementById('lyrics-editor-text').value='[00:00.00] Primeira linha\\n[00:01.00] Segunda linha';document.getElementById('lyrics-editor-text').dispatchEvent(new Event('input',{bubbles:true}));
  `,true);
  console.log('Studio password, empty song, setlist and editor: OK');
  await fs.mkdir(path.resolve(__dirname,'../dist/qa'),{recursive:true});
  for(const [width,height] of [[1273,930],[1024,768],[800,650]]){
    win.setContentSize(width,height);await new Promise(r=>setTimeout(r,120));
    const layout=await win.webContents.executeJavaScript(`(()=>{const modal=document.querySelector('.lyrics-editor-modal'),button=document.querySelector('#lyrics-editor-form button[type=submit]');const r=button.getBoundingClientRect();return {height:innerHeight,bottom:r.bottom,top:r.top,modalScroll:modal.scrollHeight-modal.clientHeight};})()`);
    if(layout.bottom>layout.height||layout.top<0)throw new Error('Editor actions outside viewport '+JSON.stringify({width,height,...layout}));
  }
  win.setContentSize(1273,930);
  await fs.writeFile(path.resolve(__dirname,'../dist/qa/editor.png'),(await win.webContents.capturePage()).toPNG());
  await evaluate(`
    document.getElementById('lyrics-editor-form').requestSubmit();await until(()=>document.getElementById('lyrics-editor-modal').hidden,'Lyrics did not save');
    document.getElementById('create-song').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));check(!document.getElementById('learn-modal').hidden,'Learn menu absent');
    document.getElementById('learn-key').click();document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'j',code:'KeyJ',ctrlKey:true,altKey:true,bubbles:true}));
    const shortcut=JSON.parse(localStorage.getItem('stageset-button-shortcuts'));check(shortcut['create-song'].key.code==='KeyJ','Shortcut not saved');
    document.getElementById('studio-mode-toggle').click();document.getElementById('studio-mode-toggle').click();
    check(document.getElementById('studio-password-confirm-field').hidden,'Existing password asks confirmation');document.getElementById('studio-password-input').value='smoke-only-123';document.getElementById('studio-password-form').requestSubmit();await until(()=>document.body.classList.contains('studio-mode'),'Second login failed');
    check(!testErrors.length,testErrors.join('\\n'));
  `,true);
  await evaluate(`
    window.getSongs=()=>new Promise((resolve,reject)=>{const open=indexedDB.open('stageset-library');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,request=db.transaction('songs').objectStore('songs').getAll();request.onsuccess=()=>{db.close();resolve(request.result);};};});
    document.getElementById('audio-mixer-button').click();await until(()=>document.querySelector('.audio-channel-label input'),'Mixer name field missing');
    const name=document.querySelector('.audio-channel-label input');name.value='Voz principal';name.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('close-audio-mixer').click();
    document.getElementById('pedal-button').click();document.getElementById('add-pedal').click();check(document.querySelectorAll('.pedal-row').length===5,'Fifth pedal not added');
    document.getElementById('setlist-cc-enabled').checked=true;document.getElementById('setlist-cc-enabled').dispatchEvent(new Event('change'));
    for(const type of ['cc','program','note','song']){
      const select=document.getElementById('setlist-midi-type');select.value=type;select.dispatchEvent(new Event('change'));
      const songs=document.getElementById('midi-assign-song');songs.selectedIndex=1;songs.dispatchEvent(new Event('change'));document.getElementById('midi-assign-value').value='37';document.getElementById('midi-assign-save').click();
      await new Promise(r=>setTimeout(r,100));check(document.getElementById('midi-assign-value').value==='37','MIDI mapping failed '+type);
    }
    document.getElementById('close-pedals').click();
    check((await getSongs())[0].audioChannelNames[0]==='Voz principal','Mixer name not persisted');
    document.getElementById('lyrics-mosaic-button').click();
  `);
  await new Promise(resolve=>setTimeout(resolve,400));
  const mosaic=children.find(child=>child.webContents.getURL().includes('mosaic.html'));
  if(!mosaic)throw new Error('Mosaic did not open');
  const mosaicResult=await mosaic.webContents.executeJavaScript(`(async()=>{
    for(let i=0;i<40&&!document.querySelector('.tile');i++)await new Promise(r=>setTimeout(r,50));
    const tile=document.querySelector('.tile');if(!tile)return 'No mosaic tiles';
    if(tile.querySelector('.lines').textContent.includes('[00:'))return 'Timestamps visible by default';
    const size=tile.querySelector('input');size.value='57';size.dispatchEvent(new Event('input'));return 'OK';
  })()`);
  if(mosaicResult!=='OK')throw new Error(mosaicResult);
  await new Promise(resolve=>setTimeout(resolve,250));
  await evaluate(`check((await getSongs())[0].lyricOutputSettings['1'].fontSize===57,'Mosaic size not saved');check(!testErrors.length,testErrors.join('\\n'));`);
  console.log('Editable mixer names, 5 pedals, CC/PC/Note/Song mapping and mosaic controls: OK');
  await require('./annotations.cjs')({win,mosaic,evaluate,children});
  await require('./backgrounds-ui.cjs')({win,mosaic,evaluate,children});
  await require('./session-ui.cjs')({url,children});
  const reloaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.reload();await reloaded;
  await evaluate(`for(let i=0;i<100&&!document.querySelector('.library-song');i++)await new Promise(resolve=>setTimeout(resolve,30));`);
  const saved=await win.webContents.executeJavaScript(`({songs:document.querySelectorAll('.library-song').length,version:document.querySelector('.app-version').textContent,studio:document.body.classList.contains('live-mode')})`);
  if(saved.songs!==2||saved.version!==expectedVersion||!saved.studio)throw new Error('Reload persistence failed '+JSON.stringify(saved));
  const backgroundSaved=await win.webContents.executeJavaScript(`document.getElementById('lyrics-stage').style.backgroundColor==='rgb(39, 52, 73)' && JSON.parse(localStorage.getItem('stageset-display-outputs')).find(o=>o.id==='2').background.type==='image'`);
  if(!backgroundSaved)throw Error('Background reload persistence failed');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Editor layout, save, Learn, password confirmation and reload persistence: OK');
}
run().then(async()=>{await fs.writeFile(logPath,JSON.stringify({ok:true}));finish(0);}).catch(async error=>{await fs.mkdir(path.dirname(logPath),{recursive:true});await fs.writeFile(logPath,JSON.stringify({ok:false,error:error.stack,console:errors}));console.error(error);finish(1);});
async function finish(code){for(const child of children)if(!child.isDestroyed())child.destroy();if(win&&!win.isDestroyed())win.destroy();if(server)await new Promise(resolve=>server.close(resolve));app.exit(code);}
setTimeout(()=>{console.error('Smoke test timeout');app.exit(1);},60000).unref();
