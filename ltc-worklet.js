import { timecode, ltcBits, LtcDecoder, RATES } from './timecode.js';
class StageSetLtc extends AudioWorkletProcessor {
  constructor(options) {
    super(); this.rate=options.processorOptions.rate; this.mode=options.processorOptions.mode;
    this.decoder=new LtcDecoder(sampleRate,this.rate); this.active=false; this.anchor=0; this.anchorClock=0; this.speed=1; this.half=-1; this.sign=1; this.frame=-1;
    this.port.onmessage=({data})=>{this.active=data.active;this.anchor=data.time;this.anchorClock=currentTime;this.speed=data.speed||1;if(data.reset){this.half=-1;this.frame=-1;}};
  }
  process(inputs, outputs) {
    const out=outputs[0]?.[0]; if(out)out.fill(0);
    if(this.mode==='read') { for(const frame of this.decoder.push(inputs[0]?.[0]||[]))this.port.postMessage(frame); return true; }
    if(!out || !this.active)return true;
    for(let i=0;i<out.length;i++) {
      const seconds=this.anchor+(currentTime+i/sampleRate-this.anchorClock)*this.speed;
      const half=Math.floor(seconds*RATES[this.rate]*160), frame=Math.floor(half/160), cell=half%160;
      if(frame!==this.frame){this.bits=ltcBits(timecode(frame/RATES[this.rate],this.rate));this.frame=frame;}
      if(half!==this.half){if(cell%2===0||this.bits[Math.floor(cell/2)])this.sign=-this.sign;this.half=half;}
      out[i]=this.sign*.25;
    }
    return true;
  }
}
registerProcessor('stageset-ltc',StageSetLtc);
