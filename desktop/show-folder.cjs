const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto'),{pathToFileURL}=require('node:url');
const safeName=name=>String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/,'').slice(0,100)||'Show';
class ShowFolder{
 constructor(config){this.config=config;this.root=null;this.queue=Promise.resolve();}
 async info(){if(!this.root){try{this.root=JSON.parse(await fs.readFile(this.config,'utf8')).root;}catch{}}return this.root?{path:this.root,name:path.basename(this.root)}:null;}
 async activate(root){this.root=path.resolve(root);await fs.mkdir(path.dirname(this.config),{recursive:true});await fs.writeFile(this.config,JSON.stringify({root:this.root}));return this.info();}
 async create(parent,name,previous){await this.queue;const root=path.join(parent,safeName(name));if(previous?.byteLength)await fs.writeFile(path.join(parent,'StageSet-anterior-'+randomUUID()+'.stagebackup'),Buffer.from(previous),{flag:'wx'});await fs.mkdir(root);await fs.writeFile(path.join(root,'stageset-show.json'),JSON.stringify({format:'stageset-folder',version:1,name:safeName(name)}),{flag:'wx'});return this.activate(root);}
 async open(root){await this.queue;const manifest=JSON.parse(await fs.readFile(path.join(root,'stageset-show.json'),'utf8'));if(manifest.format!=='stageset-folder')throw Error('A pasta não é um show StageSet.');const backup=await fs.readFile(path.join(root,'Show.stagebackup'));await this.activate(root);return {info:await this.info(),backup};}
 async target(relative){
  if(!this.root||!relative||relative.includes('\\')||relative.split('/').some(p=>!p||p==='.'||p==='..')||relative.includes(':'))throw Error('Caminho do show inválido.');
  const root=path.resolve(this.root),target=path.resolve(root,relative);if(!target.startsWith(root+path.sep))throw Error('Ficheiro fora da pasta do show.');
  const rootStat=await fs.lstat(root);if(rootStat.isSymbolicLink())throw Error('Pasta do show não pode ser uma ligação.');
  let current=root;for(const part of relative.split('/')){current=path.join(current,part);try{if((await fs.lstat(current)).isSymbolicLink())throw Error('Ligações não são permitidas dentro do show.');}catch(e){if(e.code!=='ENOENT')throw e;}}
  await fs.mkdir(path.dirname(target),{recursive:true});return target;
 }
 async write(relative,bytes){const target=await this.target(relative),data=Buffer.from(bytes);try{const old=await fs.readFile(target);if(old.length===data.length&&createHash('sha256').update(old).digest('hex')===createHash('sha256').update(data).digest('hex'))return;}catch(e){if(e.code!=='ENOENT')throw e;}const temporary=target+'.'+randomUUID()+'.tmp';await fs.writeFile(temporary,data,{flag:'wx'});await fs.rename(temporary,target);}
 save(snapshot){const run=this.queue.then(async()=>{await this.info();for(const file of snapshot.files)await this.write(file.path,file.bytes);await this.write('Show.stagebackup',snapshot.backup);return this.info();});this.queue=run.catch(()=>{});return run;}
 async zip(destination){await this.queue;await this.info();if(!this.root)throw Error('Cria ou abre uma pasta de show.');const root=path.resolve(this.root),dest=path.resolve(destination);if(dest===root||dest.startsWith(root+path.sep))throw Error('Guarda o ZIP fora da pasta do show.');const entries=[];let size=0;
  const walk=async(dir,prefix='')=>{for(const entry of await fs.readdir(dir,{withFileTypes:true})){const name=prefix+entry.name,full=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('O show contém uma ligação; ZIP cancelado.');if(entry.isDirectory())await walk(full,name+'/');else if(entry.isFile()){size+=(await fs.stat(full)).size;if(size>0x7fffffff)throw Error('ZIP limitado a 2 GB; copia a pasta diretamente.');entries.push({name,blob:new Blob([await fs.readFile(full)])});}}};await walk(root);
  const {createZip}=await import(pathToFileURL(path.join(__dirname,'../zip-store.js')).href);const blob=await createZip(entries);const temporary=dest+'.'+randomUUID()+'.tmp';await fs.writeFile(temporary,Buffer.from(await blob.arrayBuffer()),{flag:'wx'});await fs.rename(temporary,dest);return dest;
 }
}
module.exports={ShowFolder,safeName};
