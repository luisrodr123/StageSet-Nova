const {EventEmitter} = require('node:events');
const {createHmac, randomUUID, timingSafeEqual} = require('node:crypto');
const {isIPv4} = require('node:net');
const dgram = require('node:dgram');

const PROTOCOL = 'stageset-session-1', LEASE_MS = 2500, PEER_MS = 5000;
const short = (value, max = 180) => typeof value === 'string' && value.length <= max;
function validState(s) {
  return s && typeof s.playing === 'boolean' && Number.isFinite(s.position) && s.position >= 0 && s.position <= 86400 && Number.isFinite(s.rate) && s.rate >= .25 && s.rate <= 4 &&
    (s.song === null || (s.song && short(s.song.id, 80) && short(s.song.title) && short(s.song.fileName)));
}

// Transport-independent state machine. Every start has a new instance and lease;
// sequence numbers and recipient instances reject duplicate/stale control packets.
class SessionPeer extends EventEmitter {
  constructor({id = randomUUID(), name, version, role, code, send, now = Date.now}) {
    super();
    if (!['master','slave'].includes(role) || !short(name,60) || !name.trim() || !short(code,64) || code.length < 6 || !short(id,80)) throw Error('Nome, modo ou código de sessão inválidos (mínimo 6 caracteres).');
    this.id=id;this.name=name;this.version=String(version).slice(0,30);this.role=role;this.code=code;this.send=send;this.now=now;
    this.instance=randomUUID();this.seq=0;this.peers=new Map();this.selected=new Map();this.master=null;this.state=null;this.stateAt=0;this.lastHello=-Infinity;this.lastClaim=-Infinity;this.active=true;this.feedback='À espera do Master';
  }
  packet(type, data={}, target=null) {
    const body=JSON.stringify({protocol:PROTOCOL,id:this.id,instance:this.instance,seq:++this.seq,type,target,data});
    return Buffer.from(JSON.stringify({body,mac:createHmac('sha256',this.code).update(body).digest('hex')}));
  }
  transmit(type,data={},peer=null) { if(this.active)this.send(this.packet(type,data,peer?{id:peer.id,instance:peer.instance}:null)); }
  announce() { this.transmit('hello',{name:this.name,version:this.version,role:this.role,busy:!!this.master});this.lastHello=this.now(); }
  setState(value) { if(!validState(value))throw Error('Estado de reprodução inválido.');this.state=value;this.stateAt=this.now(); }
  setFeedback(value) { this.feedback=String(value).slice(0,180); }
  choose(id, enabled) {
    if(this.role!=='master')throw Error('Só o Master seleciona Slaves.');
    const peer=this.peers.get(id);if(!peer || peer.role!=='slave')throw Error('Slave indisponível.');
    if(enabled){if(this.selected.size>=16&&!this.selected.has(id))throw Error('Máximo de 16 Slaves por sessão.');this.selected.set(id,{lease:null,status:'A ligar'});this.transmit('claim',{},peer);}
    else {const selected=this.selected.get(id);this.transmit('release',{lease:selected?.lease},peer);this.selected.delete(id);}
    this.changed();
  }
  receive(buffer,address='') {
    if(!this.active || buffer.length>8192)return;
    let m;
    try {
      const envelope=JSON.parse(buffer.toString());if(typeof envelope.body!=='string'||!/^[a-f0-9]{64}$/.test(envelope.mac))return;
      const expected=createHmac('sha256',this.code).update(envelope.body).digest();
      if(!timingSafeEqual(expected,Buffer.from(envelope.mac,'hex')))return;
      m=JSON.parse(envelope.body);
    } catch {return;}
    if(m.protocol!==PROTOCOL||!short(m.id,80)||!short(m.instance,80)||m.id===this.id||!Number.isSafeInteger(m.seq)||m.seq<=0||!m.data)return;
    if(m.target && (m.target.id!==this.id||m.target.instance!==this.instance))return;
    let peer=this.peers.get(m.id);
    if(m.type==='hello') {
      const d=m.data;if(!short(d.name,60)||!short(d.version,30)||!['master','slave'].includes(d.role)||typeof d.busy!=='boolean')return;
      if(peer?.instance!==m.instance){
        if(this.master?.id===m.id)this.loseMaster('O Master reiniciou');
        this.selected.delete(m.id);
        if(this.peers.size>=32&&!peer)return;
        peer={id:m.id,instance:m.instance,seq:0};this.peers.set(m.id,peer);
      }
      if(m.seq<=peer.seq)return;
      Object.assign(peer,d,{seq:m.seq,seen:this.now(),address});this.changed();return;
    }
    if(!peer||peer.instance!==m.instance||m.seq<=peer.seq||!m.target)return;
    peer.seq=m.seq;peer.seen=this.now();
    if(m.type==='claim'&&this.role==='slave'&&peer.role==='master') {
      if(this.master&&(this.master.id!==peer.id||this.master.instance!==peer.instance)){this.transmit('ack',{status:'Ocupado por outro Master'},peer);return;}
      if(!this.master)this.master={id:peer.id,instance:peer.instance,lease:randomUUID(),seen:this.now()};
      this.transmit('ack',{lease:this.master.lease,status:this.feedback},peer);this.changed();
    } else if(m.type==='ack'&&this.role==='master'&&this.selected.has(peer.id)) {
      const selected=this.selected.get(peer.id);
      if(short(m.data.lease,80)&&m.data.lease)selected.lease=m.data.lease;
      selected.status=String(m.data.status||'Ligado').slice(0,180);selected.seen=this.now();this.changed();
    } else if(m.type==='state'&&this.role==='slave'&&this.master?.id===peer.id&&this.master.lease===m.data.lease&&validState(m.data.state)) {
      this.master.seen=this.now();this.emit('control',m.data.state);
      this.transmit('ack',{lease:this.master.lease,status:this.feedback},peer);
    } else if(m.type==='release'&&this.role==='slave'&&this.master?.id===peer.id&&this.master.lease===m.data.lease) {
      this.loseMaster('Libertado pelo Master');
    } else if(m.type==='bye') {
      this.peers.delete(peer.id);this.selected.delete(peer.id);if(this.master?.id===peer.id)this.loseMaster('Master desligado');this.changed();
    }
  }
  loseMaster(reason) { if(!this.master)return;this.master=null;this.feedback=reason;this.emit('lost',reason);this.changed(); }
  tick() {
    if(!this.active)return;
    const now=this.now();
    if(now-this.lastHello>=1000)this.announce();
    for(const peer of this.peers.values())if(now-peer.seen>PEER_MS){this.peers.delete(peer.id);this.selected.delete(peer.id);this.changed();}
    if(this.master&&now-this.master.seen>LEASE_MS)this.loseMaster('Sinal do Master perdido; reprodução em pausa');
    if(this.role!=='master')return;
    const fresh=this.state&&now-this.stateAt<1000;
    for(const [id,selected] of this.selected){
      const peer=this.peers.get(id);if(!peer)continue;
      if(selected.lease&&fresh){this.transmit('state',{lease:selected.lease,state:this.state},peer);if(now-(selected.seen||0)>LEASE_MS){selected.lease=null;selected.status='Sem resposta';this.changed();}}
      else if(selected.lease&&!fresh){this.transmit('release',{lease:selected.lease},peer);selected.lease=null;selected.status='Master sem estado de reprodução';this.changed();}
      else if(fresh&&now-this.lastClaim>=500)this.transmit('claim',{},peer);
    }
    if(now-this.lastClaim>=500)this.lastClaim=now;
  }
  snapshot() { return {role:this.role,name:this.name,master:this.master?this.peers.get(this.master.id)?.name||'Master':null,peers:[...this.peers.values()].map(p=>({id:p.id,name:p.name,version:p.version,role:p.role,busy:p.busy,address:p.address,selected:this.selected.has(p.id),connected:!!this.selected.get(p.id)?.lease,status:this.selected.get(p.id)?.status||''}))}; }
  changed() { this.emit('status',this.snapshot()); }
  stop() { if(!this.active)return;for(const peer of this.peers.values())this.transmit('bye',{},peer);this.loseMaster('Sessão desligada');this.active=false;this.selected.clear();this.peers.clear(); }
}

class SessionNetwork extends EventEmitter {
  constructor(){super();this.socket=null;this.peer=null;this.starting=false;}
  async start(config) {
    if(this.socket||this.starting)throw Error('Desliga a sessão antes de a reconfigurar.');
    const {group='225.0.0.37',port=21938,interfaceAddress=''}=config;
    if(!isIPv4(group)||+group.split('.')[0]<224||+group.split('.')[0]>239||!Number.isInteger(port)||port<1024||port>65535||(interfaceAddress&&!isIPv4(interfaceAddress)))throw Error('Grupo, interface ou porta de descoberta inválidos.');
    this.starting=true;
    try {
      this.peer=new SessionPeer({...config,send:buffer=>this.socket?.send(buffer,port,group,error=>{if(error)this.emit('failure',error.message);})});
      this.peer.on('status',data=>this.emit('status',data));this.peer.on('control',data=>this.emit('control',data));this.peer.on('lost',data=>this.emit('lost',data));
      const socket=this.socket=dgram.createSocket({type:'udp4',reuseAddr:true});
      socket.on('message',(packet,remote)=>this.peer?.receive(packet,remote.address));
      await new Promise((resolve,reject)=>{socket.once('error',reject);socket.bind(port,'0.0.0.0',()=>{socket.removeListener('error',reject);resolve();});});
      socket.on('error',error=>{this.emit('failure',error.message);this.stop();});
      socket.addMembership(group,interfaceAddress||undefined);if(interfaceAddress)socket.setMulticastInterface(interfaceAddress);
      socket.setMulticastTTL(1);socket.setMulticastLoopback(true);
      this.timer=setInterval(()=>this.peer?.tick(),100);this.peer.announce();return this.peer.snapshot();
    } catch(error){this.stop();throw error;} finally{this.starting=false;}
  }
  stop(){clearInterval(this.timer);this.peer?.stop();this.peer=null;const socket=this.socket;this.socket=null;if(socket){try{socket.close();}catch{}}}
  choose(id,selected){if(!this.peer)throw Error('Sessão desligada.');this.peer.choose(id,selected);}
  setState(state){this.peer?.setState(state);}
  feedback(message){this.peer?.setFeedback(message);}
}
module.exports={SessionPeer,SessionNetwork,validState};
