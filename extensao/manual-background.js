import {waitManualReady, waitManualPaint} from './manual-ready.js';
/** Coleta somente leitura, vinculada a uma aba; nunca reutiliza ações sintéticas no gravador humano. */
import {inspectManualPage,readManualViewport,manualNavigation} from './manual-observer.js';
function clearManualOutline() {
  document.getElementById('__octor_manual_outline__')?.remove();
}

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
      return await Promise.race([operation,new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(new Error('O backend não respondeu em 45 segundos. Confira se a API do OCTOR está em execução.'));},45000);})]);
    } finally {clearTimeout(timeout);}
  }
  const exec=async(tabId,func,args)=>{const result=await chrome.scripting.executeScript({target:{tabId},func,args});return result[0]?.result;};
  let lastReadiness;
  async function ready(session,phase,order) {
    if(stopped)throw new Error('Coleta interrompida.');
    await state({message:order ? 'Passo '+order+': aguardando a tela estabilizar.' : 'Aguardando os componentes da página.'});
    const result=await exec(session.tabId,waitManualReady,[{}]);
    if(!result?.ready)throw new Error('Não foi possível confirmar a estabilidade da tela.');
    await ensureTab(session.tabId,session.url);
    lastReadiness=result;
    console.debug('[OCTOR manual]',JSON.stringify({timestamp:new Date().toISOString(),run:session.runId,
      order,phase,waitedMs:result.waitedMs,state:result}));
    return result;
  }
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
    // Somente durante a execução, uma API Chrome evita a suspensão em chamadas longas da IA.
    const heartbeat=setInterval(()=>chrome.storage.local.get('manualCapture').catch(()=>{}),20000);
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
      await ready(session,'initial',0);
      let info;
      for(let attempt=0;attempt<12;attempt++){
        await ensureTab(session.tabId,session.url);
        info=await exec(session.tabId,inspectManualPage,[session.url,null,false,session.objective]);
        if(info?.attention)throw new Error(info.attention);
        if(info?.positions?.length)break;
        await wait(500);
      }
      if(!info?.positions?.length)throw new Error('A página não disponibilizou conteúdo legível. Confira a aba e tente continuar quando ela estiver pronta.');
      originalScroll=info.original_scroll;
      await api('/manuals/'+session.runId+'/progress/',{message:'Conteúdo identificado. Preparando '+info.positions.length+' prints.'});
      const existing=await api('/manuals/'+session.runId+'/');const done=new Set(existing.captures.map(c=>c.order));
      const known=new Set(existing.captures.filter(c=>c.evidence.content_hash).map(c=>[c.url,c.evidence.content_hash,c.evidence.scroll_y,c.evidence.viewport_width,c.evidence.viewport_height].join(':')));
      const freshPositions = [originalScroll, ...info.positions.filter(y => y !== originalScroll)];
      const resuming = Boolean(existing.captures.length || existing.agent_state?.resume_required || existing.agent_state?.regenerate_requested);
      const positions = resuming ? freshPositions : (session.plan || freshPositions);
      // Keep original captures immutable and give the new observation its own order.
      const captureOffset = resuming ? Math.max(0, ...done) : 0;
      if (captureOffset >= 6) throw new Error('Limite de prints atingido. Inicie uma nova coleta para documentar esta tela.');
      await state({agentState: existing.agent_state || {}});
      const resumeRequired = existing.agent_state?.resume_required;
      const visited = resumeRequired ? [] : (session.visited || []);
      let observationTicket;
      let nextProcedure = false;
      if (resumeRequired) {
        const current = await chrome.tabs.get(session.tabId);
        const resumed = await api('/manuals/' + session.runId + '/resume-agent/', {url: current.url});
        observationTicket = resumed.agent_state.observation_ticket;
      }
      const accountFlow = new URL(session.url).hostname === 'www.youtube.com' &&
        /(?:trocar|troca|mudar|mude|switch|alternar).{0,30}(?:conta|account)/i.test(session.objective || '');

      const debug = (await chrome.storage.local.get('manualCaptureDebug')).manualCaptureDebug === true &&
        await chrome.permissions.contains({permissions: ['downloads']});
      await state({plan:positions});
      let accepted = existing.captures.length;
      for (let index = 0; index < positions.length && captureOffset + index < 6; index++) {
        const order = captureOffset + index + 1;
        if (done.has(order)) continue;
        await ensureTab(session.tabId,session.url);
        const positioned=await exec(session.tabId,inspectManualPage,[session.url,positions[index]]);
        if(positioned.attention)throw new Error(positioned.attention);
        let controls = [], decision, label;
        if (session.objective && (order < 6 || resuming) && (nextProcedure || observationTicket || index === 0 || visited.length > 0)) {
          // Hidratação/tradução pode trocar rótulos durante o print. Observe novamente,
          // sem transformar uma tela transitória em passo ou conclusão do agente.
          for (let observationAttempt = 0; observationAttempt < 4; observationAttempt++) {
          await ready(session,'before-planner',order);
          controls = await exec(session.tabId, manualNavigation, [session.url, null, '', false, accountFlow]) || [];
          const viewport = await exec(session.tabId, readManualViewport, [session.url]);
          const page = {title: viewport.title, text: viewport.evidence.text.slice(0, 700)};
          await exec(session.tabId,waitManualPaint,[]);
          const observedTab = await ensureTab(session.tabId, session.url);
          const screenshot = await chrome.tabs.captureVisibleTab(observedTab.windowId, {format:'jpeg', quality:75});
          await ensureTab(session.tabId, session.url);
          const observed = await exec(session.tabId, readManualViewport, [session.url, true]);
          const currentControls = await exec(session.tabId, manualNavigation, [session.url, null, '', false, accountFlow]) || [];
          const sameViewport = ['url', 'scroll', 'width', 'height'].every(
            key => observed.scene[key] === viewport.scene[key],
          );
          if (sameViewport && JSON.stringify(currentControls) === JSON.stringify(controls)) {
            await state({message:'Passo '+order+': Gemini analisando a tela.'});
            decision = await api('/manuals/' + session.runId + '/plan/', {
              controls:controls.map(({label,kind})=>({label,kind})), visited, page, screenshot, observation_ticket: observationTicket, observed_url: session.url,
            })
              .catch(() => ({index: null, reason: 'error'}));
            break;
          } else {
            await ready(session,'changed-observation',order);
          }
          }
          if (!decision) throw new Error('A tela mudou durante a observação. Aguarde o carregamento ou a tradução terminar e continue a coleta. Nenhum passo desta tela foi salvo.');
          if (decision.reason === 'error') throw new Error('Falha ao consultar a IA. Nenhum passo desta decisão foi capturado.');
          if (accountFlow && decision.reason === 'done' && visited.length < 2) {
            decision = {index: null, reason: 'unsure'};
          }
          if (decision.reason !== 'error' && decision.reason !== 'pending') observationTicket = undefined;
          console.debug('[OCTOR manual]',JSON.stringify({timestamp:new Date().toISOString(),order,
            phase:'decision',action:decision.reason,target:controls[decision.index]??null}));
          nextProcedure = false;
          label = controls[decision.index]?.label;
          if (decision.reason === 'next' && !label) {
            throw new Error('A ação não corresponde a um controle observado. Observe a tela novamente antes de registrar o passo.');
          }
        }
        let before,image,highlighted,rawImage;
        const targetId=label ? controls[decision.index]?.targetId ?? null : null;
        for(let shot=0;shot<3;shot++){
          await ready(session,'before-screenshot',order);
          let stable=false;
          for(let settling=0;settling<5;settling++){
            before=await exec(session.tabId,readManualViewport,[session.url]);await exec(session.tabId,waitManualPaint,[]);
            const probe=await exec(session.tabId,readManualViewport,[session.url,true]);
            stable = before.scene.signature === probe.scene.signature && !probe.evidence.quality?.pending_images;
            if (stable) break;
          }
          if(!stable)throw new Error('A região ainda está mudando. Aguarde a página estabilizar e continue a coleta.');
          tab=await ensureTab(session.tabId,session.url);
          if (debug) {
            await exec(session.tabId, clearManualOutline, []);
            rawImage = await chrome.tabs.captureVisibleTab(tab.windowId, {format:'jpeg',quality:92});
            await wait(550);
            await ensureTab(session.tabId, session.url);
          }
          highlighted = label && await exec(session.tabId, manualNavigation, [session.url, decision.index, label, true, accountFlow, null, targetId]);
          if (label && !highlighted) throw new Error('O controle mudou antes do print. Confira a aba e continue.');
          await exec(session.tabId,waitManualPaint,[]);
          tab=await ensureTab(session.tabId,session.url);
          try {
            image=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'jpeg',quality:92});
          } finally {
            await exec(session.tabId, clearManualOutline, []);
          }
          const check=await exec(session.tabId,readManualViewport,[session.url,true]);
          if(check.scene.signature===before.scene.signature&&check.scene.url===before.scene.url&&check.scene.scroll===before.scene.scroll&&check.scene.width===before.scene.width&&check.scene.height===before.scene.height)break;
          image=null;await ready(session,'changed-capture',order);
        }
        if(!image)throw new Error('A tela mudou durante os prints. Confira a aba e retome a coleta.');
        if (debug) {
          const folder = 'OCTOR-debug/' + session.runId + '/' + order + '-' + Date.now();
          const metadata = {
            url: before.url, title: before.title, timestamp: new Date().toISOString(),
            viewport: {width: before.scene.width, height: before.scene.height},
            scroll: before.scene.scroll, devicePixelRatio: before.scene.devicePixelRatio,
            zoom: await chrome.tabs.getZoom(session.tabId), controls, selectedLabel: label ?? null,
            pendingImages: before.evidence.quality?.pending_images ?? 0,
            readiness:lastReadiness,targetId,reason:highlighted?'stable-target-outlined':'stable-reference',
          };
          const files = {
            'raw.jpg': rawImage, 'outlined.jpg': image,
            'observation.json': 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(metadata, null, 2)),
          };
          for (const [name, url] of Object.entries(files)) {
            await chrome.downloads.download({url, filename: folder + '/' + name, saveAs: false});
          }
        }
        before.evidence.quality={...before.evidence.quality,stable:true};
        const text=before.evidence.text.toLowerCase().trim().replace(/\s+/g,' ');
        let fingerprint='';
        if(text.length>=80&&before.evidence.quality.visual_content===false){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));const hash=[...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');fingerprint=[hash,before.evidence.scroll_y,before.evidence.viewport_width,before.evidence.viewport_height].join(':');}
        if(!decision&&!highlighted&&fingerprint&&known.has(session.url+':'+fingerprint))continue;
        await ensureTab(session.tabId,session.url);
        if(stopped)throw new Error('Coleta interrompida.');
        console.debug('[OCTOR manual]',JSON.stringify({timestamp:new Date().toISOString(),order,
          phase:'save',label:label??null,targetId,reason:highlighted?'stable-target-outlined':'stable-reference'}));
        const saved=await api('/manuals/'+session.runId+'/captures/',{key:'viewport-'+order,order,url:before.url,title:before.evidence.heading||before.title,evidence:before.evidence,screenshot_base64:image});
        if(!saved.duplicate)accepted++;
        if(fingerprint)known.add(session.url+':'+fingerprint);
        const message = accepted + ' prints salvos.';
        await state({message});
        await api('/manuals/' + session.runId + '/progress/', {message});
        if (decision?.reason === 'pending') {
          const current = await api('/manuals/' + session.runId + '/');
          await state({agentState: current.agent_state});
          throw new Error('A coleta aguarda a revisão do plano ou uma resposta no OCTOR.');
        }
        const procedureState = {done: 'concluido', unsure: 'precisa_usuario', blocked: 'bloqueado'}[decision?.reason];
        if (procedureState) {
          if (existing.agent_state?.classification || decision.reason === 'done') {
            const finished = await api('/manuals/' + session.runId + '/finish-procedure/', {
              state: procedureState,
              reason: decision.message || (decision.reason === 'done' ? 'Objetivo atingido.' : 'A coleta precisa de atenção.'),
              capture_id: saved.id,
            });
            await state({agentState: finished.agent_state});
            const {approved_plan: queue, procedures} = finished.agent_state;
            if (queue && procedures.length < queue.length && order < 6) {
              visited.length = 0;
              positions.splice(index + 1, positions.length, before.scene.scroll);
              nextProcedure = true;
              await state({plan: positions, visited});
              continue;
            }
            if (queue && procedures.length === queue.length) break;
          }
          if (decision.reason === 'done') break;
          throw new Error('Procedimento incompleto. Os prints foram preservados.');
        }
        if (decision?.reason === 'error') throw new Error('Falha ao consultar a IA. Os prints foram preservados.');
        if (highlighted) {
          await ready(session,'before-action',order);
          const actionScene=await exec(session.tabId,readManualViewport,[session.url,true]);
          if(actionScene.scene.signature!==before.scene.signature)throw new Error('A tela mudou após o print. A ação foi interrompida para não clicar no alvo errado.');
          await ensureTab(session.tabId, session.url);
          console.debug('[OCTOR manual]',JSON.stringify({timestamp:new Date().toISOString(),order,phase:'execute',
            action:decision.value ? 'type' : 'click',label,targetId}));
          await state({message:'Passo '+order+': abrindo '+label+'.'});
          const opened = await exec(session.tabId, manualNavigation, [session.url, decision.index, label, false, accountFlow, decision.value ?? null,targetId]);
          if (!opened) {
            throw new Error('O controle mudou ou rejeitou o preenchimento. O print foi preservado.');
          }
            if (opened?.url) {
              const approved = await api('/manuals/' + session.runId + '/canonical/', {url:opened.url});
              session.url = approved.url;
              await state({url:session.url});
              if (stopped) throw new Error('Coleta interrompida.');
              await chrome.tabs.update(session.tabId, {url:session.url});
              for (let attempt = 0; attempt < 60; attempt++) {
                tab = await chrome.tabs.get(session.tabId);
                if (stopped || tab.status === 'complete' && tab.url === session.url) break;
                await wait(250);
              }
              await ensureTab(session.tabId, session.url);
            }
            if (opened) {
              let viewport;
              for (const deadline = Date.now()+15000; Date.now()<deadline;) {
                await wait(150);
                await ensureTab(session.tabId, session.url);
                viewport = await exec(session.tabId, readManualViewport, [session.url, true]);
                if (opened.typed || viewport.scene.signature !== before.scene.signature || viewport.url !== before.url) break;
              }
              if (!opened.typed && viewport.scene.signature === before.scene.signature && viewport.url === before.url) {
                throw new Error('O controle foi aberto, mas a coleta ainda nao conseguiu identificar a nova tela. Confira a aba e continue.');
              }
              // Gives the new screen time to finish rendering before the stable capture checks.
              await ready(session,'after-action',order);
              await ensureTab(session.tabId, session.url);
              viewport = await exec(session.tabId, readManualViewport, [session.url, true]);
              visited.push(label);
              positions.splice(index + 1, positions.length, viewport.scene.scroll);
              await state({plan:positions, visited});
            }
        }
      }
      await api('/manuals/' + session.runId + '/captured/', {});
      if (visited.length) await api('/manuals/' + session.runId + '/generate/', {});
      await state({active:false,status:'captured',message:visited.length ? 'Capturas prontas. O rascunho entrou na fila para revisao.' : 'Capturas prontas. Volte ao OCTOR para conferir os prints e gerar o rascunho.'});
      if(session.originTabId){const current=await chrome.tabs.get(session.tabId);const window=await chrome.windows.get(current.windowId);if(current.active&&window.focused)await chrome.tabs.update(session.originTabId,{active:true}).catch(()=>{});}
    } catch(error) {
      if(!stopped){const message=String(error.message||'Não foi possível ler a página.').slice(0,500);await state({active:false,status:'attention',message});await api('/manuals/'+session.runId+'/attention/',{message}).catch(()=>{});}
    } finally {
      clearInterval(heartbeat);
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
    if (message.action === 'REVIEW_MANUAL_AGENT') {
      const session = saved.manualCapture;
      if (!panel || !session || session.active || running) throw new Error('A coleta precisa estar pausada.');
      const review = message.review;
      if (!['approve-plan', 'answer-question', 'regenerate-plan'].includes(review)) throw new Error('Revisão inválida.');
      const tab = await chrome.tabs.get(session.tabId);
      const result = await api('/manuals/' + session.runId + '/' + review + '/', {...message.payload, url: tab.url});
      await state({agentState: result.agent_state, message: 'Revisão salva. Use Continuar coleta.'});
      return {success: true};
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
      const tab=await chrome.tabs.create({url:run.url,active:true});session={runId:run.id,url:run.url,objective:run.objective,plan:null,visited:[],tabId:tab.id,originTabId:sender.tab?.id};await state(session);
    }
    await state({...session,active:true,status:'starting',message:'Abrindo a página para leitura.'});
    void scan(session);return {success:true};
  }
  const listener=(message,sender,respond)=>{
    if(!['START_MANUAL','STOP_MANUAL','CONTINUE_MANUAL','PING_MANUAL','REVIEW_MANUAL_AGENT'].includes(message.action))return false;
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
