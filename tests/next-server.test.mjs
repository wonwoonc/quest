import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyWebhook, effective, addPeriod} from '../server/next-lib.js';

const secretRaw = new Uint8Array(32).map((_, i) => i + 1), secret = 'whsec_' + btoa(String.fromCharCode(...secretRaw));
async function sign(id, ts, body){ const k = await crypto.subtle.importKey('raw', secretRaw, {name:'HMAC', hash:'SHA-256'}, false, ['sign']); const m = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${id}.${ts}.${body}`))); return 'v1,' + btoa(String.fromCharCode(...m)); }
test('next webhook: accepts a valid PortOne signature and rejects tampering/old timestamps', async () => {
  const body = JSON.stringify({type:'Transaction.Paid', data:{paymentId:'qn-r-1'}}), ts = String(Math.floor(Date.now() / 1000));
  const h = new Headers({'webhook-id':'msg_1', 'webhook-timestamp':ts, 'webhook-signature':await sign('msg_1', ts, body)});
  assert.equal((await verifyWebhook(secret, body, h)).data.paymentId, 'qn-r-1');
  assert.equal(await verifyWebhook(secret, body.replace('qn-r-1', 'qn-r-2'), h), null);
  const old = String(Math.floor(Date.now() / 1000) - 600);
  assert.equal(await verifyWebhook(secret, body, new Headers({'webhook-id':'msg_1', 'webhook-timestamp':old, 'webhook-signature':await sign('msg_1', old, body)})), null);
});
test('next entitlement: pass until period end (+3 days grace when past due)', () => {
  const now = Date.parse('2026-11-19T00:00:00Z');
  assert.equal(effective(null, now).plan, 'free');
  assert.equal(effective({plan:'pass', status:'active', period_end:'2026-11-20T00:00:00Z'}, now).plan, 'pass');
  assert.equal(effective({plan:'pass', status:'active', period_end:'2026-11-18T00:00:00Z'}, now).plan, 'free');
  assert.equal(effective({plan:'pass', status:'past_due', period_end:'2026-11-17T00:00:00Z'}, now).plan, 'pass');
  assert.equal(addPeriod(Date.parse('2026-01-31T00:00:00Z'), 'year').toISOString().slice(0, 10), '2027-01-31');
});
test('next subscribe: yearly first purchase starts a 7-day trial and schedules the first charge', async () => {
  const calls = [], rows = {};
  globalThis.fetch = async (url, opt = {}) => { const u = String(url), m = opt.method || 'GET'; calls.push([m, u, opt.body ? JSON.parse(opt.body) : null]);
    const ok = d => new Response(JSON.stringify(d), {status:200});
    if (u.endsWith('/auth/v1/user')) return ok({id:'11111111-aaaa', email:'a@b.c'});
    if (u.includes('/billing-keys/')) return ok({status:'ISSUED', customer:{id:'11111111-aaaa'}});
    if (u.includes('/rest/v1/') && m === 'GET') return ok([]);
    if (u.includes('/rest/v1/') && m === 'POST') { const b = JSON.parse(opt.body); rows[u.split('/rest/v1/')[1]] = b; return ok([b]); }
    if (u.includes('/schedule')) return ok({schedule:{id:'sch_1'}});
    return new Response('{}', {status:404}); };
  const {onRequestPost} = await import('../functions/api/next/subscribe.js');
  const env = {SUPABASE_SERVICE_ROLE_KEY:'srk', PORTONE_API_SECRET:'sec', PORTONE_STORE_ID:'store-1', PORTONE_CHANNEL_KEY:'ch-1'};
  const res = await onRequestPost({request:new Request('https://x/api/next/subscribe', {method:'POST', headers:{Authorization:'Bearer tok'}, body:JSON.stringify({billingKey:'billing-key-123', interval:'year'})}), env});
  const d = await res.json(); assert.equal(res.status, 200); assert.equal(d.trial, true);
  const sch = calls.find(c => c[1].includes('/schedule')); assert.equal(sch[2].payment.amount.total, 49000); assert.equal(sch[2].payment.billingKey, 'billing-key-123');
  assert.ok(Date.parse(sch[2].timeToPay) - Date.now() > 6.9 * 864e5, 'first charge after 7 days');
  assert.equal(rows.next_entitlements.status, 'trialing'); assert.equal(rows.next_entitlements.trial_used, true);
  assert.ok(!calls.some(c => c[1].includes('/billing-key') && c[0] === 'POST' && !c[1].includes('/billing-keys/')), 'no immediate charge during trial');
});
test('next subscribe: rejects a billing key issued to someone else', async () => {
  globalThis.fetch = async (url) => { const u = String(url); const ok = d => new Response(JSON.stringify(d), {status:200});
    if (u.endsWith('/auth/v1/user')) return ok({id:'me'}); if (u.includes('/billing-keys/')) return ok({customer:{id:'someone-else'}}); return ok([]); };
  const {onRequestPost} = await import('../functions/api/next/subscribe.js');
  const res = await onRequestPost({request:new Request('https://x', {method:'POST', headers:{Authorization:'Bearer t'}, body:JSON.stringify({billingKey:'billing-key-xyz', interval:'month'})}), env:{SUPABASE_SERVICE_ROLE_KEY:'k', PORTONE_API_SECRET:'s'}});
  assert.equal(res.status, 403);
});
