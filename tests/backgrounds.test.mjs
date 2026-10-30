import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeBackground} from '../backgrounds.js';
import {convertEps,findGhostscript} from '../desktop/background-image.cjs';
import {createBackup,readBackup} from '../backup.js';
test('backgrounds accept only bounded raster data and survive show backup',async()=>{
  assert.equal(normalizeBackground({type:'image',image:'javascript:alert(1)'}).type,'solid');
  assert.equal(normalizeBackground({type:'image',image:'data:image/svg+xml;base64,AAAA'}).image,'');
  assert.equal(normalizeBackground({type:'image',image:'data:image/png;base64,'+'A'.repeat(180000)}).image,'');
  const solid=normalizeBackground({color:'#123456'}),image=normalizeBackground({type:'image',image:'data:image/png;base64,AAAA',fit:'repeat',dim:30,name:'wallpaper.png'});
  const settings={'stageset-main-background':JSON.stringify(solid),'stageset-display-outputs':JSON.stringify([{id:'1',background:image},{id:'2',background:solid}])};
  const restored=await readBackup(createBackup([], {interfaceSettings:settings}));assert.deepEqual(restored.interfaceSettings,settings);
});
test('EPS validation and real conversion if Ghostscript is installed',async t=>{
  await assert.rejects(convertEps(new Uint8Array([1,2,3,4])),/EPS/);
  if(!await findGhostscript()){t.skip('Ghostscript optional dependency is not installed');return;}
  const eps=Buffer.from('%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 100\n0.2 0.5 0.8 setrgbcolor 0 0 100 100 rectfill\nshowpage\n%%EOF\n');
  const result=Buffer.from(await convertEps(eps));assert.equal(result.subarray(1,4).toString(),'PNG');assert.equal(result.readUInt32BE(16),1600);assert.equal(result.readUInt32BE(20),1200);
});
