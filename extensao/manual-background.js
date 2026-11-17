/** Coleta somente leitura, vinculada a uma aba; nunca reutiliza ações sintéticas no gravador humano. */
import {inspectManualPage,readManualViewport,manualNavigation,verifyManualTyping,verifyManualClick} from './manual-observer.js';
import {waitForManualStability,validateManualImage,manualVisualDifference} from './manual-wait.js';
import {createManualStep} from './manual-step.js';
function clearManualOutline() {
  document.getElementById('__octor_manual_outline__')?.remove();
}

// Registra a coleta de manuais no worker e reutiliza a mesma sessão HTTP da extensão.
export function installManualCapture(apiFetch, serialize = operation => operation()) {
  let running=false,stopped=false,starting=false;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let lastShot = 0;
  let stateQueue=Promise.resolve();
  const state=patch=>{
    const operation=stateQueue.then(async()=>{
      const old=(await chrome.storage.local.get('manualCapture')).manualCapture||{};
      const merged={...old,...patch};
      if(patch.runId&&patch.runId!==old.runId)merged.stepLog=[];
      if(patch.step)merged.stepLog=[...(merged.stepLog||[]),patch.step].slice(-200);
      await chrome.storage.local.set({manualCapture:merged});
    });
    stateQueue=operation.catch(()=>{});return operation;
  };
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
  const settle = async session => {
    await ensureTab(session.tabId, session.url);
    const result = await exec(session.tabId, waitForManualStability, [{timeoutMs:session.waitTimeoutMs || 15000}]);
    if (!result?.stable || stopped) throw new Error('Estabilização interrompida.');
    await ensureTab(session.tabId, session.url);
    return result;
  };
  async function capture(session, options = {format:'jpeg',quality:92}) {
    // Chrome permits at most two captureVisibleTab calls/second. This is API pacing,
    // never a substitute for checking page readiness.
    if (Date.now()-lastShot < 550) await wait(550-(Date.now()-lastShot));
    const tab = await ensureTab(session.tabId,session.url);
    lastShot = Date.now();
    const image = await chrome.tabs.captureVisibleTab(tab.windowId,options);
    await ensureTab(session.tabId,session.url);
    return image;
  }
  async function stableImage(session, options) {
    const first = await capture(session,options);
    const baseline = await validateManualImage(first);
    await settle(session);
    const image = await capture(session,options);
    const current = await validateManualImage(image);
    if (manualVisualDifference(baseline,current) > 0.025) throw new Error('A imagem ainda está mudando. Nenhuma captura foi aceita.');
    return image;
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
    running=true;stopped=false;let originalScroll=0, step;
    session.executionId ||= crypto.randomUUID();
    try {
      await state({active:true,status:'capturing',executionId:session.executionId,message:'Lendo a página e preparando os prints.'});
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
      await settle(session);
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
      const freshPositions = [originalScroll, ...info.positions.filter(y => y !== originalScroll)];
      const resuming = Boolean(session.resuming || existing.agent_state?.resume_required || existing.agent_state?.regenerate_requested);
      const positions = resuming ? freshPositions : (session.plan || freshPositions);
      // Keep original captures immutable and give the new observation its own order.
      const captureOffset = resuming ? Math.max(0, ...done) : 0;
      if (captureOffset >= 6) throw new Error('Limite de prints atingido. Inicie uma nova coleta para documentar esta tela.');
      await state({agentState: existing.agent_state || {}});
      const resumeRequired = existing.agent_state?.resume_required;
      const visited = resumeRequired ? [] : [...(session.visited || [])];
      // An interrupted dispatch has an unknown outcome. Observe again and prohibit replay.
      if (session.pendingAction?.label && !visited.includes(session.pendingAction.label)) visited.push(session.pendingAction.label);
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
        step = createManualStep(session.executionId, entry => state({step:entry}));
        await step.move('WAITING');
        await ensureTab(session.tabId,session.url);
        const positioned=await exec(session.tabId,inspectManualPage,[session.url,positions[index]]);
        if(positioned.attention)throw new Error(positioned.attention);
        let controls = [], decision, label, analyzedScene;
        if (session.objective && (nextProcedure || observationTicket || index === 0 || visited.length > 0)) {
          // Hidratação/tradução pode trocar rótulos durante o print. Observe novamente,
          // sem transformar uma tela transitória em passo ou conclusão do agente.
          for (let observationAttempt = 0; observationAttempt < 4; observationAttempt++) {
          const ready = await settle(session);
          controls = await exec(session.tabId, manualNavigation, [session.url, null, '', false, accountFlow]) || [];
          const viewport = await exec(session.tabId, readManualViewport, [session.url]);
          const page = {title: viewport.title, text: viewport.evidence.text.slice(0, 700)};
          await settle(session);
          await ensureTab(session.tabId, session.url);
          let screenshot;
          try { screenshot = await stableImage(session, {format:'jpeg', quality:75}); }
          catch (error) { if (observationAttempt === 3) throw error; continue; }
          await validateManualImage(screenshot);
          await ensureTab(session.tabId, session.url);
          const observed = await exec(session.tabId, readManualViewport, [session.url, true]);
          const currentControls = await exec(session.tabId, manualNavigation, [session.url, null, '', false, accountFlow]) || [];
          const sameViewport = ['url', 'scroll', 'width', 'height'].every(
            key => observed.scene[key] === viewport.scene[key],
          );
          const afterReady = await settle(session);
          if (sameViewport && ready.document_id === afterReady.document_id && ready.signature === afterReady.signature && JSON.stringify(currentControls) === JSON.stringify(controls)) {
            await step.move('ANALYZING');
            const requestStep = step.step_id;
            decision = await api('/manuals/' + session.runId + '/plan/', {
              controls, visited, page, screenshot, observation_ticket: observationTicket, observed_url: session.url,
              execution_id:session.executionId, step_id:requestStep,
              recover_interrupted:Boolean(session.resuming && session.pendingAction),
            });
            if (decision.execution_id !== session.executionId || decision.step_id !== requestStep || stopped) throw new Error('Resposta de outra observação descartada.');
            const afterAnalysis = await settle(session);
            if (afterAnalysis.document_id !== afterReady.document_id || afterAnalysis.signature !== afterReady.signature) throw new Error('A interface mudou durante a análise. Observe a tela novamente.');
            analyzedScene = afterAnalysis;
            await step.move('ACTION_READY');
            await step.move('WAITING');
            break;
          } else {
            await wait(700);
          }
          }
          if (!decision) throw new Error('A tela mudou durante a observação. Aguarde o carregamento ou a tradução terminar e continue a coleta. Nenhum passo desta tela foi salvo.');
          if (accountFlow && decision.reason === 'done' && visited.length < 2) {
            decision = {index: null, reason: 'unsure'};
          }
          if (decision.reason !== 'error' && decision.reason !== 'pending') observationTicket = undefined;
          nextProcedure = false;
          label = controls[decision.index]?.label;
          if (decision.reason === 'next' && !label) {
            throw new Error('A ação não corresponde a um controle observado. Observe a tela novamente antes de registrar o passo.');
          }
        }
        let before,image,highlighted,rawImage;
        for(let shot=0;shot<3;shot++){
          const ready = await settle(session);
          await step.move('CAPTURING', {attempt:shot+1, waited_ms:ready.waited_ms,frames:ready.frames,reason:'source'});
          before=await exec(session.tabId,readManualViewport,[session.url]);
          tab=await ensureTab(session.tabId,session.url);
          if (debug) {
            await exec(session.tabId, clearManualOutline, []);
            rawImage = await capture(session);
            await wait(550);
            await ensureTab(session.tabId, session.url);
          }
          highlighted = label && await exec(session.tabId, manualNavigation, [session.url, decision.index, label, true, accountFlow]);
          if (label && !highlighted) throw new Error('O controle mudou antes do print. Confira a aba e continue.');
          if (highlighted) await wait(120);
          tab=await ensureTab(session.tabId,session.url);
          try {
            image=await stableImage(session);
            await validateManualImage(image);
          } catch (error) {
            image = null;
            if (shot === 2) throw error;
          } finally {
            await exec(session.tabId, clearManualOutline, []);
          }
          const check=await exec(session.tabId,readManualViewport,[session.url,true]);
          const after = await settle(session);
          await ensureTab(session.tabId,session.url);
          await step.move('VALIDATING');
          if(image&&after.document_id===ready.document_id&&after.signature===ready.signature&&check.scene.signature===before.scene.signature&&check.scene.url===before.scene.url&&check.scene.scroll===before.scene.scroll&&check.scene.width===before.scene.width&&check.scene.height===before.scene.height)break;
          image=null;
          await step.move('WAITING', {reason:'scene_changed'});
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
        await ensureTab(session.tabId,session.url);
        await step.move('SAVING');
        const saved=await api('/manuals/'+session.runId+'/captures/',{key:'viewport-'+order,order,url:before.url,title:before.evidence.heading||before.title,evidence:before.evidence,screenshot_base64:image,execution_id:session.executionId,step_id:step.step_id});
        step.saved(saved.id);
        await step.move(highlighted ? 'SAVED' : 'COMPLETED', {capture_id:saved.id,storage:'confirmed'});
        if(!saved.duplicate)accepted++;
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
          if(order>=6)throw new Error('Limite de prints atingido. A próxima ação não foi executada. Inicie outra coleta para continuar o procedimento.');
          const actionScene = await settle(session);
          if (analyzedScene && (actionScene.signature !== analyzedScene.signature || actionScene.document_id !== analyzedScene.document_id)) throw new Error('A observação ficou desatualizada antes da ação.');
          const live = await exec(session.tabId,readManualViewport,[session.url,true]);
          if (live.scene.signature !== before.scene.signature) throw new Error('A tela mudou após o salvamento. Observe novamente antes de executar.');
          await ensureTab(session.tabId, session.url);
          // Persist intent before dispatch; a lost reply must not cause a second click.
          await state({pendingAction:{label, stepId:step.step_id}, executionId:session.executionId});
          const intent=await api('/manuals/'+session.runId+'/action-intent/',{execution_id:session.executionId,step_id:step.step_id});
          if(intent.step_id!==step.step_id||intent.execution_id!==session.executionId)throw new Error('Reserva de outra etapa descartada.');
          const dispatchScene=await settle(session);
          if(dispatchScene.document_id!==actionScene.document_id||dispatchScene.signature!==actionScene.signature)throw new Error('A tela mudou antes do envio da ação. Confira a aba.');
          await step.move('EXECUTING', {action:decision.value == null ? 'click' : 'type'});
          const opened = await exec(session.tabId, manualNavigation, [session.url, decision.index, label, false, accountFlow, decision.value ?? null]);
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
              await step.move('WAITING');
              let viewport;
              for (let attempt = 0; attempt < 12; attempt++) {
                await wait(250);
                await ensureTab(session.tabId, session.url);
                viewport = await exec(session.tabId, readManualViewport, [session.url, true]);
                if (opened.typed || viewport.scene.signature !== before.scene.signature || viewport.url !== before.url) break;
              }
              if (!opened.typed && viewport.scene.signature === before.scene.signature && viewport.url === before.url) {
                throw new Error('O controle foi aberto, mas a coleta ainda nao conseguiu identificar a nova tela. Confira a aba e continue.');
              }
              const resultScene = await settle(session);
              if (opened.typed && !await exec(session.tabId,verifyManualTyping,[])) throw new Error('O campo perdeu o valor após a atualização da interface. A ação não será repetida.');
              if (!opened.typed && !opened.url && !await exec(session.tabId,verifyManualClick,[])) throw new Error('Não foi possível confirmar a abertura do menu. Confira a aba antes de continuar.');
              if (!opened.typed && !opened.url && actionScene.signature === resultScene.signature) throw new Error('Nenhuma mudança verificável após o clique. A ação não será repetida.');
              await step.move('VALIDATING', {verified:true, waited_ms:resultScene.waited_ms});
              // Save the verified outcome before completing this action or asking Gemini again.
              await step.move('CAPTURING', {reason:'action_result'});
              let resultImage;
              for (let attempt=0;attempt<3;attempt++) {
                try {
                  const resultBaseline=await settle(session);
                  if(opened.typed&&!await exec(session.tabId,verifyManualTyping,[]))throw new Error('O valor do campo mudou antes da captura.');
                  await exec(session.tabId,readManualViewport,[session.url]);
                  resultImage=await stableImage(session);
                  const resultCheck=await settle(session);
                  if (resultCheck.document_id!==resultBaseline.document_id || resultCheck.signature!==resultBaseline.signature) throw new Error('O resultado mudou durante a captura.');
                  break;
                } catch(error) {if(attempt===2)throw error;await settle(session);}
              }
              await step.move('VALIDATING');
              await step.move('SAVING');
              const confirmed=await api('/manuals/'+session.runId+'/action-result/',{execution_id:session.executionId,step_id:step.step_id,screenshot:resultImage,stable:true,verified:true});
              if(confirmed.step_id!==step.step_id||confirmed.execution_id!==session.executionId)throw new Error('Confirmação de outra etapa descartada.');
              step.saved(confirmed.id);
              await step.move('COMPLETED', {verified:true,storage:'confirmed'});
              await ensureTab(session.tabId, session.url);
              viewport = await exec(session.tabId, readManualViewport, [session.url, true]);
              visited.push(label);
              positions.splice(index + 1, positions.length, viewport.scene.scroll);
              session.pendingAction = null;
              await state({plan:positions, visited, pendingAction:null});
            }
        }
      }
      await api('/manuals/' + session.runId + '/captured/', {});
      if (visited.length) await api('/manuals/' + session.runId + '/generate/', {});
      await state({active:false,status:'captured',message:visited.length ? 'Capturas prontas. O rascunho entrou na fila para revisao.' : 'Capturas prontas. Volte ao OCTOR para conferir os prints e gerar o rascunho.'});
      if(session.originTabId){const current=await chrome.tabs.get(session.tabId);const window=await chrome.windows.get(current.windowId);if(current.active&&window.focused)await chrome.tabs.update(session.originTabId,{active:true}).catch(()=>{});}
    } catch(error) {
      if (step) await step.move('FAILED', {reason:'collection_interrupted'}).catch(()=>{});
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
      session.resuming = true;
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
