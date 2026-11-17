/** Run: node --test tests/manual-browser.cjs (Playwright + Chromium test tooling). */
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {readFile} = require('node:fs/promises');
const {createServer} = require('node:http');
let browser, server, base;
before(async () => {
  server = createServer(async (req,res) => {
    if (req.url.startsWith('/extensao/')) {
      res.setHeader('Content-Type','text/javascript');
      res.end(await readFile('.'+req.url));
    } else { res.end('<!doctype html><html><body><main><h1>Teste do manual</h1><p>Conteúdo da página para validar os procedimentos observados com segurança.</p></main></body></html>'); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base = 'http://127.0.0.1:'+server.address().port;
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
});
after(async()=>{await browser?.close();server?.close();});
async function pageFor(markup='') {
  const page = await browser.newPage({viewport:{width:900,height:700}});
  await page.goto(base);
  await page.evaluate(async markup=>{
    document.querySelector('main').insertAdjacentHTML('beforeend', markup);
    Object.assign(window, await import('/extensao/manual-wait.js'));
    Object.assign(window, await import('/extensao/manual-observer.js'));
  },markup);
  return page;
}
async function ready(page, options={}) {return page.evaluate(options=>waitForManualStability({timeoutMs:3000,...options}),options);}

test('fast page: consecutive stable frames',async()=>{
 const p=await pageFor(); const result=await ready(p); assert.ok(result.stable);assert.ok(result.frames>=4);await p.close();
});
test('slow load / late JavaScript element / aria-busy',async()=>{
 const p=await pageFor();await p.evaluate(()=>{document.querySelector('main').setAttribute('aria-busy','true');setTimeout(()=>{document.querySelector('main').insertAdjacentHTML('beforeend','<button>Pronto</button>');document.querySelector('main').removeAttribute('aria-busy');},650);});
 const result=await ready(p);assert.ok(result.waited_ms>=1000);assert.ok(await p.getByText('Pronto').isVisible());await p.close();
});
test('animated modal: natural transition finishes',async()=>{
 const p=await pageFor('<div id="modal" role="dialog" style="width:100px;height:60px;background:red">Modal</div>');
 await p.evaluate(()=>document.querySelector('#modal').animate([{transform:'translateX(0px)'},{transform:'translateX(200px)'}],{duration:700,fill:'forwards'}));
 const result=await ready(p);assert.ok(result.waited_ms>=1000);await p.close();
});
test('dropdown: click and wait for delayed portal menu',async()=>{
 const p=await pageFor('<button aria-haspopup="menu" onclick="setTimeout(()=>{this.setAttribute(\'aria-expanded\',\'true\');document.body.insertAdjacentHTML(\'beforeend\',\'<div role=menu>Opções disponíveis</div>\')},350)">Abrir menu</button>');
 const controls=await p.evaluate(()=>manualNavigation(location.href));assert.equal(controls[0].label,'Abrir menu');
 await p.evaluate(()=>manualNavigation(location.href,0,'Abrir menu'));await ready(p);assert.ok(await p.getByRole('menu').isVisible());await p.close();
});
test('dynamic form: detects value reverted after input event',async()=>{
 const p=await pageFor('<input type="search" aria-label="Busca" oninput="setTimeout(()=>this.value=\'\',250)">');
 const opened=await p.evaluate(()=>manualNavigation(location.href,0,'Busca',false,false,'manual'));
 assert.ok(opened.typed);await ready(p);assert.equal(await p.evaluate(()=>verifyManualTyping()),false);await p.close();
});
test('click verification rejects unrelated content changes',async()=>{
 const p=await pageFor('<button aria-haspopup="menu" onclick="document.querySelector(\'h1\').textContent=\'Relógio atualizado\'">Sem efeito</button>');
 await p.evaluate(()=>manualNavigation(location.href,0,'Sem efeito'));await ready(p);
 assert.equal(await p.evaluate(()=>verifyManualClick()),false);await p.close();
});
test('navigation: document identity changes, then new page settles',async()=>{
 const p=await pageFor();const initial=await ready(p);await p.goto(base+'/next');await p.evaluate(async()=>Object.assign(window,await import('/extensao/manual-wait.js')));const next=await ready(p);assert.notEqual(initial.document_id,next.document_id);assert.notEqual(initial.url,next.url);await p.close();
});
test('continuous requests and offscreen mutations do not prevent readiness',async()=>{
 const p=await pageFor('<div id="noise" style="position:absolute;top:3000px">noise</div>');
 await p.evaluate(()=>setInterval(()=>{fetch('/poll');document.querySelector('#noise').textContent=String(Date.now());},90));
 const result=await ready(p);assert.ok(result.stable);await p.close();
});
test('relevant mutations timeout explicitly',async()=>{
 const p=await pageFor('<p id="changing">0</p>');await p.evaluate(()=>setInterval(()=>document.querySelector('#changing').textContent=String(Date.now()),50));
 await assert.rejects(ready(p,{timeoutMs:650}),/não estabilizou/);await p.close();
});
test('hidden / covered / disabled controls cannot execute',async()=>{
 const p=await pageFor('<button aria-haspopup="menu" disabled>Disabled</button><button aria-haspopup="menu" style="visibility:hidden">Hidden</button><button id="covered" aria-haspopup="menu">Covered</button><div style="position:fixed;inset:0;background:white;z-index:9">Cover</div>');
 assert.deepEqual(await p.evaluate(()=>manualNavigation(location.href)),[]);await p.close();
});
test('image validation rejects corrupt and blank images; local pixel differences',async()=>{
 const p=await pageFor();const image='data:image/jpeg;base64,'+(await p.screenshot({type:'jpeg'})).toString('base64');
 assert.ok((await p.evaluate(data=>validateManualImage(data),image)).width>100);
 await assert.rejects(p.evaluate(()=>validateManualImage('data:image/jpeg;base64,AAAA')));
 await assert.rejects(p.evaluate(async()=>{const c=document.createElement('canvas');c.width=c.height=200;await validateManualImage(c.toDataURL());}),/vazia/);
 const diff=await p.evaluate(()=>{const pixels=Array(96*96*4).fill(0),other=[...pixels];for(let y=10;y<18;y++)for(let x=10;x<18;x++)for(let c=0;c<3;c++)other[(y*96+x)*4+c]=255;return manualVisualDifference({width:900,height:700,pixels},{width:900,height:700,pixels:other});});assert.ok(diff>0.1);await p.close();
});
test('step state guards missing storage and invalid transitions',async()=>{
 const {createManualStep}=await import('../extensao/manual-step.js');const entries=[];
 const step=createManualStep('execution',async entry=>entries.push(entry));await assert.rejects(step.move('COMPLETED'),/inválida/);
 await step.move('WAITING');await step.move('CAPTURING');await step.move('VALIDATING');await step.move('SAVING');await assert.rejects(step.move('COMPLETED'),/armazenamento/);step.saved(12);await step.move('COMPLETED');assert.equal(entries.at(-1).state,'COMPLETED');
});

async function runScan({failCapture=false,lateGemini=false,duplicate=false,lostActionReply=false,resume=false}={}) {
 const p=await pageFor('<button aria-haspopup="menu" onclick="window.clickCount=(window.clickCount||0)+1;this.setAttribute(\'aria-expanded\',\'true\');document.querySelector(\'main\').insertAdjacentHTML(\'beforeend\',\'<p>Menu aberto com as opções de configuração</p>\')">Abrir menu</button>');
 let shots=0;await p.exposeFunction('browserScreenshot',async()=>{shots++;if(failCapture&&shots===1)throw new Error('temporary capture error');return 'data:image/jpeg;base64,'+(await p.screenshot({type:'jpeg'})).toString('base64');});
 await p.evaluate(async config=>{
  const {installManualCapture}=await import('/extensao/manual-background.js');
  const store={},listeners=[],captures=[],events=[];
  const run={id:'11111111-1111-4111-8111-111111111111',url:location.href,objective:'Abrir menu',status:'waiting',captures,agent_state:{}};
  globalThis.testResult={store,captures,events,run};
  globalThis.chrome={
   storage:{local:{get:async keys=>typeof keys==='string'?{[keys]:store[keys]}:{...store},set:async patch=>{Object.assign(store,patch);if(patch.manualCapture?.step)events.push({...patch.manualCapture.step});}}},
   scripting:{executeScript:async({func,args=[]})=>{const result=await func(...args);if(config.lostActionReply&&func.name==='manualNavigation'&&args[1]!==null&&args[3]===false){config.lostActionReply=false;throw new Error('dispatch reply lost');}return [{result}];}},
   tabs:{get:async()=>({id:1,windowId:1,url:location.href,status:'complete',active:true}),create:async()=>({id:1}),update:async()=>({}),getZoom:async()=>1,captureVisibleTab:()=>browserScreenshot(),onRemoved:{addListener(){}}},
   windows:{get:async()=>({focused:true}),update:async()=>({})},
   permissions:{contains:async()=>false},
   runtime:{getURL:()=> 'popup',getManifest:()=>({version:'test'}),onMessage:{addListener:fn=>listeners.push(fn)}}
  };
  installManualCapture(async(_base,path,options)=>{
   const body=options.body?JSON.parse(options.body):{};let data=run;
   if(path.endsWith('/progress/'))run.status='capturing';
   if(path.endsWith('/plan/')){
    if(config.lateGemini) {await new Promise(r=>setTimeout(r,100));document.querySelector('h1').textContent='Outra tela';}
    data={...body,index:0,reason:body.controls.length?'next':'done'};
   }
   if(path.endsWith('/captures/')){const id=captures.length+1;captures.push({...body,id});data={id,duplicate:false};}
   if(path.endsWith('/action-result/')||path.endsWith('/action-intent/'))data={id:1,step_id:body.step_id,execution_id:body.execution_id};
   if(path.endsWith('/finish-procedure/')){run.agent_state={procedures:[{capture_id:body.capture_id}]};}
   if(path.endsWith('/captured/'))run.status='captured';
   return {ok:true,json:async()=>data};
  });
  const send=()=>new Promise(resolve=>listeners[0]({action:'START_MANUAL',runId:run.id},{url:'popup'},resolve));
  testResult.resume=()=>new Promise(resolve=>listeners[0]({action:'CONTINUE_MANUAL'},{url:'popup'},resolve));
  testResult.started=await send();if(config.duplicate)testResult.duplicate=await send();
 },{lateGemini,duplicate,lostActionReply});
 await p.waitForFunction(()=>testResult.store.manualCapture?.active===false,{},{timeout:30000});
 if(resume){await p.evaluate(()=>testResult.resume());await p.waitForFunction(()=>testResult.store.manualCapture?.active===false,{},{timeout:30000});}
 const result=await p.evaluate(()=>({...testResult,clicks:window.clickCount||0}));await p.close();return result;
}
test('full worker loop: capture retry, storage before action, duplicate start rejected',async()=>{
 const result=await runScan({failCapture:true,duplicate:true});assert.equal(result.store.manualCapture.status,'captured',result.store.manualCapture.message);assert.equal(result.clicks,1);assert.equal(result.captures.length,2);assert.equal(result.duplicate.success,false);
 const states=result.events.map(e=>e.state);assert.ok(states.indexOf('SAVING')<states.indexOf('EXECUTING'));assert.ok(result.captures.every(c=>c.step_id&&c.execution_id&&c.evidence.quality.stable));
});
test('full worker loop: delayed Gemini with changed scene never clicks',async()=>{
 const result=await runScan({lateGemini:true});assert.equal(result.store.manualCapture.status,'attention');assert.equal(result.clicks,0);assert.equal(result.captures.length,0);
});
test('full worker loop: lost dispatch reply resumes without repeating click',async()=>{
 const result=await runScan({lostActionReply:true,resume:true});assert.equal(result.clicks,1);assert.equal(result.store.manualCapture.status,'captured',result.store.manualCapture.message);assert.equal(result.captures.length,2);
});
