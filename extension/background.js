/**
 * AutoGuide Background Service Worker (Manifest V3)
 * Gerencia o estado da sessão de gravação, tira screenshots e envia os passos para a API.
 */

const DEFAULT_API_BASE = "http://localhost:8000/api";
const DEFAULT_FRONTEND_BASE = "http://localhost:4200";

// Inicializa estado
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    isRecording: false,
    isPaused: false,
    recordedSteps: [],
    apiBase: DEFAULT_API_BASE,
    authToken: null,
  });
});

// Listener de mensagens do Content Script e Popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ACTION_PERFORMED") {
    handleCapturedAction(message.eventData);
  } else if (message.action === "START_RECORDING") {
    startRecording(message.title);
    sendResponse({ status: "started" });
  } else if (message.action === "PAUSE_RECORDING") {
    pauseRecording(message.pause);
    sendResponse({ status: "paused_updated" });
  } else if (message.action === "FINISH_RECORDING") {
    finishRecording().then((result) => sendResponse(result));
    return true; // resposta assíncrona
  }
});

async function handleCapturedAction(eventData) {
  const state = await chrome.storage.local.get(["isRecording", "isPaused", "recordedSteps"]);
  if (!state.isRecording || state.isPaused) return;

  try {
    // Captura screenshot da aba visível em JPEG otimizado
    const screenshotUri = await chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 80 });
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
    chrome.action.setBadgeBackgroundColor({ color: "#2563EB" });
  } catch (err) {
    console.error("Erro ao capturar screenshot:", err);
  }
}

async function startRecording(title) {
  await chrome.storage.local.set({
    isRecording: true,
    isPaused: false,
    guideTitle: title || "Novo Guia Gravado",
    recordedSteps: [],
  });
  chrome.action.setBadgeText({ text: "0" });
  chrome.action.setBadgeBackgroundColor({ color: "#EF4444" });
}

async function pauseRecording(pause) {
  await chrome.storage.local.set({ isPaused: pause });
  if (pause) {
    chrome.action.setBadgeText({ text: "PAUS" });
    chrome.action.setBadgeBackgroundColor({ color: "#F59E0B" });
  } else {
    const { recordedSteps } = await chrome.storage.local.get(["recordedSteps"]);
    chrome.action.setBadgeText({ text: (recordedSteps?.length || 0).toString() });
    chrome.action.setBadgeBackgroundColor({ color: "#2563EB" });
  }
}

async function finishRecording() {
  const data = await chrome.storage.local.get([
    "recordedSteps",
    "guideTitle",
    "apiBase",
    "authToken",
  ]);

  const apiBase = data.apiBase || DEFAULT_API_BASE;
  const token = data.authToken;
  const steps = data.recordedSteps || [];

  if (steps.length === 0) {
    await stopAndReset();
    return { success: false, error: "Nenhum passo gravado." };
  }

  if (!token) {
    return { success: false, error: "Usuário não autenticado na extensão. Faça login no popup." };
  }

  try {
    // 1. Cria o Guia no backend
    const guideRes = await fetch(`${apiBase}/guides/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
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
    const guideId = createdGuide.id;

    // 2. Envia os passos para o guia
    const stepsRes = await fetch(`${apiBase}/guides/${guideId}/bulk-steps/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ steps }),
    });

    if (!stepsRes.ok) {
      let errDetail = "";
      try {
        const errJson = await stepsRes.json();
        errDetail = JSON.stringify(errJson);
      } catch (e) {
        errDetail = await stepsRes.text();
      }
      throw new Error(`Falha ao enviar passos (${stepsRes.status}): ${errDetail}`);
    }

    // 3. Reseta o gravador
    await stopAndReset();

    // 4. Abre o editor no Angular
    const editorUrl = `${DEFAULT_FRONTEND_BASE}/guides/${guideId}`;
    chrome.tabs.create({ url: editorUrl });

    return { success: true, guideId, editorUrl };
  } catch (err) {
    console.error("Erro ao enviar dados para a API:", err);
    return { success: false, error: err.message };
  }
}

async function stopAndReset() {
  await chrome.storage.local.set({
    isRecording: false,
    isPaused: false,
    recordedSteps: [],
  });
  chrome.action.setBadgeText({ text: "" });
}
