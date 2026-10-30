// Selection/control channel for StageSet peers. Does not transmit media files.
export function setupSession({desktop=window.stageSetDesktop,storage=localStorage,readState,applyState,pause,stopTimecode,report}) {
  const $=id=>document.getElementById(id), rows=new Map();
  let role=null,timer=null,generation=0,pending=null,applying=false;
  let id=storage.getItem('stageset-machine-id');if(!id){id=crypto.randomUUID();storage.setItem('stageset-machine-id',id);}
  let saved={};try{saved=JSON.parse(storage.getItem('stageset-session-settings')||'{}');}catch{}
  for(const key of ['name','role','group','port','interface'])if(saved[key])$(`session-${key}`).value=saved[key];
  const status=message=>{$('session-status').textContent=message;};
  function reset(message){generation++;pending=null;clearInterval(timer);timer=null;if(role==='slave')pause();role=null;$('session-options').disabled=false;$('session-start').disabled=!desktop?.startSession;$('session-stop').disabled=true;$('sync-start').disabled=false;rows.clear();$('session-peers').replaceChildren();status(message);}
  function render(snapshot){
    const ids=new Set(snapshot.peers.map(p=>p.id));for(const [id,row] of rows)if(!ids.has(id)){row.remove();rows.delete(id);}
    for(const peer of snapshot.peers){
      let row=rows.get(peer.id);
      if(!row){row=document.createElement('li');row.dataset.learnScope='session-'+peer.id;const label=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span');check.type='checkbox';label.append(check,text);row.append(label);$('session-peers').append(row);rows.set(peer.id,row);check.onchange=()=>desktop.chooseSlave(peer.id,check.checked).catch(error=>{check.checked=!check.checked;report(error.message);});}
      const check=row.querySelector('input');check.hidden=role!=='master'||peer.role!=='slave';check.checked=peer.selected;check.disabled=peer.busy&&!peer.selected;
      row.querySelector('span').textContent=` ${peer.name} · ${peer.address} · v${peer.version} · ${peer.role==='master'?'Master':'Slave'} · ${peer.status||(peer.busy?'Ocupado':'Disponível')}`;
    }
    if(role==='master')status(`Master ativo · ${snapshot.peers.length} computador(es) detetado(s) · ${snapshot.peers.filter(p=>p.connected).length} Slave(s) ligado(s)`);
    else if(role==='slave')status(snapshot.master?`A seguir ${snapshot.master}`:'Slave disponível · à espera de seleção no Master');
  }
  async function drain(){
    if(applying)return;applying=true;
    try{while(pending&&role==='slave'){
      const value=pending,epoch=generation;pending=null;
      try{await applyState(value,()=>epoch===generation&&role==='slave');if(epoch===generation)await desktop.sessionFeedback('Sincronizado');}
      catch(error){if(epoch===generation&&role==='slave'){pause();await desktop.sessionFeedback(error.message);status(error.message);}}
    }}finally{applying=false;}
  }
  if(!desktop?.startSession){$('session-start').disabled=true;status('A descoberta de computadores está disponível na aplicação desktop.');return {isSlave:()=>false};}
  desktop.sessionInfo().then(info=>{if(!$('session-name').value)$('session-name').value=info.name;}).catch(error=>report(error.message));
  desktop.onSessionEvent((type,data)=>{
    if(type==='status'&&role)render(data);
    if(type==='control'&&role==='slave'){pending=data;void drain();}
    if(type==='lost'&&role==='slave'){generation++;pending=null;pause();status(data);}
    if(type==='failure'){void desktop.stopSession();reset(data);report(data);}
  });
  $('session-start').onclick=async()=>{
    const settings=Object.fromEntries(['name','role','group','port','interface'].map(key=>[key,$(`session-${key}`).value.trim()]));
    $('session-start').disabled=true;
    try{
      await stopTimecode();role=settings.role;generation++;
      if(role==='slave')pause();
      const snapshot=await desktop.startSession({id,name:settings.name,role,code:$('session-code').value,group:settings.group,port:Number(settings.port),interfaceAddress:settings.interface});
      storage.setItem('stageset-session-settings',JSON.stringify(settings));
      $('session-options').disabled=true;$('session-stop').disabled=false;$('sync-start').disabled=true;render(snapshot);
      if(role==='master')timer=setInterval(()=>desktop.publishSessionState(readState()).catch(error=>{void desktop.stopSession();reset(error.message);}),100);
    }catch(error){await desktop.stopSession().catch(()=>{});reset(error.message);report(error.message);}
  };
  $('session-stop').onclick=async()=>{await desktop.stopSession();reset('Sessão desligada');};
  return {isSlave:()=>role==='slave',stop:async()=>{await desktop.stopSession();reset('Sessão desligada');}};
}
