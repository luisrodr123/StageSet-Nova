const http=require('node:http'),https=require('node:https'),{randomBytes,timingSafeEqual}=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path');
const allowed=new Set(['host.html','host.js','host-sync.js','host-setlist.js','host.webmanifest','host-sw.js','host-icon-192.png','host-icon-512.png','icon.svg','lyrics-screen.js','lyrics-screen.css','screen-data.js','lyric-ink.js','lyrics-pdf.js','lyric-events.js','backgrounds.js']);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
class HostServer{
  constructor(){this.clients=new Map();this.frames=new Map();this.server=null;this.sequence=0;this.onRequest=null;}
  async start({address,port=4180,pfx,passphrase},root){
    await this.stop();if(!require('node:net').isIPv4(address)||!Number.isInteger(port)||port<1024||port>65535)throw Error('Interface ou porta inválida.');
    await this.access?.load();
    this.code=randomBytes(6).toString('hex');this.root=root;this.url=(pfx?'https':'http')+'://'+address+':'+port;this.failures=new Map();
    const handler=(req,res)=>{void this.handle(req,res).catch(()=>{if(!res.headersSent)res.writeHead(400);res.end();});};
    this.server=pfx?https.createServer({pfx,passphrase},handler):http.createServer(handler);
    await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(port,address,resolve);});
    try{this.discovery=await require('./host-discovery.cjs').advertise({port,secure:!!pfx,version:require('../package.json').version});}catch{this.discovery=null;}
    return {url:this.url,code:this.code,secure:!!pfx,hasPassword:!!this.access?.state.password,discoveryAvailable:!!this.discovery};
  }
  async handle(req,res){
    const url=new URL(req.url,'http://local');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
    if(url.pathname==='/api/info'&&req.method==='GET')return reply(200,{version:require('../package.json').version});
    if(url.pathname.startsWith('/api/')){
      if(req.method!=='POST')return reply(405,{});
      const origin=req.headers.origin;if(origin&&origin!==this.url)return reply(403,{error:'Origem não autorizada'});
      const limit=url.pathname==='/api/screen'?8*1024*1024:2048;
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)return reply(413,{error:'Pedido demasiado grande.'});chunks.push(chunk);}let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data||typeof data!=='object')throw Error();}catch{return reply(400,{});}
      if(url.pathname==='/api/join'||url.pathname==='/api/resume'){
        const address=req.socket.remoteAddress,now=Date.now(),failed=this.failures.get(address)||{count:0,at:now};if(now-failed.at>60000){failed.count=0;failed.at=now;}if(failed.count>=10)return reply(429,{error:'Demasiadas tentativas. Aguarda um minuto.'});
        let device,rememberToken;
        const input=Buffer.from(String(data.code||'')),expected=Buffer.from(this.code);
        const resuming=url.pathname==='/api/resume';
        if(resuming)device=await this.access?.resume(data.deviceToken);
        const accepted=resuming?!!device:this.access?.state.password?await this.access.check(data.code):input.length===expected.length&&timingSafeEqual(input,expected);
        if(!accepted){failed.count++;this.failures.set(address,failed);return reply(403,{error:resuming?'Autorização revogada. Introduz a palavra-passe ou código atual.':'Palavra-passe ou código incorreto'});}
        for(const [id,c] of this.clients)if(now-c.seen>10000||device&&c.deviceId===device.id){c.wake?.();this.clients.delete(id);}if(this.clients.size>=16)return reply(409,{error:'Máximo de 16 recetores'});
        const name=String(data.name||device?.name||'Recetor').slice(0,60);
        if(!resuming&&data.remember&&this.access){const remembered=await this.access.remember(name);device=remembered.device;rememberToken=remembered.token;}
        if(device)for(const [key,c] of this.clients)if(c.deviceId===device.id){c.wake?.();this.clients.delete(key);}
        const token=randomBytes(32).toString('hex');this.clients.set(token,{id:randomBytes(8).toString('hex'),deviceId:device?.id,name,seen:now,address,output:device?.output||null,key:null});return reply(200,{token,rememberToken});
      }
      const token=String(req.headers.authorization||'').replace(/^Bearer /,''),client=this.clients.get(token);if(!client)return reply(401,{error:'Liga novamente com o código da sessão.'});client.seen=Date.now();
      if(url.pathname==='/api/ping')return reply(200,{ok:true});
      if(url.pathname==='/api/forget'){if(client.deviceId)await this.access?.forget(client.deviceId);client.wake?.();this.clients.delete(token);return reply(200,{ok:true});}
      if(url.pathname==='/api/screen'){
        const output=client.output,frame=this.frames.get(output),action=data.action,requestData=data.data;
        const valid=()=>this.clients.get(token)===client&&client.output===output&&requestData?.output===output&&!!output&&this.frames.get(output)?.songId===requestData?.songId&&!this.frames.get(output)?.readOnly;
        if(!this.onRequest||!valid()||!requestData?.songId)return reply(403,{error:'A música ou a saída mudou. Volta a abrir as letras.'});
        if(!['lyrics-read','lyrics-save','drawing-read','drawing-save'].includes(action))return reply(403,{error:'Função não disponível neste recetor.'});
        if(action.startsWith('lyrics-')&&!frame.canEdit)return reply(403,{error:'Entra no Studio no computador principal para editar letras.'});
        if(client.editing)return reply(409,{error:'Aguarda a gravação anterior.'});
        client.editing=true;
        try{return reply(200,{result:await this.onRequest({output,action,data:requestData},valid)});}catch(error){return reply(409,{error:error.message});}finally{client.editing=false;}
      }
      if(url.pathname==='/api/poll'){
        if(data.wait&&data.cursor===this.cursor(client))await new Promise(resolve=>{
          client.wake?.();let timer;const finish=()=>{clearTimeout(timer);res.off('close',finish);if(client.wake===finish)client.wake=null;resolve();};
          client.wake=finish;timer=setTimeout(finish,1500);res.once('close',finish);
        });
        if(res.destroyed)return;
        if(this.clients.get(token)!==client)return reply(401,{error:'Liga novamente com a palavra-passe ou código atual.'});
        client.seen=Date.now();
        const frame=this.frames.get(client.output);if(!frame)return reply(200,{cursor:this.cursor(client),frame:null});
        const referenced=(frame.events||[]).filter(e=>frame.lines.some(line=>line.includes('[stage:'+e.id+']')));
        const key=client.output+':'+frame.songId+':'+frame.mediaVersion+':'+referenced.map(e=>e.id).join(','),events=data.mediaKey===key?undefined:referenced;
        const readOnly=!this.onRequest||!!frame.readOnly,canEdit=!readOnly&&!!frame.canEdit;
        const staticKey=client.output+':'+frame.staticVersion,delta=data.staticKey===staticKey;
        const {signature,publishedAt,...publicFrame}=frame;publicFrame.output=client.output;
        const packet=delta?{songId:frame.songId,position:frame.position,playing:frame.playing,playbackRate:frame.playbackRate,currentIndex:frame.currentIndex,canEdit,readOnly}:{...publicFrame,events,canEdit,readOnly};
        return reply(200,{cursor:this.cursor(client),staticKey,delta,mediaKey:key,age:Math.max(0,Date.now()-publishedAt),frame:packet});
      }return reply(404,{});
    }
    if(req.method!=='GET')return reply(405,{});const file=url.pathname==='/'?'host.html':url.pathname.slice(1);if(!allowed.has(file))return reply(404,{});
    const bytes=await fs.readFile(path.join(this.root,file));res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);
  }
  cursor(client){return client.output+':'+(this.frames.get(client.output)?.version||0);}
  publish(output,frame){
    if(typeof output!=='string'||!frame||!Array.isArray(frame.lines)||frame.lines.length>100000)return;
    const old=this.frames.get(output),{position,playing,playbackRate,currentIndex,events,...content}=frame;
    const signature=JSON.stringify(content),staticVersion=old?.signature===signature?old.staticVersion:++this.sequence;
    this.frames.set(output,{...frame,events:events||old?.events||[],signature,staticVersion,publishedAt:Date.now(),version:++this.sequence});
    for(const client of this.clients.values())if(client.output===output)client.wake?.();
  }
  list(){const now=Date.now();return [...this.clients.values()].filter(c=>now-c.seen<6000).map(({id,name,address,output})=>({id,name,address,output}));}
  assign(id,output){const client=[...this.clients.values()].find(c=>c.id===id);if(client){const changed=client.output!==output;client.output=output;client.key=null;client.wake?.();if(changed&&client.deviceId)return this.access?.assign(client.deviceId,output);}}
  revoke(){for(const client of this.clients.values())client.wake?.();this.clients.clear();}
  async stop(){const server=this.server;this.server=null;if(this.discovery){try{this.discovery.close();}catch{}this.discovery=null;}for(const client of this.clients.values())client.wake?.();this.clients.clear();this.frames.clear();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
module.exports={HostServer};
