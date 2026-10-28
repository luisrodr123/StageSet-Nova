import test from 'node:test';import assert from 'node:assert/strict';import dgram from 'node:dgram';import {once} from 'node:events';
import {IpMidi,MidiStream} from '../desktop/ip-midi.cjs';
test('MIDI stream: running status, real-time interleaving, SysEx across packets',()=>{
  const p=new MidiStream();assert.deepEqual(p.push([0x90,60,0xf8,100,61,90]),[[0xf8],[0x90,60,100],[0x90,61,90]]);
  assert.deepEqual(p.push([0xf0,0x7f,0x7f,1]),[]);assert.deepEqual(p.push([1,0,0,0,0,0xf7]),[[0xf0,0x7f,0x7f,1,1,0,0,0,0,0xf7]]);
  assert.deepEqual(p.push([0xf3,42,0xc2,10]),[[0xf3,42],[0xc2,10]]);
});
test('ten real UDP listeners keep ports and 16 channels independent; clean shutdown',async()=>{
  const network=new IpMidi(),sender=dgram.createSocket('udp4');
  const port=35000+Math.floor(Math.random()*1000)*10;
  try{
    const ports=await network.start({basePort:port,interfaceAddress:'127.0.0.1'});assert.equal(ports.length,10);
    for(let i=0;i<10;i++)for(let channel=0;channel<16;channel++){
      const received=once(network,'message',{signal:AbortSignal.timeout(3000)});
      sender.send(Buffer.from([0x90|channel,60,100]),port+i,'127.0.0.1');
      const [message]=await received;assert.equal(message.id,`ipmidi-${i+1}`);assert.deepEqual(message.data,[0x90|channel,60,100]);
    }
    network.send('ipmidi-1',[0x80,60,0],500);assert.equal(network.timers.get('ipmidi-1').size,1);network.clear('ipmidi-1');assert.equal(network.timers.size,0);
    assert.throws(()=>network.send('ipmidi-11',[0x90,60,100]));
  }finally{network.stop();sender.close();}
  assert.equal(network.list().length,0);
});
