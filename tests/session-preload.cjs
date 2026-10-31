// Test-only bridge, loaded in a hidden window with the disposable smoke profile.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('stageSetDesktop',{
  onIpMidiMessage:()=>{},onIpMidiStatus:()=>{},
  sessionInfo:()=>ipcRenderer.invoke('test-session-info'),
  startSession:config=>ipcRenderer.invoke('test-session-start',config),
  stopSession:()=>Promise.resolve(),chooseSlave:(id,selected)=>ipcRenderer.invoke('test-session-choose',id,selected),
  handoffMaster:id=>ipcRenderer.invoke('test-session-handoff',id),
  publishSessionState:state=>ipcRenderer.invoke('test-session-state',state),
  sessionFeedback:message=>ipcRenderer.invoke('test-session-feedback',message),
  onSessionEvent:callback=>ipcRenderer.on('test-session-event',(_,type,data)=>callback(type,data)),
});
