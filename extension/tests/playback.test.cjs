const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function player() {
 const state = {}; const opened = []; const navigated = []; let listener, removed, external;
 const chrome = {
  runtime: { onMessageExternal: { addListener(fn) { external = fn; } }, onMessage: { addListener(fn) { listener = fn; } } },
  storage: { local: {
   async get(key) { return typeof key === 'string' ? { [key]: state[key] } : Object.fromEntries(key.map(k => [k,state[k]])); },
   async set(value) { Object.assign(state, structuredClone(value)); },
   async remove(key) { delete state[key]; },
  } },
  tabs: { async get(id) { return { id }; }, async create(options) { opened.push(options); return { id: 10 }; },
   async update(id,options) { navigated.push({ id,...options }); },
   onRemoved: { addListener(fn) { removed = fn; } },
  },
 };
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../playback-background.js'),'utf8'),{chrome,URL,console});
 const editor = {url:'http://localhost:4200/guides/1', tab:{id:1,url:'http://localhost:4200/guides/1'}};
 const site = {url:'https://example.com/first',tab:{id:10,url:'https://example.com/first'}};
 const send = (message,sender=site) => new Promise(resolve => listener(message,sender,resolve));
 const start = (steps=[{url:site.url,selector:'#first',text:'Primeiro'},{url:'https://example.com/second',selector:'#second',text:'Segundo'}]) => send({action:'START_PLAYBACK',title:'Guia',steps},editor);
 return {state,opened,navigated,send,start,editor,site,chrome, sendExternal: (message,sender=editor) => new Promise(resolve => external(message,sender,resolve))};
}
test('opens first step and persists session for the target tab',async()=>{
 const r=player(); assert.equal((await r.start()).success,true);
 assert.equal(r.navigated[0].url,'https://example.com/first');
 assert.equal((await r.send({action:'GET_PLAYBACK'})).playback.index,0);
 assert.equal((await r.send({action:'GET_PLAYBACK'},r.editor)).playback,null);
});
test('rejects untrusted launch pages and unsafe URLs',async()=>{
 const r=player();
 assert.equal((await r.send({action:'START_PLAYBACK',steps:[{url:'https://example.com'}]})).success,false);
 assert.equal((await r.start([{url:'javascript:alert(1)'}])).success,false);
 assert.equal(r.opened.length,0);
});
test('next navigates, persists progress, and ignores stale double clicks',async()=>{
 const r=player(); await r.start();
 await r.send({action:'MOVE_PLAYBACK',index:0,direction:1});
 assert.equal(r.state.playback.index,1);
 assert.equal(r.navigated[1].url,'https://example.com/second');
 await r.send({action:'MOVE_PLAYBACK',index:0,direction:1});
 assert.equal(r.state.playback.index,1);
});
test('other tabs cannot advance or end the tutorial',async()=>{
 const r=player(); await r.start();
 await r.send({action:'STOP_PLAYBACK'},r.editor);
 await r.send({action:'MOVE_PLAYBACK',index:0,direction:1},r.editor);
 assert.equal(r.state.playback.index,0);
});
test('back, completion and stop update stored state',async()=>{
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
test('refuses playback while recording',async()=>{
 const r=player(); r.state.isRecording=true;
 assert.equal((await r.start()).success,false);
 assert.equal(r.opened.length,0);
});

test('recovers a stale session whose tab was closed',async()=>{
 const r=player();r.state.playback={tabId:99};r.chrome.tabs.get=async()=>{throw new Error('No tab');};
 assert.equal((await r.start()).success,true);assert.equal(r.opened.length,1);assert.equal(r.state.playback.tabId,10);
});
test('reuses an existing tutorial tab and resets its progress',async()=>{
 const r=player();await r.start();await r.send({action:'MOVE_PLAYBACK',index:0,direction:1});
 assert.equal((await r.start()).success,true);assert.equal(r.opened.length,1);assert.equal(r.state.playback.index,0);
});
test('paired editor launches through external messaging with origin validation',async()=>{
 const r=player();const message={action:'START_PLAYBACK',steps:[{url:'https://example.com'}]};
 assert.equal((await r.sendExternal(message,r.site)).success,false);
 assert.equal((await r.sendExternal(message)).success,true);assert.equal(r.opened.length,1);
});
test('failed navigation preserves current step for retry',async()=>{
 const r=player();await r.start();r.chrome.tabs.update=async()=>{throw new Error('Navigation failed');};
 assert.equal((await r.send({action:'MOVE_PLAYBACK',index:0,direction:1})).success,false);
 assert.equal(r.state.playback.index,0);
});
test('invalid step URL is reported before opening a tab',async()=>{
 const r=player();const result=await r.start([{url:'https://example.com'},{url:'javascript:alert(1)'}]);
 assert.match(result.error,/passo 2/);assert.equal(r.opened.length,0);
});

test('training completion returns only to its trusted application route',async()=>{
 const r=player();const completionUrl='http://localhost:4200/trainings/7?guided=complete';
 const message={action:'START_PLAYBACK',steps:[{url:r.site.url}],completionUrl};
 assert.equal((await r.send(message,r.editor)).success,true);
 assert.equal((await r.send({action:'MOVE_PLAYBACK',index:0,direction:1})).completed,true);
 assert.equal(r.navigated.at(-1).url,completionUrl);assert.equal(r.state.playback,undefined);
});
test('rejects foreign training completion destinations and preserves state if return fails',async()=>{
 const r=player();for(const completionUrl of ['https://evil.example/trainings/7','http://localhost:4200/account','javascript:alert(1)'])assert.equal((await r.send({action:'START_PLAYBACK',steps:[{url:r.site.url}],completionUrl},r.editor)).success,false);
 await r.send({action:'START_PLAYBACK',steps:[{url:r.site.url}],completionUrl:'http://localhost:4200/trainings/7?guided=complete'},r.editor);
 r.chrome.tabs.update=async()=>{throw new Error('Failed');};assert.equal((await r.send({action:'MOVE_PLAYBACK',index:0,direction:1})).success,false);assert.equal(r.state.playback.index,0);
});
