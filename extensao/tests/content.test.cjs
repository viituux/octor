/** Testes de regressão: simulações de navegador/API exercitam os contratos e verificam os efeitos observáveis sem acessar sistemas reais. */

const /* Dependência: execução dos cenários de regressão sem framework adicional. */ {test}=require('node:test');
const /* Dependência: asserções estritas do contrato observado nos testes. */ assert=require('node:assert/strict');
const /* Dependência: leitura dos arquivos fonte usados pelos testes. */ fs=require('node:fs');
const /* Dependência: execução isolada dos scripts com APIs de navegador simuladas. */ vm=require('node:vm');
const /* Dependência: composição dos caminhos dos módulos a partir da localização do teste. */ path=require('node:path');
/**
 * Simulação do contrato `fixture`: fornece a resposta/efeito controlado usado pelas asserções deste cenário.
 * @returns objeto com load, events, messages, listeners, Element.
 */
function fixture() {
 const events={};const messages=[];const listeners=[];
 class Element {
  /**
   * Simulação do contrato `constructor`: fornece a resposta/efeito controlado usado pelas asserções deste cenário.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  constructor(){this.tagName='BUTTON';this.innerText='Salvar';}
  /**
   * Simulação do contrato `closest`: fornece a resposta/efeito controlado usado pelas asserções deste cenário.
   * @returns valor calculado no corpo.
   */
  closest(){return this;}
  /**
   * Simulação do contrato `getAttribute`: fornece a resposta/efeito controlado usado pelas asserções deste cenário.
   * @returns null.
   */
  getAttribute(){return null;}
  /**
   * Simulação do contrato `getBoundingClientRect`: fornece a resposta/efeito controlado usado pelas asserções deste cenário.
   * @returns objeto com top, left, width, height.
   */
  getBoundingClientRect(){return {top:10,left:10,width:100,height:40};}
 }
 const context=vm.createContext({Element,Date,Math,WeakSet,WeakMap,window:{location:{href:'https://example.com'},innerWidth:1200,innerHeight:800,devicePixelRatio:1},
  AutoGuideTargets:{actionable:'button',selector:/* Constrói um seletor verificado como único, usando atributos estáveis antes do caminho estrutural. | @returns string. */ ()=> '#save',describe:/* Registra a identidade do alvo com tag, rótulo e atributos usados na resolução posterior. | @returns valor calculado no corpo. */ ()=>({tag:'button',label:'Salvar'})},
  document:{/* Simulação do contrato `addEventListener`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param name — nome de apresentação do recurso. | @param fn — valor recebido do contexto chamador. | @returns void/undefined; efeitos nas operações do corpo. */ addEventListener(name,fn){(events[name]||=[]).push(fn);}},
  chrome:{runtime:{onMessage:{/* Simulação do contrato `addListener`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param fn — valor recebido do contexto chamador. | @returns void/undefined; efeitos nas operações do corpo. */ addListener(fn){listeners.push(fn);}},/* Simulação do contrato `sendMessage`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param payload — valor recebido do contexto chamador. | @returns resultado de Promise.resolve(...). */ sendMessage(payload){messages.push(payload);return Promise.resolve({success:true});}},
   storage:{local:{/* Simulação do contrato `get`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param keys — valor recebido do contexto chamador. | @param callback — valor recebido do contexto chamador. | @returns void/undefined; efeitos nas operações do corpo. */ get(keys,callback){callback({isRecording:true,isPaused:false});}},onChanged:{/* Simulação do contrato `addListener`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ addListener(){}}}}});
 const source=fs.readFileSync(path.join(__dirname,'../content.js'),'utf8');
 const load=/* Simulação do contrato `load`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns resultado de vm.runInContext(...). */ ()=>vm.runInContext(source,context);load();
 return {load,events,messages,listeners,Element};
}
test('click reaches the worker with selector and target identity',/* Simulação do contrato `evento click reaches the worker with selector and target identity`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{
 const f=fixture();f.events.click[0]({isTrusted:true,target:new f.Element(),clientX:25,clientY:30});
 assert.equal(f.messages.length,1);assert.equal(f.messages[0].eventData.selector,'#save');
 assert.equal(f.messages[0].eventData.target.label,'Salvar');
});
test('reinjection does not register duplicate event handlers',/* Simulação do contrato `evento reinjection does not register duplicate event handlers`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{
 const f=fixture();f.load();assert.equal(f.events.click.length,1);assert.equal(f.listeners.length,1);
 let response;f.listeners[0]({action:'RECORDER_READY'},{},value=>response=value);
 assert.equal(response.ready,true);
});

test('two real clicks produce exactly two recorded actions',/* Simulação do contrato `evento two real clicks produce exactly two recorded actions`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{
 const f=fixture(); const target=new f.Element();
 f.events.click[0]({isTrusted:true,target,clientX:10,clientY:20});
 f.events.click[0]({isTrusted:true,target,clientX:10,clientY:20});
 assert.equal(f.messages.filter(m=>m.action==='ACTION_PERFORMED').length,2);
 assert.notEqual(f.messages[0].eventData.event_id,f.messages[1].eventData.event_id);
});
test('automatic clicks and change events produce no actions',/* Simulação do contrato `evento automatic clicks and change events produce no actions`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{
 const f=fixture();const target=new f.Element();target.tagName='INPUT';target.value='100';
 for(let i=0;i<28;i++) { f.events.click[0]({isTrusted:false,target}); f.events.change[0]({isTrusted:false,target}); }
 f.events.change[0]({isTrusted:true,target});
 assert.equal(f.messages.length,0);
});
test('user editing commits once and duplicate values are ignored',/* Simulação do contrato `evento user editing commits once and duplicate values are ignored`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{
 const f=fixture(); const target=new f.Element(); target.tagName='INPUT';target.value='100';
 f.events.input[0]({isTrusted:true,target}); f.events.change[0]({isTrusted:true,target});
 f.events.input[0]({isTrusted:true,target}); f.events.change[0]({isTrusted:true,target});
 assert.equal(f.messages.length,1);assert.equal(f.messages[0].eventData.action_type,'input');
 target.value='200';f.events.input[0]({isTrusted:true,target});f.events.change[0]({isTrusted:true,target});
 assert.equal(f.messages.length,2);
});

test('context requests retain the original target after a later pointer interaction',/* Simulação do contrato `evento context requests retain the original target after a later pointer interaction`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{
 const f=fixture(); const first=new f.Element(),second=new f.Element();
 first.getBoundingClientRect=()=>({left:10,top:10,width:100,height:40});second.getBoundingClientRect=()=>({left:200,top:200,width:100,height:40});
 f.events.pointerdown[0]({isTrusted:true,target:first});const firstId=f.messages[0].eventData.capture_id;
 f.events.pointerdown[0]({isTrusted:true,target:second});
 let response;f.listeners[0]({action:'CAPTURE_CONTEXT',capture_id:firstId},{},value=>response=value);
 assert.deepEqual(Array.from(response.target_rect),[10,10,100,40]);
 f.listeners[0]({action:'CAPTURE_CONTEXT',capture_id:'unknown'},{},value=>response=value);
 assert.equal(response,null);
});
