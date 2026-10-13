/**
 * AutoGuide Content Script
 * Captura eventos de clique, digitação e navegação sem interferir no fluxo do usuário.
 */

let isRecording = false;
let isPaused = false;

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
  if (!(el instanceof Element)) return "";
  if (el.id) return `#${CSS.escape(el.id)}`;

  const path = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.nodeName.toLowerCase();
    if (el.id) {
      selector = `#${CSS.escape(el.id)}`;
      path.unshift(selector);
      break;
    } else {
      let sibling = el;
      let nth = 1;
      while ((sibling = sibling.previousElementSibling)) {
        if (sibling.nodeName.toLowerCase() === selector) nth++;
      }
      if (nth !== 1) selector += `:nth-of-type(${nth})`;
    }
    path.unshift(selector);
    el = el.parentElement;
    if (path.length >= 4) break; // Limita profundidade
  }
  return path.join(" > ");
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

  if (el.tagName === "INPUT" || el.tagName === "BUTTON") {
    if (el.value) return el.value.trim();
  }

  const innerText = el.innerText || el.textContent;
  if (innerText) {
    // Retorna primeiras poucas palavras
    return innerText.trim().slice(0, 60).replace(/\s+/g, " ");
  }

  return el.tagName.toLowerCase();
}

// Captura de Cliques
document.addEventListener(
  "click",
  (e) => {
    if (!isRecording || isPaused) return;

    const target = e.target;
    // Privacidade: Nunca capturar campos de senha
    if (target.type === "password" || target.getAttribute("autocomplete") === "current-password") {
      return;
    }

    const rect = target.getBoundingClientRect();
    const payload = {
      action: "ACTION_PERFORMED",
      eventData: {
        action_type: "click",
        selector: getCssSelector(target),
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
    if (!isRecording || isPaused) return;
    const target = e.target;
    if (target.type === "password") return;
    if (!["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

    const payload = {
      action: "ACTION_PERFORMED",
      eventData: {
        action_type: "input",
        selector: getCssSelector(target),
        element_text: getElementLabel(target),
        input_value: target.tagName === "SELECT" ? target.options[target.selectedIndex]?.text : target.value,
        url: window.location.href,
        timestamp: Date.now(),
      },
    };

    chrome.runtime.sendMessage(payload);
  },
  true
);
