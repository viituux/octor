const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function fixture() {
 const nodes=[]; const selectors=new Map();
 const doc={querySelectorAll(query){ if(query==='[') throw Error('invalid selector'); return selectors.get(query) || (query.includes('button,a,input') ? nodes : []); }, getElementById(id){return nodes.find(n=>n.id===id);}};
 const sandbox={getComputedStyle:el=>({visibility:el.hidden?'hidden':'visible',display:'block',opacity:'1'}),CSS:{escape:value=>value},document:doc};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../targets.js'),'utf8'),sandbox);
 function element(text,attrs={},tag='BUTTON') {
  const el={tagName:tag,nodeType:1,id:attrs.id||'',ownerDocument:doc,innerText:text,textContent:text,labels:[],parentElement:null,hidden:false,
   getAttribute:key=>attrs[key]||null,getBoundingClientRect(){return {left:10,top:20,width:100,height:40};}};
  nodes.push(el); return el;
 }
 return {api:sandbox.AutoGuideTargets,element,selectors,doc};
}
test('recovers changed generated ID by accessible name',()=>{
 const f=fixture(); const target=f.element('Enviar',{'aria-label':'Enviar mensagem'});
 assert.equal(f.api.resolve({selector:'#ember-old',element_text:'Enviar mensagem'}).element,target);
});
test('ignores hidden duplicate and chooses visible button',()=>{
 const f=fixture(); const hidden=f.element('Salvar'); hidden.hidden=true; const visible=f.element('Salvar');
 f.selectors.set('.save',[hidden,visible]);
 assert.equal(f.api.resolve({selector:'.save',element_text:'Salvar'}).element,visible);
});
test('does not highlight first of two equally matching controls',()=>{
 const f=fixture(); f.element('Conectar'); f.element('Conectar');
 const result=f.api.resolve({selector:'.missing',element_text:'Conectar'});
 assert.equal(result.element,null); assert.equal(result.ambiguous,true);
});
test('rejects stale selector pointing at different button',()=>{
 const f=fixture(); const wrong=f.element('Excluir'); const right=f.element('Salvar');
 f.selectors.set('#old',[wrong]);
 assert.equal(f.api.resolve({selector:'#old',element_text:'Salvar'}).element,right);
});
test('invalid selector still resolves by field label',()=>{
 const f=fixture(); const field=f.element('',{'placeholder':'Pesquisar'},'INPUT');
 assert.equal(f.api.resolve({selector:'[',target:{tag:'input',label:'Pesquisar'}}).element,field);
});
test('keeps legacy unique selectors with no label',()=>{
 const f=fixture(); const button=f.element('Continuar'); f.selectors.set('#old',[button]);
 assert.equal(f.api.resolve({selector:'#old'}).element,button);
});
test('structural selector includes first sibling position',()=>{
 const f=fixture(); const first=f.element('Um'); const second=f.element('Dois');
 const parent={tagName:'DIV',nodeType:1,parentElement:null,id:'',children:[first,second]};
 first.parentElement=parent; second.parentElement=parent;
 f.selectors.set('button:nth-of-type(1)',[first]);
 assert.equal(f.api.selector(first),'button:nth-of-type(1)');
});
test('labelledby uses text of referenced accessible label',()=>{
 const f=fixture(); f.element('Mensagem',{id:'field-label'},'LABEL'); const field=f.element('',{'aria-labelledby':'field-label'},'INPUT');
 assert.equal(f.api.describe(field).label,'Mensagem');
});
