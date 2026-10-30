const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("stageSetDesktop", {
  convertEps: data => ipcRenderer.invoke('background:eps',data),
  sessionInfo: () => ipcRenderer.invoke('session:info'),
  startSession: config => ipcRenderer.invoke('session:start',config),
  stopSession: () => ipcRenderer.invoke('session:stop'),
  chooseSlave: (id,selected) => ipcRenderer.invoke('session:choose',id,selected),
  publishSessionState: value => ipcRenderer.invoke('session:state',value),
  sessionFeedback: message => ipcRenderer.invoke('session:feedback',message),
  onSessionEvent: callback => {const listeners=['status','control','lost','failure'].map(name=>{const fn=(_,data)=>callback(name,data);ipcRenderer.on(`session:${name}`,fn);return [name,fn];});return ()=>listeners.forEach(([name,fn])=>ipcRenderer.removeListener(`session:${name}`,fn));},
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
