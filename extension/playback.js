(() => {
  const EDITOR_ORIGINS = ['http://localhost:4200', 'http://127.0.0.1:4200'];
  // The bridge accepts guide content only from the local editor, never credentials.
  if (EDITOR_ORIGINS.includes(location.origin)) {
    window.addEventListener('message', async event => {
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
  let session = null, target = null, observer = null, frame = null, busy = false;
  let lastStep = null, scrolledTarget = null, lastLayoutCheck = 0;
  function cleanup() {
    observer?.disconnect(); observer = null;
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('resize', schedule);
    host?.remove(); host = null; session = null; target = null; lastStep = null; scrolledTarget = null;
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(function track(time) {
      frame = null;
      if (!host || !session) return;
      if (time - lastLayoutCheck > 100) { lastLayoutCheck = time; locate(); }
      frame = requestAnimationFrame(track);
    });
  }
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
    // Anchor beside the target without covering it; fall back to a free viewport corner.
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
  function button(label, handler) {
    const node = document.createElement('button'); node.textContent = label;
    node.addEventListener('click', handler); return node;
  }
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
    panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'Tutorial Octo');
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
    // Top layer prevents transformed page ancestors from shifting fixed coordinates.
    try { host.showPopover?.(); } catch {}
    schedule();
    observer = new MutationObserver(records => {
      if (records.some(record => record.target !== host)) schedule();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
  }
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
  async function move(direction) {
    if (busy || !session) return;
    busy = true; previous.disabled = true; next.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({ action: 'MOVE_PLAYBACK', index: session.index, direction });
      if (result.error) throw new Error(result.error);
      if (result.completed) {
        cleanup();
        // A compact completion message is shown until dismissed.
        session = { title: 'Tutorial concluído', index: 0, steps: [{ text: 'Você chegou ao final do tutorial.', url: location.href, selector: '' }] };
        mount(); heading.textContent = 'Tutorial concluído'; instruction.textContent = 'Você chegou ao final do tutorial.';
        status.textContent = ''; highlight.hidden = true;
        const close = button('Fechar', cleanup); panel.replaceChildren(heading, instruction, close);
      } else render(result.playback);
    } catch (error) { if (status) status.textContent = error.message; }
    finally { busy = false; if (session && next?.isConnected) { previous.disabled = session.index === 0; next.disabled = false; } }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.playback) refresh();
  });
  async function refresh() {
    try { const result = await chrome.runtime.sendMessage({ action: 'GET_PLAYBACK' }); render(result.playback); }
    catch { cleanup(); }
  }
  // Poll URL changes for single-page applications; observers cover late DOM rendering.
  let lastUrl = location.href;
  setInterval(() => { if (location.href !== lastUrl) { lastUrl = location.href; scrolledTarget = null; schedule(); } }, 500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
  else refresh();
})();
