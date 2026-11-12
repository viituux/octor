/** Leitura visual somente: regiões úteis, máscaras temporárias e evidências medidas na viewport. */
export function inspectManualPage(expectedUrl, position = null, cleanup = false) {
  const maskId='__octor_manual_privacy_mask__',styleId='__octor_manual_capture_style__';
  if(cleanup){document.getElementById(maskId)?.remove();document.getElementById(styleId)?.remove();return {ok:true};}
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
    const positions=[0],add=y=>{const top=Math.max(0,Math.min(maxScroll,Math.round(y)));if(positions.length<6&&positions.every(old=>Math.abs(old-top)>innerHeight*.55))positions.push(top);};
    if(mainBottom>innerHeight)add(mainBottom);
    const candidates=[...main.querySelectorAll('h1,h2,h3,[role=heading],form,table,[role=table]')].filter(el=>visible(el)&&!el.closest('footer,aside,nav')).slice(0,120);
    candidates.sort((a,b)=>{const score=el=>/FORM|TABLE/.test(el.tagName)||el.getAttribute('role')==='table'?3:/H1|H2/.test(el.tagName)?2:1;return score(b)-score(a)||(a.getBoundingClientRect().top-b.getBoundingClientRect().top);});
    for(const el of candidates)add(el.getBoundingClientRect().top+scrollY-70);
    if(positions.length<3&&mainBottom>innerHeight){for(let y=innerHeight*.85;y<mainBottom&&positions.length<6;y+=innerHeight*.85)add(y);}
    positions.sort((a,b)=>a-b);
    return {positions,original_scroll:scrollY,title:document.title.slice(0,200)};
  }
  if(!document.getElementById(styleId)){
    const style=document.createElement('style');style.id=styleId;style.textContent='html{scroll-behavior:auto!important}*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}';document.documentElement.append(style);
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
  const roots=[main];if(scrollY<innerHeight*.25&&main!==document.body)roots.push(...document.querySelectorAll('header nav,body>nav'));
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
  const scene={url:u.href,scroll:scrollY,width:innerWidth,height:innerHeight,signature:JSON.stringify({text,controls,images:images.map(img=>[img.complete,img.naturalWidth,img.naturalHeight]),scroll:scrollY,width:innerWidth,height:innerHeight})};
  return {url:u.href,title:document.title.slice(0,200)||'Página analisada',evidence:{heading:clean(heading).slice(0,200),text,controls,scroll_y:Math.max(0,Math.round(scrollY)),viewport_width:innerWidth,viewport_height:innerHeight,page_height:document.documentElement.scrollHeight,quality:{warnings,pending_images:pending,masked_fields:masked.length,stable:false,visual_content:images.length>0||[...main.querySelectorAll('video,canvas,iframe')].some(visible)}},scene};
}
