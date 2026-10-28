import { RATES,timecode,formatTimecode,fullFrame,quarterFrame,MtcDecoder } from './timecode.js';

export function setupSync({getInputs,getOutputs,connectMidi,position,playing,seek,play,pause,speed,report}) {
  const $=id=>document.getElementById(id);
  let mode='off',timer=null,context=null,node=null,stream=null,source=null,input=null,decoder=new MtcDecoder();
  let next=0,part=0,frozen=null,wasPlaying=false,lastPosition=-1,lastClock=0,lastReceive=0,lastSeek=0,busy=false;
  const selectedRate=()=>Number($('sync-rate').value), offset=()=>Number($('sync-offset').value)||0;
  const status=text=>{$('sync-status').textContent=text;};
  const receive=async (frame)=>{
    if(!frame)return;lastReceive=performance.now();status(`${formatTimecode(frame)} · ${frame.running?'A receber':'Localização'}`);
    if(!$('sync-follow').checked)return;
    const target=Math.max(0,frame.time-offset()),now=performance.now();
    if((Math.abs(position()-target)>.12 && now-lastSeek>300)||!frame.running){lastSeek=now;seek(target);}
    if(frame.running&&frame.direction!==-1&&!playing()&&!busy){busy=true;try{await play();}finally{busy=false;}}
    if(!frame.running&&playing())pause();
  };
  const onMidi=event=>{if(mode==='mtc-read')void receive(decoder.push(event.data));};
  function refreshPorts(){
    for(const [id,ports] of [['sync-midi-in',getInputs()],['sync-midi-out',getOutputs()]]){
      const select=$(id),old=select.value;select.replaceChildren(new Option('Seleciona uma porta',''));
      ports.forEach(port=>select.add(new Option(port.name,port.id)));if(ports.some(port=>port.id===old))select.value=old;
    }
  }
  async function refreshAudio(){
    const devices=await navigator.mediaDevices.enumerateDevices();
    for(const [id,kind] of [['sync-audio-in','audioinput'],['sync-audio-out','audiooutput']]){
      const select=$(id),old=select.value;select.replaceChildren(new Option('Dispositivo padrão','default'));
      devices.filter(d=>d.kind===kind&&d.deviceId!=='default').forEach((d,i)=>select.add(new Option(d.label||`Dispositivo ${i+1}`,d.deviceId)));
      if([...select.options].some(o=>o.value===old))select.value=old;
    }
  }
  async function stop(){
    mode='off';clearInterval(timer);timer=null;
    if(input){if(input.removeEventListener)input.removeEventListener('midimessage',onMidi);input=null;}
    try{source?.disconnect();node?.disconnect();}catch{}
    stream?.getTracks().forEach(track=>track.stop());stream=null;source=null;node=null;
    if(context){await context.close().catch(()=>{});context=null;}
    $('sync-start').disabled=false;$('sync-stop').disabled=true;
    $('sync-options').disabled=false;status('Desligado');
  }
  async function start(){
    $('sync-start').disabled=true;
    try{
      mode=$('sync-mode').value;const rate=selectedRate();
      decoder=new MtcDecoder();part=0;next=performance.now();lastPosition=-1;lastClock=0;wasPlaying=false;lastReceive=0;
      if(mode.startsWith('mtc')){
        const selected=mode==='mtc-read'?$('sync-midi-in').value:$('sync-midi-out').value;
        const port=(mode==='mtc-read'?getInputs():getOutputs()).find(p=>p.id===selected);
        if(!port)throw new Error('Seleciona uma porta MIDI disponível.');await port.open();
        if(mode==='mtc-read'){input=port;if(input.addEventListener)input.addEventListener('midimessage',onMidi);}
      } else {
        context=new AudioContext();await context.audioWorklet.addModule('./ltc-worklet.js');
        const read=mode==='ltc-read';
        if(!read){const device=$('sync-audio-out').value;if(device!=='default'){if(!context.setSinkId)throw new Error('Este browser não permite escolher a saída LTC. Usa o desktop.');await context.setSinkId(device);}}
        node=new AudioWorkletNode(context,'stageset-ltc',{numberOfInputs:read?1:0,numberOfOutputs:1,outputChannelCount:[1],processorOptions:{rate,mode:read?'read':'write'}});
        node.connect(context.destination);
        if(read){
          const device=$('sync-audio-in').value;
          stream=await navigator.mediaDevices.getUserMedia({audio:{...(device!=='default'?{deviceId:{exact:device}}:{}),channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
          source=context.createMediaStreamSource(stream);source.connect(node);node.port.onmessage=event=>void receive(event.data);
        }
        await context.resume();
      }
      $('sync-stop').disabled=false;$('sync-options').disabled=true;status('Ligado · à espera de reprodução ou sinal');
      timer=setInterval(tick,5);
    }catch(error){await stop();status(error.message);report(error.message);}
  }
  function tick(){
    const now=performance.now();
    if(mode.endsWith('read')){
      if(lastReceive&&now-lastReceive>500){status('Sinal perdido');if($('sync-follow').checked&&playing())pause();lastReceive=0;}
      return;
    }
    const active=playing(),pos=Math.max(0,position()+offset()),rate=selectedRate();
    const discontinuity=lastPosition<0||Math.abs(pos-lastPosition-(active?(now-lastClock)/1000*speed():0))>.15||active!==wasPlaying;
    if(mode==='ltc-write'){
      if(discontinuity||now-lastClock>=100){node.port.postMessage({active,time:pos,speed:speed(),reset:discontinuity});lastPosition=pos;lastClock=now;}
    }else if(mode==='mtc-write'){
      const output=getOutputs().find(p=>p.id===$('sync-midi-out').value);
      if(!output){void stop();report('A saída de timecode foi desligada.');return;}
      try{
        if(discontinuity){output.send(fullFrame(timecode(pos,rate)));part=0;next=now;}
        // Resume at the actual playhead after a stalled timer; never burst stale timecode.
        if(now-next>50){part=0;next=now;}
        if(active && now>=next){
          if(part===0)frozen=timecode(pos,rate);
          output.send(quarterFrame(frozen,part));part=(part+1)%8;next+=1000/(4*RATES[rate]*speed());
        }
      }catch(error){void stop();report(`Timecode: ${error.message}. Ativa o acesso MIDI/SysEx.`);return;}
      lastPosition=pos;lastClock=now;
    }
    wasPlaying=active;
    if(Math.floor(now/100)!==Math.floor((now-5)/100))status(`${formatTimecode(timecode(pos,rate))} · ${active?'A emitir':'Parado'}`);
  }
  $('sync-refresh').onclick=async()=>{try{await connectMidi();refreshPorts();await refreshAudio();}catch(error){report(error.message);}};
  $('sync-start').onclick=()=>void start();$('sync-stop').onclick=()=>void stop();
  $('sync-mode').onchange=()=>{for(const el of document.querySelectorAll('[data-sync-mode]'))el.hidden=!el.dataset.syncMode.split(' ').includes($('sync-mode').value);};$('sync-mode').onchange();
  refreshPorts();void refreshAudio().catch(()=>{});
  return { refreshPorts, receiveMidi:(event,id)=>{if(input?.id===id&&!input.addEventListener)onMidi(event);}, stop };
}
