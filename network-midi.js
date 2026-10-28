export class NetworkMidi {
  constructor(onMessage,onChange) {
    this.inputs=new Map();this.outputs=new Map();this.onChange=onChange;
    window.stageSetDesktop?.onIpMidiMessage(message=>{
      const input=this.inputs.get(message.id);if(!input)return;
      const event={data:Uint8Array.from(message.data),receivedTime:performance.now()};
      onMessage(event,message.id);input.onmidimessage?.(event);
    });
    window.stageSetDesktop?.onIpMidiStatus(status=>{if(status.error){this.disconnect();onChange(status.error);}});
  }
  async start(config){
    const ports=await window.stageSetDesktop.startIpMidi(config);
    for(const info of ports){
      const input={...info,type:'input',state:'connected',open:async()=>{},onmidimessage:null};
      const output={...info,type:'output',state:'connected',open:async()=>{},clear:()=>window.stageSetDesktop.clearIpMidi(info.id),send:(data,when=0)=>{window.stageSetDesktop.sendIpMidi(info.id,Array.from(data),Math.max(0,when-performance.now())).catch(error=>this.onChange(error.message));}};
      this.inputs.set(info.id,input);this.outputs.set(info.id,output);
    }
    this.onChange();
  }
  disconnect(){for(const port of [...this.inputs.values(),...this.outputs.values()])port.state='disconnected';this.inputs.clear();this.outputs.clear();}
  async stop(){await window.stageSetDesktop.stopIpMidi();this.disconnect();this.onChange();}
}
