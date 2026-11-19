/* 퀘스트라인 넥스트 서버 공통 함수 (Cloudflare Pages Functions에서 import).
 * 비밀 값은 모두 Cloudflare 환경 변수로만 받는다. 코드에 넣지 않는다.
 *   SUPABASE_SERVICE_ROLE_KEY  Supabase 서버 키 (구독 권한 기록용)
 *   PORTONE_API_SECRET         포트원 V2 API Secret
 *   PORTONE_STORE_ID           포트원 상점 아이디 (공개 값)
 *   PORTONE_CHANNEL_KEY        정기결제 채널 키 (공개 값)
 *   PORTONE_WEBHOOK_SECRET     포트원 웹훅 시크릿 (whsec_...)
 *   ANTHROPIC_API_KEY          AI 퀘스트 마스터용 Claude API 키
 *   AI_MODEL                   (선택) 기본 claude-haiku-5-5
 */
export const SUPABASE_URL = 'https://rqoghflmyxpoqrhydgce.supabase.co';
export const SUPABASE_ANON = 'sb_publishable_h7gy3dkAhaZVUWKQ0ZV56w_WBS5vaKY';
export const PLANS = {
  month: {price: 7900, name: '퀘스트 패스 (월간)', days: 0, months: 1},
  year: {price: 49000, name: '퀘스트 패스 (연간)', days: 0, months: 12},
};
export const TRIAL_DAYS = 7;
export const FREE_AI = 1;          // 무료 계정 평생 AI 사용 횟수
export const PASS_AI_PER_DAY = 20; // 패스 계정 하루 한도(비용 보호)

export const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}});
export const err = (status, code, message) => json({error: code, message}, status);

// 요청한 사람이 누구인지: 앱이 보낸 로그인 토큰을 Supabase에 물어 확인한다.
export async function getUser(request) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', {headers: {apikey: SUPABASE_ANON, Authorization: auth}});
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? {id: u.id, email: u.email || ''} : null;
}

// 서버 키로 Supabase REST 호출 (RLS를 넘는다: 서버 함수에서만 사용)
export async function db(env, path, {method = 'GET', body, prefer} = {}) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw Object.assign(new Error('SUPABASE_SERVICE_ROLE_KEY 미설정'), {code: 'not_configured'});
  const headers = {apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json'};
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)});
  const t = await r.text();
  if (!r.ok) throw Object.assign(new Error('db ' + r.status + ' ' + t.slice(0, 200)), {code: 'db'});
  return t ? JSON.parse(t) : null;
}
export const upsert = (env, table, row) => db(env, table, {method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=representation'});
export async function one(env, table, userId) { const r = await db(env, `${table}?user_id=eq.${userId}&limit=1`); return r && r[0] || null; }

// 포트원 V2 REST
export async function portone(env, path, {method = 'GET', body} = {}) {
  if (!env.PORTONE_API_SECRET) throw Object.assign(new Error('PORTONE_API_SECRET 미설정'), {code: 'not_configured'});
  const r = await fetch('https://api.portone.io' + path, {method, headers: {Authorization: 'PortOne ' + env.PORTONE_API_SECRET, 'Content-Type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
  const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch { d = null; }
  if (!r.ok) throw Object.assign(new Error((d && d.message) || 'portone ' + r.status), {code: (d && d.type) || 'portone', status: r.status});
  return d;
}

export const addPeriod = (from, interval) => { const d = new Date(from); if (interval === 'year') d.setUTCFullYear(d.getUTCFullYear() + 1); else d.setUTCMonth(d.getUTCMonth() + 1); return d; };
export const payId = (uid, tag) => `qn-${tag}-${uid.slice(0, 8)}-${Date.now().toString(36)}`;

// 다음 결제를 예약한다(빌링키 + 시각). customData에 누구·어떤 주기인지 남겨 웹훅에서 쓴다.
export async function scheduleNext(env, {userId, email, billingKey, interval, at}) {
  const plan = PLANS[interval], paymentId = payId(userId, 'r');
  const r = await portone(env, `/payments/${encodeURIComponent(paymentId)}/schedule`, {method: 'POST', body: {
    payment: {storeId: env.PORTONE_STORE_ID, billingKey, channelKey: env.PORTONE_CHANNEL_KEY, orderName: plan.name,
      customer: {id: userId, email: email || undefined}, customData: JSON.stringify({uid: userId, interval}),
      amount: {total: plan.price}, currency: 'KRW'},
    timeToPay: new Date(at).toISOString(),
  }});
  return (r && r.schedule && r.schedule.id) || null;
}

// 웹훅 서명 확인(Standard Webhooks 방식: webhook-id.timestamp.body 를 HMAC-SHA256, 'v1,<base64>')
export async function verifyWebhook(secret, payload, headers) {
  const id = headers.get('webhook-id'), ts = headers.get('webhook-timestamp'), sig = headers.get('webhook-signature');
  if (!id || !ts || !sig) return null;
  const now = Math.floor(Date.now() / 1000), t = parseInt(ts, 10);
  if (!Number.isFinite(t) || Math.abs(now - t) > 300) return null;
  const raw = Uint8Array.from(atob(secret.startsWith('whsec_') ? secret.slice(6) : secret), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${payload}`)));
  for (const part of sig.split(' ')) {
    const [v, b64] = part.split(',');
    if (v !== 'v1' || !b64) continue;
    let given; try { given = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); } catch { continue; }
    if (given.length !== mac.length) continue;
    let diff = 0; for (let i = 0; i < mac.length; i++) diff |= mac[i] ^ given[i];
    if (diff === 0) { try { return JSON.parse(payload); } catch { return null; } }
  }
  return null;
}

// 현재 권한(만료 지난 패스는 무료로 본다)
export function effective(ent, now = Date.now()) {
  if (!ent || ent.plan !== 'pass' || !ent.period_end) return {plan: 'free', status: ent ? ent.status : 'none'};
  const end = new Date(ent.period_end).getTime(), grace = ent.status === 'past_due' ? 3 * 864e5 : 0;
  return end + grace > now ? {plan: 'pass', status: ent.status, period_end: ent.period_end, interval: ent.interval} : {plan: 'free', status: 'expired'};
}
