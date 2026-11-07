// Isolated regression: sixteen four-minute WAVs must not be rejected by the memory budget.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { pathToFileURL } = require('node:url');
let win, server;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(fn, label, timeout = 45000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return; await delay(150); } throw Error(label); }
async function main() {
  app.setPath('userData', await fs.mkdtemp(path.join(os.tmpdir(), 'stageset-long-wav-')));
  await app.whenReady();
  const { createStageSetServer } = await import(pathToFileURL(path.resolve(__dirname, '../server.mjs')).href);
  server = createStageSetServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  win = new BrowserWindow({ show: false, width: 1100, height: 800, webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
  const js = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await js(`window.players=new Set();const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...args){players.add(this);return play.apply(this,args)};const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(destination,...args){if(destination instanceof AudioDestinationNode){window.outputAnalyser=this.context.createAnalyser();connect.call(this,outputAnalyser);}return connect.call(this,destination,...args)};document.getElementById('studio-mode-toggle').click();document.getElementById('studio-password-input').value='long-test';document.getElementById('studio-password-confirm').value='long-test';document.getElementById('studio-password-form').requestSubmit();`);
  await wait(() => js(`return document.body.classList.contains('studio-mode')`), 'Studio indisponível');
  await js(`document.getElementById('create-song').click();document.getElementById('new-song-name').value='16 WAV longas';const frames=240*8000,bytes=new ArrayBuffer(44+frames*2),v=new DataView(bytes),write=(o,t)=>[...t].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));write(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);write(8,'WAVE');write(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);write(36,'data');v.setUint32(40,frames*2,true);for(let i=0;i<8000*8;i++)v.setInt16(44+i*2,Math.round(500*Math.sin(2*Math.PI*440*i/8000)),true);const dt=new DataTransfer();for(let i=0;i<16;i++)dt.items.add(new File([bytes],'longa-'+i+'.wav',{type:'audio/wav'}));const input=document.getElementById('new-song-files');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));`);
  await wait(() => js(`return document.querySelector('.library-song') && !document.querySelector('#audio-mixer-button').hidden`), 'Música longa não criada');
  await delay(2500);
  await js(`document.getElementById('audio-mixer-button').click()`);
  await wait(() => js(`return document.getElementById('audio-mixer-description').textContent.includes('memória')`), 'Modo independente não explicou o limite de memória');
  await js(`document.getElementById('play').click()`);
  await wait(() => js(`return players.size===16 && [...players].every(a=>!a.paused)`), 'As 16 pistas longas não arrancaram');
  await wait(() => js(`if(!window.outputAnalyser)return false;const data=new Float32Array(outputAnalyser.fftSize);outputAnalyser.getFloatTimeDomainData(data);return data.some(value=>Math.abs(value)>0.001);`), 'Não chegou sinal das WAV longas à saída');
  await js(`document.getElementById('play').click()`);
  await wait(() => js(`return [...players].every(a=>a.paused)`), 'As WAV longas não pausaram');
  console.log('16 WAV de 4 minutos a 8 kHz: reprodução, saída e pausa em modo independente.');
}
main().then(() => finish(0), error => { console.error(error); finish(1); });
function finish(code) { if (win && !win.isDestroyed()) win.destroy(); if (server) server.close(); app.exit(code); }
setTimeout(() => { console.error('Timeout no teste de WAV longas'); app.exit(1); }, 90000).unref();
