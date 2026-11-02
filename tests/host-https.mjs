import localPort from './local-port.cjs';
// Optional TLS integration check. Certificate/password are supplied by the temporary PowerShell fixture.
import {readFile} from 'node:fs/promises';import https from 'node:https';import {X509Certificate} from 'node:crypto';import assert from 'node:assert/strict';import {HostServer} from '../desktop/host-server.cjs';
const dir=process.env.STAGESET_TEST_CERT_DIR;if(!dir)throw Error('Indica a pasta temporária de certificados.');
const host=new HostServer();
try{
 const pfx=await readFile(dir+'/StageSet-Host.pfx'),ca=new X509Certificate(await readFile(dir+'/StageSet-Host-CA.cer')).toString();
 const info=await host.start({address:'127.0.0.1',port:await localPort(),pfx,passphrase:process.env.STAGESET_TEST_PFX_PASSWORD},process.cwd());
 const body=await new Promise((resolve,reject)=>{https.get(info.url+'/host.html',{ca},response=>{assert.equal(response.statusCode,200);assert.equal(response.socket.authorized,true);let result='';response.on('data',d=>result+=d);response.on('end',()=>resolve(result));}).on('error',reject);});
 assert.match(body,/StageSet Host/);console.log('Host HTTPS: PFX, chain trust, IP SAN and encrypted page response OK');
}finally{await host.stop();}
