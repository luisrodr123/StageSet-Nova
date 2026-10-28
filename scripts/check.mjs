import {readdir,readFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
for(const folder of ['.','desktop','scripts','tests'])for(const item of await readdir(folder)){if(!/\.(?:js|cjs|mjs)$/.test(item))continue;const file=`${folder}/${item}`,r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0)throw new Error(`${file}: ${r.stderr}`);}
const pkg=JSON.parse(await readFile('package.json','utf8')),lock=JSON.parse(await readFile('package-lock.json','utf8')),html=await readFile('index.html','utf8');
assert.equal(pkg.version,lock.version);assert.equal(pkg.version,lock.packages[''].version);assert.ok(html.includes(`>v${pkg.version.split('.').slice(0,2).join('.')}<`));
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,'Duplicate HTML IDs');
console.log(`Syntax, HTML IDs and version ${pkg.version}: OK`);
