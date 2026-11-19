// POST /api/next/cancel — 다음 결제 예약을 취소한다. 이미 낸 기간이 끝날 때까지는 패스가 유지된다.
import {json, err, getUser, one, upsert, db, portone} from '../../../server/next-lib.js';
export async function onRequestPost({request, env}) {
  const user = await getUser(request); if (!user) return err(401, 'auth', '로그인이 필요해요.');
  try {
    const bill = await one(env, 'next_billing', user.id), ent = await one(env, 'next_entitlements', user.id);
    if (bill) {
      try { await portone(env, `/payment-schedules?requestBody=${encodeURIComponent(JSON.stringify({storeId: env.PORTONE_STORE_ID, billingKey: bill.billing_key}))}`, {method: 'DELETE'}); } catch { /* 예약이 없으면 무시 */ }
      try { await portone(env, `/billing-keys/${encodeURIComponent(bill.billing_key)}?storeId=${encodeURIComponent(env.PORTONE_STORE_ID || '')}`, {method: 'DELETE'}); } catch { /* 이미 삭제됨 */ }
      await db(env, `next_billing?user_id=eq.${user.id}`, {method: 'DELETE'});
    }
    if (ent && ent.plan === 'pass') await upsert(env, 'next_entitlements', {user_id: user.id, status: 'canceled', canceled_at: new Date().toISOString(), updated_at: new Date().toISOString()});
    return json({ok: true, period_end: ent && ent.period_end});
  } catch (e) { return err(502, e.code || 'server', '해지를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
}
