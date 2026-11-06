// Isolated diagnostic: 32 short silent WAVs, no access to the musician's profile.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url');
let win,server;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(fn,label,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await delay(100);}throw Error(label);}
async function run(){
  app.setPath('userData',await fs.mkdtemp(path.join(os.tmpdir(),'stageset-stems-')));
  await app.whenReady();
  const {createStageSetServer}=await import(pathToFileURL(path.resolve(__dirname,'../server.mjs')).href);
  server=createStageSetServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
  const js=code=>win.webContents.executeJavaScript(`(async()=>{${code}})()`,true);
  await js(`window.tracks=new Set();const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.tracks.add(this);return play.call(this)};document.getElementById('studio-mode-toggle').click();document.getElementById('studio-password-input').value='stems-test';document.getElementById('studio-password-confirm').value='stems-test';document.getElementById('studio-password-form').requestSubmit();`);
  await wait(()=>js(`return document.body.classList.contains('studio-mode')`),'Studio indisponível');
  await js(`document.getElementById('create-song').click();document.getElementById('new-song-name').value='32 WAV teste';const bytes=new ArrayBuffer(44+16000*10),v=new DataView(bytes),write=(offset,text)=>[...text].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));write(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);write(8,'WAVE');write(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);write(36,'data');v.setUint32(40,bytes.byteLength-44,true);const dt=new DataTransfer();for(let i=0;i<32;i++)dt.items.add(new File([bytes],'pista-'+i+'.wav',{type:'audio/wav'}));const input=document.getElementById('new-song-files');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));`);
  await wait(()=>js(`return document.querySelector('.library-song')&&document.querySelector('#audio-mixer-button')&&!document.querySelector('#audio-mixer-button').hidden`),'Música não criada');
  await delay(1500);
  for(let cycle=0;cycle<3;cycle++){
    await js(`document.getElementById('play').click()`);
    await wait(()=>js(`return tracks.size===32&&[...tracks].every(a=>!a.paused)`),'Nem todas as 32 WAV arrancaram');
    await delay(500);
    const spread=await js(`const times=[...tracks].map(a=>a.currentTime);return Math.max(...times)-Math.min(...times)`);
    if(spread>.2)throw Error(`Desvio entre WAV: ${spread.toFixed(3)} s no ciclo ${cycle+1}`);
    await js(`document.getElementById('play').click()`);
    await wait(()=>js(`return [...tracks].every(a=>a.paused)`),'Pausa incompleta');
    console.log(`32 WAV · ciclo ${cycle+1}: desvio ${Math.round(spread*1000)} ms`);
  }
}
run().then(()=>finish(0)).catch(error=>{console.error(error);finish(1);});
function finish(code){if(win&&!win.isDestroyed())win.destroy();if(server)server.close();app.exit(code);}
setTimeout(()=>{console.error('Timeout no teste de WAV');app.exit(1);},60000).unref();
