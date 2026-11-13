/** Sessão Me guie: centraliza as mensagens em uma fila, limita o controle à aba vinculada e navega para as URLs registradas; não executa botões do site. */

// O tutorial pertence a uma aba e seu progresso persiste durante mudanças de página.
let /* Promise: fila central das alterações da sessão de tutorial entre mensagens concorrentes. */ playbackQueue = Promise.resolve();
// Inclua aqui apenas origens HTTPS dedicadas à homologação, incluindo a porta se houver.
const PLAYBACK_TEST_ORIGINS = new Set(globalThis.OctorEnvironment?.playbackTestOrigins ?? []);
const PLAYBACK_RULE_IDS = [7101, 7102, 7103];
const PLAYBACK_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object',
  'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'webtransport', 'webbundle', 'other',
];

function isTestDestination(url) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || (url.protocol === 'https:' && PLAYBACK_TEST_ORIGINS.has(url.origin));
}

function trainingNarration(narration, sourcePath) {
  const training = /^\/trainings\/(\d+)\/?$/.exec(sourcePath);
  const path = narration?.path;
  if (/^\/guides\/\d+\/?$/.test(sourcePath) && typeof path === 'string'
      && /^\/api\/guides\/media\/(?:narrations|capture_audio)\/[a-z0-9_./%-]+$/i.test(path)
      && !path.includes('..')) {
    const {start, end} = narration.range || {};
    const range = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start ? {start, end} : null;
    return narration.range && !range ? null : {path, range};
  }
  if (!training || typeof path !== 'string') return null;
  const prefix = '/api/trainings/' + training[1] + '/versions/';
  if (!path.startsWith(prefix) || !/^\d+\/(?:assets\/[a-f0-9-]+|legacy-media\/\d+\/(?:narration_url|live_narration_url))\/$/.test(path.slice(prefix.length))) return null;
  const {start, end} = narration.range || {};
  const range = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start ? {start, end} : null;
  if (narration.range && !range) return null;
  return {path, range};
}

async function protectPlaybackTab(tabId, origins) {
  const escaped = origins.map(origin => origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const scope = { tabIds: [tabId], resourceTypes: PLAYBACK_RESOURCE_TYPES };
  // O GitHub entrega CSS e JavaScript pelo CDN oficial. A exceção vale só para arquivos estáticos.
  const githubAssets = origins.includes('https://github.com') ? [{
    id: PLAYBACK_RULE_IDS[2], priority: 2, action: {type: 'allow'},
    condition: {
      tabIds: [tabId], regexFilter: '^https://github[.]githubassets[.]com/',
      resourceTypes: ['stylesheet', 'script', 'image', 'font'], requestMethods: ['get'],
    },
  }] : [];
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: PLAYBACK_RULE_IDS,
    addRules: [
      ...githubAssets,
      { id: PLAYBACK_RULE_IDS[0], priority: 1, action: { type: 'block' }, condition: { ...scope, urlFilter: '*' } },
      { id: PLAYBACK_RULE_IDS[1], priority: 2, action: { type: 'allow' },
        condition: { ...scope, regexFilter: '^(' + escaped.join('|') + ')/', isUrlFilterCaseSensitive: true } },
    ],
  });
}

async function clearPlaybackProtection() {
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: PLAYBACK_RULE_IDS });
}
/**
 * Aceita somente URLs HTTP/HTTPS sem credenciais embutidas.
 * @param value — valor recebido pelo controle ou transformação.
 * @returns url.href.
 * @throws Error nos ramos que rejeitam a operação; blocos catch mantêm o tratamento existente.
 */
function safePlaybackUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('URL de tutorial inválida.');
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
    const source = new URL(sender.url || sender.tab.url);
    const origin = source.origin;
    if (!(globalThis.OctorEnvironment?.appOrigins ?? ['http://localhost:4200', 'http://127.0.0.1:4200']).includes(origin)) {
      throw new Error('Inicie o tutorial pelo editor OCTOR.');
    }
    const state = await chrome.storage.local.get(['isRecording', 'playback', 'manualCapture']);
    if (state.manualCapture?.active) throw new Error('Interrompa a coleta do manual antes de iniciar o tutorial.');
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
      const destination = new URL(url);
      if (!isTestDestination(destination)) {
        throw new Error(`O passo ${index + 1} usa ${destination.origin}, que ainda não foi autorizado para testes no Me guie. Informe esse endereço ao responsável pela homologação ou acompanhe o passo pelas capturas no OCTOR.`);
      }
      return {
      url, selector: String(step.selector || '').slice(0, 4000),
      element_text: String(step.element_text || '').slice(0, 200),
      target: step.target && typeof step.target === 'object' ? Object.fromEntries(['tag','label','role','name','test_id'].map(key => [key, String(step.target[key] || '').slice(0, 200)])) : null,
      text: String(step.text || step.element_text || 'Siga a instrução deste passo.').slice(0, 10000),
      narration: trainingNarration(step.narration, source.pathname),
    }; });
    let completionUrl=null;
    if(message.completionUrl){const candidate=new URL(message.completionUrl);if(candidate.origin!==origin || !/^\/trainings\/\d+$/.test(candidate.pathname))throw new Error('Destino de treinamento inválido.');completionUrl=candidate.href;}
    const tab = existingTab || await chrome.tabs.create({ url: 'about:blank' });
    // A referência fica na aplicação autenticada. O site orientado recebe somente as instruções do tutorial.
    const referenceUrl = /^\/(guides|trainings)\/\d+\/?$/.test(source.pathname) ? origin + source.pathname : null;
    try {
      // A regra é aplicada antes de abrir o primeiro endereço e cobre redirecionamentos e chamadas da aba.
      const origins = [...new Set(steps.map(step => new URL(step.url).origin))];
      if (completionUrl && !origins.includes(origin)) origins.push(origin);
      await protectPlaybackTab(tab.id, origins);
      await chrome.storage.local.set({ playback: { tabId: tab.id, title: String(message.title || 'Tutorial'), steps, index: 0, referenceUrl, protectedSession: true, ...(completionUrl?{completionUrl}:{}) } });
      await chrome.tabs.update(tab.id, { url: steps[0].url, active: true });
      if (chrome.windows?.update && tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
    }
    catch {
      await chrome.storage.local.remove('playback');
      await clearPlaybackProtection().catch(console.error);
      throw new Error('Não foi possível iniciar o Me guie com a proteção de navegação. Use as capturas no OCTOR.');
    }
    return { success: true };
  }
  const { playback } = await chrome.storage.local.get('playback');
  if (!playback || playback.tabId !== sender.tab.id) return { playback: null };
  if (message.action === 'STOP_PLAYBACK') {
    await chrome.storage.local.remove('playback');
    return { success: true };
  }
  // Regras de sessão sobrevivem à suspensão do worker, mas não ao fechamento do navegador.
  const rules = playback.protectedSession ? await chrome.declarativeNetRequest.getSessionRules() : [];
  const protectedTab = PLAYBACK_RULE_IDS.slice(0, 2).every(id => rules.some(rule => rule.id === id && rule.condition.tabIds?.includes(playback.tabId)));
  if (!protectedTab) {
    await chrome.storage.local.remove('playback');
    return { playback: null };
  }
  const currentOrigin = new URL(sender.url || sender.tab.url).origin;
  if (!playback.steps.some(step => new URL(step.url).origin === currentOrigin)) return { playback: null };
  if (message.action === 'GET_PLAYBACK') return { playback };
  if (message.action === 'OPEN_PLAYBACK_PAGE') {
    if (message.index !== playback.index) return { playback };
    await chrome.tabs.update(playback.tabId, { url: playback.steps[playback.index].url, active: true });
    return { success: true };
  }
  if (message.action === 'OPEN_PLAYBACK_REFERENCE') {
    if (!playback.referenceUrl || message.index !== playback.index) throw new Error('A referência deste passo está indisponível.');
    const url = new URL(playback.referenceUrl);
    url.searchParams.set('referenceStep', String(playback.index + 1));
    await chrome.tabs.create({ url: url.href, active: true });
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
  if (!['START_PLAYBACK','GET_PLAYBACK','MOVE_PLAYBACK','STOP_PLAYBACK','OPEN_PLAYBACK_REFERENCE','OPEN_PLAYBACK_PAGE'].includes(message.action)) return false;
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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.playback?.oldValue || changes.playback.newValue) return;
  playbackQueue = playbackQueue.then(async () => {
    const { playback } = await chrome.storage.local.get('playback');
    if (!playback) await clearPlaybackProtection();
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
