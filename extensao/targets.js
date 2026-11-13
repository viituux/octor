/** Identificação de elementos: combina seletor, identidade e visibilidade; candidatos ambíguos não recebem destaque por aproximação. */
(() => {
  const normalize = /* Normaliza espaços e texto de identificação antes de comparar candidatos de alvo. | @param value — valor recebido pelo controle ou transformação. | @returns resultado de String(value || '').replace(/\s+/g, ' ').trim(...). */ value => String(value || '').replace(/\s+/g, ' ').trim();
  const /* string: seletores de controles que podem representar ações registradas ou alvos de um passo. */ actionable = 'button,a,input,textarea,select,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[contenteditable="true"]';
  /**
   * Combina os atributos e rótulos acessíveis disponíveis para identificar o elemento.
   * @param element — elemento DOM analisado.
   * @returns resultado de normalize(element.getAttribute('aria-label') || labelled ||       Array.from(element.labels || []).map(item =>(...).
   */
  function label(element) {
    const labelled = normalize(element.getAttribute('aria-labelledby')).split(' ').filter(Boolean)
      .map(id => element.ownerDocument.getElementById(id)?.textContent || '').join(' ');
    return normalize(element.getAttribute('aria-label') || labelled ||
      Array.from(element.labels || []).map(item => item.textContent).join(' ') ||
      element.getAttribute('placeholder') || element.getAttribute('title') || element.innerText || element.textContent || element.querySelector?.('img[alt],svg title')?.getAttribute('alt') || element.querySelector?.('svg title')?.textContent).slice(0, 200);
  }
  /**
   * Verifica dimensões e estilos computados antes de aceitar um elemento como alvo visível.
   * @param element — elemento DOM analisado.
   * @returns expressão calculada/comparada no corpo.
   */
  function visible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
  }
  /**
   * Constrói um seletor verificado como único, usando atributos estáveis antes do caminho estrutural.
   * @param element — elemento DOM analisado.
   * @returns expressão calculada/comparada no corpo; candidate; resultado de path.join(...).
   */
  function selector(element) {
    // IDs gerados pelo React podem mudar a cada abertura da página.
    const stableId = id => id && !/^_r_[a-z0-9]+_$|^:r[a-z0-9]+:$/i.test(id);
    const doc = element.ownerDocument;
    const unique = /* Confirma que o seletor identifica somente o elemento esperado e trata seletores inválidos. | @param candidate — valor recebido do contexto chamador. | @returns expressão calculada/comparada no corpo; boolean. */ candidate => {
      try { const matches = doc.querySelectorAll(candidate); return matches.length === 1 && matches[0] === element; }
      catch { return false; }
    };
    if (stableId(element.id) && unique('#' + CSS.escape(element.id))) return '#' + CSS.escape(element.id);
    const tag = element.tagName.toLowerCase();
    for (const attribute of ['data-testid','data-test','aria-label','name','placeholder']) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const candidate = tag + '[' + attribute + '="' + CSS.escape(value) + '"]';
      if (unique(candidate)) return candidate;
    }
    const path = [];
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      let part = node.tagName.toLowerCase();
      if (stableId(node.id) && doc.querySelectorAll('#' + CSS.escape(node.id)).length === 1) {
        path.unshift('#' + CSS.escape(node.id)); break;
      }
      const siblings = node.parentElement ? Array.from(node.parentElement.children).filter(s => s.tagName === node.tagName) : [];
      if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
      path.unshift(part);
      if (unique(path.join(' > '))) break;
    }
    return path.join(' > ');
  }
  /**
   * Registra a identidade do alvo com tag, rótulo e atributos usados na resolução posterior.
   * @param element — elemento DOM analisado.
   * @returns objeto com tag, label, role, name, test_id.
   */
  function describe(element) {
    return { tag: element.tagName.toLowerCase(), label: label(element), role: element.getAttribute('role') || '',
      name: element.getAttribute('name') || '', test_id: element.getAttribute('data-testid') || '' };
  }
  /**
   * Confronta seletor e identidade e só devolve um candidato quando a correspondência é suficientemente definida pelo fluxo.
   * @param step — passo com instruções, imagem e metadados.
   * @param doc — documento usado para buscar o alvo (padrão: document).
   * @returns objeto com element; objeto com element, ambiguous.
   */
  function resolve(step, doc = document) {
    const identity = step.target || {};
    const expected = normalize(identity.label || step.element_text);
    // O GitHub pode renderizar o mesmo controle em inglês após reabrir a aba.
    const githubLabels = [
      ['Criar novo...', 'Create new...', 'Create new'],
      ['Novo repositório', 'New repository'],
      ['Criar repositório', 'Create repository'],
    ];
    const canonical = value => normalize(value).replace(/…/g, '...').toLowerCase();
    const equivalents = doc.location?.origin === 'https://github.com'
      ? githubLabels.find(group => group.some(value => canonical(value) === canonical(expected)))
      : undefined;
    const matchesLabel = value => value === expected
      || equivalents?.some(alias => canonical(alias) === canonical(value));
    const matchesIdentity = /* Compara os atributos disponíveis da identidade gravada com o candidato atual. | @param el — valor recebido do contexto chamador. | @returns expressão calculada/comparada no corpo. */ el => (!identity.tag || el.tagName.toLowerCase() === identity.tag) &&
      (!identity.role || el.getAttribute('role') === identity.role) &&
      (!expected || matchesLabel(label(el)) || (!identity.label && label(el).slice(0, 60) === expected));
    let selected = [];
    try { selected = Array.from(doc.querySelectorAll(step.selector || ':not(*)')).filter(visible); } catch {}
    const verified = selected.filter(matchesIdentity);
    if (verified.length === 1) return { element: verified[0] };
    // Guias antigos sem identidade textual só reutilizam o seletor quando o candidato visível é único.
    if (!expected && !identity.tag && selected.length === 1) return { element: selected[0] };
    const candidates = Array.from(doc.querySelectorAll(actionable + ',label,[aria-label],[data-testid]'))
      .filter(visible).filter(matchesIdentity)
      .filter(el => expected || identity.test_id && el.getAttribute('data-testid') === identity.test_id || identity.name && el.getAttribute('name') === identity.name);
    if (candidates.length === 1) return { element: candidates[0] };
    return { element: null, ambiguous: verified.length > 1 || candidates.length > 1 };
  }
  globalThis.AutoGuideTargets = { normalize, label, selector, describe, resolve, visible, actionable };
})();
