// GET /api/next/me — 내 구독 상태와 AI 남은 횟수
import {json, err, getUser, one, db, effective, FREE_AI, PASS_AI_PER_DAY} from '../../../server/next-lib.js';
export async function onRequestGet({request, env}) {
  const user = await getUser(request); if (!user) return err(401, 'auth', '로그인이 필요해요.');
  try {
    const ent = await one(env, 'next_entitlements', user.id), e = effective(ent);
    const rows = await db(env, `next_ai_usage?user_id=eq.${user.id}&select=day,count`) || [];
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), total = rows.reduce((s, r) => s + r.count, 0), todayN = (rows.find(r => r.day === today) || {}).count || 0;
    return json({...e, trialUsed: !!(ent && ent.trial_used), canceled: !!(ent && ent.status === 'canceled'), ai: e.plan === 'pass' ? {left: Math.max(0, PASS_AI_PER_DAY - todayN), per: 'day'} : {left: Math.max(0, FREE_AI - total), per: 'total'}});
  } catch (e) { return err(503, e.code || 'server', '구독 정보를 불러오지 못했어요.'); }
}
