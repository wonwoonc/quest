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
    {k:'title', t:'text', l:'한 줄 아이디어', p:'예: 친구와 함께 깨는 레이드 퀘스트'},
    {k:'why', t:'area', l:'왜 좋은가요?', p:'어떤 문제를 풀거나 어떤 기회를 만드나요?'},
    {k:'next', t:'text', l:'다음 행동', p:'예: 비슷한 서비스 3개 찾아보기', task:true}]},
  {k:'ref', l:'참고자료', ic:'link', pt:1, area:null, hint:'나중에 볼 글·영상·파일. 요약과 저장한 이유를 남기면 완성이에요.', need:'핵심 요약 + 저장한 이유', f:[
    {k:'url', t:'url', l:'링크', p:'https://...'},
    {k:'media', t:'choice', l:'종류', o:['글','영상','SNS','파일','기타']},
    {k:'title', t:'text', l:'제목', p:'예: 아침 루틴을 바꾼 5가지 습관'},
    {k:'summary', t:'area', l:'핵심 요약', p:'3줄 이내로 적어요'},
    {k:'why', t:'text', l:'저장한 이유', p:'예: 다음 달 발표 자료에 인용'}]},
  {k:'learn', l:'학습', ic:'book', pt:3, area:'growth', hint:'책·강의에서 인상 깊은 내용 → 내 생각 → 적용할 점 순서로 남겨요. 완료 + 적용할 점까지 적으면 완성이에요.', need:'상태 완료 + 적용할 점', f:[
    {k:'type', t:'choice', l:'종류', o:['책','강의','영상','기타']},
    {k:'title', t:'text', l:'제목', p:'예: 아주 작은 습관의 힘'},
    {k:'author', t:'text', l:'저자·강사', p:'예: 제임스 클리어'},
    {k:'status', t:'choice', l:'상태', o:['예정','진행 중','완료']},
    {k:'rating', t:'stars', l:'별점'},
    {k:'quote', t:'area', l:'인상 깊은 내용', p:'밑줄 친 문장, 핵심 개념'},
    {k:'think', t:'area', l:'내 생각', p:'왜 인상 깊었나요?'},
    {k:'apply', t:'text', l:'적용할 점', p:'예: 매일 아침 10분 읽기', task:true}]},
  {k:'memo', l:'메모', ic:'memo', pt:0, area:null, hint:'어디에도 딱 맞지 않으면 일단 여기에 적어요.', need:'', f:[
    {k:'title', t:'text', l:'제목', p:'선택'},
    {k:'body', t:'area', l:'내용', p:'자유롭게 적어요'}]}
];
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
  if (f0 && noteDrawers(s).some(d => d.k === c0)) return {cat:c0, f:f0};
  if (f0) {
    if (c0 === 'link') return {cat:'ref', f:{url:f0.url, media:{'글':'글','영상':'영상','강의':'영상','SNS':'SNS'}[f0.media] || (f0.media ? '기타' : undefined), title:f0.title, summary:f0.summary, why:f0.why}};
    if (c0 === 'book') return {cat:'learn', f:{type:'책', title:f0.title, author:f0.author, status:{'읽고 싶음':'예정','읽는 중':'진행 중','완독':'완료'}[f0.status], rating:f0.rating, quote:f0.quote, think:f0.think, apply:f0.apply}};
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
  if (cat === 'idea') return has(f.next);
  if (cat === 'ref') return has(f.summary) && has(f.why);
  if (cat === 'learn') return f.status === '완료' && has(f.apply);
  return d.f.length > 0 && d.f.every(x => has(f[x.k]));
}
export function noteReward(s, n) { const {cat} = noteNorm(s, n), pt = noteDrawer(s, cat)?.pt || 0; return {pt, xp:pt * 10, coins:pt * 10}; }
