(() => {
if (globalThis.__autoGuideRecorderLoaded) return;
globalThis.__autoGuideRecorderLoaded = true;
chrome.runtime.onMessage.addListener((message, sender, respond) => {
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
 * Octo Content Script
 * Captura eventos de clique, digitação e navegação sem interferir no fluxo do usuário.
 */

let isRecording = false;
let isPaused = false;
const documentId = Math.random().toString(36).slice(2) + Date.now();
let interaction = 0;
let domRevision = 0;
let captureTarget = null;
const captureTargets = new Map();
function rememberCapture(id, target) {
  captureTargets.set(id, target);
  if (captureTargets.size > 100) captureTargets.delete(captureTargets.keys().next().value);
}
const captureObserver = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => { domRevision++; }) : null;
captureObserver?.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.isRecording !== undefined) isRecording = changes.isRecording.newValue;
    if (changes.isPaused !== undefined) isPaused = changes.isPaused.newValue;
  }
});

// Gera seletor CSS legível e único
function getCssSelector(el) {
  return AutoGuideTargets.selector(el);
}

// Extrai rótulo ou texto visível do elemento
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

// Prepare an image on pointer-down without blocking the native action.
let prepared = null;
let eventSequence = 0;
const editedFields = new WeakSet();
const savedValues = new WeakMap();
function eventId() { return documentId + ':event:' + (++eventSequence); }
document.addEventListener('input', e => {
  if (isRecording && !isPaused && e.isTrusted && e.target instanceof Element) editedFields.add(e.target);
}, true);
document.addEventListener('pointerdown', e => {
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
  (e) => {
    if (!isRecording || isPaused || !e.isTrusted) return;

    const rawTarget = e.target;
    const target = rawTarget instanceof Element ? (rawTarget.closest(AutoGuideTargets.actionable) || rawTarget) : rawTarget;
    if (!(target instanceof Element)) return;
    // Privacidade: Nunca capturar campos de senha
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
  (e) => {
    if (!isRecording || isPaused || !e.isTrusted) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.type === "password" || ["current-password", "new-password", "one-time-code", "cc-number", "cc-csc"].includes(target.getAttribute("autocomplete"))) return;
    if (!["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

    // Ignore site-driven change events and repeated commits of the same value.
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
