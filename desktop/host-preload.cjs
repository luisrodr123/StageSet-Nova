const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('stageSetReceiver',{connect:address=>ipcRenderer.invoke('receiver:connect',address)});
