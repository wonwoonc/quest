// POST /api/app/subscribe {billingKey, interval:'month'|'year'}
// 연간 첫 구독은 7일 무료 체험(첫 결제를 7일 뒤로 예약), 그 밖에는 바로 결제하고 다음 결제를 예약한다.
import {json, err, getUser, one, upsert, db, portone, scheduleNext, addPeriod, payId, PLANS, TRIAL_DAYS} from '../../../server/app-lib.js';
export async function onRequestPost({request, env}) {
  const user = await getUser(request); if (!user) return err(401, 'auth', '로그인이 필요해요.');
  let body; try { body = await request.json(); } catch { return err(400, 'bad', '요청 형식이 잘못됐어요.'); }
  const {billingKey, interval} = body || {}; const plan = PLANS[interval];
  if (!plan || typeof billingKey !== 'string' || billingKey.length < 8) return err(400, 'bad', '결제 정보가 올바르지 않아요.');
  try {
    // 빌링키가 이 사람 것인지 확인(다른 사람 카드로 구독하는 것을 막는다)
    const bk = await portone(env, `/billing-keys/${encodeURIComponent(billingKey)}?storeId=${encodeURIComponent(env.PORTONE_STORE_ID || '')}`);
    const owner = bk && bk.customer && bk.customer.id;
    if (owner && owner !== user.id) return err(403, 'owner', '이 결제 수단은 다른 계정의 것이에요.');
    const now = Date.now(), ent = await one(env, 'app_entitlements', user.id);
    const liveEnd = ent && ent.period_end && new Date(ent.period_end).getTime() > now ? new Date(ent.period_end).getTime() : 0;
    if (ent && ent.plan === 'pass' && liveEnd && ent.status !== 'canceled') return json({ok: true, already: true});
    const old = await one(env, 'app_billing', user.id);
    if (old && old.billing_key !== billingKey) { try { await portone(env, `/payment-schedules?requestBody=${encodeURIComponent(JSON.stringify({storeId: env.PORTONE_STORE_ID, billingKey: old.billing_key}))}`, {method: 'DELETE'}); } catch { /* 예약이 없으면 무시 */ } }

    // ① 해지했지만 기간이 남은 경우: 지금 결제하지 않고 기간 끝에 다음 결제만 예약
    if (liveEnd && ent.status === 'canceled') {
      const sid = await scheduleNext(env, {userId: user.id, email: user.email, billingKey, interval, at: liveEnd});
      await upsert(env, 'app_billing', {user_id: user.id, billing_key: billingKey, schedule_id: sid, updated_at: new Date().toISOString()});
      await upsert(env, 'app_entitlements', {user_id: user.id, plan: 'pass', status: 'active', interval, price: plan.price, canceled_at: null, updated_at: new Date().toISOString()});
      return json({ok: true, resumed: true, period_end: new Date(liveEnd).toISOString()});
    }
    // ② 연간 첫 구독: 무료 체험
    if (interval === 'year' && !(ent && ent.trial_used)) {
      const end = new Date(now + TRIAL_DAYS * 864e5);
      const sid = await scheduleNext(env, {userId: user.id, email: user.email, billingKey, interval, at: end});
      await upsert(env, 'app_billing', {user_id: user.id, billing_key: billingKey, schedule_id: sid, updated_at: new Date().toISOString()});
      await upsert(env, 'app_entitlements', {user_id: user.id, plan: 'pass', status: 'trialing', interval, price: plan.price, period_end: end.toISOString(), trial_used: true, canceled_at: null, updated_at: new Date().toISOString()});
      return json({ok: true, trial: true, period_end: end.toISOString()});
    }
    // ③ 바로 결제
    const pid = payId(user.id, 'f');
    await portone(env, `/payments/${encodeURIComponent(pid)}/billing-key`, {method: 'POST', body: {storeId: env.PORTONE_STORE_ID, billingKey, channelKey: env.PORTONE_CHANNEL_KEY, orderName: plan.name,
      customer: {id: user.id, email: user.email || undefined}, customData: JSON.stringify({uid: user.id, interval}), amount: {total: plan.price}, currency: 'KRW'}});
    const pay = await portone(env, `/payments/${encodeURIComponent(pid)}?storeId=${encodeURIComponent(env.PORTONE_STORE_ID || '')}`);
    if (!pay || pay.status !== 'PAID' || !pay.amount || pay.amount.total !== plan.price) {
      await upsert(env, 'app_payments', {payment_id: pid, user_id: user.id, amount: plan.price, interval, status: (pay && pay.status) || 'FAILED'});
      return err(402, 'pay_failed', '결제가 승인되지 않았어요. 카드 정보를 확인해 주세요.');
    }
    const end = addPeriod(Math.max(now, liveEnd), interval);
    await upsert(env, 'app_payments', {payment_id: pid, user_id: user.id, amount: plan.price, interval, status: 'PAID', paid_at: pay.paidAt || new Date().toISOString()});
    const sid = await scheduleNext(env, {userId: user.id, email: user.email, billingKey, interval, at: end});
    await upsert(env, 'app_billing', {user_id: user.id, billing_key: billingKey, schedule_id: sid, updated_at: new Date().toISOString()});
    await upsert(env, 'app_entitlements', {user_id: user.id, plan: 'pass', status: 'active', interval, price: plan.price, period_end: end.toISOString(), canceled_at: null, updated_at: new Date().toISOString()});
    return json({ok: true, paid: true, period_end: end.toISOString()});
  } catch (e) {
    if (e.code === 'not_configured') return err(503, 'not_configured', '결제 준비가 아직 끝나지 않았어요.');
    return err(502, e.code || 'server', '결제를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
}
