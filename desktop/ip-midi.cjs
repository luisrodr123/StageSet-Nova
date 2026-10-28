const dgram = require('node:dgram');
const { isIPv4 } = require('node:net');
const { EventEmitter } = require('node:events');

class MidiStream {
  constructor() { this.running=0; this.bytes=[]; this.expected=0; }
  push(packet) {
    const messages=[];
    for(const byte of packet) {
      if(byte>=0xf8){messages.push([byte]);continue;}
      if(byte===0xf7){if(this.bytes[0]===0xf0){messages.push([...this.bytes,byte]);}this.bytes=[];this.expected=0;continue;}
      if(byte&0x80){
        this.bytes=[byte];this.running=byte<0xf0?byte:0;
        this.expected=byte<0xf0?([0xc0,0xd0].includes(byte&0xf0)?2:3):({241:2,242:3,243:2,246:1}[byte]||0);
        if(this.expected===1){messages.push(this.bytes);this.bytes=[];}
        continue;
      }
      if(!this.bytes.length&&this.running){this.bytes=[this.running];this.expected=[0xc0,0xd0].includes(this.running&0xf0)?2:3;}
      if(!this.bytes.length)continue;
      this.bytes.push(byte);
      if(this.bytes.length>4096){this.bytes=[];this.running=0;continue;}
      if(this.expected && this.bytes.length===this.expected){messages.push(this.bytes);this.bytes=[];}
    }
    return messages;
  }
}

class IpMidi extends EventEmitter {
  constructor(){super();this.ports=[];this.timers=new Map();this.active=false;this.starting=false;}
  async start({group='225.0.0.37',basePort=21928,interfaceAddress=''}={}) {
    if(this.active||this.starting)throw new Error('As portas já estão ligadas. Desliga antes de reconfigurar.');
    if(!isIPv4(group)||Number(group.split('.')[0])<224||Number(group.split('.')[0])>239||!Number.isInteger(basePort)||basePort<1024||basePort>65526||(interfaceAddress&&!isIPv4(interfaceAddress)))throw new Error('Endereço multicast, interface ou porta inválidos.');
    this.starting=true;this.group=group;this.basePort=basePort;
    try {
      for(let index=0;index<10;index++){
        const socket=dgram.createSocket({type:'udp4',reuseAddr:false});const peers=new Map();this.ports.push(socket);
        socket.on('message',(packet,peer)=>{
          if(packet.length>4096)return;
          const key=peer.address+':'+peer.port;
          if(!peers.has(key)){if(peers.size>=64)peers.delete(peers.keys().next().value);peers.set(key,new MidiStream());}
          for(const data of peers.get(key).push(packet))this.emit('message',{id:`ipmidi-${index+1}`,data});
        });
        await new Promise((resolve,reject)=>{socket.once('error',reject);socket.bind(basePort+index,'0.0.0.0',()=>{socket.removeListener('error',reject);resolve();});});
        socket.on('error',error=>{this.emit('status',{error:error.message});this.stop();});
        socket.addMembership(group,interfaceAddress||undefined);if(interfaceAddress)socket.setMulticastInterface(interfaceAddress);
        socket.setMulticastTTL(1);socket.setMulticastLoopback(false);
      }
      this.active=true; return this.list();
    } catch(error){this.stop();throw error;} finally {this.starting=false;}
  }
  list(){return this.active?this.ports.map((_,i)=>({id:`ipmidi-${i+1}`,name:`IP MIDI ${i+1} · 16 canais`,port:this.basePort+i,group:this.group})):[];}
  send(id,data,delay=0){
    const index=Number(String(id).replace(/^ipmidi-/,''))-1;
    if(!this.active||!Number.isInteger(index)||index<0||index>9||!Array.isArray(data)||!data.length||data.length>4096||data.some(b=>!Number.isInteger(b)||b<0||b>255)||data[0]<128)throw new Error('Mensagem MIDI inválida ou porta desligada.');
    const send=()=>{const socket=this.ports[index];if(socket&&this.active)socket.send(Buffer.from(data),this.basePort+index,this.group,error=>{if(error)this.emit('status',{error:error.message});});};
    if(!Number.isFinite(delay)||delay<0||delay>60000)throw new Error('Agendamento MIDI inválido.');
    if(delay<1){send();return;}
    const pending=this.timers.get(id)||new Set();if(pending.size>=8192)throw new Error('Fila MIDI cheia.');
    const timer=setTimeout(()=>{pending.delete(timer);send();},delay);pending.add(timer);this.timers.set(id,pending);
  }
  clear(id){for(const timer of this.timers.get(id)||[])clearTimeout(timer);this.timers.delete(id);}
  stop(){this.active=false;for(const id of this.timers.keys())this.clear(id);for(const socket of this.ports){try{socket.close();}catch{}}this.ports=[];}
}
module.exports={IpMidi,MidiStream};
