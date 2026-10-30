const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFile}=require('node:child_process');
async function findGhostscript() {
  for(const root of [process.env.ProgramFiles,process.env['ProgramFiles(x86)']].filter(Boolean)) {
    const folder=path.join(root,'gs');
    const versions=await fs.readdir(folder).catch(()=>[]);
    for(const version of versions.filter(v=>/^gs\d[\d.]*$/.test(v)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}))) {
      for(const binary of ['gswin64c.exe','gswin32c.exe']) {
        const file=path.join(folder,version,'bin',binary);if(await fs.stat(file).then(s=>s.isFile()).catch(()=>false))return file;
      }
    }
  }
  return null;
}
let converting=false;
async function convertEps(data) {
  if(converting)throw Error('Já está uma imagem EPS a ser convertida.');
  if(!(data instanceof Uint8Array)||data.byteLength>16*1024*1024||data.byteLength<4)throw Error('Ficheiro EPS inválido (máximo 16 MB).');
  const buffer=Buffer.from(data);
  if(buffer.toString('ascii',0,4)!=='%!PS'&&buffer.readUInt32LE(0)!==0xc6d3d0c5)throw Error('O ficheiro não contém uma imagem EPS.');
  converting=true;let folder;
  try {
    const executable=await findGhostscript();
    if(!executable)throw Error('Para importar EPS, instala Ghostscript para Windows ou converte o ficheiro para PNG/JPG.');
    folder=await fs.mkdtemp(path.join(os.tmpdir(),'stageset-eps-'));
    const input=path.join(folder,'input.eps'),output=path.join(folder,'output.png');await fs.writeFile(input,buffer);
    // Fixed raster bounds, no shell, restricted interpreter and a process deadline.
    await new Promise((resolve,reject)=>execFile(executable,['-dSAFER','-dBATCH','-dNOPAUSE','-dQUIET','-sDEVICE=pngalpha','-g1600x1200','-r144','-dEPSFitPage','-dFirstPage=1','-dLastPage=1',`-sOutputFile=${output}`,input],{windowsHide:true,timeout:15000,maxBuffer:256*1024},error=>error?reject(Error('Não foi possível converter o EPS; verifica o ficheiro e a instalação do Ghostscript.')):resolve()));
    if((await fs.stat(output)).size>20*1024*1024)throw Error('Imagem EPS convertida demasiado grande.');
    return new Uint8Array(await fs.readFile(output));
  } finally {
    if(folder&&path.dirname(folder)===path.resolve(os.tmpdir())&&path.basename(folder).startsWith('stageset-eps-'))await fs.rm(folder,{recursive:true,force:true});
    converting=false;
  }
}
module.exports={convertEps,findGhostscript};
