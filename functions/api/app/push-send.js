// POST /api/app/push-send — 10분마다 Supabase cron이 부른다(헤더 x-cron-secret).
// 아침 알림 시각(remindAt)·저녁 알림 시각(eveningAt)이 된 사람에게 '깨우기' 푸시를 보낸다. 하루에 종류별 한 번.
import {json, err, db, sendPush, dueNow, kstNow} from '../../../server/app-lib.js';
export async function onRequestPost({request, env}) {
  if (!env.PUSH_CRON_SECRET || request.headers.get('x-cron-secret') !== env.PUSH_CRON_SECRET) return err(401, 'auth', 'no');
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return err(503, 'not_configured', 'VAPID 키가 없어요.');
  const {date, min} = kstNow();
  const subs = await db(env, 'app_push?select=endpoint,user_id,last_kind,last_date&limit=5000') || [];
  const users = [...new Set(subs.map(s => s.user_id))];
  const prof = {};
  for (let i = 0; i < users.length; i += 100) {
    const rows = await db(env, `app_state?user_id=in.(${users.slice(i, i + 100).join(',')})&select=user_id,profile:data->profile`) || [];
    rows.forEach(r => prof[r.user_id] = r.profile || {});
  }
  let sent = 0, gone = 0;
  for (const s of subs) {
    const p = prof[s.user_id]; if (!p) continue;
    const kind = dueNow(p.remindAt || '08:30', min) ? 'morning' : dueNow(p.eveningAt || '21:30', min) ? 'evening' : null;
    if (!kind || (s.last_date === date && (s.last_kind === kind || s.last_kind === 'both'))) continue;
    const r = await sendPush(env, s.endpoint);
    if (r === 'gone') { gone++; await db(env, `app_push?endpoint=eq.${encodeURIComponent(s.endpoint)}`, {method: 'DELETE'}); continue; }
    if (r === 'ok') { sent++; const lk = s.last_date === date && s.last_kind && s.last_kind !== kind ? 'both' : kind; await db(env, `app_push?endpoint=eq.${encodeURIComponent(s.endpoint)}`, {method: 'PATCH', body: {last_kind: lk, last_date: date, pending: kind}}); }
  }
  return json({ok: true, sent, gone});
}
