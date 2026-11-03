const fs=require('node:fs/promises'),path=require('node:path');
const {randomBytes,createHash,scrypt:derive,timingSafeEqual}=require('node:crypto');
const scrypt=require('node:util').promisify(derive);
const hash=value=>createHash('sha256').update(value).digest('hex');
class HostAccess{
  constructor(file){this.file=file;this.state={password:null,devices:[]};this.queue=Promise.resolve();}
  async load(){
    if(!this.ready)this.ready=(async()=>{try{const data=JSON.parse(await fs.readFile(this.file,'utf8'));if(!Array.isArray(data.devices))throw Error('Autorizações Host inválidas.');this.state=data;}catch(error){if(error.code!=='ENOENT')throw error;}})();
    return this.ready;
  }
  async info(){await this.load();return {hasPassword:!!this.state.password,devices:this.state.devices.length};}
  mutate(change){const task=this.queue.then(async()=>{await this.load();const next=structuredClone(this.state),result=await change(next);await fs.mkdir(path.dirname(this.file),{recursive:true});await fs.writeFile(this.file+'.tmp',JSON.stringify(next),{mode:0o600});await fs.rename(this.file+'.tmp',this.file);this.state=next;return result;});this.queue=task.catch(()=>{});return task;}
  async setPassword(value){
    if(typeof value!=='string'||value.length>128||(value&&value.length<4))throw Error('Usa uma palavra-passe com 4 a 128 caracteres.');
    return this.mutate(async state=>{const salt=randomBytes(16).toString('hex');state.password=value?{salt,hash:(await scrypt(value,salt,32)).toString('hex')}:null;state.devices=[];});
  }
  async check(value){await this.load();if(!this.state.password||typeof value!=='string'||value.length>128)return false;const actual=await scrypt(value,this.state.password.salt,32),expected=Buffer.from(this.state.password.hash,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}
  async remember(name){const token=randomBytes(32).toString('hex'),device={id:randomBytes(12).toString('hex'),hash:hash(token),name,output:null};await this.mutate(state=>{if(state.devices.length>=64)throw Error('Máximo de 64 dispositivos guardados. Revoga as autorizações antigas no StageSet.');state.devices.push(device);});return {token,device};}
  async resume(token){await this.load();if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;return this.state.devices.find(device=>device.hash===hash(token))||null;}
  async assign(id,output){return this.mutate(state=>{const device=state.devices.find(d=>d.id===id);if(device)device.output=output;});}
  async forget(id){return this.mutate(state=>{state.devices=id?state.devices.filter(d=>d.id!==id):[];});}
}
module.exports={HostAccess};
