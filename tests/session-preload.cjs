// Test-only bridge, loaded in a hidden window with the disposable smoke profile.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('stageSetDesktop',{
  onIpMidiMessage:()=>{},onIpMidiStatus:()=>{},
  sessionInfo:()=>Promise.resolve({name:'Test Slave'}),
  startSession:config=>ipcRenderer.invoke('test-session-start',config),
  stopSession:()=>Promise.resolve(),chooseSlave:()=>Promise.resolve(),
  publishSessionState:state=>ipcRenderer.invoke('test-session-state',state),
  sessionFeedback:message=>ipcRenderer.invoke('test-session-feedback',message),
  onSessionEvent:callback=>ipcRenderer.on('test-session-event',(_,type,data)=>callback(type,data)),
});
