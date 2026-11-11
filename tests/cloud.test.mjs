import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloud, loadState, createSync, applyPrefs, pickPrefs, hasContent, SESSION_KEY, META_KEY} from '../src/cloud.js';
import {authView} from '../src/auth-screen.js';
import {emptySnapshot} from '../src/storage.js';

const KEY = 'quest:foundation:empty:v2';
const memLS = () => { const m = new Map(); return {getItem:k => m.has(k) ? m.get(k) : null, setItem:(k, v) => m.set(k, String(v)), removeItem:k => m.delete(k), m}; };
const snap = (nick, extra = {}) => ({...emptySnapshot(), at:1, profiles:nick ? {me:{uid:'me', nick}} : {}, ...extra});

// Supabase 흉내: 이메일 계정, 토큰, user_state 한 줄. 요청 기록을 남긴다.
function fakeSupabase({confirm = true} = {}){
  const users = new Map(), rows = new Map(), log = []; let tick = 0, offline = false;
  const res = (status, body) => ({ok:status < 400, status, text:async () => body === undefined ? '' : JSON.stringify(body), json:async () => body});
  const tokenFor = id => ({access_token:'at-' + id + '-' + (++tick), refresh_token:'rt-' + id, expires_in:3600, user:{id, email:users.get(id).email}});
  const who = h => { const t = (h.Authorization || '').replace('Bearer ', ''); const m = /^at-(\w+)-/.exec(t); return m ? m[1] : null; };
  async function fetch(url, {method = 'GET', headers = {}, body} = {}){
    if (offline) throw new TypeError('Failed to fetch');
    const u = new URL(url), p = u.pathname, data = body ? JSON.parse(body) : null; log.push({method, path:p + u.search, headers, data});
    assert.equal(headers.apikey, 'pk', 'publishable key on every call');
    if (p === '/auth/v1/signup'){ if ([...users.values()].some(x => x.email === data.email)) return res(422, {error_code:'user_already_exists'});
      const id = 'u' + (users.size + 1); users.set(id, {email:data.email, pw:data.password, ok:!confirm}); return res(200, confirm ? {id, email:data.email} : tokenFor(id)); }
    if (p === '/auth/v1/token' && u.searchParams.get('grant_type') === 'password'){ const e = [...users].find(([, x]) => x.email === data.email && x.pw === data.password);
      if (!e) return res(400, {error_code:'invalid_credentials'}); if (!e[1].ok) return res(400, {error_code:'email_not_confirmed'}); return res(200, tokenFor(e[0])); }
    if (p === '/auth/v1/token') { const id = String(data.refresh_token).replace('rt-', ''); return users.has(id) ? res(200, tokenFor(id)) : res(400, {error_code:'refresh_token_not_found'}); }
    if (p === '/auth/v1/user' && method === 'GET'){ const id = who(headers); return id ? res(200, {id, email:users.get(id).email}) : res(401, {}); }
    if (p === '/auth/v1/user' && method === 'PUT'){ const id = who(headers); users.get(id).pw = data.password; return res(200, {id}); }
    if (p === '/auth/v1/logout') return res(204);
    if (p === '/auth/v1/recover' || p === '/auth/v1/resend') return res(200, {});
    if (p === '/rest/v1/user_state' && method === 'GET'){ const id = who(headers); assert.equal(u.searchParams.get('user_id'), 'eq.' + id, 'RLS-style own row'); const r = rows.get(id); return res(200, r ? [r] : []); }
    if (p === '/rest/v1/user_state' && method === 'POST'){ const id = who(headers); assert.equal(data.user_id, id); assert.match(headers.Prefer, /resolution=merge-duplicates/); const r = {data:data.data, updated_at:'t' + (++tick)}; rows.set(id, r); return res(201, [{updated_at:r.updated_at}]); }
    if (p === '/rest/v1/rpc/delete_my_account'){ const id = who(headers); users.delete(id); rows.delete(id); return res(204); }
    return res(404, {});
  }
  return {fetch, users, rows, log, confirmAll:() => { for (const u of users.values()) u.ok = true; }, setOffline:v => { offline = v; }};
}
const make = (sb, ls = memLS(), extra = {}) => ({ls, cloud:createCloud({fetch:sb.fetch, ls, url:'https://x.supabase.co', key:'pk', site:'https://myquestline.pages.dev/', ...extra})});

test('cloud auth: sign-up needs email confirmation, sign-in stores the session, error codes become Korean messages', async () => {
  const sb = fakeSupabase(), {cloud, ls} = make(sb);
  assert.deepEqual(await cloud.signUp('a@b.co', 'password1'), {confirm:true});
  assert.match(sb.log[0].path, /redirect_to=https%3A%2F%2Fmyquestline\.pages\.dev%2F/);
  await assert.rejects(cloud.signIn('a@b.co', 'password1'), /이메일 인증/);
  sb.confirmAll();
  await assert.rejects(cloud.signIn('a@b.co', 'wrong'), /이메일 또는 비밀번호/);
  await assert.rejects(cloud.signUp('a@b.co', 'password1'), /이미 가입된/);
  const user = await cloud.signIn('a@b.co', 'password1');
  assert.equal(user.email, 'a@b.co'); assert.ok(JSON.parse(ls.getItem(SESSION_KEY)).refresh_token);
  assert.equal(make(sb, ls).cloud.user().id, user.id, 'session survives reload');
  sb.setOffline(true); await assert.rejects(cloud.pull(), e => e.code === 'network' && /인터넷/.test(e.message)); sb.setOffline(false);
  await cloud.signOut(); assert.equal(cloud.user(), null); assert.equal(ls.getItem(SESSION_KEY), null);
});

test('cloud auth: expired access token is refreshed before data calls; invalid refresh logs out', async () => {
  let now = 1_000_000_000_000; const sb = fakeSupabase({confirm:false}), {cloud, ls} = make(sb, memLS(), {now:() => now});
  await cloud.signUp('a@b.co', 'password1'); const first = JSON.parse(ls.getItem(SESSION_KEY)).access_token;
  now += 3600 * 1000; await cloud.pull();
  assert.notEqual(JSON.parse(ls.getItem(SESSION_KEY)).access_token, first, 'refreshed');
  sb.users.clear(); now += 3600 * 1000;
  await assert.rejects(cloud.pull()); assert.equal(cloud.user(), null);
});

test('cloud auth: mail links (#access_token / #error) are parsed and adopted; recovery sets a new password', async () => {
  const sb = fakeSupabase({confirm:false}), {cloud} = make(sb);
  await cloud.signUp('a@b.co', 'password1'); await cloud.signOut();
  assert.equal(cloud.handleRedirect(''), null);
  assert.match(cloud.handleRedirect('#error=access_denied&error_code=otp_expired').error, /만료/);
  const h = cloud.handleRedirect('#access_token=at-u1-9&refresh_token=rt-u1&expires_in=3600&type=recovery');
  assert.equal(await cloud.adopt(h.pending), 'recovery'); assert.equal(cloud.user().email, 'a@b.co');
  await cloud.updatePassword('newpassword'); await cloud.signOut();
  await cloud.signIn('a@b.co', 'newpassword');
  await assert.rejects(cloud.adopt({access:'bogus', refresh:'x', type:'signup'}), /만료/);
});

test('loadState: records come from the server only; old device copies are cleaned up (unsent same-account changes are pushed first)', async () => {
  const sb = fakeSupabase({confirm:false}), {cloud, ls} = make(sb);
  await cloud.signUp('a@b.co', 'password1'); const uid = cloud.user().id;
  let r = await loadState({cloud, ls, key:KEY, backup:() => assert.fail()});
  assert.equal(r.text, null); assert.equal(r.prefs, null);
  sb.rows.set(uid, {data:{...snap('서버'), prefs:{theme:'dark'}}, updated_at:'s1'});
  r = await loadState({cloud, ls, key:KEY, backup:() => assert.fail()});
  assert.equal(JSON.parse(r.text).profiles.me.nick, '서버'); assert.deepEqual(r.prefs, {theme:'dark'}); assert.equal(r.at, 's1');
  // 이전 버전의 같은 계정 사본 + 못 올린 변경 → 올리고(서버 설정 유지) 사본 삭제
  ls.setItem(KEY, JSON.stringify(snap('오프라인 수정'))); cloud.setMeta({uid, syncedAt:'s1', dirty:true});
  r = await loadState({cloud, ls, key:KEY});
  assert.equal(sb.rows.get(uid).data.profiles.me.nick, '오프라인 수정'); assert.deepEqual(sb.rows.get(uid).data.prefs, {theme:'dark'});
  assert.equal(JSON.parse(r.text).profiles.me.nick, '오프라인 수정'); assert.equal(ls.getItem(KEY), null); assert.equal(cloud.meta(), null);
  // 다른 계정의 사본 → 그냥 지움
  ls.setItem(KEY, JSON.stringify(snap('남의 기록'))); cloud.setMeta({uid:'someone', dirty:true});
  r = await loadState({cloud, ls, key:KEY, backup:() => assert.fail()}); assert.equal(JSON.parse(r.text).profiles.me.nick, '오프라인 수정'); assert.equal(ls.getItem(KEY), null);
  // 로그인 전 기록 + 서버 기록 → 서버 기록 사용, 기기 사본은 백업 파일로
  ls.setItem(KEY, JSON.stringify(snap('로그인 전'))); const backups = [];
  r = await loadState({cloud, ls, key:KEY, backup:(l, x) => backups.push([l, x.profiles.me.nick])});
  assert.deepEqual(backups, [['이 기기', '로그인 전']]); assert.match(r.notice, /백업 파일/); assert.equal(JSON.parse(r.text).profiles.me.nick, '오프라인 수정');
  // 로그인 전 기록 + 빈 서버 → 올림
  const other = make(sb); await other.cloud.signUp('c@b.co', 'password1');
  other.ls.setItem(KEY, JSON.stringify(snap('첫 기기'))); other.ls.setItem(KEY + ':preferences', JSON.stringify({theme:'light', tab:'x'}));
  r = await loadState({cloud:other.cloud, ls:other.ls, key:KEY});
  assert.equal(sb.rows.get(other.cloud.user().id).data.profiles.me.nick, '첫 기기'); assert.deepEqual(sb.rows.get(other.cloud.user().id).data.prefs, {theme:'light'});
  // 설정만 저장된 계정(캐릭터 전) → 빈 기록으로 시작
  sb.rows.set(uid, {data:{prefs:{theme:'dark'}}, updated_at:'s9'});
  r = await loadState({cloud, ls, key:KEY}); assert.equal(r.text, null); assert.deepEqual(r.prefs, {theme:'dark'});
  assert.equal(hasContent(null), false); assert.equal(hasContent(emptySnapshot()), false); assert.equal(hasContent(snap('a')), true);
});

test('sync driver: records live only in memory and upload debounced; theme/menu order upload with them; other prefs stay on the device', async () => {
  const sb = fakeSupabase({confirm:false}), {cloud, ls} = make(sb);
  await cloud.signUp('a@b.co', 'password1'); const uid = cloud.user().id, PK = KEY + ':preferences';
  let fire = null; const states = [];
  const sync = createSync({cloud, ls, key:KEY, initial:JSON.stringify(snap('0')), at:'s0', setTimer:fn => { fire = fn; return 1; }, clearTimer:() => {}, onState:s => states.push(s)});
  assert.equal(JSON.parse(sync.driver.getItem(KEY)).profiles.me.nick, '0'); assert.equal(sync.at(), 's0');
  sync.driver.setItem(PK, JSON.stringify({tab:'home'})); assert.equal(sync.pending(), false, 'device-only pref');
  sync.driver.setItem(KEY, JSON.stringify(snap('1'))); sync.driver.setItem(KEY, JSON.stringify(snap('2')));
  assert.equal(ls.getItem(KEY), null, 'never written to the device');
  assert.equal(sync.pending(), true); assert.equal(sb.rows.size, 0, 'nothing sent before the delay');
  fire(); await sync.flush();
  assert.equal(sb.rows.get(uid).data.profiles.me.nick, '2'); assert.equal(sync.pending(), false); assert.ok(states.includes('saved')); assert.equal(sync.at(), sb.rows.get(uid).updated_at);
  sync.driver.setItem(PK, JSON.stringify({tab:'home', theme:'dark', navOrder:['#plan']})); assert.equal(sync.pending(), true);
  await sync.flush(); assert.deepEqual(sb.rows.get(uid).data.prefs, {theme:'dark', navOrder:['#plan']}); assert.equal(sb.rows.get(uid).data.profiles.me.nick, '2');
  sb.setOffline(true); sync.driver.setItem(KEY, JSON.stringify(snap('3'))); await sync.flush();
  assert.equal(sync.pending(), true); assert.ok(states.includes('offline'));
  sb.setOffline(false); await sync.flush(); assert.equal(sb.rows.get(uid).data.profiles.me.nick, '3'); assert.equal(sync.pending(), false);
  // reset: prefs removed → server prefs cleared too
  sync.driver.removeItem(PK); assert.equal(sync.pending(), true); await sync.flush(); assert.deepEqual(sb.rows.get(uid).data.prefs, {});
  // 계정 설정 적용: 기기 전용 설정은 유지
  ls.setItem(PK, JSON.stringify({tab:'home', theme:'light'})); applyPrefs(ls, PK, {navOrder:['#shop']});
  assert.deepEqual(JSON.parse(ls.getItem(PK)), {tab:'home', navOrder:['#shop']}); assert.deepEqual(pickPrefs('nope'), {});
});

test('account deletion calls the RPC, clears the session and the server row', async () => {
  const sb = fakeSupabase({confirm:false}), {cloud, ls} = make(sb);
  await cloud.signUp('a@b.co', 'password1'); const uid = cloud.user().id; await cloud.push(snap('x'));
  await cloud.deleteAccount();
  assert.equal(cloud.user(), null); assert.equal(sb.rows.has(uid), false); assert.equal(sb.users.has(uid), false); assert.equal(ls.getItem(SESSION_KEY), null);
  assert.ok(sb.log.some(x => x.path === '/rest/v1/rpc/delete_my_account' && x.headers.Authorization));
  assert.ok(!JSON.stringify(sb.log).includes('service_role'));
  assert.equal(META_KEY, 'quest:cloud:meta');
});

test('auth screen: login / sign-up (required consents + terms) / sent views escape user text', () => {
  const login = authView({view:'login', email:'<x>@a.co'});
  assert.match(login, /data-auth-form="login"[\s\S]*id="auth-email"[\s\S]*id="auth-pw"[\s\S]*로그인[\s\S]*비밀번호를 잊으셨나요[\s\S]*이메일로 가입하기/);
  assert.ok(!login.includes('<x>@a.co')); assert.match(login, /&lt;x&gt;@a\.co/);
  const su = authView({view:'signup'});
  assert.match(su, /만 14세 이상[\s\S]*이용약관에 동의[\s\S]*이용약관 보기[\s\S]*개인정보 수집·이용에 동의[\s\S]*개인정보처리방침 보기/);
  assert.equal((su.match(/class="auth-req"/g) || []).length, 3); assert.match(su, /제1조 목적/);
  assert.match(authView({view:'sent', email:'a@b.co'}), /인증 메일을 보냈어요[\s\S]*a@b\.co[\s\S]*data-auth="resend"/);
  assert.match(authView({view:'login', error:'<b>오류</b>'}), /role="alert">&lt;b&gt;오류/);
  assert.ok(!authView({view:'login'}).includes('authchoice'));
  assert.match(authView({view:'reset'}), /data-auth-form="reset"[\s\S]*새 비밀번호/);
  assert.match(authView({view:'error', error:'x'}), /data-auth="retry"[\s\S]*data-auth="logout"/);
});
