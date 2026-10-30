const MAX_DATA = 180000;
export function normalizeBackground(value = {}) {
  value = value && typeof value === 'object' ? value : {};
  const image = typeof value.image === 'string' && value.image.length <= MAX_DATA && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value.image) ? value.image : '';
  return {type:value.type === 'image' && image ? 'image' : 'solid', color:/^#[a-f\d]{6}$/i.test(value.color) ? value.color : '#10141b', image, name:typeof value.name === 'string' ? value.name.slice(0,120) : '', fit:['cover','contain','repeat'].includes(value.fit) ? value.fit : 'cover', dim:Math.max(0,Math.min(80,Number(value.dim)||0))};
}
export function applyBackground(element, value) {
  const b = normalizeBackground(value);
  element.classList.add('custom-lyric-background');
  element.style.backgroundColor = b.color;
  const shade = `linear-gradient(rgba(0,0,0,${b.dim/100}),rgba(0,0,0,${b.dim/100}))`;
  element.style.backgroundImage = b.type === 'image' ? `${shade},url("${b.image}")` : 'none';
  element.style.backgroundSize = b.fit === 'repeat' ? 'auto, auto' : `auto, ${b.fit}`;
  element.style.backgroundPosition = 'center';
  element.style.backgroundRepeat = b.fit === 'repeat' ? 'no-repeat, repeat' : 'no-repeat';
}
// Store a bounded raster copy, never a path or active SVG. Backups remain portable.
export async function readBackgroundFile(file, desktop = window.stageSetDesktop) {
  if (!file || file.size > 16*1024*1024) throw Error('Escolhe uma imagem até 16 MB.');
  let blob = file;
  if (/\.eps$/i.test(file.name)) {
    if (!desktop?.convertEps) throw Error('Importa EPS na aplicação desktop com Ghostscript instalado, ou escolhe PNG/JPG.');
    blob = new Blob([await desktop.convertEps(new Uint8Array(await file.arrayBuffer()))],{type:'image/png'});
  }
  const url = URL.createObjectURL(blob), img = new Image();
  try {
    img.src = url;
    try { await img.decode(); } catch { throw Error('Formato de imagem não reconhecido. Usa JPG, PNG, WebP, GIF, BMP, SVG ou EPS.'); }
    if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth*img.naturalHeight > 64000000) throw Error('Imagem demasiado grande; reduz a resolução para menos de 64 megapíxeis.');
    let scale = Math.min(1,1920/img.naturalWidth,1080/img.naturalHeight);
    const canvas = document.createElement('canvas');
    for (let pass=0; pass<10; pass++) {
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      const image=canvas.toDataURL('image/webp',.8);
      if(image.length<=MAX_DATA)return {image,name:file.name.slice(0,120)};
      scale*=.78;
    }
    throw Error('Não foi possível reduzir a imagem para guardar o fundo.');
  } finally { URL.revokeObjectURL(url); }
}

export function setupBackgroundEditor({outputs, get, set, report}) {
  const $=id=>document.getElementById('background-'+id);
  let busy=false;
  function show() {
    const b=normalizeBackground(get($('output').value));
    $('type').value=b.type;$('color').value=b.color;$('fit').value=b.fit;$('dim').value=b.dim;
    $('image-options').hidden=b.type!=='image'&&!b.image;
    $('file-name').textContent=b.name||'Nenhuma imagem escolhida';
    $('remove').disabled=!b.image||busy;
    $('preview').textContent=outputs().find(o=>o.id===$('output').value)?.name||'Palco principal';
    applyBackground($('preview'),b);
  }
  function refresh(target=$('output').value) {
    $('output').replaceChildren(...outputs().map(o=>new Option(o.name,o.id)));
    $('output').value=outputs().some(o=>o.id===target)?target:'main';show();
  }
  function save(patch,target=$('output').value) {
    try { set(target,normalizeBackground({...get(target),...patch}));if(target===$('output').value)show();$('status').textContent='Fundo guardado nesta saída.'; }
    catch(error){show();$('status').textContent='Não foi possível guardar o fundo.';report(error.message);}
  }
  $('output').onchange=()=>{show();$('status').textContent='';};
  $('type').onchange=()=>{
    if($('type').value==='image'&&!get($('output').value)?.image){$('image-options').hidden=false;$('status').textContent='Escolhe a imagem para aplicar o wallpaper.';return;}
    save({type:$('type').value});
  };
  $('color').oninput=()=>save({color:$('color').value});
  $('fit').onchange=()=>save({fit:$('fit').value});
  $('dim').oninput=()=>save({dim:Number($('dim').value)});
  $('remove').onclick=()=>save({image:'',name:'',type:'solid'});
  $('file').onchange=async()=>{
    const file=$('file').files[0],target=$('output').value;if(!file||busy)return;
    busy=true;$('file').disabled=true;$('remove').disabled=true;$('status').textContent='A preparar a imagem…';
    try { save({...await readBackgroundFile(file),type:'image'},target); }
    catch(error){$('status').textContent=error.message;report(error.message);}
    finally{busy=false;$('file').disabled=false;$('file').value='';show();}
  };
  refresh();return {refresh,select:target=>{refresh(target);$('output').scrollIntoView({block:'center'});$('output').focus();}};
}
