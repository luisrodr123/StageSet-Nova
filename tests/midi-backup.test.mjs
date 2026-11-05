import test from 'node:test';import assert from 'node:assert/strict';
import {MidiPlayer,createMidiFromNotes,parseMidiFile,createKaraokeMidi} from '../midi.js';
import {createBackup,readBackup} from '../backup.js';
test('MIDI master adjusts synth gain and external CC7 without changing channel volume',()=>{
  const player=new MidiPlayer(), messages=[], gains=[];
  player.midiOutput={send:bytes=>messages.push(bytes)};
  player.context={currentTime:1};player.master={gain:{setTargetAtTime:value=>gains.push(value)}};
  player.setVolume(.8);player.setMixMasterVolume(.5);
  assert.equal(gains.at(-1),.4);assert.equal(player.channelMix[0].volume,1);
  assert.ok(messages.some(bytes=>bytes[0]===0xb0&&bytes[1]===7&&bytes[2]===51));
  player.setMixMasterVolume(undefined);assert.equal(player.mixMasterVolume,1);
});
test('explicit 140 BPM and MIDI note timing survive import/export',async()=>{
  const file=createMidiFromNotes([{channel:0,note:60,velocity:100,time:0,endTime:1}],140);
  const buffer=file.buffer,parsed=parseMidiFile(buffer);
  assert.ok(Math.abs(parsed.tempo-140)<.001);
  assert.ok(Math.abs(parsed.notes[0].endTime-parsed.notes[0].time-1)<.005);
  const kar=createKaraokeMidi({sourceBuffer:buffer,sourceData:parsed,lyricEvents:[{time:.4,text:'Palco'}],bpm:140});
  const restored=parseMidiFile(kar.buffer);assert.equal(restored.notes.length,1);assert.ok(Math.abs(restored.lyrics.find(line=>line.text==='/Palco').time-.4)<.005);
});
test('backup preserves window preferences, played tracks and all selection types',async()=>{
  for(const type of ['cc','program','note','song']){
    const song={id:'song-1',title:'Teste',fileName:'teste.wav',audioBlob:new Blob(['audio']),lyricOutputSettings:{'1':{fontSize:37}},audioChannelNames:['Voz']};
    const file=createBackup([song],{setlist:['song-1'],playedSongIds:['song-1'],setlistCcConfig:{enabled:true,type,channel:2,number:7},pedalMappings:[{trigger:{type:'control',channel:0,number:4,inputId:'input-1'},action:'playPause'}],interfaceSettings:{'stageset-display-outputs':'[]'}});
    const loaded=await readBackup(file);assert.equal(loaded.setlistCcConfig.type,type);assert.deepEqual(loaded.playedSongIds,['song-1']);assert.equal(loaded.songs[0].audioChannelNames[0],'Voz');assert.equal(loaded.songs[0].lyricOutputSettings['1'].fontSize,37);assert.equal(loaded.interfaceSettings['stageset-display-outputs'],'[]');
  }
});
