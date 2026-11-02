const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(bytes){let c=0xffffffff;for(const n of bytes)c=table[(c^n)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
// Standard uncompressed ZIP: audio/video are already compressed. No ZIP64.
export async function createZip(entries){
 if(entries.length>65535)throw Error('Demasiados ficheiros para ZIP.');
 const parts=[],central=[];let offset=0,centralSize=0;
 for(const {name,blob} of entries){
  if(!name||name.startsWith('/')||name.split('/').some(p=>p==='..')||name.includes('\\'))throw Error('Caminho ZIP inválido.');
  const path=new TextEncoder().encode(name),data=new Uint8Array(await blob.arrayBuffer());if(path.length>65535||offset+data.length>0x7fffffff)throw Error('ZIP limitado a 2 GB; copia a pasta diretamente.');
  const crc=crc32(data),header=new Uint8Array(30+path.length),v=new DataView(header.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,path.length,true);header.set(path,30);
  const c=new Uint8Array(46+path.length),cv=new DataView(c.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);c.set(header.subarray(4,30),6);cv.setUint32(42,offset,true);c.set(path,46);central.push(c);centralSize+=c.length;parts.push(header,data);offset+=header.length+data.length;
 }
 const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
 return new Blob([...parts,...central,end],{type:'application/zip'});
}
