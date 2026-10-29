const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
function host(fetchImpl) {
 const buttons={start:{},stop:{},status:{}};const handlers={};let messageHandler;let releases=0;let time=1000;let captures=0;
 class Recorder { static isTypeSupported(){return true;} constructor(){this.state='inactive';this.mimeType='audio/webm';} start(){this.state='recording';}pause(){this.state='paused';}resume(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['audio'])});this.onstop?.();} }
 for(const key of ['start','stop'])buttons[key].addEventListener=(type,fn)=>handlers[key]=fn;
 const sandbox={document:{getElementById:id=>buttons[id]},location:{search:'?tab=42&title=Teste'},crypto:{randomUUID:()=> 'session'},URLSearchParams,MediaRecorder:Recorder,Blob,FormData,AbortController,
  navigator:{mediaDevices:{async getUserMedia(){return {getTracks:()=>[{stop(){releases++;}}]};}}},
  Date:class extends Date {static now(){return time;}},setTimeout:()=>1,clearTimeout(){},
  window:{addEventListener(){}},fetch:fetchImpl || (async()=>({ok:true})),
  chrome:{tabs:{async update(id){assert.equal(id,42);}},runtime:{async sendMessage(message){if(message.action==='START_RECORDING'){captures++;return {status:'started'};}return {success:true};},onMessage:{addListener(fn){messageHandler=fn;}}}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../live-recorder.js'),'utf8'),sandbox);
 return {buttons,handlers,time:value=>time=value,releases:()=>releases,captures:()=>captures,command:command=>new Promise(resolve=>messageHandler({target:'live-narration',sessionId:'session',...command},{},resolve))};
}
test('microphone stays active until stop and pauses are excluded from duration',async()=>{
 const r=host();await r.handlers.start();assert.equal(r.captures(),1);assert.equal(r.releases(),0);
 r.time(3000);await r.command({command:'pause',pause:true});r.time(6000);await r.command({command:'pause',pause:false});r.time(10000);
 const frozen=await r.command({command:'freeze'});assert.equal(frozen.success,true);assert.equal(frozen.duration,6);assert.ok(r.releases()>0);
 const again=await r.command({command:'freeze'});assert.equal(again.duration,6);
});
test('finalized recording can upload without opening microphone again',async()=>{
 const r=host();await r.handlers.start();r.time(5000);await r.command({command:'freeze'});
 assert.equal((await r.command({command:'upload',apiBase:'http://localhost:8000/api',guideId:1,token:'test'})).success,true);
 assert.equal(r.captures(),1);assert.equal((await r.command({command:'pause',pause:false})).success,false);
});

test('unauthorized audio upload reports status and keeps audio for retry',async()=>{
 let calls=0;const r=host(async()=>++calls===1?{ok:false,status:401}:{ok:true});await r.handlers.start();r.time(5000);
 const first=await r.command({command:'upload',apiBase:'http://localhost/api',guideId:1,token:'expired'});
 assert.equal(first.success,false);assert.equal(first.status,401);
 const retry=await r.command({command:'upload',apiBase:'http://localhost/api',guideId:1,token:'renewed'});
 assert.equal(retry.success,true);assert.equal(r.captures(),1);assert.equal(calls,2);
});
