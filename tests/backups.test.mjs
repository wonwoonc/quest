import test from 'node:test';
import assert from 'node:assert/strict';
import {installBackups} from '../src/backups.js';
import {createStorage,emptySnapshot} from '../src/storage.js';
function setup(getDownloads) {
  const data = new Map(), alerts = [], downloads = []; let handler, input, reloads = 0;
  const storage = createStorage({driver:{getItem:k=>data.get(k) ?? null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}});
  const state = emptySnapshot(); storage.save(state);
  const document = {body:{appendChild(){}},addEventListener:(n,fn)=>{handler=fn;},removeEventListener(){},
    createElement(tag) { const el = {click(){if(tag==='a') downloads.push(el);},remove(){}}; if(tag==='input') input=el; return el; }};
  installBackups({document,storage,getState:()=>state,confirm:()=>true,alert:x=>alerts.push(x),reload:()=>reloads++,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},Blob,...(getDownloads?{getDownloads}:{})});
  return {storage,state,alerts,downloads,get input(){return input;},get reloads(){return reloads;},click:act=>handler({target:{closest:()=>({dataset:{act}})}})};
}
test('backup UI export captures current runtime state, not a stale delayed snapshot',async () => {
  const h = setup(); h.state.mine.x = {id:'x',kind:'mission',name:'latest'};
  await h.click('bkexp'); assert.equal(h.downloads.length,1); assert.equal(h.alerts.length,0);
});
test('backup UI explicit file import validates and flushes before reload',async () => {
  const h = setup(), next = {...emptySnapshot(),v:1,mine:{x:{id:'x',kind:'mission',name:'imported'}}};
  await h.click('bkimp'); h.input.files=[{size:100,text:async()=>JSON.stringify(next)}]; await h.input.onchange();
  assert.equal(h.storage.load().mine.x.name,'imported'); assert.equal(h.reloads,1); assert.equal(h.alerts.length,0);
});
test('backup UI invalid file fails visibly without reload or replacement',async () => {
  const h = setup(), before = h.storage.load();
  await h.click('bkimp'); h.input.files=[{size:10,text:async()=>'{"v":1}'}]; await h.input.onchange();
  assert.equal(h.reloads,0); assert.equal(h.alerts.length,1); assert.deepEqual(h.storage.load(),before);
});
test('backup UI reset uses shared adapter and correct namespace',async () => {
  const h = setup(); h.state.mine.x = {kind:'diary'}; h.storage.save(h.state);
  await h.click('bkreset'); assert.deepEqual(h.storage.load().mine,{}); assert.equal(h.reloads,1);
});

test('backup export uses the hosted save prompt when the viewer offers one',async () => {
  const saves = []; const h = setup(async () => ({save:async req => { saves.push(req); return {status:'saved'}; }}));
  h.state.mine.x = {id:'x',kind:'mission',name:'hosted'};
  await h.click('bkexp');
  assert.equal(h.downloads.length,0); assert.equal(saves.length,1);
  assert.match(saves[0].filename,/^quest-backup-\d{4}-\d{2}-\d{2}\.json$/); assert.match(saves[0].data,/hosted/);
});
test('backup export: declined hosted save is silent, other failures alert',async () => {
  let code = 'declined'; const h = setup(async () => ({save:async () => { throw {code,message:'x'}; }}));
  await h.click('bkexp'); assert.equal(h.alerts.length,0);
  code = 'unavailable'; await h.click('bkexp'); assert.equal(h.alerts.length,1);
});
