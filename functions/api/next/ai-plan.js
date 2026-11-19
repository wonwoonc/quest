// POST /api/next/ai-plan {goal, deadline, hours, now, today} — AI 퀘스트 마스터. 무료는 평생 1회, 패스는 하루 20회.
import {json, err, getUser, one, db, upsert, effective, FREE_AI, PASS_AI_PER_DAY} from '../../../server/next-lib.js';
const clip = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const okD = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : '', okT = s => /^\d{2}:\d{2}$/.test(s || '') ? s : '';
const AREAS = ['health', 'money', 'career', 'social', 'growth'];
export async function onRequestPost({request, env}) {
  const user = await getUser(request); if (!user) return err(401, 'auth', '로그인이 필요해요.');
  if (!env.ANTHROPIC_API_KEY) return err(503, 'not_configured', 'AI가 아직 준비되지 않았어요.');
  let b; try { b = await request.json(); } catch { return err(400, 'bad', '요청 형식이 잘못됐어요.'); }
  const goal = clip(b.goal, 120); if (goal.length < 2) return err(400, 'bad', '목표를 적어 주세요.');
  const kst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), today = okD(b.today) || kst;
  try {
    const e = effective(await one(env, 'next_entitlements', user.id));
    const rows = await db(env, `next_ai_usage?user_id=eq.${user.id}&select=day,count`) || [];
    const total = rows.reduce((s, r) => s + r.count, 0), todayN = (rows.find(r => r.day === kst) || {}).count || 0;
    if (e.plan !== 'pass' && total >= FREE_AI) return err(402, 'need_pass', 'AI 퀘스트 마스터 무료 체험을 다 썼어요.');
    if (e.plan === 'pass' && todayN >= PASS_AI_PER_DAY) return err(429, 'limit', '오늘은 AI를 충분히 썼어요. 내일 다시 써 주세요.');
    const wd = '일월화수목금토'[new Date(today + 'T00:00:00Z').getUTCDay()];
    const prompt = `너는 자기계발 앱의 '퀘스트 마스터'야. 사용자의 큰 목표를 게임 퀘스트처럼 쪼개 줘.
오늘 날짜: ${today} (${wd}요일)
목표: ${goal}
마감: ${okD(b.deadline) || '정하지 않음 (1~4개월 사이로 적당히 정해 줘)'}
현재 상태: ${clip(b.now, 160) || '모름'}
하루에 쓸 수 있는 시간: ${clip(b.hours, 20) || '모름'}

규칙:
- stages는 3~4개. 순서대로 이어지고 각 due는 YYYY-MM-DD, 마지막 due가 마감.
- habits는 1~2개. 반복할 작은 행동. days는 0(일)~6(토) 숫자 배열, time은 HH:MM 또는 "".
- missions는 오늘부터 6일 안에 할 일 3~5개. 한 번에 끝낼 수 있는 구체적인 행동. due는 YYYY-MM-DD, time은 HH:MM 또는 "".
- area는 health, money, career, social, growth 중 1~2개.
- 이름은 모두 한국어로 20자 이내.
JSON 하나만 답해. 설명 금지.
{"title":"","area":[],"stages":[{"title":"","due":""}],"habits":[{"title":"","days":[],"time":""}],"missions":[{"title":"","due":"","time":""}]}`;
    const r = await fetch('https://api.anthropic.com/v1/messages', {method: 'POST', headers: {'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
      body: JSON.stringify({model: env.AI_MODEL || 'claude-haiku-5-5', max_tokens: 1200, messages: [{role: 'user', content: prompt}]})});
    if (!r.ok) return err(502, 'ai', 'AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.');
    const out = await r.json(), text = (out.content || []).map(c => c.text || '').join('');
    const m = text.match(/\{[\s\S]*\}/); let p; try { p = JSON.parse(m ? m[0] : text); } catch { return err(502, 'ai_format', 'AI 답을 읽지 못했어요. 다시 시도해 주세요.'); }
    if (!p || !Array.isArray(p.stages) || !p.stages.length) return err(502, 'ai_format', 'AI 답을 읽지 못했어요. 다시 시도해 주세요.');
    const dl = okD(b.deadline);
    const plan = {title: clip(p.title || goal, 40), area: (p.area || []).filter(a => AREAS.includes(a)).slice(0, 2),
      stages: p.stages.slice(0, 4).map(x => ({title: clip(x.title, 30), due: okD(x.due) || dl || today})).filter(x => x.title),
      habits: (p.habits || []).slice(0, 2).map(x => ({title: clip(x.title, 30), days: (Array.isArray(x.days) && x.days.length ? x.days : [0,1,2,3,4,5,6]).map(Number).filter(n => n >= 0 && n <= 6), time: okT(x.time)})).filter(x => x.title),
      missions: (p.missions || []).slice(0, 5).map(x => ({title: clip(x.title, 30), due: okD(x.due) || today, time: okT(x.time)})).filter(x => x.title), source: 'ai'};
    await upsert(env, 'next_ai_usage', {user_id: user.id, day: kst, count: todayN + 1});
    return json({plan, left: e.plan === 'pass' ? PASS_AI_PER_DAY - todayN - 1 : FREE_AI - total - 1});
  } catch (e) { return err(e.code === 'not_configured' ? 503 : 502, e.code || 'server', 'AI 요청을 처리하지 못했어요.'); }
}
