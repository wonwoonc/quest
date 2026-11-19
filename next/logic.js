/* 퀘스트라인 넥스트: 화면과 무관한 순수 로직 (tests/next-logic.test.mjs 에서 검증) */
export const pad = n => String(n).padStart(2, "0");
export const dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const pd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addD = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return dk(d); };
export const WD = ["일","월","화","수","목","금","토"];
export const diffDays = (a, b) => Math.round((pd(b) - pd(a)) / 864e5);
export const sunStart = s => addD(s, -pd(s).getDay());
export const md = s => { const d = pd(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
export const tmFmt = t => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${h}:${pad(m)}`; };
export const dayLabel = (s, t) => s === t ? "오늘" : s === addD(t, 1) ? "내일" : s === addD(t, -1) ? "어제" : `${md(s)} (${WD[pd(s).getDay()]})`;
export const daysLabel = d => d.length === 7 ? "매일" : d.join() === "1,2,3,4,5" ? "평일" : d.join() === "0,6" ? "주말" : "매주 " + d.map(i => WD[i]).join("·");

/* 게임 규칙 */
export const LV = {tiny:"아주 쉬움", easy:"쉬움", normal:"보통", hard:"어려움", epic:"아주 어려움"};
export const XP_M = {tiny:5, easy:10, normal:20, hard:40, epic:80};
export const XP_H = {tiny:3, easy:5, normal:10, hard:15, epic:25};
export const COIN = {tiny:1, easy:2, normal:4, hard:8, epic:15};
export const need = L => Math.round(100 * Math.pow(L, 1.4));
export const levelOf = xp => { let L = 1, rest = Math.max(0, xp | 0); while (rest >= need(L) && L < 200) { rest -= need(L); L++; } return {L, rest, need:need(L)}; };
export const mult = s => s >= 100 ? 1.3 : s >= 30 ? 1.2 : s >= 7 ? 1.1 : 1;
export const AREAS = {health:["체력","건강"], money:["재력","재정"], career:["실력","커리어"], social:["관계","관계"], growth:["지혜","배움"]};
export const AREA_KEYS = Object.keys(AREAS);
export const FREE = {quests:1, habits:3};
export const SHIELD_COST = 150, CLEAR_XP = 30, CLEAR_COIN = 10;
export const PRICES = {year:49000, month:7900};

export const habitOn = (h, d) => !h.archived && Array.isArray(h.days) && h.days.includes(pd(d).getDay()) && (!h.createdAt || d >= h.createdAt);

/* 연속 기록: 하루에 하나라도 끝냈거나 휴식권을 쓴 날이 이어진 날 수 */
export function streak(S, t){
  const done = new Set();
  S.missions.forEach(m => m.done && m.doneAt && done.add(m.doneAt));
  S.habits.forEach(h => Object.keys(h.log || {}).forEach(d => done.add(d)));
  (S.user.rest || []).forEach(d => done.add(d));
  let d = done.has(t) ? t : addD(t, -1), n = 0; while (done.has(d)) { n++; d = addD(d, -1); } return n;
}

/* 퀘스트 진행도: 메인은 스테이지까지 포함. left가 0이어야 달성 가능 */
export const subsOf = (S, id) => S.quests.filter(q => q.parent === id);
export function qProg(S, q){
  const subs = q.parent ? [] : subsOf(S, q.id), ids = [q.id, ...subs.map(s => s.id)];
  const ms = S.missions.filter(m => ids.includes(m.quest));
  const done = ms.filter(m => m.done).length, sd = subs.filter(s => s.status === "done").length;
  return {done, total:ms.length, sd, st:subs.length, left:(ms.length - done) + (subs.length - sd)};
}

/* 오늘 목록: 오늘 일퀘 + 오늘(또는 밀린) 미션 + 오늘 일정, 시간순 */
export function todayItems(S, t){
  const out = [];
  S.habits.filter(h => habitOn(h, t)).forEach(h => out.push({k:"h", id:h.id, title:h.title, time:h.time || "", done:!!(h.log || {})[t], quest:h.quest}));
  S.missions.filter(m => m.due === t || (!m.done && m.due < t) || (m.done && m.doneAt === t)).forEach(m => out.push({k:"m", id:m.id, title:m.title, time:m.due === t ? m.time || "" : "", done:!!m.done, late:!m.done && m.due < t, due:m.due, quest:m.quest}));
  S.events.filter(e => e.date === t).forEach(e => out.push({k:"e", id:e.id, title:e.title, time:e.time || "", etime:e.etime, done:!!e.done}));
  return out.sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
}

/* 한 줄 입력 해석: "매주 월수금 저녁 8시 헬스" → 일퀘 · 월수금 · 20:00 · 건강 */
const AREA_WORDS = [["health",/운동|달리|러닝|헬스|요가|산책|스트레칭|다이어트|식단|물\s?\d|병원|수면|걷기|마라톤|필라테스|체중|수영|등산/],["money",/저축|적금|가계부|투자|주식|월급|지출|부업|절약|돈/],["career",/회의|업무|보고서|이력서|면접|프로젝트|미팅|발표|출근|기획|메일|포트폴리오/],["social",/친구|가족|엄마|아빠|부모|연락|전화|약속|모임|데이트|생일/],["growth",/공부|토익|영어|단어|독서|책|강의|자격증|코딩|글쓰기|일기|복습|문제집|시험|인강/]];
const EVENT_WORDS = /회의|미팅|약속|병원|면접|예약|모임|결혼식|생일|진료|상담|발표|콘서트|여행|치과/;
export function parse(text, t){
  let s = " " + text + " ", type = "m", date = t, time = "", days = null, m;
  const cut = re => { const x = s.match(re); if (x) s = s.replace(x[0], " "); return x; };
  if (cut(/매일|날마다/)) days = [0,1,2,3,4,5,6];
  else if (cut(/평일(마다)?/)) days = [1,2,3,4,5];
  else if (cut(/주말(마다)?/)) days = [0,6];
  else if ((m = cut(/매주\s*([월화수목금토일](?:[,\s·]*[월화수목금토일])*)\s*(요일)?(마다)?/))) days = [...new Set([...m[1]].map(c => WD.indexOf(c)).filter(i => i >= 0))].sort((a, b) => a - b);
  if (days) type = "h";
  if (cut(/오늘/)) date = t;
  else if (cut(/내일/)) date = addD(t, 1);
  else if (cut(/모레/)) date = addD(t, 2);
  else if ((m = cut(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/))) { const y = +t.slice(0, 4); let d = `${y}-${pad(+m[1])}-${pad(+m[2])}`; if (d < t) d = `${y + 1}-${pad(+m[1])}-${pad(+m[2])}`; date = d; }
  else if (!days && (m = cut(/(다음\s*주|이번\s*주)?\s*([월화수목금토일])요일/))) { let d = addD(sunStart(t), WD.indexOf(m[2])); if (m[1] && /다음/.test(m[1])) d = addD(d, 7); else if (d < t) d = addD(d, 7); date = d; }
  if ((m = cut(/(오전|오후|아침|저녁|밤|새벽)?\s*(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분|(반))?/))) { let h = +m[2]; const mi = m[3] ? +m[3] : m[4] ? 30 : 0; if (/오후|저녁|밤/.test(m[1] || "") && h < 12) h += 12; if (!m[1] && h >= 1 && h <= 6) h += 12; if (h < 24 && mi < 60) time = `${pad(h)}:${pad(mi)}`; }
  else if ((m = cut(/(\d{1,2}):(\d{2})/))) { const h = +m[1], mi = +m[2]; if (h < 24 && mi < 60) time = `${pad(h)}:${pad(mi)}`; }
  const title = s.replace(/\s+/g, " ").replace(/\s*(에|까지|부터)\s*$/, "").trim();
  if (!days && EVENT_WORDS.test(title)) type = "e";
  const area = AREA_WORDS.filter(([, re]) => re.test(text)).map(([k]) => k).slice(0, 2);
  return {type, title, date, time, days, area};
}

/* 빈 상태와 예시 */
export const blank = name => ({v:1, user:{name:name || "모험가", xp:0, coins:0, shields:1, best:0, clear:{}, rest:[], shieldMonth:""}, stats:{health:0, money:0, career:0, social:0, growth:0},
  quests:[], missions:[], habits:[], events:[], rewards:[{id:"r1", name:"보고 싶던 영화 보기", cost:120, type:"do"},{id:"r2", name:"좋아하는 디저트", cost:60, type:"get"}], buys:[], onboarded:false, updatedAt:0});

/* 저장 데이터 검사: 서버나 기기에서 읽은 값이 앱 형식인지 */
export function valid(S){
  return !!(S && S.v === 1 && S.user && typeof S.user.xp === "number" && Array.isArray(S.quests) && Array.isArray(S.missions) && Array.isArray(S.habits) && Array.isArray(S.events));
}
