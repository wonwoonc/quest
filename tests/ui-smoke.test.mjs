// Minimal DOM harness, NOT a browser or a visual/layout test.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {root} from '../scripts/build.mjs';
import {TIERS, DAILY_DIFFICULTY, TASK_DIFFICULTY, LABELS, activityReward, balances} from '../src/economy.js';
function harness(snapshot, search = '') {
  const nodes = new Map(), events = {}, winEvents = {}, frames = [], alerts = [], data = new Map();
  if (snapshot) data.set('quest:foundation:empty:v2',JSON.stringify(snapshot));
  const node = id => ({id,innerHTML:'',textContent:'',dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},querySelector:() => null,querySelectorAll:() => [],getBoundingClientRect:() => ({top:0,height:0})});
  for (const id of ['app','topbar','nav','overlay','toast','pill','replybar','fileIn','characterUploadIn','characterCameraIn','demo-label']) nodes.set(id,node(id));
  const body = node('body');
  const document = {body,activeElement:null,documentElement:{dataset:{},style:{setProperty(){}},removeAttribute(){},setAttribute(){}},
    querySelector:s => s.startsWith('#') ? nodes.get(s.slice(1)) || null : null,
    querySelectorAll:() => [], getElementById:id => nodes.get(id) || null,
    addEventListener:(name,fn) => (events[name] ||= []).push(fn),removeEventListener(){}};
  const context = vm.createContext({console,document,Date,Math,URL,URLSearchParams,Blob,FormData,
    localStorage:{getItem:k => data.get(k) ?? null,setItem:(k,v) => data.set(k,v),removeItem:k => data.delete(k)},
    location:{hash:'',search,reload(){}},alert:msg => alerts.push(msg),confirm:() => false,
    addEventListener:(name,fn) => (winEvents[name] ||= []).push(fn),
    matchMedia:() => ({matches:false,addEventListener(){}}),
    requestAnimationFrame:fn => {frames.push(fn);return frames.length;},cancelAnimationFrame(){},
    setTimeout:() => 1,clearTimeout(){},setInterval:() => 1,clearInterval(){},
    scrollY:0,scrollTo(){},innerHeight:800,navigator:{},queueMicrotask:fn => fn(),
    IntersectionObserver:class {observe(){} disconnect(){}},MutationObserver:class {observe(){} disconnect(){}}});
  context.window = context;
  const flush = () => { let count = 0; while(frames.length) { if (++count > 30) throw new Error('Render loop'); frames.shift()(); } };
  const route = name => { context.location.hash = '#'+name; for (const fn of winEvents.hashchange || []) fn(); flush(); };
  const click = (act, dataset = {}) => {
    let stopped = false;
    const button = {dataset:{act,...dataset}};
    const target = {closest:selector => selector === '[data-act]' ? button : null};
    for (const fn of events.click || []) fn({target,preventDefault(){},stopPropagation(){stopped = true;}});
    flush();
    return {stopped};
  };
  const settle = async () => { await new Promise(resolve => setImmediate(resolve)); flush(); };
  return {context,nodes,events,frames,alerts,data,flush,route,click,settle,
    snapshot:() => JSON.parse(data.get('quest:foundation:empty:v2'))};
}
for (const [file,mode] of [['quest.html','empty'],['quest-demo.html','demo']]) {
  test(`actual ${mode} inline bundle initializes and routes without provider globals`,async () => {
    const h = harness();
    const html = await readFile(root+'/dist/'+file,'utf8');
    vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],h.context);
    h.flush(); assert.deepEqual(h.alerts,[]);
    if (mode === 'empty') {
      assert.match(h.nodes.get('app').innerHTML,/data-act="preview-login"/);
      const snapshot = JSON.parse(h.data.get('quest:foundation:empty:v2'));
      assert.deepEqual(snapshot.profiles,{}); assert.deepEqual(snapshot.projects,{});
    } else {
      assert.match(h.nodes.get('app').innerHTML,/토익/);
      assert.match(h.nodes.get('demo-label').textContent,/가상 데이터/);
    }
    for (const page of ['today','me','cal','feed','settings']) {
      h.route(page); assert.ok(h.nodes.get('app').innerHTML.length > 0,page);
    }
  });
}
test('onboarding uses the actual profile/story CSS wrapper on dashboard and profile routes',async () => {
  const h = harness(), html = await readFile(root+'/dist/quest.html','utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],h.context); h.flush();
  h.click('preview-login');
  for (const route of ['dash','me','feed']) {
    h.route(route);
    assert.equal(h.nodes.get('app').dataset.v,'profile');
    assert.match(h.nodes.get('app').innerHTML,/캐릭터 만들기/);
    assert.doesNotMatch(h.nodes.get('app').innerHTML,/새벽러너|id="nick"[^>]*placeholder=/);
  }
  assert.match(html,/#app\[data-v="feed"\],#app\[data-v="profile"\][^{]+\{[^}]*max-width:600px;margin:0 auto/);
  assert.match(html,/id="characterUploadIn" accept="image\/\*" hidden/);
  assert.match(html,/id="characterCameraIn" accept="image\/\*" capture="user" hidden/);
  assert.doesNotMatch(html,/cartoonFace|saturate\(1\.35\)|setTimeout\(r, 1800\)|원본 사진은 저장하지/);
});
test('upload/camera consent, picker cancellation and unavailable service preserve avatar',async () => {
  const h = await profileUI(undefined,'?devCharacter=1'); h.click('sheet',{k:'profile'});
  h.nodes.set('ep-nick',{value:'원래 닉네임'}); h.nodes.set('ep-bio',{value:'소개'});
  let calls = 0;
  h.context.fetch = async () => { calls++; return {ok:true,json:async()=>({version:1,configured:false})}; };
  for (const [act,id] of [['faceupload','characterUploadIn'],['faceshot','characterCameraIn']]) {
    const input = h.nodes.get(id); let opened = 0; input.click = () => opened++;
    h.nodes.set('character-consent',{checked:false}); h.click(act);
    assert.equal(opened,0); assert.match(h.nodes.get('overlay').innerHTML,/먼저 동의/);
    h.nodes.get('character-consent').checked = true; h.click(act); assert.equal(opened,1);
    input.files = []; await input.onchange(); assert.equal(calls,act === 'faceupload' ? 0 : 1);
    input.files = [new Blob(['photo'],{type:'image/png'})];
    const before = h.snapshot(); await input.onchange(); await h.settle();
    assert.deepEqual(h.snapshot(),before);
    const markup = h.nodes.get('overlay').innerHTML;
    assert.match(markup,/서비스가 연결되지/); assert.match(markup,/aria-busy="false"/);
    assert.doesNotMatch(markup,/data-act="faceupload" disabled|class="obmaking"/);
  }
  assert.equal(calls,2);
});
test('mock contract success persists fullbody image, renders without sprite-face overlay and survives edits/reload',async () => {
  const h = await profileUI(undefined,'?devCharacter=1'); h.click('sheet',{k:'profile'});
  const image = 'data:image/png;base64,aW1hZ2U='; // Contract fixture, not an AI-generated image.
  h.context.fetch = async (_url, options) => ({ok:true,json:async()=> options.method === 'GET' ? {version:1,configured:true} : {version:1,avatarStyle:'fullbody',image}});
  h.nodes.set('character-consent',{checked:true});
  const input = h.nodes.get('characterUploadIn'); input.click = () => {};
  h.click('faceupload'); input.files = [new Blob(['photo'],{type:'image/png'})]; await input.onchange(); await h.settle();
  assert.match(h.nodes.get('overlay').innerHTML,/class="avatar-fullbody"/);
  assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/class="chibi"|class="cface"/);
  h.nodes.set('ep-nick',{value:'전신 프로필'}); h.nodes.set('ep-bio',{value:'소개'});
  h.click('submit-profile'); await h.settle();
  const saved = h.snapshot(); assert.equal(saved.profiles.me.avatarStyle,'fullbody');
  assert.equal(saved.media[saved.profiles.me.face],image);
  h.route('me'); assert.match(h.nodes.get('app').innerHTML,/class="avatar-fullbody"/);
  assert.doesNotMatch(h.nodes.get('app').innerHTML,/class="cface"/);
  const reloaded = await profileUI(saved); reloaded.route('me'); await reloaded.settle();
  assert.match(reloaded.nodes.get('app').innerHTML,/class="avatar-fullbody"/);
  reloaded.click('sheet',{k:'profile'}); reloaded.nodes.set('ep-nick',{value:'닉네임만 변경'}); reloaded.nodes.set('ep-bio',{value:''});
  reloaded.click('submit-profile'); await reloaded.settle();
  assert.equal(reloaded.snapshot().profiles.me.avatarStyle,'fullbody');
  assert.equal(reloaded.snapshot().profiles.me.face,saved.profiles.me.face);
  reloaded.click('sheet',{k:'profile'}); reloaded.click('facedel');
  reloaded.click('submit-profile'); await reloaded.settle();
  assert.equal(reloaded.snapshot().profiles.me.face,null); assert.equal(reloaded.snapshot().profiles.me.avatarStyle,null);
});
test('dev code consent UI sends code header without persisting it and surfaces result link',async () => {
  const h = await profileUI(undefined,'?devCharacter=1'); h.click('sheet',{k:'profile'});
  const code = 'only-in-memory-code'; const resultUrl = 'https://www.genspark.ai/api/files/s/ui_mock';
  const markup = h.nodes.get('overlay').innerHTML;
  assert.match(markup,/약 19크레딧/); assert.match(markup,/정확한 보존/); assert.match(markup,/https:\/\/www.genspark.ai\/ai_image/);
  h.nodes.set('character-dev-code',{value:code}); h.nodes.set('character-consent',{checked:true});
  for (const fn of h.events.input || []) fn({target:{id:'character-dev-code',value:code}});
  let posts = 0;
  h.context.fetch = async (url,opts) => {
    assert.equal(url,'/api/characters');
    if(opts.method === 'GET') return {ok:true,json:async()=>({version:1,configured:true,requiresCode:true})};
    posts++; assert.equal(opts.headers['X-Quest-Dev-Code'],code);
    return {ok:true,json:async()=>({version:1,avatarStyle:'fullbody',image:'data:image/png;base64,aW1hZ2U=',resultUrl})};
  };
  const input = h.nodes.get('characterUploadIn'); input.click = () => {};
  for(let i=0;i<2;i++) {
    h.click('faceupload'); assert.equal(h.nodes.get('character-dev-code').value,'');
    input.files = [new Blob(['photo'],{type:'image/png'})]; await input.onchange(); await h.settle();
    assert.match(h.nodes.get('overlay').innerHTML,/api\/files\/s\/ui_mock/);
  }
  assert.equal(posts,2);
  h.nodes.set('ep-nick',{value:'dev profile'}); h.nodes.set('ep-bio',{value:''}); h.click('submit-profile'); await h.settle();
  assert.ok(!JSON.stringify([...h.data]).includes(code));
  const source = await readFile(root+'/src/legacy-app.js','utf8');
  assert.match(source,/if \(e.target.id === 'character-dev-code'\) \{ if \(devCharacter\) characterClient.setDevCode\(e.target.value\); return; \}/);
});
test('legacy face media keeps old overlay without fullbody marker',async () => {
  const base = await profileUI(), snapshot = base.snapshot();
  snapshot.profiles.me.face = 'legacy-face'; snapshot.media['legacy-face'] = 'data:image/png;base64,aW1hZ2U=';
  const h = await profileUI(snapshot); h.route('me'); await h.settle();
  assert.match(h.nodes.get('app').innerHTML,/class="chibi"/);
  assert.doesNotMatch(h.nodes.get('app').innerHTML,/class="avatar-fullbody"/);
});
test('actual empty UI submit handlers create local profile and quick task, persisted on reload',async () => {
  const h = harness();
  const html = await readFile(root+'/dist/quest.html','utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],h.context); h.flush();
  h.click('preview-login');
  h.nodes.set('nick',{value:'직접 만든 로컬 프로필'});
  const submit = name => { for (const fn of h.events.submit) fn({preventDefault(){},target:{dataset:{form:name}}}); };
  submit('profile'); await new Promise(resolve => setImmediate(resolve)); h.flush();
  let snap = JSON.parse(h.data.get('quest:foundation:empty:v2'));
  assert.equal(snap.profiles.me.nick,'직접 만든 로컬 프로필'); assert.equal(snap.profiles.me.private,true);
  h.nodes.set('qm-name',{value:'직접 추가한 태스크'});
  submit('quicktask'); await new Promise(resolve => setImmediate(resolve)); h.flush();
  snap = JSON.parse(h.data.get('quest:foundation:empty:v2'));
  assert.equal(Object.values(snap.mine)[0].name,'직접 추가한 태스크');
  assert.deepEqual(h.alerts,[]);
});

async function profileUI(snapshot, search = '') {
  const h = harness(snapshot, search);
  const html = await readFile(root+'/dist/quest.html','utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],h.context); h.flush();
  if (!snapshot) {
    h.click('preview-login');
    h.nodes.set('nick',{value:'마감일 회귀 테스트'});
    for (const fn of h.events.submit) fn({preventDefault(){},target:{dataset:{form:'profile'}}});
    await h.settle();
  }
  return h;
}
for (const action of ['preview-login','preview-kakao']) {
  test(`${action}: fresh landing has exactly one Kakao signup and transitions via actual handler without auth`,async () => {
    const h = harness(), html = await readFile(root+'/dist/quest.html','utf8');
    vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],h.context); h.flush();
    const login = h.nodes.get('app').innerHTML;
    assert.equal((login.match(/>카카오톡으로 가입하기</g)||[]).length,1);
    assert.equal((login.match(/>로그인</g)||[]).length,1);
    assert.doesNotMatch(login,/<input|네이버|비밀번호|oauth|https?:/i);
    assert.match(login,/개발 미리보기 · 실제 인증 미연결/);
    assert.equal(h.nodes.get('nav').innerHTML,''); assert.equal(h.nodes.get('topbar').innerHTML,'');
    const before = h.snapshot(); let calls = 0; h.context.fetch = () => {calls++; throw new Error('No auth/network allowed');};
    h.click(action);
    const creation = h.nodes.get('app').innerHTML;
    assert.match(creation,/<h1 class="hello">캐릭터 만들기<\/h1>/);
    assert.match(creation,/id="nick"/); assert.match(creation,/모험 시작하기/);
    assert.doesNotMatch(creation,/개발용 코드|character-consent|크레딧|서버 시작/);
    for (const act of ['faceupload','faceshot']) {
      let opened = 0; h.nodes.get(act === 'faceupload' ? 'characterUploadIn' : 'characterCameraIn').click = () => opened++;
      h.nodes.set('character-consent',{checked:true}); h.nodes.set('character-dev-code',{value:'injected'});
      h.click(act); assert.equal(opened,0); assert.match(h.nodes.get('toast').innerHTML,/사진 기반 생성은 개발 테스트에서만 이용할 수 있어요/);
    }
    assert.equal(calls,0); assert.deepEqual(h.snapshot(),before);
    h.click('swatch',{c:'#EB6E93'});
    h.nodes.set('nick',{value:'일반 모험가'});
    for (const fn of h.events.submit) fn({preventDefault(){},target:{dataset:{form:'profile'}}});
    await h.settle(); assert.equal(h.snapshot().profiles.me.color,'#EB6E93');
    assert.equal(h.snapshot().profiles.me.face,null);
    assert.ok(h.nodes.get('nav').innerHTML); assert.ok(h.nodes.get('topbar').innerHTML);
    const reloaded = await profileUI(h.snapshot());
    assert.doesNotMatch(reloaded.nodes.get('app').innerHTML,/data-act="preview-login"|data-form="profile"/);
  });
}
test('screen=login resets only UI, keeps all saved profile/progress; login still opens creation',async () => {
  const base = await profileUI(), saved = base.snapshot(); saved.mine.keep = {id:'keep',kind:'mission',name:'보존',done:true};
  const h = await profileUI(saved,'?screen=login');
  assert.match(h.nodes.get('app').innerHTML,/data-act="preview-login"/);
  assert.deepEqual(h.snapshot(),saved); h.route('cal');
  assert.match(h.nodes.get('app').innerHTML,/data-act="preview-login"/);
  h.click('preview-login'); assert.match(h.nodes.get('app').innerHTML,/data-form="profile"/);
  assert.deepEqual(h.snapshot(),saved);
});
test('explicit dev character route shows protected controls; other flag values do not',async () => {
  for (const flag of ['1','0','true','']) {
    const h = harness(undefined,'?screen=character&devCharacter='+flag), html = await readFile(root+'/dist/quest.html','utf8');
    vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],h.context); h.flush();
    const markup = h.nodes.get('app').innerHTML;
    assert.match(markup,/캐릭터 만들기/);
    if (flag === '1') { assert.match(markup,/character-dev-code/); assert.match(markup,/character-consent/); }
    else assert.doesNotMatch(markup,/character-dev-code|character-consent|크레딧/);
  }
});
test('login preview always lands on login with isolated persistent storage; image-start goes directly to creation',async () => {
  for (const [file,key,screen] of [['login-preview','login','login'],['image-start','image-start','character']]) {
    const base = await profileUI(), saved = base.snapshot(), h = harness();
    const previewKey = `quest:preview:${key}:20261101`;
    h.data.set(previewKey,JSON.stringify(saved));
    const html = await readFile(root+'/dist/'+file+'.html','utf8');
    assert.match(html,new RegExp(`data-entry-screen="${screen}"`));
    h.context.document.documentElement.dataset.entryScreen = screen;
    vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],h.context); h.flush();
    assert.match(h.nodes.get('app').innerHTML,screen === 'login' ? /data-act="preview-login"/ : /data-form="profile"/);
    assert.deepEqual(JSON.parse(h.data.get(previewKey)),saved);
    assert.equal(h.data.has('quest:foundation:empty:v2'),false);
  }
});
const deadlineRequired = h => {
  assert.match(h.nodes.get('overlay').innerHTML,/마감일 <span class="hint">필수<\/span>/);
  assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/data-act="dpclear" data-k="end"/);
};
// Dispatch actual delegated UI clicks against the built bundle; no direct state/API calls.
for (const route of ['add-big','project','gedit']) {
  for (const date of ['2099-12-31','2000-01-01']) {
    test(`main ${route}: missing deadline prevents save; selecting ${date} saves`,async () => {
      let h = await profileUI();
      if (route === 'gedit') {
        const snapshot = h.snapshot();
        snapshot.projects.legacy = {id:'legacy',owner:'me',title:'기존 목표',end:'',status:'active',createdAt:1};
        h = await profileUI(snapshot);
        h.click('gedit',{p:'legacy'});
      } else h.click('sheet',{k:route === 'add-big' ? 'add' : 'project',v:'big'});
      const field = route === 'gedit' ? 'ge-title' : route === 'add-big' ? 'ad-name' : 'pj-title';
      h.nodes.set(field,{value:'마감일을 정한 목표'});
      h.nodes.set('pj-text',{value:''});
      deadlineRequired(h);
      const before = h.snapshot(), action = route === 'add-big' ? 'submit-add' : `submit-${route}`;
      h.click(action); await h.settle();
      assert.deepEqual(h.snapshot(),before,'missing deadline must not persist any changes');
      assert.equal(h.nodes.get('toast').innerHTML,'마감일을 골라 주세요');
      deadlineRequired(h);
      h.click('dpopen',{k:'end'});
      assert.match(h.nodes.get('overlay').innerHTML,/data-act="dppick" data-k="end"/);
      h.click('dppick',{k:'end',v:date});
      deadlineRequired(h);
      h.click(action); await h.settle();
      const projects = Object.values(h.snapshot().projects);
      assert.equal(projects.length,1);
      assert.equal(projects[0].title,'마감일을 정한 목표');
      assert.equal(projects[0].end,date);
      assert.equal(h.nodes.get('overlay').innerHTML,'');
      assert.deepEqual(h.alerts,[]);
    });
  }
}
for (const route of ['add','quest']) {
  test(`daily ${route} UI creation still saves without a deadline`,async () => {
    const h = await profileUI();
    h.click('sheet',{k:route,v:'daily'});
    h.nodes.set(route === 'add' ? 'ad-name' : 'qs-name',{value:'매일 걷기'});
    assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/data-k="end"/);
    if (route === 'add') h.click('tmset');
    h.click(`submit-${route}`); await h.settle();
    const daily = Object.values(h.snapshot().mine).filter(x => x.kind === 'quest');
    assert.equal(daily.length,1); assert.equal(daily[0].name,'매일 걷기');
    assert.equal(daily[0].end,undefined);
    assert.equal(daily[0].time,'09:00');
    assert.deepEqual(h.alerts,[]);
  });
}
test('daily quest time is required, saved on edit and shown on its calendar days',async()=>{
  const h = await profileUI();
  h.click('sheet',{k:'add',v:'daily'}); h.nodes.set('ad-name',{value:'물 마시기'});
  assert.match(h.nodes.get('overlay').innerHTML,/시간 <span class="hint">필수<\/span>/);
  h.click('submit-add'); await h.settle();
  assert.equal(h.nodes.get('toast').innerHTML,'시간을 골라 주세요'); assert.deepEqual(h.snapshot().mine,{});
  h.click('tmset'); h.click('submit-add'); await h.settle();
  const q = Object.values(h.snapshot().mine).find(x => x.kind === 'quest');
  assert.equal(q.time,'09:00');
  h.click('hedit',{id:q.id}); assert.match(h.nodes.get('overlay').innerHTML,/data-act="tmset"/);
  h.click('sheet-close');
  h.route('cal'); h.click('cmode',{v:'week'});
  assert.match(h.nodes.get('app').innerHTML,/물 마시기/);
  h.click('cmode',{v:'month'}); assert.match(h.nodes.get('app').innerHTML,/물 마시기/);
  h.click('cmode',{v:'day'}); const day = h.nodes.get('app').innerHTML;
  assert.match(day,/물 마시기/);
  const d = new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  assert.match(day,new RegExp(`data-act="hcheckd" data-id="${q.id}" data-d="${d}"`));
  h.click('hcheckd',{id:q.id,d}); await h.settle();
  assert.equal(typeof h.snapshot().mine[q.id].done[d],'number');
});
test('sub-quest edit retains optional deadline and clear control',async () => {
  let h = await profileUI(); const snapshot = h.snapshot();
  snapshot.projects.main = {id:'main',owner:'me',title:'메인',end:'2099-12-31',status:'active'};
  snapshot.projects.sub = {id:'sub',owner:'me',parentId:'main',title:'서브',end:'2099-11-30',status:'active'};
  h = await profileUI(snapshot);
  h.click('gedit',{p:'sub'});
  assert.match(h.nodes.get('overlay').innerHTML,/마감일 <span class="hint">선택<\/span>/);
  assert.match(h.nodes.get('overlay').innerHTML,/data-act="dpclear" data-k="end"/);
  h.click('dpclear',{k:'end'});
  h.nodes.set('ge-title',{value:'수정한 서브'});
  h.click('submit-gedit'); await h.settle();
  assert.equal(h.snapshot().projects.sub.end,'');
  assert.equal(h.snapshot().projects.sub.title,'수정한 서브');
});
test('task creation still requires its own date/time, not a main-goal deadline',async () => {
  const h = await profileUI();
  h.click('sheet',{k:'add',v:'once'});
  h.nodes.set('ad-name',{value:'태스크'});
  h.click('submit-add'); await h.settle();
  assert.equal(h.nodes.get('toast').innerHTML,'날짜를 골라 주세요');
  assert.deepEqual(h.snapshot().mine,{});
  h.click('cdue1',{v:'2099-12-31'});
  h.click('submit-add'); await h.settle();
  const tasks = Object.values(h.snapshot().mine).filter(x => x.kind === 'mission');
  assert.equal(tasks.length,1); assert.equal(tasks[0].due,'2099-12-31');
  assert.equal(tasks[0].time,'09:00'); assert.equal(tasks[0].end,undefined);
});
test('legacy main goal without deadline still accepts task progress and stats updates',async () => {
  let h = await profileUI(); const snapshot = h.snapshot();
  snapshot.projects.legacy = {id:'legacy',owner:'me',title:'기존 목표',end:'',status:'active',progress:{done:0,total:1}};
  snapshot.mine.task = {id:'task',kind:'mission',name:'연결된 태스크',projectId:'legacy',lv:'normal',done:false};
  h = await profileUI(snapshot);
  h.route('me');
  assert.match(h.nodes.get('app').innerHTML,/0 \/ 100 XP/);
  h.click('mcheck',{id:'task'}); await h.settle();
  const saved = h.snapshot();
  assert.equal(saved.mine.task.done,true);
  assert.deepEqual(saved.projects.legacy.progress,{done:1,total:1});
  assert.equal(saved.projects.legacy.end,'');
  assert.match(h.nodes.get('app').innerHTML,/30 \/ 100 XP/); // Approved normal task tier 3 = 30 XP, not legacy 10.
  assert.deepEqual(h.alerts,[]);
});

async function linkedUI() {
  const base = await profileUI(), snapshot = base.snapshot();
  const now = new Date(), date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  snapshot.projects.main = {id:'main',owner:'me',title:'메인 연결 대상',end:'2099-12-31',status:'active'};
  snapshot.projects.sub = {id:'sub',owner:'me',parentId:'main',title:'서브 연결 대상',status:'active'};
  for (const [id,projectId] of [['tm','main'],['ts','sub'],['plain',null],['dangling','missing']]) {
    snapshot.mine[id] = {id,kind:'mission',name:`태스크 ${id}`,projectId,lv:'normal',today:true,due:date,done:false,createdAt:1,time:id === 'tm' ? '09:00' : id === 'ts' ? '00:05' : ''};
  }
  return profileUI(snapshot);
}
const noKindSwitch = html => assert.doesNotMatch(html,/data-act="(?:akind|tkind)"|class="kinds\b|aria-label="종류"/);
for (const kind of ['once','sub','big','daily']) {
  test(`add ${kind}: no kind switch; entry-specific fields and selectors survive`,async () => {
    const h = await linkedUI();
    h.click('sheet',{k:'add',v:kind,p:'main'});
    const html = h.nodes.get('overlay').innerHTML;
    noKindSwitch(html);
    const titles = {once:'태스크 추가',sub:'서브 퀘스트 추가',big:'메인 퀘스트 추가',daily:'데일리 퀘스트 추가'};
    assert.ok(html.includes(titles[kind]));
    if (kind === 'once') {
      assert.match(html,/data-act="tqpick"/);
      h.click('tqpick'); assert.match(h.nodes.get('overlay').innerHTML,/data-act="tqset" data-v="sub"/);
      h.click('tqset',{v:'sub'}); assert.match(h.nodes.get('overlay').innerHTML,/서브 연결 대상/);
    } else if (kind === 'sub') {
      assert.match(html,/data-act="ppick"/);
      h.click('ppick'); assert.match(h.nodes.get('overlay').innerHTML,/data-act="ppset" data-v="main"/);
      h.click('ppset',{v:'main'}); assert.match(h.nodes.get('overlay').innerHTML,/서브 퀘스트 추가/);
    } else if (kind === 'big') deadlineRequired(h);
    else assert.match(html,/data-act="rpt"/);
  });
}
for (const projectId of [null,'main','sub']) {
  test(`taskadd ${projectId}: no kind switch; linked selector works and persists exact task type`,async () => {
    const h = await linkedUI(); h.click('taskadd',projectId ? {p:projectId} : {});
    noKindSwitch(h.nodes.get('overlay').innerHTML);
    assert.match(h.nodes.get('overlay').innerHTML,/data-act="tqpick"/);
    h.nodes.set('ta-name',{value:'선택기로 연결한 태스크'});
    h.click('tqpick'); h.click('tqset',{v:'sub'});
    assert.match(h.nodes.get('overlay').innerHTML,/서브 연결 대상/);
    h.click('cdue1',{v:'2099-12-31'}); h.click('submit-taskadd'); await h.settle();
    const task = Object.values(h.snapshot().mine).find(m => m.name === '선택기로 연결한 태스크');
    assert.ok(task); assert.equal(task.kind,'mission'); assert.equal(task.projectId,'sub');
  });
}
// Inspect real rendered markup; this harness does not model browser layout.
function taskMarkup(html,id) {
  const start = html.indexOf(`data-act="tedit" data-id="${id}"`);
  assert.ok(start >= 0,`missing task row ${id}`);
  return html.slice(start,html.indexOf('</div>',start));
}
for (const page of ['today','today-main','dash','me','me-main','cal','main-detail','sub-detail']) {
   test(`${page}: ${page === 'cal' ? 'all rows omit date/time badges' : 'timed rows have one non-linking badge; untimed rows have none'}`,async () => {
    const h = await linkedUI();
    const show = () => {
      if (page.endsWith('-detail')) return h.click('project',{p:page.split('-')[0]});
      h.route(page.split('-')[0]);
      if (page.startsWith('me')) h.click('ptab',{t:'goals'});
      if (page.startsWith('today') || page.startsWith('me')) h.click('qtab',{t:page.endsWith('-main') ? 'main' : 'task'});
    };
    const before = h.snapshot();
    for (const [id,label] of page === 'sub-detail' ? [['ts','24:05']] : [['tm','9:00'],['ts','24:05']]) {
      show(); const row = taskMarkup(h.nodes.get('app').innerHTML,id);
      assert.deepEqual(timeBadges(row),page === 'cal' ? [] : [label]);
      assert.equal(row.split(label).length-1,page === 'cal' ? 0 : 1,'no raw duplicate time');
      assert.doesNotMatch(row,/task-quest-tag|data-act="project"|메인|서브|연결 대상|title=/);
      if (page === 'cal') assert.doesNotMatch(row,/<span class="tday\b/);
      else assert.match(row,/<small class="task-meta">/);
    }
    if (!page.endsWith('-detail') && !page.endsWith('-main')) {
      show();
      for (const id of ['plain','dangling']) assert.deepEqual(timeBadges(taskMarkup(h.nodes.get('app').innerHTML,id)),[]);
    }
    assert.deepEqual(h.snapshot(),before);
  });
}
test('task row body still edits and checkbox still completes independently',async () => {
  const h = await linkedUI(); h.route('today');
  h.click('tedit',{id:'ts'}); assert.match(h.nodes.get('overlay').innerHTML,/id="te-name"/);
  assert.equal(h.snapshot().mine.ts.done,false); h.click('sheet-close');
  h.click('mcheck',{id:'ts'}); await h.settle();
  assert.equal(h.snapshot().mine.ts.done,true); assert.equal(h.context.location.hash,'#today');
  assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/id="te-name"/);
});
test('all taskRow flags including noTime/bare/nested/completed/ghost show only supplied time once',async () => {
  const js = await readFile(root+'/src/legacy-app.js','utf8');
  const source = js.slice(js.indexOf('function taskTimeTag('),js.indexOf('\nfunction ring('));
  const title = '아주 긴 제목 '.repeat(40)+'<img src=x onerror="bad"> & \'끝\'';
  const escape = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const ctx = vm.createContext({S:{},esc:escape,lateDays:()=>0,dueLabel:()=> '마감일 텍스트',xpFloat:()=>'',I:{check:''},tmLabel:timeFormatter(js)});
  vm.runInContext(source,ctx);
  for (const bare of [false,true]) for (const noTime of [false,true]) for (const showGoal of [false,true]) for (const nested of [false,true]) for (const ghost of [false,true]) for (const done of [false,true]) for (const time of ['',undefined,'09:00','00:05']) {
    ctx.S._bare = bare; ctx.S._noTime = noTime;
    const row = ctx.taskRow({id:'task',name:title,projectId:'sub',_ghost:ghost,done,time,note:'메모'},showGoal,nested);
    assert.deepEqual(timeBadges(row),time ? [time === '09:00' ? '9:00' : '24:05'] : []);
    if (time) assert.equal(row.split(time === '09:00' ? '9:00' : '24:05').length-1,1);
    assert.ok(row.includes(escape(title)),'task title stays escaped text');
    assert.doesNotMatch(row,/<img|onerror="bad"|task-quest-tag|data-act="project"|>메인<|>서브</);
    if (!ghost) { assert.match(row,/마감일 텍스트/); assert.match(row,/📝 메모/); }
    else assert.match(row,/오늘로 넘어갔어요/);
  }
  for (const projectId of [null,'missing','','sub']) {
    assert.equal(ctx.taskTimeTag({projectId}),'');
    assert.deepEqual(timeBadges(ctx.taskTimeTag({projectId,time:'09:00'})),['9:00']);
  }
  for (const _ghost of [false,true]) for (const done of [false,true]) {
    const task = {id:'scoped',name:'시간 유지',time:'09:00',_ghost,done,note:'메모'};
    assert.deepEqual(timeBadges(ctx.taskRow(task,true,false,{showTime:false})),[]);
    assert.deepEqual(timeBadges(ctx.taskRow(task)),['9:00'],'calendar option never leaks to subsequent rows');
    assert.equal(task.time,'09:00');
  }
  const css = await readFile(root+'/src/shell.html','utf8');
  assert.doesNotMatch(css,/task-quest-tag/);
  assert.match(css,/\.tl \.tlc \.row \.t small\.task-meta\{display:flex\}/);
  assert.doesNotMatch(css,/small \.tday[^}]*display:none/);
});

const timeBadges = html => [...html.matchAll(/<span class="tday soft">(\d{1,2}:\d{2})<\/span>/g)].map(m => m[1]);
async function calendarActivityUI() {
  const base = await profileUI(), saved = base.snapshot(), date = '2026-11-02', at = Date.parse(date+'T00:00:00+09:00');
  saved.mine = {
    oddJournal:{id:'oddJournal',kind:'diary',date,at:1,cond:80,emo:'평온',text:'첫 저널 <img src=x> & 안전'},
    second:{id:'second',kind:'diary',date,at:1,text:'두 번째 저널'},
    daily:{id:'daily',kind:'quest',name:'완료 데일리',days:[1],done:{[date]:at}},
    done:{id:'done',kind:'mission',name:'실제 완료 태스크',done:true,doneAt:at,due:'2026-11-01',time:'09:00'},
    period:{id:'period',kind:'mission',name:'기간 완료 태스크',period:'month',done:true,doneAt:at,due:'2026-11-01'},
    legacy:{id:'legacy',kind:'mission',name:'과거 완료 태스크',done:true,due:date},
    planned:{id:'planned',kind:'mission',name:'예정 태스크',done:false,due:'2099-11-02',time:'13:00'},
    foreign:{id:'foreign',kind:'diary',date,owner:'other',text:'다른 사용자 저널'}
  };
  saved.projects = {main:{id:'main',owner:'me',title:'완료 메인',status:'done',doneAt:at},sub:{id:'sub',owner:'me',parentId:'main',title:'완료 서브',status:'done',doneAt:at},unknown:{id:'unknown',owner:'me',title:'과거 목표',status:'done'},other:{id:'other',owner:'other',title:'다른 사용자 목표',status:'done',doneAt:at}};
  saved.feed = {minePost:{id:'minePost',author:'me',createdAt:at,text:'공유 스토리',imgs:0,ref:{type:'diary',id:'oddJournal',extra:{}}},secondPost:{id:'secondPost',author:'me',createdAt:at+1,text:'두 번째 스토리',imgs:0},otherPost:{id:'otherPost',author:'other',createdAt:at,text:'다른 사용자 스토리',imgs:0}};
  const h = await profileUI(saved); h.route('cal'); h.click('cpick',{v:date,m:'month'});
  return h;
}
test('past month date buttons open the day records page; back returns to the same month without storage changes',async()=>{
  const h = await calendarActivityUI(), before = h.snapshot(), month = h.nodes.get('app').innerHTML;
  const button = month.match(/<button class="mn" data-act="([^"]+)" data-v="(2026-11-02)"[^>]*>/);
  assert.ok(button); assert.match(button[0],/날짜 눌러 기록 보기 · 기록·완료 9개/);
  h.click(button[1],{v:button[2]});
  assert.equal(h.context.location.hash,'#calday'); assert.equal(h.nodes.get('overlay').innerHTML,'');
  assert.match(h.nodes.get('topbar').innerHTML,/data-act="back"/);
  const sheet = h.nodes.get('app').innerHTML;
  for (const text of ['첫 저널','두 번째 저널','공유 스토리','두 번째 스토리','완료 데일리','실제 완료 태스크','기간 완료 태스크','완료 메인','완료 서브','완료</h3>','예정 · 태스크','날짜 미확인','과거 완료 태스크']) assert.ok(sheet.includes(text),text);
  assert.match(sheet,/data-date="2026-11-02"/); assert.match(sheet,/&lt;img src=x&gt; &amp; 안전/);
  assert.doesNotMatch(sheet,/다른 사용자|<img src=x>|class="tday\b|id="pl-text"|data-act="psave"/);
  assertNoNestedButtons(sheet); assert.deepEqual(h.snapshot(),before);
  h.route('cal'); assert.equal(h.nodes.get('app').innerHTML,month,'back keeps month view');
  h.click('cstep',{v:'1'}); assert.match(h.nodes.get('app').innerHTML,/2026년 12월/);
  h.click('cstep',{v:'-1'}); assert.match(h.nodes.get('app').innerHTML,/2026년 11월/);
  h.click('cmode',{v:'week'}); assert.match(h.nodes.get('app').innerHTML,/class="wgrid"/);
  h.click('cmode',{v:'month'}); assert.match(h.nodes.get('app').innerHTML,/지난 날짜는 기록 보기/);
});
test('day records page journal view never initializes editor; story and goals navigate; today/future open the day tab',async()=>{
  const h = await calendarActivityUI(), before = h.snapshot();
  h.click('cdate',{v:'2026-11-02'}); assert.equal(h.context.location.hash,'#calday'); h.click('journal-view',{id:'oddJournal'});
  assert.match(h.nodes.get('overlay').innerHTML,/읽기 전용/); assert.match(h.nodes.get('overlay').innerHTML,/첫 저널 &lt;img/);
  assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/textarea|data-act="psave"/); assert.deepEqual(h.snapshot(),before);
  h.click('cdate',{v:'2026-11-02'}); h.click('day-post',{p:'minePost'});
  assert.equal(h.context.location.hash,'#post'); assert.match(h.nodes.get('app').innerHTML,/공유 스토리/); assert.equal(h.nodes.get('overlay').innerHTML,'');
  h.route('cal'); h.click('cdate',{v:'2026-11-02'}); h.click('day-project',{p:'sub'});
  assert.equal(h.context.location.hash,'#goal'); assert.match(h.nodes.get('app').innerHTML,/완료 서브/);
  h.route('cal'); h.click('cdate',{v:'2026-01-15'}); assert.match(h.nodes.get('app').innerHTML,/이 날의 기록이나 완료한 항목이 없어요/);
  assert.doesNotMatch(h.nodes.get('app').innerHTML,/data-act="journal-view"|data-act="day-post"/);
  h.click('day-schedule',{v:'2026-01-15'}); assert.equal(h.context.location.hash,'#cal'); h.route('cal'); assert.match(h.nodes.get('app').innerHTML,/1월 15일/);
  h.click('cdate',{v:'2099-11-02'}); assert.equal(h.context.location.hash,'#cal'); assert.equal(h.nodes.get('overlay').innerHTML,'');
  assert.match(h.nodes.get('app').innerHTML,/data-d="2099-11-02"/); assert.match(h.nodes.get('app').innerHTML,/data-act="cmode" data-v="day" aria-pressed="true"/);
  h.click('taskadd',{d:'2099-11-02',tm:'14:00'}); assert.match(h.nodes.get('overlay').innerHTML,/14:00/);
  assert.deepEqual(h.snapshot(),before);
});
test('completion timestamp survives edits/viewing, undo clears and recomplete stamps only actual toggle',async()=>{
  const h = await calendarActivityUI();
  h.context.confirm = () => true;
  const previous = h.snapshot().mine.done.doneAt;
  h.click('tedit',{id:'done'}); h.nodes.set('te-name',{value:'수정한 완료 태스크'}); h.nodes.set('te-note',{value:'메모'});
  h.click('submit-tedit'); await h.settle(); assert.equal(h.snapshot().mine.done.doneAt,previous);
  h.click('mcheck',{id:'done'}); h.click('cfok'); await h.settle(); assert.equal(h.snapshot().mine.done.doneAt,null);
  h.click('mcheck',{id:'done'}); await h.settle(); assert.ok(h.snapshot().mine.done.doneAt >= previous);
  const before = h.snapshot(); h.click('cdate',{v:'2026-11-02'}); h.click('sheet-close'); assert.deepEqual(h.snapshot(),before);
});
test('month native date buttons and mobile sheets retain keyboard and bounded scrolling contract',async()=>{
  const h = await calendarActivityUI(), html = h.nodes.get('app').innerHTML;
  assert.match(html,/<button class="mn" data-act="cdate" data-v="2026-11-02" aria-label=/);
  assertNoNestedButtons(html);
  const css = await readFile(root+'/src/shell.html','utf8');
  assert.match(css,/\.sheet\{[^}]*max-height:calc\(100dvh[^}]*overflow:auto/);
  assert.match(css,/\.journal-content\{white-space:pre-wrap;overflow-wrap:anywhere/);
});
test('legacy completion stays undated after edits; new task and goal toggles persist actual doneAt',async()=>{
  const h = await calendarActivityUI();
  h.click('tedit',{id:'legacy'}); h.click('cdue1',{v:'2099-11-03'});
  h.nodes.set('te-name',{value:'과거 완료 수정'}); h.nodes.set('te-note',{value:''});
  h.click('submit-tedit'); await h.settle(); assert.equal(h.snapshot().mine.legacy.doneAt,undefined);
  h.click('cdate',{v:'2099-11-03'});
  assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/<div class="row qrow [^"]*" data-act="tedit" data-id="legacy"/);
  h.click('sheet-close'); h.click('mcheck',{id:'planned'}); await h.settle();
  assert.equal(h.snapshot().mine.planned.done,true); assert.equal(typeof h.snapshot().mine.planned.doneAt,'number');
  const base = await profileUI(), saved = base.snapshot();
  saved.projects = {main:{id:'main',owner:'me',title:'수동 완료',status:'active',end:'2099-11-03'}};
  const goal = await profileUI(saved); goal.click('pdone',{p:'main'}); goal.click('pdone',{p:'main'}); await goal.settle();
  assert.equal(goal.snapshot().projects.main.status,'done'); assert.equal(typeof goal.snapshot().projects.main.doneAt,'number');
});
const visibleText = html => html.replace(/<[^>]*>/g,'');
function timeFormatter(js) {
  const ctx = vm.createContext({pad:n=>String(n).padStart(2,'0')});
  vm.runInContext(js.match(/const tmLabel = [^\n]+/)[0]+'\nthis.format = tmLabel;',ctx);
  return ctx.format;
}
function assertNoNestedButtons(html) {
  let open = false;
  for (const m of html.matchAll(/<\/?button\b[^>]*>/g)) {
    if (m[0].startsWith('</')) open = false;
    else { assert.equal(open,false,'button must not contain another button'); open = true; }
  }
}
for (const mode of ['day','week','month','year']) {
  test(`calendar ${mode}: no task date/time badges; axes, dates and schedules preserved`,async () => {
    const h = await linkedUI(); h.route('cal'); h.click('cmode',{v:mode});
    const html = h.nodes.get('app').innerHTML;
    assert.doesNotMatch(html,/<span class="tday\b/);
    assert.match(html,/class="calnav"/);
    assertNoNestedButtons(html);
    const badges = timeBadges(html), before = h.snapshot();
    assert.doesNotMatch(html,/task-quest-tag|퀘스트 상세 보기/);
    if (mode === 'year') {
      assert.equal(badges.length,0,'year is a counts-only heatmap with no task names');
      assert.doesNotMatch(html,/태스크 tm|태스크 ts/);
      h.click('cpick',{v:h.snapshot().mine.tm.due.slice(0,7)+'-01',m:'month'});
      assert.deepEqual(timeBadges(h.nodes.get('app').innerHTML),[],'year drill-down month has no badges');
      h.click('cpick',{v:before.mine.tm.due,m:'day'});
      assert.deepEqual(timeBadges(h.nodes.get('app').innerHTML),[],'day details have no badges');
      assert.doesNotMatch(h.nodes.get('app').innerHTML,/<span class="tday\b/);
    } else {
      assert.deepEqual(badges,[]);
      assert.match(html,/태스크 tm/);
      if (mode !== 'month') {
        for (let hr=1;hr<=24;hr++) assert.match(html,new RegExp(`data-h="${hr}"`));
        assert.match(html,/>9시</); assert.match(html,/>24시</);
        assert.match(html,/data-tm="08:00"/,'empty hour keeps scheduling control');
        assert.match(html,new RegExp(`data-d="${before.mine.tm.due}"`));
        assert.match(html,/data-first="9"/,'timed tasks still determine initial hour');
      } else assert.match(html,new RegExp(`data-v="${before.mine.tm.due}"`));
    }
    assert.doesNotMatch(visibleText(html),/9:00|24:05/);
    assert.deepEqual(h.snapshot(),before);
    h.route('today'); h.click('qtab',{t:'task'});
    assert.deepEqual(timeBadges(taskMarkup(h.nodes.get('app').innerHTML,'tm')),['9:00'],'leaving calendar restores time badges');
    h.route('cal'); h.click('tedit',{id:'tm'});
    assert.match(h.nodes.get('overlay').innerHTML,/data-act="tmset"[^>]*aria-pressed="true"/,'calendar task editor retains time control');
    assert.match(h.nodes.get('overlay').innerHTML,/<span class="tmval">9:00<\/span>/,'calendar editor retains scheduled time');
    assert.match(h.nodes.get('overlay').innerHTML,/data-act="cdue1"/,'calendar editor retains date control');
  });
}
for (const mode of ['day','week','month']) {
  test(`calendar ${mode}: completed and ghost rows omit time badges even with missing links`,async () => {
    let h = await linkedUI(); const snapshot = h.snapshot(), date = snapshot.mine.tm.due;
    const tomorrow = new Date(date+'T00:00:00'); tomorrow.setDate(tomorrow.getDate()+1);
    const next = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
    snapshot.mine.tm.time = '09:00';
    snapshot.mine.ts.done = true; snapshot.mine.ts.doneAt = Date.now();
    snapshot.mine.ghost = {id:'ghost',kind:'mission',name:'넘겨진 태스크',projectId:'missing',lv:'normal',due:next,origDue:date,done:false,time:'13:15'};
    // Keep the month cell within its existing three-item display limit.
    delete snapshot.mine.plain; delete snapshot.mine.dangling;
    h = await profileUI(snapshot); h.route('cal'); h.click('cmode',{v:mode});
    const html = h.nodes.get('app').innerHTML; assertNoNestedButtons(html);
    assert.doesNotMatch(html,/<span class="tday\b/);
    const badges = timeBadges(html);
    assert.deepEqual(badges,[]);
    assert.match(html,/넘겨진 태스크/); assert.match(html,/태스크 ts/);
    assert.doesNotMatch(visibleText(html),/9:00|24:05|13:15/);
    if (mode !== 'month') assert.deepEqual(timeBadges(taskMarkup(html,'ghost')),[]);
    assert.doesNotMatch(html,/task-quest-tag|퀘스트 상세 보기/);
    for (const label of new Set(badges)) assert.equal(visibleText(html).split(label).length-1,badges.filter(b=>b===label).length,'one time per rendered occurrence');
    h.click('mcheck',{id:'tm'}); await h.settle(); assert.equal(h.snapshot().mine.tm.done,true);
  });
}
test('custom drafts and mission references show only supplied time and preserve titles/dates',async () => {
  const js = await readFile(root+'/src/legacy-app.js','utf8');
  const ctx = vm.createContext({S:{projects:{main:{title:'비공개 제목'},sub:{parentId:'main',title:'비공개 제목'}}},esc:String,isProj:p=>!!p?.parentId,
    today:()=> '2026-11-01',tomorrow:()=> '2026-11-02',tlv:()=>TASK_DIFFICULTY.normal,tmLabel:timeFormatter(js)});
  for (const [start,end] of [['function taskTimeTag(','function taskRow('],['function taskFields(','function metricFields('],['function refHtml(','function metricFor(']]) {
    vm.runInContext(js.slice(js.indexOf(start),js.indexOf(end)),ctx);
  }
  ctx.I = {chev:''};
  const draft = ctx.taskFields({tasks:[{name:'초안',lv:'normal',projectId:'sub',due:'2026-11-01',time:'09:00'},{name:'미연결',lv:'normal',time:'00:05'},{name:'시간 없음',lv:'normal',projectId:'main'}]});
  assert.deepEqual(timeBadges(draft),['9:00','24:05']); assertNoNestedButtons(draft);
  assert.match(draft,/<b>초안<\/b><em class="tdue">오늘<\/em>/);
  assert.match(draft,/<b>시간 없음<\/b><button/);
  assert.equal(draft.split('9:00').length-1,1);
  for (const projectId of ['main','sub','missing']) {
    const html = ctx.refHtml({ref:{type:'mission',id:projectId,mission:'완료 태스크'}});
    assert.deepEqual(timeBadges(html),[],'do not invent a task time from a project ID');
    assert.doesNotMatch(html,/비공개 제목/); assertNoNestedButtons(html);
    assert.match(html,/태스크 완료 · 완료 태스크/);
    assert.deepEqual(timeBadges(ctx.refHtml({ref:{type:'mission',id:projectId,mission:'완료 태스크',time:'09:00'}})),['9:00']);
  }
  assert.doesNotMatch(js,/taskQuestTag|task-quest-tag/);
});
for (const mode of ['day','week','month']) {
  test(`calendar ${mode}: untimed linked/ghost and timed unlinked completed tasks have no badges`,async () => {
    let h = await linkedUI(); const snapshot = h.snapshot(), date = snapshot.mine.tm.due;
    delete snapshot.mine.ts; delete snapshot.mine.dangling;
    snapshot.mine.tm.time = '';
    snapshot.mine.plain.time = '17:45'; snapshot.mine.plain.done = true; snapshot.mine.plain.doneAt = Date.now();
    const nextDate = new Date(date+'T00:00:00'); nextDate.setDate(nextDate.getDate()+1);
    const next = `${nextDate.getFullYear()}-${String(nextDate.getMonth()+1).padStart(2,'0')}-${String(nextDate.getDate()).padStart(2,'0')}`;
    snapshot.mine.ghost = {id:'ghost',kind:'mission',name:'시간 없는 고스트',projectId:'main',lv:'normal',due:next,origDue:date,done:false};
    h = await profileUI(snapshot); h.route('cal'); h.click('cmode',{v:mode});
    const html = h.nodes.get('app').innerHTML;
    assert.deepEqual(timeBadges(html),[]);
    assert.doesNotMatch(html,/<span class="tday\b/);
    assert.doesNotMatch(visibleText(html),/17:45/);
    assert.doesNotMatch(html,/task-quest-tag|퀘스트 상세 보기/);
    if (mode !== 'month') {
      assert.deepEqual(timeBadges(taskMarkup(html,'ghost')),[]);
      assert.deepEqual(timeBadges(taskMarkup(html,'tm')),[]);
    }
  });
}
test('calendar detail and all period helpers suppress only date/time badges including ghosts',async () => {
  const js = await readFile(root+'/src/legacy-app.js','utf8');
  const task = {id:'period',name:'기간 태스크',time:'09:00',period:'week',due:'2026-11-01',note:'메모'};
  const ghost = {...task,id:'ghost',name:'넘겨진 태스크',_ghost:true};
  const ctx = vm.createContext({by:{'2026-11-01':[task,ghost]},mineOf:()=>[task,ghost],esc:String,lateDays:()=>3,
    dueLabel:()=> '<span class="tday soft">11월 1일</span>',xpFloat:()=>'',I:{check:''},tmLabel:timeFormatter(js)});
  vm.runInContext(js.slice(js.indexOf('function taskTimeTag('),js.indexOf('\nfunction ring(')),ctx);
  vm.runInContext(js.slice(js.indexOf('  const calTaskRow ='),js.indexOf('  const byTime ='))+
    '\nthis.details = () => dayList("2026-11-01"); this.period = per => perCard(per,"2026-11-01","기간 목록");',ctx);
  for (const per of ['week','month','year']) {
    task.period = ghost.period = per;
    for (const html of [ctx.details(),ctx.period(per)]) {
    assert.deepEqual(timeBadges(html),[]);
    assert.doesNotMatch(html,/<span class="tday\b|11월 1일/);
    assert.match(html,/기간 태스크/); assert.match(html,/📝 메모/); assert.match(html,/3일째 미룸/);
    assert.match(html,/넘겨진 태스크/); assert.match(html,/오늘로 넘어갔어요/);
    assert.match(html,/data-act="tedit"/); assert.match(html,/data-act="mcheck"/);
    }
  }
  assert.deepEqual(timeBadges(ctx.taskRow(task)),['9:00']);
  assert.match(ctx.taskRow(task),/<span class="tday soft">11월 1일<\/span>/,'outside calendar date badge remains');
  assert.equal(task.time,'09:00');
});
test('showDate and showTime are independent row options for every real due badge',async () => {
  const js = await readFile(root+'/src/legacy-app.js','utf8');
  const ctx = vm.createContext({S:{},esc:String,lateDays:()=>2,xpFloat:()=>'',I:{check:''},
    today:()=> '2026-11-01',tomorrow:()=> '2026-11-02',dueOf:m=>m.due,
    perEnd:(_per,due)=>due,perName:()=> '이번 주',tmLabel:timeFormatter(js)});
  vm.runInContext(js.slice(js.indexOf('function dueLabel('),js.indexOf('const dueField =')),ctx);
  vm.runInContext(js.slice(js.indexOf('function taskTimeTag('),js.indexOf('\nfunction ring(')),ctx);
  for (const [due,period,label] of [['2026-10-31',null,'기한 지남'],['2026-11-01',null,'오늘'],
    ['2026-11-02',null,'내일'],['2026-11-12',null,'11/12'],['2026-11-01','week','이번 주'],['2026-10-01','month','기한 지남']]) {
    const task = {id:'dates',name:'날짜 확인',due,period,time:'09:00',note:'메모'};
    const calendar = ctx.taskRow(task,true,false,{showDate:false,showTime:false});
    assert.doesNotMatch(calendar,/<span class="tday\b/);
    assert.match(calendar,/📝 메모/); assert.match(calendar,/2일째 미룸/);
    assert.match(ctx.taskRow(task),new RegExp(`<span class="tday[^\"]*">${label}</span>`));
    assert.deepEqual(timeBadges(ctx.taskRow(task)),['9:00']);
    assert.deepEqual(timeBadges(ctx.taskRow(task,true,false,{showDate:false})),['9:00']);
    const dateOnly = ctx.taskRow(task,true,false,{showTime:false});
    assert.match(dateOnly,new RegExp(`<span class="tday[^\"]*">${label}</span>`));
    assert.deepEqual(timeBadges(dateOnly),[]);
  }
});
test('story image/text captions and compose mission references never invent time or show quest tags',async () => {
  const js = await readFile(root+'/src/legacy-app.js','utf8');
  const overlay = {innerHTML:''}; let post = {}, sheet = '';
  const ctx = vm.createContext({S:{projects:{},media:{},compose:null},esc:String,tmLabel:timeFormatter(js),
    seenStories:new Set(),LS:{set(){}},svCur:()=>post,liked:()=>false,$:s=>s === '#overlay' ? overlay : null,
    colorOf:()=>'',fig:()=>'',nameOf:()=>'',ago:()=>'',canAct:()=>false,I:{burst:''},
    sheetWrap:(_title,_extra,html)=>{sheet=html;},D:()=>'',MAX_IMGS:4,SOCIAL:{post:1}});
  for (const [start,end] of [['function taskTimeTag(','function taskRow('],['function svRender(','function svStart('],['function postSheet(','function replySheet(']]) {
    vm.runInContext(js.slice(js.indexOf(start),js.indexOf(end)),ctx);
  }
  vm.runInContext('var SV = {users:[{uid:"other",items:[{}]}],ui:0,ii:0};',ctx);
  for (const time of [undefined,'09:00']) {
    for (const imgs of [0,1]) {
      post = {id:'post',imgs,text:'본문',ref:{type:'mission',id:'main',mission:'태스크 제목',time}};
      if (imgs) ctx.S.media['post~0'] = 'test-image';
      ctx.svRender();
      assert.deepEqual(timeBadges(overlay.innerHTML),time ? ['9:00'] : []);
      assert.match(overlay.innerHTML,/태스크 제목/);
      assert.doesNotMatch(overlay.innerHTML,/task-quest-tag|퀘스트 상세 보기/);
    }
    ctx.S.compose = {ref:post.ref,photos:[]}; ctx.postSheet('');
    assert.deepEqual(timeBadges(sheet),time ? ['9:00'] : []);
    assert.match(sheet,/태스크 제목/);
    assert.doesNotMatch(sheet,/task-quest-tag|퀘스트 상세 보기/);
  }
});

const removedEconomyGuidance = /economy-help|price-help|restinfo|resttoday|restcancel|restdis|rest-date|보상·가격 안내|가격 정하기 도움말|무료 쉬는 날|무료 휴식 계획|오늘 휴식 취소|성취 일수|현금 환산|휴식권 포함|경제 적용 종료|연속 기록을 보존하지만 늘리지/;
const removedEconomySummary = /economyStrip|eco-strip|wd-economy|경제 요약|오늘 기본|일일 제한 없음|다음 레벨까지|이번 주 \d+\/5일|3일 \+60 XP·30 코인|5일 추가 \+40 XP·20 코인|자동 지급|찜:|코인 더 필요|<b>정산 조정|코인 · 다음 수입으로 상계/;
test('economy shop tabs and reward form omit guidance while price constraints still validate',async()=>{
  const h=await profileUI();h.route('shop');
  assert.match(h.nodes.get('app').innerHTML,/꾸미기|보관함/);assert.doesNotMatch(h.nodes.get('app').innerHTML,/buyrest|휴식권 구매/);
  for(const tab of ['personal','inventory','history','decorate']){h.click('shop-tab',{v:tab});assert.ok(h.nodes.get('app').innerHTML.length);assert.doesNotMatch(h.nodes.get('app').innerHTML,removedEconomyGuidance);}
  h.click('sheet',{k:'reward'});let markup=h.nodes.get('overlay').innerHTML;
  assert.match(markup,/id="rw-cost"[^>]*value=""/);for(const v of [100,300,500,1000,3000])assert.match(markup,new RegExp(`data-f="cost" data-v="${v}"`));
  assert.match(markup,/data-v="300" aria-pressed="true"/,'300 is the default preset');assert.doesNotMatch(markup,/rw-repeat|rw-daily|rw-weekly/);assert.doesNotMatch(markup,removedEconomyGuidance);
  const costField=markup.slice(markup.indexOf('<span class="lab">가격'),markup.indexOf('<span class="lab">가격')+500);
  assert.doesNotMatch(costField,/<p class="hint"/);
  h.nodes.set('rw-name',{value:'직접 정한 보상'});
  const before=h.snapshot();
  for(const value of ['0','-5','4','7','7.5','NaN']){
    h.nodes.set('rw-cost',{value});h.click('submit-reward');await h.settle();
    assert.deepEqual(h.snapshot(),before,`invalid price ${value} never writes`);
    assert.match(h.nodes.get('toast').innerHTML,/가격은 5 이상, 5 단위/);
  }
  h.nodes.set('rw-cost',{value:'65'});h.click('submit-reward');await h.settle();
  const r=Object.values(h.snapshot().mine).find(x=>x.kind==='reward');assert.equal(r.cost,65);
  h.route('shop');h.click('shop-tab',{v:'personal'});h.click('wishlist',{id:r.id});await h.settle();assert.equal(h.snapshot().mine[r.id].wishlist,true);
  h.click('redit',{id:r.id});markup=h.nodes.get('overlay').innerHTML;
  assert.doesNotMatch(markup,removedEconomyGuidance);assert.match(markup,/id="rw-cost"[^>]*value="65"/,'custom price shows in the custom field');
  h.nodes.set('rw-cost',{value:'5'});h.click('submit-reward');await h.settle();
  assert.equal(h.snapshot().mine[r.id].cost,5,'minimum valid price still saves');
  h.click('redit',{id:r.id});h.click('cset',{f:'cost',v:'1000'});h.nodes.set('rw-cost',{value:''});h.click('submit-reward');await h.settle();
  assert.equal(h.snapshot().mine[r.id].cost,1000,'preset chip saves when no custom price is typed');
});
test('all activity creation/edit choices contain five tiers and retain legacy tier keys',async()=>{
  const h=await linkedUI();
  for(const [k,v] of [['add','once'],['add','daily'],['quest',null],['mission',null]]){
    h.click('sheet',{k,...(v?{v}:{})});const m=h.nodes.get('overlay').innerHTML;
    for(const tier of ['tiny','easy','normal','hard','epic'])assert.ok(m.includes(`data-v="${tier}"`));
  }
  h.click('tedit',{id:'tm'});assert.match(h.nodes.get('overlay').innerHTML,/data-v="normal" aria-pressed="true"/);
});
function assertDifficultySelector(html,kind){
  assert.doesNotMatch(html,/difficulty-(?:detail|guide|payout)|기준으로 골라 주세요|기본 보상 · 완료 시|첫 완료·주간 추가 보너스 제외|오늘 한도 기준|오늘은 쉬는 날이라 보상이 없어요|새 완료 기준 미리보기|이미 지급된 보상은 난이도 수정/);
  const tree=layoutTree(html),selectors=[];
  const visit=node=>{if(node.classes.includes('difficulty-selector'))selectors.push(node);node.children.forEach(visit);};
  visit(tree);
  assert.equal(selectors.length,1);
  assert.deepEqual(selectors[0].children.map(n=>[n.tag,n.classes[0]]),[['span','lab'],['div','opts']],'selector ends immediately after the button group');
  const own=kind==='quest'?DAILY_DIFFICULTY:TASK_DIFFICULTY;
  const buttons=[...html.matchAll(/<button class="opt"[^>]*data-act="cset"[^>]*data-f="(?:h?lv)"[^>]*data-v="([^"]+)"[^>]*>[\s\S]*?<\/button>/g)];
  assert.deepEqual(buttons.map(x=>x[1]),TIERS);
  assert.equal((buttons.map(x=>x[0]).join('').match(/<rect\b/g)||[]).length,25);
  assert.doesNotMatch(buttons.map(x=>x[0]).join(''),/[🔰🥉🥈🥇👑🟢🔵🟡🟠🔴]/u);
  for(const [markup,key] of buttons){
    assert.ok(markup.includes(`<span class="e">${own[key].e}</span>`));
    assert.ok(markup.includes(`<b>${own[key].n}`));
    const reward=activityReward(kind,key);
    assert.ok(markup.includes(`<small>+${reward.xp} XP · +${reward.coins} 코인</small>`));
    const text=visibleText(markup);
    assert.ok(text.includes(own[key].n));
    const name=markup.match(/<b>([^<]+)/)[1];
    for(const label of LABELS)assert.notEqual(name,label,`shared label: ${label}`);
  }
}
for(const [route,kind] of [['add-daily','quest'],['quest','quest'],['hedit','quest'],['add-once','mission'],['mission','mission'],['taskadd','mission'],['tedit','mission']]){
  test(`${route}: shared five labels/icons and correct kind-specific selected tier`,async()=>{
    let h=await linkedUI();const saved=h.snapshot();
    saved.mine.daily={id:'daily',kind:'quest',name:'기존 데일리',lv:'epic',days:[1,2,3,4,5,6,0],done:{}};
    h=await profileUI(saved);const before=h.snapshot();
    if(route.startsWith('add-'))h.click('sheet',{k:'add',v:route.slice(4)});
    else if(route==='hedit'||route==='tedit')h.click(route,{id:route==='hedit'?'daily':'tm'});
    else if(route==='taskadd')h.click(route);
    else h.click('sheet',{k:route});
    assertDifficultySelector(h.nodes.get('overlay').innerHTML,kind);
    if(route==='hedit')assert.match(h.nodes.get('overlay').innerHTML,/data-v="epic" aria-pressed="true"/);
    if(route==='tedit')assert.match(h.nodes.get('overlay').innerHTML,/data-v="normal" aria-pressed="true"/);
    assert.deepEqual(h.snapshot(),before,'viewing existing records does not mutate storage');
  });
}
for(const parent of ['project','sub','add-big','add-sub']){
  test(`${parent}: nested task selector and draft use task metadata and retain tier keys`,async()=>{
    const h=await linkedUI(),before=h.snapshot();
    h.click('sheet',parent.startsWith('add-')?{k:'add',v:parent.slice(4),p:'main'}:{k:parent,p:'main'});
    for(const key of TIERS){
      h.click('ntopen');assertDifficultySelector(h.nodes.get('overlay').innerHTML,'mission');
      h.click('cset',{f:'lv',v:key});h.click('cdue1',{v:'2099-12-31'});
      h.nodes.set('nt-name',{value:`초안 ${key}`});h.click('addtask');
      const html=h.nodes.get('overlay').innerHTML;
      assert.ok(html.includes(`<span title="${TASK_DIFFICULTY[key].n}" aria-label="${TASK_DIFFICULTY[key].n}">${TASK_DIFFICULTY[key].e}</span><b>초안 ${key}</b>`));
    }
    assert.deepEqual(h.snapshot(),before,'nested drafts are not persisted before saving parent');
  });
}
test('existing daily records render current icons for five tiers and legacy aliases without writes',async()=>{
  const base=await linkedUI(),saved=base.snapshot();
  for(const key of [...TIERS,'gold'])saved.mine[`d-${key}`]={id:`d-${key}`,kind:'quest',name:`기존 ${key}`,lv:key,days:[0,1,2,3,4,5,6],done:{}};
  const h=await profileUI(saved),before=h.snapshot();h.click('sheet',{k:'hset'});
  const html=h.nodes.get('overlay').innerHTML;
  for(const key of [...TIERS,'gold']){
    const meta=DAILY_DIFFICULTY[key==='gold'?'normal':key];
    assert.ok(html.includes(`data-id="d-${key}"><span class="ic sq" title="${meta.n}" aria-label="${meta.n}">${meta.e}</span>`));
  }
  assert.deepEqual(h.snapshot(),before);
});
test('dashboard/profile/shop omit the entire economy summary and retain balances without writes',async()=>{
  const h=await profileUI(),before=h.snapshot();
  for(const route of ['dash','me','shop']){
    h.route(route);const html=h.nodes.get('app').innerHTML;
    assert.doesNotMatch(html,removedEconomyGuidance);
    assert.doesNotMatch(html,removedEconomySummary);
    if(route==='shop'){
      assert.match(html,/사용 가능 코인/);
      assert.match(html,new RegExp(`🪙 ${balances(before).gold}`));
      assert.deepEqual([...html.matchAll(/data-act="shop-tab" data-v="([^"]+)"/g)].map(m=>m[1]),['items','personal','inventory']);
    }else{
      assert.match(html,/Lv\.\d+/);assert.match(html,/role="progressbar" aria-label="레벨 진행도"/);
      assert.match(html,/class="num coinm"/);assert.match(html,/\d+ \/ [\d,]+ XP/);
    }
    assert.deepEqual(h.snapshot(),before);
  }
  for(const act of ['economy-help','price-help','restinfo','resttoday','restcancel','restdis']){
    h.click(act);await h.settle();assert.equal(h.nodes.get('overlay').innerHTML,'');assert.deepEqual(h.snapshot(),before);
  }
  const source=await readFile(root+'/src/legacy-app.js','utf8');
  assert.doesNotMatch(source,removedEconomyGuidance);
  assert.doesNotMatch(source,removedEconomySummary);
  assert.doesNotMatch(await readFile(root+'/src/shell.html','utf8'),/eco-strip|wd-economy/);
  assert.doesNotMatch(source,/priceParent|c\.type === "rest"/);
  for(const file of ['quest.html','quest-demo.html','login-preview.html','image-start.html']){
    assert.doesNotMatch(await readFile(root+'/dist/'+file,'utf8'),removedEconomyGuidance);
    assert.doesNotMatch(await readFile(root+'/dist/'+file,'utf8'),removedEconomySummary);
  }
});
test('summary stays absent with wishlist/debt and after activity rewards accrue',async()=>{
  const base=await linkedUI(),saved=base.snapshot();
  saved.mine.wish={id:'wish',kind:'reward',name:'찜한 보상',cost:65,wishlist:true};
  saved.economy.events[0].coins=-10;
  const h=await profileUI(saved),before=h.snapshot(),start=balances(before);
  assert.equal(start.debt,10);
  const checkRoutes=()=>{
    for(const route of ['dash','me','shop']){
      h.route(route);assert.doesNotMatch(h.nodes.get('app').innerHTML,removedEconomySummary);
      assert.doesNotMatch(h.nodes.get('app').innerHTML,/정산 조정|다음 수입으로 상계/);
    }
  };
  checkRoutes();assert.deepEqual(h.snapshot(),before,'browsing preserves wishlist, debt and ledger');
  h.route('today');h.click('mcheck',{id:'tm'});await h.settle();
  const after=h.snapshot(),earned=balances(after);
  assert.equal(earned.xp-start.xp,30);assert.equal(earned.raw-start.raw,60);
  assert.equal(earned.debt,0);assert.equal(earned.gold,50);
  assert.deepEqual(after.economy.events.slice(0,before.economy.events.length),before.economy.events,'existing ledger prefix is unchanged');
  assert.equal(after.mine.wish.wishlist,true);
  checkRoutes();assert.deepEqual(h.snapshot(),after,'rendering after payout never changes rewards');
});
for(const [route,kind,field,input] of [
  ['add-daily','quest','hlv','ad-name'],['quest','quest','lv','qs-name'],['hedit','quest','hlv','he-name'],
  ['add-once','mission','lv','ad-name'],['mission','mission','lv','ms-name'],['taskadd','mission','lv','ta-name'],
  ['tedit','mission','lv','te-name'],['nttask','mission','lv','nt-name']
])test(`${route}: every tier has no below-selector details, keeps button payouts and drafts, never issues rewards`,async()=>{
  let h=await linkedUI(),saved=h.snapshot();
  saved.mine.daily={id:'daily',kind:'quest',name:'데일리',lv:'easy',days:[0,1,2,3,4,5,6],done:{}};
  h=await profileUI(saved);
  if(route.startsWith('add-'))h.click('sheet',{k:'add',v:route.slice(4)});
  else if(route==='hedit'||route==='tedit')h.click(route,{id:route==='hedit'?'daily':'tm'});
  else if(route==='taskadd')h.click(route);
  else if(route==='nttask'){h.click('sheet',{k:'project'});h.click('ntopen');}
  else h.click('sheet',{k:route});
  const before=h.snapshot();
  // Model the live sheet controls so preservation is tested without relying on input events.
  h.context.document.querySelectorAll=selector=>selector==='.sheet input[id], .sheet textarea[id]'
    ? [...h.nodes.values()].filter(n=>n.value!==undefined && h.nodes.get('overlay').innerHTML.includes(`id="${n.id}"`)) : [];
  h.nodes.set(input,{id:input,value:'작성 중 <초안>',type:'text'});
  if(route==='tedit')h.nodes.set('te-note',{id:'te-note',value:'메모 유지',type:'textarea'});
  for(const tier of TIERS){
    h.click('cset',{f:field,v:tier});
     const html=h.nodes.get('overlay').innerHTML;
     assert.match(html,new RegExp(`data-v="${tier}" aria-pressed="true"`));
     assertDifficultySelector(html,kind);
    assert.ok(html.includes('value="작성 중 &lt;초안&gt;"'));
    if(route==='tedit')assert.match(html,/>메모 유지<\/textarea>/);
    assert.deepEqual(h.snapshot(),before);
  }
});
test('selectors omit cap/rest details and retain base button payouts without changing reserved claims',async()=>{
  const base=await profileUI(),saved=base.snapshot();
  const date=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  saved.economy.claims.used={daily:true,date,xp:140,coins:80,active:true};
  saved.economy.claims.undone={daily:true,date,xp:5,coins:5,active:false};
  saved.economy.claims.extra={daily:false,date,xp:100,coins:50,active:true};
   for(const rested of [false,true]){
   saved.mine.rest={days:rested?{[date]:true}:{}};
   const h=await profileUI(saved),before=h.snapshot();
   for(const kind of ['once','daily']){
    h.click('sheet',{k:'add',v:kind});h.click('cset',{f:kind==='daily'?'hlv':'lv',v:'epic'});
    const html=h.nodes.get('overlay').innerHTML;
     assertDifficultySelector(html,kind==='daily'?'quest':'mission');
    assert.deepEqual(h.snapshot(),before);
   }
   }
});
for(const id of ['alv','hlv','tlv'])test(`${id}: reactive input and legacy action rerender selection without discarding draft`,async()=>{
  const h=await profileUI(),daily=id==='hlv';h.click('sheet',{k:'add',v:daily?'daily':'once'});
  for(const fn of h.events.input||[])fn({target:{id:'ad-name',value:'반응형 초안'}});
  for(const fn of h.events.input||[])fn({target:{id,value:'epic'}});
  assert.match(h.nodes.get('overlay').innerHTML,/data-v="epic" aria-pressed="true"/);
  assert.match(h.nodes.get('overlay').innerHTML,/value="반응형 초안"/);
  h.click(id,{v:'tiny'});
  assert.match(h.nodes.get('overlay').innerHTML,/data-v="tiny" aria-pressed="true"/);
});
test('completion UI uses approved amounts, confirmation protects undo, manual goal completion is possible',async()=>{
  const h=await linkedUI();h.route('today');h.click('mcheck',{id:'tm'});await h.settle();
  assert.match(h.nodes.get('toast').innerHTML,/30 XP · 60 코인/);
  const before=h.snapshot();h.click('mcheck',{id:'tm'});await h.settle();assert.deepEqual(h.snapshot(),before,'undo waits for the in-app confirmation');
  assert.match(h.nodes.get('overlay').innerHTML,/완료를 취소할까요\?/);h.click('cfno');await h.settle();assert.deepEqual(h.snapshot(),before,'cancel keeps completion');
  h.click('mcheck',{id:'tm'});h.click('cfok');await h.settle();assert.equal(h.snapshot().mine.tm.done,false);
  assert.match(h.nodes.get('toast').innerHTML,/-30 XP · -60 코인/);
  h.click('project',{p:'main'});assert.doesNotMatch(h.nodes.get('app').innerHTML,/활동일·주간 횟수 제한 없음|지금 완료 시|같은 목표는 평생 한 번만 지급/);assert.match(h.nodes.get('app').innerHTML,/최대 200 XP · 100 코인/);
  h.click('pdone',{p:'main'});h.click('pdone',{p:'main'});await h.settle();
  assert.equal(h.snapshot().projects.main.status,'done');
  const claim=h.snapshot().economy.claims[JSON.stringify(['goal','main'])];assert.equal(claim.xp,200);assert.equal(claim.coins,100);
});
for(const xp of [106919,106920,106920+1000000])test(`level UI stays finite at XP ${xp} on dashboard and profile`,async()=>{
  const base=await profileUI(),saved=base.snapshot();saved.economy.events[0].xp=xp;saved.profiles.me.stats={...saved.profiles.me.stats,xp};
  const h=await profileUI(saved);
  for(const route of ['dash','me']){
    h.route(route);
    const html=h.nodes.get('app').innerHTML;assert.doesNotMatch(html,/NaN|Infinity|0 \/ 0 XP|다음 레벨까지 0 XP/);
    assert.match(html,/aria-valuemax="100"/);
    if(xp>=106920){assert.match(html,/MAX/);assert.match(html,/width:100%/);assert.doesNotMatch(html,/다음 레벨까지/);}
    else assert.match(html,/Lv\.99/);
  }
});
test('existing rest days and old ticket ledger survive browsing/reload and still block activity payout',async()=>{
  const base=await linkedUI(),saved=base.snapshot();
  const date=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  saved.mine.rest={id:'rest',kind:'rest',days:{'2026-01-01':1,[date]:123,'2099-12-31':456}};
  saved.mine.oldTicket={id:'oldTicket',kind:'buy',rewardId:'rest',name:'기존 기록',cost:300};
  saved.economy.purchases.oldTicket={id:'oldTicket',name:'기존 기록',legacy:true,kind:'rest',cost:300,state:'owned',at:1};
  const h=await profileUI(saved),initial=h.snapshot();
  for(const route of ['today','dash','me','shop']){
    h.route(route);if(route==='today')assert.match(h.nodes.get('app').innerHTML,/오늘은 쉬는 날이에요/);
    if(route==='shop'){
      const html=h.nodes.get('app').innerHTML;
      assert.doesNotMatch(html,removedEconomyGuidance);assert.doesNotMatch(html,/data-v="history"/);
    }
    assert.deepEqual(h.snapshot(),initial,'browsing never resets rest or ledger');
  }
  const reloaded=await profileUI(h.snapshot());assert.deepEqual(reloaded.snapshot(),initial);
  const before=h.snapshot().economy.events.length;h.click('mcheck',{id:'tm'});await h.settle();
  assert.equal(h.snapshot().mine.tm.done,true);assert.equal(Object.values(h.snapshot().mine).filter(x=>x.kind==='buy').length,1,'only the existing ticket remains');
  const events=h.snapshot().economy.events.slice(before);assert.ok(events.every(r=>r.xp===0&&r.coins===0));
  assert.deepEqual(h.snapshot().mine.rest,initial.mine.rest);
  assert.deepEqual(h.snapshot().mine.oldTicket,initial.mine.oldTicket);
  assert.deepEqual(h.snapshot().economy.purchases,initial.economy.purchases);
});
test('shop items tab is empty after removal and rewards tab keeps add copy',async()=>{
  const h=await profileUI();h.route('shop');
  let html=h.nodes.get('app').innerHTML;
  assert.match(html,/아직 아이템이 없어요/);
  assert.doesNotMatch(html,/style-buy/);
  h.click('shop-tab',{v:'personal'});html=h.nodes.get('app').innerHTML;
  assert.match(html,/하고 싶은 거 \/ 갖고 싶은 거/);
  assert.doesNotMatch(html,/data-v="history"/);
});

// Small markup tree reader: validates actual built output ancestry, not a source substring only.
function layoutTree(html){
  const root={tag:'root',classes:[],children:[]},stack=[root];
  for(const m of html.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b([^>]*)>/gi)){
    const [,closing,rawTag,attrs]=m,tag=rawTag.toLowerCase();
    if(closing){const i=stack.map(n=>n.tag).lastIndexOf(tag);if(i>0)stack.length=i;continue;}
    const node={tag,classes:(attrs.match(/\bclass="([^"]*)"/)?.[1]||'').split(/\s+/),children:[]};
    stack.at(-1).children.push(node);
    if(!['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'].includes(tag)&&!attrs.endsWith('/'))stack.push(node);
  }
  return root;
}
for(const wide of [true,false])for(const mini of [false,true]){
  test(`dashboard has no economy wrapper and starts with profile/goals columns; wide=${wide} mini=${mini}`,async()=>{
    const h=await linkedUI();h.context.matchMedia=()=>({matches:wide,addEventListener(){}});
    // Use the persisted nav preference and reinitialize the actual bundle for this layout mode.
    const saved=h.snapshot(),prefs=JSON.stringify({navMini:mini});
    const next=harness(saved);next.context.matchMedia=()=>({matches:wide,addEventListener(){}});
    next.data.set('quest:foundation:empty:v2:preferences',prefs);
    const html=await readFile(root+'/dist/quest.html','utf8');
    vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],next.context);next.flush();next.route('dash');
    const tree=layoutTree(next.nodes.get('app').innerHTML);
    assert.equal(tree.children.length,1,'no economy summary sibling outside dashboard');
    const grid=tree.children[0];assert.ok(grid.classes.includes('wd-top'));
    assert.deepEqual(grid.children.map(n=>n.classes[0]),['wd-pcol','wd-goals','wd-bot'],'profile/goal/bottom grid order with no empty summary row');
    assert.ok(grid.children[0].children.length>0,'profile column remains populated');
    assert.ok(grid.children[1].children.length>0,'goals column remains populated');
    assert.doesNotMatch(next.nodes.get('app').innerHTML,removedEconomySummary);
    assert.doesNotMatch(html,/eco-strip|wd-economy/);
    assert.match(html,/body\{padding:0 40px 48px 284px\}/,'expanded sidebar content inset retained');
    assert.match(html,/body\.navmini\{padding-left:124px\}/,'collapsed sidebar content inset retained');
    assert.doesNotMatch(html,/\.nav,body,\.replybar\{transition:/,'body inset must not animate from onboarding/mobile padding beneath fixed sidebar');
    const before=next.snapshot();next.route('shop');assert.equal(layoutTree(next.nodes.get('app').innerHTML).children.some(n=>n.classes.includes('wd-top')),false);assert.deepEqual(next.snapshot(),before);
  });
}

test('repeat: run-rest 2 on 1 off drives calendar days and stores its rule',async()=>{
  const h = await profileUI(), tdy = new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  h.click('sheet',{k:'add',v:'daily'}); h.nodes.set('ad-name',{value:'하고쉬기'});
  h.click('rpt',{v:'runrest'}); h.click('tmset'); h.click('submit-add'); await h.settle();
  const q = Object.values(h.snapshot().mine).find(x => x.kind === 'quest');
  assert.deepEqual(q.repeat,{type:'runrest',on:2,off:1,anchor:tdy});
  assert.deepEqual(q.days,[]);
  h.route('cal'); h.click('cmode',{v:'day'});
  assert.match(h.nodes.get('app').innerHTML,/하고쉬기/);
  h.click('cstep',{v:'1'}); assert.match(h.nodes.get('app').innerHTML,/하고쉬기/);
  h.click('cstep',{v:'1'}); assert.doesNotMatch(h.nodes.get('app').innerHTML,/하고쉬기/);
});
test('repeat: legacy day list reads as weekly and new weekly keeps Monday-first label',async()=>{
  const h = await profileUI();
  h.click('sheet',{k:'add',v:'daily'}); h.nodes.set('ad-name',{value:'주중'});
  h.click('rpt',{v:'weekly'}); h.click('qday',{v:'1'}); h.click('qday',{v:'3'}); h.click('qday',{v:'5'});
  h.click('tmset'); h.click('submit-add'); await h.settle();
  const q = Object.values(h.snapshot().mine).find(x => x.kind === 'quest');
  assert.deepEqual(q.repeat,{type:'weekly',days:[1,3,5]});
  assert.deepEqual(q.days,[1,3,5]);
  assert.doesNotMatch(h.nodes.get('app').innerHTML,/🔥 \d+일 · 매주/);
});

test('repeat: monthly date opens a 1-31 popup and stores the exact day',async()=>{
  const h = await profileUI();
  h.click('sheet',{k:'add',v:'daily'}); h.nodes.set('ad-name',{value:'월말정산'});
  h.click('rpt',{v:'monthly'});
  assert.match(h.nodes.get('overlay').innerHTML,/data-act="rdayopen"/);
  assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/data-act="rday" /);
  h.click('rdayopen');
  const pop = h.nodes.get('overlay').innerHTML;
  assert.equal((pop.match(/data-act="rday"/g)||[]).length,31);
  h.click('rday',{v:'31'}); assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/rdaypop/);
  h.click('tmset'); h.click('submit-add'); await h.settle();
  const q = Object.values(h.snapshot().mine).find(x => x.kind === 'quest');
  assert.deepEqual(q.repeat,{type:'monthly',day:31});
});

test('rewards tab keeps per-reward purchase history with use and refund actions',async()=>{
  const base=await profileUI(),saved=base.snapshot();
  saved.mine.rw={id:'rw',kind:'reward',name:'영화 보기',cost:30,repeat:'once'};
  saved.economy.purchases={old:{id:'old',rewardId:'rw',name:'영화 보기',cost:30,state:'planned',at:Date.parse('2026-11-02T03:00:00Z')}};
  const h=await profileUI(saved),before=h.snapshot();
  h.route('shop');h.click('shop-tab',{v:'personal'});
  const html=h.nodes.get('app').innerHTML;
  assert.match(html,/영화 보기/);assert.match(html,/사용 예정/);
  assert.match(html,/data-act="purchase-use" data-id="old"/);
  assert.match(html,/data-act="purchase-cancel" data-id="old"/);
  assert.doesNotMatch(html,/data-v="history"/);
  h.route('shop');h.click('shop-tab',{v:'inventory'});
  assert.match(h.nodes.get('app').innerHTML,/구매·사용 기록/);
  assert.deepEqual(h.snapshot(),before);
});
test('month view: daily quests show past completions, today with a checkbox, and only the next occurrence once today is done',async()=>{
  const base = await profileUI(), saved = base.snapshot(), DAYMS = 86400000, kd = t => new Date(t+9*3600000).toISOString().slice(0,10);
  const T = kd(Date.now()), Y = kd(Date.now()-DAYMS), TM = kd(Date.now()+DAYMS), old = Date.now()-30*DAYMS;
  saved.mine.qa = {id:'qa',kind:'quest',name:'안 한 데일리',repeat:{type:'daily'},days:[],lv:'easy',active:true,done:{[Y]:Date.now()-DAYMS},createdAt:old};
  saved.mine.qb = {id:'qb',kind:'quest',name:'한 데일리',repeat:{type:'daily'},days:[],lv:'easy',active:true,done:{[T]:Date.now()},createdAt:old};
  const h = await profileUI(saved); h.route('cal'); h.click('cpick',{v:T.slice(0,8)+'01',m:'month'});
  const html = h.nodes.get('app').innerHTML, cells = id => [...html.matchAll(new RegExp(`data-act="hcheckd" data-id="${id}" data-d="([^"]+)"`,'g'))].map(m => m[1]);
  const inMonth = d => d.slice(0,7) === T.slice(0,7);
  assert.deepEqual(cells('qa'),[Y,T].filter(inMonth),'not done today: past record + today only');
  assert.deepEqual(cells('qb'),[T,TM].filter(inMonth),'done today: today + next occurrence');
  assert.match(html,new RegExp(`data-id="qa" data-d="${T}"  aria-pressed="false"`));
  if (inMonth(Y)) assert.match(html,new RegExp(`data-id="qa" data-d="${Y}" disabled aria-pressed="true"`));
  h.click('hcheckd',{id:'qa',d:T}); await h.settle();
  const after = h.nodes.get('app').innerHTML; assert.ok([...after.matchAll(/data-id="qa" data-d="([^"]+)"/g)].map(m => m[1]).includes(TM) || !inMonth(TM),'completing today adds the next one');
});
test('week view: daily quests follow the same today/next-occurrence rule as month',async()=>{
  const base = await profileUI(), saved = base.snapshot(), DAYMS = 86400000, kd = t => new Date(t+9*3600000).toISOString().slice(0,10);
  const T = kd(Date.now()), TM = kd(Date.now()+DAYMS), D2 = kd(Date.now()+2*DAYMS), old = Date.now()-30*DAYMS;
  saved.mine.qa = {id:'qa',kind:'quest',name:'안 한 데일리',repeat:{type:'daily'},days:[],lv:'easy',active:true,done:{},createdAt:old};
  saved.mine.qb = {id:'qb',kind:'quest',name:'한 데일리',repeat:{type:'daily'},days:[],lv:'easy',active:true,done:{[T]:Date.now()},createdAt:old};
  const h = await profileUI(saved); h.route('cal'); h.click('cmode',{v:'week'});
  const html = h.nodes.get('app').innerHTML, ds = id => [...html.matchAll(new RegExp(`data-act="hcheckd" data-id="${id}" data-d="([^"]+)"`,'g'))].map(m => m[1]);
  const wk = d => html.includes(`data-v="${d}"`);
  assert.deepEqual(ds('qa'),[T]); assert.deepEqual(ds('qb'),[T, TM].filter(wk)); assert.ok(!ds('qb').includes(D2));
});

test('daily quest undo uses the in-app confirm sheet (browser confirm is never called)',async()=>{
  const base=await profileUI(),saved=base.snapshot();saved.mine.qz={id:'qz',kind:'quest',name:'취소 테스트',repeat:{type:'daily'},days:[],lv:'easy',active:true,done:{},createdAt:1};
  const h=await profileUI(saved);h.route('today');h.context.confirm=()=>{throw new Error('native confirm used');};const q=saved.mine.qz;
  h.click('qcheck',{id:q.id});await h.settle();const k=Object.keys(h.snapshot().mine[q.id].done||{}).length;assert.ok(k>=1);
  h.click('qcheck',{id:q.id});await h.settle();assert.match(h.nodes.get('overlay').innerHTML,/data-act="cfok"/);
  h.click('cfok');await h.settle();assert.equal(Object.keys(h.snapshot().mine[q.id].done||{}).length,k-1);
});
test('main and sub quests can be created as planned (시작 전) and toggled to in progress',async()=>{
  const h=await profileUI();
  h.click('sheet',{k:'add',v:'big'});assert.match(h.nodes.get('overlay').innerHTML,/data-f="pstat" data-v="planned"/);
  h.nodes.set('ad-name',{value:'시작 전 메인'});h.click('dppick',{k:'end',v:'2099-12-31'});h.click('cset',{f:'pstat',v:'planned'});
  h.click('submit-add');await h.settle();
  const main=Object.values(h.snapshot().projects).find(p=>p.title==='시작 전 메인');assert.equal(main.status,'planned');
  h.route('dash');assert.doesNotMatch(h.nodes.get('app').innerHTML,/시작 전 메인/,'planned main quests stay off the dashboard');
  h.click('gmenu',{p:main.id});assert.match(h.nodes.get('overlay').innerHTML,/진행 시작하기/);
  h.click('pstat',{p:main.id});await h.settle();assert.equal(h.snapshot().projects[main.id].status,'active');h.route('dash');assert.match(h.nodes.get('app').innerHTML,/시작 전 메인/);
  h.click('gedit',{p:main.id});h.click('cset',{f:'pstat',v:'planned'});h.nodes.set('ge-title',{value:'시작 전 메인'});h.click('submit-gedit');await h.settle();
  assert.equal(h.snapshot().projects[main.id].status,'planned');
});
test('nav › 퀘스트: bulk status change, archive, task move and confirmed delete',async()=>{
  const base=await profileUI(),saved=base.snapshot(),T=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  saved.projects={m1:{id:'m1',owner:'me',title:'메인 하나',end:'2099-12-31',status:'active'},m2:{id:'m2',owner:'me',title:'메인 둘',end:'2099-12-31',status:'active'},s1:{id:'s1',owner:'me',parentId:'m1',title:'서브',end:'2099-12-31',status:'active'}};
  saved.mine.qa={id:'qa',kind:'quest',name:'관리 데일리',repeat:{type:'daily'},days:[],lv:'easy',active:true,done:{},createdAt:1};
  saved.mine.t1={id:'t1',kind:'mission',name:'관리 태스크',due:'2099-01-01',time:'10:00',projectId:'s1',lv:'normal',done:false,createdAt:1};
  const h=await profileUI(saved);assert.match(h.nodes.get('nav').innerHTML,/href="#qmanage"[^>]*>[\s\S]*?<span>퀘스트<\/span>/);
  h.route('qmanage');assert.match(h.nodes.get('topbar').innerHTML,/퀘스트/);assert.match(h.nodes.get('app').innerHTML,/메인 퀘스트 만들기/);h.click('pl-mode',{v:'tidy'});assert.match(h.nodes.get('app').innerHTML,/메인 하나/);
  h.click('qm-sel',{id:'m1'});h.click('qm-sel',{id:'m2'});assert.match(h.nodes.get('app').innerHTML,/<b>2<\/b>개 선택/);
  h.click('qm-do',{v:'planned'});await h.settle();assert.equal(h.snapshot().projects.m1.status,'planned');assert.equal(h.snapshot().projects.m2.status,'planned');
  h.click('qm-tab',{v:'daily'});h.click('qm-sel',{id:'qa'});h.click('qm-do',{v:'arch'});await h.settle();assert.equal(h.snapshot().mine.qa.active,false);
  h.click('qm-tab',{v:'task'});h.click('qm-sel',{id:'t1'});h.click('qm-do',{v:'today'});await h.settle();assert.equal(h.snapshot().mine.t1.due,T);
  h.click('qm-tab',{v:'goal'});h.click('qm-sel',{id:'m1'});h.click('qm-do',{v:'del'});assert.ok(h.snapshot().projects.m1,'delete waits for confirmation');
  h.click('cfok');await h.settle();const after=h.snapshot();assert.equal(after.projects.m1,undefined);assert.equal(after.projects.s1,undefined);assert.equal(after.mine.t1,undefined);assert.ok(after.projects.m2);
});
test('nav › 퀘스트: plan sheet creates main, sub, a timed first task and a daily; quest without next task is flagged',async()=>{
  const h=await profileUI(),T=new Date(Date.now()+9*3600000).toISOString().slice(0,10);h.route('qmanage');assert.match(h.nodes.get('app').innerHTML,/메인 퀘스트 만들기/);
  h.click('pl-new');assert.match(h.nodes.get('overlay').innerHTML,/메인 퀘스트 설계[\s\S]*data-act="dpopen" data-k="end"/);
  h.nodes.set('pw-name',{value:'마라톤'});h.click('pw-go',{v:'1'});assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/어떤 서브 퀘스트/,'deadline required');
  h.click('dppick',{k:'end',v:'2099-12-31'});h.click('pw-go',{v:'1'});assert.match(h.nodes.get('overlay').innerHTML,/어떤 서브 퀘스트/);
  h.nodes.set('pw-s0',{value:'기초 체력'});h.nodes.set('pw-s1',{value:''});h.click('pw-go',{v:'1'});
  assert.match(h.nodes.get('overlay').innerHTML,/data-act="tmset"/,'same time picker as the dashboard');
  h.nodes.set('pw-act',{value:'러닝화 사기'});h.click('pw-go',{v:'1'});assert.match(h.nodes.get('overlay').innerHTML,/첫 태스크는/,'time is required');
  h.click('cdue1',{v:T});h.click('pw-go',{v:'1'});assert.match(h.nodes.get('overlay').innerHTML,/데일리 퀘스트가 있나요/);
  h.nodes.set('pw-hab',{value:'매일 달리기'});h.click('tmset');h.click('pw-go',{v:'1'});await h.settle();
  const s=h.snapshot(),g=Object.values(s.projects).find(p=>p.title==='마라톤'),subs=Object.values(s.projects).filter(p=>p.parentId===g.id);
  assert.equal(g.status,'active');assert.equal(subs.length,1);assert.equal(subs[0].title,'기초 체력');
  const t=Object.values(s.mine).find(m=>m.name==='러닝화 사기');assert.equal(t.projectId,subs[0].id);assert.equal(t.due,T);assert.equal(t.time,'09:00');
  assert.ok(Object.values(s.mine).find(m=>m.kind==='quest'&&m.name==='매일 달리기'&&m.time==='09:00'));
  assert.match(h.nodes.get('app').innerHTML,/지금 할 태스크[\s\S]*러닝화 사기/);
  h.click('mcheck',{id:t.id});await h.settle();assert.match(h.nodes.get('app').innerHTML,/data-act="taskadd" data-p="[^"]+"[^>]*>[\s\S]*?다음 태스크 정하기/);
});
