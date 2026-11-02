const {app,BrowserWindow,ipcMain,session,Menu}=require('electron'),path=require('node:path');
const {pathToFileURL}=require('node:url');let home,receiver,origin='';
const homeUrl=pathToFileURL(path.join(__dirname,'host-home.html')).href,testing=app.commandLine.hasSwitch('host-smoke');
function receiverUrl(value){const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Usa o endereço HTTP ou HTTPS apresentado no StageSet.');url.pathname='/host.html';url.search='';url.hash='';return url;}
app.whenReady().then(()=>{
 session.defaultSession.setPermissionRequestHandler((contents,permission,done)=>done(permission==='fullscreen'&&contents.getURL().startsWith(origin+'/')));
 session.defaultSession.setPermissionCheckHandler((_,permission,requestOrigin)=>permission==='fullscreen'&&requestOrigin===origin);
 home=new BrowserWindow({show:!testing,width:540,height:420,minWidth:380,minHeight:340,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'host-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});home.loadURL(homeUrl);home.on('closed',()=>{home=null;});
 ipcMain.handle('receiver:connect',async(event,address)=>{
  if(event.sender!==home?.webContents||event.sender.getURL()!==homeUrl)throw Error('Janela não autorizada.');
  const url=receiverUrl(address);origin=url.origin;
  receiver=new BrowserWindow({show:!testing,width:1100,height:740,minWidth:380,minHeight:320,autoHideMenuBar:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  receiver.webContents.setWindowOpenHandler(()=>({action:'deny'}));receiver.webContents.on('will-navigate',(e,next)=>{if(new URL(next).origin!==origin)e.preventDefault();});
  receiver.on('closed',()=>{receiver=null;if(!testing)home?.show();});
  try{await receiver.loadURL(url.href);home.hide();return true;}catch(error){receiver.destroy();receiver=null;throw Error('Não foi possível ligar. Confirma o endereço, a rede e, em HTTPS, a confiança do certificado.');}
 });
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Ligação',submenu:[{label:'Outro servidor',click:()=>{receiver?.close();home?.show();}},{role:'quit'}]},{label:'Ecrã',submenu:[{role:'togglefullscreen'},{role:'reload'}]}]));
});
app.on('window-all-closed',()=>app.quit());
module.exports={receiverUrl};
