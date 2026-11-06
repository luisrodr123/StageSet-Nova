const dgram=require('node:dgram');
const os=require('node:os');
const net=require('node:net');
const PORT=4188, QUERY='STAGESET_HOST_DISCOVER_1', TYPE='stageset-host-1';

function advertise({port,secure=false,name=os.hostname(),version='',discoveryPort=PORT}){
  const socket=dgram.createSocket({type:'udp4',reuseAddr:true});
  const payload=Buffer.from(JSON.stringify({type:TYPE,port,secure:!!secure,name:String(name).slice(0,60),version:String(version).slice(0,20)}));
  socket.on('message',(message,peer)=>{if(message.toString()===QUERY&&net.isIPv4(peer.address))socket.send(payload,peer.port,peer.address,()=>{});});
  return new Promise((resolve,reject)=>{socket.once('error',reject);socket.bind(discoveryPort,'0.0.0.0',()=>{socket.removeListener('error',reject);socket.on('error',()=>{});socket.unref();resolve(socket);});});
}

function discover({timeout=1800,target='255.255.255.255',discoveryPort=PORT}={}){
  return new Promise((resolve,reject)=>{const socket=dgram.createSocket('udp4'),found=new Map();let timer;
    const finish=error=>{clearTimeout(timer);try{socket.close();}catch{}error?reject(error):resolve([...found.values()]);};
    socket.on('error',finish);socket.on('message',(message,peer)=>{if(message.length>1024||!net.isIPv4(peer.address))return;try{const data=JSON.parse(message.toString());if(data.type!==TYPE||!Number.isInteger(data.port)||data.port<1024||data.port>65535)return;const url=`${data.secure===true?'https':'http'}://${peer.address}:${data.port}`;found.set(url,{url,name:String(data.name||peer.address).slice(0,60),version:String(data.version||'').slice(0,20)});}catch{}});
    socket.bind(0,()=>{try{socket.setBroadcast(true);socket.send(QUERY,discoveryPort,target,error=>{if(error)finish(error);});timer=setTimeout(()=>finish(),Math.max(100,Math.min(5000,timeout)));}catch(error){finish(error);}});
  });
}
module.exports={advertise,discover,PORT};
