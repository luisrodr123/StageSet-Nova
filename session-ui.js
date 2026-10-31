// Selection/control channel for StageSet peers. Does not transmit media files.
export function setupSession({desktop=window.stageSetDesktop,storage=localStorage,readState,applyState,pause,stopTimecode,report}) {
  const $=id=>document.getElementById(id),rows=new Map(),roles={master:'Master',slave:'Slave',available:'Disponível'};
  let role=null,timer=null,generation=0,pending=null,applying=false,publishing=false,interfacesReady=false;
  let id=storage.getItem('stageset-machine-id');if(!id){id=crypto.randomUUID();storage.setItem('stageset-machine-id',id);}
  let saved={};try{saved=JSON.parse(storage.getItem('stageset-session-settings')||'{}')||{};}catch{}
  for(const key of ['name','role','group','port'])if(saved[key])$(`session-${key}`).value=saved[key];
  $('session-allow-remote').checked=saved.allowRemote!==false;
  const status=message=>{$('session-status').textContent=message;};
  function lamp(element,mode,connected,text){element.dataset.role=mode||'off';element.dataset.connected=String(!!connected);element.querySelector('.session-label').textContent=text;element.title=text;}
  function connection(mode,connected,text){lamp($('session-indicator'),mode,connected,text);lamp($('session-connection'),mode,connected,text);}
  $('session-indicator').onclick=()=>{$('settings-button').click();$('session-settings').scrollIntoView({block:'start'});};
  function reset(message){
    generation++;pending=null;clearInterval(timer);timer=null;if(role==='slave')pause();role=null;
    $('session-options').disabled=false;$('session-start').disabled=!desktop?.startSession||!interfacesReady;$('session-refresh').disabled=!desktop?.sessionInfo;
    $('session-stop').disabled=true;$('sync-start').disabled=false;rows.clear();$('session-peers').replaceChildren();$('session-empty').hidden=true;connection(null,false,'Rede desligada');status(message);
  }
  async function refreshInterfaces(){
    if(role)return;
    $('session-refresh').disabled=true;$('session-start').disabled=true;
    try{
      const info=await desktop.sessionInfo();if(!$('session-name').value)$('session-name').value=info.name;
      const list=Array.isArray(info.interfaces)?info.interfaces:[],preferred=$('session-interface').value||saved.interface;
      for(const key of ['session-interface','ip-midi-interface']){
        const select=$(key);if(select.disabled&&key==='ip-midi-interface')continue;
        const previous=key==='session-interface'?preferred:select.value;
        select.replaceChildren(...list.map(item=>new Option(`${item.name} · ${item.address}${item.address===info.recommendedAddress?' (automática)':''}`,item.address)));
        if(!list.length)select.add(new Option('Sem interface IPv4 disponível',''));
        select.value=list.some(item=>item.address===previous)?previous:info.recommendedAddress||list[0]?.address||'';
      }
      interfacesReady=!!$('session-interface').value;
      $('session-interface-status').textContent=interfacesReady?'IP detetado automaticamente. Usa a placa ligada à mesma rede dos outros PCs.':'Liga o cabo de rede ou o Wi-Fi e clica em Atualizar interfaces.';
    }catch(error){interfacesReady=false;$('session-interface-status').textContent=error.message;report(error.message);}
    finally{$('session-refresh').disabled=false;$('session-start').disabled=!interfacesReady;}
  }
  function render(snapshot){
    role=snapshot.role;$('session-role').value=role;
    const connected=snapshot.connected===true,count=snapshot.peers.filter(p=>p.selected&&p.connected).length;
    connection(role,connected,role==='master'?(connected?`Master ligado · ${count} Slave(s)`:'Master · sem Slaves ligados'):role==='slave'?(connected?'Slave ligado':'Slave · à espera do Master'):'Disponível para o Master');
    const ids=new Set(snapshot.peers.map(p=>p.id));for(const [key,row] of rows)if(!ids.has(key)){row.remove();rows.delete(key);}
    for(const peer of snapshot.peers){
      let row=rows.get(peer.id);
      if(!row){
        row=document.createElement('li');row.className='session-peer';row.dataset.learnScope='session-'+peer.id;
        row.innerHTML='<div class="session-peer-heading"><span class="session-peer-lamp"><i class="session-led" aria-hidden="true"></i><strong class="session-label"></strong></span></div><div class="session-peer-meta"></div><p class="session-peer-status"></p><div class="session-peer-actions"><button class="backup-button session-link" type="button">Ligar como Slave</button><button class="backup-button session-release" type="button">Desligar Slave</button><button class="backup-button session-handoff" type="button">Passar comando (Master)</button></div>';
        $('session-peers').append(row);rows.set(peer.id,row);
        row.querySelector('.session-link').onclick=()=>desktop.chooseSlave(peer.id,true).catch(error=>report(error.message));
        row.querySelector('.session-release').onclick=()=>desktop.chooseSlave(peer.id,false).catch(error=>report(error.message));
        row.querySelector('.session-handoff').onclick=()=>desktop.handoffMaster(peer.id).catch(error=>report(error.message));
      }
      lamp(row.querySelector('.session-peer-lamp'),peer.role,peer.connected,peer.name);
      row.querySelector('.session-peer-meta').textContent=`${roles[peer.role]||peer.role} · ${peer.address} · v${peer.version}`;
      const occupied=peer.busy&&peer.masterId!==id&&!peer.selected;
      row.querySelector('.session-peer-status').textContent=(peer.connected?'Ligado · ':'')+(peer.status||(occupied?'Ligado a outro Master':peer.connected?'Pronto':peer.role==='master'?'Master disponível':'Detetado · por ligar'));
      row.querySelector('.session-peer-actions').hidden=role!=='master';
      const link=row.querySelector('.session-link'),release=row.querySelector('.session-release'),handoff=row.querySelector('.session-handoff');
      link.hidden=peer.selected;release.hidden=!peer.selected;
      link.disabled=snapshot.transferring||occupied||(peer.role!=='slave'&&(!peer.allowRemote||peer.remoteRoles!==1||peer.links>0));release.disabled=!!snapshot.transferring;
      handoff.hidden=peer.role==='master';handoff.disabled=snapshot.transferring||occupied||peer.remoteRoles!==1||!peer.allowRemote||(snapshot.peers.filter(p=>p.selected).length>=16&&!peer.selected);
      handoff.title=peer.remoteRoles!==1?'Atualiza este PC para 0.12 ou posterior.':!peer.allowRemote?'Ativa a atribuição remota neste computador.':'Este PC passa a Master; os restantes, incluindo este computador, seguem-no como Slaves. A transferência pausa a reprodução.';
    }
    $('session-empty').hidden=snapshot.peers.length>0;
    if(snapshot.transferring)status(snapshot.notice||'A transferir o comando…');
    else if(role==='master')status((snapshot.notice?snapshot.notice+'. ':'')+(count?`${count} Slave(s) ligado(s). Os outros computadores detetados só seguem quando clicas em Ligar como Slave.`:snapshot.peers.some(p=>p.selected)?'A ligar aos computadores selecionados…':'Clica em Ligar como Slave no computador que queres controlar.'));
    else if(role==='slave')status(snapshot.master?(connected?`A seguir ${snapshot.master} · ${snapshot.feedback||'Ligado'}`:`A ligar a ${snapshot.master}…`):(snapshot.notice||'Sessão ativa. No Master, clica em Ligar como Slave neste computador.'));
    else status('Este computador está disponível. No Master podes ligá-lo como Slave ou passar-lhe o comando.');
    if(snapshot.interfaceAddress)$('session-interface-status').textContent='Interface em utilização: '+snapshot.interfaceAddress;
  }
  async function drain(){
    if(applying)return;applying=true;
    try{while(pending&&role==='slave'){
      const value=pending,epoch=generation;pending=null;
      try{await applyState(value,()=>epoch===generation&&role==='slave');if(epoch===generation)await desktop.sessionFeedback('Sincronizado');}
      catch(error){if(epoch===generation&&role==='slave'){pause();await desktop.sessionFeedback(error.message);status(error.message);}}
    }}finally{applying=false;}
  }
  function publish(){
    if(role!=='master'||publishing)return;publishing=true;
    Promise.resolve().then(()=>desktop.publishSessionState(readState())).catch(error=>{void desktop.stopSession();reset(error.message);}).finally(()=>publishing=false);
  }
  function updateRole(next){if(next===role)return;generation++;pending=null;pause();role=next;$('session-role').value=next;}
  if(!desktop?.startSession){reset('Abre o StageSet portátil ou instalado para ligar computadores pela rede.');return {isSlave:()=>false};}
  $('session-refresh').onclick=()=>void refreshInterfaces();void refreshInterfaces();
  desktop.onSessionEvent((type,data)=>{
    if(type==='role'&&role)updateRole(data);
    if(type==='status'&&role){if(data.role!==role)updateRole(data.role);render(data);}
    if(type==='control'&&role==='slave'){pending=data;void drain();}
    if(type==='lost'&&role==='slave'){generation++;pending=null;pause();connection(role,false,'Slave · ligação interrompida');status(data);}
    if(type==='failure'){void desktop.stopSession();reset(data);report(data);}
  });
  $('session-start').onclick=async()=>{
    const settings=Object.fromEntries(['name','role','group','port','interface'].map(key=>[key,$(`session-${key}`).value.trim()]));settings.allowRemote=$('session-allow-remote').checked;
    $('session-start').disabled=true;$('session-refresh').disabled=true;
    try{
      if(!settings.name)throw Error('Escreve o nome deste computador.');
      if($('session-code').value.length<6)throw Error('Usa o mesmo código de sessão nos PCs, com pelo menos 6 caracteres.');
      if(!settings.interface)throw Error('Atualiza e seleciona uma interface de rede.');
      await stopTimecode();role=settings.role;generation++;if(role==='slave')pause();
      const snapshot=await desktop.startSession({id,name:settings.name,role,allowRemote:settings.allowRemote,code:$('session-code').value,group:settings.group,port:Number(settings.port),interfaceAddress:settings.interface});
      storage.setItem('stageset-session-settings',JSON.stringify(settings));
      $('session-options').disabled=true;$('session-stop').disabled=false;$('sync-start').disabled=true;render(snapshot);timer=setInterval(publish,100);publish();
    }catch(error){await desktop.stopSession().catch(()=>{});reset(error.message);report(error.message);}
  };
  $('session-stop').onclick=async()=>{await desktop.stopSession();reset('Sessão desligada');};
  return {isSlave:()=>role==='slave',stop:async()=>{await desktop.stopSession();reset('Sessão desligada');}};
}
