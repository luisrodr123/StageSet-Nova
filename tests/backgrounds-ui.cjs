module.exports=async({win,mosaic,evaluate,children})=>{
  await evaluate(`
    window.backgroundField=(id,value,event='change')=>{const field=document.getElementById('background-'+id);field.value=value;field.dispatchEvent(new Event(event));};
    document.getElementById('settings-button').click();
    backgroundField('output','main');backgroundField('color','#273449','input');
    check(document.getElementById('lyrics-stage').style.backgroundColor==='rgb(39, 52, 73)','Main background did not update');
    backgroundField('output','2');backgroundField('type','image');
    check(!document.getElementById('background-image-options').hidden,'Wallpaper controls hidden');
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#182b4d';ctx.fillRect(0,0,64,64);ctx.fillStyle='#345b86';ctx.fillRect(0,0,32,32);ctx.fillRect(32,32,32,32);
    const file=new File([await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))],'quadriculado.png',{type:'image/png'});
    attach('background-file',file);
    await until(()=>JSON.parse(localStorage.getItem('stageset-display-outputs')).find(o=>o.id==='2')?.background?.type==='image','Wallpaper not persisted');
    backgroundField('fit','repeat');backgroundField('dim','25','input');
    backgroundField('output','3');backgroundField('color','#331144','input');
    check(JSON.parse(localStorage.getItem('stageset-main-background')).color==='#273449','Output changed main background');
    const {readBackgroundFile}=await import('./backgrounds.js');let rejected=false;try{await readBackgroundFile(new File(['invalid'],'broken.jpg',{type:'image/jpeg'}));}catch{rejected=true;}check(rejected,'Invalid image accepted');
    window.exports=[];window.anchorClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download)exports.push({name:this.download,url:this.href});else anchorClick.call(this);};
    document.getElementById('backup-export').click();await until(()=>exports.length,'Show backup not exported');
    const {readBackup}=await import('./backup.js');const backup=await readBackup(await (await fetch(exports[0].url)).blob());HTMLAnchorElement.prototype.click=anchorClick;
    check(JSON.parse(backup.interfaceSettings['stageset-main-background']).color==='#273449','Main wallpaper absent from exported show');
    check(JSON.parse(backup.interfaceSettings['stageset-display-outputs']).find(o=>o.id==='2').background.image.startsWith('data:image/webp;'),'Wallpaper image absent from backup');
    backgroundField('output','2');document.getElementById('background-settings').scrollIntoView({block:'start'});
    check(!testErrors.length,testErrors.join('; '));
  `);
  await new Promise(resolve=>setTimeout(resolve,250));
  const band=children.find(c=>!c.isDestroyed()&&c.webContents.getURL().includes('lyric-window.html?output=2'));
  const publicOutput=children.find(c=>!c.isDestroyed()&&c.webContents.getURL().includes('lyric-window.html?output=3'));
  const bg=await band.webContents.executeJavaScript(`({image:document.getElementById('stage').style.backgroundImage,repeat:document.getElementById('stage').style.backgroundRepeat})`);
  if(!bg.image.includes('data:image/webp')||!bg.repeat.includes('repeat'))throw Error('Wallpaper missing in live output');
  if(await publicOutput.webContents.executeJavaScript(`document.getElementById('stage').style.backgroundColor`)!=='rgb(51, 17, 68)')throw Error('Independent solid color missing');
  if(!await mosaic.webContents.executeJavaScript(`document.querySelector('.lines').style.backgroundImage.includes('data:image/webp')`))throw Error('Wallpaper absent from mosaic');
  const fs=require('node:fs/promises'),path=require('node:path');
  for(const [name,window] of [['background-settings',win],['wallpaper-output',band],['wallpaper-mosaic',mosaic]]){
    // DWM does not repaint minimized/hidden surfaces reliably. Render outside
    // the desktop without focus or taskbar entry, then hide the test window.
    window.setSkipTaskbar(true);window.setPosition(-30000,-30000);window.showInactive();
    try {await new Promise(resolve=>setTimeout(resolve,200));await fs.writeFile(path.resolve(__dirname,'../dist/qa/'+name+'.png'),(await window.webContents.capturePage()).toPNG());}
    finally{window.hide();}
  }
  await evaluate(`backgroundField('type','solid');`);await new Promise(r=>setTimeout(r,100));
  if(await band.webContents.executeJavaScript(`document.getElementById('stage').style.backgroundImage`)!=='none')throw Error('Solid mode retained image');
  await evaluate(`backgroundField('type','image');document.getElementById('close-settings').click();`);
  console.log('Independent backgrounds, live output/mosaic, wallpaper toggling and exported show: OK');
};
