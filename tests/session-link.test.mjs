import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionPeer,SessionNetwork} from '../desktop/session-link.cjs';
const state={song:{id:'song',title:'Tema',fileName:'tema.wav'},playing:true,position:12.3,rate:1};
function rig() {
  const nodes=[],queue=[];let now=1000;
  const add=(id,role,code='concert-123')=>{const p=new SessionPeer({id,name:id,version:'0.11.0',role,code,now:()=>now,send:data=>queue.push([p,data])});nodes.push(p);return p;};
  const flush=()=>{let count=0;while(queue.length){if(++count>1000)throw Error('Packet storm');const [from,data]=queue.shift();nodes.filter(p=>p!==from).forEach(p=>p.receive(data,'127.0.0.1'));}};
  const step=ms=>{now+=ms;nodes.forEach(p=>p.tick());flush();};
  return {add,flush,step,advance:ms=>now+=ms};
}
test('discovery is session scoped; only selected Slave follows; release and competing Masters',()=>{
  const r=rig(),m=r.add('master','master'),s=r.add('slave','slave'),other=r.add('unselected','slave'),stranger=r.add('wrong-code','slave','wrong-secret'),rival=r.add('rival','master');
  r.step(0);assert.equal(m.peers.size,3);assert.equal(stranger.peers.size,0);
  const received=[],unselected=[];s.on('control',v=>received.push(v));other.on('control',v=>unselected.push(v));
  m.setState(state);m.choose(s.id,true);r.flush();r.step(100);
  assert.deepEqual(received.at(-1),state);assert.equal(unselected.length,0);assert.ok(m.snapshot().peers.find(p=>p.id===s.id).connected);
  rival.setState(state);rival.choose(s.id,true);r.flush();assert.equal(rival.selected.get(s.id).lease,null);assert.equal(s.master.id,m.id);
  let lost=0;s.on('lost',()=>lost++);m.choose(s.id,false);r.flush();assert.equal(s.master,null);assert.equal(lost,1);
});
test('rejects unsigned, duplicate and old-instance traffic; stale Master state releases Slave',()=>{
  const r=rig(),m=r.add('master','master'),s=r.add('slave','slave');r.step(0);m.setState(state);m.choose(s.id,true);r.flush();
  let count=0;s.on('control',()=>count++);
  const packet=m.packet('state',{lease:s.master.lease,state},{id:s.id,instance:s.instance});
  s.receive(packet);s.receive(packet);assert.equal(count,1);
  const modified=JSON.parse(packet.toString());modified.body=modified.body.replace('12.3','50.1');s.receive(Buffer.from(JSON.stringify(modified)));assert.equal(count,1);
  const previousInstance=s.instance;s.stop();const fresh=r.add('slave','slave');r.step(0);m.announce();r.flush();
  fresh.receive(m.packet('state',{lease:'old',state},{id:fresh.id,instance:previousInstance}));assert.equal(fresh.master,null);
  m.choose(fresh.id,true);r.flush();assert.ok(fresh.master);r.step(1100);assert.equal(fresh.master,null);
});
test('lost control packets pause lease despite ongoing discovery; bad states rejected',()=>{
  const r=rig(),m=r.add('master','master'),s=r.add('slave','slave');r.step(0);m.setState(state);m.choose(s.id,true);r.flush();
  let lost='';s.on('lost',reason=>lost=reason);r.advance(2600);m.announce();r.flush();s.tick();r.flush();assert.equal(s.master,null);assert.match(lost,/perdido/);
  for(const change of [{rate:0},{position:Infinity},{playing:1},{song:{title:'incomplete'}}])assert.throws(()=>m.setState({...state,...change}));
});
test('real multicast discovery, selected transport and disconnect on two local peers',async()=>{
  const m=new SessionNetwork(),s=new SessionNetwork(),port=50000+Math.floor(Math.random()*10000),errors=[];let control;
  for(const p of [m,s])p.on('failure',e=>errors.push(e));s.on('control',v=>control=v);
  const until=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,50));}assert.fail('Multicast peer timeout: '+errors.join('; '));};
  let heartbeat;
  try {
    const config={group:'239.255.42.37',port,interfaceAddress:'127.0.0.1',code:'test-secret',version:'test'};
    await m.start({...config,id:'master-udp',name:'Master',role:'master'});await s.start({...config,id:'slave-udp',name:'Slave',role:'slave'});
    await until(()=>m.peer.peers.has('slave-udp')&&s.peer.peers.has('master-udp'));
    m.setState(state);heartbeat=setInterval(()=>m.setState(state),200);m.choose('slave-udp',true);await until(()=>control);
    assert.deepEqual(control,state);m.choose('slave-udp',false);await until(()=>!s.peer.master);assert.deepEqual(errors,[]);
  } finally {clearInterval(heartbeat);m.stop();s.stop();}
});
