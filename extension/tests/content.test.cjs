
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function fixture() {
 const events={};const messages=[];const listeners=[];
 class Element {
  constructor(){this.tagName='BUTTON';this.innerText='Salvar';}
  closest(){return this;}
  getAttribute(){return null;}
  getBoundingClientRect(){return {top:10,left:10,width:100,height:40};}
 }
 const context=vm.createContext({Element,Date,Math,WeakSet,WeakMap,window:{location:{href:'https://example.com'},innerWidth:1200,innerHeight:800,devicePixelRatio:1},
  AutoGuideTargets:{actionable:'button',selector:()=> '#save',describe:()=>({tag:'button',label:'Salvar'})},
  document:{addEventListener(name,fn){(events[name]||=[]).push(fn);}},
  chrome:{runtime:{onMessage:{addListener(fn){listeners.push(fn);}},sendMessage(payload){messages.push(payload);return Promise.resolve({success:true});}},
   storage:{local:{get(keys,callback){callback({isRecording:true,isPaused:false});}},onChanged:{addListener(){}}}}});
 const source=fs.readFileSync(path.join(__dirname,'../content.js'),'utf8');
 const load=()=>vm.runInContext(source,context);load();
 return {load,events,messages,listeners,Element};
}
test('click reaches the worker with selector and target identity',()=>{
 const f=fixture();f.events.click[0]({isTrusted:true,target:new f.Element(),clientX:25,clientY:30});
 assert.equal(f.messages.length,1);assert.equal(f.messages[0].eventData.selector,'#save');
 assert.equal(f.messages[0].eventData.target.label,'Salvar');
});
test('reinjection does not register duplicate event handlers',()=>{
 const f=fixture();f.load();assert.equal(f.events.click.length,1);assert.equal(f.listeners.length,1);
 let response;f.listeners[0]({action:'RECORDER_READY'},{},value=>response=value);
 assert.equal(response.ready,true);
});

test('two real clicks produce exactly two recorded actions',()=>{
 const f=fixture(); const target=new f.Element();
 f.events.click[0]({isTrusted:true,target,clientX:10,clientY:20});
 f.events.click[0]({isTrusted:true,target,clientX:10,clientY:20});
 assert.equal(f.messages.filter(m=>m.action==='ACTION_PERFORMED').length,2);
 assert.notEqual(f.messages[0].eventData.event_id,f.messages[1].eventData.event_id);
});
test('automatic clicks and change events produce no actions',()=>{
 const f=fixture();const target=new f.Element();target.tagName='INPUT';target.value='100';
 for(let i=0;i<28;i++) { f.events.click[0]({isTrusted:false,target}); f.events.change[0]({isTrusted:false,target}); }
 f.events.change[0]({isTrusted:true,target});
 assert.equal(f.messages.length,0);
});
test('user editing commits once and duplicate values are ignored',()=>{
 const f=fixture(); const target=new f.Element(); target.tagName='INPUT';target.value='100';
 f.events.input[0]({isTrusted:true,target}); f.events.change[0]({isTrusted:true,target});
 f.events.input[0]({isTrusted:true,target}); f.events.change[0]({isTrusted:true,target});
 assert.equal(f.messages.length,1);assert.equal(f.messages[0].eventData.action_type,'input');
 target.value='200';f.events.input[0]({isTrusted:true,target});f.events.change[0]({isTrusted:true,target});
 assert.equal(f.messages.length,2);
});

test('context requests retain the original target after a later pointer interaction',()=>{
 const f=fixture(); const first=new f.Element(),second=new f.Element();
 first.getBoundingClientRect=()=>({left:10,top:10,width:100,height:40});second.getBoundingClientRect=()=>({left:200,top:200,width:100,height:40});
 f.events.pointerdown[0]({isTrusted:true,target:first});const firstId=f.messages[0].eventData.capture_id;
 f.events.pointerdown[0]({isTrusted:true,target:second});
 let response;f.listeners[0]({action:'CAPTURE_CONTEXT',capture_id:firstId},{},value=>response=value);
 assert.deepEqual(Array.from(response.target_rect),[10,10,100,40]);
 f.listeners[0]({action:'CAPTURE_CONTEXT',capture_id:'unknown'},{},value=>response=value);
 assert.equal(response,null);
});
