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
}
main().then(() => finish(0), error => { console.error(error); finish(1); });
function finish(code) { if (win && !win.isDestroyed()) win.destroy(); if (server) server.close(); app.exit(code); }
setTimeout(() => { console.error('Timeout no teste de áudio'); app.exit(1); }, 60000).unref();
