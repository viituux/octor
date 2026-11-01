/** Testes de regressão: simulações de navegador/API exercitam os contratos e verificam os efeitos observáveis sem acessar sistemas reais. */
const /* Dependência: execução dos cenários de regressão sem framework adicional. */ {test}=require('node:test');const /* Dependência: asserções estritas do contrato observado nos testes. */ assert=require('node:assert/strict');const /* Dependência: execução isolada dos scripts com APIs de navegador simuladas. */ vm=require('node:vm');const /* Dependência: leitura dos arquivos fonte usados pelos testes. */ fs=require('node:fs');const /* Dependência: composição dos caminhos dos módulos a partir da localização do teste. */ path=require('node:path');
const /* string: raiz resolvida para ler os módulos/testes ou gerar os arquivos compartilhados. */ root=path.resolve(__dirname,'../..') + '/';
const ts=require(root+'front/node_modules/typescript');
const source=ts.transpileModule(fs.readFileSync(root+'front/src/app/components/guide-editor/step-narration.component.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
/**
 * Simulação do contrato `fixture`: fornece a resposta/efeito controlado usado pelas asserções deste cenário.
 * @param getMedia — valor recebido do contexto chamador.
 * @returns objeto com component, service, stream, recorder, released.
 */
function fixture(getMedia) {
 let released=0;const tracks=[{/* Simulação do contrato `stop`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ stop(){released++;}}];const stream={getTracks:/* Simulação do contrato `getTracks`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns tracks. */ ()=>tracks};let recorder;
 class Recorder {
  /**
   * Simulação do contrato `isTypeSupported`: fornece a resposta/efeito controlado usado pelas asserções deste cenário.
   * @returns boolean.
   */
  static isTypeSupported(){return true;}
  /**
   * Simulação do contrato `constructor`: fornece a resposta/efeito controlado usado pelas asserções deste cenário.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  constructor(){this.state='inactive';this.mimeType='audio/webm';recorder=this;}
  /**
   * Simulação do contrato `start`: fornece a resposta/efeito controlado usado pelas asserções deste cenário.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  start(){this.state='recording';}
  /**
   * Simulação do contrato `stop`: fornece a resposta/efeito controlado usado pelas asserções deste cenário.
   * @returns void/undefined; efeitos nas operações do corpo.
   */
  stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['audio'])});this.onstop?.();}
 }
 const exports={};const core={Component:/* Simulação do contrato `Component`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns valor calculado no corpo. */ ()=>type=>type,Input:/* Simulação do contrato `Input`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns valor calculado no corpo. */ ()=>()=>{},ViewChild:/* Simulação do contrato `ViewChild`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns valor calculado no corpo. */ ()=>()=>{},Output:/* Simulação do contrato `Output`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns valor calculado no corpo. */ ()=>()=>{},EventEmitter:class{/* Simulação do contrato `emit`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ emit(){}}};
 const service={saveNarration:/* Simulação do contrato `saveNarration`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns valor calculado no corpo. */ ()=>({/* Simulação do contrato `subscribe`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param {next} — valor recebido do contexto chamador. | @returns void/undefined; efeitos nas operações do corpo. */ subscribe({next}){next({id:1,narration_url:'saved.webm'});}}),deleteNarration:/* Simulação do contrato `deleteNarration`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns valor calculado no corpo. */ ()=>({/* Simulação do contrato `subscribe`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param {next} — valor recebido do contexto chamador. | @returns void/undefined; efeitos nas operações do corpo. */ subscribe({next}){next({id:1,narration_url:null});}})};
 const context={exports,require:/* Simulação do contrato `require`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param name — nome de apresentação do recurso. | @returns valor calculado no corpo. */ name=>name==='@angular/core'?core:{},navigator:{mediaDevices:{getUserMedia:getMedia||(()=>Promise.resolve(stream))}},MediaRecorder:Recorder,Blob,URL:{createObjectURL:/* Simulação do contrato `createObjectURL`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns string. */ ()=> 'blob:preview',/* Simulação do contrato `revokeObjectURL`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ revokeObjectURL(){}},setInterval:/* Simulação do contrato `setInterval`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns number. */ ()=>1,/* Simulação do contrato `clearInterval`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ clearInterval(){}};
 vm.runInNewContext(source,context);const component=new exports.StepNarrationComponent(service);component.step={id:1,narration_url:'old.webm'};
 return {component,service,stream,recorder:/* Simulação do contrato `recorder`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns recorder. */ ()=>recorder,released:/* Simulação do contrato `released`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns released. */ ()=>released};
}
test('recording can be previewed without replacing saved audio until save',/* Simulação do contrato `evento recording can be previewed without replacing saved audio until save`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ async()=>{
 const f=fixture();await f.component.start();assert.equal(f.component.recording,true);
 f.component.stop();assert.ok(f.released()>0);assert.equal(f.component.previewUrl,'blob:preview');assert.equal(f.component.step.narration_url,'old.webm');
 f.component.save();assert.equal(f.component.step.narration_url,'saved.webm');assert.equal(f.component.draft,null);
});
test('failed save retains draft for retry',/* Simulação do contrato `evento failed save retains draft for retry`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ async()=>{
 const f=fixture();await f.component.start();f.component.stop();
 f.service.saveNarration=()=>({/* Simulação do contrato `subscribe`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param {error} — valor recebido do contexto chamador. | @returns void/undefined; efeitos nas operações do corpo. */ subscribe({error}){error();}});f.component.save();
 assert.ok(f.component.draft);assert.equal(f.component.saving,false);assert.equal(f.component.step.narration_url,'old.webm');
});
test('late microphone permission cannot record after changing step',/* Simulação do contrato `evento late microphone permission cannot record after changing step`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>resolve=r));const pending=f.component.start();f.component.ngOnChanges();resolve(f.stream);await pending;
 assert.equal(f.component.recording,false);assert.equal(f.released(),1);assert.equal(f.recorder(),undefined);
});
test('switching steps stops recording and discards unsaved audio',/* Simulação do contrato `evento switching steps stops recording and discards unsaved audio`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ async()=>{
 const f=fixture();await f.component.start();f.component.ngOnChanges();
 assert.equal(f.component.recording,false);assert.equal(f.recorder().state,'inactive');assert.equal(f.component.draft,null);assert.ok(f.released()>0);
});

test('live range saves without losing the captured target metadata',/* Simulação do contrato `evento live range saves without losing the captured target metadata`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{
 const f=fixture(); f.component.step.annotations=[{type:'capture_metadata',selector:'#button'},{type:'live_narration',start:0,end:5}];
 f.component.liveStart=1;f.component.liveEnd=4;let saved;
 f.service.updateStep=(id,data)=>({/* Simulação do contrato `subscribe`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @param {next} — valor recebido do contexto chamador. | @returns void/undefined; efeitos nas operações do corpo. */ subscribe({next}){saved=data;next({...f.component.step,...data});}});
 f.component.saveLiveRange();assert.equal(saved.annotations.length,2);assert.equal(saved.annotations[0].type,'capture_metadata');
 assert.equal(saved.annotations[1].start,1);assert.equal(f.component.saving,false);
});
test('invalid live range never reaches the backend',/* Simulação do contrato `evento invalid live range never reaches the backend`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ ()=>{
 const f=fixture();let called=false;f.service.updateStep=()=>{called=true;};f.component.liveStart=4;f.component.liveEnd=1;
 f.component.saveLiveRange();assert.equal(called,false);assert.match(f.component.message,/início/);
});

test('saving voice requests instruction generation, while preview and deletion do not',/* Simulação do contrato `evento saving voice requests instruction generation, while preview and deletion do not`: fornece a resposta/efeito controlado usado pelas asserções deste cenário. | @returns void/undefined; efeitos nas operações do corpo. */ async()=>{
 const f=fixture();let emitted=0;f.component.narrationSaved.emit=()=>emitted++;
 await f.component.start();f.component.stop();assert.equal(emitted,0);
 f.component.save();assert.equal(emitted,1);
 f.component.remove();assert.equal(emitted,1);
});
