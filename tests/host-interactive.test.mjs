import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {HostServer} from '../desktop/host-server.cjs';
import localPort from './local-port.cjs';
import {receiverFrame,syncSettings} from '../host-sync.js';
import {HostAccess} from '../desktop/host-access.cjs';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';

test('receiver clock compensates RTT, offsets, tempo, seek and pause without changing master state',()=>{
  const frame={position:1,playing:true,playbackRate:1,lines:['a','b','c'],lineTimes:[0,1.3,2],currentIndex:0};
  assert.equal(receiverFrame(frame,{elapsed:100,age:100,rtt:200}).currentIndex,1);
  assert.equal(receiverFrame(frame,{elapsed:100,age:100,rtt:200,settings:{automatic:false}}).currentIndex,0);
  assert.equal(receiverFrame(frame,{settings:{offset:1000}}).currentIndex,2);
  assert.equal(receiverFrame(frame,{settings:{offset:-1000}}).position,0);
  assert.equal(receiverFrame({...frame,playing:false},{elapsed:2000,rtt:1000,settings:{offset:1000}}).position,1);
  assert.equal(receiverFrame({...frame,playbackRate:2},{elapsed:500}).position,2);
  assert.equal(receiverFrame({...frame,position:0},{elapsed:100}).currentIndex,0);
  assert.equal(frame.position,1);assert.equal(frame.currentIndex,0);
  assert.equal(syncSettings({offset:9999}).offset,1000);
});

test('Host password and device authorization survive server restart, remember output and revoke without storing passwords or bearer tokens',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stageset-host-auth-')),file=path.join(dir,'host-access.json');
  const server=new HostServer();server.access=new HostAccess(file);
  try{
    await server.access.setPassword('tablet-test-123');
    const info=await server.start({address:'127.0.0.1',port:await localPort()},fileURLToPath(new URL('..',import.meta.url)));
    const call=async(route,data,token='')=>{const response=await fetch(server.url+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(data)});return {status:response.status,body:await response.json()};};
    assert.equal((await call('join',{code:info.code})).status,403);
    const first=await call('join',{code:'tablet-test-123',name:'iPad',remember:true});assert.equal(first.status,200);assert.ok(first.body.rememberToken);
    await server.assign(server.list()[0].id,'voice');
    const disk=await fs.readFile(file,'utf8');assert.ok(!disk.includes('tablet-test-123'));assert.ok(!disk.includes(first.body.rememberToken));
    await server.stop();server.access=new HostAccess(file);await server.start({address:'127.0.0.1',port:await localPort()},fileURLToPath(new URL('..',import.meta.url)));
    const resumed=await call('resume',{deviceToken:first.body.rememberToken});assert.equal(resumed.status,200);assert.equal(server.list()[0].output,'voice');
    // A temporary, non-remembered session must not revoke other devices.
    const guest=await call('join',{code:'tablet-test-123'});assert.equal((await call('forget',{},guest.body.token)).status,200);assert.equal((await server.access.info()).devices,1);
    await server.access.setPassword('new-tablet-123');server.revoke();assert.equal((await call('resume',{deviceToken:first.body.rememberToken})).status,403);
    assert.equal((await call('join',{code:'tablet-test-123'})).status,403);
    assert.equal((await call('join',{code:'new-tablet-123'})).status,200);
  }finally{await server.stop();}
});

test('receiver edits are authenticated, assigned and revocable; updates wake immediately and use small deltas',async()=>{
  const server=new HostServer();
  try{
    const info=await server.start({address:'127.0.0.1',port:await localPort()},fileURLToPath(new URL('..',import.meta.url)));
    const call=(route,data={},token='')=>fetch(info.url+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(data)});
    const {token}=await(await call('join',{code:info.code})).json(),id=server.list()[0].id;
    let stored='Original',revision=0,guard;
    server.onRequest=async({output,action,data},valid)=>{
      assert.equal(output,'voice');guard=valid;
      if(action==='lyrics-save'){assert.equal(data.baseText,stored);stored=data.text;return {saved:true};}
      if(action==='drawing-save'){assert.equal(data.revision,revision);return {revision:++revision};}
      return {text:stored};
    };
    const frame={songId:'song',lines:['Original'],htmlLines:['Original'],fontSize:42,events:[],mediaVersion:1,canEdit:true,position:0};server.publish('voice',frame);
    const edit=(data,auth=token)=>call('screen',{action:'lyrics-save',data:{songId:'song',output:'voice',baseText:stored,text:'Editada',...data}},auth);
    assert.equal((await edit({},'')).status,401);assert.equal((await edit({})).status,403);
    server.assign(id,'voice');assert.equal((await edit({output:'other'})).status,403);assert.equal((await edit({songId:'other'})).status,403);
    assert.equal((await edit({})).status,200);assert.equal(stored,'Editada');assert.equal(guard(),true);
    server.assign(id,null);assert.equal(guard(),false);server.assign(id,'voice');
    const first=await(await call('poll',{},token)).json();assert.equal(first.frame.canEdit,true);assert.equal(first.frame.readOnly,false);assert.equal(first.frame.signature,undefined);
    const pending=call('poll',{wait:true,cursor:first.cursor,staticKey:first.staticKey,mediaKey:first.mediaKey},token);
    await new Promise(resolve=>setTimeout(resolve,40));const started=Date.now();server.publish('voice',{...frame,position:2});
    const next=await(await pending).json();assert.ok(Date.now()-started<1000,'Long poll waited for its timeout');assert.equal(next.delta,true);assert.equal(next.frame.lines,undefined);assert.equal(next.frame.position,2);
    server.publish('voice',{...frame,canEdit:false});assert.equal((await edit({})).status,403);
    assert.equal((await call('screen',{action:'event-save',data:{songId:'song',output:'voice'}},token)).status,403);
    assert.equal((await call('screen',{action:'drawing-save',data:{songId:'song',output:'voice',revision:0,strokes:[]}},token)).status,200);
    server.publish('voice',{...frame,songId:'next'});assert.equal(guard(),false);
  }finally{await server.stop();}
});
