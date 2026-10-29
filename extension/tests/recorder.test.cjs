const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function recorder(fetchImpl) {
 const state = {isRecording:true,isPaused:false,recordedSteps:[],authToken:'test',apiBase:'http://localhost/api'};
 let listener; let installed; let externalListener;
 const context = {console, URL, setTimeout, fetch:fetchImpl, chrome:{
  runtime:{onMessageExternal:{addListener(fn){externalListener=fn;}},onInstalled:{addListener(fn){installed=fn;}},onMessage:{addListener(fn){listener=fn;}}},
  storage:{local:{async get(keys){return typeof keys === 'string' ? {[keys]:state[keys]} : keys ? Object.fromEntries(keys.map(k=>[k,state[k]])) : {...state};},async set(values){Object.assign(state,values);}, async remove(key){for(const k of Array.isArray(key)?key:[key])delete state[k];}}},
  scripting:{async executeScript(){}}, tabs:{async sendMessage(){return {ready:true};},async get(){return {id:10};},async query(){return [{id:1,url:'https://www.linkedin.com/feed/'}];},async captureVisibleTab(){await new Promise(r=>setTimeout(r,5)); return 'data:image/jpeg;base64,aGVsbG8=';},create(){}},
  action:{setBadgeText(){},setBadgeBackgroundColor(){}}
 }};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../background.js'),'utf8').replace("import './playback-background.js';", ''),context);
 return {state,installed,external:(message,sender,respond)=>externalListener(message,sender,respond),chrome:context.chrome,offset:context.liveOffset,send:(message,tab=1)=>new Promise(resolve=>listener(message,{tab:{id:tab,windowId:1}},resolve))};
}
test('rapid actions keep every step in order',async()=>{
 const r=recorder();
 await Promise.all(Array.from({length:5},(_,i)=>r.send({action:'ACTION_PERFORMED',eventData:{element_text:String(i)}})));
 assert.equal(r.state.recordedSteps.length,5);
 assert.deepEqual(Array.from(r.state.recordedSteps,s=>s.order),[1,2,3,4,5]);
});
test('background tab actions are preserved without wrong screenshots',async()=>{
 const r=recorder(); await r.send({action:'ACTION_PERFORMED',eventData:{}},2);
 assert.equal(r.state.recordedSteps.length,1); assert.equal(r.state.recordedSteps[0].screenshot_base64,null);
});
test('retry reuses guide and preserves paused steps on failed upload',async()=>{
 let creations=0; let uploads=0;
 const r=recorder(async url=>{
  if(url.endsWith('/guides/')) {creations++; return {ok:true,json:async()=>({id:42})};}
  uploads++; return uploads===1 ? {ok:false,status:500,json:async()=>({error:'failed'})} : {ok:true,json:async()=>({created_count:1,errors:null})};
 });
 await r.send({action:'ACTION_PERFORMED',eventData:{}});
 const failed=await r.send({action:'FINISH_RECORDING'});
 assert.equal(failed.success,false); assert.equal(r.state.isPaused,true); assert.equal(r.state.recordedSteps.length,1);
 const success=await r.send({action:'FINISH_RECORDING'});
 assert.equal(success.success,true); assert.equal(creations,1); assert.equal(r.state.recordedSteps.length,0);
});

test('active tutorial prevents recording',async()=>{
 const r=recorder(); r.state.isRecording=false; r.state.playback={tabId:10};
 const result=await r.send({action:'START_RECORDING'});
 assert.equal(result.success,false); assert.match(result.error,/tutorial ativo/); assert.equal(r.state.isRecording,false);
});
test('closed tutorial tab does not block recording',async()=>{
 const r=recorder(); r.state.isRecording=false; r.state.playback={tabId:99};
 r.chrome.tabs.get=async()=>{throw Error('Tab closed');};
 assert.equal((await r.send({action:'START_RECORDING'})).status,'started');
 assert.equal(r.state.playback,undefined); assert.equal(r.state.isRecording,true);
});
test('missing recorder is injected into existing tab',async()=>{
 const r=recorder(); r.state.isRecording=false; let ready=false; let injections=0;
 r.chrome.tabs.sendMessage=async()=>({ready});
 r.chrome.scripting.executeScript=async()=>{injections++;ready=true;};
 assert.equal((await r.send({action:'START_RECORDING'})).status,'started'); assert.equal(injections,1);
});
test('failed injection leaves recording off',async()=>{
 const r=recorder(); r.state.isRecording=false;
 r.chrome.tabs.sendMessage=async()=>{throw Error('No receiver');};
 r.chrome.scripting.executeScript=async()=>{throw Error('Cannot inject');};
 assert.equal((await r.send({action:'START_RECORDING'})).success,false); assert.equal(r.state.isRecording,false);
});
test('screenshot failure preserves step and warning',async()=>{
 const r=recorder(); const event=imageEvent(); r.chrome.tabs.sendMessage=async()=>event.capture_context;
 r.chrome.tabs.captureVisibleTab=async()=>{throw Error('Screenshot limit');};
 await r.send({action:'ACTION_PERFORMED',eventData:event});
 assert.equal(r.state.recordedSteps.length,1); assert.equal(r.state.recordedSteps[0].screenshot_base64,null);
 assert.match(r.state.captureError,/Passo salvo sem imagem/);
});

function imageEvent(id='one') {
 return {capture_id:id, capture_context:{document_id:'doc',interaction:1,url:'https://example.com',scroll_x:0,scroll_y:0,width:1200,height:800},timestamp:Date.now(),url:'https://example.com'};
}
test('prepared image is reused by the matching click exactly once',async()=>{
 const r=recorder(); const event=imageEvent(); let calls=0;
 r.chrome.tabs.sendMessage=async()=>event.capture_context;
 r.chrome.tabs.captureVisibleTab=async()=>{calls++;return 'image-data';};
 await r.send({action:'PREPARE_CAPTURE',eventData:event});
 await r.send({action:'ACTION_PERFORMED',eventData:event});
 assert.equal(calls,1);assert.equal(r.state.recordedSteps[0].screenshot_base64,'image-data');
 assert.equal(r.state.recordedSteps[0].annotations[0].image_phase,'pointerdown');
});
test('navigation during screenshot discards image but keeps the action',async()=>{
 const r=recorder(); const event=imageEvent();let probes=0;
 r.chrome.tabs.sendMessage=async()=>++probes===1 ? event.capture_context : {...event.capture_context,document_id:'new-document'};
 await r.send({action:'ACTION_PERFORMED',eventData:event});
 assert.equal(r.state.recordedSteps.length,1);assert.equal(r.state.recordedSteps[0].screenshot_base64,null);
 assert.equal(r.state.recordedSteps[0].annotations[0].image_status,'page_changed');
});
test('rapid clicks respect capture budget and retain all steps',async()=>{
 const r=recorder(); const event=imageEvent();let calls=0;
 r.chrome.tabs.sendMessage=async()=>event.capture_context;
 r.chrome.tabs.captureVisibleTab=async()=>{calls++;return 'image';};
 await r.send({action:'ACTION_PERFORMED',eventData:event});
 await r.send({action:'ACTION_PERFORMED',eventData:{...event,capture_id:'two'}});
 assert.equal(calls,2);assert.equal(r.state.recordedSteps.length,2);
 assert.equal(r.state.recordedSteps[1].annotations[0].image_status,'captured');
});
test('stale queued actions do not receive current screenshots',async()=>{
 const r=recorder();let calls=0;r.chrome.tabs.captureVisibleTab=async()=>{calls++;};
 await r.send({action:'ACTION_PERFORMED',eventData:{...imageEvent(),timestamp:Date.now()-6000}});
 assert.equal(calls,0);assert.equal(r.state.recordedSteps[0].annotations[0].image_status,'expired');
});

test('the same event delivered twice is persisted once',async()=>{
 const r=recorder(); const event={...imageEvent(),event_id:'doc:unique:1'};
 await r.send({action:'ACTION_PERFORMED',eventData:event});
 const response=await r.send({action:'ACTION_PERFORMED',eventData:event});
 assert.equal(response.duplicate,true);assert.equal(r.state.recordedSteps.length,1);
 await r.send({action:'ACTION_PERFORMED',eventData:{...event,event_id:'doc:unique:2'}});
 assert.equal(r.state.recordedSteps.length,2);
});

test('live audio offsets exclude pauses even for actions queued before pause',()=>{
 const r=recorder();const clock={startedAt:1000,pauses:[{start:3000,end:5000}],pausedAt:8000};
 assert.equal(r.offset(clock,2000),1);assert.equal(r.offset(clock,6000),3);assert.equal(r.offset(clock,9000),5);
});
test('failed audio upload retries without duplicating steps',async()=>{
 let creates=0,bulks=0,uploads=0;const r=recorder(async url=>{
  if(url.endsWith('/guides/')){creates++;return {ok:true,json:async()=>({id:123})};}
  bulks++;return {ok:true,json:async()=>({created_count:2,errors:null})};
 });
 const voice={sessionId:'voice',tabId:7,clock:{startedAt:Date.now()-10000,pauses:[],pausedAt:null}};
 r.state.liveVoice=voice;
 r.state.recordedSteps=[{annotations:[{type:'capture_metadata',voice_offset:2}]},{annotations:[{type:'capture_metadata',voice_offset:6}]}];
 r.chrome.runtime.sendMessage=async message=>{
  if(message.command==='pause') return {success:true,clock:voice.clock};
  if(message.command==='freeze')return {success:true,duration:10};
  if(message.command==='upload')return ++uploads===1 ? {success:false,error:'Network failed'}:{success:true};
  return {success:true};
 };
 r.chrome.tabs.remove=async()=>{};
 assert.equal((await r.send({action:'FINISH_RECORDING'})).success,false);
 assert.equal(r.state.pendingStepsUploaded,true);
 const ranges=r.state.recordedSteps.map(step=>step.annotations.find(a=>a.type==='live_narration'));
 assert.equal(ranges[0].start,0);assert.equal(ranges[0].end,2);assert.equal(ranges[1].start,2);assert.equal(ranges[1].end,10);
 assert.equal((await r.send({action:'FINISH_RECORDING'})).success,true);
 assert.equal(creates,1);assert.equal(bulks,1);assert.equal(uploads,2);
});
test('unavailable microphone preserves steps until explicitly skipped',async()=>{
 const r=recorder(async url=>({ok:true,json:async()=>url.endsWith('/guides/')?{id:123}:{created_count:1,errors:null}}));
 r.state.liveVoice={sessionId:'lost',tabId:7};r.state.recordedSteps=[{annotations:[]}];
 r.chrome.runtime.sendMessage=async()=>{throw Error('Mic tab closed');};
 assert.equal((await r.send({action:'FINISH_RECORDING'})).success,false);assert.equal(r.state.recordedSteps.length,1);
 assert.equal((await r.send({action:'FINISH_RECORDING',skipAudio:true})).success,true);
});

test('browser pairing verifies identity before connecting the extension',async()=>{
 const r=recorder(async()=>({ok:true,json:async()=>({username:'ana'})}));r.state.isRecording=false;
 const response=await new Promise(resolve=>r.external({action:'CONNECT_ACCOUNT',access:'access',refresh:'refresh'},{url:'http://localhost:4200/account'},resolve));
 assert.equal(response.success,true);assert.equal(r.state.currentUser,'ana');assert.equal(r.state.authToken,'access');
});
test('browser pairing rejects unrelated origins and active recordings',async()=>{
 const r=recorder();let answered=false;
 assert.equal(r.external({action:'CONNECT_ACCOUNT'},{url:'https://unrelated.example/account'},()=>answered=true),false);assert.equal(answered,false);
 const response=await new Promise(resolve=>r.external({action:'CONNECT_ACCOUNT',access:'access',refresh:'refresh'},{url:'http://localhost:4200/account'},resolve));
 assert.equal(response.success,false);assert.equal(r.state.authToken,'test');
});


test('unrelated DOM updates and subsequent interactions do not discard a stable target image',async()=>{
 const r=recorder(); const event=imageEvent();
 event.capture_context={...event.capture_context,dom_revision:1,target_rect:[10,10,100,40],target_state:{label:'Salvar'}};
 r.chrome.tabs.sendMessage=async()=>({...event.capture_context,interaction:4,dom_revision:99});
 await r.send({action:'ACTION_PERFORMED',eventData:event});
 assert.ok(r.state.recordedSteps[0].screenshot_base64);
});
test('moved, covered or changed controls still reject an inaccurate image',async()=>{
 for(const change of [{target_rect:[99,99,100,40]},{target_state:{label:'Excluir'}},{target_visible:false}]){
 const r=recorder(); const event=imageEvent();event.capture_context={...event.capture_context,target_rect:[10,10,100,40],target_state:{label:'Salvar'}};
 r.chrome.tabs.sendMessage=async()=>({...event.capture_context,...change});
 await r.send({action:'ACTION_PERFORMED',eventData:event});
 assert.equal(r.state.recordedSteps[0].screenshot_base64,null);
 }
});
test('failed preparation retries against the action context',async()=>{
 const r=recorder(); const event=imageEvent();let beforeAction=true;
 r.chrome.tabs.sendMessage=async()=>beforeAction ? {...event.capture_context,document_id:'old'} : event.capture_context;
 await r.send({action:'PREPARE_CAPTURE',eventData:event});beforeAction=false;
 await r.send({action:'ACTION_PERFORMED',eventData:event});
 assert.ok(r.state.recordedSteps[0].screenshot_base64);
 assert.equal(r.state.recordedSteps[0].annotations[0].image_phase,'action');
});
test('each queued action probes its own capture target identifier',async()=>{
 const r=recorder();const first=imageEvent('first'),second=imageEvent('second');
 first.capture_context={...first.capture_context,target_rect:[10,10,100,40]};second.capture_context={...second.capture_context,target_rect:[200,200,100,40]};
 const events={first,second};r.chrome.tabs.sendMessage=async(tab,message)=>events[message.capture_id].capture_context;
 await Promise.all([r.send({action:'ACTION_PERFORMED',eventData:first}),r.send({action:'ACTION_PERFORMED',eventData:second})]);
 assert.equal(r.state.recordedSteps.length,2);assert.ok(r.state.recordedSteps.every(step=>step.screenshot_base64));
});

test('expired token renews once and retries guide creation with the same body',async()=>{
 let refreshes=0;const creates=[],bulks=[];
 const r=recorder(async(url,options)=>{
  if(url.endsWith('/auth/refresh/')){refreshes++;assert.equal(JSON.parse(options.body).refresh,'refresh-test');return {ok:true,json:async()=>({access:'fresh-access',refresh:'rotated-refresh'})};}
  if(url.endsWith('/guides/')){creates.push(options);return creates.length===1?{ok:false,status:401}:{ok:true,status:201,json:async()=>({id:77})};}
  bulks.push(options);return {ok:true,json:async()=>({created_count:1,errors:null})};
 });r.state.refreshToken='refresh-test';r.state.recordedSteps=[{text:'Original',annotations:[]}];
 const response=await r.send({action:'FINISH_RECORDING'});assert.equal(response.success,true);assert.equal(refreshes,1);assert.equal(creates.length,2);assert.equal(creates[0].body,creates[1].body);assert.equal(creates[1].headers.Authorization,'Bearer fresh-access');assert.equal(bulks[0].headers.Authorization,'Bearer fresh-access');assert.equal(r.state.refreshToken,'rotated-refresh');
});
test('expiration while uploading steps renews without creating another guide',async()=>{
 let creates=0,bulks=0,refreshes=0;
 const r=recorder(async(url)=>{
  if(url.endsWith('/auth/refresh/')){refreshes++;return {ok:true,json:async()=>({access:'new'})};}
  if(url.endsWith('/guides/')){creates++;return {ok:true,json:async()=>({id:77})};}
  bulks++;return bulks===1?{ok:false,status:401}:{ok:true,json:async()=>({created_count:1,errors:null})};
 });r.state.refreshToken='refresh';r.state.recordedSteps=[{annotations:[]}];
 assert.equal((await r.send({action:'FINISH_RECORDING'})).success,true);assert.equal(creates,1);assert.equal(bulks,2);assert.equal(refreshes,1);
});
test('expired refresh token keeps paused recording and pending audio',async()=>{
 const r=recorder(async url=>url.endsWith('/auth/refresh/')?{ok:false,status:401}:{ok:false,status:401});
 r.state.refreshToken='expired';r.state.recordedSteps=[{text:'Preservado',annotations:[]}];
 r.state.liveVoice={sessionId:'voice',tabId:7,clock:{startedAt:Date.now()-1000,pauses:[]}};
 r.chrome.runtime.sendMessage=async msg=>msg.command==='freeze'?{success:true,duration:1}:{success:true,clock:r.state.liveVoice.clock};
 const response=await r.send({action:'FINISH_RECORDING'});assert.equal(response.success,false);assert.match(response.error,/sessão expirou/);assert.equal(r.state.isPaused,true);assert.equal(r.state.recordedSteps.length,1);assert.equal(r.state.liveVoice.frozen,true);assert.equal(r.state.authToken,undefined);assert.equal(r.state.refreshToken,undefined);
});
test('audio upload renews expired access and retries without re-uploading steps',async()=>{
 let creates=0,bulks=0,refreshes=0,uploads=0;const tokens=[];
 const r=recorder(async url=>{
  if(url.endsWith('/auth/refresh/')){refreshes++;return {ok:true,json:async()=>({access:'audio-new'})};}
  if(url.endsWith('/guides/')){creates++;return {ok:true,json:async()=>({id:77})};}
  bulks++;return {ok:true,json:async()=>({created_count:1,errors:null})};
 });r.state.refreshToken='refresh';r.state.recordedSteps=[{annotations:[]}];r.state.liveVoice={sessionId:'voice',tabId:7,clock:{startedAt:Date.now()-1000,pauses:[]}};
 r.chrome.tabs.remove=async()=>{};r.chrome.runtime.sendMessage=async msg=>{
  if(msg.command==='freeze')return {success:true,duration:1};
  if(msg.command==='pause')return {success:true,clock:r.state.liveVoice.clock};
  if(msg.command==='upload'){tokens.push(msg.token);return ++uploads===1?{success:false,status:401,error:'Unauthorized'}:{success:true};}
 };
 const result=await r.send({action:'FINISH_RECORDING'});assert.equal(result.success,true);assert.equal(creates,1);assert.equal(bulks,1);assert.equal(refreshes,1);assert.deepEqual(tokens,['test','audio-new']);assert.match(result.editorUrl,/generate=voice/);
});
test('refresh rejection never causes an infinite retry loop',async()=>{
 let calls=0,refreshes=0;
 const r=recorder(async url=>{if(url.endsWith('/auth/refresh/')){refreshes++;return {ok:true,json:async()=>({access:'still-invalid'})};}calls++;return {ok:false,status:401};});
 r.state.refreshToken='refresh';r.state.recordedSteps=[{annotations:[]}];
 assert.equal((await r.send({action:'FINISH_RECORDING'})).success,false);assert.equal(calls,2);assert.equal(refreshes,1);assert.equal(r.state.recordedSteps.length,1);
});
test('temporary refresh server failure preserves credentials and capture',async()=>{
 const r=recorder(async url=>url.endsWith('/auth/refresh/')?{ok:false,status:503}:{ok:false,status:401});
 r.state.refreshToken='refresh';r.state.recordedSteps=[{annotations:[]}];
 assert.equal((await r.send({action:'FINISH_RECORDING'})).success,false);assert.equal(r.state.authToken,'test');assert.equal(r.state.refreshToken,'refresh');assert.equal(r.state.recordedSteps.length,1);
});
