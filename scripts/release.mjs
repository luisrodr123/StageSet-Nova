// Publish already-built artifacts using the normal Git credential helper.
// Credentials stay in memory; never print or store them in the repository.
import {spawnSync} from 'node:child_process';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const {version}=JSON.parse(await readFile('package.json','utf8'));
const repos=['luisrodr123/StageSet-Nova','luisrodr123/StageSet-0.8'];
const helper=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
if(helper.status!==0)throw new Error('Autentica o Git no GitHub antes de publicar.');
const credentials=Object.fromEntries(helper.stdout.trim().split(/\r?\n/).map(line=>{const index=line.indexOf('=');return [line.slice(0,index),line.slice(index+1)];}));
if(!credentials.password)throw new Error('O gestor de credenciais Git não forneceu acesso.');
const headers={Authorization:`Bearer ${credentials.password}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
async function api(url,options={}){
  const target=new URL(url);if(!['api.github.com','uploads.github.com'].includes(target.hostname))throw new Error('Destino de API não autorizado.');
  const response=await fetch(target,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(180000)});
  if(response.status===404)return null;
  if(!response.ok){let message='';try{message=(await response.json()).message||'';}catch{}throw new Error(`GitHub ${response.status}: ${message}`);}
  return response.status===204?{}:response.json();
}
const user=await api('https://api.github.com/user');if(user?.login!=='luisrodr123')throw new Error('A conta Git autenticada não corresponde ao proprietário dos repositórios.');
const filenames=[`dist/StageSet-${version}-Portable-x64.exe`,`dist/StageSet-${version}-Setup-x64.exe`,'dist/SHA256SUMS.txt','STAGESET-ALTERACOES.md'];
for(const file of filenames)await stat(file);
const body=await readFile(`docs/RELEASE-${version.split('.').slice(0,2).join('.')}.md`,'utf8');
for(const repo of repos){
  const base=`https://api.github.com/repos/${repo}`;
  let release=await api(`${base}/releases/tags/v${version}`);
  if(!release)release=await api(`${base}/releases`,{method:'POST',body:JSON.stringify({tag_name:`v${version}`,name:`StageSet ${version} · Windows`,body,draft:true,prerelease:true})});
  if(!release)throw new Error(`Sem acesso ao repositório ${repo}`);
  for(const file of filenames){
    const name=path.basename(file),data=await readFile(file),digest='sha256:'+createHash('sha256').update(data).digest('hex');
    const existing=release.assets?.find(asset=>asset.name===name);
    if(existing){if(existing.digest!==digest)throw new Error(`Já existe um artefacto diferente: ${repo}/${name}`);continue;}
    const url=new URL(release.upload_url.replace(/\{.*$/,''));url.searchParams.set('name',name);
    await api(url.href,{method:'POST',headers:{'Content-Type':name.endsWith('.exe')?'application/octet-stream':'text/plain'},body:data});
    console.log(`Carregado ${repo}: ${name}`);
  }
  release=await api(`${base}/releases/${release.id}`,{method:'PATCH',body:JSON.stringify({body,draft:false,prerelease:true})});
  console.log(release.html_url);
}
