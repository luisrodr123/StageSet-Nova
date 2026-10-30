module.exports=async({url,children})=>{
  const {BrowserWindow,ipcMain}=require('electron'),path=require('node:path');
  let config,feedback='',published;
  ipcMain.handle('test-session-start',(_,value)=>{config=value;return {role:value.role,peers:[],master:null};});
  ipcMain.handle('test-session-feedback',(_,value)=>{feedback=value;});
  ipcMain.handle('test-session-state',(_,value)=>{published=value;});
  const win=new BrowserWindow({show:false,width:1273,height:930,webPreferences:{preload:path.join(__dirname,'session-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});children.push(win);
  await win.loadURL(url);
  const evalJs=code=>win.webContents.executeJavaScript(`(async()=>{${code}})()`,true);
  const until=async fn=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Session UI timeout, feedback: '+feedback);};
  const send=(type,data)=>win.webContents.send('test-session-event',type,data);
  try{
    await until(()=>evalJs(`return !!document.querySelector('.library-song')`));
    await evalJs(`document.getElementById('session-name').value='Teste';document.getElementById('session-role').value='slave';document.getElementById('session-code').value='session-test-123';document.getElementById('session-start').click();`);
    await until(()=>config?.role==='slave');
    const song=await evalJs(`return await new Promise(resolve=>{const open=indexedDB.open('stageset-library');open.onsuccess=()=>{const db=open.result,r=db.transaction('songs').objectStore('songs').getAll();r.onsuccess=()=>{db.close();resolve(r.result.find(s=>s.title==='MIDI sem silencio'));};};});`);
    const state={song:{id:song.id,title:song.title,fileName:song.fileName},playing:false,position:1.2,rate:1};
    send('control',state);await until(()=>feedback==='Sincronizado');
    if(!await evalJs(`return document.getElementById('elapsed').textContent==='0:01'`))throw Error('Remote locate did not seek MIDI');
    send('control',{...state,playing:true});await until(()=>evalJs(`return document.getElementById('lyrics-play-button').getAttribute('aria-pressed')==='true'`));
    send('lost','Ligação perdida');await until(()=>evalJs(`return document.getElementById('lyrics-play-button').getAttribute('aria-pressed')!=='true'`));
    feedback='';send('control',{...state,song:{id:'absent',title:'Missing',fileName:'missing.wav'}});await until(()=>feedback.includes('ausente'));
    if(await evalJs(`return localStorage.getItem('stageset-session-settings').includes('session-test-123')`))throw Error('Session code persisted');
    await evalJs(`document.getElementById('session-stop').click();`);await until(()=>evalJs(`return !document.getElementById('session-start').disabled`));
    config=null;await evalJs(`document.getElementById('session-role').value='master';document.getElementById('session-start').click();`);await until(()=>published);
    if(!published.song||typeof published.position!=='number')throw Error('Master did not publish real playback state');
    await evalJs(`document.getElementById('session-stop').click();`);
    console.log('Native bridge UI: Slave song selection, seek/play, loss pause, missing song, Master publication: OK');
  }finally{win.destroy();for(const name of ['start','feedback','state'])ipcMain.removeHandler('test-session-'+name);}
};
