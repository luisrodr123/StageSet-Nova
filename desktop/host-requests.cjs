// Only the trusted main renderer may persist receiver edits in the show database.
const {randomUUID}=require('node:crypto');
module.exports=function bindHostRequests(ipcMain,server,getWindow,trusted,prefix='host'){
  const pending=new Map();
  server.onRequest=(request,valid)=>new Promise((resolve,reject)=>{
    const win=getWindow();if(!win||win.isDestroyed()||!valid())return reject(Error('StageSet indisponível.'));
    const id=randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(Error('Sem resposta. O rascunho continua no recetor; verifica a ligação antes de repetir.'));},8000);
    pending.set(id,{resolve,reject,timer,valid});win.webContents.send(prefix+':request',{...request,id});
  });
  ipcMain.handle(prefix+':validate',(event,id)=>!!trusted(event)&&!!pending.get(id)?.valid());
  ipcMain.handle(prefix+':response',(event,{id,result,error})=>{
    if(!trusted(event))throw Error('Janela não autorizada.');
    const task=pending.get(id);if(!task)return;pending.delete(id);clearTimeout(task.timer);
    if(error)task.reject(Error(error));else task.resolve(result);
  });
};
