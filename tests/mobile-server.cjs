// Fixture for isolated Android/iPad simulator tests. Never enables a LAN server.
const {HostServer}=require('../desktop/host-server.cjs');
const server=new HostServer();
server.start({address:'127.0.0.1',port:4186},require('node:path').resolve(__dirname,'..')).then(()=>{
 server.code='stageset-test';
 server.publish('voice',{songId:'test',title:'Mobile test',name:'Vocalista',lines:['StageSet mobile test'],htmlLines:['StageSet mobile test'],currentIndex:0,baseColor:'#ffffff',color:'#65e2c1',fontSize:40,events:[],mediaVersion:1,drawing:{revision:0,strokes:[]}});
 setInterval(()=>{for(const client of server.list())server.assign(client.id,'voice');},200);
 console.log('Mobile test fixture ready on loopback 4186');
}).catch(error=>{console.error(error);process.exit(1);});
process.on('SIGTERM',()=>server.stop().then(()=>process.exit(0)));
