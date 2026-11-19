// POST /api/app/webhook — 포트원 웹훅. 예약 결제가 성공하면 기간을 늘리고 다음 결제를 예약한다.
// 포트원 관리자 콘솔 → 결제 연동 → 웹훅에 https://<도메인>/api/app/webhook 등록, 시크릿은 PORTONE_WEBHOOK_SECRET.
import {json, one, upsert, db, portone, scheduleNext, addPeriod, verifyWebhook, PLANS} from '../../../server/app-lib.js';
export async function onRequestPost({request, env}) {
  if (!env.PORTONE_WEBHOOK_SECRET) return json({error: 'not_configured'}, 503);
  const raw = await request.text();
  const hook = await verifyWebhook(env.PORTONE_WEBHOOK_SECRET, raw, request.headers);
  if (!hook) return json({error: 'signature'}, 400);
  const type = hook.type || '', pid = hook.data && hook.data.paymentId;
  if (!pid || !/^Transaction\.(Paid|Failed)$/.test(type)) return json({ok: true, ignored: type});
  try {
    // 웹훅 내용은 믿지 않고 포트원에 직접 다시 묻는다
    const pay = await portone(env, `/payments/${encodeURIComponent(pid)}?storeId=${encodeURIComponent(env.PORTONE_STORE_ID || '')}`);
    let meta = {}; try { meta = JSON.parse(pay.customData || '{}'); } catch { meta = {}; }
    const uid = meta.uid || (pay.customer && pay.customer.id), interval = meta.interval, plan = PLANS[interval];
    if (!uid || !plan) return json({ok: true, ignored: 'unknown_payment'});
    const prev = (await db(env, `app_payments?payment_id=eq.${encodeURIComponent(pid)}&limit=1`) || [])[0];
    if (prev && prev.status === pay.status) return json({ok: true, duplicate: true});
    const ent = await one(env, 'app_entitlements', uid), bill = await one(env, 'app_billing', uid), now = Date.now();
    if (pay.status === 'PAID' && pay.amount && pay.amount.total === plan.price) {
      await upsert(env, 'app_payments', {payment_id: pid, user_id: uid, amount: plan.price, interval, status: 'PAID', paid_at: pay.paidAt || new Date().toISOString()});
      const base = ent && ent.period_end ? Math.max(now, new Date(ent.period_end).getTime()) : now, end = addPeriod(base, interval);
      let sid = null;
      if (bill && !(ent && ent.status === 'canceled')) sid = await scheduleNext(env, {userId: uid, email: pay.customer && pay.customer.email, billingKey: bill.billing_key, interval, at: end});
      if (bill) await upsert(env, 'app_billing', {user_id: uid, billing_key: bill.billing_key, schedule_id: sid, updated_at: new Date().toISOString()});
      await upsert(env, 'app_entitlements', {user_id: uid, plan: 'pass', status: ent && ent.status === 'canceled' ? 'canceled' : 'active', interval, price: plan.price, period_end: end.toISOString(), updated_at: new Date().toISOString()});
    } else if (pay.status === 'FAILED') {
      await upsert(env, 'app_payments', {payment_id: pid, user_id: uid, amount: plan.price, interval, status: 'FAILED'});
      if (ent && ent.status !== 'past_due' && bill) { // 하루 뒤 한 번 더 시도, 그 사이 3일 유예
        const sid = await scheduleNext(env, {userId: uid, billingKey: bill.billing_key, interval, at: now + 864e5});
        await upsert(env, 'app_billing', {user_id: uid, billing_key: bill.billing_key, schedule_id: sid, updated_at: new Date().toISOString()});
        await upsert(env, 'app_entitlements', {user_id: uid, status: 'past_due', updated_at: new Date().toISOString()});
      } else await upsert(env, 'app_entitlements', {user_id: uid, plan: 'free', status: 'expired', updated_at: new Date().toISOString()});
    }
    return json({ok: true});
  } catch (e) { return json({error: e.code || 'server'}, 500); } // 500이면 포트원이 다시 보낸다
}
