/* Supabase 연결(이메일 로그인 + 계정별 기록 저장). Cloudflare 배포판(cloud-entry.js)에서만 쓴다.
 * 의존성 없이 fetch로 Supabase Auth(GoTrue)와 REST(PostgREST)를 직접 부른다.
 * 기록은 계정당 한 줄(user_state.data = 앱 스냅샷 전체)로 저장하고, 기기의 localStorage는 그 사본(캐시)이다.
 * 공개용 키(publishable)만 들어간다. 비밀 키는 절대 여기에 넣지 않는다. 데이터 보호는 서버의 행 단위 보안(RLS)이 맡는다. */
import {validateSnapshot} from './storage.js';

export const CLOUD_URL = 'https://rqoghflmyxpoqrhydgce.supabase.co';
export const CLOUD_KEY = 'sb_publishable_h7gy3dkAhaZVUWKQ0ZV56w_WBS5vaKY';
export const SESSION_KEY = 'quest:cloud:session';
export const META_KEY = 'quest:cloud:meta';

const MESSAGES = {
  invalid_credentials:'이메일 또는 비밀번호가 맞지 않아요.',
  email_not_confirmed:'아직 이메일 인증을 하지 않았어요. 받은 메일의 링크를 눌러 주세요.',
  user_already_exists:'이미 가입된 이메일이에요. 로그인해 주세요.',
  email_exists:'이미 가입된 이메일이에요. 로그인해 주세요.',
  weak_password:'비밀번호가 너무 쉬워요. 8자 이상으로 더 길게 정해 주세요.',
  same_password:'지금 쓰는 비밀번호와 달라야 해요.',
  email_address_invalid:'이메일 주소를 다시 확인해 주세요.',
  validation_failed:'입력한 내용을 다시 확인해 주세요.',
  over_email_send_rate_limit:'메일을 너무 자주 보냈어요. 잠시 후 다시 시도해 주세요.',
  over_request_rate_limit:'요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
  signup_disabled:'지금은 새로 가입할 수 없어요.',
  otp_expired:'링크가 만료됐어요. 메일을 다시 받아 주세요.',
  refresh_token_not_found:'로그인이 만료됐어요. 다시 로그인해 주세요.',
  session_not_found:'로그인이 만료됐어요. 다시 로그인해 주세요.',
  network:'서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.'
};
const fail = (code, fallback) => Object.assign(new Error(MESSAGES[code] || fallback || '잠시 후 다시 시도해 주세요.'), {code});

export function createCloud({fetch, ls, url = CLOUD_URL, key = CLOUD_KEY, site = '', now = Date.now}) {
  const read = k => { try { const v = ls.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
  const write = (k, v) => { if (v == null) ls.removeItem(k); else ls.setItem(k, JSON.stringify(v)); };
  let session = read(SESSION_KEY);
  if (!session || typeof session.access_token !== 'string' || !session.user || typeof session.user.id !== 'string') session = null;
  const keep = s => { session = s; write(SESSION_KEY, s); };
  const fromToken = (data, user = data.user) => ({access_token:data.access_token, refresh_token:data.refresh_token,
    expires_at:Number(data.expires_at) || Math.floor(now() / 1000) + (Number(data.expires_in) || 3600), user:{id:user.id, email:user.email || ''}});
  const redirect = site ? '?redirect_to=' + encodeURIComponent(site) : '';

  async function call(path, {method = 'GET', body, auth = false, prefer} = {}) {
    const headers = {apikey:key};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;
    if (auth){ await fresh(); if (!session) throw fail('session_not_found'); headers.Authorization = 'Bearer ' + session.access_token; }
    let res;
    try { res = await fetch(url + path, {method, headers, body:body === undefined ? undefined : JSON.stringify(body)}); }
    catch { throw fail('network'); }
    const text = await res.text(); let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok){
      const code = (data && (data.error_code || data.code || data.error)) || String(res.status);
      if (res.status === 401 && auth) keep(null);
      throw fail(code, data && (data.msg || data.message || data.error_description) ? '요청을 처리하지 못했어요. (' + String(data.msg || data.message || data.error_description).slice(0, 80) + ')' : undefined);
    }
    return data;
  }
  // 만료 1분 전이면 미리 갱신. 갱신 토큰이 무효면 로그아웃 상태로.
  async function fresh(){
    if (!session || session.expires_at * 1000 - now() > 60000) return;
    try { keep(fromToken(await call('/auth/v1/token?grant_type=refresh_token', {method:'POST', body:{refresh_token:session.refresh_token}}))); }
    catch (e) { if (e.code !== 'network') keep(null); throw e; }
  }
  return {
    user:() => session ? session.user : null,
    async signUp(email, password){
      const data = await call('/auth/v1/signup' + redirect, {method:'POST', body:{email, password}});
      if (data && data.access_token){ keep(fromToken(data)); return {confirm:false}; }
      return {confirm:true};
    },
    async signIn(email, password){ keep(fromToken(await call('/auth/v1/token?grant_type=password', {method:'POST', body:{email, password}}))); return session.user; },
    resend:email => call('/auth/v1/resend' + redirect, {method:'POST', body:{type:'signup', email}}),
    recover:email => call('/auth/v1/recover' + redirect, {method:'POST', body:{email}}),
    async updatePassword(password){ await call('/auth/v1/user', {method:'PUT', body:{password}, auth:true}); },
    async signOut(){ try { if (session) await call('/auth/v1/logout', {method:'POST', auth:true}); } catch { /* 서버 응답과 관계없이 이 기기에서는 로그아웃 */ } keep(null); },
    // 메일 링크(가입 인증·비밀번호 재설정)로 돌아왔을 때 주소의 #access_token=… 을 세션으로 바꾼다.
    handleRedirect(hash){
      const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
      if (p.get('error') || p.get('error_code')) return {error:(MESSAGES[p.get('error_code')] || '링크를 확인하지 못했어요. 다시 시도해 주세요.')};
      const access = p.get('access_token'), refresh = p.get('refresh_token');
      if (!access || !refresh) return null;
      return {pending:{access, refresh, expires_in:p.get('expires_in'), expires_at:p.get('expires_at'), type:p.get('type') || ''}};
    },
    async adopt(pending){
      let res; try { res = await fetch(url + '/auth/v1/user', {headers:{apikey:key, Authorization:'Bearer ' + pending.access}}); } catch { throw fail('network'); }
      if (!res.ok) throw fail('otp_expired');
      const user = await res.json();
      keep(fromToken({access_token:pending.access, refresh_token:pending.refresh, expires_in:pending.expires_in, expires_at:pending.expires_at}, user));
      return pending.type;
    },
    async pull(){
      const rows = await call('/rest/v1/user_state?select=data,updated_at&user_id=eq.' + encodeURIComponent(session.user.id), {auth:true});
      return Array.isArray(rows) && rows[0] ? rows[0] : null;
    },
    async push(snapshot){
      const rows = await call('/rest/v1/user_state?on_conflict=user_id&select=updated_at', {method:'POST', auth:true, prefer:'resolution=merge-duplicates,return=representation', body:{user_id:session.user.id, data:snapshot}});
      return Array.isArray(rows) && rows[0] ? rows[0].updated_at : null;
    },
    async deleteAccount(){ await call('/rest/v1/rpc/delete_my_account', {method:'POST', body:{}, auth:true}); keep(null); },
    meta:() => read(META_KEY),
    setMeta:m => write(META_KEY, m)
  };
}

/* 기록은 서버에만 둔다. 이 기기에는 로그인 상태와 기기 설정만 남는다.
 * 계정별 설정(화면 모드·메뉴 순서)은 기록과 함께 user_state.data.prefs에 저장한다. */
export const ACCOUNT_PREFS = ['theme', 'navOrder'];
export const hasContent = snap => !!snap && (Object.keys(snap.profiles || {}).length > 0 || Object.keys(snap.mine || {}).length > 0 || Object.keys(snap.projects || {}).length > 0);
const parse = text => { try { return text ? JSON.parse(text) : null; } catch { return null; } };
export const pickPrefs = text => { const p = parse(text), out = {}; if (p && typeof p === 'object' && !Array.isArray(p)) for (const k of ACCOUNT_PREFS) if (Object.hasOwn(p, k)) out[k] = p[k]; return out; };
// 서버의 계정 설정을 이 기기 설정 JSON에 덮어쓴다(기기 전용 설정은 그대로).
export function applyPrefs(ls, prefKey, prefs){
  const p = parse(ls.getItem(prefKey)) || {};
  for (const k of ACCOUNT_PREFS){ if (prefs && Object.hasOwn(prefs, k)) p[k] = prefs[k]; else delete p[k]; }
  ls.setItem(prefKey, JSON.stringify(p));
}

/* 로그인 직후 한 번: 서버 기록을 불러온다.
 * 이전 버전이 이 기기에 남긴 기록 사본은 정리한다. 같은 계정의 못 올린 변경이면 먼저 올리고,
 * 로그인 전부터 쓰던 기록인데 서버에도 기록이 있으면 기기 사본을 백업 파일로 내려받아 둔다. */
export async function loadState({cloud, ls, key, backup = () => {}}) {
  const uid = cloud.user().id, meta = cloud.meta(), local = parse(ls.getItem(key));
  let row = await cloud.pull(), notice = '';
  if (local){
    const mine = meta && meta.uid === uid;
    if ((mine && meta.dirty) || (!meta && !row && hasContent(local))){
      const data = {...validateSnapshot(local), prefs:row && row.data ? row.data.prefs : pickPrefs(ls.getItem(key + ':preferences'))};
      row = {data, updated_at:await cloud.push(data)};
    } else if (!meta && row && hasContent(local)){ backup('이 기기', local); notice = '이 기기에 남아 있던 기록은 백업 파일로 내려받았어요'; }
  }
  ls.removeItem(key); cloud.setMeta(null);
  // 기록 없이 설정만 저장된 계정(캐릭터를 만들기 전)은 빈 기록으로 시작한다.
  return {text:row && row.data && row.data.v ? JSON.stringify(validateSnapshot(row.data)) : null, prefs:row && row.data ? row.data.prefs || null : null, at:row ? row.updated_at : null, notice};
}

/* 기록은 메모리에만 두고, 바뀔 때마다 서버로 올린다(1.5초 모아서). 실패하면 다시 시도할 때까지 '저장 안 됨'으로 남는다.
 * 계정 설정(화면 모드·메뉴 순서)이 바뀌어도 함께 올린다. 다른 설정 키는 이 기기에만 저장한다. */
export function createSync({cloud, ls, key, initial = null, at = null, delay = 1500, setTimer = setTimeout, clearTimer = clearTimeout, onState = () => {}}) {
  const prefKey = key + ':preferences';
  let mem = initial, last = at, timer = null, running = null, writes = 0, saved = 0;
  let prefsSeen = JSON.stringify(pickPrefs(ls.getItem(prefKey)));
  const schedule = () => { if (timer) clearTimer(timer); timer = setTimer(() => { timer = null; flush(); }, delay); };
  const mark = () => { writes++; onState('dirty'); schedule(); };
  const prefsChanged = () => { const p = JSON.stringify(pickPrefs(ls.getItem(prefKey))); if (p === prefsSeen) return false; prefsSeen = p; return true; };
  async function flush(){
    if (timer){ clearTimer(timer); timer = null; }
    while (running) await running;
    if (writes === saved || !cloud.user()) return;
    const seen = writes, data = {...(parse(mem) || {}), prefs:pickPrefs(ls.getItem(prefKey))};
    running = (async () => {
      try { onState('saving'); last = await cloud.push(data); saved = seen; onState(writes !== saved ? 'dirty' : 'saved'); if (writes !== saved) schedule(); }
      catch (e) { onState(e && e.code === 'network' ? 'offline' : 'error', e); }
      finally { running = null; }
    })();
    return running;
  }
  return {
    driver:{
      getItem:k => k === key ? mem : ls.getItem(k),
      setItem(k, v){ if (k === key){ mem = String(v); mark(); return; } ls.setItem(k, v); if (k === prefKey && prefsChanged()) mark(); },
      removeItem(k){ if (k === key){ mem = null; mark(); return; } ls.removeItem(k); if (k === prefKey && prefsChanged()) mark(); }
    },
    flush, pending:() => writes !== saved, at:() => last
  };
}
