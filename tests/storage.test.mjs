import test from 'node:test';
import assert from 'node:assert/strict';
import {createStorage, emptySnapshot, validateSnapshot, parseBackup, NAMESPACES} from '../src/storage.js';
import {createAPI} from '../src/runtime.js';
import {createDemoFixture} from '../src/fixtures/demo.js';
export function driver() {
  const map = new Map();
  return {map, getItem:k => map.get(k) ?? null, setItem:(k,v) => map.set(k,v), removeItem:k => map.delete(k)};
}
function setup(mode = 'empty', backend = driver()) {
  const storage = createStorage({driver:backend, mode, now:() => 1000});
  const state = storage.empty(); let i = 0;
  const api = createAPI({state, storage, id:() => 'test'+(++i), now:() => 1000});
  return {backend, storage, state, api};
}
test('empty has no fake profile, project, record or media', () => {
  assert.deepEqual(emptySnapshot(),{v:2, at:0, profiles:{}, projects:{}, feed:{}, replies:{}, follows:{}, mine:{}, media:{}});
  assert.equal(setup().storage.load(),null);
});
test('demo fixture deterministic at injected time, complete and independently validated', () => {
  const a = createDemoFixture({now:1793491200000});
  assert.deepEqual(a,createDemoFixture({now:1793491200000}));
  assert.equal(Object.keys(a.profiles).length,7);
  assert.ok(Object.keys(a.projects).length > 20);
  assert.ok(Object.keys(a.mine).length > 10);
  validateSnapshot(a);
  a.profiles.me.nick = 'changed';
  assert.notEqual(createDemoFixture().profiles.me.nick,'changed');
});
test('new namespaces never read or overwrite quest:v1/lq2', async () => {
  const d = driver(); d.setItem('quest:v1','legacy-data'); d.setItem('lq2:qTab','"old"');
  const a = setup('empty',d), b = setup('demo',d);
  assert.equal(a.storage.load(),null); assert.equal(b.storage.load(),null);
  await a.api.putMine('a',{kind:'quest', name:'new'});
  assert.equal(b.storage.load(),null); assert.equal(d.getItem('quest:v1'),'legacy-data');
  assert.equal(a.storage.preferences.get('qTab','daily'),'daily');
  assert.equal(d.getItem('lq2:qTab'),'"old"');
});
test('CRUD profile/mine/project persists immediately and reloads', async () => {
  const {storage,state,api} = setup();
  await api.saveProfile({nick:'테스트'});
  assert.equal(storage.load().profiles.me.private,true);
  await api.putProject('p',{owner:'me',title:'목표'});
  await api.putMine('m',{kind:'mission',name:'할 일',projectId:'p'});
  assert.equal(storage.load().mine.m.name,'할 일');
  await api.putMine('m',{...state.mine.m,done:true});
  assert.equal(storage.load().mine.m.done,true);
  await api.delProject('p'); assert.equal(state.mine.m.projectId,null);
  await api.delMine('m'); assert.deepEqual(storage.load().mine,{});
});
test('post/reply/reactions/follows/media use one snapshot adapter', async () => {
  const {api,state,storage} = setup();
  await api.addPost({text:'hello'},['data:image/png;base64,AA']);
  await api.addReply('test1','reply',null);
  await api.like('test1',true); await api.join('test1'); await api.likeReply('test2',true);
  await api.editPost('test1',{text:'edited'}); await api.follow('other',true);
  assert.equal(state.feed.test1.reactions.me.k,'heart');
  assert.equal(state.feed.test1.joiners.me,1000); assert.equal(state.replies.test2.likes.me,1000);
  assert.equal(storage.load().feed.test1.text,'edited');
  assert.equal(await api.getMedia('test1~0'),'data:image/png;base64,AA');
  await api.follow('other',false); assert.deepEqual(state.follows,{});
});
test('post deletion deletes its images/replies only, including after snapshot reload', async () => {
  const {api,state,storage,backend} = setup();
  await api.addPost({text:'first'},['data:image/png;base64,AA']);
  await api.addReply('test1','first reply');
  await api.addPost({text:'second'},['data:image/png;base64,BB']);
  await api.putMedia('test10~0','data:image/png;base64,CC');
  await api.putMedia('face-test1','data:image/png;base64,DD');
  const demo = setup('demo',backend); await demo.api.putMedia('test1~0','data:image/png;base64,EE');
  const reloaded = storage.load();
  const fresh = createAPI({state:reloaded,storage,id:()=>'unused'});
  await fresh.delPost('test1');
  assert.equal(reloaded.feed.test1,undefined); assert.equal(reloaded.media['test1~0'],undefined);
  assert.equal(reloaded.replies.test2,undefined);
  assert.ok(reloaded.media['test3~0']); assert.ok(reloaded.media['test10~0']); assert.ok(reloaded.media['face-test1']);
  assert.ok(demo.storage.load().media['test1~0']); assert.ok(state.feed.test1);
});
test('project cover cleanup respects a shared cover', async () => {
  const {api,state} = setup(); await api.putMedia('cover','data:image/png;base64,AA');
  await api.putProject('a',{owner:'me',cover:'cover'}); await api.putProject('b',{owner:'me',cover:'cover'});
  await api.delProject('a'); assert.ok(state.media.cover);
  await api.delProject('b'); assert.equal(state.media.cover,undefined);
});
test('write quota failures reject without committing runtime mutation', async () => {
  const d = driver(), errors = []; const storage = createStorage({driver:d,onError:e=>errors.push(e)});
  const state = storage.empty(); storage.save(state);
  d.setItem = () => { throw new Error('quota'); };
  const api = createAPI({state,storage,id:()=>'x'});
  await assert.rejects(api.putMine('x',{kind:'mission'}),/quota/);
  assert.deepEqual(state.mine,{}); assert.deepEqual(storage.load().mine,{}); assert.equal(errors.length,1);
});
test('read failures and corrupt snapshots are errors, never auto reset', () => {
  const d = driver(); d.setItem(NAMESPACES.empty,'broken');
  assert.throws(()=>setup('empty',d).storage.load()); assert.equal(d.getItem(NAMESPACES.empty),'broken');
  d.getItem = () => { throw new Error('denied'); };
  assert.throws(()=>setup('empty',d).storage.load(),/denied/);
});
test('validation rejects invalid version, collection, ID, media, number, nested poison', () => {
  for (const patch of [{v:9},{mine:[]},{profiles:null},{mine:{x:{id:'y'}}},{media:{x:'javascript:alert(1)'}},{feed:{x:{imgs:20}}},{profiles:{x:{nick:3}}},{at:-1}]) {
    assert.throws(()=>validateSnapshot({...emptySnapshot(),...patch}));
  }
  assert.throws(()=>parseBackup('{"v":2,"__proto__":{}}'));
  assert.throws(()=>parseBackup('not-json'));
  assert.throws(()=>validateSnapshot({...emptySnapshot(),mine:{x:{kind:22}}}));
  assert.throws(()=>parseBackup(' '.repeat(20*1024*1024+1)));
});
test('legacy v1 is accepted only explicitly and expands archives non-destructively', () => {
  const old = {...emptySnapshot(),v:1,mine:{'ax-m-2020':{id:'ax-m-2020',kind:'ax',of:'m',items:{m1:{name:'old',done:true}}}}};
  assert.throws(()=>validateSnapshot(old));
  const next = parseBackup(JSON.stringify(old)); assert.equal(next.v,2);
  assert.equal(next.mine.m1.kind,'mission'); assert.equal(next.mine['ax-m-2020'],undefined);
  assert.ok(old.mine['ax-m-2020']);
});
test('backup roundtrip including media and fixtures; bad import leaves bytes unchanged', () => {
  const {storage} = setup(); const fixture = createDemoFixture(); storage.save(fixture);
  const before = storage.load(); const raw = storage.export(before);
  assert.deepEqual(parseBackup(raw),before);
  assert.throws(()=>storage.import('{"v":1}')); assert.deepEqual(storage.load(),before);
});
test('reset isolates current workspace and leaves demo EMPTY, not re-seeded', async () => {
  const d = driver(), a = setup('empty',d), b = setup('demo',d);
  await a.api.putMine('mine',{kind:'diary'}); b.storage.save(createDemoFixture());
  a.storage.preferences.set('x',1); b.storage.preferences.set('x',2);
  b.storage.reset(); assert.deepEqual(b.storage.load().profiles,{});
  assert.ok(a.storage.load().mine.mine); assert.equal(a.storage.preferences.get('x',0),1);
  assert.equal(b.storage.preferences.get('x',0),0);
});
test('preferences surface write failure and reject prototype pollution', () => {
  const {backend,storage} = setup();
  assert.throws(()=>storage.preferences.set('__proto__',{}));
  storage.preferences.set('theme','dark'); assert.equal(storage.preferences.get('theme',''),'dark');
  backend.setItem = () => { throw new Error('denied'); };
  assert.throws(()=>storage.preferences.set('theme','light'),/denied/);
});
test('input documents are copied; missing targets reject without persistence damage', async () => {
  const {api,state} = setup(); const item = {kind:'quest',days:[1]};
  await api.putMine('a',item); item.days.push(2); assert.deepEqual(state.mine.a.days,[1]);
  await assert.rejects(api.editPost('none',{text:'x'})); await assert.rejects(api.like('none',true));
  await assert.rejects(api.putMine('__proto__',{kind:'mission'}));
});
test('import rejects values that could break out of HTML attributes; normal saves keep working', () => {
  const base = () => ({...emptySnapshot(), profiles:{me:{uid:'me',nick:'<b>이름</b> & "따옴표"',color:'#3DBE8B'}}});
  assert.equal(parseBackup(JSON.stringify(base())).profiles.me.nick,'<b>이름</b> & "따옴표"','free text stays free-form');
  const bad = [
    s => { s.mine['x" onerror="alert(1)'] = {kind:'mission',name:'a'}; },
    s => { s.mine.a = {kind:'mission',name:'a',projectId:'p"><img src=x>'}; },
    s => { s.mine.n = {kind:'note',blocks:[{id:'b" onclick="x',t:'p',h:''}]}; },
    s => { s.media.k = 'data:image/png;base64,AA" onerror="alert(1)'; },
    s => { s.media.k = 'data:image/svg+xml,<svg onload=alert(1)>'; },
    s => { s.profiles.me.face = 'data:text/html,<script>alert(1)</script>'; },
    s => { s.profiles.me.color = 'red;background:url(//evil)'; },
    s => { s.mine.d = {kind:'diary',date:'2026-01-01',cond:'<img src=x onerror=alert(1)>'}; },
    s => { s.projects.p = {owner:'other',title:'t',progress:{done:1,total:'"><svg onload=alert(1)>'}}; }
  ];
  for (const poison of bad) { const s = base(); poison(s); assert.throws(() => parseBackup(JSON.stringify(s)), /백업|이미지/); }
  const ok = base();
  ok.mine['d-2026-01-01'] = {kind:'diary',date:'2026-01-01',cond:'70'};
  ok.media['post~0'] = 'data:image/jpeg;base64,/9j/4AAQ+abc=';
  ok.media.cv = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><text>가\'</text></svg>');
  ok.profiles.me.face = 'face-1';
  assert.doesNotThrow(() => parseBackup(JSON.stringify(ok)));
});
test('clone matches a JSON round trip for snapshot data and shares large strings', async () => {
  const {clone} = await import('../src/storage.js');
  const big = 'data:image/png;base64,' + 'A'.repeat(100000);
  const value = {a:1,b:[1,undefined,{c:null,d:undefined}],e:'x',f:false,g:{h:{i:[big]}},n:0.5};
  assert.deepEqual(clone(value),JSON.parse(JSON.stringify(value)));
  const copy = clone(value); copy.b[2].c = 1; copy.g.h.i.push('y');
  assert.equal(value.b[2].c,null); assert.equal(value.g.h.i.length,1);
  const fixture = createDemoFixture({now:1793491200000}); assert.deepEqual(clone(fixture),JSON.parse(JSON.stringify(fixture)));
});
test('commit leaves the live state untouched when the mutation or the write fails', () => {
  const d = driver(), storage = createStorage({driver:d,now:() => 5});
  const state = storage.empty(); storage.save(state);
  assert.throws(() => storage.commit(state,next => { next.mine.a = {kind:'mission'}; throw new Error('stop'); }),/stop/);
  assert.deepEqual(state.mine,{});
  assert.throws(() => storage.commit(state,next => { next.mine.a = {id:'other'}; }));
  assert.deepEqual(state.mine,{}); assert.deepEqual(storage.load().mine,{});
  storage.commit(state,next => { next.mine.a = {kind:'mission',name:'ok'}; });
  assert.equal(state.mine.a.name,'ok'); assert.equal(storage.load().mine.a.name,'ok');
});
