// Test-only bridge, loaded in a hidden window with the disposable smoke profile.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('stageSetDesktop',{
  hostStart:config=>ipcRenderer.invoke('test-host-start',config),hostStop:()=>ipcRenderer.invoke('test-host-stop'),hostClients:()=>ipcRenderer.invoke('test-host-clients'),hostAssign:(id,output)=>ipcRenderer.invoke('test-host-assign',id,output),hostPublish:(id,frame)=>ipcRenderer.invoke('test-host-publish',id,frame),
  dmxStart:config=>ipcRenderer.invoke('test-dmx-start',config),dmxStop:()=>Promise.resolve(),dmxCue:event=>ipcRenderer.invoke('test-dmx-cue',event),dmxBlackout:()=>Promise.resolve(),
  onIpMidiMessage:()=>{},onIpMidiStatus:()=>{},
  sessionInfo:()=>ipcRenderer.invoke('test-session-info'),
  startSession:config=>ipcRenderer.invoke('test-session-start',config),
  stopSession:()=>Promise.resolve(),chooseSlave:(id,selected)=>ipcRenderer.invoke('test-session-choose',id,selected),
  handoffMaster:id=>ipcRenderer.invoke('test-session-handoff',id),
  publishSessionState:state=>ipcRenderer.invoke('test-session-state',state),
  sessionFeedback:message=>ipcRenderer.invoke('test-session-feedback',message),
  onSessionEvent:callback=>ipcRenderer.on('test-session-event',(_,type,data)=>callback(type,data)),
});
