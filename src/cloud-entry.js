/* 배포판 진입점(Cloudflare): 로그인 필수. 로그인 → 기록 맞추기 → 앱 시작 → 저장할 때마다 서버로 올리기. */
import {bootstrap} from './bootstrap.js';
import {NAMESPACES} from './storage.js';
import {createCloud, reconcile, createSync} from './cloud.js';
import {mountAuth} from './auth-screen.js';

const host = window, ls = host.localStorage, KEY = NAMESPACES.empty;
const site = host.location.origin + host.location.pathname;
const cloud = createCloud({fetch:host.fetch.bind(host), ls, site});
const root = host.document.querySelector('#app');
let auth = null, sync = null, app = null;

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
  signUp:async (email, pw, nick) => { const r = await cloud.signUp(email, pw, nick); if (!r.confirm) await enter(); return r; },
  resend:email => cloud.resend(email),
  recover:email => cloud.recover(email),
  updatePassword:async pw => { await cloud.updatePassword(pw); await enter('비밀번호를 바꿨어요'); },
  retry:() => enter(),
  logout:async () => { await cloud.signOut(); showAuth({view:'login'}); }
};
function showAuth(initial){ if (auth) auth.unmount(); auth = mountAuth({root, body:host.document.body, actions, initial}); }

async function enter(notice){
  if (!auth) showAuth({view:'loading'}); else auth.set({view:'loading', info:'', error:''});
  let result;
  try { result = await reconcile({cloud, ls, key:KEY, ask:choice => auth.choose(choice), backup:download}); }
  catch (e) {
    if (!cloud.user()) return showAuth({view:'login', error:e.message});
    const m = cloud.meta();
    // 오프라인이어도 이 계정의 기기 사본이 있으면 그대로 쓰고, 연결되면 올린다.
    if (!(e.code === 'network' && m && m.uid === cloud.user().id)) return auth.set({view:'error', error:e.message, busy:false});
    notice = '오프라인이에요. 연결되면 기록을 자동으로 저장해요.';
  }
  start(notice || (result && result.notice));
}

function start(notice){
  if (auth){ auth.unmount(); auth = null; }
  sync = createSync({cloud, ls, key:KEY, onState:s => { if (s === 'error' && app) app.notify('기록을 서버에 저장하지 못했어요. 잠시 후 다시 시도해요.'); }});
  const account = {
    email:cloud.user().email, nick:cloud.user().nick || '',
    async signOut(){ await sync.flush(); if (sync.pending() && !(await app.confirm('아직 서버에 저장하지 못한 기록이 있어요. 그래도 로그아웃할까요? 이 기기의 기록은 지워져요.'))) return;
      await cloud.signOut(); ls.removeItem(KEY); cloud.setMeta(null); host.location.replace(site); },
    async deleteAccount(){ await cloud.deleteAccount(); ls.removeItem(KEY); cloud.setMeta(null); host.location.replace(site); }
  };
  app = bootstrap({host, driver:sync.driver, account});
  if (notice) setTimeout(() => app.notify(notice), 300);
  // 저장하지 못한 기록 재시도 + 다른 기기 변경 확인
  host.addEventListener('online', () => sync.flush());
  host.setInterval(() => { if (sync.pending()) sync.flush(); }, 30000);
  host.document.addEventListener('visibilitychange', async () => {
    if (host.document.visibilityState === 'hidden'){ sync.flush(); return; }
    if (sync.pending() || !cloud.user()) return;
    try { const row = await cloud.pull(); const m = cloud.meta(); if (row && m && row.updated_at !== m.syncedAt && !sync.pending()){
      host.sessionStorage.setItem('quest:cloud:notice', '다른 기기에서 바뀐 기록을 불러왔어요');
      await reconcile({cloud, ls, key:KEY, ask:async () => 'server', backup:() => {}}); host.location.reload(); } } catch { /* 다음에 다시 확인 */ }
  });
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
