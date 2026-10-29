(() => {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const actionable = 'button,a,input,textarea,select,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[contenteditable="true"]';
  function label(element) {
    const labelled = normalize(element.getAttribute('aria-labelledby')).split(' ').filter(Boolean)
      .map(id => element.ownerDocument.getElementById(id)?.textContent || '').join(' ');
    return normalize(element.getAttribute('aria-label') || labelled ||
      Array.from(element.labels || []).map(item => item.textContent).join(' ') ||
      element.getAttribute('placeholder') || element.getAttribute('title') || element.innerText || element.textContent).slice(0, 200);
  }
  function visible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
  }
  function selector(element) {
    const doc = element.ownerDocument;
    const unique = candidate => {
      try { const matches = doc.querySelectorAll(candidate); return matches.length === 1 && matches[0] === element; }
      catch { return false; }
    };
    if (element.id && unique('#' + CSS.escape(element.id))) return '#' + CSS.escape(element.id);
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
      if (node.id && doc.querySelectorAll('#' + CSS.escape(node.id)).length === 1) {
        path.unshift('#' + CSS.escape(node.id)); break;
      }
      const siblings = node.parentElement ? Array.from(node.parentElement.children).filter(s => s.tagName === node.tagName) : [];
      if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
      path.unshift(part);
      if (unique(path.join(' > '))) break;
    }
    return path.join(' > ');
  }
  function describe(element) {
    return { tag: element.tagName.toLowerCase(), label: label(element), role: element.getAttribute('role') || '',
      name: element.getAttribute('name') || '', test_id: element.getAttribute('data-testid') || '' };
  }
  function resolve(step, doc = document) {
    const identity = step.target || {};
    const expected = normalize(identity.label || step.element_text);
    const matchesIdentity = el => (!identity.tag || el.tagName.toLowerCase() === identity.tag) &&
      (!identity.role || el.getAttribute('role') === identity.role) &&
      (!expected || label(el) === expected || (!identity.label && label(el).slice(0, 60) === expected));
    let selected = [];
    try { selected = Array.from(doc.querySelectorAll(step.selector || ':not(*)')).filter(visible); } catch {}
    const verified = selected.filter(matchesIdentity);
    if (verified.length === 1) return { element: verified[0] };
    // Legacy guides without labels can still use an unambiguous visible selector.
    if (!expected && !identity.tag && selected.length === 1) return { element: selected[0] };
    const candidates = Array.from(doc.querySelectorAll(actionable + ',label,[aria-label],[data-testid]'))
      .filter(visible).filter(matchesIdentity)
      .filter(el => expected || identity.test_id && el.getAttribute('data-testid') === identity.test_id || identity.name && el.getAttribute('name') === identity.name);
    if (candidates.length === 1) return { element: candidates[0] };
    return { element: null, ambiguous: verified.length > 1 || candidates.length > 1 };
  }
  globalThis.AutoGuideTargets = { normalize, label, selector, describe, resolve, visible, actionable };
})();
