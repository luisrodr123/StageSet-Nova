// Regression test: WAV with different durations must remain playable, with an explicit fallback.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { pathToFileURL } = require('node:url');
let win, server;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(fn, label, timeout = 20000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return; await delay(100); } throw Error(label); }
async function main() {
  app.setPath('userData', await fs.mkdtemp(path.join(os.tmpdir(), 'stageset-fallback-')));
  await app.whenReady();
  const { createStageSetServer } = await import(pathToFileURL(path.resolve(__dirname, '../server.mjs')).href);
  server = createStageSetServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  win = new BrowserWindow({ show: false, width: 1100, height: 800, webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
  const js = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await js(`window.players=new Set();const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...args){players.add(this);return play.apply(this,args)};const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(destination,...args){if(destination instanceof AudioDestinationNode){window.outputAnalyser=this.context.createAnalyser();connect.call(this,outputAnalyser);}return connect.call(this,destination,...args)};document.getElementById('studio-mode-toggle').click();document.getElementById('studio-password-input').value='fallback-test';document.getElementById('studio-password-confirm').value='fallback-test';document.getElementById('studio-password-form').requestSubmit();`);
  await wait(() => js(`return document.body.classList.contains('studio-mode')`), 'Studio indisponível');
  await js(`document.getElementById('create-song').click();document.getElementById('new-song-name').value='WAV de durações diferentes';function wav(seconds,hz){const bytes=new ArrayBuffer(44+16000*seconds),v=new DataView(bytes),write=(offset,text)=>[...text].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));write(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);write(8,'WAVE');write(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);write(36,'data');v.setUint32(40,bytes.byteLength-44,true);for(let i=0;i<8000*seconds;i++)v.setInt16(44+i*2,Math.round(4000*Math.sin(2*Math.PI*hz*i/8000)),true);return bytes;}const dt=new DataTransfer();dt.items.add(new File([wav(10,440)],'principal.wav',{type:'audio/wav'}));dt.items.add(new File([wav(8,700)],'pista.wav',{type:'audio/wav'}));const input=document.getElementById('new-song-files');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));`);
  await wait(() => js(`return document.querySelector('.library-song') && !document.querySelector('#audio-mixer-button').hidden`), 'Música não criada');
  await delay(2000);
  await js(`document.getElementById('audio-mixer-button').click()`);
  await wait(() => js(`return document.getElementById('audio-mixer-description').textContent.includes('duração')`), 'Razão do modo independente não apresentada');
  await js(`document.getElementById('play').click()`);
  await wait(() => js(`return players.size===2 && [...players].every(a=>!a.paused)`), 'As duas pistas não arrancaram');
  await wait(() => js(`if(!window.outputAnalyser)return false;const data=new Float32Array(outputAnalyser.fftSize);outputAnalyser.getFloatTimeDomainData(data);return data.some(value=>Math.abs(value)>0.001);`), 'Não chegou som à saída');
  await wait(() => js(`const a=outputAnalyser;a.fftSize=4096;const data=new Uint8Array(a.frequencyBinCount);a.getByteFrequencyData(data);return [440,700].every(hz=>{const i=Math.round(hz*a.fftSize/a.context.sampleRate);return Math.max(...data.slice(i-2,i+3))>80});`), 'As duas frequências das pistas não chegaram à saída');
  await js(`document.getElementById('play').click()`);
  await wait(() => js(`return [...players].every(a=>a.paused)`), 'As pistas não pausaram');
  console.log('WAV de durações diferentes: aviso visível, duas pistas reproduzem com som e pausam.');
}
main().then(() => finish(0), error => { console.error(error); finish(1); });
function finish(code) { if (win && !win.isDestroyed()) win.destroy(); if (server) server.close(); app.exit(code); }
setTimeout(() => { console.error('Timeout no teste WAV'); app.exit(1); }, 60000).unref();
