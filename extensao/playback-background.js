/** Sessão Me guie: centraliza as mensagens em uma fila, limita o controle à aba vinculada e navega para as URLs registradas; não executa botões do site. */

// O tutorial pertence a uma aba e seu progresso persiste durante mudanças de página.
let /* Promise: fila central das alterações da sessão de tutorial entre mensagens concorrentes. */ playbackQueue = Promise.resolve();
/**
 * Aceita somente URLs HTTP/HTTPS dos passos; não restringe por si só o domínio de destino.
 * @param value — valor recebido pelo controle ou transformação.
 * @returns url.href.
 * @throws Error nos ramos que rejeitam a operação; blocos catch mantêm o tratamento existente.
 */
function safePlaybackUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL de tutorial inválida.');
  return url.href;
}
/**
 * Valida a origem/aba e processa início, consulta, avanço e encerramento da sessão de tutorial.
 * @param message — mensagem recebida entre os contextos da extensão.
 * @param sender — contexto remetente da mensagem Chrome.
 * @returns objeto com success; objeto com playback; objeto com completed.
 * @throws Error, exceção do fluxo nos ramos que rejeitam a operação; blocos catch mantêm o tratamento existente.
 */
async function handlePlayback(message, sender) {
  if (!sender.tab) throw new Error('Aba não identificada.');
  if (message.action === 'START_PLAYBACK') {
    const origin = new URL(sender.url || sender.tab.url).origin;
    if (!['http://localhost:4200', 'http://127.0.0.1:4200'].includes(origin)) {
      throw new Error('Inicie o tutorial pelo editor OCTOR.');
    }
    const state = await chrome.storage.local.get(['isRecording', 'playback']);
    if (state.isRecording) throw new Error('Finalize a gravação antes de iniciar um tutorial.');
    let existingTab = null;
    if (state.playback?.tabId) {
      try { existingTab = await chrome.tabs.get(state.playback.tabId); } catch {
        await chrome.storage.local.remove('playback');
      }
    }
    if (!Array.isArray(message.steps) || !message.steps.length || message.steps.length > 1000) {
      throw new Error('Este guia não possui passos válidos.');
    }
    const steps = message.steps.map((step, index) => {
      let url; try { url = safePlaybackUrl(step.url); } catch { throw new Error('O passo ' + (index+1) + ' tem uma URL inválida. Grave esse passo novamente.'); }
      return {
      url, selector: String(step.selector || '').slice(0, 4000),
      element_text: String(step.element_text || '').slice(0, 200),
      target: step.target && typeof step.target === 'object' ? Object.fromEntries(['tag','label','role','name','test_id'].map(key => [key, String(step.target[key] || '').slice(0, 200)])) : null,
      text: String(step.text || step.element_text || 'Siga a instrução deste passo.').slice(0, 10000),
    }; });
    let completionUrl=null;
    if(message.completionUrl){const candidate=new URL(message.completionUrl);if(candidate.origin!==origin || !/^\/trainings\/\d+$/.test(candidate.pathname))throw new Error('Destino de treinamento inválido.');completionUrl=candidate.href;}
    const tab = existingTab || await chrome.tabs.create({ url: 'about:blank' });
    await chrome.storage.local.set({ playback: { tabId: tab.id, title: String(message.title || 'Tutorial'), steps, index: 0, ...(completionUrl?{completionUrl}:{}) } });
    try {
      await chrome.tabs.update(tab.id, { url: steps[0].url, active: true });
      if (chrome.windows?.update && tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
    }
    catch (error) { await chrome.storage.local.remove('playback'); throw error; }
    return { success: true };
  }
  const { playback } = await chrome.storage.local.get('playback');
  if (!playback || playback.tabId !== sender.tab.id) return { playback: null };
  if (message.action === 'GET_PLAYBACK') return { playback };
  if (message.action === 'STOP_PLAYBACK') {
    await chrome.storage.local.remove('playback');
    return { success: true };
  }
  if (message.action === 'MOVE_PLAYBACK') {
    if (message.index !== playback.index) return { playback };
    const next = playback.index + (message.direction === -1 ? -1 : 1);
    if (next >= playback.steps.length) {
      if(playback.completionUrl)await chrome.tabs.update(playback.tabId,{url:playback.completionUrl,active:true});
      await chrome.storage.local.remove('playback');
      return { completed: true };
    }
    playback.index = Math.max(0, next);
    const previous = next - (message.direction === -1 ? -1 : 1);
    await chrome.storage.local.set({ playback });
    const url = playback.steps[playback.index].url;
    try {
      if (safePlaybackUrl(sender.url || sender.tab.url) !== url) await chrome.tabs.update(playback.tabId, { url, active: true });
    } catch (error) {
      playback.index = Math.max(0, previous);
      await chrome.storage.local.set({ playback });
      throw new Error('Não foi possível abrir a página do passo. Tente Próximo novamente.');
    }
    return { playback };
  }
}
chrome.runtime.onMessage.addListener(/* Recebe o evento do navegador/Chrome e delega ao fluxo registrado neste contexto. | @param message — mensagem recebida entre os contextos da extensão. | @param sender — contexto remetente da mensagem Chrome. | @param sendResponse — callback Chrome para confirmar a mensagem mantendo o canal aberto quando necessário. | @returns boolean. */ (message, sender, sendResponse) => {
  if (!['START_PLAYBACK','GET_PLAYBACK','MOVE_PLAYBACK','STOP_PLAYBACK'].includes(message.action)) return false;
  const operation = playbackQueue.then(() => handlePlayback(message, sender));
  playbackQueue = operation.catch(() => {});
  operation.then(sendResponse, error => sendResponse({ success: false, error: error.message }));
  return true;
});
chrome.tabs.onRemoved.addListener(/* Recebe o evento do navegador/Chrome e delega ao fluxo registrado neste contexto. | @param tabId — valor recebido do contexto chamador. | @returns void/undefined; efeitos nas operações do corpo. */ tabId => {
  playbackQueue = playbackQueue.then(async () => {
    const { playback } = await chrome.storage.local.get('playback');
    if (playback?.tabId === tabId) await chrome.storage.local.remove('playback');
  }).catch(console.error);
});

// A mensagem externa permite iniciar pela aplicação pareada após expirar um contexto antigo de content script.
chrome.runtime.onMessageExternal?.addListener(/* Recebe o evento do navegador/Chrome e delega ao fluxo registrado neste contexto. | @param message — mensagem recebida entre os contextos da extensão. | @param sender — contexto remetente da mensagem Chrome. | @param respond — valor recebido do contexto chamador. | @returns boolean. */ (message, sender, respond) => {
  if (message.action !== 'START_PLAYBACK') return false;
  const operation = playbackQueue.then(() => handlePlayback(message, sender));
  playbackQueue = operation.catch(() => {});
  operation.then(respond, error => respond({ success: false, error: error.message }));
  return true;
});
