// Minimal DOM harness, NOT a browser or a visual/layout test.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {root} from '../scripts/build.mjs';
import {TIERS, DAILY_DIFFICULTY, TASK_DIFFICULTY, LABELS, activityReward, balances} from '../src/economy.js';
function harness(snapshot, search = '', {trial = false} = {}) {
  const nodes = new Map(), events = {}, winEvents = {}, frames = [], alerts = [], data = new Map();
  if (snapshot) data.set('quest:foundation:empty:v2',JSON.stringify(snapshot));
  const node = id => ({id,innerHTML:'',textContent:'',dataset:{},style:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(){},querySelector:() => null,querySelectorAll:() => [],getBoundingClientRect:() => ({top:0,height:0})});
  for (const id of ['app','topbar','nav','drawer','overlay','toast','pill','replybar','fileIn','characterUploadIn','characterCameraIn','demo-label']) nodes.set(id,node(id));
  const body = node('body'); body.appendChild = () => {};
  const document = {body,activeElement:null,documentElement:{dataset:trial ? {edition:'trial'} : {},style:{setProperty(){}},removeAttribute(){},setAttribute(){}},
    querySelector:s => s.startsWith('#') ? nodes.get(s.slice(1)) || null : null,
    querySelectorAll:() => [], getElementById:id => nodes.get(id) || null,
    // 확인 팝업 '삭제' → 숨은 버튼을 만들어 원래 동작을 다시 누르는 흐름을 흉내 낸다
    createElement:() => { const el = {dataset:{}, hidden:false, remove(){}, click(){ const target = {closest:sel => sel === '[data-act]' ? el : null}; for (const fn of (events.click || [])) fn({target,preventDefault(){},stopPropagation(){}}); }}; return el; },
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
  assert.match(html,/#app\[data-v="feed"\],#app\[data-v="profile"\][^{]*\{[^}]*max-width:600px;margin:0 auto/);
  assert.doesNotMatch(html,/<input[^>]*id="character(Upload|Camera)In"|capture="user"/);
  assert.doesNotMatch(html,/cartoonFace|saturate\(1\.35\)|setTimeout\(r, 1800\)|원본 사진은 저장하지/);
});
test('legacy face media keeps old overlay without fullbody marker',async () => {
  const base = await profileUI(), snapshot = base.snapshot();
  snapshot.profiles.me.face = 'legacy-face'; snapshot.media['legacy-face'] = 'data:image/png;base64,aW1hZ2U=';
  const h = await profileUI(snapshot); h.route('me'); await h.settle();
  assert.match(h.nodes.get('app').innerHTML,/class="chibi"/);
  assert.doesNotMatch(h.nodes.get('app').innerHTML,/class="avatar-fullbody"/);
});
test('actual empty UI submit handler creates the local profile and opens the welcome guide',async () => {
  const h = harness();
  const html = await readFile(root+'/dist/quest.html','utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],h.context); h.flush();
  h.click('preview-login');
  h.nodes.set('nick',{value:'직접 만든 로컬 프로필'});
  const submit = name => { for (const fn of h.events.submit) fn({preventDefault(){},target:{dataset:{form:name}}}); };
  submit('profile'); await new Promise(resolve => setImmediate(resolve)); h.flush();
  let snap = JSON.parse(h.data.get('quest:foundation:empty:v2'));
  assert.equal(snap.profiles.me.nick,'직접 만든 로컬 프로필'); assert.equal(snap.profiles.me.private,false); assert.equal(h.context.location.hash,'#qmanage'); assert.match(h.nodes.get('overlay').innerHTML,/퀘스트에 오신 걸 환영합니다/); assert.match(h.nodes.get('overlay').innerHTML,/메인 퀘스트/); assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/브레인 덤프/); h.click('sheet',{k:'add',v:'big'}); assert.match(h.nodes.get('overlay').innerHTML,/id="ad-name"/);
  assert.deepEqual(h.alerts,[]);
});

async function profileUI(snapshot, search = '', opts = {}) {
  const h = harness(snapshot, search, opts);
  const html = await readFile(root+'/dist/quest.html','utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],h.context); h.flush();
  if (!snapshot) {
    h.click('preview-login');
    h.nodes.set('nick',{value:'마감일 회귀 테스트'});
    for (const fn of h.events.submit) fn({preventDefault(){},target:{dataset:{form:'profile'}}});
    await h.settle();
    if (h.nodes.get('overlay').innerHTML.includes('class="welc"')) h.click('sheet-close');
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
    assert.doesNotMatch(login,/개발 미리보기|실제 인증 미연결/);
    assert.equal(h.nodes.get('nav').innerHTML,''); assert.equal(h.nodes.get('topbar').innerHTML,'');
    const before = h.snapshot(); let calls = 0; h.context.fetch = () => {calls++; throw new Error('No auth/network allowed');};
    h.click(action);
    const creation = h.nodes.get('app').innerHTML;
    assert.match(creation,/<h1 class="hello">캐릭터 만들기<\/h1>/);
    assert.match(creation,/id="nick"/); assert.match(creation,/모험 시작하기/);
    assert.doesNotMatch(creation,/개발용 코드|character-consent|크레딧|서버 시작/);
    assert.match(creation,/data-act="faceupload">사진 업로드/);assert.doesNotMatch(creation,/data-act="faceshot"|사진 촬영/);assert.doesNotMatch(creation,/옷 색|data-act="swatch"/);
    assert.equal(calls,0); assert.deepEqual(h.snapshot(),before);
    h.nodes.set('nick',{value:'일반 모험가'});
    for (const fn of h.events.submit) fn({preventDefault(){},target:{dataset:{form:'profile'}}});
    await h.settle(); assert.equal(h.snapshot().profiles.me.color,'#3DBE8B');
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
test('photo-based character creation is removed for every devCharacter flag value',async () => {
  for (const flag of ['1','0','true','']) {
    const h = harness(undefined,'?screen=character&devCharacter='+flag), html = await readFile(root+'/dist/quest.html','utf8');
    vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],h.context); h.flush();
    const markup = h.nodes.get('app').innerHTML;
    assert.match(markup,/캐릭터 만들기/);
    assert.doesNotMatch(markup,/character-dev-code|character-consent|크레딧|data-act="faceshot"/);
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
for (const route of ['add-big','gedit']) {
  for (const date of ['2099-12-31','2000-01-01']) {
    test(`main ${route}: missing deadline prevents save; selecting ${date} saves`,async () => {
      let h = await profileUI();
      if (route === 'gedit') {
        const snapshot = h.snapshot();
        snapshot.projects.legacy = {id:'legacy',owner:'me',title:'기존 목표',end:'',status:'active',createdAt:1};
        h = await profileUI(snapshot);
        h.click('gedit',{p:'legacy'});
      } else h.click('sheet',{k:'add',v:'big'});
      const field = route === 'gedit' ? 'ge-title' : 'ad-name';
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
for (const route of ['add']) {
  test(`daily ${route} UI creation still saves without a deadline`,async () => {
    const h = await profileUI();
    h.click('sheet',{k:route,v:'daily'});
    h.nodes.set('ad-name',{value:'매일 걷기'});
    assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/data-k="end"/);
    h.click('submit-add'); assert.equal(h.nodes.get('toast').innerHTML,'반복을 골라 주세요'); h.click('rpt',{v:'daily'}); h.click('tmset');
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
  assert.match(h.nodes.get('overlay').innerHTML,/class="rpic"[\s\S]*?<\/svg>선택/); h.click('rpt',{v:'daily'});
  assert.match(h.nodes.get('overlay').innerHTML,/<span class="hint">시간 필수<\/span>/);
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
  snapshot.projects.sub = {id:'sub',owner:'me',parentId:'main',title:'스테이지',end:'2099-11-30',status:'active'};
  h = await profileUI(snapshot);
  h.click('gedit',{p:'sub'});
  assert.match(h.nodes.get('overlay').innerHTML,/마감일 <span class="hint">선택<\/span>/);
  assert.match(h.nodes.get('overlay').innerHTML,/data-act="dpclear" data-k="end"/);
  h.click('dpclear',{k:'end'});
  h.nodes.set('ge-title',{value:'수정한 스테이지'});
  h.click('submit-gedit'); await h.settle();
  assert.equal(h.snapshot().projects.sub.end,'');
  assert.equal(h.snapshot().projects.sub.title,'수정한 스테이지');
});
test('task creation still requires its own date/time, not a main-goal deadline',async () => {
  const h = await profileUI();
  h.click('sheet',{k:'add',v:'once'});
  h.nodes.set('ad-name',{value:'미션'});
  h.click('submit-add'); await h.settle();
  assert.equal(h.nodes.get('toast').innerHTML,'시간을 골라 주세요','date starts on today; time is still required');
  assert.deepEqual(h.snapshot().mine,{});
  h.click('dppick',{k:'due',v:'2099-12-31'});
  h.click('submit-add'); await h.settle();
  const tasks = Object.values(h.snapshot().mine).filter(x => x.kind === 'mission');
  assert.equal(tasks.length,1); assert.equal(tasks[0].due,'2099-12-31');
  assert.equal(tasks[0].time,'09:00'); assert.equal(tasks[0].end,undefined);
});
test('legacy main goal without deadline still accepts task progress and stats updates',async () => {
  let h = await profileUI(); const snapshot = h.snapshot();
  snapshot.projects.legacy = {id:'legacy',owner:'me',title:'기존 목표',end:'',status:'active',progress:{done:0,total:1}};
  snapshot.mine.task = {id:'task',kind:'mission',name:'연결된 미션',projectId:'legacy',lv:'normal',done:false};
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
  snapshot.projects.sub = {id:'sub',owner:'me',parentId:'main',title:'스테이지 연결 대상',status:'active'};
  for (const [id,projectId] of [['tm','main'],['ts','sub'],['plain',null],['dangling','missing']]) {
    snapshot.mine[id] = {id,kind:'mission',name:`미션 ${id}`,projectId,lv:'normal',today:true,due:date,done:false,createdAt:1,time:id === 'tm' ? '09:00' : id === 'ts' ? '00:05' : ''};
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
    const titles = {once:'미션 추가',sub:'스테이지 생성',big:'메인 퀘스트 생성',daily:'일일 퀘스트 생성'};
    assert.ok(html.includes(titles[kind]));
    if (kind === 'once') {
      assert.match(html,/data-act="tqpick"/);
      h.click('tqpick'); assert.match(h.nodes.get('overlay').innerHTML,/data-act="tqsub" data-v="main"/); assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/data-act="tqset" data-v="sub"/,'stages stay hidden until the main quest is tapped');
      h.click('tqsub',{v:'main'}); assert.match(h.nodes.get('overlay').innerHTML,/data-act="tqsub" data-v=""[\s\S]*data-act="tqset" data-v="main"[\s\S]*data-act="tqset" data-v="sub"/); h.click('tqsub',{v:''}); assert.match(h.nodes.get('overlay').innerHTML,/data-act="tqsub" data-v="main"/); h.click('tqsub',{v:'main'});
      h.click('tqset',{v:'sub'}); assert.match(h.nodes.get('overlay').innerHTML,/스테이지 연결 대상/);
    } else if (kind === 'sub') {
      assert.match(html,/data-act="ppick"/);
      h.click('ppick'); assert.match(h.nodes.get('overlay').innerHTML,/data-act="ppset" data-v="main"/);
      h.click('ppset',{v:'main'}); assert.match(h.nodes.get('overlay').innerHTML,/스테이지 생성/);
    } else if (kind === 'big') deadlineRequired(h);
    else { assert.match(html,/data-act="rptopen"/); assert.doesNotMatch(html,/data-act="rpt"/); h.click("rptopen"); assert.match(h.nodes.get("overlay").innerHTML,/반복 선택[\s\S]*data-act="rpt" data-v="weekly"/); h.click("rpt",{v:"weekly"}); assert.doesNotMatch(h.nodes.get("overlay").innerHTML,/반복 선택/); assert.match(h.nodes.get("overlay").innerHTML,/data-act="qday"/); }
  });
}
for (const projectId of [null,'main','sub']) {
  test(`taskadd ${projectId}: no kind switch; linked selector works and persists exact task type`,async () => {
    const h = await linkedUI(); h.click('taskadd',projectId ? {p:projectId} : {});
    noKindSwitch(h.nodes.get('overlay').innerHTML);
    assert.match(h.nodes.get('overlay').innerHTML,/data-act="tqpick"/);
    h.nodes.set('ta-name',{value:'선택기로 연결한 미션'});
    h.click('tqpick'); h.click('tqsub',{v:'main'}); h.click('tqset',{v:'sub'});
    assert.match(h.nodes.get('overlay').innerHTML,/스테이지 연결 대상/);
    h.click('dppick',{k:'due',v:'2099-12-31'}); h.click('submit-taskadd'); await h.settle();
    const task = Object.values(h.snapshot().mine).find(m => m.name === '선택기로 연결한 미션');
    assert.ok(task); assert.equal(task.kind,'mission'); assert.equal(task.projectId,'sub');
  });
}
test('taskadd sheet orders date/time, area, quest, difficulty and saves task area',async () => {
  const h = await linkedUI(); h.click('taskadd',{});
  const html = h.nodes.get('overlay').innerHTML;
  const at = [html.indexOf('날짜'), html.indexOf('data-act="aset"'), html.indexOf('data-act="tqpick"'), html.indexOf('난이도')];
  assert.ok(at.every(i => i >= 0), String(at)); assert.deepEqual([...at].sort((a,b)=>a-b), at);
  h.nodes.set('ta-name',{value:'영역 미션'}); h.click('aset',{v:'health'});
  h.click('dppick',{k:'due',v:'2099-12-31'}); h.click('submit-taskadd'); await h.settle();
  const task = Object.values(h.snapshot().mine).find(m => m.name === '영역 미션');
  assert.ok(task); assert.deepEqual(task.area,['health']);
});
test('brain dump: lives on the plus page (not qmanage), pour lines in, list + sort, send one to task, delete one',async () => {
  const h = await linkedUI(); h.route('qmanage');
  assert.doesNotMatch(h.nodes.get('app').innerHTML,/id="bd-in"|브레인 덤프/);
  h.route('write'); h.click('wrmode',{v:'dump'});
  h.nodes.set('bd-in',{value:'세탁소 들르기\n\n이상한 생각'}); h.click('bd-add'); await h.settle();
  const dumps = () => Object.values(h.snapshot().mine).filter(m => m.kind === 'dump');
  assert.equal(dumps().length,2);
  const first = dumps().find(d => d.text === '세탁소 들르기'); h.click('bd-sort',{id:first.id});
  assert.match(h.nodes.get('overlay').innerHTML,/실행해야 하는 일인가요\?/); assert.match(h.nodes.get('overlay').innerHTML,/data-act="bd-step" data-id="[^"]+" data-v="9">아니요/); assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/예\) /);
  assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/bdback/);
  h.click('bd-step',{id:first.id,v:'9'}); assert.match(h.nodes.get('overlay').innerHTML,/class="bdqn bdback num" data-act="bd-step" data-id="[^"]+" data-v="0"/);
  h.click('bd-step',{id:first.id,v:'0'}); assert.match(h.nodes.get('overlay').innerHTML,/실행해야 하는 일인가요\?/);
  h.click('bd-step',{id:first.id,v:'9'}); assert.match(h.nodes.get('overlay').innerHTML,/저장할 자료인가요\?/); assert.match(h.nodes.get('overlay').innerHTML,/data-v="note">예.*data-v="drop">아니요/s);
  h.click('bd-step',{id:first.id,v:'1'}); assert.match(h.nodes.get('overlay').innerHTML,/몇 주 이상 걸리는 목표인가요\?/);
  h.click('bd-step',{id:first.id,v:'3'}); assert.match(h.nodes.get('overlay').innerHTML,/꾸준히 반복해야 하나요\?/); assert.match(h.nodes.get('overlay').innerHTML,/class="bdqn bdback num"[^>]*data-v="2"/); assert.match(h.nodes.get('overlay').innerHTML,/data-v="drop">아니요/);
  h.click('bd-step',{id:first.id,v:'2'}); h.click('bd-ask',{id:first.id,v:'task'}); assert.match(h.nodes.get('overlay').innerHTML,/미션으로 분류할게요/);
  h.click('cfok'); assert.match(h.nodes.get('overlay').innerHTML,/미션 추가/); h.click('sheet-close');
  assert.match(h.nodes.get('app').innerHTML,/class="bdlist".*세탁소 들르기.*data-act="bd-sort"/s); assert.doesNotMatch(h.nodes.get('app').innerHTML,/bdgoq/);
  const wash = dumps().find(d => d.text === '세탁소 들르기'); h.click('bd-send',{id:wash.id,v:'task'});
  assert.match(h.nodes.get('overlay').innerHTML,/value="세탁소 들르기"/);
  h.nodes.set('ta-name',{value:'세탁소 들르기'}); h.click('dppick',{k:'due',v:'2099-12-31'}); h.click('submit-taskadd'); await h.settle();
  assert.ok(Object.values(h.snapshot().mine).some(m => m.kind === 'mission' && m.name === '세탁소 들르기'));
  assert.deepEqual(dumps().map(d => d.text),['이상한 생각']);
  // 자료로 분류하면 시트 없이 메모로 담겨 자료실 '정리 전'에 보인다
  const odd0 = dumps()[0]; h.click('bd-send',{id:odd0.id,v:'note'}); await h.settle(); assert.equal(dumps().length,0);
  const memo = Object.values(h.snapshot().mine).find(m => m.kind === 'note' && m.cat === 'memo' && m.f?.title === '이상한 생각' && !m.f?.body); assert.ok(memo);
  h.route('notes'); assert.match(h.nodes.get('app').innerHTML,/분류<\/h2>[\s\S]*이상한 생각/); assert.ok(memo.unsorted);
  h.route('write'); h.click('wrmode',{v:'dump'}); h.nodes.set('bd-in',{value:'이상한 생각'}); h.click('bd-add'); await h.settle();
  // 모든 삭제는 확인 팝업: 누르면 팝업만 뜨고, 팝업에서 삭제를 눌러야 지워진다
  const odd = dumps()[0]; h.click('bd-del',{id:odd.id}); assert.equal(dumps().length,1); assert.match(h.nodes.get('overlay').innerHTML,/이 생각을 삭제할까요\?/); h.click('cfok'); await h.settle();
  assert.equal(dumps().length,0);
});
test('자료실: 4 base drawers, learn note completion grants XP/coins/stat once, task link, custom drawer, legacy mapping',async () => {
  const h = await linkedUI(); h.route('notes'); const app = () => h.nodes.get('app').innerHTML, ov = () => h.nodes.get('overlay').innerHTML;
  assert.match(h.nodes.get('nav').innerHTML,/href="#notes"/);
  for (const k of ['아이디어','참고자료','학습','메모','+ 서랍']) assert.ok(app().includes(k),k);
  const notes = () => Object.values(h.snapshot().mine).filter(m => m.kind === 'note'), xp = () => balances(h.snapshot()).xp;
  const x0 = xp();
  h.click('nt-new'); assert.match(ov(),/ntkind uns/); assert.match(ov(),/서랍 고르기/); h.click('nt-kind',{v:'idea'}); assert.doesNotMatch(ov(),/완성 조건|XP|코인/); assert.match(ov(),/class="nttitle"/);
  h.nodes.set('nf-title',{value:'레이드 퀘스트'}); h.nodes.set('nf-why',{value:'같이 하면 끝까지 간다'}); h.click('submit-note'); await h.settle();
  assert.equal(notes().length,1); assert.equal(xp(),x0,'incomplete note gives nothing');
  const n0 = notes()[0]; h.click('nt-edit',{id:n0.id}); h.nodes.set('nf-next',{value:'매일 아침 서비스 조사'}); h.click('submit-note'); await h.settle();
  assert.equal(xp(),x0,'writing the next action alone gives nothing');
  h.click('nt-edit',{id:n0.id}); assert.match(ov(),/data-act="nt-task" data-f="next">미션 추가/); h.click('nt-task',{f:'next'}); await h.settle();
  assert.match(ov(),/미션 추가/); assert.equal(xp(),x0,'opening mission add gives nothing');
  h.nodes.set('ta-name',{value:'매일 아침 서비스 조사'}); h.click('dppick',{k:'due',v:'2099-12-31'}); h.click('submit-taskadd'); await h.settle();
  assert.equal(xp(),x0+10,'adding the mission completes the idea (10 XP)'); assert.equal(notes()[0].f.next,'매일 아침 서비스 조사');
  h.click('nt-edit',{id:n0.id}); h.nodes.set('nf-why',{value:'수정'}); h.click('submit-note'); await h.settle();
  assert.equal(xp(),x0+10,'editing does not re-grant');
  assert.ok(Object.values(h.snapshot().mine).some(m => m.kind === 'mission' && m.noteId === n0.id)); assert.match(app(),/미션 진행 중/);
  h.click('nt-edit',{id:n0.id}); h.click('nt-del',{id:n0.id}); assert.match(h.nodes.get('overlay').innerHTML,/자료를 삭제할까요\?/); assert.equal(notes().length,1); h.click('cfok'); await h.settle();
  assert.equal(notes().length,0); assert.equal(xp(),x0,'deleting reverses the reward');
  // learning: detail screen with chapters (Cornell notes per chapter) and wrap-up
  h.click('nt-new'); h.click('nt-kind',{v:'learn'}); assert.match(ov(),/학습 목표/); assert.doesNotMatch(ov(),/data-act="nt-tpl"/); assert.doesNotMatch(ov(),/id="nf-url"/); h.click('nt-val',{f:'type',v:'강의'}); assert.match(ov(),/id="nf-url"/); h.click('nt-val',{f:'type',v:'책'}); assert.doesNotMatch(ov(),/id="nf-url"/); assert.doesNotMatch(ov(),/XP|코인/);
  h.nodes.set('nf-title',{value:'데이터 분석 입문'}); h.click('submit-note'); await h.settle();
  const L = notes()[0]; assert.equal(L.cat,'learn'); assert.doesNotMatch(app(),/id="nted"/,'learning opens like other drawers');
  h.click('nt-edit',{id:L.id}); assert.match(ov(),/class="nttitle"/); assert.match(ov(),/data-f="status"/); h.click('sheet-close'); await h.settle();
  h.click('ln-open',{id:L.id}); assert.match(app(),/id="nted"/); assert.doesNotMatch(app(),/목차/); assert.doesNotMatch(app(),/완성 조건/);
  h.click('ln-st',{v:'학습 중'}); await h.settle(); assert.equal(xp(),x0); assert.equal(h.snapshot().mine[L.id].f.status,'학습 중');
  h.click('ln-st',{v:'완료'}); await h.settle(); assert.equal(xp(),x0+30,'learning completion grants 30 XP');
  h.click('ln-st',{v:'학습 중'}); await h.settle(); assert.equal(xp(),x0,'un-completing takes the reward back');
  h.click('ln-st',{v:'완료'}); await h.settle(); assert.equal(xp(),x0+30,'completing again restores it once');
  h.click('ln-read'); assert.match(app(),/lnnote read/); assert.doesNotMatch(app(),/contenteditable/); h.click('ln-read');
  h.route('notes'); assert.match(app(),/lnstb ok">완료/);
  h.click('dr-manage'); h.click('dr-edit',{v:''}); h.nodes.set('dr-l',{value:'운동 기록'}); h.click('dr-icon',{v:'dumbbell'}); h.click('dr-area',{v:'health'}); h.click('dr-save'); await h.settle();
  const dr = h.snapshot().mine.drawers.list[0]; assert.equal(dr.l,'운동 기록'); assert.deepEqual(dr.fields,['title','body']); h.click('sheet-close');
  assert.equal(dr.ic,'dumbbell'); assert.match(app(),/<\/svg>운동 기록/);
});
// Inspect real rendered markup; this harness does not model browser layout.
function taskMarkup(html,id) {
  const start = html.indexOf(`data-act="tedit" data-id="${id}"`);
  assert.ok(start >= 0,`missing task row ${id}`);
  return html.slice(start,html.indexOf('</div>',start));
}
for (const page of ['today','today-main','dash','cal','main-detail','sub-detail']) {
   test(`${page}: ${page === 'cal' ? 'all rows omit date/time badges' : 'timed rows have one non-linking badge; untimed rows have none'}`,async () => {
    const h = await linkedUI();
    const show = () => {
      if (page.endsWith('-detail')) return h.click('project',{p:page.split('-')[0]});
      h.route(page.split('-')[0]);
      if (page.startsWith('me')) h.click('ptab',{t:'goals'});
      if (page.startsWith('today') || page.startsWith('me')) h.click('qtab',{t:page.endsWith('-main') ? 'main' : 'task'});
      if (page.endsWith('-main') && !h.nodes.get('app').innerHTML.includes('data-act="tedit" data-id="ts"')) h.click('mfold',{k:'main'});
    };
    const before = h.snapshot();
    for (const [id,label] of page === 'sub-detail' ? [['ts','24:05']] : [['tm','9:00'],['ts','24:05']]) {
      show(); const row = taskMarkup(h.nodes.get('app').innerHTML,id);
      assert.deepEqual(timeBadges(row),page === 'cal' ? [] : [label]);
      assert.equal(row.split(label).length-1,page === 'cal' ? 0 : 1,'no raw duplicate time');
      assert.doesNotMatch(row,/task-quest-tag|data-act="project"|메인|스테이지|연결 대상|title=/);
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
    assert.doesNotMatch(row,/<img|onerror="bad"|task-quest-tag|data-act="project"|>메인<|>스테이지</);
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
    daily:{id:'daily',kind:'quest',name:'완료 일일',days:[1],done:{[date]:at}},
    done:{id:'done',kind:'mission',name:'실제 완료 미션',done:true,doneAt:at,due:'2026-11-01',time:'09:00'},
    period:{id:'period',kind:'mission',name:'기간 완료 미션',period:'month',done:true,doneAt:at,due:'2026-11-01'},
    legacy:{id:'legacy',kind:'mission',name:'과거 완료 미션',done:true,due:date},
    planned:{id:'planned',kind:'mission',name:'예정 미션',done:false,due:'2099-11-02',time:'13:00'},
    foreign:{id:'foreign',kind:'diary',date,owner:'other',text:'다른 사용자 저널'}
  };
  saved.projects = {main:{id:'main',owner:'me',title:'완료 메인',status:'done',doneAt:at},sub:{id:'sub',owner:'me',parentId:'main',title:'완료 스테이지',status:'done',doneAt:at},unknown:{id:'unknown',owner:'me',title:'과거 목표',status:'done'},other:{id:'other',owner:'other',title:'다른 사용자 목표',status:'done',doneAt:at}};
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
  for (const text of ['첫 저널','두 번째 저널','공유 스토리','두 번째 스토리','완료 일일','실제 완료 미션','기간 완료 미션','완료 메인','완료 스테이지','<h3>완료 <span','날짜 미확인','과거 완료 미션','class="dsum"','완료한 미션','data-act="cdaystep" data-v="2026-11-01"']) assert.ok(sheet.includes(text),text);
  assert.doesNotMatch(sheet,/기록이 없어요|못 한 미션|예정 · 미션|기록·완료 · 한국 시간/,'empty sections hidden');
  h.click('cdaystep',{v:'2026-11-01'}); assert.match(h.nodes.get('app').innerHTML,/data-date="2026-11-01"/); h.click('cdaystep',{v:'2026-11-02'}); assert.equal(h.nodes.get('app').innerHTML,sheet,'step back restores same day');
  assert.match(sheet,/data-date="2026-11-02"/); assert.match(sheet,/&lt;img src=x&gt; &amp; 안전/);
  assert.doesNotMatch(sheet,/다른 사용자|<img src=x>|class="tday\b|id="pl-text"|data-act="psave"/);
  assertNoNestedButtons(sheet); assert.deepEqual(h.snapshot(),before);
  h.route('cal'); assert.equal(h.nodes.get('app').innerHTML,month,'back keeps month view');
  h.click('cstep',{v:'1'}); assert.match(h.nodes.get('app').innerHTML,/2026년 12월/);
  h.click('cstep',{v:'-1'}); assert.match(h.nodes.get('app').innerHTML,/2026년 11월/);
  h.click('cmode',{v:'week'}); assert.match(h.nodes.get('app').innerHTML,/class="wgrid"/);
  h.click('cmode',{v:'month'}); assert.match(h.nodes.get('app').innerHTML,/class="mgrid|data-act="cdate"/); assert.doesNotMatch(h.nodes.get('app').innerHTML,/지난 날짜는 기록 보기/);
});
test('day records page journal view never initializes editor; story and goals navigate; today/future open the day tab',async()=>{
  const h = await calendarActivityUI(), before = h.snapshot();
  h.click('cdate',{v:'2026-11-02'}); assert.equal(h.context.location.hash,'#calday'); h.click('journal-view',{id:'oddJournal'});
  assert.match(h.nodes.get('overlay').innerHTML,/data-act="dedit"/); assert.match(h.nodes.get('overlay').innerHTML,/첫 저널 &lt;img/);
  assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/textarea|data-act="psave"/); assert.deepEqual(h.snapshot(),before);
  h.click('cdate',{v:'2026-11-02'}); h.click('day-post',{p:'minePost'});
  assert.equal(h.context.location.hash,'#post'); assert.match(h.nodes.get('app').innerHTML,/공유 스토리/); assert.equal(h.nodes.get('overlay').innerHTML,'');
  h.route('cal'); h.click('cdate',{v:'2026-11-02'}); h.click('day-project',{p:'sub'});
  assert.equal(h.context.location.hash,'#goal'); assert.match(h.nodes.get('app').innerHTML,/완료 스테이지/);
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
  h.click('tedit',{id:'done'}); h.nodes.set('te-name',{value:'수정한 완료 미션'}); h.nodes.set('te-note',{value:'메모'});
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
  h.click('tedit',{id:'legacy'}); h.click('dppick',{k:'due',v:'2099-11-03'});
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
      assert.doesNotMatch(html,/미션 tm|미션 ts/);
      h.click('cpick',{v:h.snapshot().mine.tm.due.slice(0,7)+'-01',m:'month'});
      assert.deepEqual(timeBadges(h.nodes.get('app').innerHTML),[],'year drill-down month has no badges');
      h.click('cpick',{v:before.mine.tm.due,m:'day'});
      assert.deepEqual(timeBadges(h.nodes.get('app').innerHTML),[],'day details have no badges');
      assert.doesNotMatch(h.nodes.get('app').innerHTML,/<span class="tday\b/);
    } else {
      assert.deepEqual(badges,[]);
      assert.match(html,/미션 tm/);
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
    assert.match(h.nodes.get('overlay').innerHTML,/<span class="tmval" data-tk="time">9:00<\/span>/,'calendar editor retains scheduled time');
    assert.match(h.nodes.get('overlay').innerHTML,/data-act="dpopen" data-k="due"/,'calendar editor retains date control');
  });
}
for (const mode of ['day','week','month']) {
  test(`calendar ${mode}: completed and ghost rows omit time badges even with missing links`,async () => {
    let h = await linkedUI(); const snapshot = h.snapshot(), date = snapshot.mine.tm.due;
    const tomorrow = new Date(date+'T00:00:00'); tomorrow.setDate(tomorrow.getDate()+1);
    const next = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
    snapshot.mine.tm.time = '09:00';
    snapshot.mine.ts.done = true; snapshot.mine.ts.doneAt = Date.now();
    snapshot.mine.ghost = {id:'ghost',kind:'mission',name:'넘겨진 미션',projectId:'missing',lv:'normal',due:next,origDue:date,done:false,time:'13:15'};
    // Keep the month cell within its existing three-item display limit.
    delete snapshot.mine.plain; delete snapshot.mine.dangling;
    h = await profileUI(snapshot); h.route('cal'); h.click('cmode',{v:mode});
    const html = h.nodes.get('app').innerHTML; assertNoNestedButtons(html);
    assert.doesNotMatch(html,/<span class="tday\b/);
    const badges = timeBadges(html);
    assert.deepEqual(badges,[]);
    assert.match(html,/넘겨진 미션/); assert.match(html,/미션 ts/);
    assert.doesNotMatch(visibleText(html),/9:00|24:05|13:15/);
    if (mode !== 'month') assert.deepEqual(timeBadges(taskMarkup(html,'ghost')),[]);
    assert.doesNotMatch(html,/task-quest-tag|퀘스트 상세 보기/);
    for (const label of new Set(badges)) assert.equal(visibleText(html).split(label).length-1,badges.filter(b=>b===label).length,'one time per rendered occurrence');
    h.click('mcheck',{id:'tm'}); await h.settle(); assert.equal(h.snapshot().mine.tm.done,true);
  });
}
test('custom drafts and mission references show only supplied time and preserve titles/dates',async () => {
  const js = await readFile(root+'/src/legacy-app.js','utf8');
  const ctx = vm.createContext({S:{projects:{main:{title:'비공개 제목'},sub:{parentId:'main',title:'비공개 제목'}}},esc:String,isProj:p=>!!p?.parentId,metricFor:()=>'',
    today:()=> '2026-11-01',tomorrow:()=> '2026-11-02',tlv:()=>TASK_DIFFICULTY.normal,tmLabel:timeFormatter(js)});
  for (const [start,end] of [['function taskTimeTag(','function taskRow('],['function refHtml(','function metricFor(']]) {
    vm.runInContext(js.slice(js.indexOf(start),js.indexOf(end)),ctx);
  }
  ctx.I = {chev:''};
  for (const projectId of ['main','sub','missing']) {
    const html = ctx.refHtml({ref:{type:'mission',id:projectId,mission:'완료 미션'}});
    assert.deepEqual(timeBadges(html),[],'do not invent a task time from a project ID');
    assert.doesNotMatch(html,/비공개 제목/); assertNoNestedButtons(html);
    assert.match(html,/미션 완료 · 완료 미션/);
    assert.deepEqual(timeBadges(ctx.refHtml({ref:{type:'mission',id:projectId,mission:'완료 미션',time:'09:00'}})),['9:00']);
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
test('calendar detail rows suppress only date/time badges including ghosts',async () => {
  const js = await readFile(root+'/src/legacy-app.js','utf8');
  const task = {id:'period',name:'기간 미션',time:'09:00',period:'week',due:'2026-11-01',note:'메모'};
  const ghost = {...task,id:'ghost',name:'넘겨진 미션',_ghost:true};
  const ctx = vm.createContext({by:{'2026-11-01':[task,ghost]},mineOf:()=>[task,ghost],esc:String,lateDays:()=>3,
    dueLabel:()=> '<span class="tday soft">11월 1일</span>',xpFloat:()=>'',I:{check:''},tmLabel:timeFormatter(js)});
  vm.runInContext(js.slice(js.indexOf('function taskTimeTag('),js.indexOf('\nfunction ring(')),ctx);
  vm.runInContext(js.slice(js.indexOf('  const calTaskRow ='),js.indexOf('  const byTime ='))+
    '\nthis.details = () => by["2026-11-01"].map(calTaskRow).join("");',ctx);
  for (const per of ['week','month','year']) {
    task.period = ghost.period = per;
    for (const html of [ctx.details()]) {
    assert.deepEqual(timeBadges(html),[]);
    assert.doesNotMatch(html,/<span class="tday\b|11월 1일/);
    assert.match(html,/기간 미션/); assert.match(html,/📝 메모/); assert.match(html,/3일째 미룸/);
    assert.match(html,/넘겨진 미션/); assert.match(html,/오늘로 넘어갔어요/);
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
test('compose mission references never invent time or show quest tags',async () => {
  const js = await readFile(root+'/src/legacy-app.js','utf8');
  let post = {}, sheet = '';
  const ctx = vm.createContext({S:{projects:{},media:{},compose:null},esc:String,tmLabel:timeFormatter(js),
    sheetWrap:(_title,_extra,html)=>{sheet=html;},D:()=>'',MAX_IMGS:4,SOCIAL:{post:1},community:null});
  for (const [start,end] of [['function taskTimeTag(','function taskRow('],['function postSheet(','function replySheet(']]) {
    vm.runInContext(js.slice(js.indexOf(start),js.indexOf(end)),ctx);
  }
  for (const time of [undefined,'09:00']) {
    post = {id:'post',imgs:0,text:'본문',ref:{type:'mission',id:'main',mission:'미션 제목',time}};
    ctx.S.compose = {ref:post.ref,photos:[]}; ctx.postSheet('');
    assert.deepEqual(timeBadges(sheet),time ? ['9:00'] : []);
    assert.match(sheet,/미션 제목/);
    assert.doesNotMatch(sheet,/task-quest-tag|퀘스트 상세 보기/);
  }
});

const removedEconomyGuidance = /economy-help|price-help|restinfo|resttoday|restcancel|restdis|rest-date|보상·가격 안내|가격 정하기 도움말|무료 쉬는 날|무료 휴식 계획|오늘 휴식 취소|성취 일수|현금 환산|휴식권 포함|경제 적용 종료|연속 기록을 보존하지만 늘리지/;
const removedEconomySummary = /economyStrip|eco-strip|wd-economy|경제 요약|오늘 기본|일일 제한 없음|다음 레벨까지|이번 주 \d+\/5일|3일 \+60 XP·30 코인|5일 추가 \+40 XP·20 코인|자동 지급|찜:|코인 더 필요|<b>정산 조정|코인 · 다음 수입으로 상계/;
test('economy shop tabs and reward form omit guidance while price constraints still validate',async()=>{
  const h=await profileUI();h.route('shop');
  assert.doesNotMatch(h.nodes.get('app').innerHTML,/buyrest|휴식권 구매|data-act="shop-tab"|>내역</);assert.doesNotMatch(h.nodes.get('app').innerHTML,removedEconomyGuidance);
  h.click('sheet',{k:'reward'});let markup=h.nodes.get('overlay').innerHTML;
  assert.match(markup,/id="rw-cost"[^>]*placeholder="예: 300"[^>]*value=""/);assert.doesNotMatch(markup,/data-f="cost"|5 단위/,'no preset buttons, no 5-step rule');assert.doesNotMatch(markup,/rw-repeat|rw-daily|rw-weekly/);assert.doesNotMatch(markup,removedEconomyGuidance);
  const costField=markup.slice(markup.indexOf('<span class="lab">가격'),markup.indexOf('<span class="lab">가격')+500);
  assert.doesNotMatch(costField,/<p class="hint"/);
  h.nodes.set('rw-name',{value:'직접 정한 보상'});
  const before=h.snapshot();
  h.nodes.set('rw-cost',{value:''});h.click('submit-reward');await h.settle();assert.deepEqual(h.snapshot(),before);assert.match(h.nodes.get('toast').innerHTML,/가격을 입력해 주세요/);
  for(const value of ['0','-5','7.5','NaN']){
    h.nodes.set('rw-cost',{value});h.click('submit-reward');await h.settle();
    assert.deepEqual(h.snapshot(),before,`invalid price ${value} never writes`);
    assert.match(h.nodes.get('toast').innerHTML,/가격은 1 이상의 정수로/);
  }
  h.nodes.set('rw-cost',{value:'67'});h.click('submit-reward');await h.settle();
  const r=Object.values(h.snapshot().mine).find(x=>x.kind==='reward');assert.equal(r.cost,67,'non-multiple of 5 saves');
  h.route('shop');h.click('shop-tab',{v:'personal'});assert.doesNotMatch(h.nodes.get('app').innerHTML,/data-act="wishlist"|data-act="purchase-hide"|>찜<|기록 숨김/);
  h.click('redit',{id:r.id});markup=h.nodes.get('overlay').innerHTML;
  assert.doesNotMatch(markup,removedEconomyGuidance);assert.match(markup,/id="rw-cost"[^>]*value="67"/,'saved price shows in the input');
  h.nodes.set('rw-cost',{value:'1'});h.click('submit-reward');await h.settle();
  assert.equal(h.snapshot().mine[r.id].cost,1,'minimum valid price 1 saves');
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
    assert.doesNotMatch(markup,/XP|코인/,`no payout text for ${reward.xp}`);
    const text=visibleText(markup);
    assert.ok(text.includes(own[key].n));
    const name=markup.match(/<b>([^<]+)/)[1];
    for(const label of LABELS)assert.notEqual(name,label,`shared label: ${label}`);
  }
}
for(const [route,kind] of [['add-daily','quest'],['hedit','quest'],['add-once','mission'],['taskadd','mission'],['tedit','mission']]){
  test(`${route}: shared five labels/icons and correct kind-specific selected tier`,async()=>{
    let h=await linkedUI();const saved=h.snapshot();
    saved.mine.daily={id:'daily',kind:'quest',name:'기존 일일',lv:'epic',days:[1,2,3,4,5,6,0],done:{}};
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
test('existing daily records render current icons for five tiers and legacy aliases without writes',async()=>{
  const base=await linkedUI(),saved=base.snapshot();
  for(const key of [...TIERS,'gold'])saved.mine[`d-${key}`]={id:`d-${key}`,kind:'quest',name:`기존 ${key}`,lv:key,days:[0,1,2,3,4,5,6],done:{}};
  const h=await profileUI(saved),before=h.snapshot();h.route('daily');
  const html=h.nodes.get('app').innerHTML;
  for(const key of [...TIERS,'gold']){
    const meta=DAILY_DIFFICULTY[key==='gold'?'normal':key];
    assert.ok(html.includes(`data-id="d-${key}"`)&&html.includes(`${meta.e} ${meta.n}`),key);
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
      assert.doesNotMatch(html,/data-act="shop-tab"/);
    }else{
      assert.match(html,/Lv\d+/);assert.match(html,/role="progressbar" aria-label="레벨 진행도"/);
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
  ['add-daily','quest','hlv','ad-name'],['hedit','quest','hlv','he-name'],
  ['add-once','mission','lv','ad-name'],['taskadd','mission','lv','ta-name'],
  ['tedit','mission','lv','te-name']
])test(`${route}: every tier has no below-selector details, keeps button payouts and drafts, never issues rewards`,async()=>{
  let h=await linkedUI(),saved=h.snapshot();
  saved.mine.daily={id:'daily',kind:'quest',name:'일일',lv:'easy',days:[0,1,2,3,4,5,6],done:{}};
  h=await profileUI(saved);
  if(route.startsWith('add-'))h.click('sheet',{k:'add',v:route.slice(4)});
  else if(route==='hedit'||route==='tedit')h.click(route,{id:route==='hedit'?'daily':'tm'});
  else if(route==='taskadd')h.click(route);
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
for(const field of ['lv','hlv'])test(`${field}: difficulty chips rerender the selection without discarding the draft`,async()=>{
  const h=await profileUI(),daily=field==='hlv';h.click('sheet',{k:'add',v:daily?'daily':'once'});
  for(const fn of h.events.input||[])fn({target:{id:'ad-name',value:'반응형 초안'}});
  h.click('cset',{f:field,v:'epic'});
  assert.match(h.nodes.get('overlay').innerHTML,/data-v="epic" aria-pressed="true"/);
  assert.match(h.nodes.get('overlay').innerHTML,/value="반응형 초안"/);
  h.click('cset',{f:field,v:'tiny'});
  assert.match(h.nodes.get('overlay').innerHTML,/data-v="tiny" aria-pressed="true"/);
});
test('completion UI uses approved amounts, confirmation protects undo, manual goal completion is possible',async()=>{
  const h=await linkedUI();h.route('today');h.click('mcheck',{id:'tm'});await h.settle();
  assert.doesNotMatch(h.nodes.get('toast').innerHTML,/XP|코인/);assert.ok(h.snapshot().economy.claims[JSON.stringify(['task','tm'])]?.xp>0||Object.values(h.snapshot().economy.claims).some(c=>c.active&&c.xp>0),'reward still granted');
  const before=h.snapshot();h.click('mcheck',{id:'tm'});await h.settle();assert.deepEqual(h.snapshot(),before,'undo waits for the in-app confirmation');
  assert.match(h.nodes.get('overlay').innerHTML,/완료를 취소할까요\?[\s\S]*완료 보상이 함께 회수돼요/);assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/XP|코인/);h.click('cfno');await h.settle();assert.deepEqual(h.snapshot(),before,'cancel keeps completion');
  h.click('mcheck',{id:'tm'});h.click('cfok');await h.settle();assert.equal(h.snapshot().mine.tm.done,false);
  assert.doesNotMatch(h.nodes.get('toast').innerHTML,/XP|코인/);
  h.click('project',{p:'main'});assert.doesNotMatch(h.nodes.get('app').innerHTML,/활동일·주간 횟수 제한 없음|지금 완료 시|같은 목표는 평생 한 번만 지급/);assert.doesNotMatch(h.nodes.get('app').innerHTML,/XP|코인/);
  h.click('pdone',{p:'main'});await h.settle();assert.notEqual(h.snapshot().projects.main.status,'done','open stage/missions block 달성');
  h.click('mcheck',{id:'tm'});await h.settle();h.click('mcheck',{id:'ts'});await h.settle();h.click('pdone',{p:'sub'});h.click('pdone',{p:'sub'});await h.settle();h.click('sheet-close');
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
    else assert.match(html,/Lv99/);
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
test('shop: 경험 / 아이템 / 획득 내역 tabs (no style catalog); rewards split by type, legacy rewards count as 경험',async()=>{
  const snap=(await profileUI()).snapshot();
  snap.mine.rDo={id:'rDo',kind:'reward',name:'영화 보기',cost:100,repeat:'repeat',createdAt:1};
  snap.mine.rGet={id:'rGet',kind:'reward',name:'새 운동화',cost:500,repeat:'once',rt:'get',createdAt:2};
  const h=await profileUI(snap);h.route('shop');
  let html=h.nodes.get('app').innerHTML;
  assert.doesNotMatch(html,/style-buy/);
  assert.match(html,/data-act="shoptab" data-v="do" aria-pressed="true">경험[\s\S]*data-v="get"[^>]*>아이템[\s\S]*data-v="log"[^>]*>획득 내역/);
  assert.match(html,/영화 보기/);assert.doesNotMatch(html,/새 운동화/);assert.match(html,/data-k="reward" data-v="do"/);
  h.click('shoptab',{v:'get'});html=h.nodes.get('app').innerHTML;assert.match(html,/새 운동화/);assert.doesNotMatch(html,/영화 보기/);
  h.click('shoptab',{v:'log'});html=h.nodes.get('app').innerHTML;assert.match(html,/아직 획득한 보상이 없어요/);
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
    next.data.set('quest:foundation:empty:v2:preferences',prefs.replace('{','{"fgOff":1,'));
    const html=await readFile(root+'/dist/quest.html','utf8');
    vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],next.context);next.flush();next.route('dash');
    const tree=layoutTree(next.nodes.get('app').innerHTML);
    assert.equal(tree.children.length,1,'no economy summary sibling outside dashboard');
    const grid=tree.children[0];assert.ok(grid.classes.includes('wd-top'));
    assert.deepEqual(grid.children.map(n=>n.classes[0]),['wd-pcol','wd-goals','wd-chips','wd-bot'],'profile/goal/chips/bottom grid order with no empty summary row');
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

test('shop shows reward cards only (tap to edit); buying records the reward as used at once, no history tab',async()=>{
  const base=await profileUI(),saved=base.snapshot();
  saved.mine.rw={id:'rw',kind:'reward',name:'영화 보기',cost:30,repeat:'once'};
  saved.mine.tm={id:'tm',kind:'mission',name:'코인 벌기',lv:'epic',due:new Date(Date.now()+9*3600000).toISOString().slice(0,10),time:'09:00',done:false,createdAt:1};
  const h=await profileUI(saved);h.route('dash');h.click('mcheck',{id:'tm'});await h.settle();h.route('shop');
  const html=h.nodes.get('app').innerHTML;
  assert.match(html,/<div class="rcard" data-act="redit" data-id="rw" role="button"/);
  assert.doesNotMatch(html,/사용 예정|사용 완료|취소 완료|data-act="purchase-|>수정<|data-act="shop-tab"/);
  const gold=balances(h.snapshot()).gold;assert.ok(gold>=30,`earned ${gold} coins`);
  h.click('buy',{id:'rw'});assert.match(h.nodes.get('overlay').innerHTML,/되돌릴 수 없어요/);
  h.click('buyok');await h.settle();await h.settle();
  const ps=Object.values(h.snapshot().economy.purchases);assert.equal(ps.length,1);assert.equal(ps[0].state,'used');assert.equal(ps[0].rewardId,'rw');
  assert.equal(balances(h.snapshot()).gold,gold-30);
});
test('month view: daily quests show past completions, today with a checkbox, and only the next occurrence once today is done',async()=>{
  const base = await profileUI(), saved = base.snapshot(), DAYMS = 86400000, kd = t => new Date(t+9*3600000).toISOString().slice(0,10);
  const T = kd(Date.now()), Y = kd(Date.now()-DAYMS), TM = kd(Date.now()+DAYMS), old = Date.now()-30*DAYMS;
  saved.mine.qa = {id:'qa',kind:'quest',name:'안 한 일일',repeat:{type:'daily'},days:[],lv:'easy',active:true,done:{[Y]:Date.now()-DAYMS},createdAt:old};
  saved.mine.qb = {id:'qb',kind:'quest',name:'한 일일',repeat:{type:'daily'},days:[],lv:'easy',active:true,done:{[T]:Date.now()},createdAt:old};
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
  saved.mine.qa = {id:'qa',kind:'quest',name:'안 한 일일',repeat:{type:'daily'},days:[],lv:'easy',active:true,done:{},createdAt:old};
  saved.mine.qb = {id:'qb',kind:'quest',name:'한 일일',repeat:{type:'daily'},days:[],lv:'easy',active:true,done:{[T]:Date.now()},createdAt:old};
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
  saved.projects={m1:{id:'m1',owner:'me',title:'메인 하나',end:'2099-12-31',status:'active'},m2:{id:'m2',owner:'me',title:'메인 둘',end:'2099-12-31',status:'active'},s1:{id:'s1',owner:'me',parentId:'m1',title:'스테이지',end:'2099-12-31',status:'active'}};
  saved.mine.qa={id:'qa',kind:'quest',name:'관리 일일',repeat:{type:'daily'},days:[],lv:'easy',active:true,done:{},createdAt:1};
  saved.mine.t1={id:'t1',kind:'mission',name:'관리 미션',due:'2099-01-01',time:'10:00',projectId:'s1',lv:'normal',done:false,createdAt:1};
  const h=await profileUI(saved);assert.match(h.nodes.get('nav').innerHTML,/href="#qmanage"[^>]*>[\s\S]*?<span>퀘스트<\/span>/);
  h.route('qmanage');assert.match(h.nodes.get('topbar').innerHTML,/퀘스트/);assert.match(h.nodes.get('app').innerHTML,/<div class="seg pltabs"[\s\S]*class="subhead dqhead"><h2>진행 중 <span class="num">\d+<\/span><\/h2><button class="btn soft sm" data-act="sheet" data-k="add" data-v="big">\+ 생성<\/button><\/div>/);h.click('pl-mode',{v:'tidy'});assert.match(h.nodes.get('app').innerHTML,/메인 하나/);
  h.click('qm-sel',{id:'m1'});h.click('qm-sel',{id:'m2'});assert.match(h.nodes.get('app').innerHTML,/<b>2<\/b>개 선택/);
  h.click('qm-do',{v:'planned'});await h.settle();assert.equal(h.snapshot().projects.m1.status,'planned');assert.equal(h.snapshot().projects.m2.status,'planned');
  h.click('qm-tab',{v:'daily'});h.click('qm-sel',{id:'qa'});h.click('qm-do',{v:'arch'});await h.settle();assert.equal(h.snapshot().mine.qa.active,false);
  h.click('qm-tab',{v:'task'});h.click('qm-sel',{id:'t1'});h.click('qm-do',{v:'today'});await h.settle();assert.equal(h.snapshot().mine.t1.due,T);
  h.click('qm-tab',{v:'goal'});h.click('qm-sel',{id:'m1'});h.click('qm-do',{v:'del'});assert.ok(h.snapshot().projects.m1,'delete waits for confirmation');
  h.click('cfok');await h.settle();const after=h.snapshot();assert.equal(after.projects.m1,undefined);assert.equal(after.projects.s1,undefined);assert.equal(after.mine.t1,undefined);assert.ok(after.projects.m2);
});
test('stats: single life-area chip on main/daily feeds numeric area XP; sub tasks inherit; undo removes it',async()=>{
  const base=await profileUI(),saved=base.snapshot(),T=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  saved.projects={m1:{id:'m1',owner:'me',title:'마라톤',end:'2099-12-31',status:'active'},s1:{id:'s1',owner:'me',parentId:'m1',title:'기초',end:'2099-12-31',status:'active'}};
  saved.mine.t1={id:'t1',kind:'mission',name:'러닝화',due:T,time:'10:00',projectId:'s1',lv:'normal',done:false,createdAt:1};
  saved.mine.qa={id:'qa',kind:'quest',name:'독서',repeat:{type:'daily'},days:[0,1,2,3,4,5,6],lv:'easy',active:true,done:{},createdAt:1};
  const h=await profileUI(saved);
  h.click('gedit',{p:'m1'});assert.match(h.nodes.get('overlay').innerHTML,/data-act="aset" data-v="health"/);h.click('aset',{v:'health'});h.nodes.set('ge-title',{value:'마라톤'});h.click('submit-gedit');await h.settle();
  assert.deepEqual(h.snapshot().projects.m1.area,['health']);
  h.click('hedit',{id:'qa'});h.click('aset',{v:'growth'});h.click('aset',{v:'money'});h.click('aset',{v:'career'});h.nodes.set('he-name',{value:'독서'});h.click('submit-hedit');await h.settle();
  assert.deepEqual(h.snapshot().mine.qa.area,['growth','money'],'at most two areas');
  h.route('dash');assert.doesNotMatch(h.nodes.get('app').innerHTML,/class="statcard"/);assert.match(h.nodes.get('app').innerHTML,/data-act="statsheet"/);h.route('stats');assert.match(h.nodes.get('app').innerHTML,/능력치[\s\S]*체력<\/b><\/button><b class="stl num">0<\/b><\/div>/);
  // 능력치는 모아 두었다가 레벨 업 때 적용: Lv.1에서는 0 + 모은 능력치 +3
  h.click('mcheck',{id:'t1'});await h.settle();h.route('stats');assert.match(h.nodes.get('app').innerHTML,/체력<\/b><\/button><b class="stl num">0<\/b><\/div>/);assert.doesNotMatch(h.nodes.get('app').innerHTML,/모은 능력치|class="stp"/);
  // 레벨 업하면 적용된다(경험치를 넉넉히 더해 Lv.2로)
  const lv=h.snapshot();lv.economy.events.push({seq:lv.economy.events.length+1,at:Date.now()+1000,date:T,type:'issue',source:'bonus',xp:200,coins:0});lv.economy.claims.bonus={xp:200,coins:0,active:true,kind:'weekly',date:T,week:'x',daily:false,projects:[],nonactivity:true};
  const h2=await profileUI(lv);h2.route('stats');assert.match(h2.nodes.get('app').innerHTML,/체력<\/b><\/button><b class="stl num">3<\/b><\/div>/);assert.doesNotMatch(h2.nodes.get('app').innerHTML,/모은 능력치/);
  h.click('mcheck',{id:'t1'});h.click('cfok');await h.settle();h.route('stats');assert.match(h.nodes.get('app').innerHTML,/체력<\/b><\/button><b class="stl num">0<\/b><\/div>/);
});
test('daily quest made with 매일 can be switched to 하고 쉬기 / N일마다 without being asked for weekdays',async()=>{
  const base=await profileUI(),saved=base.snapshot();
  saved.mine.qa={id:'qa',kind:'quest',name:'물 마시기',repeat:{type:'daily'},days:[],lv:'easy',time:'09:00',active:true,done:{},createdAt:1};
  const h=await profileUI(saved);
  for(const [v,type] of [['runrest','runrest'],['every','every']]){
    h.click('hedit',{id:'qa'});h.click('rpt',{v});h.nodes.set('he-name',{value:'물 마시기'});h.click('submit-hedit');await h.settle();
    assert.equal(h.snapshot().mine.qa.repeat.type,type);assert.ok(!h.nodes.get('toast').innerHTML.includes('요일을 골라 주세요'));
  }
  h.click('hedit',{id:'qa'});h.click('rpt',{v:'weekly'});h.nodes.set('he-name',{value:'물 마시기'});h.click('submit-hedit');await h.settle();
  assert.equal(h.snapshot().mine.qa.repeat.type,'every','매주는 요일을 골라야 저장된다');assert.match(h.nodes.get('toast').innerHTML,/요일을 골라 주세요/);
});
test('level-up popup shows how much each stat rose (+N) from the points saved up during the level',async()=>{
  const base=await profileUI(),saved=base.snapshot(),T=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  saved.projects={m1:{id:'m1',owner:'me',title:'마라톤',end:'2099-12-31',status:'active',area:['health']}};
  for(const i of [1,2,3])saved.mine['t'+i]={id:'t'+i,kind:'mission',name:'달리기'+i,due:T,projectId:'m1',lv:'epic',done:false,createdAt:i};
  const h=await profileUI(saved);
  h.click('mcheck',{id:'t1'});await h.settle();assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/Lv2 달성/);
  h.click('mcheck',{id:'t2'});await h.settle();const html=h.nodes.get('overlay').innerHTML;
  assert.match(html,/Lv2 달성/);assert.match(html,/체력<\/b><\/button><b class="stl num">\d+<em class="stup">\+10<\/em><\/b>/);assert.doesNotMatch(html,/지력<\/b><\/button><b class="stl num">\d+<em/);
});
test('main quest page shows sub quests as cards with progress and next task',async()=>{
  const base=await profileUI(),saved=base.snapshot();
  saved.projects={m1:{id:'m1',owner:'me',title:'마라톤',end:'2099-12-31',status:'active'},s1:{id:'s1',owner:'me',parentId:'m1',title:'기초 체력',end:'2099-12-31',status:'active'},s2:{id:'s2',owner:'me',parentId:'m1',title:'10km',end:'2099-12-31',status:'planned'}};
  saved.mine.t1={id:'t1',kind:'mission',name:'러닝화 사기',due:'2099-01-01',time:'10:00',projectId:'s1',lv:'normal',done:false,createdAt:1};
  const h=await profileUI(saved);h.click('project',{p:'m1'});const html=h.nodes.get('app').innerHTML;
  assert.match(html,/class="card pgc[^"]*" data-act="project" data-p="s1"[\s\S]*?기초 체력/);
  assert.match(html,/data-p="s2"[\s\S]*?시작 전/);assert.match(html,/subadd/);assert.doesNotMatch(html,/<em>다음<\/em>/);
});
test('nav › 퀘스트: main quests only, chips 전체/진행/대기/달성 filter; stage progress on the card',async()=>{
  const base=await profileUI(),saved=base.snapshot();
  saved.projects={m1:{id:'m1',owner:'me',title:'메인 A',end:'2099-12-31',status:'active'},s1:{id:'s1',owner:'me',parentId:'m1',title:'스테이지 B',end:'2099-12-31',status:'active'},m2:{id:'m2',owner:'me',title:'대기 메인',end:'2099-12-31',status:'planned'},m3:{id:'m3',owner:'me',title:'달성 메인',status:'done',doneAt:5}};
  saved.mine.qa={id:'qa',kind:'quest',name:'일일 C',repeat:{type:'daily'},days:[0,1,2,3,4,5,6],lv:'easy',active:true,done:{},createdAt:1};
  const h=await profileUI(saved);h.route('qmanage');let html=h.nodes.get('app').innerHTML;
  assert.match(html,/data-v="all" aria-pressed="true">전체 <span class="num">3[\s\S]*data-v="active"[^>]*>진행 <span class="num">1[\s\S]*data-v="later"[^>]*>대기 <span class="num">1[\s\S]*data-v="done"[^>]*>달성 <span class="num">1/);
  assert.match(html,/진행 중 <span class="num">1<\/span><\/h2><button[^>]*data-v="big">\+ 생성[\s\S]*메인 A[\s\S]*대기 중 <span class="num">1[\s\S]*대기 메인[\s\S]*달성 <span class="num">1[\s\S]*달성 메인/);
  assert.doesNotMatch(html,/일일 C|data-v="sub"|data-v="daily"|class="pgsubs"/); assert.match(html, /<span>🔗 스테이지 0\/1<\/span><\/div>/); assert.doesNotMatch(html, /✅ 미션/);
  h.click('pl-tab',{v:'later'});html=h.nodes.get('app').innerHTML;assert.match(html,/대기 메인/);assert.doesNotMatch(html,/메인 A|달성 메인/);
  h.click('pl-tab',{v:'done'});html=h.nodes.get('app').innerHTML;assert.match(html,/달성 메인/);assert.doesNotMatch(html,/메인 A|대기 메인/);
  h.click('pl-tab',{v:'active'});html=h.nodes.get('app').innerHTML;assert.match(html,/data-v="big">\+ 생성[\s\S]*메인 A/);assert.doesNotMatch(html,/대기 메인|달성 메인|class="card subc subadd/);
  h.click('pl-tab',{v:'bogus'});assert.match(h.nodes.get('app').innerHTML,/data-v="all" aria-pressed="true"/);
  assert.doesNotMatch(h.nodes.get('app').innerHTML,/plgrid hsc/,'no horizontal scroller');
  const many=h.snapshot();for(let i=0;i<5;i++)many.projects['d'+i]={id:'d'+i,owner:'me',title:'달성 '+i,status:'done',doneAt:10+i};
  const k=await profileUI(many);k.route('qmanage');let a=k.nodes.get('app').innerHTML;
  assert.equal((a.match(/class="card pgc done"/g)||[]).length,3,'전체 shows 3 latest achieved');assert.match(a,/달성 4[\s\S]*달성 3[\s\S]*달성 2[\s\S]*data-act="pl-tab" data-v="done">달성 전체 보기 <span class="num">6/);
  k.click('pl-tab',{v:'done'});a=k.nodes.get('app').innerHTML;assert.equal((a.match(/class="card pgc done"/g)||[]).length,6);assert.doesNotMatch(a,/달성 전체 보기/);
});
test('대시보드 일일 › 관리: opens the 일일 퀘스트 page (cards + 보관), archived can be restored',async()=>{
  const base=await profileUI(),saved=base.snapshot();
  saved.mine.qz={id:'qz',kind:'quest',name:'쉬는 습관',repeat:{type:'daily'},days:[0,1,2,3,4,5,6],lv:'easy',active:false,done:{},createdAt:1};
  saved.mine.qo={id:'qo',kind:'quest',name:'안 하는 날',repeat:{type:'weekly',days:[]},days:[],lv:'easy',active:true,done:{},createdAt:2};
  saved.mine.qd={id:'qd',kind:'quest',name:'매일 습관',repeat:{type:'daily'},days:[0,1,2,3,4,5,6],lv:'easy',active:true,done:{},createdAt:3};
  const h=await profileUI(saved);h.route('dash');h.click('dpane',{v:'daily'});assert.match(h.nodes.get('app').innerHTML,/class="tadd-pill" data-act="hset" aria-label="일일 퀘스트 관리">[\s\S]*?퀘스트 관리 <em class="num">보관 1/);assert.doesNotMatch(h.nodes.get('app').innerHTML,/\+ 퀘스트 생성|class="archbtn"/);
  h.click('hset');assert.equal(h.context.location.hash,'#daily');h.route('daily');assert.match(h.nodes.get('topbar').innerHTML,/data-act="back"[\s\S]*일일 퀘스트/);
  let o=h.nodes.get('app').innerHTML;
  assert.match(o,/일일 퀘스트 <span class="num">2[\s\S]*data-k="add" data-v="daily">\+ 생성[\s\S]*class="plgrid qmgrid dqgrid"[\s\S]*class="card pgc dqc"[\s\S]*(안 하는 날|매일 습관)[\s\S]*보관 <span class="num">1[\s\S]*쉬는 습관[\s\S]*data-act="unarch" data-id="qz"/);
  h.click('unarch',{id:'qz'});await h.settle();assert.equal(h.snapshot().mine.qz.active,true);assert.doesNotMatch(h.nodes.get('app').innerHTML,/data-act="unarch"/);
});
test('퀘스트 › 메인 (today view): covers and sub/task toggles start folded and open on tap',async()=>{
  const h=await linkedUI();h.route('today');h.click('qtab',{t:'main'});let html=h.nodes.get('app').innerHTML;
  assert.match(html,/data-act="cvfold" data-p="main" aria-label="표지 펴기">/);assert.match(html,/data-act="mfold" data-k="main" aria-expanded="false"/);assert.match(html,/data-act="mfold" data-k="s:main" aria-expanded="false"/);
  h.click('mfold',{k:'main'});h.click('cvfold',{p:'main'});html=h.nodes.get('app').innerHTML;
  assert.match(html,/data-act="mfold" data-k="main" aria-expanded="true"/);assert.match(html,/aria-label="표지 접기"/);
});
test('sub quest create is one sheet everywhere, with 속성; sub area overrides the main area for its tasks',async()=>{
  const base=await profileUI(),saved=base.snapshot(),T=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  saved.projects={m1:{id:'m1',owner:'me',title:'마라톤',end:'2099-12-31',status:'active',area:['health']}};
  const h=await profileUI(saved);h.click('project',{p:'m1'});h.click('sheet',{k:'sub',p:'m1'});
  const ov=h.nodes.get('overlay').innerHTML;assert.match(ov,/스테이지 생성/);assert.match(ov,/data-act="aset" data-v="money"/);assert.doesNotMatch(ov,/최초 생성|data-act="ntopen"/);
  h.nodes.set('ad-name',{value:'장비 구입'});h.click('dppick',{k:'end',v:'2099-06-01'});h.click('aset',{v:'money'});h.click('submit-add');await h.settle();
  const sub=Object.values(h.snapshot().projects).find(p=>p.title==='장비 구입');assert.equal(sub.parentId,'m1');assert.deepEqual(sub.area,['money']);
});
test('main / sub quest page shows selected 속성 tags; sub without its own shows the inherited one',async()=>{
  const base=await profileUI(),saved=base.snapshot();
  saved.projects={m1:{id:'m1',owner:'me',title:'메인',end:'2099-12-31',status:'active',area:['health','growth']},s1:{id:'s1',owner:'me',parentId:'m1',title:'스테이지',end:'2099-12-31',status:'active'},s2:{id:'s2',owner:'me',parentId:'m1',title:'스테이지2',end:'2099-12-31',status:'active',area:['money']}};
  const h=await profileUI(saved);h.click('project',{p:'m1'});let html=h.nodes.get('app').innerHTML;
  assert.match(html,/class="tag atag "[^>]*>[\s\S]*?건강<\/span>[\s\S]*?자기계발<\/span>/);
  h.click('project',{p:'s1'});html=h.nodes.get('app').innerHTML;assert.match(html,/class="tag atag inh"[\s\S]*?건강/);
  h.click('project',{p:'s2'});html=h.nodes.get('app').innerHTML;assert.match(html,/class="tag atag "[\s\S]*?재정/);assert.doesNotMatch(html.slice(0,html.indexOf('rw')),/건강/);
});
test('uploaded profile photo renders as the profile picture, not a chibi face overlay',async()=>{
  const base=await profileUI(),saved=base.snapshot();saved.profiles.me={...saved.profiles.me,face:'data:image/png;base64,AAAA',avatarStyle:'photo'};
  const h=await profileUI(saved);h.route('dash');const html=h.nodes.get('app').innerHTML;
  assert.match(html,/class="avatar-photo"[^>]*><img src="data:image\/png;base64,AAAA" alt="프로필 사진"/);assert.doesNotMatch(html,/class="cface"/);
});
test('profile card opens the 능력치 page with level, XP, coins and stats; profile edit has no color picker',async()=>{
  const h=await profileUI();h.route('dash');h.click('sheet',{k:'profile'});assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/data-act="swatch"|옷 색/);h.click('sheet-close');
  h.route('stats');const html=h.nodes.get('app').innerHTML;assert.match(h.nodes.get('topbar').innerHTML,/프로필/);h.click('areainfo',{v:'health'});assert.match(h.nodes.get('overlay').innerHTML,/체력 · 건강[\s\S]*몸을 돌보는/);
  assert.match(html,/총 경험치[\s\S]*보유 코인[\s\S]*class="statcard"/);assert.doesNotMatch(html,/최장 연속/);
});
test('story pages (mine and others) show stories only (no 퀘스트/저널 chips); stale tab state cannot reopen them',async()=>{
  const h=await profileUI();h.route('me');let html=h.nodes.get('app').innerHTML;
  assert.doesNotMatch(html,/class="segwrap"|data-act="ptab"|data-t="diary"|id="pl-text"/);
  h.click('ptab',{t:'goals'});html=h.nodes.get('app').innerHTML;assert.doesNotMatch(html,/data-act="qtab"|data-act="ptab"/);
  h.click('ptab',{t:'diary'});assert.doesNotMatch(h.nodes.get('app').innerHTML,/id="pl-text"|data-act="pemo"/);
  const saved=h.snapshot();saved.profiles={...(saved.profiles||{}),other:{name:'다른 모험가',color:'#3DBE8B'}};saved.projects={...saved.projects,og:{id:'og',owner:'other',title:'남의 메인',status:'active'}};
  const o=await profileUI(saved);o.click('profile',{u:'other'});html=o.nodes.get('app').innerHTML;
  // 다른 사람 프로필도 스토리만: 퀘스트 칩 없음, 카드에 팔로우 버튼 없음
  assert.doesNotMatch(html,/data-act="ptab"|class="segwrap"/);
  o.click('ptab',{t:'goals'});assert.doesNotMatch(o.nodes.get('app').innerHTML,/남의 메인/);
});
test('overdue main/sub quests show a red "N일 지남" badge and no end-date tag',async()=>{
  const base=await profileUI(),saved=base.snapshot(),past=new Date(Date.now()+9*3600000-3*86400000).toISOString().slice(0,10);
  saved.projects={m1:{id:'m1',owner:'me',title:'늦은 메인',end:past,status:'active'},s1:{id:'s1',owner:'me',parentId:'m1',title:'늦은 스테이지',end:past,status:'active'}};
  const h=await profileUI(saved);for(const id of ['m1','s1']){h.click('project',{p:id});const html=h.nodes.get('app').innerHTML;
    assert.match(html,/<span class="tag dd"><span class="ddlate">3일 지남<\/span><\/span>/);assert.doesNotMatch(html,/까지<\/span>|D\+3/);}
});
test('settings shows an open-source license notice for Noto Sans KR (OFL)',async()=>{
  const h=await profileUI();h.route('settings');assert.match(h.nodes.get('app').innerHTML,/data-k="oss"[\s\S]*오픈소스 라이선스/);
  h.click('sheet',{k:'oss'});assert.match(h.nodes.get('overlay').innerHTML,/Noto Sans KR[\s\S]*SIL Open Font License, Version 1\.1/);
});
test('plan: place on tasks, place + after-habit on dailies, chained next-habit prompt',async()=>{
  const h = await profileUI();
  const mk = (name, extra) => { h.click('sheet',{k:'add',v:'daily'}); h.nodes.set('ad-name',{value:name}); h.click('rpt',{v:'daily'}); h.click('tmset'); extra && extra(); h.click('submit-add'); };
  mk('양치'); await h.settle();
  const a = Object.values(h.snapshot().mine).find(x => x.name === '양치');
  h.click('sheet',{k:'add',v:'daily'}); h.nodes.set('ad-name',{value:'영어 한 줄 읽기'});
  assert.match(h.nodes.get('overlay').innerHTML,/실행 계획/); assert.match(h.nodes.get('overlay').innerHTML,/data-act="ppopen" data-v="after"/);
  h.click('ppopen',{v:'after'}); assert.match(h.nodes.get('overlay').innerHTML,/id="pp-in"/); assert.match(h.nodes.get('overlay').innerHTML,/data-act="aftq" data-v="/);
  h.click('aftq',{v:a.id}); assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/id="pp-in"/); assert.match(h.nodes.get('overlay').innerHTML,/양치 후/);
  h.click('ppopen',{v:'place'}); h.nodes.set('pp-in',{value:'욕실'}); h.click('ppok'); assert.match(h.nodes.get('overlay').innerHTML,/욕실/);
  h.nodes.set('ad-name',{value:'영어 한 줄 읽기'});
  h.click('rpt',{v:'daily'}); h.click('tmset'); h.click('submit-add'); await h.settle();
  const b = Object.values(h.snapshot().mine).find(x => x.name === '영어 한 줄 읽기');
  assert.equal(b.place,'욕실'); assert.equal(b.afterId,a.id); assert.equal(b.after,'');
  h.route('daily'); assert.match(h.nodes.get('app').innerHTML,/양치 후/); assert.match(h.nodes.get('app').innerHTML,/욕실/); h.route('dash');
  h.click('qcheck',{id:a.id}); await h.settle();
  assert.match(h.nodes.get('toast').innerHTML,/다음 습관: <b>영어 한 줄 읽기<\/b>/);
  h.click('taskadd'); assert.match(h.nodes.get('overlay').innerHTML,/data-v="place"/); assert.doesNotMatch(h.nodes.get('overlay').innerHTML,/data-v="after"/);
  h.nodes.set('ta-name',{value:'스쿼트 5개'}); h.click('ppopen',{v:'place'}); h.nodes.set('pp-in',{value:'거실'}); h.click('ppok'); h.click('dppick',{k:'due',v:'2099-12-31'}); h.click('submit-taskadd'); await h.settle();
  const t = Object.values(h.snapshot().mine).find(x => x.name === '스쿼트 5개'); assert.equal(t.place,'거실');
});
test('level up opens the profile popup',async()=>{
  const h = await profileUI(); let hit = false;
  for (let i = 0; i < 30 && !hit; i++){
    h.click('sheet',{k:'add',v:'daily'}); h.nodes.set('ad-name',{value:'습관 '+i}); h.click('rpt',{v:'daily'}); h.click('tmset'); h.click('submit-add'); await h.settle();
    const q = Object.values(h.snapshot().mine).find(x => x.name === '습관 '+i);
    h.click('qcheck',{id:q.id}); await h.settle();
    hit = /class="lvup"/.test(h.nodes.get('overlay').innerHTML);
  }
  assert.ok(hit, 'level-up popup should open');
  const html = h.nodes.get('overlay').innerHTML;
  assert.match(html, /Lv\d+ 달성/); assert.match(html, /레벨이 올랐어요</); assert.match(html, /class="card stprof"/); assert.match(html, /능력치/); assert.doesNotMatch(html, /class="card wdp"|꾸미기|lvshop/);
  h.click('sheet-close'); await h.settle();
  assert.equal(h.nodes.get('overlay').innerHTML, '');
});
test('own story page avatar opens the stats screen',async()=>{
  const h = await profileUI(); h.route('me'); await h.settle();
  assert.match(h.nodes.get('app').innerHTML, /class="stage" data-act="statsheet"/);
  h.click('statsheet'); assert.equal(h.context.location.hash, '#stats');
});
test('자료실 저널 서랍: lists own journals only, escaped, opens detail',async()=>{
  const base = await profileUI(), saved = base.snapshot();
  saved.mine = {...saved.mine, 'd-2026-11-02':{id:'d-2026-11-02',kind:'diary',date:'2026-11-02',at:1,cond:80,emo:'평온',text:'스쿼트 <img src=x> 완료'}, foreign:{id:'foreign',kind:'diary',date:'2026-11-03',owner:'other',text:'다른 사용자 저널'}};
  const h = await profileUI(saved); h.route('notes'); await h.settle(); h.click('nt-cat',{v:'journal'}); await h.settle();
  const html = h.nodes.get('app').innerHTML;
  assert.match(html, /data-v="journal"/); assert.match(html, /class="card ntcard jcard" data-act="journal-view" data-id="d-2026-11-02"/);
  assert.match(html, /11월 2일 월요일/); assert.match(html, /컨디션 80% · 평온/); assert.doesNotMatch(html, /<img src=x>|다른 사용자 저널/);
  assert.match(html, /data-k="diary"/);
  h.click('journal-view',{id:'d-2026-11-02'}); assert.match(h.nodes.get('overlay').innerHTML, /스쿼트/);
});
test('저널: 지난 날짜로 쓰기 (보상 없음), 카드에서 수정',async()=>{
  const h = await profileUI(); h.route('notes'); await h.settle(); h.click('nt-cat',{v:'journal'}); await h.settle();
  assert.match(h.nodes.get('app').innerHTML, />\+ 저널 추가</);
  h.click('sheet',{k:'diary'}); const o = h.nodes.get('overlay').innerHTML;
  assert.match(o, /data-act="jdpick"[^>]*>.*오늘/); assert.doesNotMatch(o, /어제|깜빡한 날/);
  h.click('jdpick'); const cal = h.nodes.get('overlay').innerHTML; assert.match(cal, /data-act="dppick" data-k="jd"/); assert.doesNotMatch(o+cal, /type="date"/);
  const t0 = cal.match(/class="sel tdy" data-act="dppick" data-k="jd" data-v="([\d-]+)"/)[1], d0 = new Date(t0+'T00:00:00'); d0.setDate(d0.getDate()-1);
  const y = d0.getFullYear()+'-'+String(d0.getMonth()+1).padStart(2,'0')+'-'+String(d0.getDate()).padStart(2,'0');
  h.click('dppick',{k:'jd',v:y}); assert.doesNotMatch(h.nodes.get('overlay').innerHTML, /data-k="jd"/); assert.match(h.nodes.get('overlay').innerHTML, /보상 없이 기록만/); assert.match(h.nodes.get('overlay').innerHTML, new RegExp((d0.getMonth()+1)+'월 '+d0.getDate()+'일'));
  h.click('pemo',{v:'평온'}); h.nodes.set('pl-text',{value:'어제 쓴 저널'}); h.nodes.set('pl-cond',{value:'60'}); h.click('psave'); await h.settle();
  const d = h.snapshot().mine['d-'+y]; assert.ok(d); assert.equal(d.text,'어제 쓴 저널'); assert.equal(d.date,y);
  h.route('notes'); await h.settle(); h.click('nt-cat',{v:'journal'}); await h.settle();
  assert.match(h.nodes.get('app').innerHTML, new RegExp('data-act="dedit" data-id="d-'+y+'"'));
  h.click('dedit',{id:'d-'+y}); assert.match(h.nodes.get('overlay').innerHTML, /어제 쓴 저널/); assert.match(h.nodes.get('overlay').innerHTML, /data-act="psave"[^>]*>수정/);
});
test('first-game checklist (main and trial) tracks the six ebook steps and can be closed',async()=>{
  const T={trial:true},h=await profileUI(undefined,'',T);h.route('qmanage');let app=h.nodes.get('app').innerHTML;
  assert.match(app,/첫 게임 시작하기[\s\S]*0\/6/);assert.match(app,/data-act="sheet" data-k="add" data-v="big">만들기/);
  const s=h.snapshot();s.projects.g={id:'g',owner:'me',title:'목표',end:'2099-12-31',status:'active',createdAt:1};
  s.mine.m={id:'m',kind:'mission',name:'작은 일',due:'2099-01-01',time:'09:00',projectId:'g',done:false,createdAt:1};
  s.mine.r={id:'r',kind:'reward',name:'디저트',cost:100,createdAt:1};
  const h2=await profileUI(s,'',T);h2.route('dash');app=h2.nodes.get('app').innerHTML;
  assert.match(app,/첫 게임 시작하기[\s\S]*3\/6/);assert.match(app,/data-k="add" data-v="daily">만들기/);
  h2.click('fg-off');assert.doesNotMatch(h2.nodes.get('app').innerHTML,/첫 게임/);
  h2.route('qmanage');assert.doesNotMatch(h2.nodes.get('app').innerHTML,/첫 게임/);
});
test('trial: community notice, no report, no social notification settings, no developer wording',async()=>{
  const h=await profileUI(undefined,'',{trial:true});h.route('feed');assert.match(h.nodes.get('app').innerHTML,/커뮤니티는 정식 버전에서 열려요/);
  h.route('settings');const set=h.nodes.get('app').innerHTML;
  assert.doesNotMatch(set,/data-act="setn"|data-act="setpriv"|차단한 계정|로컬|서버|프로토타입/);assert.match(set,/체험판/);assert.match(set,/아직 백업한 적이 없어요/);
  h.route('feed');assert.doesNotMatch(h.nodes.get('topbar').innerHTML,/data-v="activity"/);
});
test('main edition: checklist yes, no trial notice or reminder; settings = 계정/화면/알림/개인정보 보호/데이터/정보',async()=>{
  const h=await profileUI();h.route('qmanage');assert.match(h.nodes.get('app').innerHTML,/첫 게임 시작하기[\s\S]*일일 퀘스트 하나 만들기/,'main edition also shows the checklist');
  h.route('feed');assert.doesNotMatch(h.nodes.get('app').innerHTML,/정식 버전에서 열려요/);
  h.route('settings');const set=h.nodes.get('app').innerHTML;
  assert.equal((set.match(/class="sect3">([^<]+)</g)||[]).map(x=>x.replace(/.*>/,'').replace(/<$/,'')).join(','),'계정,화면,알림,개인정보 보호,데이터,정보');
  assert.doesNotMatch(set,/로컬 비공개 표시|저장 위치|프로토타입|로컬 테스트 프로필|data-act="acct-|함께하기/,'no account rows without login');
  assert.match(set,/data-act="setn" data-k="like"[\s\S]*data-k="follow"[\s\S]*<b>계정 비공개<\/b>[\s\S]*data-act="setpriv"[\s\S]*차단한 계정[\s\S]*숨길 단어/);
  const p0=!!h.snapshot().profiles.me.private;h.click('setpriv');await h.settle();assert.equal(h.snapshot().profiles.me.private,!p0,'switch flips');assert.match(h.nodes.get('toast').innerHTML,p0?/공개로 바꿨어요/:/비공개로 바꿨어요/);
  assert.match(set,/화면 모드[\s\S]*data-act="theme"[\s\S]*data-act="navedit"/);assert.match(set,/앱 버전<\/b><small>1\.0</);assert.match(set,/기록 파일로 저장[\s\S]*파일에서 기록 불러오기[\s\S]*기록 전체 삭제/);
  h.route('feed');assert.match(h.nodes.get('topbar').innerHTML,/data-v="activity"/);
  const trialLogin=harness(undefined,'',{trial:true}),html=await readFile(root+'/dist/quest-tester.html','utf8');
  assert.match(html,/<html lang="ko" data-edition="trial"/);assert.match(html,/<title>퀘스트 테스트판<\/title>/);
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],trialLogin.context);trialLogin.flush();
  const login=trialLogin.nodes.get('app').innerHTML;assert.match(login,/>바로 시작하기</);assert.doesNotMatch(login,/카카오|개발 미리보기/);
});
test('mobile dashboard chips: 일퀘/미션/저널, mission by default, switching panes keeps data unchanged',async()=>{
  const h=await profileUI();h.route('dash');let html=h.nodes.get('app').innerHTML;const before=h.snapshot();
  assert.match(html,/class="wd-chips"><div class="seg" role="group"[\s\S]*data-v="daily"[^>]*>일퀘[\s\S]*data-v="mission" aria-pressed="true">미션[\s\S]*data-v="journal"[^>]*>저널/);
  assert.match(html,/class="wd-bot" data-pane="mission"/);assert.doesNotMatch(html,/wd-mprof|lvstrip|class="card pcard"/,'no profile card on mobile dashboard');assert.match(html,/wd-sec dp-daily[\s\S]*wd-sec dp-mission[\s\S]*wd-sec dp-journal/);
  h.click('dpane',{v:'journal'});html=h.nodes.get('app').innerHTML;assert.match(html,/data-pane="journal"/);assert.match(html,/data-v="journal" aria-pressed="true"/);
  h.click('dpane',{v:'bogus'});assert.match(h.nodes.get('app').innerHTML,/data-pane="journal"/);assert.deepEqual(h.snapshot(),before);
});
test('daily quests: time order with chained habits kept after their predecessor; 하고 쉬기 / N일마다 have a start date',async()=>{
  const base=await profileUI(),saved=base.snapshot(),q=(id,name,o={})=>({id,kind:'quest',name,repeat:{type:'daily'},days:[0,1,2,3,4,5,6],lv:'easy',active:true,done:{},...o});
  saved.mine={...saved.mine,a:q('a','저녁 운동',{time:'19:00',createdAt:1}),b:q('b','아침 물',{time:'07:00',createdAt:2}),c:q('c','시간 없음',{createdAt:3}),d:q('d','물 마신 뒤 스트레칭',{afterId:'b',createdAt:4})};
  const h=await profileUI(saved);h.route('daily');const html=h.nodes.get('app').innerHTML;
  const order=['아침 물','물 마신 뒤 스트레칭','저녁 운동','시간 없음'].map(n=>html.indexOf(n));assert.ok(order.every((x,i)=>x>0&&(i===0||x>order[i-1])),'07:00 → chained → 19:00 → no time: '+order);
  h.click('sheet',{k:'add',v:'daily'});
  for(const [v,re] of [['runrest',/2일 하기[\s\S]*1일 쉬기[\s\S]*시작일[\s\S]*data-act="dpopen" data-k="ranchor"[\s\S]*오늘부터 2일 하고 1일 쉬어요/],['every',/일마다[\s\S]*시작일[\s\S]*data-k="ranchor"[\s\S]*오늘부터 3일마다 해요 \(하루 하고 2일 쉬기\)/]]){
    h.click('rpt',{v});assert.match(h.nodes.get('overlay').innerHTML,re,v);
  }
  h.click('dpopen',{k:'ranchor'});const d=h.nodes.get('overlay').innerHTML.match(/data-act="dppick" data-k="ranchor" data-v="(\d{4}-\d\d-\d\d)"/g);assert.ok(d&&d.length>20,'calendar opens');
  const last=d[d.length-1].match(/data-v="([^"]+)"/)[1];h.click('dppick',{k:'ranchor',v:last});assert.match(h.nodes.get('overlay').innerHTML,new RegExp(`${+last.slice(5,7)}월 ${+last.slice(8,10)}일부터 3일마다 해요`));
});
test('release info: terms, privacy policy and contact in main edition only; sheets render every section',async()=>{
  const h=await profileUI();h.route('settings');const set=h.nodes.get('app').innerHTML;
  assert.match(set,/data-k="terms"[\s\S]*이용약관/);assert.match(set,/data-k="privacy"[\s\S]*개인정보처리방침/);assert.match(set,/href="mailto:wonwoonc10@gmail\.com"><span class="t"><b>문의하기<\/b><small>wonwoonc10@gmail\.com/);
  h.click('sheet',{k:'terms'});let o=h.nodes.get('overlay').innerHTML;assert.match(o,/제1조 목적[\s\S]*제6조 코인·경험치·보상[\s\S]*부칙/);assert.match(o,/만 14세 이상/);
  h.click('sheet-close');h.click('sheet',{k:'privacy'});o=h.nodes.get('overlay').innerHTML;assert.match(o,/1\. 처리 목적[\s\S]*5\. 처리 위탁과 국외 이전[\s\S]*10\. 개인정보 보호책임자[\s\S]*12\. 방침의 변경/);
  const t=await profileUI(undefined,'',{trial:true});t.route('settings');assert.doesNotMatch(t.nodes.get('app').innerHTML,/data-k="terms"|data-k="privacy"|문의하기/);
});
test('menu: bottom bar = dash/community/+write/shop/notes; profile moved to the top bar next to notifications; drawer + PC sidebar list everything plus settings; reorder and reset',async()=>{
  const h=await profileUI();h.route('shop');let nav=h.nodes.get('nav').innerHTML;
  const order=()=>[...h.nodes.get('nav').innerHTML.matchAll(/<a href="#(\w+)"(?: class="(nm|nset)")? aria-label="[^"]*"/g)].map(m=>m[1]+(m[2]?'*':''));
  assert.deepEqual(order(),['qmanage*','dash','feed','shop','notes','cal*','settings*'],'PC sidebar: 퀘스트 first; bottom bar: dash/feed/shop/notes');
  assert.doesNotMatch(nav,/navmore|더보기|href="#me"/);
  assert.match(nav,/href="#feed"[^>]*>[\s\S]*?<\/a><a href="#write" class="nwr" aria-label="스토리 쓰기"[^>]*>[\s\S]*?<\/a><a href="#shop"/,'+ sits in the middle');
  const top=h.nodes.get('topbar').innerHTML;assert.match(top,/class="iconbtn menubtn" data-act="drawer" aria-label="메뉴 열기"/);assert.match(top,/<h1 class="tmain">상점/);assert.doesNotMatch(top,/data-v="settings"/,'gear moved to the menu');
  assert.match(top,/<a class="iconbtn" href="#me" aria-label="프로필">/);
  const drw=h.nodes.get('drawer').innerHTML;
  assert.deepEqual([...drw.matchAll(/data-act="navgo" data-v="(\w+)"/g)].map(m=>m[1]),['qmanage','dash','feed','shop','notes','cal','settings']);
  assert.match(drw,/data-v="shop" aria-current="page"/);
  h.route('me');assert.match(h.nodes.get('topbar').innerHTML,/<h1 class="tmain">프로필/);assert.match(h.nodes.get('topbar').innerHTML,/aria-label="프로필" aria-current="page"/,'profile button stays on the profile page, marked current');assert.match(h.nodes.get('topbar').innerHTML,/aria-label="알림"/);
  h.route('settings');assert.match(h.nodes.get('topbar').innerHTML,/data-act="back"[\s\S]*<h1>설정/,'sub pages keep back + title');assert.doesNotMatch(h.nodes.get('topbar').innerHTML,/menubtn/);
  h.click('navedit');assert.match(h.nodes.get('overlay').innerHTML,/메뉴 순서[\s\S]*하단 메뉴[\s\S]*메뉴 버튼에만/);
  h.click('nav-mv',{v:'#qmanage',d:'-1'});
  assert.deepEqual(order(),['dash','feed','shop','qmanage','notes*','cal*','settings*'],'퀘스트 in the bottom bar keeps its place');
  const prefs=JSON.parse(h.data.get('quest:foundation:empty:v2:preferences'));assert.deepEqual(prefs.navOrder,['#dash','#feed','#shop','#qmanage','#notes','#cal']);
  h.click('nav-reset');assert.deepEqual(order(),['qmanage*','dash','feed','shop','notes','cal*','settings*']);
  h.click('sheet-close');h.click('navgo',{v:'shop'});assert.equal(h.context.location.hash,'#shop');assert.equal(h.nodes.get('overlay').innerHTML,'');
  // 예전에 '#me'가 들어간 순서를 저장했어도 메뉴에서 빠진다
  h.data.set('quest:foundation:empty:v2:preferences',JSON.stringify({navOrder:['#me','#notes','#dash']}));h.route('dash');assert.deepEqual(order().slice(0,4),['qmanage*','notes','dash','feed']);
});
test('write page (+) is the same story box as the profile (퀘스트 button lists main quests with their stages, 사진, 공유하기) and goes to the community after sharing',async()=>{
  const base=await profileUI(),saved=base.snapshot();
  saved.projects={g1:{id:'g1',owner:'me',title:'마라톤 완주',end:'2099-12-31',status:'active',createdAt:1},
    s1:{id:'s1',owner:'me',title:'10km 달리기',parentId:'g1',end:'2099-12-31',status:'active',createdAt:2,metric:{unit:'km',start:0,target:10}}};
  const h=await profileUI(saved);h.route('write');let html=h.nodes.get('app').innerHTML;
  assert.match(h.nodes.get('topbar').innerHTML,/data-act="back"[\s\S]*<h1>스토리 쓰기/);
  assert.match(html,/class="card scomp page"[\s\S]*id="ps-text" data-grow rows="4"[\s\S]*data-act="qpick">[\s\S]*퀘스트<\/button>[\s\S]*data-act="inphoto"[\s\S]*data-act="inpost"/);
  h.click('qpick');assert.match(h.nodes.get('overlay').innerHTML,/마라톤 완주[\s\S]*메인 퀘스트[\s\S]*10km 달리기[\s\S]*스테이지/);
  h.click('inref',{v:'s1'});await h.settle();assert.match(h.nodes.get('app').innerHTML,/id="ps-val"/,'metric stage asks today\'s number');
  h.nodes.set('ps-text',{value:'오늘 6km!'});h.nodes.set('ps-val',{value:'6'});h.click('inpost');await h.settle();
  const posts=Object.values(h.snapshot().feed).filter(p=>p.author==='me');assert.equal(posts.length,1);
  assert.deepEqual([posts[0].ref.type,posts[0].ref.id,posts[0].value,posts[0].text],['project','s1',6,'오늘 6km!']);assert.equal(h.context.location.hash,'#feed');
});
test('community has no write card at the top; profile has no story box (first-story button when empty); the write page has the tall box',async()=>{
  const h=await profileUI();h.route('feed');let html=h.nodes.get('app').innerHTML;
  assert.doesNotMatch(html,/class="card sentry"|오늘의 이야기를 들려주세요/);assert.doesNotMatch(html,/class="card scomp"/);
  h.route('me');html=h.nodes.get('app').innerHTML;assert.doesNotMatch(html,/class="card scomp"/);assert.match(html,/아직 스토리가 없어요<\/strong><a class="btn sm emptybtn" href="#write">첫 스토리 쓰기/);
  h.route('write');assert.match(h.nodes.get("app").innerHTML,/class="card scomp page"[\s\S]*id="ps-text" data-grow rows="4" class="tall"/);
});
test('backup reminder appears after three days of trial use without a backup, once per fourteen days',async()=>{
  const base=await profileUI(),s=base.snapshot();s.mine.m={id:'m',kind:'mission',name:'일',due:'2099-01-01',time:'09:00',done:false,createdAt:1};
  const open=async prefs=>{const h=harness(s,'',{trial:true});h.data.set('quest:foundation:empty:v2:preferences',JSON.stringify(prefs));
    const html=await readFile(root+'/dist/quest.html','utf8');vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],h.context);h.flush();return h;};
  const day=864e5,now=Date.now();
  assert.doesNotMatch((await open({firstSeen:now-day})).nodes.get('overlay').innerHTML,/백업/,'too early');
  const h=await open({firstSeen:now-4*day});assert.match(h.nodes.get('overlay').innerHTML,/기록을 백업해 두세요[\s\S]*data-act="bkexp"/);
  assert.ok(JSON.parse(h.data.get('quest:foundation:empty:v2:preferences')).bkNudgeAt>0);
  assert.doesNotMatch((await open({firstSeen:now-4*day,lastBackup:now-2*day})).nodes.get('overlay').innerHTML,/백업해 두세요/,'recent backup');
  assert.doesNotMatch((await open({firstSeen:now-30*day,bkNudgeAt:now-5*day})).nodes.get('overlay').innerHTML,/백업해 두세요/,'already reminded');
});
test('mission add: one date button that starts on today, no today/tomorrow chips; picking another day relabels it',async()=>{
  const h=await profileUI(),T=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  for(const open of [()=>h.click('taskadd'),()=>h.click('sheet',{k:'add',v:'once'})]){
    open();let ov=h.nodes.get('overlay').innerHTML;
    assert.doesNotMatch(ov,/cdue1|>오늘<\/button>|>내일<\/button>/);
    assert.match(ov,/data-act="dpopen" data-k="due" aria-pressed="true">📅 오늘</);
    h.click('dppick',{k:'due',v:'2099-12-31'});ov=h.nodes.get('overlay').innerHTML;
    assert.match(ov,/data-act="dpopen" data-k="due" aria-pressed="true">📅 2099년 12월 31일/);
    h.click('sheet-close');
  }
  h.click('taskadd');h.nodes.set('ta-name',{value:'오늘 할 일'});h.click('tmset');h.click('submit-taskadd');await h.settle();
  const m=Object.values(h.snapshot().mine).find(x=>x.name==='오늘 할 일');assert.equal(m.due,T);assert.equal(m.time,'09:00');
});
test('reward form has a repeat switch; once rewards sell one time and cards never show the repeat label',async()=>{
  const base=await profileUI(),saved=base.snapshot();
  saved.mine.tm={id:'tm',kind:'mission',name:'코인 벌기',lv:'epic',due:new Date(Date.now()+9*3600000).toISOString().slice(0,10),time:'09:00',done:false,createdAt:1};
  const h=await profileUI(saved);h.route('dash');h.click('mcheck',{id:'tm'});await h.settle();h.route('shop');
  h.click('sheet',{k:'reward'});let ov=h.nodes.get('overlay').innerHTML;
  assert.match(ov,/<b>반복<\/b>[\s\S]*data-act="rw-rep" aria-label="반복" role="switch" aria-checked="true"/);
  h.click('rw-rep');ov=h.nodes.get('overlay').innerHTML;assert.match(ov,/한 번 사면 끝나는 보상이에요[\s\S]*aria-checked="false"/);
  h.nodes.set('rw-name',{value:'영화 한 편'});h.nodes.set('rw-cost',{value:'100'});
  h.click('submit-reward');await h.settle();
  const r=Object.values(h.snapshot().mine).find(x=>x.kind==='reward');assert.equal(r.repeat,'once');
  let app=h.nodes.get('app').innerHTML;assert.doesNotMatch(app,/1회|반복/);
  h.click('redit',{id:r.id});assert.match(h.nodes.get('overlay').innerHTML,/aria-checked="false"/,'edit keeps the setting');h.click('sheet-close');
  const saved2=h.snapshot();saved2.mine[r.id]={...saved2.mine[r.id],cost:5};
  const g=await profileUI(saved2);g.route('shop');g.click('buy',{id:r.id});g.click('buyok');await g.settle();await g.settle();
  app=g.nodes.get('app').innerHTML;assert.match(app,/disabled>구매 완료</);assert.doesNotMatch(app,new RegExp(`data-act="buy" data-id="${r.id}"`));
});

test('another member story: quest chip is not clickable and metric graph uses the snapshot saved on the story',async()=>{
  const base = await profileUI(), saved = base.snapshot(), at = Date.now();
  saved.profiles = {...(saved.profiles || {}), other:{nick:'다른 회원'}};
  saved.feed = {...(saved.feed || {}), ghostPost:{id:'ghostPost',author:'other',createdAt:at,text:'점수 올랐어요',imgs:0,value:710,reactions:{},joiners:{},ref:{type:'project',id:'ghostQuest',label:'남의 토익',extra:{ms:650,mt:850,mu:'점'}}}};
  const h = await profileUI(saved); h.route('feed'); const html = h.nodes.get('app').innerHTML;
  const card = html.slice(html.indexOf('점수 올랐어요') - 4000, html.indexOf('점수 올랐어요') + 4000);
  assert.match(card,/남의 토익/); assert.doesNotMatch(card,/data-p="ghostQuest"/);
  assert.match(card,/<b class="num">710<\/b><span>점<\/span><small class="num">\/ 850점<\/small><em class="num">30%<\/em>/);
});
test('another member stage story shows stage, parent quest and D-day from the story snapshot',async()=>{
  const base = await profileUI(), saved = base.snapshot(), at = Date.now();
  const end = new Date(Date.now() + 10*86400000).toISOString().slice(0,10);
  saved.profiles = {...(saved.profiles || {}), other:{nick:'다른 회원'}};
  saved.feed = {...(saved.feed || {}), stPost:{id:'stPost',author:'other',createdAt:at,text:'스테이지 진행',imgs:0,reactions:{},joiners:{},ref:{type:'project',id:'ghostStage',label:'남의 스테이지',extra:{sp:true,pt:'남의 메인',end}}}};
  const h = await profileUI(saved); h.route('feed'); const html = h.nodes.get('app').innerHTML;
  const card = html.slice(html.indexOf('남의 스테이지') - 300, html.indexOf('남의 스테이지') + 400);
  assert.match(card,/🔗/); assert.match(card,/스테이지 · D-\d+ · 🎯 남의 메인/); assert.doesNotMatch(card,/메인 퀘스트/);
});
test('another member: mission story is not shown as a main quest; profile shows XP and coins',async()=>{
  const base = await profileUI(), saved = base.snapshot(), at = Date.now();
  saved.profiles = {...(saved.profiles || {}), other:{nick:'다른 회원', stats:{xp:900, gold:777}}};
  saved.feed = {...(saved.feed || {}), mPost:{id:'mPost',author:'other',createdAt:at,text:'미션 끝',imgs:0,reactions:{},joiners:{},ref:{type:'mission',id:'ghostStage',label:'남의 스테이지',mission:'단어 50개',extra:{sp:true}}}};
  const h = await profileUI(saved); h.route('feed'); let html = h.nodes.get('app').innerHTML;
  const card = html.slice(html.indexOf('미션 완료 · 단어 50개'), html.indexOf('미션 완료 · 단어 50개') + 600);
  assert.doesNotMatch(card,/메인 퀘스트|🎯/); assert.doesNotMatch(html.slice(html.indexOf('mPost')-1500, html.indexOf('미션 완료')),/data-act="project" data-p="ghostStage"/);
  h.click('profile',{u:'other'}); html = h.nodes.get('app').innerHTML;
  assert.match(html,/다른 회원/); assert.match(html,/🪙 777/); assert.match(html,/XP<\/span>/);
});
test('stage metric with the same unit also counts toward the main quest metric',async()=>{
  const base=await profileUI(),saved=base.snapshot(),at=Date.now();
  saved.projects={m1:{id:'m1',owner:'me',title:'체중 10kg 감량',end:'2099-12-31',status:'active',metric:{start:80,target:70,unit:'kg'}},
    s1:{id:'s1',owner:'me',parentId:'m1',title:'첫 3kg',end:'2099-12-31',status:'active',metric:{start:80,target:77,unit:'kg'}},
    s2:{id:'s2',owner:'me',parentId:'m1',title:'걸음 수',end:'2099-12-31',status:'active',metric:{start:0,target:10000,unit:'보'}}};
  saved.mine['ml-s1']={id:'ml-s1',kind:'mlog',projectId:'s1',logs:[{v:78,at}]};
  saved.mine['ml-s2']={id:'ml-s2',kind:'mlog',projectId:'s2',logs:[{v:5000,at:at+1}]};
  const h=await profileUI(saved);h.click('project',{p:'m1'});const html=h.nodes.get('app').innerHTML;
  assert.match(html,/<b class="num">78<\/b><span>kg<\/span><small class="num">\/ 70kg<\/small><em class="num">20%<\/em>/);
  assert.doesNotMatch(html,/<b class="num">5,000<\/b><span>kg/);
});

test('plus page: switch to brain dump and add lines there',async()=>{
  const h=await linkedUI(); h.route('write'); h.click('wrmode',{v:'dump'});
  assert.match(h.nodes.get('app').innerHTML,/id="bd-in"/);
  h.nodes.set('bd-in',{value:'우유 사기\n책 반납'}); h.click('bd-add'); await h.settle();
  assert.equal(Object.values(h.snapshot().mine).filter(m=>m.kind==='dump').length,2);
  h.click('wrmode',{v:'story'}); assert.match(h.nodes.get('app').innerHTML,/scomp page/);
});

test('overdue quest: card overlay (dashboard + quest screen), extend, give up (archive), restore, done',async()=>{
  const base=await profileUI(), saved=base.snapshot();
  saved.projects={m:{id:'m',owner:'me',title:'지난 메인',status:'active',end:'2000-01-01'},s:{id:'s',owner:'me',parentId:'m',title:'지난 스테이지',status:'active',end:'2000-01-01'},ok:{id:'ok',owner:'me',title:'남은 메인',status:'active',end:'2099-12-31'},m3:{id:'m3',owner:'me',title:'스테이지만 지남',status:'active',end:'2099-12-31'},s3:{id:'s3',owner:'me',parentId:'m3',title:'늦은 관문',status:'active',end:'2000-01-01'}};
  saved.mine={...saved.mine,mo:{id:'mo',kind:'mission',name:'남은 미션',projectId:'s',done:false,createdAt:1},md:{id:'md',kind:'mission',name:'끝낸 미션',projectId:'m',done:true,doneAt:2,createdAt:2}};
  const h=await profileUI(saved); h.route('dash'); const app=()=>h.nodes.get('app').innerHTML, ov=()=>h.nodes.get('overlay').innerHTML;
  assert.match(app(),/data-reo="m" class="card pgc isover[\s\S]*?<div class="ovlay"><span class="ovi"[\s\S]*?<b>기한이 지났어요<\/b>[\s\S]*?data-act="pdue" data-p="m"[\s\S]*?data-act="pdone2" data-p="m"[\s\S]*?data-act="pcancel" data-p="m">포기/);
  assert.match(app(),/data-reo="m3" class="card pgc isover[\s\S]*?스테이지 기한이 지났어요[\s\S]*?늦은 관문[\s\S]*?data-act="pdue" data-p="s3"[\s\S]*?data-act="pdone2" data-p="s3">완료/);
  assert.doesNotMatch(app(),/data-reo="ok" class="card pgc isover/);
  h.route('qmanage'); assert.match(app(),/data-p="m" role="button"[\s\S]*?<div class="ovlay"><span class="ovi"[\s\S]*?<b>기한이 지났어요/);
  h.click('project',{p:'m'}); assert.doesNotMatch(app(),/기한이 지났어요/);
  h.click('pdue',{p:'s3'}); assert.match(ov(),/기한 연장/); h.click('dppick',{k:'end',v:'2099-01-31'}); h.click('pext-go'); await h.settle();
  assert.ok(h.snapshot().projects.s3.end>'2000-01-01');
  h.click('pcancel',{p:'m'}); assert.match(ov(),/포기할까요/); assert.match(ov(),/스테이지 1개도 함께 포기/); assert.match(ov(),/미션 1개는 삭제/);
  h.click('cfok'); await h.settle(); const sn=h.snapshot();
  assert.equal(sn.projects.m.status,'cancel'); assert.equal(sn.projects.s.status,'cancel'); assert.ok(!sn.mine.mo); assert.ok(sn.mine.md);
  h.route('qmanage'); assert.doesNotMatch(app(),/지난 메인/); h.click('pl-tab',{v:'done'}); assert.match(app(),/포기 <span class="num">1<\/span>/); assert.match(app(),/st cx">포기/);
  h.click('project',{p:'m'}); assert.match(app(),/포기한 메인 퀘스트예요/); h.click('prestore',{p:'m'}); await h.settle();
  assert.equal(h.snapshot().projects.m.status,'active');
  h.click('pdone2',{p:'m'}); h.click('cfok'); await h.settle(); assert.equal(h.snapshot().projects.m.status,'done');
  const xp0=h.snapshot().economy?.claims?.['goal:m']; 
  h.click('project',{p:'m'}); assert.match(app(),/data-act="pundone" data-p="m">달성 취소/); h.click('pundone',{p:'m'}); assert.match(ov(),/메인 퀘스트 달성을 취소할까요/); assert.match(ov(),/경험치와 코인이 회수/);
  h.click('cfok'); await h.settle(); const s2=h.snapshot(); assert.equal(s2.projects.m.status,'active'); assert.ok(!s2.projects.m.doneAt);
  const g=Object.entries(s2.economy?.claims||{}).find(([k])=>k.includes('m')&&k.startsWith('goal')); if(g) assert.equal(g[1].active,false);
});

test('calendar events: add from empty slot (no reward), shown in day/week/month + dashboard line, edit, convert to mission, delete',async()=>{
  const h=await profileUI(); const app=()=>h.nodes.get('app').innerHTML, ov=()=>h.nodes.get('overlay').innerHTML, T=h.snapshot().profiles?.me?.stats;
  const day=new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
  h.route('cal'); assert.match(app(),/data-act="taskadd" data-ev="1"/);
  h.click('taskadd',{ev:'1',d:day,tm:'10:00'}); assert.match(ov(),/일정 추가/); assert.match(ov(),/data-act="ev-type" data-v="ms" aria-pressed="false">미션[\s\S]*?data-act="ev-type" data-v="ev" aria-pressed="true">일정/); assert.doesNotMatch(ov(),/난이도|XP|코인을/);
  assert.match(ov(),/시작[\s\S]*?data-k="due"[\s\S]*?data-tk="time">10:00[\s\S]*?종료[\s\S]*?data-k="edate"[\s\S]*?data-tk="etime">11:00/); assert.doesNotMatch(ov(),/class="tw"|evwl/);
  h.click('tmset',{tk:'etime'}); assert.match(ov(),/class="tw" data-tk="etime"/); h.click('tmdone'); assert.doesNotMatch(ov(),/class="tw"/); assert.doesNotMatch(ov(),/ev-dur/);
  h.nodes.set('ta-name',{value:'치과 정기검진'}); const before=JSON.stringify(h.snapshot().economy?.events||[]).length;
  h.click('submit-taskadd'); await h.settle(); const sn=h.snapshot(), ev=Object.values(sn.mine).find(m=>m.kind==='event');
  assert.equal(ev.name,'치과 정기검진'); assert.equal(ev.date,day); assert.equal(ev.time,'10:00'); assert.equal(ev.etime,'11:00'); assert.equal(ev.edate,day);
  assert.equal(JSON.stringify(sn.economy?.events||[]).length,before);
  assert.match(app(),/class="tlrow[^"]*" data-h="10"[\s\S]*?class="row qrow evq" data-act="evedit"[\s\S]*?evcheck[\s\S]*?치과 정기검진<\/b><\/span>/);
  h.click('cmode',{v:'week'}); assert.match(app(),/wti wck wev[\s\S]*?data-act="evcheck"/); h.click('cmode',{v:'month'}); assert.match(app(),/<i class="ev">/); h.click('cmode',{v:'day'});
  h.route('dash'); assert.match(app(),/<p class="grp">오늘[\s\S]*?class="row qrow evq" data-act="evedit"[\s\S]*?치과 정기검진[\s\S]*?task-meta num">10:00</); assert.doesNotMatch(app(),/evtoday/);
  { const xp0=JSON.stringify(h.snapshot().profiles); h.click('evcheck',{id:ev.id}); await h.settle(); assert.equal(h.snapshot().mine[ev.id].done,true); assert.match(app(),/check evck on/); assert.equal(JSON.stringify(h.snapshot().profiles),xp0); h.click('evcheck',{id:ev.id}); await h.settle(); assert.equal(h.snapshot().mine[ev.id].done,false); }
  assert.match(app(),/data-act="taskadd" data-ev="ms">\+ 미션 추가/); h.click('taskadd',{ev:'ms'}); assert.match(ov(),/미션 추가/); assert.match(ov(),/data-v="ms" aria-pressed="true"/);
  h.click('ev-type',{v:'ev'}); assert.match(ov(),/일정 추가/); assert.match(ov(),/data-tk="time">9:00[\s\S]*?data-tk="etime">10:00/); h.nodes.set('ta-name',{value:'미션 탭 일정'}); h.click('submit-taskadd'); await h.settle();
  assert.ok(Object.values(h.snapshot().mine).some(m=>m.kind==='event'&&m.name==='미션 탭 일정'&&m.time==='09:00'&&m.etime==='10:00'));
  h.nodes.set('ta-name',{value:'치과 정기검진'});
  h.route('cal'); h.click('evedit',{id:ev.id}); assert.match(ov(),/일정 삭제/); h.click('ev-allday'); h.click('submit-taskadd'); await h.settle();
  assert.equal(h.snapshot().mine[ev.id].time,''); assert.match(app(),/tlrow allday[\s\S]*?qrow evq/);
  h.click('evedit',{id:ev.id}); h.click('ev-type',{v:'ms'}); assert.match(ov(),/미션으로 바꾸기/); assert.match(ov(),/난이도/); h.click('submit-taskadd'); await h.settle();
  const s2=h.snapshot(); assert.ok(!s2.mine[ev.id]); assert.ok(Object.values(s2.mine).some(m=>m.kind==='mission'&&m.name==='치과 정기검진'));
  h.click('taskadd',{ev:'1',d:day}); assert.match(ov(),/data-act="ev-allday" aria-pressed="true"/); assert.doesNotMatch(ov(),/class="tw" data-tk/);
  const nx=new Date(Date.parse(day+'T00:00Z')+2*864e5).toISOString().slice(0,10); assert.doesNotMatch(ov(),/ev-multi|여러 날/); assert.match(ov(),/시작[\s\S]*?data-k="due"[\s\S]*?종료[\s\S]*?data-k="edate"/); h.click('dpopen',{k:'edate'}); h.click('dppick',{k:'edate',v:nx}); assert.match(ov(),/종일/);
  h.nodes.set('ta-name',{value:'지울 일정'}); h.click('submit-taskadd'); await h.settle();
  { const m=Object.values(h.snapshot().mine).find(m=>m.kind==='event'&&m.name==='지울 일정'); assert.equal(m.edate,nx); assert.equal(m.time,''); }
  h.click('cmode',{v:'month'}); assert.equal((app().match(/<i class="ev">/g)||[]).length>=2,true); h.click('cmode',{v:'day'});
  const e2=Object.values(h.snapshot().mine).find(m=>m.kind==='event'&&m.name==='지울 일정'); h.click('evedit',{id:e2.id}); h.click('evdel'); h.click('cfok'); await h.settle(); assert.ok(!h.snapshot().mine[e2.id]);
});

test('mission end time: set, saved, shown in every hour it covers (continuation rows dimmed)',async()=>{
  const h=await profileUI(); const app=()=>h.nodes.get('app').innerHTML, ov=()=>h.nodes.get('overlay').innerHTML;
  const day=new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
  h.route('cal'); h.click('taskadd',{ev:'1',d:day,tm:'09:00'}); h.click('ev-type',{v:'ms'});
  assert.match(ov(),/data-act="tmset" data-tk="time"[^>]*>🕒 <span class="tmval" data-tk="time">9:00<\/span>–<span class="tmval" data-tk="etime">10:00/); assert.doesNotMatch(ov(),/etchip|et-clear/);
  h.click('tmset',{tk:'time'}); assert.match(ov(),/class="tw2"[\s\S]*?class="tw" data-tk="time"[\s\S]*?class="tw" data-tk="etime"/); h.click('tmdone');
  h.nodes.set('ta-name',{value:'긴 미션'}); h.click('submit-taskadd'); await h.settle();
  const m=Object.values(h.snapshot().mine).find(x=>x.name==='긴 미션'); assert.equal(m.time,'09:00'); assert.equal(m.etime,'10:00');
  h.click('tedit',{id:m.id}); assert.match(ov(),/data-tk="etime">10:00/); h.click('sheet-close');
  h.route('dash'); h.click('taskadd',{ev:'ms'}); assert.doesNotMatch(ov(),/data-tk="etime"/); h.click('tmset',{tk:'time'}); assert.match(ov(),/data-tk="time">9:00<\/span>–<span class="tmval" data-tk="etime">10:00/); h.click('sheet-close'); h.route('cal');
  h.click('taskadd',{ev:'1',d:day,tm:'10:00'}); h.nodes.set('ta-name',{value:'긴 일정'}); h.click('tmset',{tk:'etime'}); h.click('tmdone');
  { const c=h.snapshot(); } h.click('submit-taskadd'); await h.settle();
  const e=Object.values(h.snapshot().mine).find(x=>x.name==='긴 일정'); assert.equal(e.etime,'11:00');
  const row=hr=>{ const a=app(); const i=a.indexOf(`data-h="${hr}"`); return a.slice(i, a.indexOf('data-h="',i+10)); };
  assert.match(row(9),/긴 미션/); assert.doesNotMatch(row(10),/긴 미션/);
  assert.match(row(10),/class="row qrow evq"[^>]*>[\s\S]*?긴 일정/); assert.doesNotMatch(row(11),/긴 일정/);
});

test('day/week view: hour cells covered by a long mission/event are merged into one cell (item shown once)',async()=>{
  const base=await profileUI(), saved=base.snapshot(), day=new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
  saved.mine={...saved.mine,lm:{id:'lm',kind:'mission',name:'긴미션',lv:'normal',due:day,time:'13:00',etime:'15:00',done:false,createdAt:1},le:{id:'le',kind:'event',name:'긴일정',date:day,time:'10:00',etime:'12:30',createdAt:2},in:{id:'in',kind:'mission',name:'안쪽미션',lv:'normal',due:day,time:'11:00',done:false,createdAt:3}};
  const h=await profileUI(saved); h.route('cal'); const app=()=>h.nodes.get('app').innerHTML;
  const a=app(); assert.match(a,/class="tlrow[^"]*merged" data-h="10" style="--rows:3"[\s\S]*?긴일정[\s\S]*?안쪽미션/); assert.ok(!/class="tlrow[^"]*" data-h="11"/.test(a)); assert.ok(!/class="tlrow[^"]*" data-h="12"/.test(a));
  assert.match(a,/class="tlrow[^"]*merged" data-h="13" style="--rows:2"[\s\S]*?긴미션/); assert.ok(!/class="tlrow[^"]*" data-h="14"/.test(a)); assert.match(a,/class="tlrow[^"]*" data-h="15"/);
  assert.equal((a.match(/data-act="evedit" data-id="le"/g)||[]).length,1); assert.equal((a.match(/data-act="tedit" data-id="lm"/g)||[]).length,1);
  h.click('cmode',{v:'week'}); const w=app(); assert.match(w,/grid-row:span 3"[^>]*>[\s\S]*?긴일정/); assert.match(w,/grid-row:span 2"[^>]*>[\s\S]*?긴미션/); assert.equal((w.match(/data-act="evedit" data-id="le"/g)||[]).length,1); assert.equal((w.match(/data-act="tedit" data-id="lm"/g)||[]).length,1);
});

test('daily quest: a one-day time change moves it on that day only and can be reverted',async()=>{
  const base=await profileUI(), saved=base.snapshot(), day=new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
  saved.mine={...saved.mine,hq:{id:'hq',kind:'quest',name:'아침 산책',time:'07:00',timeOn:{[day]:'09:00'},repeat:{type:'daily'},createdAt:1}};
  const h=await profileUI(saved); h.route('cal'); const app=()=>h.nodes.get('app').innerHTML, ov=()=>h.nodes.get('overlay').innerHTML;
  const row=hr=>{ const a=app(); const i=a.indexOf(`data-h="${hr}"`); return a.slice(i, a.indexOf('data-h="',i+10)); };
  assert.doesNotMatch(row(7),/아침 산책/); assert.match(row(9),/아침 산책/); assert.doesNotMatch(app(),/hmoved|변경/);
  h.click('hedit',{id:'hq',d:day}); assert.match(ov(),/매일 7:00/); assert.match(ov(),/class="hscope"><span class="hsl">오늘은<\/span>[\s\S]*?data-tk="dayT">9:00/); assert.doesNotMatch(ov(),/hrevert|되돌리기/);
  h.click('hrevert'); assert.match(ov(),/data-act="hday">🕒 오늘만 시간 바꾸기/); h.nodes.set('he-name',{value:'아침 산책'}); h.click('submit-hedit'); await h.settle();
  assert.deepEqual(h.snapshot().mine.hq.timeOn,{}); assert.equal(h.snapshot().mine.hq.time,'07:00'); assert.match(row(7),/아침 산책/);
  h.click('hedit',{id:'hq',d:day}); h.click('hday'); assert.match(ov(),/data-tk="dayT">7:00[\s\S]*?class="tw" data-tk="dayT"/); h.click('sheet-close');
  h.click('hedit',{id:'hq'}); assert.doesNotMatch(ov(),/hscope"|hrevert|hday|매일 7:00/);
  h.click('sheet-close'); h.route('dash'); h.click('dpane',{v:'daily'}); assert.match(app(),/data-act="hedit" data-id="hq" data-d="/);
});

test('quest pickers are popups (no chip rows): story link, note link, stage parent',async()=>{
  const base=await profileUI(), saved=base.snapshot();
  saved.projects={g1:{id:'g1',owner:'me',title:'유튜브 기획',status:'active',createdAt:1},g2:{id:'g2',owner:'me',title:'마라톤',status:'active',createdAt:2},st:{id:'st',owner:'me',parentId:'g1',title:'대본 쓰기',status:'active',createdAt:3}};
  const h=await profileUI(saved); const ov=()=>h.nodes.get('overlay').innerHTML;
  h.route('write'); h.click('compose'); 
  assert.match(ov()+h.nodes.get('app').innerHTML,/data-act="tqpick" data-m="ref"/); { assert.doesNotMatch(ov(),/data-act="cref" data-v="g1"/); h.click('tqpick',{m:'ref',t:'어떤 퀘스트의 스토리인가요?'}); h.click('tqsub',{v:'g1'}); assert.match(ov(),/data-act="tqset" data-v="g1"[\s\S]*?data-v="st"/); h.click('tqset',{v:'st'}); assert.match(ov(),/data-act="tqpick" data-m="ref"[^>]*>[^<]*대본 쓰기/); }
  h.click('sheet-close');
  h.click('project',{p:'st'}); h.click('gedit',{p:'st'}); assert.match(ov(),/data-act="ppick">🎯 유튜브 기획/); assert.doesNotMatch(ov(),/data-f="parentId"/);
});

test('daily quests link to a main quest: main-only picker, checkable on the main quest screen, missions by date, archive option on 포기', async () => {
  const snap = (await linkedUI()).snapshot();
  snap.mine.hab = {id:'hab',kind:'quest',name:'매일 달리기',projectId:'main',repeat:{type:'daily'},days:[0,1,2,3,4,5,6],time:'07:00',lv:'easy',active:true,done:{},createdAt:1};
  const H = await profileUI(snap), ov = () => H.nodes.get('overlay').innerHTML, app = () => H.nodes.get('app').innerHTML;
  H.click('project',{p:'main'});
  assert.match(app(),/<h2>일일 퀘스트<\/h2>[\s\S]*?data-act="qcheck" data-id="hab"[\s\S]*?매일 달리기/); assert.doesNotMatch(app(),/이번 주 \d+\/\d+/); assert.match(app(),/매일 달리기<\/b><small class="task-meta"><span class="tday">오늘<\/span> <span class="tday soft">7:00<\/span> <span class="fire">🔥 0일<\/span>/); assert.doesNotMatch(app(),/일 연속/);
  assert.doesNotMatch(app(),/class="mday/,'no date headers: each mission row carries its own date tag');
  assert.match(app(),/<h2>미션<\/h2><button class="gmchip cur" data-act="gmpick" data-p="main">전체[\s\S]*?data-act="gmv" data-p="main" data-v="week"[^>]*>주<[\s\S]*?data-v="month"[^>]*>월</);
  H.click('gmv',{p:'main',v:'week'}); assert.match(app(),/class="wgrid gmwk"><div class="wg"><button class="wgc head/); assert.doesNotMatch(app(),/class="wgc tlab/); H.click('gmnav',{v:'1'}); assert.match(app(),/class="gmnav"/);
  H.click('gmv',{p:'main',v:'month'}); assert.match(app(),/class="mgrid mtask gmmo"><div class="wk">[\s\S]*class="mcell/); H.click('gmpick',{p:'main'}); assert.doesNotMatch(app(),/class="mgrid mtask gmmo"/,'first tap on 전체 returns to the full list'); assert.doesNotMatch(H.nodes.get('overlay').innerHTML,/날짜로 보기/);
  H.click('gmpick',{p:'main'}); assert.match(ov(),/날짜로 보기[\s\S]*class="gmg"[\s\S]*class="gmd today[^"]*has[^"]*" data-act="gmset" data-v="\d{4}-\d\d-\d\d"[\s\S]*data-act="gmset" data-v="">전체 보기/);
  { const d = ov().match(/class="gmd today[^"]*" data-act="gmset" data-v="(\d{4}-\d\d-\d\d)"/)[1]; H.click('gmym',{v:'2099-01'}); assert.match(ov(),/2099년 1월/); H.click('gmset',{v:d}); }
  assert.match(app(),/class="gmchip on" data-act="gmpick" data-p="main">오늘<\/button>/); assert.doesNotMatch(app(),/data-act="gmall"/); assert.doesNotMatch(app(),/class="mday/);
  H.click('gmall'); assert.match(app(),/class="gmchip cur" data-act="gmpick"/);
  assert.match(app(),/data-act="sheet" data-k="add" data-v="daily" data-p="main"/);
  H.click('sheet',{k:'add',v:'daily',p:'main'}); assert.match(ov(),/연결할 메인 퀘스트[\s\S]*?🎯 메인 연결 대상/);
  H.click('tqpick',{m:'main',t:'어떤 메인 퀘스트를 위한 습관인가요?'}); assert.match(ov(),/data-act="tqset" data-v="main"/); assert.doesNotMatch(ov(),/data-act="tqsub"|data-v="sub"/);
  H.click('sheet-close'); H.click('sheet-close');
  H.click('pcancel',{p:'main'}); assert.match(ov(),/연결된 일일 퀘스트 1개도 보관하기/);
});

test('main quest can be achieved only when every stage and mission is done; earlier achievements that miss this go back to active', async () => {
  const snap = (await linkedUI()).snapshot();
  snap.projects.main.status = 'done'; snap.projects.main.doneAt = Date.now() - 1000;
  const H = await profileUI(snap); await new Promise(r => setTimeout(r, 30));
  assert.notEqual(H.snapshot().projects.main.status, 'done', 'achieved main quest with open stage/missions is restored to active');
  H.click('pdone2',{p:'main'}); assert.doesNotMatch(H.nodes.get('overlay').innerHTML,/메인 퀘스트를 달성할까요/);
});

test('missions inherit the linked main/stage area and the mission edit sheet has an area field', async () => {
  const snap = (await linkedUI()).snapshot(); snap.projects.main.area = ['health'];
  const H = await profileUI(snap), ov = () => H.nodes.get('overlay').innerHTML;
  H.click('taskadd',{p:'main'}); assert.match(ov(),/data-act="aset" data-v="health" aria-pressed="true"/);
  H.click('sheet-close');
  H.click('taskadd'); assert.doesNotMatch(ov(),/data-v="health" aria-pressed="true"/); H.click('tqpick'); H.click('tqsub',{v:'main'}); H.click('tqset',{v:'sub'}); assert.match(ov(),/data-act="aset" data-v="health" aria-pressed="true"/,'stage inherits main area');
  H.click('sheet-close');
  H.click('tedit',{id:'tm'}); assert.match(ov(),/영역[\s\S]*data-act="aset" data-v="health" aria-pressed="true"/);
});

test('daily quest cards show this month as small squares (done days orange) and open the whole year', async () => {
  const snap = (await linkedUI()).snapshot();
  const now = new Date(), ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  snap.mine.hab = {id:'hab',kind:'quest',name:'매일 달리기',repeat:{type:'daily'},days:[0,1,2,3,4,5,6],lv:'easy',active:true,done:{[`${ym}-01`]:1},createdAt:new Date(now.getFullYear(),0,1).getTime()};
  const H = await profileUI(snap); H.route('daily');
  const html = H.nodes.get('app').innerHTML;
  assert.match(html,/class="hmon tap" data-act="hyear" data-id="hab"[\s\S]*?<b>\d+월<\/b><span class="num">1일<\/span>[\s\S]*?<i class="on"/);
  H.click('hyear',{id:'hab'}); const ov = H.nodes.get('overlay').innerHTML;
  assert.equal((ov.match(/class="hmon"/g) || []).length, 12); assert.match(ov,/년 · 1일/);
});

test('자료 작성: 완료·삭제 버튼 없음, 뒤로 가면 자동 저장(빈 건 저장 안 함), 칸 지우기·되살리기, 카드 메뉴로 수정·삭제',async () => {
  const h = await linkedUI(); h.route('notes'); const app = () => h.nodes.get('app').innerHTML, ov = () => h.nodes.get('overlay').innerHTML;
  const notes = () => Object.values(h.snapshot().mine).filter(m => m.kind === 'note');
  h.click('nt-new'); assert.doesNotMatch(ov(),/data-act="submit-note"|data-act="nt-del"/);
  h.click('sheet-close'); await h.settle(); assert.equal(notes().length,0,'empty note is not saved');
  h.click('nt-new'); h.click('nt-kind',{v:'ref'}); h.nodes.set('nf-title',{value:'자동 저장 참고자료'}); h.nodes.set('nf-summary',{value:'요약'});
  h.click('nt-emenu'); assert.doesNotMatch(ov(),/data-act="nt-tedit"|data-act="nt-tog"/); assert.match(ov(),/data-act="nt-discard"/); h.click('nt-emenu');
  h.click('sheet-close'); await h.settle();
  const n = notes()[0]; assert.ok(n); assert.equal(n.cat,'ref'); assert.equal(n.f.title,'자동 저장 참고자료'); assert.ok(!n.hideF); assert.equal(n.f.summary,'요약');
  const u0 = n.updatedAt; h.click('nt-edit',{id:n.id}); assert.match(ov(),/data-f="media"/); h.click('sheet-close'); await h.settle(); assert.equal(notes()[0].updatedAt,u0,'unchanged note is not rewritten');
  assert.match(app(),new RegExp(`data-act="nt-menu" data-id="${n.id}"`)); h.click('nt-menu',{id:n.id}); assert.match(ov(),/data-act="nt-edit"[\s\S]*수정[\s\S]*data-act="nt-del"[\s\S]*삭제/);
  h.click('nt-del',{id:n.id}); assert.match(ov(),/자료를 삭제할까요/); h.click('cfok'); await h.settle(); assert.equal(notes().length,0);
  // 작성 화면 ⋯ 메뉴: 수정·삭제. 기존 자료는 삭제(되살아나지 않음), 새 자료는 저장 없이 나가기
  h.click('nt-new'); h.nodes.set('nf-title',{value:'지울 자료'}); h.click('sheet-close'); await h.settle(); const z = notes()[0]; assert.ok(z);
  h.click('nt-edit',{id:z.id}); h.click('nt-emenu'); assert.match(ov(),/data-act="nt-del"[\s\S]*삭제/); assert.doesNotMatch(ov(),/nt-tedit/);
  h.click('nt-del',{id:z.id}); h.click('cfok'); await h.settle(); assert.equal(notes().length,0); assert.equal(h.nodes.get('overlay').innerHTML.includes('nttitle'),false);
  h.click('nt-new'); h.nodes.set('nf-title',{value:'버릴 글'}); h.click('nt-emenu'); assert.match(ov(),/data-act="nt-discard"/); h.click('nt-discard'); assert.match(ov(),/작성 중인 내용을 지울까요/); h.click('cfok'); await h.settle(); assert.equal(notes().length,0);
});
