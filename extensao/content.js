/** Captura no site: observa ações confiáveis do usuário durante a gravação e envia identidade/contexto ao worker; não reproduz cliques do procedimento. */
(() => {
if (globalThis.__autoGuideRecorderLoaded) return;
globalThis.__autoGuideRecorderLoaded = true;
chrome.runtime.onMessage.addListener(/* Recebe o evento do navegador/Chrome e delega ao fluxo registrado neste contexto. | @param message — mensagem recebida entre os contextos da extensão. | @param sender — contexto remetente da mensagem Chrome. | @param respond — valor recebido do contexto chamador. | @returns boolean. */ (message, sender, respond) => {
  if (message.action === 'CAPTURE_CONTEXT') {
    const target = message.capture_id ? captureTargets.get(message.capture_id) : captureTarget;
    respond(target ? captureContext(target) : null); return false;
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

// Sincroniza estado de gravação
chrome.storage.local.get(["isRecording", "isPaused"], (result) => {
  isRecording = !!result.isRecording;
  isPaused = !!result.isPaused;
});

chrome.storage.onChanged.addListener(/* Recebe o evento do navegador/Chrome e delega ao fluxo registrado neste contexto. | @param changes — valor recebido do contexto chamador. | @param area — valor recebido do contexto chamador. | @returns void/undefined; efeitos nas operações do corpo. */ (changes, area) => {
  if (area === "local") {
    if (changes.isRecording !== undefined) isRecording = changes.isRecording.newValue;
    if (changes.isPaused !== undefined) isPaused = changes.isPaused.newValue;
  }
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
  const target = e.target.closest(AutoGuideTargets.actionable) || e.target;
  if (target.type === 'password') return;
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

    const rawTarget = e.target;
    const target = rawTarget instanceof Element ? (rawTarget.closest(AutoGuideTargets.actionable) || rawTarget) : rawTarget;
    if (!(target instanceof Element)) return;
    // Ignora o evento de campos de senha; isso não mascara os demais dados sensíveis visíveis na imagem da tela.
    if (target.type === "password" || target.getAttribute("autocomplete") === "current-password") {
      return;
    }

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
        input_value: target.tagName === "SELECT" ? target.options[target.selectedIndex]?.text : target.value,
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
