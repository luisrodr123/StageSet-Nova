import test from 'node:test';import assert from 'node:assert/strict';
import {listInterfaces,networkInfo} from '../desktop/network-interfaces.cjs';
test('IPv4 interface list excludes loopback/IPv6, deduplicates addresses and ranks physical networks',()=>{
  const address=(address,extra={})=>({address,internal:false,family:'IPv4',...extra});
  const result=listInterfaces({Loopback:[address('127.0.0.1',{internal:true})],WiFi:[address('fe80::1234',{family:'IPv6'}),address('192.168.1.20')],Ethernet:[address('192.168.1.20'),address('169.254.1.5')],VPN:[address('10.10.0.1')]});
  assert.deepEqual(result.map(r=>r.address),['192.168.1.20','10.10.0.1','169.254.1.5']);assert.equal(result[0].name,'WiFi');assert.deepEqual(listInterfaces({}),[]);
});
test('automatic recommendation is an actual local IPv4 address, never a fabricated remote IP',async()=>{
  const info=await networkInfo();assert.ok(info.interfaces.length?info.interfaces.some(i=>i.address===info.recommendedAddress):info.recommendedAddress==='');
});
