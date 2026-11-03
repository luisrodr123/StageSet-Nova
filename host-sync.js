export function syncSettings(value={}){
  return {automatic:value.automatic!==false,offset:Math.max(-1000,Math.min(1000,Number(value.offset)||0))};
}
// Extrapolate the master's media clock locally. Offset is in real milliseconds;
// positive values show lyrics earlier, without issuing a transport command.
export function receiverFrame(frame,{elapsed=0,age=0,rtt=0,settings={}}={}){
  const config=syncSettings(settings),rate=Number(frame.playbackRate)||1;
  const advance=frame.playing?(Math.min(2000,Math.max(0,elapsed))+Math.max(0,age)+(config.automatic?Math.max(0,rtt)/2:0)+config.offset)*rate/1000:0;
  const position=Math.max(0,(Number(frame.position)||0)+advance);
  const times=frame.lineTimes;
  const currentIndex=Array.isArray(times)&&times.length===frame.lines.length?times.reduce((index,time,i)=>Number.isFinite(time)&&time<=position?i:index,-1):frame.currentIndex;
  return {...frame,position,currentIndex};
}
