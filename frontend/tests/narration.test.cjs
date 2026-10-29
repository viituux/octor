const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'../..') + '/';
const ts=require(root+'frontend/node_modules/typescript');
const source=ts.transpileModule(fs.readFileSync(root+'frontend/src/app/components/guide-editor/step-narration.component.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
function fixture(getMedia) {
 let released=0;const tracks=[{stop(){released++;}}];const stream={getTracks:()=>tracks};let recorder;
 class Recorder {
  static isTypeSupported(){return true;}
  constructor(){this.state='inactive';this.mimeType='audio/webm';recorder=this;}
  start(){this.state='recording';}
  stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['audio'])});this.onstop?.();}
 }
 const exports={};const core={Component:()=>type=>type,Input:()=>()=>{},ViewChild:()=>()=>{},Output:()=>()=>{},EventEmitter:class{emit(){}}};
 const service={saveNarration:()=>({subscribe({next}){next({id:1,narration_url:'saved.webm'});}}),deleteNarration:()=>({subscribe({next}){next({id:1,narration_url:null});}})};
 const context={exports,require:name=>name==='@angular/core'?core:{},navigator:{mediaDevices:{getUserMedia:getMedia||(()=>Promise.resolve(stream))}},MediaRecorder:Recorder,Blob,URL:{createObjectURL:()=> 'blob:preview',revokeObjectURL(){}},setInterval:()=>1,clearInterval(){}};
 vm.runInNewContext(source,context);const component=new exports.StepNarrationComponent(service);component.step={id:1,narration_url:'old.webm'};
 return {component,service,stream,recorder:()=>recorder,released:()=>released};
}
test('recording can be previewed without replacing saved audio until save',async()=>{
 const f=fixture();await f.component.start();assert.equal(f.component.recording,true);
 f.component.stop();assert.ok(f.released()>0);assert.equal(f.component.previewUrl,'blob:preview');assert.equal(f.component.step.narration_url,'old.webm');
 f.component.save();assert.equal(f.component.step.narration_url,'saved.webm');assert.equal(f.component.draft,null);
});
test('failed save retains draft for retry',async()=>{
 const f=fixture();await f.component.start();f.component.stop();
 f.service.saveNarration=()=>({subscribe({error}){error();}});f.component.save();
 assert.ok(f.component.draft);assert.equal(f.component.saving,false);assert.equal(f.component.step.narration_url,'old.webm');
});
test('late microphone permission cannot record after changing step',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>resolve=r));const pending=f.component.start();f.component.ngOnChanges();resolve(f.stream);await pending;
 assert.equal(f.component.recording,false);assert.equal(f.released(),1);assert.equal(f.recorder(),undefined);
});
test('switching steps stops recording and discards unsaved audio',async()=>{
 const f=fixture();await f.component.start();f.component.ngOnChanges();
 assert.equal(f.component.recording,false);assert.equal(f.recorder().state,'inactive');assert.equal(f.component.draft,null);assert.ok(f.released()>0);
});

test('live range saves without losing the captured target metadata',()=>{
 const f=fixture(); f.component.step.annotations=[{type:'capture_metadata',selector:'#button'},{type:'live_narration',start:0,end:5}];
 f.component.liveStart=1;f.component.liveEnd=4;let saved;
 f.service.updateStep=(id,data)=>({subscribe({next}){saved=data;next({...f.component.step,...data});}});
 f.component.saveLiveRange();assert.equal(saved.annotations.length,2);assert.equal(saved.annotations[0].type,'capture_metadata');
 assert.equal(saved.annotations[1].start,1);assert.equal(f.component.saving,false);
});
test('invalid live range never reaches the backend',()=>{
 const f=fixture();let called=false;f.service.updateStep=()=>{called=true;};f.component.liveStart=4;f.component.liveEnd=1;
 f.component.saveLiveRange();assert.equal(called,false);assert.match(f.component.message,/início/);
});

test('saving voice requests instruction generation, while preview and deletion do not',async()=>{
 const f=fixture();let emitted=0;f.component.narrationSaved.emit=()=>emitted++;
 await f.component.start();f.component.stop();assert.equal(emitted,0);
 f.component.save();assert.equal(emitted,1);
 f.component.remove();assert.equal(emitted,1);
});
