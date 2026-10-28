import test from 'node:test';
import assert from 'node:assert/strict';
import { timecode,secondsFromTimecode,formatTimecode,fullFrame,quarterFrame,MtcDecoder,ltcBits,decodeLtcBits,LtcDecoder,RATES } from '../timecode.js';
test('SMPTE known labels, day wrap and drop-frame minute boundaries',()=>{
  assert.equal(formatTimecode(timecode(3723.16,1)),'01:02:03:04');
  assert.equal(formatTimecode(timecode(86400,1)),'00:00:00:00');
  assert.equal(formatTimecode(timecode(1800/RATES[2],2)),'00:01:00;02');
  assert.equal(formatTimecode(timecode(17982/RATES[2],2)),'00:10:00;00');
  assert.equal(secondsFromTimecode({hours:0,minutes:1,seconds:0,frames:0,rate:2}),null);
  for(let rate=0;rate<4;rate++)for(let frame=0;frame<200000;frame+=137){const t=timecode(frame/RATES[rate],rate);assert.ok(Math.abs(secondsFromTimecode(t)-frame/RATES[rate])<1e-7);}
});
test('MTC golden packets, continuous/reverse frames and rejection of broken sequences',()=>{
  const t={hours:1,minutes:2,seconds:3,frames:4,rate:1};
  assert.deepEqual(fullFrame(t),[240,127,127,1,1,33,2,3,4,247]);
  assert.deepEqual(Array.from({length:8},(_,i)=>quarterFrame(t,i)[1]),[4,16,35,48,66,80,97,114]);
  const decoder=new MtcDecoder();let frame;
  for(let i=0;i<8;i++)frame=decoder.push(quarterFrame(t,i));
  assert.equal(frame.time,3723.24);assert.equal(frame.direction,1);
  decoder.reset();for(let i=7;i>=0;i--)frame=decoder.push(quarterFrame(t,i));assert.equal(frame.time,3723.08);
  assert.equal(decoder.push(fullFrame(t)).time,3723.16);
  decoder.reset();for(const i of [0,1,2,4,5,6,7])assert.equal(decoder.push(quarterFrame(t,i)),null);
  assert.equal(decoder.push([240,127,127,1,1,33,90,3,4,247]),null);
});
test('LTC known BCD positions, parity and sync bits',()=>{
  const t={hours:1,minutes:2,seconds:3,frames:4,rate:1},bits=ltcBits(t);
  assert.equal(bits.slice(0,4).join(''),'0010');assert.equal(bits.slice(16,20).join(''),'1100');
  assert.equal(bits.slice(64).join(''),'0011111111111101');assert.equal(bits.reduce((a,b)=>a+b,0)%2,0);
  assert.equal(decodeLtcBits(bits,1).time,3723.16);
  bits[0]^=1;assert.equal(decodeLtcBits(bits,1),null);
});
test('actual LTC worklet produces decodable PCM across audio blocks and all rates',async()=>{
  let Processor;
  globalThis.AudioWorkletProcessor=class{constructor(){this.port={onmessage:null,postMessage(){}};}};
  globalThis.registerProcessor=(_,klass)=>{Processor=klass;};
  await import('../ltc-worklet.js');
  for(const sampleRate of [44100,48000])for(let rate=0;rate<4;rate++){
    globalThis.sampleRate=sampleRate;globalThis.currentTime=0;
    const processor=new Processor({processorOptions:{rate,mode:'write'}}),decoder=new LtcDecoder(sampleRate,rate);
    processor.port.onmessage({data:{active:true,time:3723,speed:1,reset:true}});
    const frames=[];
    for(let i=0;i<Math.ceil(sampleRate/128);i++){
      globalThis.currentTime=i*128/sampleRate;const samples=new Float32Array(128);processor.process([],[[samples]]);frames.push(...decoder.push(samples));
    }
    assert.ok(frames.length>=RATES[rate]-4,`decoded ${frames.length} frames at ${sampleRate}/${rate}`);
    for(let i=1;i<frames.length;i++)assert.ok(Math.abs(frames[i].time-frames[i-1].time-1/RATES[rate])<1e-6);
    processor.port.onmessage({data:{active:false,time:3724}});const samples=new Float32Array(128);processor.process([],[[samples]]);assert.ok(samples.every(n=>n===0));
  }
});
