/** Ponte sem credenciais: apenas a interface local do OCTOR pode iniciar e interromper uma coleta. */
(() => {
  if (!(globalThis.OctorEnvironment?.appOrigins ?? ['http://localhost:4200','http://127.0.0.1:4200']).includes(location.origin)) return;
  window.addEventListener('message', async event => {
    if (event.source !== window || event.origin !== location.origin || !['OCTOR_MANUAL_START','OCTOR_MANUAL_STOP','OCTOR_MANUAL_PING'].includes(event.data?.type)) return;
    const {type,requestId,runId}=event.data;
    if(typeof requestId!=='string'||(type!=='OCTOR_MANUAL_PING'&&typeof runId!=='string'))return;
    try {
      const result=await chrome.runtime.sendMessage({action:type==='OCTOR_MANUAL_PING'?'PING_MANUAL':type==='OCTOR_MANUAL_START'?'START_MANUAL':'STOP_MANUAL',runId});
      window.postMessage({type:'OCTOR_MANUAL_RESULT',requestId,extensionId:chrome.runtime.id,...(result||{success:false,error:'A extensão carregada ainda não oferece Manual por URL. Recarregue o OCTOR em chrome://extensions.'})},location.origin);
    } catch(error) {window.postMessage({type:'OCTOR_MANUAL_RESULT',requestId,success:false,error:error.message},location.origin);}
  });
})();
