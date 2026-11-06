// Exercise the real application with an isolated profile and 16 generated WAV files.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { pathToFileURL } = require('node:url');
let win, server;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(fn, label, timeout = 20000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return; await delay(100); } throw Error(label); }
async function main() {
  app.setPath('userData', await fs.mkdtemp(path.join(os.tmpdir(), 'stageset-app-clock-')));
  await app.whenReady();
  const { createStageSetServer } = await import(pathToFileURL(path.resolve(__dirname, '../server.mjs')).href);
  server = createStageSetServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  win = new BrowserWindow({ show: false, width: 1100, height: 800, webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
  const js = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await js(`window.clockStarts=[];const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){clockStarts.push({when:args[0],offset:args[1],buffer:!!this.buffer});return start.apply(this,args)};document.getElementById('studio-mode-toggle').click();document.getElementById('studio-password-input').value='clock-test';document.getElementById('studio-password-confirm').value='clock-test';document.getElementById('studio-password-form').requestSubmit();`);
  await wait(() => js(`return document.body.classList.contains('studio-mode')`), 'Studio indisponível');
  await js(`document.getElementById('create-song').click();document.getElementById('new-song-name').value='16 WAV';const bytes=new ArrayBuffer(44+16000*10),v=new DataView(bytes),write=(offset,text)=>[...text].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));write(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);write(8,'WAVE');write(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);write(36,'data');v.setUint32(40,bytes.byteLength-44,true);const dt=new DataTransfer();for(let i=0;i<16;i++)dt.items.add(new File([bytes],'pista-'+i+'.wav',{type:'audio/wav'}));const input=document.getElementById('new-song-files');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));`);
  await wait(() => js(`return document.querySelector('.library-song') && !document.querySelector('#audio-mixer-button').hidden`), 'Música não criada');
  await delay(2500);
  for (let cycle = 0; cycle < 3; cycle++) {
    await js(`window.clockStarts=[];document.getElementById('play').click()`);
    await wait(() => js(`return clockStarts.filter(x=>x.buffer).length>=16`), 'Fontes WAV não arrancaram');
    const starts = await js(`return clockStarts.filter(x=>x.buffer).slice(0,16)`);
    if (starts.some(item => item.when !== starts[0].when || item.offset !== starts[0].offset)) throw Error('Pistas não partilham instante e posição: ' + JSON.stringify(starts));
    await delay(250);
    await js(`document.getElementById('play').click()`);
    await wait(() => js(`return document.getElementById('audio').paused`), 'Pausa falhou');
    if (cycle === 0) await js(`const p=document.getElementById('progress');p.value='400';p.dispatchEvent(new Event('input',{bubbles:true}));`);
    await delay(300);
  }
  await js(`window.clockStarts=[];document.getElementById('play').click()`);
  await wait(() => js(`return clockStarts.filter(x=>x.buffer).length>=16`), 'Arranque para procura indisponível');
  await js(`window.clockStarts=[];const p=document.getElementById('progress');p.value='600';p.dispatchEvent(new Event('input',{bubbles:true}));`);
  await wait(() => js(`return clockStarts.filter(x=>x.buffer).length>=16`), 'Procura em reprodução não reagendou as pistas');
  const seekStarts = await js(`return clockStarts.filter(x=>x.buffer).slice(-16)`);
  if (seekStarts.some(item => item.when !== seekStarts[0].when || item.offset !== seekStarts[0].offset || Math.abs(item.offset-6)>.05)) throw Error('Procura desalinhada: ' + JSON.stringify(seekStarts));
  await js(`document.getElementById('audio-mixer-button').click()`);
  await wait(() => js(`return document.getElementById('audio-mixer-description').textContent.includes('relógio partilhado')`), 'Estado do relógio não indicado no mixer');
  await js(`document.getElementById('play').click()`);
  await wait(() => js(`return document.getElementById('audio').paused`), 'Pausa após abrir mixer falhou');
  await delay(250);
  await js(`window.clockStarts=[];const a=document.getElementById('audio');void a.play();a.pause();void a.play();`);
  await wait(() => js(`return clockStarts.filter(x=>x.buffer).length>=16`), 'Retoma rápida não arrancou todas as pistas');
  await delay(250);
  if (await js(`return document.getElementById('audio').paused`)) throw Error('Retoma rápida ficou em pausa');
  console.log('Aplicação: 16 WAV, pausas/retomas, procura, mixer e retoma rápida.');
}
main().then(() => finish(0), error => { console.error(error); finish(1); });
function finish(code) { if (win && !win.isDestroyed()) win.destroy(); if (server) server.close(); app.exit(code); }
setTimeout(() => { console.error('Timeout no teste de áudio'); app.exit(1); }, 60000).unref();
