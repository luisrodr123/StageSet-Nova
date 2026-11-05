import test from 'node:test';
import assert from 'node:assert/strict';
import {showFiles,showSafeName} from '../show-project.js';

test('show folder preserves independent assets and avoids case-insensitive folder collisions', async () => {
  const songs = [
    {title:'Tema',fileName:'voz.wav',audioBlob:new Blob(['a']),lyricsText:'palco',lyricOutputLyrics:{'2':'banda'}},
    {title:'tema',fileName:'b.pdf',audioBlob:new Blob(['b'])},
    {title:'Tema-2',fileName:'c.mid',audioBlob:new Blob(['c'])},
  ];
  const files = await showFiles(songs,[{id:'2',name:'Banda',background:{image:'data:image/png;base64,aGk='}}]);
  const paths=files.map(file=>file.path);
  assert.ok(paths.includes('media/Tema/audio-voz.wav'));
  assert.ok(paths.includes('media/tema-2/audio-b.pdf'));
  assert.ok(paths.includes('media/Tema-2-2/audio-c.mid'));
  assert.ok(paths.includes('media/Tema/letras-Banda-2.txt'));
  assert.ok(paths.includes('fundos/Banda-2.png'));
  assert.equal(new Set(paths.map(path=>path.toLowerCase())).size,paths.length);
  assert.equal(showSafeName('CON.txt'),'_CON.txt');
});
