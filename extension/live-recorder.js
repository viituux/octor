(() => {
  const startButton = document.getElementById('start');
  const stopButton = document.getElementById('stop');
  const status = document.getElementById('status');
  const params = new URLSearchParams(location.search);
  const sessionId = crypto.randomUUID();
  let stream, recorder, audio, limitTimer, uploadTimer;
  let chunks = [], bytes = 0, startedAt = 0, stoppedAt = 0, pausedAt = null, pauses = [], canClose = false;
  let stopPromise = null;
  const clock = () => ({ startedAt, stoppedAt, pausedAt, pauses });
  function release() { stream?.getTracks().forEach(track => track.stop()); clearTimeout(limitTimer); }
  function elapsed() {
    const end = stoppedAt || Date.now();
    return Math.max(0, (end - startedAt - pauses.reduce((sum, p) => sum + p.end - p.start, 0) - (pausedAt ? end - pausedAt : 0)) / 1000);
  }
  async function stopAudio() {
    if (stopPromise) return stopPromise;
    if (!recorder) throw new Error('Microfone não iniciado.');
    stoppedAt = Date.now();
    stopPromise = new Promise((resolve, reject) => {
      recorder.onstop = () => {
        audio = new Blob(chunks, { type: recorder.mimeType }); chunks = []; release();
        if (!audio.size || audio.size > 60 * 1024 * 1024) { reject(new Error('Áudio vazio ou maior que 60 MB.')); return; }
        status.textContent = 'Microfone parado. O áudio está pronto para salvar com o guia.';
        stopButton.hidden = true; resolve({ duration: elapsed(), clock: clock() });
      };
      if (recorder.state === 'inactive') recorder.onstop();
      else recorder.stop();
    });
    return stopPromise;
  }
  startButton.addEventListener('click', async () => {
    startButton.disabled = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('Formato de áudio não suportado.');
      chunks = []; bytes = 0; audio = null; pausedAt = null; pauses = []; stoppedAt = 0; stopPromise = null;
      recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
      recorder.ondataavailable = event => {
        if (event.data.size) { chunks.push(event.data); bytes += event.data.size; }
        if (bytes > 58 * 1024 * 1024 && recorder.state !== 'inactive' && !stopPromise) stopAtLimit();
      };
      recorder.onerror = () => { release(); status.textContent = 'O microfone falhou. Finalize ou salve o guia sem narração.'; chrome.runtime.sendMessage({ action: 'VOICE_FAILED', sessionId }).catch(() => {}); };
      startedAt = Date.now(); recorder.start(1000);
      const result = await chrome.runtime.sendMessage({ action: 'START_RECORDING', title: params.get('title') || 'Novo Guia',
        targetTabId: Number(params.get('tab')), voice: { sessionId, startedAt } });
      if (result?.status !== 'started') throw new Error(result?.error || 'Não foi possível iniciar a captura.');
      startButton.hidden = true; stopButton.hidden = false;
      status.textContent = 'Microfone ativo. Pode narrar enquanto faz o procedimento no site.';
      limitTimer = setTimeout(stopAtLimit, 30 * 60 * 1000);
      await chrome.tabs.update(Number(params.get('tab')), { active: true });
    } catch (error) {
      release(); if (recorder?.state !== 'inactive' && recorder) recorder.stop();
      status.textContent = error.name === 'NotAllowedError' ? 'Permita o microfone e tente novamente.' : error.message;
      startButton.disabled = false;
    }
  });
  async function stopAtLimit() {
    try { await stopAudio(); } catch (error) { status.textContent = error.message; }
    chrome.runtime.sendMessage({ action: 'VOICE_FAILED', sessionId }).catch(() => {});
  }
  stopButton.addEventListener('click', stopAtLimit);
  window.addEventListener('beforeunload', event => { if (recorder && !canClose) { event.preventDefault(); event.returnValue = ''; } });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.target !== 'live-narration' || message.sessionId !== sessionId) return false;
    (async () => {
      if (message.command === 'pause') {
        if (!message.pause && recorder?.state === 'inactive') throw new Error('O áudio já foi finalizado. Salve o guia para começar outra gravação.');
        if (recorder?.state === 'recording' && message.pause) { recorder.pause(); pausedAt = Date.now(); }
        else if (recorder?.state === 'paused' && !message.pause) {
          pauses.push({ start: pausedAt, end: Date.now() }); pausedAt = null; recorder.resume();
        }
        return { success: true, clock: clock() };
      }
      if (message.command === 'freeze') return { success: true, ...await stopAudio() };
      if (message.command === 'abort') { await stopAudio().catch(() => {}); canClose = true; return { success: true }; }
      if (message.command === 'upload') {
        await stopAudio();
        const data = new FormData();
        const extension = audio.type.includes('mp4') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : 'webm';
        data.append('capture_audio', audio, 'capture.' + extension);
        const controller = new AbortController(); uploadTimer = setTimeout(() => controller.abort(), 60000);
        try {
          const response = await fetch(message.apiBase + '/guides/' + message.guideId + '/', {
            method: 'PATCH', headers: { Authorization: 'Bearer ' + message.token }, body: data, signal: controller.signal
          });
          if (!response.ok) {
            const error = new Error('Falha ao salvar narração (' + response.status + '). Tente finalizar novamente.');
            error.status = response.status;
            throw error;
          }
          canClose = true; status.textContent = 'Narração salva. Esta aba pode ser fechada.';
          return { success: true };
        } finally { clearTimeout(uploadTimer); }
      }
      throw new Error('Comando de microfone inválido.');
    })().then(respond, error => respond({ success: false, error: error.message, status: error.status }));
    return true;
  });
})();
