// GET /api/app/push-msg?endpoint=... — 서비스 워커가 푸시를 받으면 문구를 가져간다.
// 구독 주소(endpoint)는 브라우저만 아는 긴 무작위 주소라 열쇠로 쓴다. 할 일 제목은 보내지 않고 개수만 알려 준다.
import {json, db, kstNow} from '../../../server/app-lib.js';
import {todayItems, streak} from '../../../app/logic.js';
export async function onRequestGet({request, env}) {
  const ep = new URL(request.url).searchParams.get('endpoint') || '';
  if (!/^https:\/\//.test(ep)) return json({skip: true});
  try {
    const sub = (await db(env, `app_push?endpoint=eq.${encodeURIComponent(ep)}&select=user_id,pending&limit=1`) || [])[0];
    if (!sub) return json({skip: true});
    const st = (await db(env, `app_state?user_id=eq.${sub.user_id}&select=data&limit=1`) || [])[0];
    const S = st && st.data, t = kstNow().date;
    if (!S || !S.v) return json({title: '퀘스트라인', body: '오늘의 퀘스트를 확인해 보세요.'});
    const items = todayItems(S, t).filter(i => !i.late), left = items.filter(i => !i.done).length, s = streak(S, t);
    if (sub.pending === 'evening') {
      if (items.length && !left) return json({skip: true}); // 이미 다 끝낸 날은 조용히
      return json({title: left ? `오늘 할 일 ${left}개가 남았어요` : '내일 할 일을 정해 볼까요', body: left ? (s ? `${s}일 연속 기록을 이어 가요.` : '하나만 해도 기록이 이어져요.') : '자기 전에 세 가지만 적어 두면 아침이 가벼워져요.', url: './', tag: 'evening'});
    }
    return json({title: items.length ? `오늘의 퀘스트 ${items.length}개` : '좋은 아침이에요', body: items.length ? '가장 쉬운 것부터 하나 체크해 볼까요?' : '오늘 할 일을 한 줄로 적어 보세요.', url: './', tag: 'morning'});
  } catch { return json({title: '퀘스트라인', body: '오늘의 퀘스트를 확인해 보세요.'}); }
}
