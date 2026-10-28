const tiles=new Map(),checks=new Map();
const send=data=>opener?.postMessage(data,'*');
document.querySelector('#show-timestamps').onchange=event=>send({type:'stageset-mosaic-timestamps',value:event.target.checked});
addEventListener('message',event=>{
  if(event.source!==opener||event.data?.type!=='stageset-mosaic')return;
  const d=event.data;
  let tile=tiles.get(d.output);
  if(!tile){
    tile=document.createElement('section');tile.className='tile';tile.innerHTML='<h2></h2><div class="controls"><label>Letra <input type="number" min="16" max="96" step="1"></label><label>Saída <select></select></label></div><div class="lines"></div>';
    const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=true;
    const name=document.createElement('span');label.append(check,name);document.querySelector('#selectors').append(label);checks.set(d.output,{check,name});
    check.onchange=()=>{tile.hidden=!check.checked;};
    tile.querySelector('input').oninput=e=>{const value=Number(e.target.value);if(Number.isInteger(value)&&value>=16&&value<=96)send({type:'stageset-mosaic-setting',output:d.output,fontSize:value});};
    tile.querySelector('select').onchange=e=>send({type:'stageset-mosaic-setting',output:d.output,displayId:e.target.value});
    document.querySelector('#grid').append(tile);tiles.set(d.output,tile);
  }
  checks.get(d.output).name.textContent=' '+d.name+' ';tile.querySelector('h2').textContent=d.name;
  tile.style.borderColor=d.baseColor;
  const size=tile.querySelector('input');if(document.activeElement!==size)size.value=d.fontSize;
  const select=tile.querySelector('select');
  const displayKey=JSON.stringify(d.displays||[]);
  if(select.dataset.options!==displayKey){select.replaceChildren(new Option('Ecrã atual',''),...(d.displays||[]).map(item=>new Option(item.name,item.id)));select.dataset.options=displayKey;}
  select.disabled=!d.desktop;if(document.activeElement!==select)select.value=d.displayId||'';
  document.querySelector('#show-timestamps').checked=!!d.timestamps;
  tile.querySelector('.lines').replaceChildren(...d.lines.map((line,index)=>{const p=document.createElement('p');p.innerHTML=d.htmlLines?.[index]||'';if(!d.htmlLines)p.textContent=line||' ';p.style.color=d.baseColor;p.style.fontSize=d.fontSize+'px';if(index===d.currentIndex){p.className='current';p.style.background=d.color+'55';}return p;}));
});
send({type:'stageset-mosaic-ready'});
