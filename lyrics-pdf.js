import {inkRows,paintInk,anchorPoint} from './lyric-ink.js';
// PDF pages are rasterized locally so Unicode lyrics and ink look identical on every PDF reader.
export function jpegPdf(pages){
  const enc=new TextEncoder(),parts=[enc.encode('%PDF-1.4\n')],offsets=[0];let length=parts[0].length;
  const add=data=>{const bytes=typeof data==='string'?enc.encode(data):data;parts.push(bytes);length+=bytes.length;};
  const object=(id,data)=>{offsets[id]=length;add(id+' 0 obj\n');add(data);add('\nendobj\n');};
  object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,'<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
  pages.forEach((page,i)=>{
    const id=3+i*3,raw=Uint8Array.from(atob(page.split(',')[1]),c=>c.charCodeAt(0));
    object(id,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im '+(id+1)+' 0 R >> >> /Contents '+(id+2)+' 0 R >>');
    offsets[id+1]=length;add((id+1)+' 0 obj\n<< /Type /XObject /Subtype /Image /Width 1190 /Height 1684 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+raw.length+' >>\nstream\n');add(raw);add('\nendstream\nendobj\n');
    const content='q 595.28 0 0 841.89 0 0 cm /Im Do Q';object(id+2,'<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream');
  });
  const start=length;add('xref\n0 '+offsets.length+'\n0000000000 65535 f \n');for(let i=1;i<offsets.length;i++)add(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
  add('trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF');return new Blob(parts,{type:'application/pdf'});
}
export async function exportLyricsPdf(viewport,strokes,title){
  const canvas=document.createElement('canvas');canvas.width=1190;canvas.height=1684;const ctx=canvas.getContext('2d');ctx.font='32px sans-serif';
  const rows=inkRows(viewport),layout=[],pageHeight=1450;let y=0;
  for(const row of rows){
    const words=row.el.textContent.split(/\s+/),lines=[];let line='';
    for(const word of words){
      if(ctx.measureText(line+' '+word).width>1030&&line){lines.push(line);line='';}
      for(const char of (line?' ':'')+word){if(ctx.measureText(line+char).width>1030&&line){lines.push(line);line='';}line+=char;}
    }lines.push(line);
    const media=row.el.querySelector('img,video'),mediaHeight=media?Math.min(600,Number.parseInt(media.style.height)||270):0;
    const height=Math.max(44,lines.length*44)+16+mediaHeight;
    if(height<=pageHeight&&y%pageHeight+height>pageHeight)y=Math.ceil(y/pageHeight)*pageHeight;
    const top=y,linePositions=[];
    for(const line of lines){if(y%pageHeight+44>pageHeight)y=Math.ceil(y/pageHeight)*pageHeight;linePositions.push(y);y+=44;}
    if(mediaHeight&&y%pageHeight+mediaHeight>pageHeight)y=Math.ceil(y/pageHeight)*pageHeight;
    const mediaTop=y;y+=mediaHeight;
    layout.push({...row,lines,linePositions,media,mediaHeight,mediaTop,rect:{left:70,top,width:1050,height:y-top}});y+=16;
  }
  // Legacy viewport notes are projected onto the currently visible rows for this export only.
  const view=viewport.getBoundingClientRect(),notes=strokes.map(s=>s.anchors||!rows.length?s:{...s,lineWidth:s.width*Math.min(view.width,view.height)/Math.max(1,rows[0].rect.height),anchors:s.points.map(([x,y])=>anchorPoint(rows,view.left+x*view.width,view.top+y*view.height))});
  const pages=[],count=Math.max(1,Math.ceil(y/pageHeight));
  for(let p=0;p<count;p++){
    const offset=110-p*pageHeight;
    ctx.fillStyle='white';ctx.fillRect(0,0,1190,1684);ctx.fillStyle='#24313c';ctx.font='24px sans-serif';
    let heading=title;while(ctx.measureText(heading).width>1050)heading=heading.slice(0,-2)+'…';ctx.fillText(heading,70,55);ctx.font='32px sans-serif';
    ctx.save();ctx.beginPath();ctx.rect(0,110,1190,pageHeight);ctx.clip();
    for(const row of layout.filter(r=>r.rect.top<(p+1)*pageHeight&&r.rect.top+r.rect.height>p*pageHeight)){
      ctx.fillStyle='#111111';row.lines.forEach((line,i)=>ctx.fillText(line,70,row.linePositions[i]+offset+32));
      if(row.media){try{if(row.media.tagName==='IMG')await row.media.decode();const width=Math.min(1050,Number.parseInt(row.media.style.width)||480);ctx.drawImage(row.media,70,row.mediaTop+offset,width,row.mediaHeight);}catch{ctx.fillText('[Multimédia: '+(row.media.alt||'vídeo')+']',70,row.mediaTop+offset+32);}}
    }
    const ink=document.createElement('canvas');ink.width=1190;ink.height=1684;paintInk(ink.getContext('2d'),notes,layout,{left:0,top:-offset,width:1190,height:1684});ctx.drawImage(ink,0,0);ctx.restore();
    ctx.fillStyle='#555';ctx.font='20px sans-serif';ctx.fillText((p+1)+' / '+count,1080,1630);pages.push(canvas.toDataURL('image/jpeg',.92));
  }
  const blob=jpegPdf(pages),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,120)+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);return blob;
}
