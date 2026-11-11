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

/* 기록 맞추기: 로그인 직후 한 번.
 * - 이 기기 사본이 같은 계정 것이면: 다른 기기에서 바뀐 서버 기록을 받아오거나(알림), 못 올린 변경을 올린다.
 * - 다른 계정의 사본이면: 서버 기록으로 바꾼다(그 계정 기록은 서버에 있다).
 * - 로그인 기능 전부터 쓰던 기록이면: 서버가 비어 있으면 올리고, 양쪽 다 있으면 사용자에게 묻고 고르지 않은 쪽은 백업 파일로 남긴다. */
export const hasContent = snap => !!snap && (Object.keys(snap.profiles || {}).length > 0 || Object.keys(snap.mine || {}).length > 0 || Object.keys(snap.projects || {}).length > 0);
export async function reconcile({cloud, ls, key, ask, backup}) {
  const uid = cloud.user().id, meta = cloud.meta();
  let local = null; try { const t = ls.getItem(key); local = t ? JSON.parse(t) : null; } catch { local = null; }
  const row = await cloud.pull();
  const useServer = () => { if (row) ls.setItem(key, JSON.stringify(validateSnapshot(row.data))); else ls.removeItem(key); cloud.setMeta({uid, syncedAt:row ? row.updated_at : null, dirty:false}); };
  const useLocal = async () => { cloud.setMeta({uid, syncedAt:row ? row.updated_at : null, dirty:true}); const at = await cloud.push(validateSnapshot(local)); cloud.setMeta({uid, syncedAt:at, dirty:false}); };
  if (meta && meta.uid === uid){
    if (meta.dirty && hasContent(local)){ await useLocal(); return {result:'pushed'}; }
    if (row && row.updated_at !== meta.syncedAt){ useServer(); return {result:'pulled', notice:'다른 기기에서 바뀐 기록을 불러왔어요'}; }
    if (!row && hasContent(local)){ await useLocal(); return {result:'pushed'}; }
    return {result:'same'};
  }
  if (meta && meta.uid !== uid){ useServer(); return {result:'switched'}; }
  if (!hasContent(local)){ useServer(); return {result:row ? 'pulled' : 'new'}; }
  if (!row){ await useLocal(); return {result:'uploaded'}; }
  const choice = await ask({local:validateSnapshot(local), server:validateSnapshot(row.data), serverAt:row.updated_at});
  if (choice === 'local'){ backup('서버', row.data); await useLocal(); return {result:'kept-local'}; }
  backup('이 기기', local); useServer(); return {result:'kept-server'};
}

/* 저장할 때마다 서버로 올린다(1.5초 모아서). 실패하면 dirty로 남겨 다음 저장·온라인 복귀·주기 재시도 때 다시 올린다. */
export function createSync({cloud, ls, key, delay = 1500, setTimer = setTimeout, clearTimer = clearTimeout, onState = () => {}}) {
  let timer = null, running = null, writes = 0;
  const meta = () => cloud.meta() || {uid:cloud.user() && cloud.user().id};
  async function flush(){
    if (running) { await running; if (!(cloud.meta() || {}).dirty) return; }
    const text = ls.getItem(key); if (!text || !cloud.user()) return;
    const seen = writes;
    running = (async () => {
      try { onState('saving'); const at = await cloud.push(JSON.parse(text)); const m = meta(); cloud.setMeta({...m, uid:cloud.user().id, syncedAt:at, dirty:writes !== seen}); onState(writes !== seen ? 'dirty' : 'saved'); }
      catch (e) { onState(e && e.code === 'network' ? 'offline' : 'error', e); }
      finally { running = null; }
    })();
    return running;
  }
  return {
    driver:{
      getItem:k => ls.getItem(k),
      removeItem:k => ls.removeItem(k),
      setItem(k, v){ ls.setItem(k, v); if (k !== key || !cloud.user()) return; writes++; cloud.setMeta({...meta(), uid:cloud.user().id, dirty:true});
        if (timer) clearTimer(timer); timer = setTimer(() => { timer = null; flush(); }, delay); }
    },
    flush:async () => { if (timer){ clearTimer(timer); timer = null; } if ((cloud.meta() || {}).dirty) await flush(); },
    pending:() => !!(cloud.meta() || {}).dirty
  };
}
