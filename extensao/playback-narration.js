// O áudio arquivado é carregado apenas no painel da extensão, com a sessão pareada.
const narrationPanel = document.getElementById('playbackNarration');
const narrationTitle = document.getElementById('playbackNarrationTitle');
const narrationStatus = document.getElementById('playbackNarrationStatus');
const narrationAudio = document.getElementById('playbackNarrationAudio');
const narrationRetry = document.getElementById('btnRetryPlaybackNarration');
const narrationApi = new URL(globalThis.OctorEnvironment.apiBase).origin;
let narrationRequest;
let narrationObjectUrl;
let narrationRange;

async function refreshPlaybackNarration() {
  narrationRequest?.abort();
  const request = new AbortController();
  narrationRequest = request;
  narrationAudio.pause();
  narrationAudio.removeAttribute('src');
  narrationAudio.load();
  narrationAudio.classList.add('hidden');
  narrationRetry.classList.add('hidden');
  narrationStatus.textContent = '';
  if (narrationObjectUrl) URL.revokeObjectURL(narrationObjectUrl);
  narrationObjectUrl = undefined;
  narrationRange = null;

  try {
    const {playback} = await chrome.storage.local.get('playback');
    if (request.signal.aborted) return;
    const narration = playback?.steps[playback.index]?.narration;
    narrationPanel.classList.toggle('hidden', !narration);
    if (!narration) return;
    narrationTitle.textContent = 'Narração do passo ' + (playback.index + 1);
    narrationStatus.textContent = 'Carregando narração…';
    const url = new URL(narration.path, narrationApi);
    if (url.origin !== narrationApi) throw new Error();

    const fetchAudio = async () => {
      const {authToken} = await chrome.storage.local.get('authToken');
      return fetch(url, {
        headers: authToken ? {Authorization: 'Bearer ' + authToken} : {},
        redirect: 'error',
        signal: request.signal,
      });
    };
    let response = await fetchAudio();
    if (response.status === 401 && !request.signal.aborted) {
      const renewed = await chrome.runtime.sendMessage({action: 'REFRESH_PLAYBACK_AUDIO_SESSION'});
      if (renewed?.success) response = await fetchAudio();
    }
    if (!response.ok) throw new Error();
    const audio = await response.blob();
    if (request.signal.aborted) return;
    if (!audio.size || !(audio.type.startsWith('audio/') || audio.type === 'video/webm')) throw new Error();
    narrationRange = narration.range;
    narrationObjectUrl = URL.createObjectURL(audio);
    narrationAudio.src = narrationObjectUrl;
    narrationAudio.classList.remove('hidden');
    narrationStatus.textContent = '';
  } catch {
    if (request.signal.aborted) return;
    narrationStatus.textContent = 'Não foi possível carregar a narração. Confira a conexão da sua conta na extensão.';
    narrationRetry.classList.remove('hidden');
  }
}

narrationAudio.addEventListener('loadedmetadata', () => {
  if (narrationRange) narrationAudio.currentTime = narrationRange.start;
});
narrationAudio.addEventListener('play', () => {
  if (narrationRange && (narrationAudio.currentTime < narrationRange.start || narrationAudio.currentTime >= narrationRange.end)) {
    narrationAudio.currentTime = narrationRange.start;
  }
});
narrationAudio.addEventListener('timeupdate', () => {
  if (!narrationRange) return;
  if (narrationAudio.currentTime < narrationRange.start) narrationAudio.currentTime = narrationRange.start;
  if (narrationAudio.currentTime >= narrationRange.end) narrationAudio.pause();
});
narrationRetry.addEventListener('click', refreshPlaybackNarration);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.playback) void refreshPlaybackNarration();
});
void refreshPlaybackNarration();
