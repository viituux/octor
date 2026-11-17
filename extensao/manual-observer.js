/** Leitura visual somente: regiões úteis, máscaras temporárias e evidências medidas na viewport. */
export function inspectManualPage(expectedUrl, position = null, cleanup = false, objective = '') {
  const maskId='__octor_manual_privacy_mask__',styleId='__octor_manual_capture_style__';
  if(cleanup){document.getElementById(maskId)?.remove();document.getElementById(styleId)?.remove();document.getElementById('__octor_manual_outline__')?.remove();return {ok:true};}
  const normalized=value=>{const u=new URL(value);u.hash='';return u.href;};
  if(normalized(location.href)!==normalized(expectedUrl))return {attention:'A URL mudou. Autorize outra coleta com o endereço final.'};
  document.getElementById(maskId)?.remove();
  if(!document.body)return {waiting:true};
  const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0'&&!el.closest('[hidden],[aria-hidden=true]');};
  if([...document.querySelectorAll('input[type=password]')].some(visible))return {attention:'Entre no sistema pela aba e depois continue a coleta.'};
  if([...document.querySelectorAll('[role=dialog][aria-modal=true],dialog[open]')].some(el=>{const r=el.getBoundingClientRect();return visible(el)&&r.width*r.height>innerWidth*innerHeight*.25;}))return {attention:'Há um diálogo cobrindo a página. Confira-o na aba e depois continue a coleta.'};
  if(position===null){
    if(/just a moment|checking your browser|access denied|acesso negado|verifique se voc[eê] [eé] humano/i.test(document.title+' '+document.body.innerText.slice(0,300)))return {attention:'O site está solicitando uma verificação. Resolva-a na aba e continue.'};
    const main=document.querySelector('main,[role=main]')||document.body;
    if(main.getAttribute('aria-busy')==='true')return {waiting:true};
    if(document.body.innerText.trim().length<40&&![...main.querySelectorAll('button,a,input,img,canvas')].some(el=>visible(el)&&((el.innerText||el.getAttribute('aria-label')||'').trim().length>1||el.naturalWidth>200)))return {waiting:true};
    const maxScroll=Math.max(0,document.documentElement.scrollHeight-innerHeight);
    const mainBottom=Math.min(maxScroll,Math.max(0,main.getBoundingClientRect().bottom+scrollY-innerHeight));
    const positions=[],add=y=>{const top=Math.max(0,Math.min(maxScroll,Math.round(y)));if(positions.length<6&&positions.every(old=>(mainBottom===0 ? old!==top : Math.abs(old-top)>innerHeight*.55)))positions.push(top);};
    const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const ignored = new Set(['criar','manual','usuario','secoes','passos','funcionalidades','visiveis',
      'como','mostre','onde','clique','abra','tela','pagina','para','pelo','pela','tirar','prints','quero','documentar']);
    const words = new Set(normalize(objective || '').match(/[a-z0-9]{3,}/g)?.filter(word => !ignored.has(word)));
    const targets = [...document.querySelectorAll('button,a,[role=button],[role=menuitem],summary,label,h1,h2,h3')]
      .filter(visible)
      .map(el => {
        const label = normalize((el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '').trim());
        const labelWords = label.match(/[a-z0-9]{3,}/g) || [];
        const score = label.length <= 120 ? [...new Set(labelWords)].filter(word => words.has(word)).length : 0;
        return {el, score};
      }).filter(target => target.score > 0).sort((a,b) => b.score - a.score);
    // Reserve as primeiras capturas para os controles encontrados pelo objetivo.
    for (const {el} of targets.slice(0, 12)) {
      if (positions.length >= 3) break;
      add(el.getBoundingClientRect().top + scrollY - innerHeight * .25);
    }
    add(0);
    if(mainBottom>innerHeight)add(mainBottom);
    const candidates=[...main.querySelectorAll('h1,h2,h3,[role=heading],form,table,[role=table]')].filter(el=>visible(el)&&!el.closest('footer,aside,nav')).slice(0,120);
    candidates.sort((a,b)=>{const score=el=>/FORM|TABLE/.test(el.tagName)||el.getAttribute('role')==='table'?3:/H1|H2/.test(el.tagName)?2:1;return score(b)-score(a)||(a.getBoundingClientRect().top-b.getBoundingClientRect().top);});
    for(const el of candidates)add(el.getBoundingClientRect().top+scrollY-70);
    if(positions.length<3&&mainBottom>innerHeight){for(let y=innerHeight*.85;y<mainBottom&&positions.length<6;y+=innerHeight*.85)add(y);}
    positions.sort((a,b)=>a-b);
    return {positions,original_scroll:scrollY,title:document.title.slice(0,200)};
  }
  if(!document.getElementById(styleId)){
    const style=document.createElement('style');style.id=styleId;style.textContent='html{scroll-behavior:auto!important}*{caret-color:transparent!important}';document.documentElement.append(style);
  }
  scrollTo({top:position,behavior:'instant'});return {ready:true};
}

export function readManualViewport(expectedUrl, probe = false) {
  const u=new URL(location.href);u.hash='';const expected=new URL(expectedUrl);expected.hash='';
  if(u.href!==expected.href)throw new Error('A página mudou durante a captura.');
  const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0'&&!el.closest('[hidden],[aria-hidden=true]');};
  if([...document.querySelectorAll('input[type=password]')].some(visible))throw new Error('Entre no sistema pela aba e depois continue a coleta.');
  const masked=[...document.querySelectorAll('input,textarea,select,[contenteditable=true],[data-private]')].filter(visible);
  if(!probe){
    document.getElementById('__octor_manual_privacy_mask__')?.remove();
    const mask=document.createElement('div');mask.id='__octor_manual_privacy_mask__';Object.assign(mask.style,{position:'fixed',inset:'0',zIndex:'2147483647',pointerEvents:'none'});
    for(const el of masked){const r=el.getBoundingClientRect(),block=document.createElement('div');Object.assign(block.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',background:'#e2e8f0',border:'1px solid #94a3b8',borderRadius:'4px'});mask.append(block);}
    document.documentElement.append(mask);
  }
  const clean=value=>String(value||'').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[e-mail oculto]').replace(/\s+/g,' ').trim();
  const main=document.querySelector('main,[role=main]')||document.body;
  // Menus portais e cabeçalhos também fazem parte da tela após abrir um controle.
  const roots=[main,...document.querySelectorAll('header,body>nav,[role=menu],[role=dialog],details[open]')];
  const nodes=[...new Set(roots.flatMap(root=>[...root.querySelectorAll('h1,h2,h3,p,label,button,a,input:not([type=hidden]),select,[role=button],[role=tab]')]))].slice(0,2000);
  const controls=[],texts=[],seen=new Set();let length=0;
  for(const el of nodes){
    if(!visible(el)||el.closest('footer,aside,textarea,[contenteditable=true],#__octor_manual_privacy_mask__'))continue;
    const field=/^(INPUT|SELECT)$/.test(el.tagName);
    const labelled=el.getAttribute('aria-labelledby')?.split(/\s+/).map(id=>document.getElementById(id)?.innerText||'').join(' ');
    const label=clean(field?el.getAttribute('aria-label')||labelled||el.labels?.[0]?.innerText||el.getAttribute('placeholder')||el.getAttribute('name'):el.innerText||el.getAttribute('aria-label')||labelled).slice(0,150);
    if(!label)continue;
    const r=el.getBoundingClientRect();const left=Math.max(0,r.left),top=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom);
    const hit=document.elementFromPoint((left+right)/2,(top+bottom)/2);if(hit&&hit!==el&&!el.contains(hit)&&!hit.contains(el))continue;
    if(length<4500&&!seen.has(label)){texts.push(label);seen.add(label);length+=label.length+1;}
    if(controls.length<40&&(field||['A','BUTTON','H1','H2','H3'].includes(el.tagName)||['button','tab'].includes(el.getAttribute('role')))){
      controls.push({label,role:field?'field':el.tagName==='A'?'link':/^H[123]$/.test(el.tagName)?'heading':'button',disabled:!!el.disabled||el.getAttribute('aria-disabled')==='true',rect:{left:Math.round(left),top:Math.round(top),width:Math.max(1,Math.round(right-left)),height:Math.max(1,Math.round(bottom-top))}});
    }
  }
  const images=[...main.querySelectorAll('img')].filter(visible),pending=images.filter(img=>!img.complete).length,broken=images.filter(img=>img.complete&&!img.naturalWidth).length;
  const warnings=[];if(pending)warnings.push('Há imagens ainda carregando neste print.');if(broken)warnings.push('Há imagens que não carregaram nesta região.');if(texts.join(' ').length<40)warnings.push('Pouco texto identificado: confira a interpretação visual.');if(masked.length)warnings.push('Valores de '+masked.length+' campos foram ocultados.');if([...main.querySelectorAll('video,canvas')].some(visible))warnings.push('Conteúdo gráfico ou em movimento foi registrado apenas como imagem estática.');
  if([...main.querySelectorAll('iframe')].some(visible))warnings.push('Há conteúdo em iframe: seus controles internos não foram inspecionados.');
  const heading=[...main.querySelectorAll('h1,h2,h3')].find(visible)?.innerText||document.title;
  const text=texts.join(' ').slice(0,5000);
  const scene={url:u.href,scroll:scrollY,width:innerWidth,height:innerHeight,devicePixelRatio,signature:JSON.stringify({text,controls,images:images.map(img=>[img.complete,img.naturalWidth,img.naturalHeight]),scroll:scrollY,width:innerWidth,height:innerHeight,devicePixelRatio})};
  return {url:u.href,title:document.title.slice(0,200)||'Página analisada',evidence:{heading:clean(heading).slice(0,200),text,controls,scroll_y:Math.max(0,Math.round(scrollY)),viewport_width:innerWidth,viewport_height:innerHeight,page_height:document.documentElement.scrollHeight,quality:{warnings,pending_images:pending,masked_fields:masked.length,stable:false,visual_content:images.length>0||[...main.querySelectorAll('video,canvas,iframe')].some(visible)}},scene};
}


/** Seleciona novamente o controle na pagina antes de qualquer interacao. */
export function manualNavigation(expectedUrl, index = null, expectedLabel = '', preview = false, accountFlow = false, value = null) {
  if (location.href.split('#')[0] !== expectedUrl.split('#')[0]) return null;
  if (document.querySelector('input[type=password]:not([hidden])')) return null;
  const searchSelector = 'input[type=search],input[type=text][role=searchbox],input:not([type])[role=searchbox]';
  const candidates = [];
  const isYouTube = location.hostname === 'www.youtube.com';
  const avatar = isYouTube ? document.querySelector('ytd-masthead button#avatar-btn') : null;
  for (const candidate of new Set([avatar, ...document.querySelectorAll(searchSelector + ',a[href],details:not([open]) > summary,button[aria-haspopup="menu"]:not([aria-expanded="true"]),button[aria-haspopup="true"]:not([aria-expanded="true"]),[role="button"][aria-haspopup="menu"]:not([aria-expanded="true"]),[role="button"][aria-haspopup="true"]:not([aria-expanded="true"]),ytd-account-item-renderer,ytd-compact-link-renderer,yt-list-item-view-model')])) {
    if (!candidate) continue;
    const accountItem = candidate.matches('ytd-account-item-renderer,ytd-compact-link-renderer,yt-list-item-view-model');
    const element = accountItem
      ? candidate.querySelector('a,button,tp-yt-paper-item,[role="menuitem"],[role="button"]') || candidate
      : candidate;
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    if (!hit || !element.contains(hit) || element.closest('[inert],[aria-hidden=true],[aria-disabled=true],:disabled')) continue;
    const search = element.matches(searchSelector) && !element.readOnly && !element.disabled;
    if (element.matches('input') && !search) continue;
    const form = element.closest('form');
    if (form && (!search || form.querySelector('input[type=password]'))) continue;
    const label = (element === avatar ? 'Menu da conta' : element.getAttribute('aria-label') || element.innerText || candidate.innerText || element.title || element.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!label || /@|logout|sign out|sair|excluir|delete|comprar|pagar|confirmar|remover|submit|desativar|unsubscribe|cancelar|checkout|purchase|add account|adicionar conta/i.test(label)) continue;
    let url = null;
    const youtubeSwitch = isYouTube &&
      /^(trocar de conta|mudar de conta|switch account)$/i.test(label) && accountItem;
    if (accountItem && !youtubeSwitch) continue;
    if (accountFlow && !youtubeSwitch && element !== avatar) continue;
    if (candidates.some(candidate => candidate.element === element)) continue;
    if (!youtubeSwitch && element.matches('a')) {
      const destination = new URL(element.href);
      if (element.hasAttribute('download') || destination.origin !== location.origin ||
          destination.search !== location.search || destination.pathname === location.pathname ||
          /logout|signout|delete|checkout|unsubscribe|remove|revoke/i.test(destination.pathname)) continue;
      url = destination.href;
    }
    candidates.push({element, label, url, kind: search ? 'search' : url ? 'page' : 'menu'});
  }
  candidates.sort((a, b) => Number(a.kind === 'page') - Number(b.kind === 'page'));
  candidates.length = Math.min(40, candidates.length);
  if (index === null) return candidates.map(({label, kind}) => ({label, kind}));
  // A ordem do DOM pode mudar enquanto o Gemini processa a captura.
  const matches = candidates.filter(candidate => candidate.label === expectedLabel);
  if (matches.length !== 1) return null;
  const [target] = matches;
  const style = getComputedStyle(target.element);
  if (style.visibility !== 'visible' || Number(style.opacity) === 0 || style.pointerEvents === 'none') return null;
  if (preview) {
    const bounds = target.element.getBoundingClientRect();
    document.getElementById('__octor_manual_outline__')?.remove();
    const outline = document.createElement('div');
    outline.id = '__octor_manual_outline__';
    outline.setAttribute('aria-hidden', 'true');
    Object.assign(outline.style, {
      position: 'fixed', pointerEvents: 'none', zIndex: '2147483647',
      top: bounds.top + 'px', left: bounds.left + 'px',
      width: bounds.width + 'px', height: bounds.height + 'px',
      boxSizing: 'border-box', border: '2px solid #111',
      borderRadius: '5px', boxShadow: '0 0 0 1px #fff',
    });
    document.documentElement.append(outline);
    // O controlador remove após capturar; atrasos do navegador não apagam o destaque.
    return true;
  }
  if (target.kind === 'search') {
    if (typeof value !== 'string' || !value.trim() || value.length > 150) return null;
    target.element.focus();
    globalThis.__octorManualAction = {element:target.element, value, document_id:performance.timeOrigin};
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(target.element, value);
    target.element.dispatchEvent(new Event('input', {bubbles: true}));
    return target.element.isConnected && target.element.value === value
      ? {opened: true, typed: true, label: target.label}
      : null;
  }
  if (value !== null) return null;
  if (target.url) return {url: target.url};
  const overlaySelector='[role=menu],[role=dialog],details[open],[popover]:popover-open,ytd-multi-page-menu-renderer';
  const overlayState=()=>[...document.querySelectorAll(overlaySelector)].filter(el=>{
    const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
    return rect.width>0&&rect.height>0&&style.visibility==='visible'&&style.display!=='none'&&!el.closest('[hidden],[aria-hidden=true]');
  }).map(el=>[el,(el.innerText||'').trim()]);
  globalThis.__octorManualClick={element:target.element,expanded:target.element.getAttribute('aria-expanded'),
    details:target.element.closest('details'),
    overlays:overlayState(),overlayState,document_id:performance.timeOrigin};
  target.element.click();
  return {opened: true};
}

/** A controlled component may revert its value after the input handler returns. */
export function verifyManualTyping() {
  const receipt = globalThis.__octorManualAction;
  return !!receipt && receipt.document_id === performance.timeOrigin &&
    receipt.element.isConnected && receipt.element.value === receipt.value;
}

/** Menu state is evidence; an unrelated clock or advertisement is not click success. */
export function verifyManualClick() {
  const receipt=globalThis.__octorManualClick;
  if(!receipt||receipt.document_id!==performance.timeOrigin)return false;
  if(receipt.element.getAttribute('aria-expanded')==='true'&&receipt.expanded!=='true')return true;
  if(receipt.details?.open)return true;
  const previous=new Map(receipt.overlays);
  return receipt.overlayState().some(([element,text])=>!previous.has(element)||previous.get(element)!==text);
}
