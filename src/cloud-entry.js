/* 배포판 진입점(Cloudflare): 로그인 필수. 로그인 → 서버 기록 불러오기 → 앱 시작 → 바뀔 때마다 서버로 저장.
 * 기록은 서버에만 둔다(이 기기에는 메모리에만). 화면 모드·메뉴 순서도 계정에 함께 저장한다. */
import {bootstrap} from './bootstrap.js';
import {NAMESPACES} from './storage.js';
import {createCloud, loadState, createSync, applyPrefs} from './cloud.js';
import {createCommunity, mergeView, ownOnly} from './community.js';
import {mountAuth} from './auth-screen.js';

const host = window, ls = host.localStorage, KEY = NAMESPACES.empty, PREF_KEY = KEY + ':preferences';
const site = host.location.origin + host.location.pathname;
const cloud = createCloud({fetch:host.fetch.bind(host), ls, site});
const root = host.document.querySelector('#app');
let auth = null, sync = null, app = null, comm = null, leaving = false;

function download(label, snapshot){
  try {
    const blob = new host.Blob([JSON.stringify(snapshot, null, 2)], {type:'application/json'});
    const a = host.document.createElement('a'), d = new Date();
    a.href = host.URL.createObjectURL(blob); a.download = `퀘스트-${label}-기록-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    host.document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => host.URL.revokeObjectURL(a.href), 4000);
  } catch { /* 내려받기를 막는 환경: 기록 선택은 그대로 진행 */ }
}
const actions = {
  signIn:async (email, pw) => { await cloud.signIn(email, pw); await enter(); },
  signUp:async (email, pw) => { const r = await cloud.signUp(email, pw); if (!r.confirm) await enter(); return r; },
  resend:email => cloud.resend(email),
  recover:email => cloud.recover(email),
  updatePassword:async pw => { await cloud.updatePassword(pw); await enter('비밀번호를 바꿨어요'); },
  retry:() => enter(),
  logout:async () => { await cloud.signOut(); showAuth({view:'login'}); }
};
function showAuth(initial){ if (auth) auth.unmount(); auth = mountAuth({root, body:host.document.body, actions, initial}); }

async function enter(notice){
  if (!auth) showAuth({view:'loading'}); else auth.set({view:'loading', info:'', error:''});
  let st, view = null;
  comm = createCommunity({rest:cloud.rest, me:() => cloud.user().id, onState:s => bar('comm', s)});
  try { [st, view] = await Promise.all([loadState({cloud, ls, key:KEY, backup:download}), comm.fetchView().catch(() => null)]); } // 커뮤니티를 못 불러와도 앱은 시작한다
  catch (e) {
    if (!cloud.user()) return showAuth({view:'login', error:e.message});
    return auth.set({view:'error', error:e.message, busy:false}); // 기록이 서버에만 있으니 연결돼야 시작할 수 있다
  }
  if (st.prefs) applyPrefs(ls, PREF_KEY, st.prefs);
  start(notice || st.notice, st, view);
}

// 저장 실패 알림 막대: 기록과 커뮤니티 둘 다 저장될 때까지 화면 아래에 남는다.
let bar = () => {};
function saveBar(){
  const el = host.document.createElement('div');
  el.className = 'savebar'; el.setAttribute('role', 'alert'); el.hidden = true;
  el.innerHTML = '<span class="savebar-t"></span><button type="button" class="btn sm">다시 시도</button>';
  host.document.body.appendChild(el);
  const t = el.querySelector('.savebar-t'), b = el.querySelector('button');
  b.addEventListener('click', () => { if (sync) sync.flush(); if (comm) comm.flush(); });
  const bad = {};
  return (src, state) => {
    if (state === 'offline' || state === 'error') bad[src] = state; else if (state === 'saved') delete bad[src];
    if (state === 'saved'){ const left = Object.values(bad)[0]; if (!left){ el.hidden = true; return; } state = left; }
    if (state === 'offline' || state === 'error'){
      t.textContent = state === 'offline' ? '연결이 끊겨 저장되지 않았어요' : '저장되지 않았어요';
      b.disabled = false; b.textContent = '다시 시도'; el.hidden = false; return;
    }
    if (state === 'saving' && !el.hidden){ b.disabled = true; b.textContent = '저장하는 중…'; }
  };
}

function start(notice, st, view){
  if (auth){ auth.unmount(); auth = null; }
  bar = saveBar();
  sync = createSync({cloud, ls, key:KEY, initial:st.text, at:st.at, onState:s => bar('rec', s), shape:ownOnly, onChange:text => { try { comm.change(JSON.parse(text)); } catch { /* 다음 저장 때 */ } }});
  const leave = go => { leaving = true; go(); };
  const account = {
    email:cloud.user().email,
    async signOut(){ await Promise.all([sync.flush(), comm.flush()]); if ((sync.pending() || comm.pending()) && !(await app.confirm('아직 저장하지 못한 기록이 있어요. 지금 로그아웃하면 저장하지 못한 내용은 사라져요. 그래도 로그아웃할까요?'))) return;
      await cloud.signOut(); leave(() => host.location.replace(site)); },
    async deleteAccount(){ await cloud.deleteAccount(); leave(() => host.location.replace(site)); }
  };
  // 백업 불러오기·전체 삭제 뒤 새로고침: 서버에 저장한 다음에 새로고침한다(기록이 메모리에만 있으므로).
  const reload = async () => {
    await sync.flush();
    while (sync.pending() && await app.confirm('서버에 저장하지 못했어요. 다시 시도할까요? 취소하면 이번 변경은 반영되지 않아요.')) await sync.flush();
    leave(() => host.location.reload());
  };
  const community = {
    report:(type, id) => comm.report(type, id),
    accept:uid => comm.accept(uid), reject:uid => comm.reject(uid),
    refresh:() => refreshCommunity(true)
  };
  app = bootstrap({host, driver:sync.driver, account, reload, community});
  if (view) adoptView(view);
  if (notice) setTimeout(() => app.notify(notice), 300);
  host.addEventListener('beforeunload', e => { if (leaving || !(sync.pending() || comm.pending())) return; sync.flush(); comm.flush(); e.preventDefault(); e.returnValue = ''; });
  host.addEventListener('online', () => { sync.flush(); comm.flush(); });
  host.setInterval(() => { if (sync.pending()) sync.flush(); if (comm.pending()) comm.flush(); }, 30000);
  host.setInterval(() => refreshCommunity(), 60000); // 새 스토리·공감·답글 받아오기
  // 다른 기기에서 바뀐 기록 확인: 화면으로 돌아올 때 서버가 더 새로우면 다시 불러온다.
  host.document.addEventListener('visibilitychange', async () => {
    if (host.document.visibilityState === 'hidden'){ sync.flush(); comm.flush(); return; }
    refreshCommunity();
    if (sync.pending() || !cloud.user()) return;
    try { const row = await cloud.pull(); if (row && row.updated_at !== sync.at() && !sync.pending()){
      host.sessionStorage.setItem('quest:cloud:notice', '다른 기기에서 바뀐 기록을 불러왔어요'); leave(() => host.location.reload()); } } catch { /* 다음에 다시 확인 */ }
  });
}

/* 커뮤니티: 서버 보기를 화면 상태에 넣고, 그 상태를 기준으로 내 몫을 올리기 시작한다. */
function adoptView(view){ const merged = mergeView(app.snapshot(), view); if (app.adopt(merged, view)) comm.ready(view, merged); }
let refreshing = false;
async function refreshCommunity(force){
  if (!app || !comm || refreshing || comm.pending() || sync.pending() || !cloud.user() || (!force && host.document.visibilityState === 'hidden')) return;
  refreshing = true;
  try { const view = await comm.fetchView(); if (!comm.pending() && !sync.pending()) adoptView(view); } catch { /* 다음에 다시 */ }
  finally { refreshing = false; }
}

(async () => {
  const hashed = cloud.handleRedirect(host.location.hash);
  if (hashed) host.history.replaceState(null, '', site);
  const saved = host.sessionStorage.getItem('quest:cloud:notice'); if (saved) host.sessionStorage.removeItem('quest:cloud:notice');
  if (hashed && hashed.error) return showAuth({view:'login', error:hashed.error});
  if (hashed && hashed.pending){
    showAuth({view:'loading', info:'메일 링크를 확인하고 있어요.'});
    try { const type = await cloud.adopt(hashed.pending); if (type === 'recovery') return auth.set({view:'reset', busy:false}); return enter(type === 'signup' ? '이메일 인증을 마쳤어요. 환영해요!' : ''); }
    catch (e) { return auth.set({view:'login', error:e.message, busy:false}); }
  }
  if (!cloud.user()) return showAuth({view:'login'});
  enter(saved || '');
})();
