import {readFile,writeFile} from 'node:fs/promises';
const pkg=JSON.parse(await readFile('package.json','utf8')),lock=JSON.parse(await readFile('package-lock.json','utf8'));
const [major,minor]=pkg.version.split('.').map(Number),next=`${major}.${minor+1}.0`;
pkg.version=next;lock.version=next;lock.packages[''].version=next;
await writeFile('package.json',JSON.stringify(pkg,null,2)+'\n');await writeFile('package-lock.json',JSON.stringify(lock,null,2)+'\n');
await writeFile('index.html',(await readFile('index.html','utf8')).replace(/(class="app-version"[^>]*>)v[\d.]+/,`$1v${major}.${minor+1}`));
await writeFile('sw.js',(await readFile('sw.js','utf8')).replace(/stageset-shell-v\d+/,match=>`stageset-shell-v${Number(match.match(/\d+$/)[0])+1}`));
const notes=await readFile('STAGESET-ALTERACOES.md','utf8'),at=notes.indexOf('\n');await writeFile('STAGESET-ALTERACOES.md',notes.slice(0,at)+`\n\n## Versão ${next} — em desenvolvimento\n\nRegistar aqui as alterações, testes e limitações antes de distribuir.\n`+notes.slice(at));
console.log(`Versão ${next}; atualizar a nova secção de STAGESET-ALTERACOES.md.`);
