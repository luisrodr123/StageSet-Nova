import test from 'node:test';
import assert from 'node:assert/strict';
import {screenPreferences,validateDrawing} from '../screen-data.js';
import {createBackup,readBackup} from '../backup.js';
test('drawings are bounded normalized strokes, reject malformed data, and survive independent show backup',async()=>{
  const strokes=validateDrawing([{tool:'pen',color:'#aaff44',width:.005,points:[[.1,.2],[.8,.6]]},{tool:'eraser',color:'#000000',width:.03,points:[[.3,.3]]}]);
  for(const invalid of [[{...strokes[0],points:[[NaN,0]]}],[{...strokes[0],points:[[2,0]]}],[{...strokes[0],color:'url(x)'}],[{...strokes[0],width:-1}],Array(201).fill(strokes[0]),null])assert.throws(()=>validateDrawing(invalid));
  const song={id:'test',title:'Test',fileName:'test.wav',audioBlob:new Blob(['audio']),lyricAnnotations:{'2':{revision:3,strokes}},lyricOutputLyrics:{'2':'[00:01.00] Letras independentes'}};
  const backup=await readBackup(createBackup([song],{interfaceSettings:{'stageset-main-overlay':JSON.stringify(screenPreferences({opacity:25,autoHide:false}))}}));
  assert.deepEqual(backup.songs[0].lyricAnnotations,song.lyricAnnotations);assert.equal(backup.songs[0].lyricAnnotations.main,undefined);
  assert.equal(JSON.parse(backup.interfaceSettings['stageset-main-overlay']).opacity,25);
});
