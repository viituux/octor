/** Captura no site: observa ações confiáveis do usuário durante a gravação e envia identidade/contexto ao worker; não reproduz cliques do procedimento. */
(() => {
if (globalThis.__autoGuideRecorderLoaded) return;
globalThis.__autoGuideRecorderLoaded = true;
chrome.runtime.onMessage.addListener(/* Recebe o evento do navegador/Chrome e delega ao fluxo registrado neste contexto. | @param message — mensagem recebida entre os contextos da extensão. | @param sender — contexto remetente da mensagem Chrome. | @param respond — valor recebido do contexto chamador. | @returns boolean. */ (message, sender, respond) => {
  if (message.action === 'RECORDING_STATE' && sender.id === chrome.runtime.id) {
    receivedStateUpdate = true;
    applyRecordingState(message.state);
    return false;
  }
  if (message.action === 'CAPTURE_CONTEXT') {
    const target = message.capture_id ? captureTargets.get(message.capture_id) : captureTarget;
    if (message.hide_hover) {
      pendingScreenshots++;
      hideHover();
      if (!hoverOutline || document.hidden) {
        respond(target ? captureContext(target) : null);
        return false;
      }
      // Aguarda a pintura sem o contorno antes de liberar a captura da aba.
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        respond(target ? captureContext(target) : null);
      }));
      return true;
    }
    respond(target ? captureContext(target) : null); return false;
  }
  if (message.action === 'RESTORE_RECORDING_HOVER' && sender.id === chrome.runtime.id) {
    pendingScreenshots = Math.max(0, pendingScreenshots - 1);
    if (pointer && !pendingScreenshots) scheduleHover();
    return false;
  }
  if (message.action === 'RECORDER_READY') {
    respond({ ready: !!globalThis.AutoGuideTargets });
    return false;
  }
});
/**
 * OCTOR Content Script
 * Captura eventos de clique, digitação e navegação sem interferir no fluxo do usuário.
 */

let /* boolean: habilita a captura de ações na sessão atual. */ isRecording = false;
let /* boolean: suspende o registro sem finalizar o procedimento. */ isPaused = false;
const documentId = Math.random().toString(36).slice(2) + Date.now();
let interaction = 0;
let domRevision = 0;
let captureTarget = null;
const /* Map: alvos originais retidos temporariamente para validar a cena da captura. */ captureTargets = new Map();
/**
 * Associa o identificador de captura ao alvo original em um conjunto de tamanho limitado.
 * @param id — identificador do recurso ou elemento alvo.
 * @param target — valor recebido do contexto chamador.
 * @returns void/undefined; efeitos nas operações do corpo.
 */
function rememberCapture(id, target) {
  captureTargets.set(id, target);
  if (captureTargets.size > 100) captureTargets.delete(captureTargets.keys().next().value);
}
const captureObserver = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => { domRevision++; }) : null;
captureObserver?.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
/**
 * Descreve documento, viewport e alvo para verificar a correspondência da imagem capturada.
 * @param target — valor recebido do contexto chamador (padrão: captureTarget).
 * @returns objeto com document_id, interaction, dom_revision, target_visible, target_state, target_rect, url, scroll_x.
 */
function captureContext(target = captureTarget) {
  if (captureObserver?.takeRecords().length) domRevision++;
  const rect = target?.getBoundingClientRect();
  const center = rect && typeof document.elementFromPoint === 'function' ? document.elementFromPoint(rect.left + rect.width/2, rect.top + rect.height/2) : null;
  const targetVisible = !!rect && rect.width > 0 && rect.height > 0 && target?.isConnected !== false && (!center || center === target || target.contains?.(center));
  return { document_id: documentId, interaction, dom_revision: domRevision,
    target_visible: targetVisible,
    target_state: target ? {tag: target.tagName, label: getElementLabel(target), disabled: !!target.disabled,
      checked: !!target.checked, expanded: target.getAttribute('aria-expanded')} : null,
    target_rect: rect ? [rect.left, rect.top, rect.width, rect.height] : null, url: window.location.href,
    scroll_x: window.scrollX || 0, scroll_y: window.scrollY || 0,
    width: window.innerWidth, height: window.innerHeight };
}

let hoverHost, hoverOutline, hoverListeners, hoverFrame;
let pointer = null;
let pendingScreenshots = 0;

// Âncoras sem destino podem envolver seções inteiras sem representar um link.
const recordingControls = AutoGuideTargets.actionable.replace(',a,', ',a[href],');

function recordingTarget(raw) {
  if (!(raw instanceof Element)) return null;
  let target = raw;
  for (let candidate = raw; candidate; candidate = candidate.parentElement) {
    if (!candidate.matches?.(recordingControls)) continue;
    const bounds = candidate.getBoundingClientRect();
    const wrapsPage = bounds.width >= window.innerWidth * 0.65 &&
      bounds.height >= window.innerHeight * 0.30;
    if (!wrapsPage) target = candidate;
    break;
  }

  // Ícones SVG podem entregar um path como alvo; use o ícone completo.
  if (target === raw && raw.ownerSVGElement) target = raw.ownerSVGElement;
  if (target === document.body || target === document.documentElement) return null;
  const bounds = target.getBoundingClientRect();
  if (bounds.width >= window.innerWidth * 0.65 && bounds.height >= window.innerHeight * 0.30) return null;
  return target.type === 'password' || target.getAttribute('autocomplete') === 'current-password'
    ? null : target;
}

function hideHover() {
  if (hoverOutline) hoverOutline.style.visibility = 'hidden';
}

function clearPointer() {
  pointer = null;
  hideHover();
}

function scheduleHover() {
  if (hoverFrame != null) return;
  hoverFrame = window.requestAnimationFrame(() => {
    hoverFrame = null;
    if (!pointer || pendingScreenshots) { hideHover(); return; }
    const target = recordingTarget(pointer.target || document.elementFromPoint(pointer.x, pointer.y));
    const rect = target?.getBoundingClientRect();
    if (!rect?.width || !rect.height) { hideHover(); return; }

    if (!hoverHost?.isConnected) {
      hoverHost = document.createElement('div');
      hoverHost.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important';
      const shadow = hoverHost.attachShadow({mode:'closed'});
      hoverOutline = document.createElement('div');
      hoverOutline.style.cssText = 'position:absolute;pointer-events:none;box-sizing:border-box;outline:2px solid #38bdf8;outline-offset:-2px;border-radius:3px;box-shadow:inset 0 0 0 3px #0f172a70';
      shadow.append(hoverOutline);
      document.documentElement.append(hoverHost);
    }
    Object.assign(hoverOutline.style, {
      left: rect.left+'px', top: rect.top+'px', width: rect.width+'px',
      height: rect.height+'px', visibility: 'visible'
    });
  });
}

function syncHoverListeners() {
  if (!isRecording || isPaused) {
    hoverListeners?.abort();
    hoverListeners = null;
    if (hoverFrame != null) window.cancelAnimationFrame(hoverFrame);
    hoverFrame = null;
    clearPointer();
    hoverHost?.remove();
    hoverHost = hoverOutline = null;
    return;
  }
  if (hoverListeners || !window.addEventListener) return;

  hoverListeners = new AbortController();
  const options = {signal:hoverListeners.signal, capture:true, passive:true};
  document.addEventListener('pointermove', event => {
    if (!event.isTrusted || event.pointerType === 'touch') return;
    pointer = {x:event.clientX, y:event.clientY, target:event.target};
    scheduleHover();
  }, options);
  // A saída de um filho (por exemplo, um SVG) não significa saída da página.
  document.documentElement?.addEventListener('pointerleave', clearPointer,
    {signal:hoverListeners.signal, passive:true});
  window.addEventListener('pagehide', clearPointer, options);
  function recheckPointer() {
    if (pointer) pointer.target = null;
    scheduleHover();
  }
  window.addEventListener('scroll', recheckPointer, options);
  window.addEventListener('resize', recheckPointer, options);
}

function applyRecordingState(state) {
  isRecording = !!state?.isRecording;
  isPaused = !!state?.isPaused;
  syncHoverListeners();
}

let receivedStateUpdate = false;
chrome.runtime.sendMessage({ action: 'GET_RECORDING_STATE' }, state => {
  if (chrome.runtime.lastError || receivedStateUpdate) return;
  applyRecordingState(state);
});

// Gera seletor CSS legível e único
/**
 * Delega a construção do seletor ao resolvedor compartilhado de alvos.
 * @param el — valor recebido do contexto chamador.
 * @returns resultado de AutoGuideTargets.selector(...).
 */
function getCssSelector(el) {
  return AutoGuideTargets.selector(el);
}

// Extrai rótulo ou texto visível do elemento
/**
 * Obtém o texto de identificação usado para descrever a ação capturada.
 * @param el — valor recebido do contexto chamador.
 * @returns string; resultado de aria.trim(...); resultado de title.trim(...); resultado de placeholder.trim(...); resultado de el.value.trim(...).
 */
function getElementLabel(el) {
  if (!el) return "";
  
  // Prioridade: aria-label, title, placeholder, texto interno
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();

  const title = el.getAttribute("title");
  if (title) return title.trim();

  const placeholder = el.getAttribute("placeholder");
  if (placeholder) return placeholder.trim();

  if (el.tagName === "BUTTON" || ["button", "submit", "reset"].includes(el.type)) {
    if (el.value) return el.value.trim();
  }

  const innerText = el.innerText || el.textContent;
  if (innerText) {
    // Retorna primeiras poucas palavras
    return innerText.trim().slice(0, 60).replace(/\s+/g, " ");
  }

  return el.tagName.toLowerCase();
}

// Prepara a imagem no início do clique sem impedir a ação nativa do site.
let prepared = null;
let eventSequence = 0;
const /* WeakSet: campos realmente editados pelo usuário, excluindo alterações automáticas do site. */ editedFields = new WeakSet();
const /* WeakMap: último valor confirmado de cada campo para ignorar commits duplicados. */ savedValues = new WeakMap();
/**
 * Produz um identificador para distinguir as ações registradas no documento.
 * @returns expressão calculada/comparada no corpo.
 */
function eventId() { return documentId + ':event:' + (++eventSequence); }
document.addEventListener('input', /* Trata evento input no contexto deste módulo; o estado e as verificações do handler delimitam quando a ação é aceita. | @param e — evento ou falha recebida, conforme o tipo declarado e o uso no corpo. | @returns void/undefined; efeitos nas operações do corpo. */ e => {
  if (isRecording && !isPaused && e.isTrusted && e.target instanceof Element) editedFields.add(e.target);
}, true);
document.addEventListener('pointerdown', /* Trata evento pointerdown no contexto deste módulo; o estado e as verificações do handler delimitam quando a ação é aceita. | @param e — evento ou falha recebida, conforme o tipo declarado e o uso no corpo. | @returns void/undefined. */ e => {
  if (!isRecording || isPaused || !e.isTrusted || !(e.target instanceof Element)) return;
  const target = recordingTarget(e.target);
  if (!target) return;
  interaction++;
  captureTarget = target;
  prepared = { id: documentId + ':' + interaction, target, time: Date.now() };
  rememberCapture(prepared.id, target);
  chrome.runtime.sendMessage({ action: 'PREPARE_CAPTURE', eventData: {
    capture_id: prepared.id, capture_context: captureContext(), timestamp: Date.now(), url: window.location.href
  }}).catch(() => {});
}, true);

// Captura de Cliques
document.addEventListener(
  "click",
  /**
   * Trata evento click no contexto deste módulo; o estado e as verificações do handler delimitam quando a ação é aceita.
   * @param e — evento ou falha recebida, conforme o tipo declarado e o uso no corpo.
   * @returns void/undefined.
   */
  (e) => {
    if (!isRecording || isPaused || !e.isTrusted) return;

    const target = recordingTarget(e.target);
    if (!target) return;

    const matching = prepared && prepared.target === target && Date.now() - prepared.time < 1500;
    const captureId = matching ? prepared.id : documentId + ':click:' + interaction + ':' + eventSequence;
    rememberCapture(captureId, target);
    if (!matching) interaction++;
    prepared = null;
    captureTarget = target;
    const rect = target.getBoundingClientRect();
    const payload = {
      action: "ACTION_PERFORMED",
      eventData: {
        action_type: "click",
        event_id: eventId(),
        capture_id: captureId,
        capture_context: captureContext(),
        selector: getCssSelector(target),
        target: AutoGuideTargets.describe(target),
        element_text: getElementLabel(target),
        click_x: Math.round(e.clientX),
        click_y: Math.round(e.clientY),
        element_rect: {
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        url: window.location.href,
        timestamp: Date.now(),
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight,
        device_pixel_ratio: window.devicePixelRatio,
      },
    };

    chrome.runtime.sendMessage(payload);
  },
  true // Modo captura para garantir registro antes de descarregar a página
);

// Captura de Alterações de Input
document.addEventListener(
  "change",
  /**
   * Trata evento change no contexto deste módulo; o estado e as verificações do handler delimitam quando a ação é aceita.
   * @param e — evento ou falha recebida, conforme o tipo declarado e o uso no corpo.
   * @returns void/undefined.
   */
  (e) => {
    if (!isRecording || isPaused || !e.isTrusted) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.type === "password" || ["current-password", "new-password", "one-time-code", "cc-number", "cc-csc"].includes(target.getAttribute("autocomplete"))) return;
    if (!["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

    // Só confirma campos editados pelo usuário e ignora o mesmo valor já registrado.
    if (!editedFields.has(target)) return;
    editedFields.delete(target);
    const value = ['checkbox', 'radio'].includes(target.type) ? String(target.checked) : String(target.value || '');
    if (savedValues.has(target) && savedValues.get(target) === value) return;
    savedValues.set(target, value);
    interaction++;
    captureTarget = target;
    const captureId = documentId + ':input:' + interaction;
    rememberCapture(captureId, target);
    const payload = {
      action: "ACTION_PERFORMED",
      eventData: {
        action_type: "input",
        capture_id: captureId,
        event_id: eventId(),
        capture_context: captureContext(),
        selector: getCssSelector(target),
        target: AutoGuideTargets.describe(target),
        element_text: getElementLabel(target),
        url: window.location.href,
        timestamp: Date.now(),
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight,
        device_pixel_ratio: window.devicePixelRatio,
      },
    };

    chrome.runtime.sendMessage(payload);
  },
  true
);

})();
