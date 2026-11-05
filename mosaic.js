import {applyBackground} from './backgrounds.js';
import {createLyricsScreen,screenClient,renderScreenLines} from './lyrics-screen.js';
const tiles=new Map(),checks=new Map(),screens=new Map();
const grid=document.querySelector('#grid'),overviewButton=document.querySelector('#mosaic-overview'),zoom=document.querySelector('#mosaic-zoom');
let overview=false;
function updateLayout(){const count=[...tiles.values()].filter(tile=>!tile.hidden).length||1;grid.classList.toggle('overview',overview);overviewButton.setAttribute('aria-pressed',String(overview));overviewButton.textContent=overview?'Visão geral ativa':'Visão geral';zoom.disabled=overview;if(overview){const available=Math.max(120,innerHeight-document.querySelector('header').getBoundingClientRect().bottom-24),columns=Math.max(1,Math.ceil(Math.sqrt(count*innerWidth/available))),rows=Math.ceil(count/columns);grid.style.setProperty('--tile-cols',columns);grid.style.setProperty('--tile-height',Math.max(70,(available-(rows-1)*10)/rows)+'px');}else{grid.style.setProperty('--tile-width',zoom.value+'px');grid.style.setProperty('--tile-height',Math.max(220,Math.round(Number(zoom.value)*1.05))+'px');}}
overviewButton.onclick=()=>{overview=!overview;updateLayout();};zoom.oninput=updateLayout;addEventListener('resize',updateLayout);updateLayout();
addEventListener('keydown',event=>{if(event.key!=='Escape'||event.defaultPrevented||document.fullscreenElement)return;const painting=document.querySelector('.screen-host[data-paint="true"]');if(painting){event.preventDefault();painting.querySelector('[data-screen="close-paint"]')?.click();return;}const editor=document.querySelector('.screen-editor:not([hidden]) textarea');if(editor){event.preventDefault();editor.focus();editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return;}if(opener){event.preventDefault();window.close();}});
const send=data=>opener?.postMessage(data,location.origin);
document.querySelector('#show-timestamps').onchange=event=>send({type:'stageset-mosaic-timestamps',value:event.target.checked});
addEventListener('message',event=>{
  if(event.source!==opener||event.origin!==location.origin)return;
  if(event.data?.type==='stageset-mosaic-outputs'){
    for(const [id,tile] of tiles)if(!event.data.outputs.includes(id)){screens.get(id).destroy();screens.delete(id);tile.remove();checks.get(id).check.parentElement.remove();checks.delete(id);tiles.delete(id);}updateLayout();
    return;
  }
  if(event.data?.type!=='stageset-mosaic')return;
  const d=event.data;let tile=tiles.get(d.output);
  if(!tile){
    tile=document.createElement('section');tile.className='tile';tile.dataset.output=d.output;tile.innerHTML='<h2></h2><div class="controls"><label>Letra <input type="number" min="16" max="96" step="1"></label><label>Saída <select></select></label></div><div class="lines"><div class="tile-lyrics"></div></div>';
    const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=true;
    const name=document.createElement('span');label.append(check,name);document.querySelector('#selectors').append(label);checks.set(d.output,{check,name});
    check.onchange=()=>{tile.hidden=!check.checked;updateLayout();send({type:'stageset-mosaic-setting',output:d.output,visible:check.checked});};
    tile.querySelector('input').oninput=e=>{const value=Number(e.target.value);if(Number.isInteger(value)&&value>=16&&value<=96){tile.dataset.manualFont='true';send({type:'stageset-mosaic-setting',output:d.output,fontSize:value});}};
    tile.querySelector('select').onchange=e=>send({type:'stageset-mosaic-setting',output:d.output,displayId:e.target.value});
    document.querySelector('#grid').append(tile);tiles.set(d.output,tile);updateLayout();
    const resizeMosaicText=()=>{if(tile.dataset.manualFont==='true')return;const size=Math.max(16,Math.min(96,Math.round(Math.min(tile.clientWidth/12,tile.clientHeight/8))));tile.querySelector('.tile-lyrics').style.setProperty('--mosaic-auto-font',size+'px');tile.querySelectorAll('.line').forEach(line=>line.style.fontSize='var(--mosaic-auto-font)');};
    new ResizeObserver(resizeMosaicText).observe(tile);resizeMosaicText();
    screens.set(d.output,createLyricsScreen({host:tile.querySelector('.lines'),viewport:tile.querySelector('.tile-lyrics'),request:screenClient(d.output),extraControls:tile.querySelector('.controls')}));
  }
  checks.get(d.output).name.textContent=' '+d.name+' ';tile.querySelector('h2').textContent=d.name;
  if(d.background)applyBackground(tile.querySelector('.lines'),d.background);
  checks.get(d.output).check.checked=d.visible!==false;const wasHidden=tile.hidden;tile.hidden=d.visible===false;tile.style.borderColor=d.baseColor;if(wasHidden!==tile.hidden)updateLayout();
  const size=tile.querySelector('.controls input');if(document.activeElement!==size)size.value=d.fontSize;
  const select=tile.querySelector('.controls select'),displayKey=JSON.stringify(d.displays||[]);
  if(select.dataset.options!==displayKey){select.replaceChildren(new Option('Ecrã atual',''),...(d.displays||[]).map(item=>new Option(item.name,item.id)));select.dataset.options=displayKey;}
  select.disabled=!d.desktop;if(document.activeElement!==select)select.value=d.displayId||'';
  document.querySelector('#show-timestamps').checked=!!d.timestamps;
  renderScreenLines(tile.querySelector('.tile-lyrics'),d);if(tile.dataset.manualFont!=='true')tile.querySelectorAll('.line').forEach(line=>line.style.fontSize='var(--mosaic-auto-font)');screens.get(d.output).update(d);
});
send({type:'stageset-mosaic-ready'});
