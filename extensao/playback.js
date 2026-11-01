/** Apresentação Me guie: injeta instruções/destaque, acompanha o layout e deixa a execução das ações para o usuário. Próximo pode pular uma etapa; não comprova sua execução. */
(() => {
  const /* string[]: origens locais aceitas para a ponte do editor; não equivalem a uma lista de sites de treinamento permitidos. */ EDITOR_ORIGINS = ['http://localhost:4200', 'http://127.0.0.1:4200'];
  // Esta ponte aceita conteúdo do guia apenas das origens locais verificadas; não recebe credenciais por esse contrato.
  if (EDITOR_ORIGINS.includes(location.origin)) {
    window.addEventListener('message', /* Trata evento message no contexto deste módulo; o estado e as verificações do handler delimitam quando a ação é aceita. | @param event — evento do navegador ou ação capturada. | @returns void/undefined. */ async event => {
      if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'AUTOGUIDE_START') return;
      try {
        const result = await chrome.runtime.sendMessage({ action: 'START_PLAYBACK', title: event.data.title, steps: event.data.steps });
        window.postMessage({ type: 'AUTOGUIDE_RESULT', requestId: event.data.requestId, extensionId: chrome.runtime.id, ...result }, location.origin);
      } catch (error) {
        window.postMessage({ type: 'AUTOGUIDE_RESULT', requestId: event.data.requestId, success: false, error: error.message }, location.origin);
      }
    });
  }

  let host, shadow, panel, highlight, status, heading, instruction, previous, next, progress, stepLabel;
  let session = null, target = null, observer = null, frame = null, /* boolean: bloqueia submissões repetidas enquanto a operação atual aguarda resposta. */ busy = false;
  let lastStep = null, scrolledTarget = null, lastLayoutCheck = 0;
  /**
   * Remove a apresentação do guia e os recursos visuais registrados pela sessão atual.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  function cleanup() {
    observer?.disconnect(); observer = null;
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('resize', schedule);
    host?.remove(); host = null; session = null; target = null; lastStep = null; scrolledTarget = null;
  }
  /**
   * Mantém um ciclo de atualização visual para reposicionar o destaque com o layout da página.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  function schedule() {
    if (!frame) frame = requestAnimationFrame(/* Atualiza o alvo durante o ciclo visual sem recriar o painel em cada frame. | @param time — valor recebido do contexto chamador. | @returns void/undefined. */ function track(time) {
      frame = null;
      if (!host || !session) return;
      if (time - lastLayoutCheck > 100) { lastLayoutCheck = time; locate(); }
      frame = requestAnimationFrame(track);
    });
  }
  /**
   * Confere a URL e resolve o alvo; oculta o destaque quando não há correspondência única utilizável.
   * @returns void/undefined.
   */
  function locate() {
    if (!session || !host) return;
    const step = session.steps[session.index];
    if (location.href !== step.url) {
      target = null; highlight.hidden = true;
      status.textContent = 'Abra a página deste passo para continuar.';
      return;
    }
    const result = AutoGuideTargets.resolve(step);
    target = result.element;
    if (target && scrolledTarget !== target) {
      scrolledTarget = target;
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    }
    const rect = target?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      highlight.hidden = true;
      status.textContent = result.ambiguous ? 'Mais de um elemento corresponde ao passo. Abra o menu correto ou tente novamente.' : 'Aguardando o elemento. Abra o menu necessário, tente novamente ou pule este passo.';
      return;
    }
    highlight.hidden = false;
    Object.assign(highlight.style, { left: `${rect.left - 4}px`, top: `${rect.top - 4}px`, width: `${rect.width + 8}px`, height: `${rect.height + 8}px` });
    status.textContent = 'Execute a ação e clique em Próximo.';
    // Procura espaço junto ao alvo para o painel; se faltar espaço, limita a posição à área visível.
    const gap = 18, panelWidth = panel.offsetWidth, panelHeight = panel.offsetHeight;
    let left = rect.right + gap;
    let top = rect.top;
    if (left + panelWidth > innerWidth - 16) left = rect.left - gap - panelWidth;
    if (left < 16) {
      left = innerWidth - panelWidth - 16;
      top = rect.bottom + gap;
      if (top + panelHeight > innerHeight - 16) top = rect.top - panelHeight - gap;
    }
    panel.style.left = Math.max(16, Math.min(innerWidth-panelWidth-16,left)) + 'px';
    panel.style.top = Math.max(16, Math.min(innerHeight-panelHeight-16,top)) + 'px';
    panel.style.right = 'auto'; panel.style.bottom = 'auto';
  }
  /**
   * Cria um controle textual do painel e associa o handler da ação solicitada.
   * @param label — texto apresentado pelo controle.
   * @param handler — função chamada ao acionar o controle.
   * @returns node.
   */
  function button(label, handler) {
    const node = document.createElement('button'); node.textContent = label;
    node.addEventListener('click', handler); return node;
  }
  /**
   * Monta o painel em Shadow DOM e registra o acompanhamento de layout e navegação.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  function mount() {
    host = document.createElement('div');
    host.setAttribute('data-autoguide-player', '');
    host.style.cssText = 'all:initial;position:fixed;inset:0;margin:0;padding:0;border:0;width:100vw;height:100vh;background:transparent;overflow:visible;z-index:2147483647;pointer-events:none';
    host.setAttribute('popover', 'manual');
    shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = (globalThis.AutoGuideTheme || '') + `:host{font-family:var(--font-ui,system-ui);color:var(--text-main,#292337)}*{box-sizing:border-box}.highlight{position:fixed;border:3px solid var(--primary,#7426ca);border-radius:8px;box-shadow:0 0 0 5px #7426ca33,0 0 0 9999px #15102655;pointer-events:none}.panel{position:fixed;right:16px;bottom:16px;width:min(360px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:white;border:1px solid var(--border-color,#e5deed);border-radius:16px;padding:20px;box-shadow:0 12px 48px #0003;pointer-events:auto;font:14px/1.5 var(--font-ui,system-ui);color:var(--text-main,#292337)}h2{font-size:16px;margin:0 0 8px}p{white-space:pre-wrap;overflow-wrap:anywhere}.status{color:var(--text-muted,#70647d);font-size:12px}.progress{height:4px;background:var(--primary-soft,#f0e7fa);border-radius:8px;overflow:hidden;margin:12px 0}.progress>div{height:100%;background:var(--primary,#7426ca);transition:width .2s}.step-label{color:var(--primary,#7426ca);font-size:11px;font-weight:700;letter-spacing:.8px}.controls{display:flex;gap:8px;flex-wrap:wrap}button{font:inherit;cursor:pointer;border:1px solid var(--border-color,#e5deed);background:var(--primary-soft,#f0e7fa);color:var(--primary,#7426ca);border-radius:8px;padding:8px 10px}button:disabled{opacity:.5;cursor:default}button:focus-visible{outline:3px solid var(--focus-ring,#b88cdd);outline-offset:2px}[hidden]{display:none!important}`;
    highlight = document.createElement('div'); highlight.className = 'highlight';
    highlight.setAttribute('aria-hidden', 'true');
    panel = document.createElement('section'); panel.className = 'panel';
    panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'Tutorial OCTOR');
    heading = document.createElement('h2');
    instruction = document.createElement('p');
    instruction.setAttribute('aria-live', 'polite');
    status = document.createElement('p'); status.className = 'status';
    const controls = document.createElement('div'); controls.className = 'controls';
    previous = button('Voltar', () => move(-1));
    next = button('Próximo', () => move(1));
    controls.append(previous, next, button('Tentar novamente', () => { target = null; scrolledTarget = null; locate(); target?.scrollIntoView({ block: 'center', inline: 'nearest' }); }),
      button('Abrir página', () => { if (session) location.assign(session.steps[session.index].url); }),
      button('Encerrar', async () => {
        try { await chrome.runtime.sendMessage({ action: 'STOP_PLAYBACK' }); cleanup(); }
        catch { status.textContent = 'Não foi possível encerrar. Tente novamente.'; }
      }));
    stepLabel = document.createElement('div'); stepLabel.className = 'step-label';
    const track = document.createElement('div'); track.className = 'progress';
    progress = document.createElement('div'); track.append(progress);
    panel.append(stepLabel, heading, track, instruction, status, controls);
    shadow.append(style, highlight, panel);
    document.documentElement.append(host);
    // A camada superior evita que transformações dos ancestrais do site desloquem as coordenadas fixas.
    try { host.showPopover?.(); } catch {}
    schedule();
    observer = new MutationObserver(records => {
      if (records.some(record => record.target !== host)) schedule();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
  }
  /**
   * Aplica o estado do tutorial ao painel e ao destaque do passo atual.
   * @param playback — valor recebido do contexto chamador.
   * @returns void/undefined.
   */
  function render(playback) {
    if (!playback) { cleanup(); return; }
    if (session?.index !== playback.index) scrolledTarget = null;
    session = playback;
    if (!host) mount();
    const step = playback.steps[playback.index];
    heading.textContent = playback.title;
    stepLabel.textContent = 'PASSO ' + (playback.index+1) + ' DE ' + playback.steps.length;
    progress.style.width = ((playback.index+1)/playback.steps.length*100) + '%';
    instruction.textContent = step.text;
    previous.disabled = playback.index === 0 || busy;
    next.disabled = busy;
    next.textContent = playback.index === playback.steps.length - 1 ? 'Concluir' : 'Próximo / Pular';
    locate();
    if (lastStep !== playback.index) {
      lastStep = playback.index;
      target?.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
  }
  /**
   * Solicita avanço/retorno à extensão com proteção contra reentrada e confirmação de conclusão.
   * @param direction — sentido de avanço/retorno no tutorial.
   * @returns void/undefined.
   * @throws Error nos ramos que rejeitam a operação; blocos catch mantêm o tratamento existente.
   */
  async function move(direction) {
    if (busy || !session) return;
    busy = true; previous.disabled = true; next.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({ action: 'MOVE_PLAYBACK', index: session.index, direction });
      if (result.error) throw new Error(result.error);
      if (result.completed) {
        cleanup();
        // A confirmação de conclusão permanece visível até o usuário fechar o painel.
        session = { title: 'Tutorial concluído', index: 0, steps: [{ text: 'Você chegou ao final do tutorial.', url: location.href, selector: '' }] };
        mount(); heading.textContent = 'Tutorial concluído'; instruction.textContent = 'Você chegou ao final do tutorial.';
        status.textContent = ''; highlight.hidden = true;
        const close = button('Fechar', cleanup); panel.replaceChildren(heading, instruction, close);
      } else render(result.playback);
    } catch (error) { if (status) status.textContent = error.message; }
    finally { busy = false; if (session && next?.isConnected) { previous.disabled = session.index === 0; next.disabled = false; } }
  }
  chrome.storage.onChanged.addListener(/* Recebe o evento do navegador/Chrome e delega ao fluxo registrado neste contexto. | @param changes — valor recebido do contexto chamador. | @param area — valor recebido do contexto chamador. | @returns void/undefined; efeitos nas operações do corpo. */ (changes, area) => {
    if (area === 'local' && changes.playback) refresh();
  });
  /**
   * Consulta o estado persistido do tutorial e atualiza ou remove sua apresentação.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  async function refresh() {
    try { const result = await chrome.runtime.sendMessage({ action: 'GET_PLAYBACK' }); render(result.playback); }
    catch { cleanup(); }
  }
  // A consulta periódica detecta navegação SPA; o observer acompanha elementos renderizados depois.
  let lastUrl = location.href;
  setInterval(() => { if (location.href !== lastUrl) { lastUrl = location.href; scrolledTarget = null; schedule(); } }, 500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
  else refresh();
})();
