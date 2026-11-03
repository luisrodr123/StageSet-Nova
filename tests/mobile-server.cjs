// Fixture for isolated Android/iPad simulator tests. Never enables a LAN server.
const {HostServer}=require('../desktop/host-server.cjs');
const server=new HostServer();
let text='StageSet mobile test';
const frame={songId:'test',title:'Mobile test',name:'Vocalista',lines:[text],htmlLines:[text],currentIndex:0,baseColor:'#ffffff',color:'#65e2c1',fontSize:40,events:[],mediaVersion:1,drawing:{revision:0,strokes:[]},annotationVersion:0,canEdit:true,setlist:[{id:'test',title:'Mobile test'},{id:'next',title:'Next song'}]};
server.onRequest=async({action,data},valid)=>{
 if(!valid())throw Error('Unassigned');
 if(action==='lyrics-read')return {songId:'test',title:'Mobile test',outputName:'Vocalista',text};
 if(action==='lyrics-save'){if(data.baseText!==text)throw Error('Conflict');text=data.text;frame.lines=text.split('\n');frame.htmlLines=frame.lines.map(line=>line.replace(/&/g,'&amp;').replace(/</g,'&lt;'));server.publish('voice',frame);return {saved:true};}
 if(action==='drawing-read')return frame.drawing;
 if(action==='drawing-save'){if(data.revision!==frame.drawing.revision)throw Error('Conflict');const {validateDrawing}=await import('../screen-data.js');frame.drawing={revision:frame.drawing.revision+1,strokes:validateDrawing(data.strokes)};frame.annotationVersion=frame.drawing.revision;server.publish('voice',frame);return {revision:frame.drawing.revision};}
 throw Error('Unknown action');
};
server.start({address:'127.0.0.1',port:4186},require('node:path').resolve(__dirname,'..')).then(()=>{
 server.code='stageset-test';
 server.publish('voice',frame);
 setInterval(()=>{for(const client of server.list())server.assign(client.id,'voice');},200);
 console.log('Mobile test fixture ready on loopback 4186');
}).catch(error=>{console.error(error);process.exit(1);});
process.on('SIGTERM',()=>server.stop().then(()=>process.exit(0)));
