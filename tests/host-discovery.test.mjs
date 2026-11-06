import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {advertise,discover}=require('../desktop/host-discovery.cjs');

test('host discovery returns a selectable address without transmitting session secrets',async()=>{
  const server=await advertise({port:4180,name:'Palco teste',version:'0.22.1',discoveryPort:0});
  try {
    const results=await discover({target:'127.0.0.1',discoveryPort:server.address().port,timeout:200});
    assert.deepEqual(results,[{url:'http://127.0.0.1:4180',name:'Palco teste',version:'0.22.1'}]);
  } finally {server.close();}
});
