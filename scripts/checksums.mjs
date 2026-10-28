import {readFile,readdir,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const {version}=JSON.parse(await readFile('package.json','utf8'));
const names=[`StageSet-${version}-Portable-x64.exe`,`StageSet-${version}-Setup-x64.exe`];
const available=await readdir('dist');for(const name of names)if(!available.includes(name))throw new Error(`Falta dist/${name}`);
const lines=await Promise.all(names.map(async name=>`${createHash('sha256').update(await readFile(`dist/${name}`)).digest('hex')}  ${name}`));
await writeFile('dist/SHA256SUMS.txt',lines.join('\n')+'\n');console.log(lines.join('\n'));
