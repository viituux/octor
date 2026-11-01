/** Testes de regressão: simulações de navegador/API exercitam os contratos e verificam os efeitos observáveis sem acessar sistemas reais. */
const /* Dependência: execução dos cenários de regressão sem framework adicional. */ {test}=require('node:test');
const /* Dependência: asserções estritas do contrato observado nos testes. */ assert=require('node:assert/strict');
const /* Dependência: execução isolada dos scripts com APIs de navegador simuladas. */ vm=require('node:vm');
const /* Dependência: leitura dos arquivos fonte usados pelos testes. */ fs=require('node:fs');
const /* Dependência: composição dos caminhos dos módulos a partir da localização do teste. */ path=require('node:path');
/**
 * Simulação do contrato `fixture`: fornece a resposta/efeito controlado usado pelas asserções deste cenário.
 * @returns objeto com api, element, selectors, doc.
 */
function fixture() {
 const nodes=[]; const selectors=new Map();
 const doc={/* Simulação do contrato `querySelectorAll`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param query — valor recebido do contexto chamador. | @returns expressão calculada/comparada no corpo. | @throws exceção do fluxo nos ramos que rejeitam a operação; blocos catch mantêm o tratamento existente. */ querySelectorAll(query){ if(query==='[') throw Error('invalid selector'); return selectors.get(query) || (query.includes('button,a,input') ? nodes : []); }, /* Simulação do contrato `getElementById`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param id — identificador do recurso ou elemento alvo. | @returns resultado de nodes.find(...). */ getElementById(id){return nodes.find(n=>n.id===id);}};
 const sandbox={getComputedStyle:/* Simulação do contrato `getComputedStyle`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param el — valor recebido do contexto chamador. | @returns valor calculado no corpo. */ el=>({visibility:el.hidden?'hidden':'visible',display:'block',opacity:'1'}),CSS:{escape:/* Simulação do contrato `escape`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param value — valor recebido pelo controle ou transformação. | @returns value. */ value=>value},document:doc};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../targets.js'),'utf8'),sandbox);
 /**
  * Simulação do contrato `element`: fornece a resposta/efeito controlado usado pelas asserções deste cenário.
  * @param text — instrução textual do passo.
  * @param attrs — valor recebido do contexto chamador (padrão: {}).
  * @param tag — valor recebido do contexto chamador (padrão: 'BUTTON').
  * @returns el.
  */
 function element(text,attrs={},tag='BUTTON') {
  const el={tagName:tag,nodeType:1,id:attrs.id||'',ownerDocument:doc,innerText:text,textContent:text,labels:[],parentElement:null,hidden:false,
   getAttribute:/* Simulação do contrato `getAttribute`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param key — valor recebido do contexto chamador. | @returns expressão calculada/comparada no corpo. */ key=>attrs[key]||null,/* Simulação do contrato `getBoundingClientRect`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns objeto com left, top, width, height. */ getBoundingClientRect(){return {left:10,top:20,width:100,height:40};}};
  nodes.push(el); return el;
 }
 return {api:sandbox.AutoGuideTargets,element,selectors,doc};
}
test('recovers changed generated ID by accessible name',/* Simulação do contrato `evento recovers changed generated ID by accessible name`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{
 const f=fixture(); const target=f.element('Enviar',{'aria-label':'Enviar mensagem'});
 assert.equal(f.api.resolve({selector:'#ember-old',element_text:'Enviar mensagem'}).element,target);
});
test('ignores hidden duplicate and chooses visible button',/* Simulação do contrato `evento ignores hidden duplicate and chooses visible button`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{
 const f=fixture(); const hidden=f.element('Salvar'); hidden.hidden=true; const visible=f.element('Salvar');
 f.selectors.set('.save',[hidden,visible]);
 assert.equal(f.api.resolve({selector:'.save',element_text:'Salvar'}).element,visible);
});
test('does not highlight first of two equally matching controls',/* Simulação do contrato `evento does not highlight first of two equally matching controls`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{
 const f=fixture(); f.element('Conectar'); f.element('Conectar');
 const result=f.api.resolve({selector:'.missing',element_text:'Conectar'});
 assert.equal(result.element,null); assert.equal(result.ambiguous,true);
});
test('rejects stale selector pointing at different button',/* Simulação do contrato `evento rejects stale selector pointing at different button`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{
 const f=fixture(); const wrong=f.element('Excluir'); const right=f.element('Salvar');
 f.selectors.set('#old',[wrong]);
 assert.equal(f.api.resolve({selector:'#old',element_text:'Salvar'}).element,right);
});
test('invalid selector still resolves by field label',/* Simulação do contrato `evento invalid selector still resolves by field label`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{
 const f=fixture(); const field=f.element('',{'placeholder':'Pesquisar'},'INPUT');
 assert.equal(f.api.resolve({selector:'[',target:{tag:'input',label:'Pesquisar'}}).element,field);
});
test('keeps legacy unique selectors with no label',/* Simulação do contrato `evento keeps legacy unique selectors with no label`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{
 const f=fixture(); const button=f.element('Continuar'); f.selectors.set('#old',[button]);
 assert.equal(f.api.resolve({selector:'#old'}).element,button);
});
test('structural selector includes first sibling position',/* Simulação do contrato `evento structural selector includes first sibling position`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{
 const f=fixture(); const first=f.element('Um'); const second=f.element('Dois');
 const parent={tagName:'DIV',nodeType:1,parentElement:null,id:'',children:[first,second]};
 first.parentElement=parent; second.parentElement=parent;
 f.selectors.set('button:nth-of-type(1)',[first]);
 assert.equal(f.api.selector(first),'button:nth-of-type(1)');
});
test('labelledby uses text of referenced accessible label',/* Simulação do contrato `evento labelledby uses text of referenced accessible label`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{
 const f=fixture(); f.element('Mensagem',{id:'field-label'},'LABEL'); const field=f.element('',{'aria-labelledby':'field-label'},'INPUT');
 assert.equal(f.api.describe(field).label,'Mensagem');
});
