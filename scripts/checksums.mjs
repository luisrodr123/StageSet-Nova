import {readFile,readdir,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const {version}=JSON.parse(await readFile('package.json','utf8'));
const names=[`StageSet-${version}-Portable-x64.exe`,`StageSet-${version}-Setup-x64.exe`,`host/StageSet-Host-${version}-Portable-x64.exe`];
if(process.argv.includes('--mobile'))names.push(`mobile/StageSet-Host-${version}-Android-Test.apk`,`mobile/StageSet-Host-${version}-iOS-Project.zip`);
const lines=await Promise.all(names.map(async name=>`${createHash('sha256').update(await readFile(`dist/${name}`)).digest('hex')}  ${name.split('/').at(-1)}`));
await writeFile('dist/SHA256SUMS.txt',lines.join('\n')+'\n');console.log(lines.join('\n'));
