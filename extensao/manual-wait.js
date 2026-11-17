/** Injectable, bounded readiness check. No extension API or page-global patches. */
export async function waitForManualStability(options = {}) {
  const {timeoutMs = 15000, quietMs = 450, frames = 4} = options;
  const started = performance.now();
  const internal = el => el?.closest?.('[id^="__octor_manual_"]');
  const visible = el => {
    if (!(el instanceof Element) || internal(el)) return false;
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 &&
      r.top < innerHeight && r.left < innerWidth && s.display !== 'none' &&
      s.visibility !== 'hidden' && Number(s.opacity) > 0 && !el.closest('[hidden],[aria-hidden=true]');
  };
  let changed = started, previous = '', stableFrames = 0, reasons = [];
  const observer = new MutationObserver(records => {
    if (records.some(record => {
      if (internal(record.target)) return false;
      const nodes = [...record.addedNodes, ...record.removedNodes];
      if (nodes.length && nodes.every(node => node instanceof Element && (internal(node) || node.id?.startsWith('__octor_manual_')))) return false;
      return visible(record.target instanceof Element ? record.target : record.target.parentElement) || nodes.some(visible);
    })) changed = performance.now();
  });
  observer.observe(document.documentElement, {subtree:true, childList:true, attributes:true, characterData:true});
  let timer;
  try {
    // Timer remains authoritative even when requestAnimationFrame is suspended.
    return await Promise.race([
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Interface não estabilizou: ' + (reasons.join(', ') || 'frames indisponíveis'))), timeoutMs); }),
      (async () => {
        while (performance.now() - started < timeoutMs) {
          await new Promise(resolve => requestAnimationFrame(resolve));
          const now = performance.now();
          const elements = [...document.querySelectorAll('body *')].filter(visible);
          // Include geometry, text and state; values stay local and never enter logs.
          const signature = JSON.stringify([location.href, scrollX, scrollY, innerWidth, innerHeight,
            ...elements.map(el => {
              const r = el.getBoundingClientRect();
              return [el.tagName, r.x, r.y, r.width, r.height,
                el.childElementCount ? '' : el.textContent, el.getAttribute('aria-expanded'),
                el.getAttribute('aria-selected'), el.checked, el.value, el.currentSrc];
            })]);
          stableFrames = signature === previous ? stableFrames + 1 : 0;
          if (signature !== previous) changed = now;
          previous = signature;
          const animations = document.getAnimations().filter(animation => {
            const target = animation.effect?.target;
            // Infinite decorative animation cannot ever finish; geometry/DOM still participate.
            return visible(target) && animation.playState === 'running' &&
              animation.effect.getComputedTiming().iterations !== Infinity;
          });
          const pendingImages = elements.some(el => el.tagName === 'IMG' && !el.complete);
          const busy = elements.some(el => el.getAttribute('aria-busy') === 'true');
          // Resource timing is a supplementary hint, not network-idle (streaming is allowed).
          const resources = performance.getEntriesByType('resource');
          const recentResource = resources.some(entry => entry.responseEnd > started && now - entry.responseEnd < 150);
          reasons = [document.readyState === 'loading' && 'documento', busy && 'aria-busy',
            pendingImages && 'imagens', animations.length && 'animações',
            now - changed < quietMs && 'DOM/posição',
            stableFrames < frames && 'frames'].filter(Boolean);
          if (!reasons.length) return {stable:true, frames:stableFrames, waited_ms:Math.round(now-started),
            network_recent:recentResource, document_id:performance.timeOrigin, url:location.href, signature};
        }
        throw new Error('Interface não estabilizou: ' + reasons.join(', '));
      })(),
    ]);
  } finally { clearTimeout(timer); observer.disconnect(); }
}

/** Decode and inspect pixels before accepting a browser screenshot. */
export async function validateManualImage(data) {
  if (!/^data:image\/(jpeg|png);base64,/.test(data || '')) throw new Error('Formato da captura inválido.');
  const blob = await (await fetch(data)).blob();
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width < 100 || bitmap.height < 100) throw new Error('Dimensões da captura inválidas.');
    const canvas = new OffscreenCanvas(96, 96), context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, 96, 96);
    const pixels = context.getImageData(0, 0, 96, 96).data;
    let min = 255, max = 0;
    for (let i=0; i<pixels.length; i+=4) {
      const value = (pixels[i]+pixels[i+1]+pixels[i+2])/3;
      min = Math.min(min, value); max = Math.max(max, value);
    }
    if (max-min < 2) throw new Error('Captura vazia ou uniforme.');
    return {width:bitmap.width, height:bitmap.height, pixels:Array.from(pixels)};
  } finally { bitmap.close(); }
}

/** Tile differences catch local menus instead of requiring a whole-screen change. */
export function manualVisualDifference(before, after) {
  if (before.width !== after.width || before.height !== after.height) return 1;
  let largest = 0;
  for (let y=0; y<96; y+=8) for (let x=0; x<96; x+=8) {
    let total = 0;
    for (let dy=0; dy<8; dy++) for (let dx=0; dx<8; dx++) {
      const i = ((y+dy)*96+x+dx)*4;
      for (let c=0; c<3; c++) total += Math.abs(before.pixels[i+c]-after.pixels[i+c]);
    }
    largest = Math.max(largest, total/(64*3*255));
  }
  return largest;
}
