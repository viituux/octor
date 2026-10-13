const API_BASE = "http://localhost:8000/api";

document.addEventListener("DOMContentLoaded", async () => {
  const authSection = document.getElementById("authSection");
  const recorderSection = document.getElementById("recorderSection");
  const statusBadge = document.getElementById("statusBadge");
  const stepCounter = document.getElementById("stepCounter");
  const setupControls = document.getElementById("setupControls");
  const activeControls = document.getElementById("activeControls");
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");
  const btnStart = document.getElementById("btnStart");
  const btnPause = document.getElementById("btnPause");
  const btnFinish = document.getElementById("btnFinish");
  const guideTitleInput = document.getElementById("guideTitle");
  const userInfo = document.getElementById("userInfo");
  const authError = document.getElementById("authError");
  const recorderMsg = document.getElementById("recorderMsg");

  // Checa autenticação e estado inicial
  const data = await chrome.storage.local.get([
    "authToken",
    "currentUser",
    "isRecording",
    "isPaused",
    "recordedSteps",
    "guideTitle",
  ]);

  if (!data.authToken) {
    authSection.classList.remove("hidden");
    recorderSection.classList.add("hidden");
  } else {
    authSection.classList.add("hidden");
    recorderSection.classList.remove("hidden");
    if (data.currentUser) {
      userInfo.textContent = `@${data.currentUser}`;
    }
    updateRecordingUI(data.isRecording, data.isPaused, data.recordedSteps?.length || 0, data.guideTitle);
  }

  // Login
  btnLogin.addEventListener("click", async () => {
    authError.classList.add("hidden");
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    if (!username || !password) {
      authError.textContent = "Informe usuário e senha.";
      authError.classList.remove("hidden");
      return;
    }

    try {
      btnLogin.disabled = true;
      btnLogin.textContent = "Entrando...";
      const res = await fetch(`${API_BASE}/auth/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        throw new Error("Credenciais inválidas ou erro no servidor.");
      }

      const loginData = await res.json();
      await chrome.storage.local.set({
        authToken: loginData.access,
        refreshToken: loginData.refresh,
        currentUser: loginData.user?.username || username,
      });

      authSection.classList.add("hidden");
      recorderSection.classList.remove("hidden");
      userInfo.textContent = `@${username}`;
      const state = await chrome.storage.local.get(["isRecording", "isPaused", "recordedSteps", "guideTitle"]);
      updateRecordingUI(state.isRecording, state.isPaused, state.recordedSteps?.length || 0, state.guideTitle);
    } catch (err) {
      authError.textContent = err.message;
      authError.classList.remove("hidden");
    } finally {
      btnLogin.disabled = false;
      btnLogin.textContent = "Entrar";
    }
  });

  // Logout
  btnLogout.addEventListener("click", async () => {
    await chrome.storage.local.remove(["authToken", "refreshToken", "currentUser"]);
    recorderSection.classList.add("hidden");
    authSection.classList.remove("hidden");
  });

  // Iniciar Gravação
  btnStart.addEventListener("click", () => {
    const title = guideTitleInput.value.trim() || "Novo Guia";
    chrome.runtime.sendMessage({ action: "START_RECORDING", title }, () => {
      updateRecordingUI(true, false, 0, title);
    });
  });

  // Pausar / Continuar
  btnPause.addEventListener("click", async () => {
    const { isPaused } = await chrome.storage.local.get(["isPaused"]);
    const nextPaused = !isPaused;
    chrome.runtime.sendMessage({ action: "PAUSE_RECORDING", pause: nextPaused }, () => {
      chrome.storage.local.get(["recordedSteps", "guideTitle"], (st) => {
        updateRecordingUI(true, nextPaused, st.recordedSteps?.length || 0, st.guideTitle);
      });
    });
  });

  // Finalizar
  btnFinish.addEventListener("click", () => {
    recorderMsg.classList.add("hidden");
    btnFinish.disabled = true;
    btnFinish.textContent = "Enviando...";

    chrome.runtime.sendMessage({ action: "FINISH_RECORDING" }, (response) => {
      btnFinish.disabled = false;
      btnFinish.textContent = "✅ Finalizar";

      if (response && response.success) {
        window.close();
      } else {
        recorderMsg.textContent = response?.error || "Erro ao salvar guia.";
        recorderMsg.classList.remove("hidden");
      }
    });
  });

  function updateRecordingUI(isRecording, isPaused, stepCount, title) {
    stepCounter.textContent = stepCount || 0;

    if (isRecording) {
      setupControls.classList.add("hidden");
      activeControls.classList.remove("hidden");
      if (isPaused) {
        statusBadge.textContent = "Pausado";
        statusBadge.className = "status-badge paused";
        btnPause.textContent = "▶️ Continuar";
      } else {
        statusBadge.textContent = "Gravando";
        statusBadge.className = "status-badge recording";
        btnPause.textContent = "⏸️ Pausar";
      }
    } else {
      setupControls.classList.remove("hidden");
      activeControls.classList.add("hidden");
      statusBadge.textContent = "Pronto";
      statusBadge.className = "status-badge";
      if (title) guideTitleInput.value = title;
    }
  }

  // Listener para atualizar contador em tempo real se o popup estiver aberto
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.recordedSteps) {
        stepCounter.textContent = changes.recordedSteps.newValue?.length || 0;
      }
    }
  });
});
