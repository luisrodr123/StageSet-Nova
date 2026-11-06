// OfflineAudioContext verifies actual rendered sample positions, without the user's profile.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { pathToFileURL } = require('node:url');
let win, server;
async function main() {
  app.setPath('userData', await fs.mkdtemp(path.join(os.tmpdir(), 'stageset-clock-')));
  await app.whenReady();
  const { createStageSetServer } = await import(pathToFileURL(path.resolve(__dirname, '../server.mjs')).href);
  server = createStageSetServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
  await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
  const result = await win.webContents.executeJavaScript(`(async () => {
    const { SharedWavTransport } = await import('/shared-wav-transport.js');
    const sampleRate = 48000, context = new OfflineAudioContext(32, 12000, sampleRate);
    const merger = context.createChannelMerger(32); merger.connect(context.destination);
    const tracks = Array.from({ length: 32 }, (_, i) => {
      const buffer = context.createBuffer(1, 4800, sampleRate);
      buffer.getChannelData(0)[480] = 0.5;
      const destination = context.createGain(); destination.connect(merger, 0, i);
      return { buffer, destination };
    });
    const transport = new SharedWavTransport(context, tracks, { leadTime: 0.05 });
    transport.play();
    const rendered = await context.startRendering();
    return Array.from({ length: 32 }, (_, i) => {
      const data = rendered.getChannelData(i); let peak = 0;
      for (let n = 1; n < data.length; n++) if (Math.abs(data[n]) > Math.abs(data[peak])) peak = n;
      return { peak, value: data[peak] };
    });
  })()`);
  if (result.some(item => item.peak !== 2880 || Math.abs(item.value - 0.5) > 0.00001)) throw Error(JSON.stringify(result));
  console.log('32 WAV: impulsos renderizados na mesma amostra (2880 / 48000 Hz).');
  const decoded = await win.webContents.executeJavaScript(`(async () => {
    const { SharedWavTransport } = await import('/shared-wav-transport.js');
    const { decodeWavTracks } = await import('/wav-preflight.js');
    const sampleRate = 48000, context = new OfflineAudioContext(16, 12000, sampleRate);
    const merger = context.createChannelMerger(16); merger.connect(context.destination);
    const bytes = new ArrayBuffer(44 + 4800 * 2), view = new DataView(bytes);
    const write = (at, text) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
    write(0,'RIFF'); view.setUint32(4,bytes.byteLength-8,true); write(8,'WAVE'); write(12,'fmt ');
    view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true);
    view.setUint32(24,sampleRate,true); view.setUint32(28,sampleRate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true);
    write(36,'data'); view.setUint32(40,9600,true); view.setInt16(44+480*2,16384,true);
    const buffers = await decodeWavTracks(context, Array.from({length:16},()=>new Blob([bytes],{type:'audio/wav'})));
    const tracks = buffers.map((buffer,i)=>{const destination=context.createGain();destination.connect(merger,0,i);return {buffer,destination};});
    const transport = new SharedWavTransport(context, tracks, {leadTime:0.05});
    transport.seek(0.005); transport.play();
    const rendered = await context.startRendering();
    return Array.from({length:16},(_,i)=>{const data=rendered.getChannelData(i);let peak=0;for(let n=1;n<data.length;n++)if(Math.abs(data[n])>Math.abs(data[peak]))peak=n;return {peak,value:data[peak]};});
  })()`);
  if (decoded.some(item => item.peak !== 2640 || Math.abs(item.value - 0.5) > 1 / 32768)) throw Error(JSON.stringify(decoded));
  console.log('16 ficheiros WAV descodificados: impulsos alinhados após procura (amostra 2640).');
}
main().then(() => finish(0), error => { console.error(error); finish(1); });
function finish(code) { if (win && !win.isDestroyed()) win.destroy(); if (server) server.close(); app.exit(code); }
setTimeout(() => { console.error('Timeout no teste de áudio'); app.exit(1); }, 60000).unref();
