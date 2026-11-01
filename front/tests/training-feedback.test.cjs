// Regressões do fluxo conteúdo → avaliação, sem dependência de perguntas ou tentativas.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const ts=require(root+'/front/node_modules/typescript');
const source=ts.transpileModule(fs.readFileSync(root+'/front/src/app/components/trainings/training-player.component.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}
}).outputText;

/** Monta o componente real com serviço simulado e foco síncrono para testar suas transições. */
function fixture(initial={started_at:null,completed_at:null,feedback:null},guided=false){
  const exports={},calls=[],progress={started_at:null,completed_at:null,feedback:null,...initial};
  const training={id:1,title:'Cadastro',status:'published',content:{steps:[{id:1,text:'Salvar'}]},progress};
  let failAction=null,gate=null;
  const service={get:async()=>training,action:async(id,action,data)=>{
    calls.push({id,action,data});
    if(action===failAction)throw {error:{detail:'Falha temporária'}};
    if(gate)await gate;
    if(action==='start')progress.started_at='2026-10-31T10:00:00Z';
    if(action==='complete')progress.completed_at='2026-10-31T10:01:00Z';
    if(action==='feedback')return {...data,created_at:'2026-10-31T10:02:00Z'};
    return {...progress};
  }};
  vm.runInNewContext(source,{
    exports,
    require:name=>name==='@angular/core'?{Component:()=>type=>type}
      :name==='rxjs'?{firstValueFrom:value=>Promise.resolve(value)}
      :name.endsWith('/training.service')?{trainingError:e=>e.error.detail}:{},
    setTimeout:fn=>{fn();return 0;},document:{getElementById:()=>({focus(){}})},
    window:{},localStorage:{getItem:()=>null},location:{origin:'http://localhost:4200'}
  });
  const route={snapshot:{paramMap:{get:()=>1},queryParamMap:{get:key=>guided&&key==='guided'?'complete':null}}};
  const component=new exports.TrainingPlayerComponent(service,route,{run:fn=>fn()});component.id=1;
  return {component,training,calls,fail:action=>failAction=action,hold:value=>gate=value};
}

test('content completion opens feedback only after the server confirms it',async()=>{
  const f=fixture();await f.component.load();await f.component.start();
  let release;f.hold(new Promise(resolve=>release=resolve));
  const pending=f.component.complete();
  assert.equal(f.component.stage,'content');assert.equal(f.component.busy,true);
  release();await pending;
  assert.equal(f.component.stage,'feedback');assert.ok(f.component.training.progress.completed_at);
  assert.deepEqual(f.calls.map(c=>c.action),['start','complete']);
});

test('failed completion stays on content and allows retry',async()=>{
  const f=fixture({started_at:'started'});await f.component.load();f.fail('complete');
  await f.component.complete();assert.equal(f.component.stage,'content');assert.equal(f.component.error,'Falha temporária');
  assert.equal(f.component.busy,false);assert.equal(f.component.training.progress.completed_at,null);
  f.fail(null);await f.component.complete();assert.equal(f.component.stage,'feedback');
});

test('existing completed content resumes at feedback despite an old unfinished quiz',async()=>{
  const f=fixture({started_at:'started',completed_at:'completed',quiz_completed:false,results:[{finished_at:null}]});
  await f.component.load();assert.equal(f.component.stage,'feedback');assert.deepEqual(f.calls,[]);
});

test('feedback failure preserves the form and a successful retry ends the flow',async()=>{
  const f=fixture({started_at:'started',completed_at:'completed'});await f.component.load();
  f.component.stars=5;f.component.comment='Muito claro.';f.fail('feedback');
  await f.component.sendFeedback();assert.equal(f.component.stage,'feedback');assert.equal(f.component.comment,'Muito claro.');
  assert.equal(f.component.stars,5);f.fail(null);await f.component.sendFeedback();
  assert.equal(f.component.stage,'done');assert.match(f.component.confirmation,/avaliou e comentou/);
});

test('existing feedback reopens confirmation and review does not create another attempt',async()=>{
  const f=fixture({started_at:'started',completed_at:'completed',feedback:{stars:4,comment:''}});
  await f.component.load();assert.equal(f.component.stage,'done');assert.doesNotMatch(f.component.confirmation,/comentou/);
  f.component.review();assert.equal(f.component.stage,'content');f.component.evaluate();assert.equal(f.component.stage,'done');
  assert.deepEqual(f.calls,[]);
});

test('guided return confirms completion and opens evaluation without quiz requests',async()=>{
  const f=fixture({started_at:'started'},true);await f.component.load();
  assert.equal(f.component.stage,'feedback');assert.deepEqual(f.calls.map(c=>c.action),['complete']);
});

test('busy operations suppress repeated submissions and invalid feedback does not send',async()=>{
  const f=fixture({started_at:'started',completed_at:'completed'});await f.component.load();
  await f.component.sendFeedback();assert.equal(f.calls.length,0);
  f.component.stars=5;f.component.comment='a'.repeat(501);await f.component.sendFeedback();assert.equal(f.calls.length,0);
  f.component.comment='Bom';let release;f.hold(new Promise(resolve=>release=resolve));
  const pending=f.component.sendFeedback();await f.component.sendFeedback();assert.equal(f.calls.length,1);
  release();await pending;assert.equal(f.component.stage,'done');
});
