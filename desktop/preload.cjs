const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("stageSetDesktop", {
  startIpMidi: config => ipcRenderer.invoke('ipmidi:start',config),
  stopIpMidi: () => ipcRenderer.invoke('ipmidi:stop'),
  sendIpMidi: (id,data,delay) => ipcRenderer.invoke('ipmidi:send',id,data,delay),
  clearIpMidi: id => ipcRenderer.invoke('ipmidi:clear',id),
  onIpMidiMessage: callback => { const listener=(_,data)=>callback(data);ipcRenderer.on('ipmidi:message',listener);return ()=>ipcRenderer.removeListener('ipmidi:message',listener); },
  onIpMidiStatus: callback => { const listener=(_,data)=>callback(data);ipcRenderer.on('ipmidi:status',listener);return ()=>ipcRenderer.removeListener('ipmidi:status',listener); },
  selectStemDeck: () => ipcRenderer.invoke("stemdeck:select"),
  launchStemDeck: () => ipcRenderer.invoke("stemdeck:launch"),
  listDisplays: () => ipcRenderer.invoke("displays:list"),
  assignDisplay: (target, id) => ipcRenderer.invoke("displays:assign", target, id),
});
