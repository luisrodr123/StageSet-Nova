const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{HostServer}=require('../desktop/host-server.cjs');const server=new HostServer();
const until=async fn=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('Host app timeout');};
(async()=>{
 app.setPath('userData',await fs.mkdtemp(path.join(os.tmpdir(),'stageset-host-smoke-')));app.commandLine.appendSwitch('host-smoke');require(path.join(process.env.STAGESET_HOST_TEST_ROOT||path.resolve(__dirname,'..'),'desktop/host-main.cjs'));await app.whenReady();
 const info=await server.start({address:'127.0.0.1',port:48000+Math.floor(Math.random()*10000)},path.resolve(__dirname,'..'));let home;
 await until(()=>{home=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('host-home.html'));return home&&!home.webContents.isLoading();});
 await home.webContents.executeJavaScript(`document.getElementById('address').value=${JSON.stringify(info.url)};document.getElementById('connect').requestSubmit();`,true);let receiver;
 await until(()=>{receiver=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===info.url+'/host.html');return receiver&&!receiver.webContents.isLoading();});
 await receiver.webContents.executeJavaScript(`document.getElementById('name').value='Host portátil teste';document.getElementById('code').value=${JSON.stringify(info.code)};document.getElementById('join').requestSubmit();`,true);await until(()=>server.list().length===1);
 server.publish('1',{songId:'test',title:'Teste',name:'Vocalista',lines:['Host portátil ligado'],htmlLines:['Host portátil ligado'],currentIndex:0,baseColor:'#ffffff',color:'#65e2c1',fontSize:40,events:[],mediaVersion:1,drawing:{revision:0,strokes:[]}});server.assign(server.list()[0].id,'1');
 await until(()=>receiver.webContents.executeJavaScript(`document.querySelector('.current')?.textContent==='Host portátil ligado'`));
 if(!await receiver.webContents.executeJavaScript(`typeof require==='undefined'&&typeof stageSetReceiver==='undefined'`))throw Error('Native access leaked to remote content');
 console.log('Dedicated Host app: address, real HTTP join/assignment, received lyrics and renderer isolation OK');await server.stop();app.exit(0);
})().catch(async e=>{console.error(e);await server.stop();app.exit(1);});setTimeout(()=>{console.error('Host smoke timeout');app.exit(1);},20000).unref();
