/* 퀘스트라인 넥스트: 로그인(Supabase Auth)과 서버 저장, 서버 함수 호출.
 * 공개용 키(publishable)만 들어간다. 데이터 보호는 서버의 행 단위 보안(RLS)이 맡는다. */
export const URL0 = "https://rqoghflmyxpoqrhydgce.supabase.co";
export const KEY = "sb_publishable_h7gy3dkAhaZVUWKQ0ZV56w_WBS5vaKY";
const SK = "qn:session";
const MSG = {
  invalid_credentials:"이메일 또는 비밀번호가 맞지 않아요.", email_not_confirmed:"아직 이메일 인증을 하지 않았어요. 받은 메일의 링크를 눌러 주세요.",
  user_already_exists:"이미 가입된 이메일이에요. 로그인해 주세요.", email_exists:"이미 가입된 이메일이에요. 로그인해 주세요.",
  weak_password:"비밀번호가 너무 쉬워요. 8자 이상으로 정해 주세요.", email_address_invalid:"이메일 주소를 다시 확인해 주세요.",
  over_email_send_rate_limit:"메일을 너무 자주 보냈어요. 잠시 후 다시 시도해 주세요.", over_request_rate_limit:"요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  same_password:"지금 쓰는 비밀번호와 달라야 해요.", network:"서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.", session_not_found:"로그인이 만료됐어요. 다시 로그인해 주세요."
};
const fail = (code, fb) => Object.assign(new Error(MSG[code] || fb || "잠시 후 다시 시도해 주세요."), {code});
const ls = {get(k){ try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (_) { return null; } }, set(k, v){ try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }};

let session = ls.get(SK);
if (!session || !session.access_token || !session.user) session = null;
const keep = s => { session = s; ls.set(SK, s); };
const fromToken = d => ({access_token:d.access_token, refresh_token:d.refresh_token, expires_at:Number(d.expires_at) || Math.floor(Date.now() / 1000) + (Number(d.expires_in) || 3600), user:{id:d.user ? d.user.id : (session && session.user.id), email:d.user ? d.user.email || "" : (session && session.user.email) || ""}});
export const site = () => location.origin + location.pathname.replace(/[^/]*$/, "");

async function call(path, {method = "GET", body, auth = false, prefer} = {}){
  const headers = {apikey:KEY};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  if (auth){ await fresh(); if (!session) throw fail("session_not_found"); headers.Authorization = "Bearer " + session.access_token; }
  let r; try { r = await fetch(URL0 + path, {method, headers, body:body === undefined ? undefined : JSON.stringify(body)}); } catch (_) { throw fail("network"); }
  const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch (_) { d = null; }
  if (!r.ok){ const code = (d && (d.error_code || d.code || d.error)) || String(r.status); if (r.status === 401 && auth) keep(null); throw fail(code, d && (d.msg || d.message || d.error_description)); }
  return d;
}
async function fresh(){
  if (!session) return;
  if (session.expires_at - 60 > Date.now() / 1000) return;
  try { const d = await call("/auth/v1/token?grant_type=refresh_token", {method:"POST", body:{refresh_token:session.refresh_token}}); keep(fromToken(d)); }
  catch (e) { if (e.code !== "network") keep(null); }
}

export const auth = {
  get user(){ return session && session.user; },
  async token(){ await fresh(); return session && session.access_token; },
  async signUp(email, password){ const d = await call(`/auth/v1/signup?redirect_to=${encodeURIComponent(site())}`, {method:"POST", body:{email, password}}); if (d && d.access_token){ keep(fromToken(d)); return {session:true}; } return {confirm:true}; },
  async signIn(email, password){ const d = await call("/auth/v1/token?grant_type=password", {method:"POST", body:{email, password}}); keep(fromToken(d)); },
  async recover(email){ await call(`/auth/v1/recover?redirect_to=${encodeURIComponent(site())}`, {method:"POST", body:{email}}); },
  async setPassword(password){ await call("/auth/v1/user", {method:"PUT", body:{password}, auth:true}); },
  oauthUrl(provider){ return `${URL0}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(site())}`; },
  async signOut(){ try { await call("/auth/v1/logout", {method:"POST", auth:true}); } catch (_) {} keep(null); },
  /* 메일 링크·소셜 로그인 후 주소창 #access_token=... 를 읽어 로그인 상태로. type=recovery면 비밀번호 재설정 화면 */
  async fromRedirect(){
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get("error_description")){ const m = h.get("error_description"); history.replaceState(null, "", location.pathname + location.search); return {error:m}; }
    if (!h.get("access_token")) return null;
    const d = {access_token:h.get("access_token"), refresh_token:h.get("refresh_token"), expires_in:h.get("expires_in"), expires_at:h.get("expires_at")};
    session = {...fromToken(d), user:{id:"", email:""}};
    try { const u = await fetch(URL0 + "/auth/v1/user", {headers:{apikey:KEY, Authorization:"Bearer " + d.access_token}}).then(r => r.json()); session.user = {id:u.id, email:u.email || ""}; keep(session); }
    catch (_) { keep(null); }
    history.replaceState(null, "", location.pathname + location.search);
    return {type:h.get("type") || "login"};
  },
  async deleteAccount(){ await call("/rest/v1/rpc/delete_my_account", {method:"POST", body:{}, auth:true}); keep(null); }
};

export const store = {
  async load(){ const u = auth.user; const r = await call(`/rest/v1/next_state?user_id=eq.${u.id}&select=data,updated_at`, {auth:true}); return r && r[0] ? r[0].data : null; },
  async save(data){ const u = auth.user; await call("/rest/v1/next_state", {method:"POST", body:{user_id:u.id, data}, auth:true, prefer:"resolution=merge-duplicates,return=minimal"}); },
  async entitlement(){ const u = auth.user; const r = await call(`/rest/v1/next_entitlements?user_id=eq.${u.id}&select=*`, {auth:true}); return r && r[0] || null; },
  async payments(){ const u = auth.user; return await call(`/rest/v1/next_payments?user_id=eq.${u.id}&select=payment_id,amount,interval,status,paid_at,created_at&order=created_at.desc&limit=20`, {auth:true}) || []; },
  event(name){ const u = auth.user; if (!u) return; call("/rest/v1/next_events", {method:"POST", body:{user_id:u.id, name:String(name).slice(0, 40)}, auth:true, prefer:"return=minimal"}).catch(() => {}); }
};

/* 같은 사이트의 서버 함수(/api/next/...) */
export async function api(path, body){
  const tk = await auth.token();
  let r; try { r = await fetch("/api/next/" + path, {method:body === undefined ? "GET" : "POST", headers:{"Content-Type":"application/json", ...(tk ? {Authorization:"Bearer " + tk} : {})}, body:body === undefined ? undefined : JSON.stringify(body)}); }
  catch (_) { throw fail("network"); }
  let d = null; try { d = await r.json(); } catch (_) { d = null; }
  if (!r.ok) throw Object.assign(new Error((d && d.message) || "잠시 후 다시 시도해 주세요."), {code:(d && d.error) || String(r.status), status:r.status});
  return d;
}
