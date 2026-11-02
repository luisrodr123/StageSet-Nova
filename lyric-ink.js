export function inkRows(viewport){
  const seen=new Map();
  return [...viewport.querySelectorAll(':scope > .line,:scope > .lyric-line,:scope > .lyric-spacer')].map((el,index)=>{
    const text=el.textContent.trim()+[...el.querySelectorAll('[data-event-id]')].map(e=>e.dataset.eventId).join(',');let hash=2166136261;for(const c of text)hash=Math.imul(hash^c.charCodeAt(0),16777619);
    const id=(hash>>>0).toString(36),n=seen.get(id)||0;seen.set(id,n+1);
    return {el,index,key:id+':'+n,rect:el.getBoundingClientRect()};
  });
}
export function anchorPoint(rows,x,y){
  if(!rows.length)return null;
  const row=rows.reduce((best,r)=>Math.abs(y-r.rect.top-r.rect.height/2)<Math.abs(y-best.rect.top-best.rect.height/2)?r:best);
  return {line:row.index,key:row.key,x:Math.max(0,Math.min(1,(x-row.rect.left)/row.rect.width)),y:Math.max(-5,Math.min(6,(y-row.rect.top)/Math.max(1,row.rect.height)))};
}
export function resolvePoint(anchor,rows){const r=rows.find(row=>row.key===anchor.key)||rows[anchor.line];return r?{x:r.rect.left+anchor.x*r.rect.width,y:r.rect.top+anchor.y*r.rect.height,height:r.rect.height}:null;}
export function paintInk(ctx,strokes,rows,rect,scale=1){
  for(const s of strokes){
    const points=s.anchors?s.anchors.map(p=>resolvePoint(p,rows)):s.points.map(([x,y])=>({x:rect.left+x*rect.width,y:rect.top+y*rect.height,height:rect.height}));
    if(!points.length||points.some(p=>!p))continue;
    ctx.globalCompositeOperation=s.tool==='eraser'?'destination-out':'source-over';ctx.strokeStyle=s.color;ctx.fillStyle=s.color;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.lineWidth=(s.anchors?(s.lineWidth||.08)*points[0].height:s.width*Math.min(rect.width,rect.height))*scale;
    ctx.beginPath();points.forEach((p,i)=>{const x=(p.x-rect.left)*scale,y=(p.y-rect.top)*scale;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});
    if(points.length===1){ctx.arc((points[0].x-rect.left)*scale,(points[0].y-rect.top)*scale,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();
  }ctx.globalCompositeOperation='source-over';
}
