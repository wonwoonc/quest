/* 퀘스트라인 서버 공통 함수 (Cloudflare Pages Functions에서 import).
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
export const payId = (uid, tag) => `ql-${tag}-${uid.slice(0, 8)}-${Date.now().toString(36)}`;

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

/* ── 웹 푸시(VAPID). 내용 없이 '깨우기'만 보내고, 문구는 서비스 워커가 /api/app/push-msg 로 받아 간다.
 *   VAPID_PUBLIC_KEY   공개키(base64url, 65바이트 비압축 점)
 *   VAPID_PRIVATE_KEY  개인키(base64url, 32바이트 d)
 *   VAPID_SUBJECT      (선택) mailto:운영자메일
 *   PUSH_CRON_SECRET   예약 발송을 부르는 쪽(Supabase cron)과 맞춘 임의 문자열 */
const b64u = {
  dec: s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0)),
  enc: u => btoa(String.fromCharCode(...new Uint8Array(u))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
};
export { b64u };
let vkey = null;
async function vapidKey(env) {
  if (vkey) return vkey;
  const pub = b64u.dec(env.VAPID_PUBLIC_KEY);
  const jwk = {kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE_KEY, x: b64u.enc(pub.slice(1, 33)), y: b64u.enc(pub.slice(33, 65)), ext: true};
  vkey = await crypto.subtle.importKey('jwk', jwk, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign']);
  return vkey;
}
export async function vapidAuth(env, endpoint, now = Date.now()) {
  const aud = new URL(endpoint).origin, enc = o => b64u.enc(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = enc({typ: 'JWT', alg: 'ES256'}) + '.' + enc({aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:wonwoonc10@gmail.com'});
  const sig = await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, await vapidKey(env), new TextEncoder().encode(unsigned));
  return `vapid t=${unsigned}.${b64u.enc(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}
/* 돌려주는 값: 'ok' | 'gone'(구독이 사라짐 → 지운다) | 'fail' */
export async function sendPush(env, endpoint) {
  try {
    const r = await fetch(endpoint, {method: 'POST', headers: {Authorization: await vapidAuth(env, endpoint), TTL: '3600', Urgency: 'normal', 'Content-Length': '0'}});
    return r.ok ? 'ok' : (r.status === 404 || r.status === 410) ? 'gone' : 'fail';
  } catch { return 'fail'; }
}
/* 한국 시각 'HH:MM'이 지금부터 window분 안쪽(이전)인지 */
export function dueNow(hhmm, nowMin, window = 10) { if (!/^\d{2}:\d{2}$/.test(hhmm || '')) return false; const [h, m] = hhmm.split(':').map(Number), t = h * 60 + m; return t <= nowMin && nowMin - t < window; }
export const kstNow = (now = Date.now()) => { const d = new Date(now + 9 * 3600e3); return {date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes()}; };
