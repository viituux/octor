import './playback-background.js';
/**
 * Octo Background Service Worker (Manifest V3)
 * Gerencia o estado da sessão de gravação, tira screenshots e envia os passos para a API.
 */

// Use the native side panel so recorder controls stay beside the current site.
function configureSidePanel() {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(error => console.error('Não foi possível configurar o painel lateral:', error));
  }
}
configureSidePanel();

const DEFAULT_API_BASE = "http://localhost:8000/api";
const DEFAULT_FRONTEND_BASE = "http://localhost:4200";

// Serialize state changes so rapid clicks cannot overwrite earlier steps.
let operationQueue = Promise.resolve();
function enqueue(operation) {
  const result = operationQueue.then(operation);
  operationQueue = result.catch(() => {});
  return result;
}

function liveOffset(clock, timestamp) {
  if (!clock) return 0;
  const end = Math.max(clock.startedAt, timestamp);
  const paused = (clock.pauses || []).reduce((sum, p) => sum + Math.max(0, Math.min(end, p.end) - Math.max(clock.startedAt, p.start)), 0)
    + (clock.pausedAt ? Math.max(0, end - clock.pausedAt) : 0);
  return Math.max(0, (end - clock.startedAt - paused) / 1000);
}
async function voiceCommand(voice, command, extra = {}) {
  const response = await chrome.runtime.sendMessage({ target: 'live-narration', sessionId: voice.sessionId, command, ...extra });
  if (!response?.success) {
    const error = new Error(response?.error || 'A aba do microfone não respondeu. Reabra o popup para tentar novamente ou salvar sem narração.');
    error.status = response?.status;
    throw error;
  }
  return response;
}
const SESSION_EXPIRED = 'Sua sessão expirou. Entre novamente na mesma conta na extensão e tente finalizar. Os passos foram preservados; mantenha a aba do microfone aberta.';
async function refreshAccessToken(apiBase) {
  const { refreshToken } = await chrome.storage.local.get('refreshToken');
  if (!refreshToken) {
    await chrome.storage.local.remove('authToken');
    throw new Error(SESSION_EXPIRED);
  }
  let response;
  try {
    response = await fetch(apiBase + '/auth/refresh/', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({refresh:refreshToken}),
    });
  } catch { throw new Error('Não foi possível renovar a sessão. Verifique a conexão e tente finalizar novamente. A gravação foi preservada.'); }
  if (!response.ok) {
    if ([400,401,403].includes(response.status)) {
      await chrome.storage.local.remove(['authToken','refreshToken']);
      throw new Error(SESSION_EXPIRED);
    }
    throw new Error('O servidor não conseguiu renovar a sessão. Tente finalizar novamente. A gravação foi preservada.');
  }
  let session;
  try { session = await response.json(); } catch { throw new Error('O servidor não confirmou a renovação da sessão. A gravação foi preservada.'); }
  if (typeof session.access !== 'string' || !session.access.trim()) throw new Error('O servidor não confirmou a renovação da sessão. A gravação foi preservada.');
  const update = {authToken:session.access};
  if (typeof session.refresh === 'string' && session.refresh.trim()) update.refreshToken=session.refresh;
  await chrome.storage.local.set(update);
  return session.access;
}
async function recordingApiFetch(apiBase, path, options) {
  let { authToken } = await chrome.storage.local.get('authToken');
  if (!authToken) authToken = await refreshAccessToken(apiBase);
  const request = token => fetch(apiBase + path, {...options, headers:{...options.headers, Authorization:'Bearer ' + token}});
  let response = await request(authToken);
  if (response.status === 401) {
    authToken = await refreshAccessToken(apiBase);
    response = await request(authToken);
    if (response.status === 401) {
      await chrome.storage.local.remove('authToken');
      throw new Error(SESSION_EXPIRED);
    }
  }
  return response;
}
const preparedImages = new Map();
let lastImageAt = 0;
// Verify the action's own target, not unrelated page mutations or later pointer events.
function sameCaptureScene(actual, expected) {
  if (!actual || !expected || actual.target_visible === false) return false;
  const keys = ['document_id', 'url', 'scroll_x', 'scroll_y', 'width', 'height', 'target_rect', 'target_state'];
  return keys.every(key => JSON.stringify(actual[key]) === JSON.stringify(expected[key]));
}
async function captureActionImage(event, sender) {
  const missing = reason => ({ image: null, status: reason, captured_at: null });
  if (!event?.capture_context) return missing('unverified');
  const maxAge = 5000;
  if (Date.now() - event.timestamp > maxAge) return missing('expired');
  // Chrome allows at most two captures per second. Queue rather than discard rapid clicks.
  const delay = Math.max(0, 550 - (Date.now() - lastImageAt));
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  if (Date.now() - event.timestamp > maxAge) return missing('expired');
  const expected = event.capture_context;
  const probe = () => chrome.tabs.sendMessage(sender.tab.id, { action: 'CAPTURE_CONTEXT', capture_id: event.capture_id });
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId: sender.tab.windowId });
    if (tab?.id !== sender.tab.id) return missing('tab_changed');
    const before = await probe();
    if (!sameCaptureScene(before, expected)) return missing('page_changed');
    lastImageAt = Date.now();
    const image = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'jpeg', quality: 85 });
    const after = await probe();
    const [active] = await chrome.tabs.query({ active: true, windowId: sender.tab.windowId });
    if (active?.id !== sender.tab.id || !sameCaptureScene(after, expected)) return missing('page_changed');
    return { image, status: 'captured', captured_at: Date.now() };
  } catch { return missing('capture_failed'); }
}
async function prepareCapture(event, sender) {
  const state = await chrome.storage.local.get(['isRecording', 'isPaused']);
  if (!state.isRecording || state.isPaused || !sender.tab || !event?.capture_id) return;
  for (const [key,value] of preparedImages) if (Date.now() - value.time > 6000) preparedImages.delete(key);
  preparedImages.set(event.capture_id, { tab: sender.tab.id, time: Date.now(), result: await captureActionImage(event, sender) });
}

chrome.runtime.onInstalled.addListener(() => {
  configureSidePanel();
  enqueue(async () => {
    const current = await chrome.storage.local.get(null);
    const defaults = { isRecording: false, isPaused: false, recordedSteps: [],
      apiBase: DEFAULT_API_BASE, authToken: null };
    const missing = Object.fromEntries(Object.entries(defaults).filter(([key]) => current[key] === undefined));
    await chrome.storage.local.set(missing);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const operations = {
    PREPARE_CAPTURE: () => prepareCapture(message.eventData, sender),
    ACTION_PERFORMED: () => handleCapturedAction(message.eventData, sender),
    START_RECORDING: async () => {
      if (message.voice && sender.url?.split('?')[0] !== chrome.runtime.getURL('live-recorder.html')) throw new Error('Inicie o microfone pela extensão.');
      await startRecording(message.title, message.voice ? { ...message.voice, tabId: sender.tab?.id, targetTabId: message.targetTabId } : null); return { status: 'started' }; },
    PAUSE_RECORDING: async () => { await pauseRecording(message.pause); return { status: 'paused_updated' }; },
    FINISH_RECORDING: () => finishRecording(!!message.skipAudio),
    VOICE_FAILED: async () => {
      const { liveVoice } = await chrome.storage.local.get('liveVoice');
      if (liveVoice?.sessionId !== message.sessionId || sender.tab?.id !== liveVoice.tabId) return;
      await chrome.storage.local.set({ isPaused: true, captureError: 'Microfone parado. Finalize a gravação para salvar o áudio disponível.' });
    },
  };
  if (!operations[message.action]) return false;
  enqueue(operations[message.action]).then(
    result => sendResponse(result || { success: true }),
    error => sendResponse({ success: false, error: error.message }),
  );
  return true;
});

async function handleCapturedAction(eventData, sender) {
  const state = await chrome.storage.local.get(["isRecording", "isPaused", "recordedSteps", "liveVoice"]);
  if (!state.isRecording || state.isPaused || !sender.tab || !eventData) return;
  if (!['click', 'input'].includes(eventData.action_type || 'click')) return;
  const existing = state.recordedSteps || [];
  if (eventData.event_id && existing.some(step => step.annotations?.some(annotation =>
    annotation.type === 'capture_metadata' && annotation.event_id === eventData.event_id))) {
    return { success: true, duplicate: true };
  }
  try {
    const prepared = preparedImages.get(eventData.capture_id);
    preparedImages.delete(eventData.capture_id);
    const usePrepared = prepared && prepared.tab === sender.tab.id && Date.now() - prepared.time < 5000 && prepared.result.image;
    const result = usePrepared ? prepared.result : await captureActionImage(eventData, sender);
    const screenshotUri = result.image;
    const warning = screenshotUri ? null : 'Passo salvo sem imagem confiável (' + result.status + '). Revise no editor.';
    await chrome.storage.local.set({ captureError: warning });
    const steps = state.recordedSteps || [];

    const newStep = {
      order: steps.length + 1,
      action_type: eventData.action_type || "click",
      selector: eventData.selector || "",
      element_text: eventData.element_text || "",
      click_x: eventData.click_x,
      click_y: eventData.click_y,
      url: eventData.url || "",
      input_value: eventData.input_value || "",
      annotations: [{ type: 'capture_metadata', viewport_width: eventData.viewport_width,
        viewport_height: eventData.viewport_height, device_pixel_ratio: eventData.device_pixel_ratio, target: eventData.target,
        voice_offset: state.liveVoice ? liveOffset(state.liveVoice.clock, eventData.timestamp || Date.now()) : null,
        event_id: eventData.event_id, image_status: result.status, captured_at: result.captured_at,
        action_at: eventData.timestamp, capture_context: eventData.capture_context,
        image_phase: usePrepared ? 'pointerdown' : 'action', element_rect: eventData.element_rect }],
      screenshot_base64: screenshotUri,
      text: eventData.action_type === "click" 
        ? `Clique em ${eventData.element_text || "no elemento indicado"}`
        : `Preencha o campo ${eventData.element_text || ""}`,
      timestamp: eventData.timestamp || Date.now(),
    };

    steps.push(newStep);
    await chrome.storage.local.set({ recordedSteps: steps });

    // Atualiza badge de contagem na extensão
    chrome.action.setBadgeText({ text: steps.length.toString() });
    chrome.action.setBadgeBackgroundColor({ color: "#7426ca" });
  } catch (err) {
    console.error("Erro ao registrar passo:", err);
    await chrome.storage.local.set({ captureError: "Não foi possível salvar o passo: " + err.message });
    throw err;
  }
}

async function startRecording(title, voice = null) {
  preparedImages.clear();
  const { playback } = await chrome.storage.local.get("playback");
  if (playback) {
    let existingTab;
    try { existingTab = await chrome.tabs.get(playback.tabId); } catch {}
    if (existingTab) throw new Error("Encerre o tutorial ativo antes de gravar. Use o botão Encerrar tutorial abaixo.");
    await chrome.storage.local.remove('playback');
  }
  const { isRecording: alreadyRecording } = await chrome.storage.local.get('isRecording');
  if (alreadyRecording) throw new Error('Já existe uma gravação ativa. Finalize antes de começar outra.');
  const tab = voice ? await chrome.tabs.get(voice.targetTabId) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab?.id || !/^https?:\/\//i.test(tab.url || '')) {
    throw new Error('Abra o site que deseja gravar (por exemplo, o LinkedIn) antes de iniciar.');
  }
  try {
    let ready;
    try { ready = await chrome.tabs.sendMessage(tab.id, { action: 'RECORDER_READY' }); } catch {}
    if (!ready?.ready) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['targets.js', 'content.js'] });
      ready = await chrome.tabs.sendMessage(tab.id, { action: 'RECORDER_READY' });
    }
    if (!ready?.ready) throw new Error('Capturador indisponível.');
  } catch {
    throw new Error('Não foi possível ativar o capturador nesta aba. Recarregue o site e tente novamente.');
  }
  await chrome.storage.local.set({
    isRecording: true,
    isPaused: false,
    guideTitle: title || "Novo Guia Gravado",
    recordedSteps: [],
    pendingGuideId: null,
    pendingStepsUploaded: false,
    liveVoice: voice ? { sessionId: voice.sessionId, tabId: voice.tabId, clock: { startedAt: voice.startedAt, pauses: [], pausedAt: null } } : null,
    captureError: null,
  });
  chrome.action.setBadgeText({ text: "0" });
  chrome.action.setBadgeBackgroundColor({ color: "#b4233f" });
}

async function pauseRecording(pause) {
  const { liveVoice, pendingStepsUploaded } = await chrome.storage.local.get(['liveVoice', 'pendingStepsUploaded']);
  if (!pause && (pendingStepsUploaded || liveVoice?.frozen)) throw new Error('A gravação já foi finalizada. Tente salvar novamente ou finalize sem narração.');
  if (liveVoice) {
    const response = await voiceCommand(liveVoice, 'pause', { pause });
    await chrome.storage.local.set({ liveVoice: { ...liveVoice, clock: response.clock } });
  }
  await chrome.storage.local.set({ isPaused: pause });
  if (pause) {
    chrome.action.setBadgeText({ text: "PAUS" });
    chrome.action.setBadgeBackgroundColor({ color: "#946000" });
  } else {
    const { recordedSteps } = await chrome.storage.local.get(["recordedSteps"]);
    chrome.action.setBadgeText({ text: (recordedSteps?.length || 0).toString() });
    chrome.action.setBadgeBackgroundColor({ color: "#7426ca" });
  }
}

async function finishRecording(skipAudio = false) {
  if (skipAudio) {
    const { liveVoice } = await chrome.storage.local.get('liveVoice');
    if (liveVoice) await voiceCommand(liveVoice, 'abort').catch(() => {});
    await chrome.storage.local.set({ liveVoice: null });
  }
  await pauseRecording(true);
  const data = await chrome.storage.local.get([
    "recordedSteps",
    "guideTitle",
    "apiBase",
    "authToken",
    "pendingGuideId",
    "pendingStepsUploaded",
    "liveVoice",
  ]);

  const apiBase = data.apiBase || DEFAULT_API_BASE;
  const steps = data.recordedSteps || [];

  if (steps.length === 0) {
    await stopAndReset();
    return { success: false, error: "Nenhum passo gravado." };
  }


  try {
    if (data.liveVoice) {
      const frozen = await voiceCommand(data.liveVoice, 'freeze');
      await chrome.storage.local.set({ liveVoice: { ...data.liveVoice, frozen: true } });
      let previousOffset = 0;
      steps.forEach((step, index) => {
        const metadata = step.annotations?.find(annotation => annotation.type === 'capture_metadata');
        const offset = Math.min(frozen.duration, Math.max(previousOffset, metadata?.voice_offset || 0));
        step.annotations = (step.annotations || []).filter(annotation => annotation.type !== 'live_narration');
        step.annotations.push({ type: 'live_narration', start: previousOffset,
          end: index === steps.length - 1 ? frozen.duration : offset });
        previousOffset = offset;
      });
    }
    // 1. Cria o Guia no backend
    let guideId = data.pendingGuideId;
    if (!guideId) {
    const guideRes = await recordingApiFetch(apiBase, '/guides/', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: data.guideTitle || "Novo Guia Gravado",
        description: `Gravado automaticamente com ${steps.length} passos.`,
      }),
    });

    if (!guideRes.ok) {
      const errText = await guideRes.text();
      throw new Error(`Falha ao criar guia na API (${guideRes.status}): ${errText}`);
    }

    const createdGuide = await guideRes.json();
    guideId = createdGuide.id;
    await chrome.storage.local.set({ pendingGuideId: guideId });
    }

    // 2. Envia os passos para o guia
    if (!data.pendingStepsUploaded) {
    const stepsRes = await recordingApiFetch(apiBase, `/guides/${guideId}/bulk-steps/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ steps }),
    });

    if (!stepsRes.ok) {
      let errDetail = "";
      try {
        const errJson = await stepsRes.json();
        errDetail = JSON.stringify(errJson);
      } catch (e) {
        errDetail = "Resposta inválida do servidor.";
      }
      throw new Error(`Falha ao enviar passos (${stepsRes.status}): ${errDetail}`);
    }

    const upload = await stepsRes.json();
    if (upload.errors?.length || upload.created_count !== steps.length) {
      throw new Error('O servidor não confirmou todos os passos. A gravação foi preservada.');
    }

    await chrome.storage.local.set({ pendingStepsUploaded: true });
    }
    if (data.liveVoice) {
      let { authToken: token } = await chrome.storage.local.get('authToken');
      if (!token) token = await refreshAccessToken(apiBase);
      try { await voiceCommand(data.liveVoice, 'upload', { guideId, apiBase, token }); }
      catch (error) {
        if (error.status !== 401) throw error;
        token = await refreshAccessToken(apiBase);
        try { await voiceCommand(data.liveVoice, 'upload', { guideId, apiBase, token }); }
        catch (retryError) {
          if (retryError.status === 401) { await chrome.storage.local.remove('authToken'); throw new Error(SESSION_EXPIRED); }
          throw retryError;
        }
      }
    }

    // 3. Reseta o gravador
    await stopAndReset();

    if (data.liveVoice?.tabId) await chrome.tabs.remove(data.liveVoice.tabId).catch(() => {});
    // 4. Abre o editor no Angular
    const editorUrl = `${DEFAULT_FRONTEND_BASE}/guides/${guideId}${data.liveVoice ? "?generate=voice" : ""}`;
    chrome.tabs.create({ url: editorUrl });

    return { success: true, guideId, editorUrl };
  } catch (err) {
    console.error("Erro ao enviar dados para a API:", err);
    return { success: false, error: err.message };
  }
}

async function stopAndReset() {
  const { liveVoice } = await chrome.storage.local.get('liveVoice');
  if (liveVoice) await voiceCommand(liveVoice, 'abort').catch(() => {});
  await chrome.storage.local.set({
    isRecording: false,
    isPaused: false,
    liveVoice: null,
    pendingStepsUploaded: false,
    pendingGuideId: null,
    recordedSteps: [],
  });
  chrome.action.setBadgeText({ text: "" });
}

chrome.tabs.onRemoved?.addListener(tabId => {
  enqueue(async () => {
    const { liveVoice, isRecording } = await chrome.storage.local.get(['liveVoice','isRecording']);
    if (isRecording && liveVoice?.tabId === tabId) {
      await chrome.storage.local.set({ isPaused: true, captureError: 'A aba do microfone foi fechada. O áudio não salvo foi perdido; os passos foram preservados. Use Finalizar sem narração.' });
      await chrome.action.setBadgeText({ text: 'PAUS' });
    }
  });
});

chrome.runtime.onMessageExternal?.addListener((message,sender,respond)=>{
  if(message.action!=='CONNECT_ACCOUNT')return false;
  let origin;try{origin=new URL(sender.url).origin;}catch{return false;}
  if(!['http://localhost:4200','http://127.0.0.1:4200'].includes(origin))return false;
  enqueue(async()=>{
    if(typeof message.access!=='string' || typeof message.refresh!=='string')throw new Error('Sessão inválida. Entre novamente.');
    const state=await chrome.storage.local.get(['apiBase','isRecording','playback']);
    if(state.isRecording || state.playback)throw new Error('Finalize a gravação ou o tutorial antes de trocar de conta.');
    const response=await fetch((state.apiBase || DEFAULT_API_BASE)+'/auth/me/',{headers:{Authorization:'Bearer '+message.access}});
    if(!response.ok)throw new Error('Sua sessão expirou. Entre novamente.');
    const user=await response.json();
    await chrome.storage.local.set({authToken:message.access,refreshToken:message.refresh,currentUser:user.username});
    return {success:true};
  }).then(respond,error=>respond({success:false,error:error.message}));
  return true;
});
