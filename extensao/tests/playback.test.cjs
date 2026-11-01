/** Testes de regressão: simulações de navegador/API exercitam os contratos e verificam os efeitos observáveis sem acessar sistemas reais. */
const /* Dependência: execução dos cenários de regressão sem framework adicional. */ { test } = require('node:test');
const /* Dependência: asserções estritas do contrato observado nos testes. */ assert = require('node:assert/strict');
const /* Dependência: execução isolada dos scripts com APIs de navegador simuladas. */ vm = require('node:vm');
const /* Dependência: leitura dos arquivos fonte usados pelos testes. */ fs = require('node:fs');
const /* Dependência: composição dos caminhos dos módulos a partir da localização do teste. */ path = require('node:path');
/**
 * Simulação do contrato `player`: fornece a resposta/efeito controlado usado pelas asserções deste cenário.
 * @returns objeto com state, opened, navigated, send, start, editor, site, chrome.
 */
function player() {
 const state = {}; const opened = []; const navigated = []; let listener, removed, external;
 const chrome = {
  runtime: { onMessageExternal: { /* Simulação do contrato `addListener`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param fn — valor recebido do contexto chamador. | @returns void/undefined; efeitos nas operações do corpo. */ addListener(fn) { external = fn; } }, onMessage: { /* Simulação do contrato `addListener`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param fn — valor recebido do contexto chamador. | @returns void/undefined; efeitos nas operações do corpo. */ addListener(fn) { listener = fn; } } },
  storage: { local: {
   /**
    * Simulação do contrato `get`: fornece a resposta/efeito controlado usado pelas asserções deste cenário.
    * @param key — valor recebido do contexto chamador.
    * @returns valor calculado no corpo.
    */
   async get(key) { return typeof key === 'string' ? { [key]: state[key] } : Object.fromEntries(key.map(k => [k,state[k]])); },
   /**
    * Simulação do contrato `set`: fornece a resposta/efeito controlado usado pelas asserções deste cenário.
    * @param value — valor recebido pelo controle ou transformação.
    * @returns void/undefined; efeitos nas operações do corpo.
    */
   async set(value) { Object.assign(state, structuredClone(value)); },
   /**
    * Simulação do contrato `remove`: fornece a resposta/efeito controlado usado pelas asserções deste cenário.
    * @param key — valor recebido do contexto chamador.
    * @returns void/undefined; efeitos nas operações do corpo.
    */
   async remove(key) { delete state[key]; },
  } },
  tabs: { /* Simulação do contrato `get`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param id — identificador do recurso ou elemento alvo. | @returns objeto com id. */ async get(id) { return { id }; }, /* Simulação do contrato `create`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param options — opções da requisição. | @returns objeto com id. */ async create(options) { opened.push(options); return { id: 10 }; },
   /**
    * Simulação do contrato `update`: fornece a resposta/efeito controlado usado pelas asserções deste cenário.
    * @param id — identificador do recurso ou elemento alvo.
    * @param options — opções da requisição.
    * @returns void/undefined; efeitos nas operações do corpo.
    */
   async update(id,options) { navigated.push({ id,...options }); },
   onRemoved: { /* Simulação do contrato `addListener`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param fn — valor recebido do contexto chamador. | @returns void/undefined; efeitos nas operações do corpo. */ addListener(fn) { removed = fn; } },
  },
 };
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../playback-background.js'),'utf8'),{chrome,URL,console});
 const editor = {url:'http://localhost:4200/guides/1', tab:{id:1,url:'http://localhost:4200/guides/1'}};
 const site = {url:'https://example.com/first',tab:{id:10,url:'https://example.com/first'}};
 const send = /* Simulação do contrato `send`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param message — mensagem recebida entre os contextos da extensão. | @param sender — contexto remetente da mensagem Chrome (padrão: site). | @returns valor calculado no corpo. */ (message,sender=site) => new Promise(resolve => listener(message,sender,resolve));
 const start = /* Simulação do contrato `start`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param steps — valor recebido do contexto chamador (padrão: expressão declarada na assinatura). | @returns resultado de send(...). */ (steps=[{url:site.url,selector:'#first',text:'Primeiro'},{url:'https://example.com/second',selector:'#second',text:'Segundo'}]) => send({action:'START_PLAYBACK',title:'Guia',steps},editor);
 return {state,opened,navigated,send,start,editor,site,chrome, sendExternal: /* Simulação do contrato `sendExternal`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param message — mensagem recebida entre os contextos da extensão. | @param sender — contexto remetente da mensagem Chrome (padrão: editor). | @returns valor calculado no corpo. */ (message,sender=editor) => new Promise(resolve => external(message,sender,resolve))};
}
test('opens first step and persists session for the target tab',/* Simulação do contrato `evento opens first step and persists session for the target tab`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ async()=>{
 const r=player(); assert.equal((await r.start()).success,true);
 assert.equal(r.navigated[0].url,'https://example.com/first');
 assert.equal((await r.send({action:'GET_PLAYBACK'})).playback.index,0);
 assert.equal((await r.send({action:'GET_PLAYBACK'},r.editor)).playback,null);
});
test('rejects untrusted launch pages and unsafe URLs',/* Simulação do contrato `evento rejects untrusted launch pages and unsafe URLs`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ async()=>{
 const r=player();
 assert.equal((await r.send({action:'START_PLAYBACK',steps:[{url:'https://example.com'}]})).success,false);
 assert.equal((await r.start([{url:'javascript:alert(1)'}])).success,false);
 assert.equal(r.opened.length,0);
});
test('next navigates, persists progress, and ignores stale double clicks',/* Simulação do contrato `evento next navigates, persists progress, and ignores stale double clicks`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ async()=>{
 const r=player(); await r.start();
 await r.send({action:'MOVE_PLAYBACK',index:0,direction:1});
 assert.equal(r.state.playback.index,1);
 assert.equal(r.navigated[1].url,'https://example.com/second');
 await r.send({action:'MOVE_PLAYBACK',index:0,direction:1});
 assert.equal(r.state.playback.index,1);
});
test('other tabs cannot advance or end the tutorial',/* Simulação do contrato `evento other tabs cannot advance or end the tutorial`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ async()=>{
 const r=player(); await r.start();
 await r.send({action:'STOP_PLAYBACK'},r.editor);
 await r.send({action:'MOVE_PLAYBACK',index:0,direction:1},r.editor);
 assert.equal(r.state.playback.index,0);
});
test('back, completion and stop update stored state',/* Simulação do contrato `evento back, completion and stop update stored state`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ async()=>{
 const r=player(); await r.start();
 await r.send({action:'MOVE_PLAYBACK',index:0,direction:1});
 await r.send({action:'MOVE_PLAYBACK',index:1,direction:-1});
 assert.equal(r.state.playback.index,0);
 await r.send({action:'MOVE_PLAYBACK',index:0,direction:1});
 assert.equal((await r.send({action:'MOVE_PLAYBACK',index:1,direction:1})).completed,true);
 assert.equal(r.state.playback,undefined);
 await r.start(); await r.send({action:'STOP_PLAYBACK'});
 assert.equal(r.state.playback,undefined);
});
test('refuses playback while recording',/* Simulação do contrato `evento refuses playback while recording`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ async()=>{
 const r=player(); r.state.isRecording=true;
 assert.equal((await r.start()).success,false);
 assert.equal(r.opened.length,0);
});

test('recovers a stale session whose tab was closed',/* Simulação do contrato `evento recovers a stale session whose tab was closed`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ async()=>{
 const r=player();r.state.playback={tabId:99};r.chrome.tabs.get=async()=>{throw new Error('No tab');};
 assert.equal((await r.start()).success,true);assert.equal(r.opened.length,1);assert.equal(r.state.playback.tabId,10);
});
test('reuses an existing tutorial tab and resets its progress',/* Simulação do contrato `evento reuses an existing tutorial tab and resets its progress`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ async()=>{
 const r=player();await r.start();await r.send({action:'MOVE_PLAYBACK',index:0,direction:1});
 assert.equal((await r.start()).success,true);assert.equal(r.opened.length,1);assert.equal(r.state.playback.index,0);
});
test('paired editor launches through external messaging with origin validation',/* Simulação do contrato `evento paired editor launches through external messaging with origin validation`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ async()=>{
 const r=player();const message={action:'START_PLAYBACK',steps:[{url:'https://example.com'}]};
 assert.equal((await r.sendExternal(message,r.site)).success,false);
 assert.equal((await r.sendExternal(message)).success,true);assert.equal(r.opened.length,1);
});
test('failed navigation preserves current step for retry',/* Simulação do contrato `evento failed navigation preserves current step for retry`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ async()=>{
 const r=player();await r.start();r.chrome.tabs.update=async()=>{throw new Error('Navigation failed');};
 assert.equal((await r.send({action:'MOVE_PLAYBACK',index:0,direction:1})).success,false);
 assert.equal(r.state.playback.index,0);
});
test('invalid step URL is reported before opening a tab',/* Simulação do contrato `evento invalid step URL is reported before opening a tab`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ async()=>{
 const r=player();const result=await r.start([{url:'https://example.com'},{url:'javascript:alert(1)'}]);
 assert.match(result.error,/passo 2/);assert.equal(r.opened.length,0);
});

test('training completion returns only to its trusted application route',/* Simulação do contrato `evento training completion returns only to its trusted application route`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ async()=>{
 const r=player();const completionUrl='http://localhost:4200/trainings/7?guided=complete';
 const message={action:'START_PLAYBACK',steps:[{url:r.site.url}],completionUrl};
 assert.equal((await r.send(message,r.editor)).success,true);
 assert.equal((await r.send({action:'MOVE_PLAYBACK',index:0,direction:1})).completed,true);
 assert.equal(r.navigated.at(-1).url,completionUrl);assert.equal(r.state.playback,undefined);
});
test('rejects foreign training completion destinations and preserves state if return fails',/* Simulação do contrato `evento rejects foreign training completion destinations and preserves state if return fails`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ async()=>{
 const r=player();for(const completionUrl of ['https://evil.example/trainings/7','http://localhost:4200/account','javascript:alert(1)'])assert.equal((await r.send({action:'START_PLAYBACK',steps:[{url:r.site.url}],completionUrl},r.editor)).success,false);
 await r.send({action:'START_PLAYBACK',steps:[{url:r.site.url}],completionUrl:'http://localhost:4200/trainings/7?guided=complete'},r.editor);
 r.chrome.tabs.update=async()=>{throw new Error('Failed');};assert.equal((await r.send({action:'MOVE_PLAYBACK',index:0,direction:1})).success,false);assert.equal(r.state.playback.index,0);
});
