/** Painel lateral: apresenta a sessão de gravação e envia comandos ao worker, que mantém o estado entre navegações. */
const API_BASE = "http://localhost:8000/api";

document.addEventListener("DOMContentLoaded", /* Trata evento DOMContentLoaded no contexto deste módulo; o estado e as verificações do handler delimitam quando a ação é aceita. | @returns void/undefined; efeitos nas operações do corpo. */ async () => {
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

  document.getElementById('btnBrowserLogin').addEventListener('click', /* Trata evento click no contexto deste módulo; o estado e as verificações do handler delimitam quando a ação é aceita. | @returns void/undefined; efeitos nas operações do corpo. */ () => {
    chrome.tabs.create({url:'http://localhost:4200/login?extension='+chrome.runtime.id});
  });
  // Login
  btnLogin.addEventListener("click", /* Trata evento click no contexto deste módulo; o estado e as verificações do handler delimitam quando a ação é aceita. | @returns void/undefined. | @throws Error nos ramos que rejeitam a operação; blocos catch mantêm o tratamento existente. */ async () => {
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
      const current = await chrome.storage.local.get(["isRecording", "currentUser", "playback"]);
      if ((current.isRecording || current.playback) && current.currentUser !== username) throw new Error("Finalize a gravação ou tutorial antes de trocar de conta.");
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
  btnLogout.addEventListener("click", /* Trata evento click no contexto deste módulo; o estado e as verificações do handler delimitam quando a ação é aceita. | @returns void/undefined. */ async () => {
    const active=await chrome.storage.local.get(["isRecording","playback"]);
    if(active.isRecording || active.playback){showRecorderError("Finalize a gravação ou tutorial antes de sair.");return;}
    await chrome.storage.local.remove(["authToken", "refreshToken", "currentUser"]);
    recorderSection.classList.add("hidden");
    authSection.classList.remove("hidden");
  });

  /**
   * Apresenta a falha de gravação sem apagar os dados que ainda podem ser finalizados.
   * @param message — mensagem recebida entre os contextos da extensão.
   * @param kind — valor recebido do contexto chamador (padrão: 'error').
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  function showRecorderError(message, kind = 'error') {
    recorderMsg.textContent = message;
    recorderMsg.className = 'error-msg ' + kind;
  }
  /**
   * Consulta o estado da gravação para sincronizar os controles do painel lateral.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  async function refreshRecorder() {
    const state = await chrome.storage.local.get(['isRecording', 'isPaused', 'recordedSteps', 'guideTitle', 'captureError', 'liveVoice']);
    updateRecordingUI(state.isRecording, state.isPaused, state.recordedSteps?.length || 0, state.guideTitle);
    if (state.captureError) showRecorderError(state.captureError);
    document.getElementById('voiceStatus').textContent = state.liveVoice ? 'Microfone vinculado à gravação. Mantenha a aba de áudio aberta.' : '';
    document.getElementById('btnFinishSilent').classList.toggle('hidden', !state.liveVoice);
  }
  document.getElementById('btnStopTutorial').addEventListener('click', /* Trata evento click no contexto deste módulo; o estado e as verificações do handler delimitam quando a ação é aceita. | @returns void/undefined; efeitos nas operações do corpo. */ async () => {
    await chrome.storage.local.remove('playback');
    recorderMsg.classList.add('hidden');
    document.getElementById('btnStopTutorial').classList.add('hidden');
  });
  const { playback } = await chrome.storage.local.get('playback');
  document.getElementById('btnStopTutorial').classList.toggle('hidden', !playback);
  await refreshRecorder();

  btnStart.addEventListener('click', /* Trata evento click no contexto deste módulo; o estado e as verificações do handler delimitam quando a ação é aceita. | @returns void/undefined. | @throws Error nos ramos que rejeitam a operação; blocos catch mantêm o tratamento existente. */ async () => {
    recorderMsg.classList.add('hidden');
    btnStart.disabled = true;
    try {
      if (document.getElementById('withMicrophone').checked) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!/^https?:\/\//i.test(tab?.url || '')) throw new Error('Abra o site que deseja gravar antes de iniciar.');
        const url = chrome.runtime.getURL('live-recorder.html') + '?tab=' + tab.id + '&title=' + encodeURIComponent(guideTitleInput.value.trim() || 'Novo Guia');
        await chrome.tabs.create({ url });
        showRecorderError('Na aba que abriu, autorize o microfone para começar.', 'info'); return;
      }
      const result = await chrome.runtime.sendMessage({ action: 'START_RECORDING', title: guideTitleInput.value.trim() || 'Novo Guia' });
      if (result?.status !== 'started') throw new Error(result?.error || 'O gravador não respondeu. Recarregue a extensão.');
    } catch (error) { showRecorderError(error.message); }
    finally { btnStart.disabled = false; await refreshRecorder(); }
  });

  btnPause.addEventListener('click', /* Trata evento click no contexto deste módulo; o estado e as verificações do handler delimitam quando a ação é aceita. | @returns void/undefined; efeitos nas operações do corpo. | @throws Error nos ramos que rejeitam a operação; blocos catch mantêm o tratamento existente. */ async () => {
    try {
      const { isPaused } = await chrome.storage.local.get('isPaused');
      const response = await chrome.runtime.sendMessage({ action: 'PAUSE_RECORDING', pause: !isPaused });
      if (response?.error) throw new Error(response.error);
      await refreshRecorder();
    } catch (error) { showRecorderError(error.message); }
  });
  /**
   * Finaliza o estado ocupado da operação e apresenta o resultado conforme o chamador.
   * @param skipAudio — opção de finalizar sem enviar o áudio pendente (padrão: false).
   * @returns void/undefined; efeitos nas operações do corpo.
   * @throws Error nos ramos que rejeitam a operação; blocos catch mantêm o tratamento existente.
   */
  async function finish(skipAudio = false) {
    btnFinish.disabled = true;
    document.getElementById('btnFinishSilent').disabled = true;
    btnFinish.textContent = 'Salvando...';
    try {
      const response = await chrome.runtime.sendMessage({ action: 'FINISH_RECORDING', skipAudio });
      if (!response?.success) throw new Error(response?.error || 'Não foi possível salvar.');
      await refreshRecorder();
      showRecorderError('Guia salvo. O editor foi aberto em uma nova aba.', 'success');
    } catch (error) { showRecorderError(error.message); }
    finally {
      btnFinish.disabled = false; btnFinish.textContent = '✅ Finalizar';
      document.getElementById('btnFinishSilent').disabled = false;
      await refreshRecorder();
    }
  }
  btnFinish.addEventListener('click', /* Trata evento click no contexto deste módulo; o estado e as verificações do handler delimitam quando a ação é aceita. | @returns resultado de finish(...). */ () => finish());
  document.getElementById('btnFinishSilent').addEventListener('click', /* Trata evento click no contexto deste módulo; o estado e as verificações do handler delimitam quando a ação é aceita. | @returns void/undefined; efeitos nas operações do corpo. */ () => {
    if (confirm('Salvar o guia sem a gravação de voz?')) finish(true);
  });

  /**
   * Aplica o estado confirmado da gravação aos controles e mensagens do painel.
   * @param isRecording — valor recebido do contexto chamador.
   * @param isPaused — valor recebido do contexto chamador.
   * @param stepCount — valor recebido do contexto chamador.
   * @param title — título do procedimento ou equipe.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
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
  chrome.storage.onChanged.addListener(/* Recebe o evento do navegador/Chrome e delega ao fluxo registrado neste contexto. | @param changes — valor recebido do contexto chamador. | @param area — valor recebido do contexto chamador. | @returns void/undefined; efeitos nas operações do corpo. */ (changes, area) => {
    if (area === "local") {
      if (changes.authToken || changes.currentUser) {
        chrome.storage.local.get(['authToken','currentUser']).then(state=>{
          authSection.classList.toggle('hidden',!!state.authToken);
          recorderSection.classList.toggle('hidden',!state.authToken);
          userInfo.textContent=state.currentUser?'@'+state.currentUser:'';
          refreshRecorder();
        });
      }
      if (changes.playback) document.getElementById('btnStopTutorial').classList.toggle('hidden', !changes.playback.newValue);
      if (changes.captureError?.newValue) showRecorderError(changes.captureError.newValue);
      if (changes.isRecording || changes.isPaused || changes.liveVoice) refreshRecorder();
      if (changes.recordedSteps) {
        stepCounter.textContent = changes.recordedSteps.newValue?.length || 0;
      }
    }
  });
});
