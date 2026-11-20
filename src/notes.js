/** 자료실(notes) schema shared by UI and economy.
 * Base drawers are fixed; custom drawers live in s.mine.drawers.list as {k,l,e,fields:[pool keys],area}.
 * Rewards are granted once, when a note first becomes "complete" (see noteComplete). Memo never rewards.
 */
export const NOTE_POOL = [
  {k:'title', t:'text', l:'제목', p:'제목'},
  {k:'body', t:'area', l:'내용', p:'자유롭게 적어요'},
  {k:'url', t:'url', l:'링크', p:'https://...'},
  {k:'summary', t:'area', l:'요약', p:'핵심만 짧게'},
  {k:'think', t:'area', l:'내 생각', p:'어떻게 느꼈나요?'},
  {k:'apply', t:'text', l:'적용할 점', p:'예: 매일 아침 10분'},
  {k:'rating', t:'stars', l:'별점'},
  {k:'date', t:'date', l:'날짜'},
  {k:'status', t:'choice', l:'상태', o:['예정','진행 중','완료']}
];
export const BASE_DRAWERS = [
  {k:'idea', l:'아이디어', ic:'idea', pt:1, area:null, hint:'떠오른 순간 한 줄로 붙잡고, 다음 행동까지 적으면 완성이에요.', need:'다음 행동', f:[
    {k:'title', t:'text', l:'한 줄 아이디어', p:'예: 친구와 함께 깨는 레이드 퀘스트'}]},
  {k:'ref', l:'참고자료', ic:'link', pt:1, area:null, hint:'나중에 볼 글·영상·파일. 요약과 저장한 이유를 남기면 완성이에요.', need:'핵심 요약 + 저장한 이유', f:[
    {k:'media', t:'choice', l:'종류', o:['글','영상','SNS','파일','기타']},
    {k:'title', t:'text', l:'제목', p:'예: 아침 루틴을 바꾼 5가지 습관'},
    {k:'url', t:'url', l:'링크', p:'https://...'}]},
  {k:'learn', l:'학습', ic:'book', pt:3, area:'growth', hint:'', need:'상태를 완료로 바꾸기', f:[
    {k:'type', t:'choice', l:'종류', o:['강의','책','영상','기타']},
    {k:'title', t:'text', l:'제목', p:'예: 데이터 분석 입문'},
    {k:'author', t:'text', l:'강사·저자', p:'예: 김OO'},
    {k:'url', t:'url', l:'링크', p:'https://...', when:{type:['강의','영상']}},
    {k:'rating', t:'stars', l:'별점'},
    {k:'status', t:'choice', l:'상태', o:['예정','학습 중','완료'], bottom:true}]},
  {k:'memo', l:'메모', ic:'memo', pt:0, area:null, hint:'어디에도 딱 맞지 않으면 일단 여기에 적어요.', need:'', f:[
    {k:'title', t:'text', l:'제목', p:'선택'},
    {k:'body', t:'area', l:'내용', p:'자유롭게 적어요'}]}
];
/* 서랍별 작성 템플릿. 글 상자(칸)만 다르고 위쪽 정보 칸(종류·링크·상태 등)은 서랍이 정한다.
 * 같은 서랍 안에서 같은 키는 같은 뜻이라, 템플릿을 바꿔도 적어 둔 칸은 그대로 남는다.
 * 완성 조건 칸은 모든 템플릿에 들어 있다: 아이디어 next(미션 추가), 참고자료 summary + why. */
const A = (k, l, p) => ({k, t:'area', l, p}), T = (k, l, p) => ({k, t:'text', l, p});
const NEXT = {k:'next', t:'text', l:'다음 행동', p:'예: 비슷한 서비스 3개 찾아보기', task:true};
const SUM = (l = '핵심 요약', p = '3줄 이내로 적어요') => A('summary', l, p), WHY_REF = A('why', '저장한 이유', '예: 다음 달 발표 자료에 인용');
export const NOTE_TPLS = {
  idea:[
    {id:'basic', l:'기본', f:[A('why', '왜 좋은가요?', '어떤 문제를 풀거나 어떤 기회를 만드나요?'), NEXT]},
    {id:'problem', l:'문제 해결', f:[A('problem', '해결할 문제', '지금 무엇이 불편하거나 비효율적인가요?'), A('who', '누구의 문제인가', '이 문제를 가장 크게 겪는 사람은?'), A('solution', '해결 방법', '어떻게 풀 수 있을까요?'), A('diff', '기존 방법과 다른 점', '지금은 어떻게 해결하고, 무엇이 더 나은가요?'), NEXT]},
    {id:'lean', l:'린 캔버스', f:[A('problem', '문제', '가장 중요한 문제 1~3개와 지금 쓰는 대안'), A('who', '고객군', '처음 쓸 사람(얼리어답터)은 누구인가요?'), A('value', '고유 가치 제안 (UVP)', '왜 다르고 왜 써야 하는지 한 문장으로'), A('solution', '해결책', '문제마다 핵심 기능 하나씩'), A('channel', '채널', '고객을 어디서 만나나요?'), A('revenue', '수익원', '누가 무엇에 얼마를 내나요?'), A('cost', '비용 구조', '꼭 드는 돈과 시간'), A('metric', '핵심 지표', '잘되고 있는지 보는 숫자'), A('unfair', '경쟁 우위', '남이 쉽게 따라 하거나 살 수 없는 것'), NEXT]},
    {id:'project', l:'프로젝트 기획', f:[A('background', '문제와 배경', '누가 어떤 문제를 겪나요? 근거는?'), A('goal', '목표', '끝났을 때 달라져 있을 것(측정 가능하게)'), A('nongoal', '하지 않을 것', '이번 범위에서 일부러 뺄 것'), A('features', '핵심 요구사항', '반드시 들어가야 하는 것'), A('metric', '성공 지표', '대표 지표 하나 + 함께 볼 지표'), A('risk', '위험과 의존성', '막힐 수 있는 것과 대비책'), A('question', '열린 질문', '아직 정하지 못한 것'), NEXT]},
    {id:'content', l:'콘텐츠 기획', f:[A('audience', '대상 독자', '누가 어떤 고민을 갖고 보나요?'), A('intent', '독자가 찾는 것', '이 콘텐츠로 해결하고 싶은 것'), A('message', '핵심 메시지', '한 문장으로 줄이면?'), A('hook', '첫 문장(훅)', '스크롤을 멈추게 할 첫 줄'), A('outline', '구성', '소제목 순서대로'), A('format', '형식·분량·채널', '예: 인스타 카드뉴스 6장'), A('cta', '독자가 할 행동 (CTA)', '다 보고 나서 무엇을 하게 할까요?'), NEXT]},
    {id:'feature', l:'기능 개선', f:[A('current', '지금 불편한 점', '어떤 상황에서 무엇이 불편한가요?'), A('solution', '바꾸고 싶은 모습', '어떻게 바뀌면 좋을까요?'), A('impact', '기대 효과', '누구에게 얼마나 좋아지나요?'), A('effort', '드는 노력', '쉬움 · 보통 · 어려움'), NEXT]},
    {id:'experiment', l:'실험 설계', f:[A('hypothesis', '가설', '우리는 ○○을 하면'), A('outcome', '기대 결과', '○○이 일어날 것이라고 믿는다'), A('metric', '성공 판단 기준', '이 숫자가 보이면 맞았다고 본다'), A('method', '실험 방법과 기간', '무엇을 얼마 동안 어떻게 해 보나요?'), A('result', '결과와 배운 점', '실험이 끝나면 적어요'), NEXT]},
    {id:'scamper', l:'SCAMPER 발상', f:[A('base', '바탕이 되는 것', '바꿔 볼 제품·서비스·습관'), A('s', 'S · 대체하기', '재료·사람·방법을 바꾸면?'), A('c', 'C · 결합하기', '다른 것과 합치면?'), A('a', 'A · 조정·응용하기', '다른 분야의 방법을 맞춰 쓰면?'), A('m', 'M · 수정·확대·축소', '크게·작게·다르게 하면?'), A('p', 'P · 다른 용도로', '다른 곳이나 다른 사람에게 쓰면?'), A('e', 'E · 제거하기', '빼거나 줄이면?'), A('r', 'R · 뒤집기·재배열', '순서나 역할을 바꾸면?'), NEXT]}],
  ref:[
    {id:'basic', l:'기본', f:[SUM(), WHY_REF]},
    {id:'article', l:'아티클·리포트', f:[SUM(), A('evidence', '근거와 데이터', '주장을 받치는 숫자·사례·출처'), A('quote', '인상 깊은 문장', '그대로 옮겨 적어요'), A('think', '내 생각', '동의하나요? 무엇이 빠졌나요?'), WHY_REF]},
    {id:'video', l:'영상·강연', f:[SUM(), A('timeline', '시간대별 메모', '예: 03:20 핵심 주장 / 12:45 사례'), A('learned', '배운 점', '새로 알게 된 것'), WHY_REF]},
    {id:'research', l:'논문·연구', f:[SUM('한 줄 요약', '무엇을 밝혔는지'), A('question', '연구 질문과 배경', '무엇을 왜 알고 싶었나요?'), A('method', '연구 방법', '대상·기간·도구·방법'), A('findings', '결과', '숫자와 함께, 해석 없이'), A('discussion', '해석과 시사점', '결과가 뜻하는 것'), A('limits', '한계', '어디까지 믿을 수 있나요?'), WHY_REF]},
    {id:'case', l:'사례·레퍼런스', f:[SUM('한 줄 소개', '무엇에 대한 사례인가요?'), A('good', '무엇이 좋은가', '구조·문구·디자인 중 눈에 띈 점'), A('use', '어디에 쓸까', '내 작업에 가져올 부분'), WHY_REF]},
    {id:'product', l:'제품·서비스 분석', f:[SUM('한 줄 소개', '무엇을 하는 제품인가요?'), A('target', '대상 사용자', '누가 왜 쓰나요?'), A('features', '핵심 기능', '사람들이 실제로 쓰는 기능'), A('revenue', '수익 모델', '어떻게 돈을 버나요?'), A('insight', '배울 점', '따라 하거나 피할 것'), WHY_REF]},
    {id:'news', l:'뉴스·이슈', f:[SUM(), A('facts', '사실 정리', '누가 · 언제 · 무엇을 · 왜'), A('impact', '의미와 영향', '나와 내 일에 어떤 영향이 있나요?'), WHY_REF]},
    {id:'tool', l:'도구·서비스', f:[SUM('무엇을 하는 도구인가요?', '한두 줄로'), A('usecase', '쓸 곳', '어떤 일에 쓰면 좋을까요?'), A('price', '가격·조건', '무료 범위, 요금'), A('alt', '비슷한 도구', '비교해 볼 것'), WHY_REF]}],
  learn:[
    {id:'basic', l:'기본', f:[A('goal', '학습 목표', '이걸로 무엇을 할 수 있게 되고 싶나요?')]},
    {id:'lecture', l:'강의 노트', f:[A('goal', '학습 목표', '이 강의가 끝나면 할 수 있어야 하는 것'), A('concepts', '핵심 개념', '새로 나온 용어와 뜻'), A('example', '예제와 실습', '직접 해 본 것'), A('question', '궁금한 점', '이해가 안 된 부분'), A('review', '복습 계획', '예: 3일 뒤 예제 다시 풀기')]},
    {id:'book', l:'독서 노트', f:[A('reason', '읽는 이유', '이 책에서 얻고 싶은 것'), A('summary', '핵심 내용', '장별로 또는 3줄로'), A('quote', '인상 깊은 구절', '쪽수와 함께'), A('think', '내 생각', '동의·반대·떠오른 생각'), A('apply', '적용할 점', '예: 매일 아침 10분')]},
    {id:'cornell', l:'코넬 노트', f:[A('notes', '필기 (Record)', '수업·책 내용을 의미 있게 그대로'), A('cue', '단서와 질문 (Reduce)', '필기를 핵심어·질문으로 줄이기'), A('summary', '요약', '페이지마다 한두 문장으로')]},
    {id:'feynman', l:'파인만 기법', f:[A('concept', '1. 공부할 개념', '이해하고 싶은 것과 핵심 요소'), A('simple', '2. 남에게 가르치듯 설명', '모르는 사람에게 설명하듯 써요'), A('gap', '3. 막힌 곳 채우기', '설명하다 막힌 곳을 다시 공부'), A('refine', '4. 더 쉽게 다시 정리', '아이도 알아듣게')]},
    {id:'kwl', l:'KWL', f:[A('know', '이미 아는 것 (K)', '시작 전에 아는 것'), A('want', '알고 싶은 것 (W)', '질문 형태로'), A('learned', '새로 배운 것 (L)', '끝나고 적어요')]},
    {id:'exam', l:'시험·자격증', f:[A('goal', '목표', '예: 토익 850점, 6월 시험 합격'), A('scope', '시험 범위', '과목·단원'), A('plan', '공부 계획', '주차별로'), A('weak', '약한 부분', '자주 틀리는 유형'), A('wrong', '오답 노트', '문제 출처 · 내 답 / 정답 · 틀린 이유 · 바로잡은 규칙'), A('review', '다시 볼 날', '예: 3일 뒤, 1주 뒤')]},
    {id:'skill', l:'기술 익히기', f:[A('goal', '목표', '예: 혼자서 웹페이지 하나 만들기'), A('steps', '단계별 연습', '쉬운 것부터 순서대로'), A('practice', '연습 기록', '오늘 해 본 것'), A('problem', '막힌 점과 해결', '어떻게 풀었나요?'), A('nextstep', '다음 연습', '다음에 할 것')]},
    {id:'lang', l:'어학', f:[A('expr', '새 표현', '단어·표현과 뜻'), A('example', '예문', '직접 만든 문장'), A('mistake', '자주 틀리는 것', '헷갈리는 표현'), A('review', '복습 계획', '언제 다시 볼까요?')]}],
  memo:[
    {id:'basic', l:'빈 메모', f:[]},
    {id:'meeting', l:'회의록', f:[T('when', '일시·참석자', '예: 11/20 15:00 · 민수, 지영'), A('agenda', '안건', '오늘 정할 것'), A('discussion', '논의 요약', '나온 의견'), A('decision', '결정 사항', '정해진 것'), A('todo', '실행 항목', '누가 · 무엇을 · 언제까지')]},
    {id:'oneone', l:'1:1 미팅', f:[T('when', '상대·날짜', '예: 팀장님 · 11/20'), A('share', '근황 공유', '요즘 하고 있는 일'), A('topics', '이야기할 것', '묻거나 상의할 것'), A('feedback', '피드백', '주고받은 의견'), A('todo', '후속 조치', '누가 · 무엇을 · 언제까지')]},
    {id:'kpt', l:'KPT 회고', f:[A('keep', '잘된 점 (Keep)', '계속할 것'), A('problem', '아쉬운 점 (Problem)', '문제였던 것'), A('try', '시도할 점 (Try)', '다음에 바꿔 볼 것')]},
    {id:'4l', l:'4L 회고', f:[A('liked', '좋았던 것 (Liked)', '즐거웠거나 잘된 것'), A('learned', '배운 것 (Learned)', '새로 알게 된 것'), A('lacked', '부족했던 것 (Lacked)', '아쉬웠던 것'), A('longed', '바라는 것 (Longed for)', '있었으면 하는 것')]},
    {id:'decision', l:'의사결정 기록', f:[A('context', '상황과 배경', '무엇을 정해야 하고, 무엇이 영향을 주나요?'), A('options', '고려한 선택지', '각각 고르지 않은 이유'), A('decision', '결정', '무엇을 골랐나요?'), A('reason', '이유', '왜 그렇게 정했나요?'), A('expect', '예상 결과', '어떻게 될 것 같은지, 얼마나 확신하는지'), A('consequence', '감수할 것', '나쁜 점과 포기하는 것까지'), T('mood', '결정할 때 상태', '예: 피곤함, 급함'), T('revisit', '다시 볼 날', '예: 3개월 뒤')]},
    {id:'5why', l:'5 Whys 원인 분석', f:[A('issue', '문제', '무슨 일이 언제 어디서 일어났나요?'), A('why1', '왜? 1', ''), A('why2', '왜? 2', ''), A('why3', '왜? 3', ''), A('why4', '왜? 4', ''), A('why5', '왜? 5', ''), A('root', '근본 원인', ''), A('fix', '대책', '같은 일이 다시 안 생기게')]},
    {id:'brainstorm', l:'브레인스토밍', f:[T('theme', '주제', '무엇에 대한 생각인가요?'), A('ideas', '떠오른 것 전부', '판단하지 말고 적어요'), A('pick', '고른 것', '가장 마음에 드는 것'), A('reason', '고른 이유', '')]},
    {id:'todo', l:'할 일 정리', f:[A('must', '꼭 할 일', '오늘 반드시'), A('should', '하면 좋은 일', '시간이 나면'), A('later', '나중에', '이번 주 안에'), A('delegate', '맡길 일', '다른 사람에게')]},
    {id:'weekly', l:'주간 계획', f:[A('goals', '이번 주 목표', '3개 이내로'), A('schedule', '주요 일정', '요일별로'), A('focus', '집중할 것', '가장 중요한 한 가지'), A('worry', '걱정되는 것', '미리 대비할 것')]}]
};
export const noteTpls = d => (d && NOTE_TPLS[d.k]) || null;
export const noteTpl = (d, id) => { const ts = noteTpls(d); return ts ? ts.find(t => t.id === id) || ts[0] : null; };
/* 이 서랍 템플릿들의 모든 칸(키 중복 없이) */
export const noteTplFields = d => { const ts = noteTpls(d) || [], seen = new Set(), out = []; ts.forEach(t => t.f.forEach(x => { if (!seen.has(x.k)){ seen.add(x.k); out.push(x); } })); return out; };
export function noteDrawers(s) {
  const cfg = s.mine?.drawers || {}, custom = (cfg.list || []).map(d => ({k:d.k, l:d.l, ic:d.ic || 'folder', pt:1, area:d.area || null, custom:true,
    hint:'모든 칸을 채우면 완성이에요.', need:'모든 칸', f:(d.fields || []).map(k => NOTE_POOL.find(x => x.k === k)).filter(Boolean)}));
  return [...BASE_DRAWERS.map(d => ({...d, hidden:(cfg.hidden || []).includes(d.k)})), ...custom];
}
export function noteDrawer(s, k) { const all = noteDrawers(s); return all.find(d => d.k === k) || all.find(d => d.k === 'memo'); }
const lines = (...xs) => xs.filter(Boolean).join('\n');
/* Earlier note formats map onto the current drawers (display + reward checks; stored data is rewritten only on save). */
export function noteNorm(s, n) {
  const f0 = n.f, c0 = n.cat;
  if (f0 && c0 === 'learn') { const st = f0.status === '진행 중' ? '학습 중' : f0.status, chDone = Array.isArray(n.ch) && n.ch.length && n.ch.every(c => c.st === 'done');
    return {cat:c0, f:{...f0, status:st || (chDone ? '완료' : undefined)}}; }
  if (f0 && noteDrawers(s).some(d => d.k === c0)) return {cat:c0, f:f0};
  if (f0) {
    if (c0 === 'link') return {cat:'ref', f:{url:f0.url, media:{'글':'글','영상':'영상','강의':'영상','SNS':'SNS'}[f0.media] || (f0.media ? '기타' : undefined), title:f0.title, summary:f0.summary, why:f0.why}};
    if (c0 === 'book') return {cat:'learn', f:{type:'책', title:f0.title, author:f0.author, status:{'읽고 싶음':'예정','읽는 중':'학습 중','완독':'완료'}[f0.status], rating:f0.rating, quote:f0.quote, think:f0.think, apply:f0.apply}};
    if (c0 === 'study') return {cat:'learn', f:{title:f0.title, quote:lines(f0.notes, f0.cue), think:f0.summary}};
    if (c0 === 'quote') return {cat:'memo', f:{title:f0.source, body:lines(f0.quote, f0.think)}};
    if (c0 === 'meeting') return {cat:'memo', f:{title:f0.title, body:lines(f0.date, f0.people && '참석: '+f0.people, f0.decisions && '결정: '+f0.decisions, f0.todo && '할 일: '+f0.todo)}};
    return {cat:'memo', f:{title:f0.title, body:lines(...Object.entries(f0).filter(([k]) => k !== 'title').map(([, v]) => v))}};
  }
  const t = n.title || '', b = n.body || '', l = n.link || '';
  if (c0 === 'ref') return {cat:'ref', f:{url:l, title:t, summary:b}};
  if (c0 === 'idea') return {cat:'idea', f:{title:t, why:lines(b, l)}};
  if (c0 === 'book' || c0 === 'study') return {cat:'learn', f:{type:c0 === 'book' ? '책' : undefined, title:t, quote:lines(b, l)}};
  return {cat:'memo', f:{title:t, body:lines(b, l)}};
}
const has = v => v != null && String(v).trim() !== '';
export function noteComplete(s, n) {
  if (!n || n.kind !== 'note') return false;
  const {cat, f} = noteNorm(s, n), d = noteDrawer(s, cat);
  if (!d || !d.pt) return false;
  /* 아이디어는 '다음 행동'을 미션으로 추가했을 때 완성(sent). needSend 표시가 없는 예전 아이디어는 예전 기준(다음 행동을 적으면 완성)을 그대로 둔다 */
  if (cat === 'idea') return has(f.next) && (!n.needSend || !!n.sent);
  if (cat === 'ref') return has(f.summary) && has(f.why);
  if (cat === 'learn') return f.status === '완료';
  return d.f.length > 0 && d.f.every(x => has(f[x.k]));
}
export function noteReward(s, n) { const {cat} = noteNorm(s, n), pt = noteDrawer(s, cat)?.pt || 0; return {pt, xp:pt * 10, coins:pt * 10}; }
export const STUDY_LIMITS = [25, 50, 90];
