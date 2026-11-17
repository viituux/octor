/** Aguarda sinais observáveis de estabilidade. Timeout interrompe a captura. */
export async function waitManualReady(options = {}) {
  const started = performance.now(), timeoutMs = options.timeoutMs ?? 15000, quietMs = options.quietMs ?? 700;
  let lastMutation = started, previous = '', unchangedSince = started, lastState;
  const internal = node => node?.nodeType === 1 &&
    (node.id?.startsWith('__octor_') || node.closest?.('[id^="__octor_"]'));
  const observer = new MutationObserver(records => {
    if (records.some(record => !internal(record.target) &&
      (record.type !== 'childList' || [...record.addedNodes,...record.removedNodes].some(node => !internal(node))))) {
      lastMutation = performance.now();
    }
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
  const visible = element => {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    return box.width>0 && box.height>0 && box.bottom>0 && box.top<innerHeight &&
      box.right>0 && box.left<innerWidth && style.visibility!=='hidden' && style.display!=='none';
  };
  try {
    while (performance.now()-started<timeoutMs) {
      if(document.hidden)throw new Error('Mantenha a aba de captura visível.');
      const now=performance.now(), images=[...document.images].filter(visible);
      const controls=[...document.querySelectorAll('button,a,input,summary,[role="menu"],[aria-busy]')]
        .filter(element=>!internal(element)&&visible(element)).slice(0,250);
      const layout=JSON.stringify([location.href,scrollX,scrollY,innerWidth,innerHeight,
        controls.map(element=>{
          const box=element.getBoundingClientRect();
          return [element.tagName,element.getAttribute('aria-label'),element.textContent?.slice(0,100),
            element.disabled,box.x,box.y,box.width,box.height];
        })]);
      if(layout!==previous){previous=layout;unchangedSince=now;}
      const animations=document.getAnimations().filter(animation=>animation.playState==='running' &&
        animation.effect?.getTiming().iterations!==Infinity &&
        animation.timeline instanceof DocumentTimeline &&
        animation.effect?.target instanceof Element && visible(animation.effect.target));
      const resourceEnd=performance.getEntriesByType('resource').reduce((latest,entry)=>Math.max(latest,entry.responseEnd),0);
      lastState={readyState:document.readyState,pendingImages:images.filter(image=>!image.complete).length,
        busy:controls.some(element=>element.getAttribute('aria-busy')==='true') ||
          [...document.querySelectorAll('[data-testid=loading],[data-component^=Skeleton],[role=progressbar]:not([aria-valuenow])')].some(visible),
        animations:animations.length,fonts:document.fonts?.status,domQuietMs:Math.round(now-lastMutation),
        layoutQuietMs:Math.round(now-unchangedSince),resourceQuietMs:Math.round(now-resourceEnd),
        url:location.href,scroll:{x:scrollX,y:scrollY},devicePixelRatio,
        viewport:{width:innerWidth,height:innerHeight}};
      if(document.readyState==='complete' && !lastState.pendingImages && !lastState.busy &&
        !animations.length && lastState.fonts!=='loading' &&
        Math.min(lastState.domQuietMs,lastState.layoutQuietMs,lastState.resourceQuietMs)>=quietMs) {
        await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(new Error('A aba deixou de renderizar. Retome a coleta com a aba visível.')),1800);
          requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve();}));
        });
        if(performance.now()-lastMutation<quietMs)continue;
        return {ready:true,waitedMs:Math.round(performance.now()-started),...lastState};
      }
      await new Promise(resolve=>setTimeout(resolve,60));
    }
    throw new Error('A tela não estabilizou. Nenhum print transitório foi autorizado. '+JSON.stringify(lastState));
  } finally {observer.disconnect();}
}
export async function waitManualPaint(){
  await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(new Error('A aba deixou de renderizar. Retome a coleta com a aba visível.')),1800);
          requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve();}));
        });
}
