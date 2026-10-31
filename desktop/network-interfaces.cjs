const os=require('node:os'),dgram=require('node:dgram');
function listInterfaces(source=os.networkInterfaces()) {
  const result=[];
  for(const [name,entries] of Object.entries(source))for(const entry of entries||[]){
    if(entry.internal||!['IPv4',4].includes(entry.family)||entry.address==='0.0.0.0')continue;
    if(result.some(item=>item.address===entry.address))continue;
    result.push({name,address:entry.address,linkLocal:entry.address.startsWith('169.254.'),virtual:/virtual|vethernet|vmware|vbox|vpn|tailscale|docker|wsl/i.test(name)});
  }
  return result.sort((a,b)=>Number(a.linkLocal)-Number(b.linkLocal)||Number(a.virtual)-Number(b.virtual)||a.name.localeCompare(b.name));
}
// connect() consults the local routing table; no datagram is sent.
async function routeAddress(group='225.0.0.37') {
  return new Promise(resolve=>{
    const socket=dgram.createSocket('udp4');let done=false;
    const finish=value=>{if(done)return;done=true;clearTimeout(timer);try{socket.close();}catch{}resolve(value);};
    const timer=setTimeout(()=>finish(''),750);socket.once('error',()=>finish(''));
    try{socket.connect(21938,group,()=>finish(socket.address().address));}catch{finish('');}
  });
}
async function networkInfo() {
  const interfaces=listInterfaces(),routed=await routeAddress();
  const recommended=interfaces.find(item=>item.address===routed&&!item.linkLocal)||interfaces[0];
  return {interfaces,recommendedAddress:recommended?.address||''};
}
module.exports={listInterfaces,routeAddress,networkInfo};
