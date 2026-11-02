// Exercise the delivered EXE, including its self-extractor and real entry point.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {HostServer}=require('../desktop/host-server.cjs');
const freePort=require('./local-port.cjs');
const {version}=JSON.parse(await readFile('package.json','utf8'));
const executable=path.resolve(process.argv[2]||`dist/host/StageSet-Host-${version}-Portable-x64.exe`);
const profile=await mkdtemp(path.join(os.tmpdir(),'StageSet Host portable test '));
const port=await freePort(),server=new HostServer(),connections=[];
let child,exitCode,browser;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){
 const deadline=Date.now()+45000;
 while(Date.now()<deadline){
  if(exitCode!==undefined)throw Error(`Portable exited before ${label}: ${exitCode}`);
  const result=await fn();if(result)return result;await delay(150);
 }
 throw Error(`Timeout: ${label}`);
}
async function cdp(url){
 const ws=new WebSocket(url),pending=new Map();let sequence=0;
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=e=>{const data=JSON.parse(e.data),item=pending.get(data.id);if(!item)return;pending.delete(data.id);clearTimeout(item.timer);data.error?item.reject(Error(data.error.message)):item.resolve(data.result);};
 ws.onclose=()=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('CDP closed'));}pending.clear();};
 const connection={send(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},8000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});},close:()=>ws.close()};
 connections.push(connection);return connection;
}
async function evaluate(connection,expression){
 const result=await connection.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
 if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;
}
async function targets(){try{return await (await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1000)})).json();}catch{return [];}}
try{
 const info=await server.start({address:'127.0.0.1',port:await freePort()},process.cwd());
 child=spawn(executable,[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`],{windowsHide:true,stdio:'ignore'});
 child.once('error',error=>{exitCode=error.message;});child.once('exit',code=>{exitCode=code;});
 const target=await until(async()=> (await targets()).find(t=>t.url.endsWith('/desktop/host-home.html')),'Host home window');
 const home=await cdp(target.webSocketDebuggerUrl);
 await until(()=>evaluate(home,"!!document.getElementById('address')&&!!window.stageSetReceiver"),'address form and preload');
 const infoBrowser=await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();browser=await cdp(infoBrowser.webSocketDebuggerUrl);
 const {processInfo}=await browser.send('SystemInfo.getProcessInfo');
 const browserPid=processInfo.find(p=>p.type==='browser').id;
 await until(async()=>Number(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`(Get-Process -Id ${Number(browserPid)}).MainWindowHandle.ToInt64()`],{encoding:'utf8',windowsHide:true}).trim())!==0,'visible native window');
 await mkdir('dist/qa',{recursive:true});
 const capture=await home.send('Page.captureScreenshot');await writeFile('dist/qa/host-portable.png',Buffer.from(capture.data,'base64'));
 await evaluate(home,`document.getElementById('address').value=${JSON.stringify(info.url)};document.getElementById('connect').requestSubmit();`);
 const remote=await until(async()=> (await targets()).find(t=>t.url===info.url+'/host.html'),'receiver window');
 const receiver=await cdp(remote.webSocketDebuggerUrl);
 await until(()=>evaluate(receiver,"!!document.getElementById('join')?.onsubmit"),'receiver form');
 await evaluate(receiver,`document.getElementById('name').value='Portable EXE test';document.getElementById('code').value=${JSON.stringify(info.code)};document.getElementById('join').requestSubmit();`);
 await until(()=>server.list().length===1,'receiver registration');
 server.publish('voice',{songId:'probe',title:'Teste EXE',name:'Vocalista',lines:['Portátil ligado'],htmlLines:['Portátil ligado'],currentIndex:0,baseColor:'#ffffff',color:'#65e2c1',fontSize:40,events:[],mediaVersion:1,drawing:{revision:0,strokes:[]}});
 server.assign(server.list()[0].id,'voice');
 await until(()=>evaluate(receiver,"document.querySelector('.current')?.textContent==='Portátil ligado'"),'received lyrics');
 assert.equal(await evaluate(receiver,"typeof require==='undefined'&&typeof stageSetReceiver==='undefined'"),true);
 await browser.send('Browser.close').catch(()=>{});browser=null;
 const exitDeadline=Date.now()+15000;while(exitCode===undefined&&Date.now()<exitDeadline)await delay(100);
 assert.equal(exitCode,0,'portable should close successfully');
 console.log(`Host ${version}: actual portable EXE, visible window, connection, received lyrics, isolation and exit: OK`);
}finally{
 if(browser)await browser.send('Browser.close').catch(()=>{});
 for(const connection of connections)connection.close();
 if(child&&exitCode===undefined)execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
 await server.stop();
}
