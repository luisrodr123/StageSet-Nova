import {applyBackground} from './backgrounds.js';
import {createLyricsScreen,screenClient,renderScreenLines} from './lyrics-screen.js';
const tiles=new Map(),checks=new Map(),screens=new Map();
const send=data=>opener?.postMessage(data,location.origin);
document.querySelector('#show-timestamps').onchange=event=>send({type:'stageset-mosaic-timestamps',value:event.target.checked});
addEventListener('message',event=>{
  if(event.source!==opener||event.origin!==location.origin)return;
  if(event.data?.type==='stageset-mosaic-outputs'){
    for(const [id,tile] of tiles)if(!event.data.outputs.includes(id)){screens.get(id).destroy();screens.delete(id);tile.remove();checks.get(id).check.parentElement.remove();checks.delete(id);tiles.delete(id);}
    return;
  }
  if(event.data?.type!=='stageset-mosaic')return;
  const d=event.data;let tile=tiles.get(d.output);
  if(!tile){
    tile=document.createElement('section');tile.className='tile';tile.dataset.output=d.output;tile.innerHTML='<h2></h2><div class="controls"><label>Letra <input type="number" min="16" max="96" step="1"></label><label>Saída <select></select></label></div><div class="lines"><div class="tile-lyrics"></div></div>';
    const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=true;
    const name=document.createElement('span');label.append(check,name);document.querySelector('#selectors').append(label);checks.set(d.output,{check,name});
    check.onchange=()=>{tile.hidden=!check.checked;send({type:'stageset-mosaic-setting',output:d.output,visible:check.checked});};
    tile.querySelector('input').oninput=e=>{const value=Number(e.target.value);if(Number.isInteger(value)&&value>=16&&value<=96)send({type:'stageset-mosaic-setting',output:d.output,fontSize:value});};
    tile.querySelector('select').onchange=e=>send({type:'stageset-mosaic-setting',output:d.output,displayId:e.target.value});
    document.querySelector('#grid').append(tile);tiles.set(d.output,tile);
    screens.set(d.output,createLyricsScreen({host:tile.querySelector('.lines'),viewport:tile.querySelector('.tile-lyrics'),request:screenClient(d.output),extraControls:tile.querySelector('.controls')}));
  }
  checks.get(d.output).name.textContent=' '+d.name+' ';tile.querySelector('h2').textContent=d.name;
  if(d.background)applyBackground(tile.querySelector('.lines'),d.background);
  checks.get(d.output).check.checked=d.visible!==false;tile.hidden=d.visible===false;tile.style.borderColor=d.baseColor;
  const size=tile.querySelector('.controls input');if(document.activeElement!==size)size.value=d.fontSize;
  const select=tile.querySelector('.controls select'),displayKey=JSON.stringify(d.displays||[]);
  if(select.dataset.options!==displayKey){select.replaceChildren(new Option('Ecrã atual',''),...(d.displays||[]).map(item=>new Option(item.name,item.id)));select.dataset.options=displayKey;}
  select.disabled=!d.desktop;if(document.activeElement!==select)select.value=d.displayId||'';
  document.querySelector('#show-timestamps').checked=!!d.timestamps;
  renderScreenLines(tile.querySelector('.tile-lyrics'),d);screens.get(d.output).update(d);
});
send({type:'stageset-mosaic-ready'});
