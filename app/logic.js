/* 퀘스트라인 — 화면과 무관한 순수 로직. tests/app-logic.test.mjs 에서 검증한다.
 *
 * 데이터 원칙
 * 1) 모든 기록은 컬렉션(quests·missions·habits·logs·events·rewards·buys·marks)의 항목이고, 항목마다 u(마지막 수정 시각)가 있다.
 *    지운 항목은 del:true 로 남겨(묘비) 다른 기기와 합칠 때 되살아나지 않게 한다.
 * 2) 경험치·코인·휴식권·능력치는 저장하지 않고 항목에서 계산한다. 그래서 두 기기 기록을 합쳐도 숫자가 어긋나지 않는다.
 */
export const pad = n => String(n).padStart(2, "0");
export const dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const pd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addD = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return dk(d); };
export const addM = (s, n) => { const d = pd(s), day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return dk(d); };
export const WD = ["일","월","화","수","목","금","토"];
export const diffDays = (a, b) => Math.round((pd(b) - pd(a)) / 864e5);
export const sunStart = s => addD(s, -pd(s).getDay());
export const md = s => { const d = pd(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
export const tmFmt = t => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${h}:${pad(m)}`; };
export const tmAdd = (t, min) => { const [h, m] = t.split(":").map(Number), x = Math.max(0, Math.min(23 * 60 + 59, h * 60 + m + min)); return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; };
export const dayLabel = (s, t) => !s ? "날짜 없음" : s === t ? "오늘" : s === addD(t, 1) ? "내일" : s === addD(t, -1) ? "어제" : `${md(s)} (${WD[pd(s).getDay()]})`;
export const ddayLabel = (s, t) => { const n = diffDays(t, s); return n === 0 ? "D-day" : n > 0 ? `D-${n}` : `D+${-n}`; };

/* ───── 반복 규칙 ─────
 * {type:"week", days:[0..6]}                 매주 고른 요일
 * {type:"biweek", days:[..], anchor:"YYYY-MM-DD"}  격주(anchor가 든 주부터)
 * {type:"month", dates:[1..31]}              매달 그날(없는 날은 말일)
 * {type:"every", n:2, anchor}                n일마다 */
export function occursOn(r, d){
  if (!r) return false;
  const day = pd(d).getDay();
  if (r.type === "week") return (r.days || []).includes(day);
  if (r.type === "biweek") return (r.days || []).includes(day) && Math.floor(diffDays(sunStart(r.anchor || d), sunStart(d)) / 7) % 2 === 0;
  if (r.type === "month") { const x = pd(d), last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); return (r.dates || []).some(n => Math.min(n, last) === x.getDate()); }
  if (r.type === "every") { const k = diffDays(r.anchor || d, d); return k >= 0 && k % Math.max(1, r.n | 0) === 0; }
  return false;
}
export function ruleLabel(r){
  if (!r) return "";
  if (r.type === "week") { const d = r.days || []; return d.length === 7 ? "매일" : d.join() === "1,2,3,4,5" ? "평일" : d.join() === "0,6" ? "주말" : "매주 " + d.map(i => WD[i]).join("·"); }
  if (r.type === "biweek") return "격주 " + (r.days || []).map(i => WD[i]).join("·");
  if (r.type === "month") return "매달 " + (r.dates || []).join("·") + "일";
  if (r.type === "every") return r.n === 1 ? "매일" : `${r.n}일마다`;
  return "";
}
export const EVERYDAY = () => ({type:"week", days:[0,1,2,3,4,5,6]});

/* ───── 게임 규칙 ───── */
export const LV = {tiny:"아주 쉬움", easy:"쉬움", normal:"보통", hard:"어려움", epic:"아주 어려움"};
export const LV_KEYS = Object.keys(LV);
export const XP_M = {tiny:5, easy:10, normal:20, hard:40, epic:80};
export const XP_H = {tiny:3, easy:5, normal:10, hard:15, epic:25};
export const COIN = {tiny:1, easy:2, normal:4, hard:8, epic:15};
export const BONUS = {clear:{xp:30, c:10}, stage:{xp:150, c:50}, main:{xp:500, c:200}, plan:{xp:50, c:20}};
export const need = L => Math.round(100 * Math.pow(L, 1.4));
export function levelOf(xp){ let L = 1, rest = Math.max(0, Math.floor(xp)); while (rest >= need(L) && L < 300) { rest -= need(L); L++; } return {L, rest, need:need(L), pct:Math.round(rest / need(L) * 100)}; }
export const levelCoins = L => { let c = 0; for (let i = 2; i <= L; i++) c += i * 10; return c; }; // 레벨업 보너스 누적
export const mult = s => s >= 100 ? 1.3 : s >= 30 ? 1.2 : s >= 7 ? 1.1 : 1;
export const AREAS = {health:{stat:"체력", name:"건강"}, money:{stat:"재력", name:"재정"}, career:{stat:"실력", name:"커리어"}, social:{stat:"관계", name:"관계"}, growth:{stat:"지혜", name:"배움"}};
export const AREA_KEYS = Object.keys(AREAS);
export const FREE = {quests:1, habits:3};
export const SHIELD = {cost:150, freePerMonth:1, passPerMonth:4, max:8};
export const PRICES = {year:49000, month:7900};
export const TITLES = [[1,"새내기 모험가"],[5,"견습 모험가"],[10,"숙련 모험가"],[20,"베테랑"],[30,"영웅"],[50,"전설"]];

/* ───── 컬렉션 ───── */
export const COLS = ["quests","missions","habits","logs","events","rewards","buys","marks"];
export const live = (S, c) => Object.values(S[c] || {}).filter(x => !x.del);
export const get = (S, c, id) => { const x = (S[c] || {})[id]; return x && !x.del ? x : null; };
export function blank(name, now = Date.now()){
  const S = {v:2, profile:{name:name || "모험가", hue:152, onboarded:false, remindAt:"08:30", eveningAt:"21:30", seenLevel:1, createdAt:now, u:now}};
  COLS.forEach(c => S[c] = {});
  S.rewards.r1 = {id:"r1", name:"보고 싶던 영화 보기", cost:120, type:"do", u:now};
  S.rewards.r2 = {id:"r2", name:"좋아하는 디저트", cost:60, type:"get", u:now};
  return S;
}
export const valid = S => !!(S && S.v === 2 && S.profile && COLS.every(c => S[c] && typeof S[c] === "object" && !Array.isArray(S[c])));

/* 두 기록 합치기: 항목마다 u가 큰 쪽. 60일 넘은 묘비는 정리 */
export function merge(a, b, now = Date.now()){
  if (!valid(a)) return b; if (!valid(b)) return a;
  const out = {v:2, profile:(b.profile.u || 0) > (a.profile.u || 0) ? b.profile : a.profile};
  for (const c of COLS){ const m = {}; for (const src of [a[c], b[c]]) for (const [id, x] of Object.entries(src)) { const y = m[id]; if (!y || (x.u || 0) > (y.u || 0)) m[id] = x; }
    for (const [id, x] of Object.entries(m)) if (x.del && now - (x.u || 0) > 60 * 864e5) delete m[id]; out[c] = m; }
  return out;
}

/* ───── 계산 ───── */
export const habitLog = (S, hid, d) => get(S, "logs", `${hid}|${d}`);
export const habitOn = (h, d) => !h.del && !h.paused && occursOn(h.rule, d) && (!h.start || d >= h.start);
export function doneDays(S){ const s = new Set(); live(S, "missions").forEach(m => m.done && m.doneAt && s.add(m.doneAt)); live(S, "logs").forEach(l => s.add(l.date)); live(S, "marks").forEach(k => k.kind === "rest" && s.add(k.date)); return s; }
export function streak(S, t){ const s = doneDays(S); let d = s.has(t) ? t : addD(t, -1), n = 0; while (s.has(d)) { n++; d = addD(d, -1); } return n; }
export function bestStreak(S){ const days = [...doneDays(S)].sort(); let best = 0, cur = 0, prev = null; for (const d of days){ cur = prev && addD(prev, 1) === d ? cur + 1 : 1; best = Math.max(best, cur); prev = d; } return best; }
export function habitStreak(S, h, t){ let d = habitLog(S, h.id, t) ? t : addD(t, -1), n = 0, guard = 0; while (guard++ < 800) { if (d < (h.start || "0")) break; if (!occursOn(h.rule, d)) { d = addD(d, -1); continue; } if (habitLog(S, h.id, d)) { n++; d = addD(d, -1); } else break; } return n; }

/* 경험치·코인·능력치·휴식권 합계 */
export function totals(S){
  let xp = 0, c = 0; const stats = {}; AREA_KEYS.forEach(a => stats[a] = 0);
  const add = (aw, area) => { if (!aw) return; xp += aw.xp || 0; c += aw.c || 0; (area || []).forEach(a => { if (a in stats) stats[a] += Math.ceil((aw.xp || 0) / 10); }); };
  live(S, "missions").forEach(m => m.done && add(m.award, m.area));
  live(S, "logs").forEach(l => add(l.award, l.area));
  live(S, "quests").forEach(q => q.status === "done" && add(q.award, q.area));
  live(S, "marks").forEach(k => (k.kind === "clear" || k.kind === "plan") && add(k.award));
  const lv = levelOf(xp); c += levelCoins(lv.L);
  live(S, "buys").forEach(b => c -= b.cost || 0);
  let shields = 0; live(S, "marks").forEach(k => { if (k.kind === "grant") shields += k.n || 0; if (k.kind === "shieldbuy") { shields += 1; c -= k.cost || 0; } if (k.kind === "rest") shields -= 1; });
  return {xp, coins:c, level:lv, stats, shields:Math.max(0, shields)};
}
/* 지금 체크하면 받을 보상(연속 기록 배수 포함) */
export function rewardFor(kind, lv, streakN){ const base = kind === "h" ? XP_H[lv || "easy"] : XP_M[lv || "normal"]; return {xp:Math.round(base * mult(streakN)), c:COIN[lv || "normal"]}; }

/* 퀘스트 진행도: 메인은 스테이지 미션까지. left가 0이어야 달성 */
export const subsOf = (S, id) => live(S, "quests").filter(q => q.parent === id).sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || (a.createdAt || 0) - (b.createdAt || 0));
export function qProg(S, q){
  const subs = q.parent ? [] : subsOf(S, q.id).filter(s => s.status !== "gaveup"), ids = new Set([q.id, ...subs.map(s => s.id)]);
  const ms = live(S, "missions").filter(m => ids.has(m.quest)), done = ms.filter(m => m.done).length, sd = subs.filter(s => s.status === "done").length;
  return {done, total:ms.length, sd, st:subs.length, left:(ms.length - done) + (subs.length - sd), pct:ms.length ? Math.round(done / ms.length * 100) : (subs.length ? Math.round(sd / subs.length * 100) : 0)};
}

/* 오늘 목록 */
export function todayItems(S, t){
  const out = [];
  live(S, "habits").filter(h => habitOn(h, t)).forEach(h => { const l = habitLog(S, h.id, t); out.push({k:"h", id:h.id, title:h.title, time:h.time || "", done:!!l, quest:h.quest, lv:h.lv}); });
  live(S, "missions").filter(m => m.due === t || (m.done && m.doneAt === t) || (!m.done && m.due && m.due < t)).forEach(m => out.push({k:"m", id:m.id, title:m.title, time:m.due === t ? m.time || "" : "", etime:m.etime, done:!!m.done, late:!m.done && m.due < t, due:m.due, quest:m.quest, lv:m.lv, check:m.checklist}));
  live(S, "events").filter(e => e.date === t || (e.end && e.date < t && e.end >= t)).forEach(e => out.push({k:"e", id:e.id, title:e.title, time:e.allDay ? "" : e.time || "", etime:e.etime, done:!!e.done, allDay:!!e.allDay}));
  return out.sort((a, b) => (a.time || "99").localeCompare(b.time || "99") || (a.k === "h" ? -1 : 0) - (b.k === "h" ? -1 : 0));
}
export const inbox = S => live(S, "missions").filter(m => !m.done && !m.due);

/* ───── 한 줄 입력 해석 v2 ─────
 * 반복: 매일, 평일, 주말, 매주 월수금, 격주 화요일, 매달 15일, 3일마다
 * 날짜: 오늘, 내일, 모레, 글피, 이번 주/다음 주 금요일, 금요일, 12월 3일, 다음 달 3일, 3일 뒤
 * 시간: 7시, 오후 2시 반, 14:30, 3시~5시, 저녁 8시부터 10시까지
 * 그 밖: #퀘스트이름 → 퀘스트 연결, !/중요 → 어려움, 여러 줄 → 여러 개 */
const AREA_WORDS = [["health",/운동|달리|러닝|헬스|요가|산책|스트레칭|다이어트|식단|물\s?\d|병원|수면|걷기|마라톤|필라테스|체중|수영|등산|영양제|치과/],["money",/저축|적금|가계부|투자|주식|월급|지출|부업|절약|돈|보험|세금|카드/],["career",/회의|업무|보고서|이력서|면접|프로젝트|미팅|발표|출근|기획|메일|포트폴리오|거래처|클라이언트/],["social",/친구|가족|엄마|아빠|부모|연락|전화|약속|모임|데이트|생일|선물|안부/],["growth",/공부|토익|영어|단어|독서|책|강의|자격증|코딩|글쓰기|일기|복습|문제집|시험|인강|외국어|명상/]];
const EVENT_WORDS = /회의|미팅|약속|병원|면접|예약|모임|결혼식|생일|진료|상담|발표|콘서트|여행|치과|수업|레슨|출장/;
const WDC = "일월화수목금토";
function hourOf(h, mer){ h = +h; if (/오후|저녁|밤/.test(mer || "") && h < 12) h += 12; if (/오전|아침|새벽/.test(mer || "") && h === 12) h = 0; if (!mer && h >= 1 && h <= 6) h += 12; return h; }
export function parse(text, t, quests = []){
  let s = " " + String(text || "").replace(/\s+/g, " ") + " ", m, rule = null, date = t, time = "", etime = "", lv = null, quest = null, dateSet = false;
  const cut = re => { const x = s.match(re); if (x) s = s.replace(x[0], " "); return x; };
  const wd = str => [...new Set([...str].map(c => WDC.indexOf(c)).filter(i => i >= 0))].sort((a, b) => a - b);
  if (cut(/매일|날마다|하루\s*한\s*번/)) rule = EVERYDAY();
  else if (cut(/평일(마다)?/)) rule = {type:"week", days:[1,2,3,4,5]};
  else if (cut(/주말(마다)?/)) rule = {type:"week", days:[0,6]};
  else if ((m = cut(/격주\s*([월화수목금토일](?:[,\s·]*[월화수목금토일])*)\s*(요일)?(마다)?/))) rule = {type:"biweek", days:wd(m[1]), anchor:t};
  else if ((m = cut(/매주\s*([월화수목금토일](?:[,\s·]*[월화수목금토일])*)\s*(요일)?(마다)?/))) rule = {type:"week", days:wd(m[1])};
  else if ((m = cut(/(?:매달|매월)\s*(\d{1,2})\s*일(마다)?/))) rule = {type:"month", dates:[Math.min(31, Math.max(1, +m[1]))]};
  else if ((m = cut(/(\d{1,2})\s*일\s*마다/))) rule = {type:"every", n:Math.max(1, +m[1]), anchor:t};
  if (!rule){
    if (cut(/오늘/)) { date = t; dateSet = true; }
    else if (cut(/내일/)) { date = addD(t, 1); dateSet = true; }
    else if (cut(/모레/)) { date = addD(t, 2); dateSet = true; }
    else if (cut(/글피/)) { date = addD(t, 3); dateSet = true; }
    else if ((m = cut(/(\d{1,3})\s*일\s*(뒤|후)/))) { date = addD(t, +m[1]); dateSet = true; }
    else if ((m = cut(/다음\s*달\s*(\d{1,2})\s*일/))) { const x = pd(addM(t.slice(0, 8) + "01", 1)), last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); x.setDate(Math.min(+m[1], last)); date = dk(x); dateSet = true; }
    else if ((m = cut(/(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/))) { const y = m[1] ? +m[1] : +t.slice(0, 4); let d = `${y}-${pad(+m[2])}-${pad(+m[3])}`; if (!m[1] && d < t) d = `${y + 1}-${pad(+m[2])}-${pad(+m[3])}`; date = d; dateSet = true; }
    else if ((m = cut(/(\d{1,2})\/(\d{1,2})(?!\d)/))) { const y = +t.slice(0, 4); let d = `${y}-${pad(+m[1])}-${pad(+m[2])}`; if (d < t) d = `${y + 1}-${pad(+m[1])}-${pad(+m[2])}`; date = d; dateSet = true; }
    else if ((m = cut(/(다음\s*주|이번\s*주|담주)?\s*([월화수목금토일])요일/))) { let d = addD(sunStart(t), WDC.indexOf(m[2])); if (m[1] && /다음|담/.test(m[1])) d = addD(d, 7); else if (!m[1] && d < t) d = addD(d, 7); date = d; dateSet = true; }
  }
  const T1 = /(오전|오후|아침|저녁|밤|새벽)?\s*(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분|(반))?/;
  if ((m = cut(new RegExp(T1.source + /\s*(?:부터|~|-|–)\s*/.source + /(오전|오후|아침|저녁|밤|새벽)?\s*(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분|(반))?\s*(까지)?/.source)))) {
    const h1 = hourOf(m[2], m[1]), mi1 = m[3] ? +m[3] : m[4] ? 30 : 0; let h2 = hourOf(m[6], m[5] || m[1]); const mi2 = m[7] ? +m[7] : m[8] ? 30 : 0; if (h2 * 60 + mi2 <= h1 * 60 + mi1 && h2 < 12) h2 += 12;
    if (h1 < 24 && h2 < 24) { time = `${pad(h1)}:${pad(mi1)}`; etime = `${pad(h2)}:${pad(mi2)}`; } }
  else if ((m = cut(/(\d{1,2}):(\d{2})\s*(?:~|-|–|부터)\s*(\d{1,2}):(\d{2})/))) { time = `${pad(+m[1])}:${m[2]}`; etime = `${pad(+m[3])}:${m[4]}`; }
  else if ((m = cut(T1))) { const h = hourOf(m[2], m[1]), mi = m[3] ? +m[3] : m[4] ? 30 : 0; if (h < 24 && mi < 60) time = `${pad(h)}:${pad(mi)}`; }
  else if ((m = cut(/(\d{1,2}):(\d{2})/))) { if (+m[1] < 24 && +m[2] < 60) time = `${pad(+m[1])}:${m[2]}`; }
  if (cut(/(^|\s)(!|중요)(\s|$)/)) lv = "hard";
  if ((m = cut(/#(\S+)/))) { const k = m[1].toLowerCase(); quest = (quests.find(q => q.title.toLowerCase() === k) || quests.find(q => q.title.toLowerCase().includes(k)) || {}).id || null; }
  const title = s.replace(/\s+/g, " ").replace(/^\s*(에|까지|부터)\s+/, "").replace(/\s+(에|까지|부터|에는)\s*$/, "").trim();
  const type = rule ? "h" : EVENT_WORDS.test(title) && (time || dateSet) ? "e" : "m";
  const area = AREA_WORDS.filter(([, re]) => re.test(text)).map(([k]) => k).slice(0, 2);
  return {type, title, date, time, etime, rule, area, lv, quest, dateSet};
}
export const parseMany = (text, t, quests) => String(text || "").split(/\n+/).map(l => l.replace(/^\s*[-*•·\d.)]+\s*/, "").trim()).filter(Boolean).slice(0, 30).map(l => parse(l, t, quests));
