/** Coleta somente leitura, vinculada a uma aba; nunca reutiliza ações sintéticas no gravador humano. */
import {inspectManualPage,readManualViewport} from './manual-observer.js';
// Registra a coleta de manuais no worker e reutiliza a mesma sessão HTTP da extensão.
export function installManualCapture(apiFetch, serialize = operation => operation()) {
  let running=false,stopped=false,starting=false;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const state=async patch=>{const old=(await chrome.storage.local.get('manualCapture')).manualCapture||{};await chrome.storage.local.set({manualCapture:{...old,...patch}});};
  async function api(path,body){
    const controller=new AbortController();let timeout;
    const options=body===undefined?{method:'GET'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
    options.signal=controller.signal;
    try {
      const operation=(async()=>{const response=await apiFetch((globalThis.OctorEnvironment?.apiBase ?? 'http://localhost:8000/api'),path,options);const data=await response.json();if(!response.ok)throw new Error(data.detail||'Não foi possível atualizar a coleta.');return data;})();
      return await Promise.race([operation,new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(new Error('O backend não respondeu em 10 segundos. Confira se a API do OCTOR está em execução.'));},10000);})]);
    } finally {clearTimeout(timeout);}
  }
  const exec=async(tabId,func,args)=>{const result=await chrome.scripting.executeScript({target:{tabId},func,args});return result[0]?.result;};
  async function ensureTab(tabId,url){
    if(stopped)throw new Error('Coleta interrompida.');
    const tab=await chrome.tabs.get(tabId);const actual=new URL(tab.url);actual.hash='';const expected=new URL(url);expected.hash='';
    if(actual.href!==expected.href)throw new Error('A URL mudou. Crie outra coleta usando o endereço final.');
    if(!tab.active)throw new Error('Mantenha a aba da coleta ativa e use Continuar coleta para retomar.');
    const window=await chrome.windows.get(tab.windowId);if(!window.focused)throw new Error('Mantenha a janela da coleta em primeiro plano.');
    return tab;
  }
  async function scan(session){
    running=true;stopped=false;let originalScroll=0;
    try {
      await state({active:true,status:'capturing',message:'Lendo a página e preparando os prints.'});
      await api('/manuals/'+session.runId+'/progress/',{message:'A extensão iniciou a leitura. Aguardando o carregamento da página.'});
      let tab;
      for(let i=0;i<80;i++){if(stopped)throw new Error('Coleta interrompida.');tab=await chrome.tabs.get(session.tabId);if(tab.status==='complete')break;await wait(250);}
      if(tab.status!=='complete')throw new Error('O site ainda está carregando. Aguarde na aba e clique em Continuar coleta.');
      const actual=new URL(tab.url);actual.hash='';const expected=new URL(session.url);expected.hash='';
      if(actual.href!==expected.href){
        // O servidor valida a equivalência: jamais autorizar livremente outro domínio/rota.
        const confirmed=await api('/manuals/'+session.runId+'/canonical/',{url:actual.href});
        session.url=confirmed.url;await state({url:confirmed.url});
      }
      await ensureTab(session.tabId,session.url);
      await wait(800);
      let info;
      for(let attempt=0;attempt<12;attempt++){
        await ensureTab(session.tabId,session.url);
        info=await exec(session.tabId,inspectManualPage,[session.url]);
        if(info?.attention)throw new Error(info.attention);
        if(info?.positions?.length)break;
        await wait(500);
      }
      if(!info?.positions?.length)throw new Error('A página não disponibilizou conteúdo legível. Confira a aba e tente continuar quando ela estiver pronta.');
      originalScroll=info.original_scroll;
      await api('/manuals/'+session.runId+'/progress/',{message:'Conteúdo identificado. Preparando '+info.positions.length+' prints.'});
      const existing=await api('/manuals/'+session.runId+'/');const done=new Set(existing.captures.map(c=>c.order));
      const known=new Set(existing.captures.filter(c=>c.evidence.content_hash).map(c=>[c.evidence.content_hash,c.evidence.scroll_y,c.evidence.viewport_width,c.evidence.viewport_height].join(':')));
      const positions=session.plan||info.positions;await state({plan:positions});
      let accepted=existing.captures.length;
      for(let index=0;index<positions.length;index++){
        if(done.has(index+1))continue;
        await ensureTab(session.tabId,session.url);
        const positioned=await exec(session.tabId,inspectManualPage,[session.url,positions[index]]);
        if(positioned.attention)throw new Error(positioned.attention);
        let before,image;
        for(let shot=0;shot<3;shot++){
          let stable=false;
          for(let settling=0;settling<5;settling++){
            before=await exec(session.tabId,readManualViewport,[session.url]);await wait(300);
            const probe=await exec(session.tabId,readManualViewport,[session.url,true]);
            stable=before.scene.signature===probe.scene.signature;
            if(stable&&!probe.evidence.quality?.pending_images)break;
          }
          if(!stable)throw new Error('A região ainda está mudando. Aguarde a página estabilizar e continue a coleta.');
          tab=await ensureTab(session.tabId,session.url);
          image=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'jpeg',quality:92});
          const check=await exec(session.tabId,readManualViewport,[session.url,true]);
          if(check.scene.signature===before.scene.signature&&check.scene.url===before.scene.url&&check.scene.scroll===before.scene.scroll&&check.scene.width===before.scene.width&&check.scene.height===before.scene.height)break;
          image=null;await wait(550);
        }
        if(!image)throw new Error('A tela mudou durante os prints. Confira a aba e retome a coleta.');
        before.evidence.quality={...before.evidence.quality,stable:true};
        const text=before.evidence.text.toLowerCase().trim().replace(/\s+/g,' ');
        let fingerprint='';
        if(text.length>=80&&before.evidence.quality.visual_content===false){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));const hash=[...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');fingerprint=[hash,before.evidence.scroll_y,before.evidence.viewport_width,before.evidence.viewport_height].join(':');}
        if(fingerprint&&known.has(fingerprint))continue;
        await ensureTab(session.tabId,session.url);
        const saved=await api('/manuals/'+session.runId+'/captures/',{key:'viewport-'+(index+1),order:index+1,url:before.url,title:before.evidence.heading||before.title,evidence:before.evidence,screenshot_base64:image});
        if(!saved.duplicate)accepted++;
        if(fingerprint)known.add(fingerprint);
        const message=accepted+' prints únicos salvos. Região '+(index+1)+' de '+positions.length+'.';
        await state({message});await api('/manuals/'+session.runId+'/progress/',{message});
      }
      await api('/manuals/'+session.runId+'/captured/',{});
      await state({active:false,status:'captured',message:'Capturas prontas. Volte ao OCTOR, confira os prints e gere seu manual.'});
      if(session.originTabId){const current=await chrome.tabs.get(session.tabId);const window=await chrome.windows.get(current.windowId);if(current.active&&window.focused)await chrome.tabs.update(session.originTabId,{active:true}).catch(()=>{});}
    } catch(error) {
      if(!stopped){const message=String(error.message||'Não foi possível ler a página.').slice(0,500);await state({active:false,status:'attention',message});await api('/manuals/'+session.runId+'/attention/',{message}).catch(()=>{});}
    } finally {
      await exec(session.tabId,inspectManualPage,[session.url,0,true]).catch(()=>{});
      if(!stopped)await chrome.scripting.executeScript({target:{tabId:session.tabId},func:y=>scrollTo({top:y,behavior:'instant'}),args:[originalScroll]}).catch(()=>{});
      running=false;
    }
  }
  async function handle(message,sender){
    const panel=sender.url===chrome.runtime.getURL('popup.html');
    const web=(()=>{try{return (globalThis.OctorEnvironment?.appOrigins ?? ['http://localhost:4200','http://127.0.0.1:4200']).includes(new URL(sender.url).origin);}catch{return false;}})();
    if(!panel&&!web)throw new Error('Inicie a coleta pelo OCTOR.');
    const saved=await chrome.storage.local.get(['manualCapture','isRecording','playback','authToken','refreshToken']);
    if(message.action==='PING_MANUAL')return {success:true,protocol:1,reader:3,version:chrome.runtime.getManifest?.().version||'desenvolvimento',connected:!!(saved.authToken||saved.refreshToken)};
    if(message.action==='STOP_MANUAL'){
      const session=saved.manualCapture;
      if(session&&message.runId===session.runId){stopped=true;await exec(session.tabId,inspectManualPage,[session.url,0,true]).catch(()=>{});await state({active:false,status:'cancelled',message:'Coleta interrompida.'});await api('/manuals/'+session.runId+'/cancel/',{});}
      return {success:true};
    }
    if(running||saved.isRecording||saved.playback)throw new Error('Finalize a captura ou tutorial em andamento antes de iniciar outra coleta.');
    let session;
    if(message.action==='CONTINUE_MANUAL'){
      session=saved.manualCapture;if(!session||session.status!=='attention')throw new Error('Não há coleta aguardando continuação.');
      await chrome.tabs.update(session.tabId,{active:true});const tab=await chrome.tabs.get(session.tabId);await chrome.windows.update(tab.windowId,{focused:true});
    }else{
      if(!/^[0-9a-f-]{36}$/i.test(message.runId||''))throw new Error('Identificador de coleta inválido.');
      const run=await api('/manuals/'+message.runId+'/');
      if(!['waiting','capturing'].includes(run.status))throw new Error('Esta coleta não está disponível.');
      const url=new URL(run.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('URL não permitida.');
      const tab=await chrome.tabs.create({url:run.url,active:true});session={runId:run.id,url:run.url,tabId:tab.id,originTabId:sender.tab?.id};await state(session);
    }
    await state({...session,active:true,status:'starting',message:'Abrindo a página para leitura.'});
    void scan(session);return {success:true};
  }
  const listener=(message,sender,respond)=>{
    if(!['START_MANUAL','STOP_MANUAL','CONTINUE_MANUAL','PING_MANUAL'].includes(message.action))return false;
    if(message.action==='PING_MANUAL'){handle(message,sender).then(respond,error=>respond({success:false,error:error.message}));return true;}
    if(message.action!=='STOP_MANUAL'){if(starting||running){respond({success:false,error:'Já existe uma coleta em andamento.'});return false;}starting=true;}
    serialize(()=>handle(message,sender)).then(respond,error=>respond({success:false,error:error.message})).finally(()=>{if(message.action!=='STOP_MANUAL')starting=false;});return true;
  };
  chrome.runtime.onMessage.addListener(listener);
  // O canal externo autenticado por origem funciona mesmo em abas sem o novo content script.
  chrome.runtime.onMessageExternal?.addListener(listener);
  chrome.tabs.onRemoved.addListener(async tabId=>{const session=(await chrome.storage.local.get('manualCapture')).manualCapture;if(session?.tabId===tabId&&session.active){stopped=true;await state({active:false,status:'attention',message:'A aba foi fechada. Inicie uma nova coleta.'});await api('/manuals/'+session.runId+'/attention/',{}).catch(()=>{});}});
  // Uma reinicialização não repete automaticamente comandos ou capturas incompletas.
  chrome.storage.local.get('manualCapture').then(async saved=>{if(saved.manualCapture?.active&&!running){await state({active:false,status:'attention',message:'A extensão foi reiniciada. Confira a aba e continue a coleta.'});}});
}
