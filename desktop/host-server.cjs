const http=require('node:http'),https=require('node:https'),{randomBytes,timingSafeEqual}=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path');
const allowed=new Set(['host.html','host.js','host.webmanifest','host-sw.js','host-icon-192.png','host-icon-512.png','icon.svg','lyrics-screen.js','lyrics-screen.css','screen-data.js','lyric-ink.js','lyrics-pdf.js','lyric-events.js','backgrounds.js']);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
class HostServer{
  constructor(){this.clients=new Map();this.frames=new Map();this.server=null;}
  async start({address,port=4180,pfx,passphrase},root){
    await this.stop();if(!require('node:net').isIPv4(address)||!Number.isInteger(port)||port<1024||port>65535)throw Error('Interface ou porta inválida.');
    this.code=randomBytes(6).toString('hex');this.root=root;this.url=(pfx?'https':'http')+'://'+address+':'+port;this.failures=new Map();
    const handler=(req,res)=>{void this.handle(req,res).catch(()=>{if(!res.headersSent)res.writeHead(400);res.end();});};
    this.server=pfx?https.createServer({pfx,passphrase},handler):http.createServer(handler);
    await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(port,address,resolve);});return {url:this.url,code:this.code,secure:!!pfx};
  }
  async handle(req,res){
    const url=new URL(req.url,'http://local');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
    if(url.pathname.startsWith('/api/')){
      if(req.method!=='POST')return reply(405,{});
      const origin=req.headers.origin;if(origin&&origin!==this.url)return reply(403,{error:'Origem não autorizada'});
      let body='';for await(const chunk of req){body+=chunk;if(body.length>2048)return reply(413,{});}let data;try{data=JSON.parse(body);}catch{return reply(400,{});}
      if(url.pathname==='/api/join'){
        const address=req.socket.remoteAddress,now=Date.now(),failed=this.failures.get(address)||{count:0,at:now};if(now-failed.at>60000){failed.count=0;failed.at=now;}if(failed.count>=10)return reply(429,{error:'Demasiadas tentativas. Aguarda um minuto.'});
        const input=Buffer.from(String(data.code||'')),expected=Buffer.from(this.code);if(input.length!==expected.length||!timingSafeEqual(input,expected)){failed.count++;this.failures.set(address,failed);return reply(403,{error:'Código incorreto'});}
        for(const [id,c] of this.clients)if(now-c.seen>10000)this.clients.delete(id);if(this.clients.size>=16)return reply(409,{error:'Máximo de 16 recetores'});
        const token=randomBytes(32).toString('hex');this.clients.set(token,{id:randomBytes(8).toString('hex'),name:String(data.name||'Recetor').slice(0,60),seen:now,address,output:null,key:null});return reply(200,{token});
      }
      const token=String(req.headers.authorization||'').replace(/^Bearer /,''),client=this.clients.get(token);if(!client)return reply(401,{error:'Liga novamente com o código da sessão.'});client.seen=Date.now();
      if(url.pathname==='/api/poll'){
        const frame=this.frames.get(client.output);if(!frame)return reply(200,{frame:null});
        const key=client.output+':'+frame.songId+':'+frame.mediaVersion,events=data.mediaKey===key?undefined:(frame.events||[]).filter(e=>frame.lines.some(line=>line.includes('[stage:'+e.id+']')));
        return reply(200,{mediaKey:key,frame:{...frame,events,canEdit:false,readOnly:true}});
      }return reply(404,{});
    }
    if(req.method!=='GET')return reply(405,{});const file=url.pathname==='/'?'host.html':url.pathname.slice(1);if(!allowed.has(file))return reply(404,{});
    const bytes=await fs.readFile(path.join(this.root,file));res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);
  }
  publish(output,frame){if(typeof output!=='string'||!frame||!Array.isArray(frame.lines)||frame.lines.length>100000)return;const old=this.frames.get(output);this.frames.set(output,{...old,...frame,events:frame.events||old?.events||[]});}
  list(){const now=Date.now();return [...this.clients.values()].filter(c=>now-c.seen<6000).map(({id,name,address,output})=>({id,name,address,output}));}
  assign(id,output){const client=[...this.clients.values()].find(c=>c.id===id);if(client){client.output=output;client.key=null;}}
  async stop(){const server=this.server;this.server=null;this.clients.clear();this.frames.clear();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
module.exports={HostServer};
