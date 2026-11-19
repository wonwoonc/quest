/* 퀘스트라인 넥스트 — 화면과 동작 */
import {pad, dk, pd, addD, WD, diffDays, sunStart, md, tmFmt, dayLabel as dayL, daysLabel, LV, XP_M, XP_H, COIN, levelOf, mult, AREAS, AREA_KEYS, FREE, SHIELD_COST, CLEAR_XP, CLEAR_COIN, PRICES,
  habitOn, streak as streakOf, subsOf as subsOfS, qProg as qProgS, todayItems as todayItemsS, parse as parseS, blank, valid} from "./logic.js";
import {auth, store, api, site} from "./cloud.js";
import {BIZ, APP} from "./config.js";

/* ───────── 아이콘 ───────── */
const sv = (p, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${p}</svg>`;
const ic = {
  today:sv('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  quests:sv('<path d="M4 21V4h12l-2 4 2 4H4"/>'), record:sv('<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/>'), me:sv('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  plus:sv('<path d="M12 5v14M5 12h14"/>', 'stroke-width="2.6"'), check:sv('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'stroke-width="3.4"'),
  fire:'<svg viewBox="0 0 24 24" fill="#EE8420"><path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5 .1 1.6.8 2.7 2 3.2C11 8.5 11 5 12 2z"/></svg>',
  coin:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#E8B23A"/><circle cx="12" cy="12" r="6" fill="none" stroke="#B9851A" stroke-width="1.6"/></svg>',
  shield:'<svg viewBox="0 0 24 24" fill="none" stroke="#3B78DD" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z" fill="#3B78DD" fill-opacity=".18"/></svg>',
  chev:sv('<path d="M6 9l6 6 6-6"/>', 'stroke-width="2.4"'), left:sv('<path d="M15 6l-6 6 6 6"/>', 'stroke-width="2.4"'), right:sv('<path d="M9 6l6 6-6 6"/>', 'stroke-width="2.4"'), x:sv('<path d="M6 6l12 12M18 6L6 18"/>', 'stroke-width="2.4"'),
  spark:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" opacity=".7"/></svg>',
  trophy:sv('<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6"/>'), lock:sv('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 'stroke-width="2.2"'),
  ok:sv('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'stroke-width="2.6"'), moon:sv('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'), flag:sv('<path d="M5 21V4h12l-2.5 4.5L17 13H5"/>', 'stroke-width="2.4"')
};

/* ───────── 상태 ───────── */
const T = () => dk(new Date());
const dayLabel = s => dayL(s, T());
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const LS = {get(k){ try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (_) { return null; } }, set(k, v){ try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }};
const cacheKey = () => "qn:state:" + (auth.user ? auth.user.id : "guest");
let S = null, ENT = null, MODE = "boot", SYNC = "off", CFG = null, AILEFT = null;
const V = {tab:"today", quest:null, doneOpen:false, cal:T().slice(0, 7), sel:T(), shop:"do"};
const streak = () => streakOf(S, T());
const subsOf = id => subsOfS(S, id), qProg = q => qProgS(S, q), todayItems = () => todayItemsS(S, T()), parse = t => parseS(t, T());
const isMain = q => !q.parent;
const qName = id => { const q = S.quests.find(x => x.id === id); if (!q) return ""; const p = q.parent && S.quests.find(x => x.id === q.parent); return p ? `${p.title} › ${q.title}` : q.title; };
function effective(e){ if (!e || e.plan !== "pass" || !e.period_end) return {plan:"free", status:e ? e.status : "none"}; const end = new Date(e.period_end).getTime(), g = e.status === "past_due" ? 3 * 864e5 : 0; return end + g > Date.now() ? {plan:"pass", status:e.status, period_end:e.period_end, interval:e.interval} : {plan:"free", status:"expired"}; }
const pass = () => !!(ENT && ENT.plan === "pass");

/* ───────── 저장 ───────── */
let saveT = null;
function save(){
  S.updatedAt = Date.now(); LS.set(cacheKey(), S);
  if (!auth.user) return;
  clearTimeout(saveT); setSync("saving");
  saveT = setTimeout(async () => { try { await store.save(S); setSync("on"); } catch (e) { setSync("err"); if (e.code === "session_not_found") { toast("로그인이 만료됐어요. 다시 로그인해 주세요."); MODE = "auth"; render(); } } }, 900);
}
function setSync(s){ SYNC = s; const el = document.getElementById("sync"); if (el) { el.className = "sync " + (s === "err" ? "err" : s === "off" ? "off" : ""); el.lastChild.textContent = s === "saving" ? "저장 중" : s === "err" ? "저장 실패 · 다시 시도해요" : s === "off" ? "이 기기에만 저장" : "저장됨"; } }
addEventListener("online", () => { if (auth.user && SYNC === "err") save(); });
const ev = name => { try { store.event(name); } catch (_) {} };

function monthlyShields(){ const m = T().slice(0, 7); if (S.user.shieldMonth !== m) { S.user.shields = Math.min(8, (S.user.shields || 0) + (pass() ? 4 : 1)); S.user.shieldMonth = m; } }

/* ───────── 보상 ───────── */
let lastPt = {x:innerWidth / 2, y:innerHeight / 2};
document.addEventListener("pointerdown", e => { lastPt = {x:e.clientX, y:e.clientY}; }, true);
function award(kind, item, on){
  const lv = item.lv || "normal";
  if (on){
    const xp = Math.round((kind === "h" ? XP_H[lv] : XP_M[lv]) * mult(streak())), c = COIN[lv], before = levelOf(S.user.xp).L;
    item.award = {xp, c}; S.user.xp += xp; S.user.coins += c;
    (item.area || []).forEach(a => S.stats[a] = (S.stats[a] || 0) + Math.ceil(xp / 10));
    float(`+${xp} XP`, kind === "h");
    const after = levelOf(S.user.xp).L; if (after > before) setTimeout(() => levelUp(after), 450);
  } else if (item.award){
    S.user.xp = Math.max(0, S.user.xp - item.award.xp); S.user.coins = Math.max(0, S.user.coins - item.award.c);
    (item.area || []).forEach(a => S.stats[a] = Math.max(0, (S.stats[a] || 0) - Math.ceil(item.award.xp / 10))); delete item.award;
  }
}
function checkClear(){ const t = T(), it = todayItems().filter(x => x.k !== "e"); if (!it.length || it.some(x => !x.done) || S.user.clear[t]) return; S.user.clear[t] = 1; S.user.xp += CLEAR_XP; S.user.coins += CLEAR_COIN; toast(`오늘 퀘스트 클리어! 보너스 +${CLEAR_XP} XP, +${CLEAR_COIN} 코인`); }
function toggle(k, id){
  const t = T();
  if (k === "h"){ const h = S.habits.find(x => x.id === id); if (!h) return; h.log = h.log || {}; h.aw = h.aw || {}; const on = !h.log[t];
    if (on){ h.log[t] = 1; award("h", h, true); h.aw[t] = h.award; delete h.award; } else { delete h.log[t]; h.award = h.aw[t]; award("h", h, false); delete h.aw[t]; } }
  else if (k === "m"){ const m = S.missions.find(x => x.id === id); if (!m) return; m.done = !m.done; m.doneAt = m.done ? t : null; award("m", m, m.done); }
  else if (k === "e"){ const e = S.events.find(x => x.id === id); if (e) e.done = !e.done; }
  if (!S.user.firstCheck){ S.user.firstCheck = t; ev("first_check"); }
  S.user.best = Math.max(S.user.best || 0, streak()); checkClear(); save(); render();
}

/* ───────── AI 퀘스트 마스터 ───────── */
function basicPlan(goal, deadline){ // 서버 AI를 쓸 수 없을 때: 목표 키워드로 만든 기본 틀
  const t = T(), end = deadline || addD(t, 90), span = Math.max(21, diffDays(t, end)), d1 = addD(t, Math.round(span * .3)), d2 = addD(t, Math.round(span * .7)), g = goal.trim();
  let area = ["growth"], st, hb, ms;
  if (/토익|영어|토플|오픽|회화/.test(g)) { st = ["현재 실력 진단과 약점 정리","파트별 집중 공략","실전 모의고사 반복"]; hb = [["영단어 30개","07:30"]]; ms = ["모의고사 1회로 지금 점수 재기","약한 파트 3개 고르기","교재 1권 정하기"]; }
  else if (/다이어트|살|체중|감량/.test(g)) { area = ["health"]; st = ["식단 기록 습관 만들기","운동 루틴 정착","목표 체중 유지 연습"]; hb = [["식단 사진 남기기","20:00"]]; ms = ["오늘 체중과 허리둘레 재기","일주일 식단 짜기","집 근처 운동 장소 정하기"]; }
  else if (/마라톤|달리기|러닝|km/.test(g)) { area = ["health"]; st = ["30분 쉬지 않고 달리기","주 3회 5km","장거리 적응"]; hb = [["아침 달리기","07:00"]]; ms = ["러닝화 점검","지금 5km 기록 재기","대회 일정 찾아보기"]; }
  else if (/돈|저축|모으|적금|만원|투자/.test(g)) { area = ["money"]; st = ["지출 파악","고정비 줄이기","자동 저축 굴리기"]; hb = [["가계부 쓰기","22:00"]]; ms = ["지난달 카드 내역 정리","구독 서비스 정리","자동이체 적금 만들기"]; }
  else if (/책|독서|권/.test(g)) { st = ["읽을 목록 만들기","하루 20쪽 습관","기록과 공유"]; hb = [["책 20쪽 읽기","22:30"]]; ms = ["읽을 책 5권 고르기","첫 책 주문하기","독서 기록 양식 정하기"]; }
  else if (/이직|취업|면접|이력서|포트폴리오/.test(g)) { area = ["career"]; st = ["이력서·포트폴리오 정리","지원과 네트워킹","면접 준비"]; hb = [["채용 공고 3개 보기","12:30"]]; ms = ["경력 기술서 초안 쓰기","지원할 회사 10곳 목록","지인 1명에게 커피 요청"]; }
  else { st = ["준비와 계획","꾸준히 실행","마무리 점검"]; hb = [[`${g.slice(0, 12)} 30분`,"21:00"]]; ms = ["목표를 구체적인 숫자로 적기","필요한 준비물 정리","첫 30분 해 보기"]; }
  return {title:g.slice(0, 40), area, stages:[{title:st[0], due:d1},{title:st[1], due:d2},{title:st[2], due:end}], habits:hb.map(([title, time]) => ({title, days:[0,1,2,3,4,5,6], time})), missions:ms.map((title, i) => ({title, due:addD(t, i), time:""})), source:"basic"};
}
function applyPlan(p){
  const qid = uid(), t = T(), end = p.stages.length ? p.stages[p.stages.length - 1].due : addD(t, 90);
  S.quests.push({id:qid, title:p.title, parent:null, area:p.area, due:end, status:"active", createdAt:Date.now()});
  const sids = p.stages.map(s => { const id = uid(); S.quests.push({id, title:s.title, parent:qid, due:s.due, status:"active", createdAt:Date.now()}); return id; });
  p.habits.forEach(h => S.habits.push({id:uid(), title:h.title, quest:qid, days:h.days, time:h.time, area:p.area, lv:"easy", log:{}, createdAt:t}));
  p.missions.forEach(m => S.missions.push({id:uid(), title:m.title, quest:sids[0] || qid, due:m.due, time:m.time, area:p.area, lv:"normal", done:false}));
  S.user.xp += 50; S.user.coins += 20; save(); return qid;
}

/* ───────── 화면 조각 ───────── */
function avatar(size){ const L = levelOf(S.user.xp).L;
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><circle cx="50" cy="104" r="44" fill="var(--accent-soft)"/>
    ${L >= 5 ? '<path d="M28 68 Q50 54 72 68 L80 100 L20 100z" fill="var(--warn)" opacity=".85"/>' : ""}<rect x="32" y="62" width="36" height="38" rx="14" fill="var(--accent)"/>
    <circle cx="50" cy="44" r="20" fill="#F6D2B4"/><path d="M30 42 Q32 22 50 22 Q68 22 70 42 Q62 32 50 34 Q38 32 30 42z" fill="#3A2A22"/>
    <circle cx="43" cy="46" r="2.4" fill="#2A1E18"/><circle cx="57" cy="46" r="2.4" fill="#2A1E18"/><path d="M45 53 Q50 57 55 53" stroke="#2A1E18" stroke-width="2" fill="none" stroke-linecap="round"/>
    ${L >= 10 ? '<path d="M37 24 L41 14 L46 21 L50 11 L54 21 L59 14 L63 24z" fill="#E8B23A"/>' : ""}${L >= 20 ? '<path d="M80 18l2.4 6.6L89 27l-6.6 2.4L80 36l-2.4-6.6L71 27l6.6-2.4z" fill="#E8B23A"/>' : ""}</svg>`; }
function heroCard(){ const lv = levelOf(S.user.xp), st = streak();
  return `<section class="card hero"><div class="av">${avatar(76)}</div><div style="min-width:0"><div class="nm"><b>${esc(S.user.name)}</b><span class="lv">Lv${lv.L}</span>${pass() ? '<span class="tag m">패스</span>' : ""}</div>
    <div class="bar" role="progressbar" aria-label="다음 레벨까지" aria-valuemin="0" aria-valuemax="${lv.need}" aria-valuenow="${lv.rest}"><i style="width:${Math.round(lv.rest / lv.need * 100)}%"></i></div>
    <div class="stats"><span>${ic.fire}<b>${st}</b>일</span><span>${ic.coin}<b>${S.user.coins.toLocaleString()}</b></span><span title="휴식권">${ic.shield}<b>${S.user.shields}</b></span><span class="num" style="margin-left:auto;color:var(--muted)">${lv.rest}/${lv.need} XP</span></div></div></section>`; }
function rowHTML(it, ro){
  const cls = it.k === "h" ? "habit" : it.k === "e" ? "event" : "";
  const tag = it.k === "h" ? '<span class="tag h">일퀘</span>' : it.k === "e" ? '<span class="tag e">일정</span>' : '<span class="tag m">미션</span>';
  const sub = it.late ? `<span class="tag late">${dayLabel(it.due)} 미완료</span>` : it.k === "e" && it.etime ? `<span>~ ${tmFmt(it.etime)}</span>` : "";
  return `<div class="row ${it.done ? "done" : ""}" data-open="${it.k}:${it.id}" role="button" tabindex="0">
    <button class="ck ${cls} ${it.done ? "on" : ""}" ${ro ? "disabled" : `data-ck="${it.k}:${it.id}"`} aria-pressed="${it.done}" aria-label="${esc(it.title)} 완료">${ic.check}</button>
    <span class="t"><b>${esc(it.title)}</b><small>${tag}${sub}${it.quest ? `<span>${esc(qName(it.quest))}</span>` : ""}</small></span>${it.time ? `<span class="tm">${tmFmt(it.time)}</span>` : ""}</div>`; }
const syncBadge = () => `<span class="sync ${SYNC === "err" ? "err" : SYNC === "off" ? "off" : ""}" id="sync"><i></i>${SYNC === "saving" ? "저장 중" : SYNC === "err" ? "저장 실패 · 다시 시도해요" : SYNC === "off" ? "이 기기에만 저장" : "저장됨"}</span>`;

/* ───────── 탭: 오늘 ───────── */
function vToday(){
  const it = todayItems(), open = it.filter(x => !x.done), done = it.filter(x => x.done), timed = open.filter(x => x.time), later = open.filter(x => !x.time);
  const d = new Date(), mains = S.quests.filter(q => isMain(q) && q.status === "active");
  let h = `<header class="top"><h1>${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일<small>${open.length ? `남은 할 일 ${open.length}개` : it.length ? "오늘 할 일을 모두 끝냈어요" : "오늘은 비어 있어요"} · ${syncBadge()}</small></h1><button class="ib" data-act="theme" aria-label="화면 테마 바꾸기">${ic.moon}</button></header>${heroCard()}`;
  if (!S.quests.length && !S.habits.length && !S.missions.length) h += `<section class="card welcome"><h2>첫 목표를 정해 볼까요?</h2><p>이루고 싶은 것을 한 문장으로 적으면 AI 퀘스트 마스터가 스테이지, 매일 할 일, 이번 주 미션으로 나눠 줘요.</p><button class="btn" data-act="ai">${"목표 적기"}</button><button class="btn sec" data-act="add">할 일 하나만 적기</button></section>`;
  h += `<div class="sect"><h2>지금 할 일</h2><span class="c num">${timed.length}</span></div><section class="card list">${timed.map(x => rowHTML(x)).join("") || `<div class="empty"><b>시간이 정해진 할 일이 없어요</b>아래 + 버튼으로 "내일 7시 달리기"처럼 적어 보세요.</div>`}</section>`;
  if (later.length) h += `<div class="sect"><h2>시간 없이</h2><span class="c num">${later.length}</span></div><section class="card list">${later.map(x => rowHTML(x)).join("")}</section>`;
  if (done.length) h += `<section class="card list" style="margin-top:10px"><button class="fold ${V.doneOpen ? "open" : ""}" style="border-top:0" data-act="fold" aria-expanded="${V.doneOpen}">완료 ${done.length} ${ic.chev}</button>${V.doneOpen ? done.map(x => rowHTML(x)).join("") : ""}</section>`;
  if (it.filter(x => x.k !== "e").length && !open.filter(x => x.k !== "e").length) h += `<div class="clear">${ic.trophy}<div><b>오늘 퀘스트 클리어</b><small>연속 ${streak()}일째예요. 보너스 +${CLEAR_XP} XP, +${CLEAR_COIN} 코인을 받았어요.</small></div></div>`;
  if (mains.length) h += `<div class="sect"><h2>진행 중인 퀘스트</h2><button class="more" data-tab="quests">전체</button></div><div class="strip">${mains.map(q => { const p = qProg(q), pc = p.total ? Math.round(p.done / p.total * 100) : 0, dd = diffDays(T(), q.due);
    return `<button class="card qmini" data-q="${q.id}"><b>${esc(q.title)}</b><div class="bar"><i style="width:${pc}%"></i></div><div class="meta"><span>${p.done}/${p.total} 미션</span><span class="num">${dd >= 0 ? "D-" + dd : "D+" + -dd}</span></div></button>`; }).join("")}<button class="card qmini" data-act="ai" style="border:1.5px dashed var(--line);box-shadow:none;background:transparent"><b style="color:var(--accent)">+ 새 목표</b><div class="meta"><span>AI가 퀘스트로 쪼개 줘요</span></div></button></div>`;
  return h;
}

/* ───────── 탭: 퀘스트 ───────── */
function vQuests(){
  if (V.quest) return vQuestDetail(S.quests.find(q => q.id === V.quest));
  const act = S.quests.filter(q => isMain(q) && q.status === "active"), done = S.quests.filter(q => isMain(q) && q.status === "done");
  let h = `<header class="top"><h1>퀘스트<small>큰 목표 → 스테이지 → 오늘 할 미션</small></h1></header>` + act.map(qCard).join("");
  h += `<button class="newq" data-act="ai">${ic.spark}<span><b>새 메인 퀘스트</b>목표만 적으면 AI 퀘스트 마스터가 스테이지·일퀘·이번 주 미션으로 쪼개 줘요${!pass() ? ` <span class="tag">${act.length >= FREE.quests ? "패스 필요" : `무료 ${FREE.quests}개`}</span>` : ""}</span></button>`;
  if (done.length) h += `<div class="sect"><h2>달성</h2><span class="c num">${done.length}</span></div>` + done.map(qCard).join("");
  return h;
}
function qCard(q){ const p = qProg(q), pc = p.total ? Math.round(p.done / p.total * 100) : 0, dd = diffDays(T(), q.due), hs = S.habits.filter(h => h.quest === q.id && !h.archived);
  return `<button class="card qcard" data-q="${q.id}"><div class="h"><h3>${esc(q.title)}</h3>${q.status === "done" ? '<span class="dday">달성</span>' : `<span class="dday num ${dd < 0 ? "late" : ""}">${dd >= 0 ? "D-" + dd : "D+" + -dd}</span>`}</div>
    <div class="sub">${(q.area || []).map(a => `<span>${AREAS[a][1]}</span>`).join("")}<span>스테이지 ${p.sd}/${p.st}</span>${hs.length ? `<span>일퀘 ${hs.length}</span>` : ""}</div>
    <div class="prog"><div class="bar"><i style="width:${pc}%"></i></div><span class="num">${p.done}/${p.total} 미션</span></div></button>`; }
function vQuestDetail(q){
  if (!q){ V.quest = null; return vQuests(); }
  const par = q.parent && S.quests.find(x => x.id === q.parent), p = qProg(q), dd = diffDays(T(), q.due), subs = isMain(q) ? subsOf(q.id) : [];
  const ms = S.missions.filter(m => m.quest === q.id || (isMain(q) && subs.some(s => s.id === m.quest))).sort((a, b) => a.done - b.done || (a.due + (a.time || "99")).localeCompare(b.due + (b.time || "99")));
  const hs = S.habits.filter(h => h.quest === q.id && !h.archived);
  let h = `<header class="top"><button class="back" data-back="${par ? par.id : ""}">${ic.left}${par ? esc(par.title) : "퀘스트"}</button><span style="flex:1"></span><button class="ib" data-qedit="${q.id}" aria-label="퀘스트 수정">${sv('<path d="M4 20h4l10-10-4-4L4 16z"/>')}</button></header>`;
  h += `<section class="card qhead"><span class="crumb">${par ? "스테이지" : "메인 퀘스트"} · ${q.status === "done" ? "달성" : dd >= 0 ? `D-${dd} (${md(q.due)})` : `${-dd}일 지남`}</span><h2>${esc(q.title)}</h2>
    <div class="prog"><div class="bar"><i style="width:${p.total ? Math.round(p.done / p.total * 100) : 0}%"></i></div><span class="num">${p.done}/${p.total} 미션</span></div>
    ${q.status !== "done" ? `<button class="achieve" data-achieve="${q.id}" ${p.left ? "disabled" : ""}>${p.left ? `${p.st - p.sd ? `스테이지 ${p.st - p.sd}개 · ` : ""}미션 ${p.total - p.done}개를 끝내면 달성할 수 있어요` : `${par ? "스테이지" : "메인 퀘스트"} 달성하기`}</button>` : ""}</section>`;
  if (subs.length || (isMain(q) && q.status !== "done")) h += `<div class="sect"><h2>스테이지</h2><span class="c num">${p.sd}/${p.st}</span>${q.status !== "done" ? `<button class="more" data-stageadd="${q.id}">+ 스테이지</button>` : ""}</div>${subs.length ? `<div class="stg">${subs.map((s, i) => { const sp = qProg(s);
    return `<button class="card ${s.status === "done" ? "done" : ""}" data-q="${s.id}"><small class="num">STAGE ${i + 1}${s.status === "done" ? " · 완료" : ` · ${md(s.due)}까지`}</small><b>${esc(s.title)}</b><div class="bar"><i style="width:${sp.total ? Math.round(sp.done / sp.total * 100) : s.status === "done" ? 100 : 0}%"></i></div><small class="num">${sp.done}/${sp.total} 미션</small></button>`; }).join("")}</div>` : ""}`;
  if (hs.length) h += `<div class="sect"><h2>일일 퀘스트</h2><span class="c num">${hs.length}</span></div><section class="card list">${hs.map(x => rowHTML({k:"h", id:x.id, title:x.title, time:x.time, done:!!(x.log || {})[T()]})).join("")}</section>`;
  h += `<div class="sect"><h2>미션</h2><span class="c num">${ms.filter(m => m.done).length}/${ms.length}</span></div><section class="card list">${ms.map(m => rowHTML({k:"m", id:m.id, title:m.title, time:m.time, done:m.done, late:!m.done && m.due < T(), due:m.due, quest:isMain(q) && m.quest !== q.id ? m.quest : ""})).join("") || '<div class="empty">아직 미션이 없어요.</div>'}
    ${q.status !== "done" ? `<form class="inline-add" data-addto="${q.id}"><label class="sr" for="ia-${q.id}">미션 추가</label><input id="ia-${q.id}" placeholder="한 줄로 미션 추가 (예: 금요일 저녁 8시 모의고사)" autocomplete="off"><button>추가</button></form>` : ""}</section>`;
  return h;
}

/* ───────── 탭: 기록 ───────── */
function squares(hb, ym, head){ const [Y, M] = ym.split("-").map(Number), f = new Date(Y, M - 1, 1).getDay(), n = new Date(Y, M, 0).getDate(), t = T(); let c = "", k = 0;
  for (let i = 0; i < f; i++) c += '<i class="e"></i>';
  for (let d = 1; d <= n; d++){ const ds = `${ym}-${pad(d)}`, on = !!(hb.log || {})[ds]; if (on) k++; c += `<i class="${on ? "on" : ds > t || ds < (hb.createdAt || "") ? "fu" : ""}${ds === t ? " t" : ""}" title="${M}/${d}${on ? " 완료" : ""}"></i>`; }
  return `<div class="h"><b>${head ? esc(hb.title) : M + "월"}</b><span class="num">${k}일</span></div><div class="sq">${c}</div>`; }
function vRecord(){
  const [Y, M] = V.cal.split("-").map(Number), f = new Date(Y, M - 1, 1).getDay(), n = new Date(Y, M, 0).getDate(), t = T();
  const dots = d => { const a = []; if (S.missions.some(m => m.done && m.doneAt === d)) a.push("m"); if (S.habits.some(h => (h.log || {})[d])) a.push("h"); if (S.events.some(e => e.date === d)) a.push("e"); return a; };
  let cells = ""; for (let i = 0; i < f; i++) cells += "<span></span>";
  for (let d = 1; d <= n; d++){ const ds = `${V.cal}-${pad(d)}`, w = (f + d - 1) % 7; cells += `<button class="day ${ds === t ? "today" : ""} ${ds === V.sel ? "sel" : ""}" data-day="${ds}" aria-label="${M}월 ${d}일"><span class="n ${ds === t ? "" : w === 0 ? "sun" : w === 6 ? "sat" : ""}">${d}</span><span class="dots">${dots(ds).map(k => `<i class="${k}"></i>`).join("")}</span></button>`; }
  const sel = V.sel, items = [...S.missions.filter(m => (m.done ? m.doneAt : m.due) === sel).map(m => ({k:"m", id:m.id, title:m.title, time:m.time, done:m.done, quest:m.quest})), ...S.habits.filter(hb => (hb.log || {})[sel] || (sel >= t && habitOn(hb, sel))).map(hb => ({k:"h", id:hb.id, title:hb.title, time:hb.time, done:!!(hb.log || {})[sel]})), ...S.events.filter(e => e.date === sel).map(e => ({k:"e", id:e.id, title:e.title, time:e.time, done:!!e.done}))];
  let h = `<header class="top"><h1>기록</h1></header><section class="card cal"><div class="calh"><button class="ib" data-cal="-1" aria-label="이전 달">${ic.left}</button><b>${Y}년 ${M}월</b><button class="ib" data-cal="1" aria-label="다음 달">${ic.right}</button></div>
    <div class="wk">${WD.map((w, i) => `<span class="${i === 0 ? "sun" : i === 6 ? "sat" : ""}">${w}</span>`).join("")}</div><div class="days">${cells}</div></section>`;
  h += `<div class="sect"><h2>${dayLabel(sel)}</h2><span class="c num">${items.length}</span></div><section class="card list">${items.map(x => rowHTML(x, sel !== t)).join("") || '<div class="empty">이날 기록이 없어요.</div>'}</section>`;
  const hbs = S.habits.filter(x => !x.archived);
  h += `<div class="sect"><h2>일일 퀘스트 · 이번 달</h2><span class="c">눌러서 1년 보기</span></div><div class="hmrow">${hbs.map(hb => `<button class="card hm" data-year="${hb.id}">${squares(hb, t.slice(0, 7), true)}</button>`).join("") || '<div class="card empty">일일 퀘스트가 없어요.</div>'}</div>`;
  return h + weekly();
}
function weekly(){ const t = T(), s0 = sunStart(t), days = Array.from({length:7}, (_, i) => addD(s0, i)).filter(d => d <= t);
  const doneM = S.missions.filter(m => m.done && days.includes(m.doneAt)), mAll = S.missions.filter(m => days.includes(m.due) || (m.done && days.includes(m.doneAt))).length;
  let hs = 0, hd = 0; S.habits.forEach(hb => days.forEach(d => { if (habitOn(hb, d)){ hs++; if ((hb.log || {})[d]) hd++; } }));
  const ar = {}; AREA_KEYS.forEach(a => ar[a] = 0); doneM.forEach(m => (m.area || []).forEach(a => ar[a]++)); S.habits.forEach(hb => days.forEach(d => (hb.log || {})[d] && (hb.area || []).forEach(a => ar[a]++)));
  const mx = Math.max(1, ...Object.values(ar)), low = AREA_KEYS.filter(a => ar[a] === 0).map(a => AREAS[a][1]);
  const xp = doneM.reduce((s, m) => s + (m.award ? m.award.xp : 0), 0) + S.habits.reduce((s, hb) => s + days.reduce((x, d) => x + (((hb.aw || {})[d] || {}).xp || 0), 0), 0);
  const full = `<div class="abal">${AREA_KEYS.map(a => `<div><span>${AREAS[a][1]}</span><div class="bar"><i style="width:${Math.round(ar[a] / mx * 100)}%"></i></div><span class="num">${ar[a]}</span></div>`).join("")}</div>
    <div class="insight">${low.length ? `이번 주는 ${low.join(", ")} 쪽 기록이 없어요. 다음 주에 ${low[0]} 미션을 하나 넣어 볼까요?` : "다섯 영역을 고르게 챙긴 한 주예요."}</div>`;
  return `<div class="sect"><h2>이번 주 리포트</h2><span class="c">${md(s0)} – ${md(addD(s0, 6))}</span></div><section class="card report"><h3>${streak()}일 연속 진행 중</h3><p>일요일부터 토요일까지의 기록이에요.</p>
    <div class="kpis"><div class="kpi"><b>${doneM.length}<small style="font-size:13px">/${mAll}</small></b><small>미션</small></div><div class="kpi"><b>${hs ? Math.round(hd / hs * 100) : 0}<small style="font-size:13px">%</small></b><small>일퀘 달성</small></div><div class="kpi"><b>${xp}</b><small>얻은 XP</small></div></div>
    ${pass() ? full : `<div class="locked"><div class="blur" aria-hidden="true">${full}</div><div class="cta"><button class="pill" data-act="pay" data-why="report">${ic.lock}영역별 리포트 보기</button></div></div>`}</section>`; }

/* ───────── 탭: 나 ───────── */
function vMe(){ const lv = levelOf(S.user.xp);
  const pent = (() => { const cx = 120, cy = 112, R = 78, k = AREA_KEYS, mx = Math.max(40, ...k.map(a => S.stats[a] || 0)), pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    return `<svg class="pent" viewBox="0 0 240 228" width="240" role="img" aria-label="능력치">${[1, .66, .33].map(f => `<polygon points="${k.map((_, i) => pt(i, R * f).join(",")).join(" ")}" fill="none" stroke="var(--line)"/>`).join("")}
      <polygon points="${k.map((a, i) => pt(i, R * Math.max(.06, (S.stats[a] || 0) / mx)).join(",")).join(" ")}" fill="var(--accent)" fill-opacity=".28" stroke="var(--accent)" stroke-width="2"/>
      ${k.map((a, i) => { const [x, y] = pt(i, R + 20); return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="600" fill="var(--sub)">${AREAS[a][0]} <tspan font-family="Space Grotesk" fill="var(--ink)">${S.stats[a] || 0}</tspan></text>`; }).join("")}</svg>`; })();
  let h = `<header class="top"><h1>나</h1><button class="ib" data-act="theme" aria-label="화면 테마 바꾸기">${ic.moon}</button></header>
    <section class="card me"><div class="av">${avatar(110)}</div><div style="min-width:0"><div class="nm" style="display:flex;gap:6px;align-items:baseline"><b style="font-size:20px">${esc(S.user.name)}</b><span class="lv">Lv${lv.L}</span></div>
    <div class="bar"><i style="width:${Math.round(lv.rest / lv.need * 100)}%"></i></div><div class="stats"><span class="num">${lv.rest}/${lv.need} XP</span></div>
    <div class="stats" style="margin-top:6px"><span>${ic.fire}최장 <b>${Math.max(S.user.best || 0, streak())}</b>일</span><span>${ic.coin}<b>${S.user.coins.toLocaleString()}</b></span><span>${ic.shield}<b>${S.user.shields}</b></span></div></div></section>`;
  h += `<div class="sect"><h2>능력치</h2><span class="c">미션·일퀘의 영역에 따라 올라요</span></div><section class="card" style="padding:12px 8px 6px">${pent}</section>`;
  h += pass() ? `<section class="card" style="padding:14px 16px;margin-top:12px;display:flex;align-items:center;gap:10px"><span style="color:var(--accent);display:flex">${ic.ok.replace("<svg", '<svg width="22" height="22"')}</span><div style="flex:1"><b>퀘스트 패스 사용 중</b><div style="font-size:13px;color:var(--muted)">${ENT.status === "trialing" ? `무료 체험 · ${md(ENT.period_end.slice(0, 10))}에 첫 결제` : ENT.status === "canceled" ? `해지 예약됨 · ${md(ENT.period_end.slice(0, 10))}까지 이용` : `${ENT.interval === "year" ? "연간" : "월간"} · 다음 결제 ${md(ENT.period_end.slice(0, 10))}`}</div></div><button class="chip" data-act="manage">관리</button></section>`
    : `<div style="margin-top:12px"><button class="passcard" data-act="pay" data-why="me">${ic.spark}<div><b>퀘스트 패스</b><small>무제한 퀘스트 · AI 퀘스트 마스터 · 휴식권 월 4장 · 전체 리포트</small></div></button></div>`;
  h += `<div class="sect"><h2>휴식권</h2><span class="c">하루를 쉬어도 연속 기록이 이어져요</span></div><section class="card" style="padding:14px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">${ic.shield.replace("<svg", '<svg width="34" height="34" style="flex:none"')}<div style="flex:1;min-width:140px"><b class="num" style="font-size:18px">${S.user.shields}장</b><div style="font-size:12.5px;color:var(--muted)">매달 ${pass() ? 4 : 1}장씩 생겨요. 어제를 놓쳤다면 지금 써서 기록을 살릴 수 있어요</div></div><button class="chip" data-act="shield-use" ${S.user.shields ? "" : "disabled"}>어제 쓰기</button><button class="chip" data-act="shield-buy" style="background:var(--habit-soft);color:var(--habit)">${SHIELD_COST} 코인</button></section>`;
  h += `<div class="sect"><h2>보상 상점</h2><span class="c">코인으로 나에게 주는 보상</span></div><div class="shop-tabs">${[["do","경험"],["get","아이템"],["log","받은 보상"]].map(([k, l]) => `<button class="chip" data-shop="${k}" aria-pressed="${V.shop === k}">${l}</button>`).join("")}</div>`;
  if (V.shop === "log") h += `<section class="card list">${S.buys.slice().reverse().map(b => `<div class="row"><span class="t"><b>${esc(b.name)}</b><small>${dayLabel(b.at)} · ${b.type === "get" ? "아이템" : "경험"}</small></span><span class="tm" style="color:var(--gold)">−${b.cost}</span></div>`).join("") || '<div class="empty">아직 받은 보상이 없어요.</div>'}</section>`;
  else h += `<div class="rw">${S.rewards.filter(r => r.type === V.shop).map(r => `<button class="card" data-buy="${r.id}"><b>${esc(r.name)}</b><span class="cost">${ic.coin}${r.cost}</span></button>`).join("")}<button class="card" data-act="reward-add" style="border:1.5px dashed var(--line);box-shadow:none;background:transparent"><b style="color:var(--accent)">+ ${V.shop === "get" ? "아이템" : "경험"} 추가</b><span style="font-size:12.5px;color:var(--muted)">${V.shop === "get" ? "갖고 싶은 것" : "하고 싶은 것"}</span></button></div>`;
  h += `<div class="sect"><h2>계정</h2></div><div class="set" style="margin-top:0">${auth.user ? `<button data-act="noop" style="cursor:default">로그인<span>${esc(auth.user.email || "소셜 로그인")}</span></button>${pass() ? '<button data-act="manage">구독 관리<span>해지·결제 내역</span></button>' : ""}` : `<button data-act="login">로그인하고 기록 지키기<span>지금은 이 기기에만 저장돼요</span></button>`}
    <button data-act="rename">이름 바꾸기<span>${esc(S.user.name)}</span></button><button data-act="legal">약관과 정책<span>이용약관 · 환불 · 개인정보</span></button>
    ${auth.user ? '<button data-act="logout">로그아웃</button><button data-act="delete" style="color:var(--warn)">회원 탈퇴<span>기록과 구독이 모두 지워져요</span></button>' : ""}</div>${bizLine()}`;
  return h;
}
const bizLine = () => `<p class="biz">${esc(BIZ.name)}${BIZ.ceo ? ` · 대표 ${esc(BIZ.ceo)}` : ""}${BIZ.regNo ? ` · 사업자등록번호 ${esc(BIZ.regNo)}` : ""}${BIZ.mailOrderNo ? ` · 통신판매업 ${esc(BIZ.mailOrderNo)}` : ""}<br>${BIZ.address ? esc(BIZ.address) + " · " : ""}${BIZ.phone ? esc(BIZ.phone) + " · " : ""}${esc(BIZ.email)} · <a href="legal.html">약관과 정책</a></p>`;

/* ───────── 로그인 화면 ───────── */
let authTab = "in", authMsg = "", authOk = "";
function vAuth(){
  return `<div class="auth"><div class="brand"><span class="mk">${ic.flag}</span><b>${esc(APP.name)}</b></div>
    <div><h1>인생의 큰 목표를<br>오늘의 퀘스트로</h1><p class="lead">목표를 적으면 스테이지와 오늘 할 미션으로 나눠 드려요. 체크할 때마다 레벨이 올라요.</p></div>
    <section class="card"><div class="seg" role="group" aria-label="로그인 또는 가입"><button data-auth="in" aria-pressed="${authTab === "in"}">로그인</button><button data-auth="up" aria-pressed="${authTab === "up"}">가입하기</button></div>
    <form id="authf"><div class="field"><label for="au-e">이메일</label><input id="au-e" type="email" autocomplete="email" required></div>
    <div class="field"><label for="au-p">비밀번호</label><input id="au-p" type="password" minlength="8" autocomplete="${authTab === "up" ? "new-password" : "current-password"}" required placeholder="${authTab === "up" ? "8자 이상" : ""}"></div>
    ${authTab === "up" ? `<label style="display:flex;gap:8px;align-items:flex-start;font-size:13.5px;color:var(--sub);margin:-2px 0 12px"><input id="au-ok" type="checkbox" required style="margin-top:4px"><span>만 14세 이상이며 <a href="legal.html#terms" target="_blank" rel="noopener">이용약관</a>과 <a href="legal.html#privacy" target="_blank" rel="noopener">개인정보처리방침</a>에 동의해요</span></label>` : ""}
    ${authMsg ? `<p class="err" role="alert">${esc(authMsg)}</p>` : ""}${authOk ? `<p class="ok" role="status">${esc(authOk)}</p>` : ""}
    <button class="btn" id="au-go">${authTab === "up" ? "가입하고 시작하기" : "로그인"}</button></form>
    ${authTab === "in" ? '<button class="link" data-act="forgot">비밀번호를 잊었어요</button>' : ""}
    ${APP.oauth.length ? `<div class="oauth">${APP.oauth.includes("kakao") ? '<button class="kakao" data-oauth="kakao">카카오로 계속하기</button>' : ""}${APP.oauth.includes("google") ? '<button data-oauth="google">Google로 계속하기</button>' : ""}</div>` : ""}</section>
    <button class="guest" data-act="guest">로그인 없이 둘러보기</button>
    <p class="foot">${bizLine().replace(/<\/?p[^>]*>/g, "")}</p></div>`;
}

/* ───────── 시트 ───────── */
const layer = document.getElementById("layer");
function sheet(html, label){ layer.innerHTML = `<div class="scrim" data-scrim><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label || "")}"><div class="grab"></div>${html}</div></div>`; const f = layer.querySelector("[autofocus]"); if (f) setTimeout(() => f.focus(), 60); }
const close = () => { layer.innerHTML = ""; };
const head = t => `<h3>${t}<button class="ib" data-close aria-label="닫기">${ic.x}</button></h3>`;
const repaint = html => { const s = layer.querySelector(".sheet"); if (s) s.innerHTML = '<div class="grab"></div>' + html; };

function loginSheet(why){
  sheet(`${head("로그인이 필요해요")}<p style="margin:-6px 0 14px;color:var(--sub)">${esc(why)} 지금까지 이 기기에 적은 기록은 로그인한 계정으로 옮겨져요.</p><button class="btn" data-act="to-auth">로그인 · 가입하기</button><button class="btn sec" data-close>나중에</button>`, "로그인");
}
function openAdd(){
  let forced = null;
  sheet(`${head("무엇을 할까요?")}<label class="sr" for="qi">할 일 한 줄 입력</label><input class="qi" id="qi" autocomplete="off" placeholder="내일 아침 7시 달리기 3km" autofocus enterkeyhint="done">
    <div class="parsed" id="qp" aria-live="polite"></div><div class="types">${[["m","미션"],["h","일퀘"],["e","일정"]].map(([k, l]) => `<button class="chip ${k}" data-ty="${k}" aria-pressed="false">${l}</button>`).join("")}</div>
    <button class="btn" id="qadd" disabled>추가</button><p class="hint">날짜·시간·반복은 문장에서 알아서 읽어요. 예: <code>매일 7시 반 영단어 30개</code> <code>금요일 오후 2시 치과 예약</code></p>`, "할 일 추가");
  const inp = document.getElementById("qi"), qp = document.getElementById("qp"), btn = document.getElementById("qadd");
  const cur = () => { const p = parse(inp.value); return {p, ty:forced || p.type}; };
  const upd = () => { const {p, ty} = cur(), ch = [];
    if (inp.value.trim()){ ch.push(`<span class="tag ${ty}">${ty === "h" ? "일퀘" : ty === "e" ? "일정" : "미션"}</span>`, `<span class="tag">${ty === "h" ? daysLabel(p.days || [0,1,2,3,4,5,6]) : dayLabel(p.date)}</span>`); if (p.time) ch.push(`<span class="tag num">${tmFmt(p.time)}</span>`); p.area.forEach(a => ch.push(`<span class="tag">${AREAS[a][1]}</span>`)); if (p.title) ch.push(`<span class="tag" style="background:none;padding-left:0">“${esc(p.title)}”</span>`); }
    qp.innerHTML = ch.join(""); btn.disabled = !p.title; layer.querySelectorAll("[data-ty]").forEach(b => b.setAttribute("aria-pressed", b.dataset.ty === ty)); };
  inp.addEventListener("input", upd);
  layer.querySelectorAll("[data-ty]").forEach(b => b.addEventListener("click", () => { forced = forced === b.dataset.ty ? null : b.dataset.ty; upd(); inp.focus(); }));
  const go = () => { const {p, ty} = cur(); if (!p.title) return;
    if (ty === "h"){ if (!pass() && S.habits.filter(h => !h.archived).length >= FREE.habits){ close(); paywall("habits"); return; } S.habits.push({id:uid(), title:p.title, quest:null, days:p.days || [0,1,2,3,4,5,6], time:p.time, area:p.area, lv:"easy", log:{}, createdAt:T()}); }
    else if (ty === "e") S.events.push({id:uid(), title:p.title, date:p.date, time:p.time || "09:00", etime:p.time ? `${pad(Math.min(23, +p.time.slice(0, 2) + 1))}:${p.time.slice(3)}` : "10:00"});
    else S.missions.push({id:uid(), title:p.title, quest:null, due:p.date, time:p.time, area:p.area, lv:"normal", done:false});
    save(); close(); toast(`${ty === "h" ? "일퀘" : ty === "e" ? "일정" : "미션"}을 추가했어요 · ${ty === "h" ? daysLabel(p.days || [0,1,2,3,4,5,6]) : dayLabel(p.date)}${p.time ? " " + tmFmt(p.time) : ""}`); render(); };
  btn.addEventListener("click", go); inp.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing){ e.preventDefault(); go(); } });
}
function openItem(k, id){
  const o = k === "h" ? S.habits.find(x => x.id === id) : k === "e" ? S.events.find(x => x.id === id) : S.missions.find(x => x.id === id); if (!o) return;
  const qs = S.quests.filter(q => q.status === "active");
  sheet(`${head(k === "h" ? "일일 퀘스트" : k === "e" ? "일정" : "미션")}
    <div class="field"><label for="it-t">이름</label><input id="it-t" value="${esc(o.title)}" maxlength="60"></div>
    ${k === "m" ? `<div class="field"><label for="it-d">날짜</label><input id="it-d" type="date" value="${o.due}"></div>` : k === "e" ? `<div class="field"><label for="it-d">날짜</label><input id="it-d" type="date" value="${o.date}"></div>` : `<div class="field"><label>반복</label><div style="display:flex;gap:6px;flex-wrap:wrap">${WD.map((w, i) => `<button class="chip" data-wd="${i}" aria-pressed="${o.days.includes(i)}">${w}</button>`).join("")}</div></div>`}
    <div class="field"><label for="it-tm">시간</label><input id="it-tm" type="time" value="${o.time || ""}"></div>
    ${k !== "e" ? `<div class="field"><label for="it-q">연결한 퀘스트</label><select id="it-q"><option value="">연결 안 함</option>${qs.filter(q => k === "m" || isMain(q)).map(q => `<option value="${q.id}" ${o.quest === q.id ? "selected" : ""}>${esc(qName(q.id))}</option>`).join("")}</select></div>
    <div class="field"><label for="it-lv">난이도 (보상이 달라져요)</label><select id="it-lv">${Object.entries(LV).map(([v, l]) => `<option value="${v}" ${o.lv === v ? "selected" : ""}>${l} · +${(k === "h" ? XP_H : XP_M)[v]} XP</option>`).join("")}</select></div>` : ""}
    ${k === "m" && !o.done ? `<button class="btn sec" data-it="tomorrow">내일로 미루기</button>` : ""}<button class="btn" data-it="save">저장</button><button class="btn sec" data-it="del" style="color:var(--warn)">${k === "h" ? "보관하기" : "삭제"}</button>`, "할 일 수정");
  const days = k === "h" ? o.days.slice() : null;
  layer.querySelectorAll("[data-wd]").forEach(b => b.addEventListener("click", () => { const i = +b.dataset.wd, j = days.indexOf(i); if (j >= 0){ if (days.length > 1) days.splice(j, 1); } else days.push(i); days.sort((a, c) => a - c); layer.querySelectorAll("[data-wd]").forEach(x => x.setAttribute("aria-pressed", days.includes(+x.dataset.wd))); }));
  layer.querySelectorAll("[data-it]").forEach(b => b.addEventListener("click", () => { const a = b.dataset.it, g = s => document.getElementById(s);
    if (a === "save"){ o.title = g("it-t").value.trim() || o.title; o.time = g("it-tm").value; if (k === "m") o.due = g("it-d").value || o.due; if (k === "e") o.date = g("it-d").value || o.date; if (days) o.days = days; if (g("it-q")) o.quest = g("it-q").value || null; if (g("it-lv")) o.lv = g("it-lv").value; toast("저장했어요"); }
    if (a === "tomorrow"){ o.due = addD(T(), 1); toast("내일로 옮겼어요"); }
    if (a === "del"){ if (k === "h"){ o.archived = true; toast("보관했어요"); } else { if (k === "m" && o.done) award("m", o, false); const arr = k === "e" ? S.events : S.missions; arr.splice(arr.indexOf(o), 1); toast("삭제했어요"); } }
    save(); close(); render(); }));
}
function editQuest(id){
  const q = S.quests.find(x => x.id === id); if (!q) return;
  sheet(`${head(q.parent ? "스테이지 수정" : "메인 퀘스트 수정")}<form id="qf"><div class="field"><label for="qe-t">이름</label><input id="qe-t" value="${esc(q.title)}" maxlength="60" required></div><div class="field"><label for="qe-d">마감</label><input id="qe-d" type="date" value="${q.due}" required></div>
    ${q.parent ? "" : `<div class="field"><label>영역</label><div style="display:flex;gap:6px;flex-wrap:wrap">${AREA_KEYS.map(a => `<button type="button" class="chip" data-ar="${a}" aria-pressed="${(q.area || []).includes(a)}">${AREAS[a][1]}</button>`).join("")}</div></div>`}
    <button class="btn">저장</button><button type="button" class="btn sec" id="qe-del" style="color:var(--warn)">삭제</button></form>`, "퀘스트 수정");
  const area = (q.area || []).slice();
  layer.querySelectorAll("[data-ar]").forEach(b => b.addEventListener("click", () => { const a = b.dataset.ar, j = area.indexOf(a); if (j >= 0) area.splice(j, 1); else if (area.length < 2) area.push(a); layer.querySelectorAll("[data-ar]").forEach(x => x.setAttribute("aria-pressed", area.includes(x.dataset.ar))); }));
  document.getElementById("qf").addEventListener("submit", e => { e.preventDefault(); q.title = document.getElementById("qe-t").value.trim() || q.title; q.due = document.getElementById("qe-d").value || q.due; if (!q.parent) q.area = area; save(); close(); render(); toast("저장했어요"); });
  const del = document.getElementById("qe-del");
  del.addEventListener("click", () => { if (del.dataset.sure !== "1"){ del.dataset.sure = "1"; del.textContent = "한 번 더 누르면 미션까지 모두 지워져요"; return; }
    const ids = [q.id, ...subsOf(q.id).map(s => s.id)]; S.missions = S.missions.filter(m => !ids.includes(m.quest)); S.habits.forEach(h => { if (ids.includes(h.quest)) h.quest = null; }); S.quests = S.quests.filter(x => !ids.includes(x.id));
    V.quest = q.parent || null; save(); close(); render(); toast("삭제했어요"); });
}
function addStage(pid){ const p = S.quests.find(x => x.id === pid); if (!p) return;
  formSheet("스테이지 추가", [{id:"st-t", label:"이름", ph:"실전 모의고사 10회", first:true},{id:"st-d", label:"마감", type:"date", value:p.due}], v => { if (!v["st-t"]) return false; S.quests.push({id:uid(), title:v["st-t"].slice(0, 60), parent:pid, due:v["st-d"] || p.due, status:"active", createdAt:Date.now()}); }); }

function openAI(){
  if (!pass() && S.quests.filter(q => isMain(q) && q.status === "active").length >= FREE.quests){ paywall("quests"); return; }
  sheet(`${head(`<span style="color:var(--accent);display:flex">${ic.spark.replace("<svg", '<svg width="20" height="20"')}</span> AI 퀘스트 마스터`)}
    <div class="ai" id="aibox"><div class="bub ai1">이루고 싶은 목표를 알려 주세요. 스테이지, 매일 할 일, 이번 주 미션으로 나눠 드릴게요.</div></div>
    <form id="aiform" style="margin-top:12px"><div class="field"><label for="ai-g">목표</label><input id="ai-g" placeholder="내년 3월까지 토익 900점" autocomplete="off" autofocus required maxlength="120"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="field"><label for="ai-d">마감</label><input id="ai-d" type="date" min="${addD(T(), 7)}"></div><div class="field"><label for="ai-h">하루에 쓸 시간</label><select id="ai-h"><option value="">모르겠음</option><option>30분</option><option selected>1시간</option><option>2시간 이상</option></select></div></div>
    <div class="field"><label for="ai-n">지금 상태 <span style="font-weight:500;color:var(--muted)">(선택)</span></label><input id="ai-n" placeholder="지금 750점, 출퇴근 시간에만 공부 가능" autocomplete="off" maxlength="160"></div>
    <button class="btn">퀘스트로 쪼개기</button>${AILEFT && !pass() ? `<p class="hint" style="text-align:center">${AILEFT.left > 0 ? `무료로 ${AILEFT.left}번 더 써 볼 수 있어요` : "무료 AI 체험을 다 썼어요. 기본 틀로 만들 수 있어요"}</p>` : ""}</form>`, "AI 퀘스트 마스터");
  document.getElementById("aiform").addEventListener("submit", async e => { e.preventDefault();
    const g = document.getElementById("ai-g").value.trim(); if (!g) return; const dl = document.getElementById("ai-d").value, hr = document.getElementById("ai-h").value, nw = document.getElementById("ai-n").value.trim();
    const box = document.getElementById("aibox"); e.target.hidden = true;
    box.insertAdjacentHTML("beforeend", `<div class="bub me1">${esc(g)}${dl ? ` · ${md(dl)}까지` : ""}${nw ? `<br><small>${esc(nw)}</small>` : ""}</div><div class="think" id="aith"><i></i><i></i><i></i>퀘스트를 설계하고 있어요</div>`);
    let plan, note = "";
    if (!auth.user){ plan = basicPlan(g, dl); note = "로그인하면 AI가 목표에 맞춰 더 자세히 설계해 드려요. 지금은 기본 틀로 나눴어요."; }
    else try { const r = await api("ai-plan", {goal:g, deadline:dl, hours:hr, now:nw, today:T()}); plan = r.plan; AILEFT = {left:r.left}; ev("ai_used"); }
    catch (er) { if (er.code === "need_pass"){ close(); paywall("ai"); return; } plan = basicPlan(g, dl); note = er.code === "not_configured" ? "AI 연결을 준비하고 있어요. 지금은 기본 틀로 나눴어요." : er.code === "limit" ? er.message + " 지금은 기본 틀로 나눴어요." : "AI 응답을 받지 못해 기본 틀로 나눴어요."; }
    const th = document.getElementById("aith"); if (th) th.remove(); if (!document.getElementById("aibox")) return;
    box.insertAdjacentHTML("beforeend", `<div class="bub ai1">${note || "이렇게 나눠 봤어요."}</div><div class="plan"><h4>${esc(plan.title)}</h4>
      <div class="grp"><small>스테이지</small>${plan.stages.map((s, i) => `<div class="it"><b class="num">${i + 1}</b>${esc(s.title)}<span class="num">${md(s.due)}까지</span></div>`).join("")}</div>
      <div class="grp"><small>일일 퀘스트</small>${plan.habits.map(h => `<div class="it"><span style="color:var(--habit)">■</span>${esc(h.title)}<span class="num">${daysLabel(h.days)}${h.time ? " " + tmFmt(h.time) : ""}</span></div>`).join("")}</div>
      <div class="grp"><small>이번 주 미션</small>${plan.missions.map(m => `<div class="it"><span style="color:var(--accent)">●</span>${esc(m.title)}<span class="num">${dayLabel(m.due)}</span></div>`).join("")}</div></div>
      <button class="btn" id="aigo">이대로 시작 · +50 XP</button><button class="btn sec" id="aire">다시 적기</button>`);
    document.getElementById("aigo").addEventListener("click", () => { const hb = S.habits.filter(h => !h.archived).length; if (!pass() && hb + plan.habits.length > FREE.habits) plan.habits = plan.habits.slice(0, Math.max(0, FREE.habits - hb));
      const id = applyPlan(plan); close(); V.quest = id; location.hash = "quests"; render(); toast("새 메인 퀘스트를 시작했어요 · +50 XP"); });
    document.getElementById("aire").addEventListener("click", () => { close(); openAI(); });
  });
}

/* ───────── 결제 ───────── */
async function config(){ if (CFG) return CFG; try { CFG = await api("config"); } catch (_) { CFG = {ready:{}}; } return CFG; }
function loadSDK(){ return window.PortOne ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.portone.io/v2/browser-sdk.js"; s.onload = res; s.onerror = () => rej(new Error("결제 모듈을 불러오지 못했어요.")); document.head.appendChild(s); }); }
async function paywall(why){
  if (!auth.user){ loginSheet("퀘스트 패스는 로그인한 계정에 연결돼요."); return; }
  ev("paywall_view");
  const lead = {quests:`메인 퀘스트는 무료로 ${FREE.quests}개까지 만들 수 있어요`, habits:`일일 퀘스트는 무료로 ${FREE.habits}개까지 만들 수 있어요`, ai:"AI 퀘스트 마스터 무료 체험을 다 썼어요", report:"영역별 리포트는 퀘스트 패스에서 볼 수 있어요", me:"더 깊이, 더 오래 성장하고 싶다면"}[why] || "";
  let pick = "year", busy = false, msg = ""; const cfg = await config(), trial = !(ENT && ENT.trialUsed);
  const draw = () => `${head("퀘스트 패스")}<p style="margin:-6px 0 12px;color:var(--sub)">${lead}</p>
    <ul class="perks">${["메인 퀘스트·일일 퀘스트 무제한","AI 퀘스트 마스터: 목표를 스테이지·미션으로 자동 분해","휴식권 매달 4장 (무료는 1장)","영역별 주간 리포트와 다음 주 제안"].map(x => `<li>${ic.ok}${x}</li>`).join("")}</ul>
    <div class="plans"><button class="plan-opt" data-plan="year" aria-pressed="${pick === "year"}"><div><b>연간<span class="save">48% 할인</span></b><small>${trial ? "7일 무료 체험 후 결제" : "1년마다 결제"}</small></div><div class="pr">${PRICES.year.toLocaleString()}원<small>월 ${Math.round(PRICES.year / 12).toLocaleString()}원</small></div></button>
    <button class="plan-opt" data-plan="month" aria-pressed="${pick === "month"}"><div><b>월간</b><small>바로 결제 · 언제든 해지</small></div><div class="pr">${PRICES.month.toLocaleString()}원<small>매달</small></div></button></div>
    ${msg ? `<p class="err" role="alert">${esc(msg)}</p>` : ""}
    <button class="btn" data-pay ${busy || !cfg.ready || !cfg.ready.pay ? "disabled" : ""}>${busy ? "처리 중…" : !cfg.ready || !cfg.ready.pay ? "결제 준비 중이에요" : pick === "year" && trial ? "7일 무료로 시작하기" : `${(pick === "year" ? PRICES.year : PRICES.month).toLocaleString()}원 결제하기`}</button><button class="btn sec" data-close>나중에</button>
    <p class="fine">${pick === "year" && trial ? `체험이 끝나는 ${md(addD(T(), 7))}에 ${PRICES.year.toLocaleString()}원이 결제되고 이후 1년마다 자동 결제돼요. 체험 중 해지하면 결제되지 않아요.` : "결제일 기준으로 자동 결제돼요."} 언제든 '나 → 구독 관리'에서 해지할 수 있어요. <a href="legal.html#refund" target="_blank" rel="noopener">환불 정책</a></p>${bizLine()}`;
  sheet(draw(), "퀘스트 패스");
  const wire = () => {
    layer.querySelectorAll("[data-plan]").forEach(b => b.addEventListener("click", () => { pick = b.dataset.plan; repaint(draw()); wire(); }));
    const pb = layer.querySelector("[data-pay]"); if (!pb) return;
    pb.addEventListener("click", async () => { busy = true; msg = ""; repaint(draw()); wire();
      try { await loadSDK();
        const r = await window.PortOne.requestIssueBillingKey({storeId:cfg.storeId, channelKey:cfg.channelKey, billingKeyMethod:"CARD", issueId:`bk-${auth.user.id.slice(0, 8)}-${Date.now().toString(36)}`, issueName:pick === "year" ? "퀘스트 패스 (연간)" : "퀘스트 패스 (월간)",
          customer:{customerId:auth.user.id, email:auth.user.email || undefined}, redirectUrl:site() + "?pay=" + pick});
        if (!r) return; // 모바일: 결제창에서 돌아오면 주소창 값으로 이어서 처리
        if (r.code !== undefined){ busy = false; msg = r.message || "결제 수단 등록을 마치지 못했어요."; repaint(draw()); wire(); return; }
        await finishSubscribe(r.billingKey, pick);
      } catch (e) { busy = false; msg = e.message || "결제를 처리하지 못했어요."; if (layer.querySelector(".sheet")){ repaint(draw()); wire(); } } });
  };
  wire();
}
async function finishSubscribe(billingKey, interval){
  try { const r = await api("subscribe", {billingKey, interval}); await loadEnt(); close(); ev("sub_start");
    toast(r.trial ? `무료 체험을 시작했어요 · ${md(r.period_end.slice(0, 10))}에 첫 결제` : r.resumed ? "구독을 다시 이어요" : r.already ? "이미 퀘스트 패스를 쓰고 있어요" : "퀘스트 패스를 시작했어요"); render(); }
  catch (e) { toast(e.message || "결제를 처리하지 못했어요."); throw e; }
}
async function loadEnt(){ if (!auth.user){ ENT = null; return; } try { const e = await store.entitlement(); ENT = {...effective(e), trialUsed:!!(e && e.trial_used)}; } catch (_) { /* 오프라인이면 이전 값 유지 */ } try { const m = await api("me"); if (m && m.ai) AILEFT = m.ai; } catch (_) {} }
async function manage(){
  sheet(`${head("구독 관리")}<div class="spin"></div>`, "구독 관리");
  let pays = []; try { pays = await store.payments(); } catch (_) {}
  const e = ENT || {}, end = e.period_end ? md(e.period_end.slice(0, 10)) : "";
  const draw = (sure, busy) => `${head("구독 관리")}<section class="card acct" style="box-shadow:none;background:var(--fill)"><div class="row"><span class="t"><b>퀘스트 패스 ${e.interval === "year" ? "연간" : "월간"}</b><small>${e.status === "trialing" ? `무료 체험 중 · ${end}에 첫 결제` : e.status === "canceled" ? `해지 예약됨 · ${end}까지 이용` : e.status === "past_due" ? "결제 실패 · 카드 확인이 필요해요" : `다음 결제 ${end}`}</small></span></div></section>
    <div class="sect"><h2>결제 내역</h2></div><section class="card" style="box-shadow:none;border:1px solid var(--line)">${pays.map(p => `<div class="paid"><span>${(p.paid_at || p.created_at || "").slice(0, 10)} · ${p.interval === "year" ? "연간" : "월간"}</span><span class="num">${p.status === "PAID" ? p.amount.toLocaleString() + "원" : "실패"}</span></div>`).join("") || '<div class="empty">아직 결제한 내역이 없어요.</div>'}</section>
    ${e.status !== "canceled" ? `<button class="btn sec" id="cx" style="margin-top:14px;color:var(--warn)" ${busy ? "disabled" : ""}>${busy ? "처리 중…" : sure ? `한 번 더 누르면 해지돼요 · ${end}까지는 그대로 쓸 수 있어요` : "구독 해지"}</button>` : `<button class="btn" id="re" style="margin-top:14px">구독 다시 시작</button>`}
    <p class="fine">환불은 <a href="legal.html#refund" target="_blank" rel="noopener">환불 정책</a>에 따라 ${esc(BIZ.email)} 로 요청해 주세요.</p>`;
  let sure = false; repaint(draw(false));
  const wire = () => { const cx = document.getElementById("cx"), re = document.getElementById("re");
    if (cx) cx.addEventListener("click", async () => { if (!sure){ sure = true; repaint(draw(true)); wire(); return; } repaint(draw(true, true));
      try { await api("cancel", {}); await loadEnt(); toast("해지했어요. 남은 기간까지는 그대로 쓸 수 있어요"); close(); render(); } catch (er) { toast(er.message); repaint(draw(false)); wire(); } });
    if (re) re.addEventListener("click", () => { close(); paywall("me"); }); };
  wire();
}

function yearSheet(id){ const hb = S.habits.find(x => x.id === id); if (!hb) return; let Y = new Date().getFullYear();
  const draw = () => `${head(esc(hb.title))}<div class="calh"><button class="ib" data-y="-1" aria-label="이전 해">${ic.left}</button><b class="num">${Y}년 · ${Object.keys(hb.log || {}).filter(d => d.startsWith(Y + "-")).length}일</b><button class="ib" data-y="1" aria-label="다음 해">${ic.right}</button></div>
    <div class="hmrow" style="grid-template-columns:repeat(auto-fill,minmax(128px,1fr))">${Array.from({length:12}, (_, i) => `<div class="card hm" style="box-shadow:none;background:var(--fill)">${squares(hb, `${Y}-${pad(i + 1)}`, false)}</div>`).join("")}</div>`;
  sheet(draw(), "올해 기록"); const wire = () => layer.querySelectorAll("[data-y]").forEach(b => b.addEventListener("click", () => { Y += +b.dataset.y; repaint(draw()); wire(); })); wire(); }
function formSheet(title, fields, onOk){
  sheet(`${head(title)}<form id="fs">${fields.map(f => `<div class="field"><label for="${f.id}">${f.label}</label><input id="${f.id}" ${f.type ? `type="${f.type}"` : ""} value="${esc(f.value || "")}" ${f.ph ? `placeholder="${esc(f.ph)}"` : ""} autocomplete="off" ${f.first ? "autofocus" : ""}></div>`).join("")}<button class="btn">확인</button></form>`, title);
  document.getElementById("fs").addEventListener("submit", e => { e.preventDefault(); const v = {}; fields.forEach(f => v[f.id] = document.getElementById(f.id).value.trim()); if (onOk(v) !== false){ save(); close(); render(); } });
}
function deleteSheet(){
  sheet(`${head("회원 탈퇴")}<p style="color:var(--sub);margin:-4px 0 12px">탈퇴하면 기록, 레벨, 코인이 모두 지워지고 되살릴 수 없어요. 진행 중인 구독은 해지돼요.</p><form id="delf"><div class="field"><label for="dl-c">확인을 위해 <b>탈퇴</b>라고 적어 주세요</label><input id="dl-c" autocomplete="off"></div><button class="btn" style="background:var(--warn)">탈퇴하기</button></form>`, "회원 탈퇴");
  document.getElementById("delf").addEventListener("submit", async e => { e.preventDefault(); if (document.getElementById("dl-c").value.trim() !== "탈퇴"){ toast("‘탈퇴’라고 적어 주세요"); return; }
    try { if (pass()) await api("cancel", {}).catch(() => {}); const k = cacheKey(); await auth.deleteAccount(); LS.set(k, null); LS.set("qn:guest", null); close(); toast("탈퇴했어요. 그동안 고마웠어요"); MODE = "auth"; S = null; render(); }
    catch (er) { toast(er.message || "탈퇴를 처리하지 못했어요. 문의 메일로 알려 주세요."); } });
}

/* ───────── 연출 ───────── */
function float(txt, habit){ const d = document.createElement("div"); d.className = "xpf" + (habit ? " h" : ""); d.textContent = txt; d.style.left = lastPt.x + "px"; d.style.top = (lastPt.y - 18) + "px"; document.body.appendChild(d); setTimeout(() => d.remove(), 1000); try { navigator.vibrate && navigator.vibrate(12); } catch (_) {} }
let tmr; function toast(t){ document.querySelectorAll(".toast").forEach(x => x.remove()); const d = document.createElement("div"); d.className = "toast"; d.setAttribute("role", "status"); d.textContent = t; document.body.appendChild(d); clearTimeout(tmr); tmr = setTimeout(() => d.remove(), 2800); }
function levelUp(L){ S.user.coins += L * 10; save(); const d = document.createElement("div"); d.className = "lvup";
  d.innerHTML = `<div class="box" role="dialog" aria-label="레벨 업"><div class="ring"><div><b>${L}<small>LEVEL</small></b></div></div><h3>레벨 업!</h3><p>${L === 5 ? "망토를 얻었어요" : L === 10 ? "왕관을 얻었어요" : L === 20 ? "별을 얻었어요" : "한 단계 성장했어요"} · 보너스 +${L * 10} 코인</p><button class="btn">계속하기</button></div>`;
  document.body.appendChild(d); d.querySelector("button").focus(); d.addEventListener("click", e => { if (e.target === d || e.target.closest("button")){ d.remove(); render(); } }); }

/* ───────── 렌더 ───────── */
const app = document.getElementById("app"), nav = document.getElementById("nav"), navwrap = document.getElementById("navwrap");
const TABS = [["today","오늘",ic.today],["quests","퀘스트",ic.quests],null,["record","기록",ic.record],["me","나",ic.me]];
function render(){
  if (MODE === "auth" || !S){ app.innerHTML = vAuth(); navwrap.hidden = true; return; }
  navwrap.hidden = false;
  app.innerHTML = V.tab === "quests" ? vQuests() : V.tab === "record" ? vRecord() : V.tab === "me" ? vMe() : vToday();
  nav.innerHTML = TABS.map(t => t ? `<a href="#${t[0]}" ${V.tab === t[0] ? 'aria-current="page"' : ""}>${t[2]}${t[1]}</a>` : `<button class="plus" data-act="add" aria-label="할 일 추가">${ic.plus}</button>`).join("");
}
function route(){ const h = (location.hash || "").slice(1); V.tab = ["today","quests","record","me"].includes(h) ? h : "today"; if (V.tab !== "quests") V.quest = null; render(); scrollTo(0, 0); }
addEventListener("hashchange", route);

/* ───────── 입력 처리 ───────── */
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-ck],[data-open],[data-act],[data-q],[data-back],[data-tab],[data-achieve],[data-cal],[data-day],[data-year],[data-shop],[data-buy],[data-close],[data-scrim],[data-auth],[data-oauth],[data-qedit],[data-stageadd]"); if (!el) return;
  const d = el.dataset;
  if (d.scrim !== undefined && e.target !== el) return;
  if (d.close !== undefined || d.scrim !== undefined){ close(); return; }
  if (d.auth){ authTab = d.auth; authMsg = authOk = ""; render(); return; }
  if (d.oauth){ location.href = auth.oauthUrl(d.oauth); return; }
  if (d.ck){ e.stopPropagation(); const [k, id] = d.ck.split(":"); toggle(k, id); return; }
  if (d.open){ const [k, id] = d.open.split(":"); openItem(k, id); return; }
  if (d.qedit){ editQuest(d.qedit); return; }
  if (d.stageadd){ addStage(d.stageadd); return; }
  if (d.q){ V.quest = d.q; if (V.tab !== "quests"){ location.hash = "quests"; V.tab = "quests"; } render(); scrollTo(0, 0); return; }
  if (d.back !== undefined){ V.quest = d.back || null; render(); scrollTo(0, 0); return; }
  if (d.tab){ location.hash = d.tab; return; }
  if (d.cal){ const [y, m] = V.cal.split("-").map(Number), x = new Date(y, m - 1 + +d.cal, 1); V.cal = `${x.getFullYear()}-${pad(x.getMonth() + 1)}`; render(); return; }
  if (d.day){ V.sel = d.day; render(); return; }
  if (d.year){ yearSheet(d.year); return; }
  if (d.shop){ V.shop = d.shop; render(); return; }
  if (d.buy){ const r = S.rewards.find(x => x.id === d.buy); if (!r) return; if (S.user.coins < r.cost){ toast(`코인이 ${r.cost - S.user.coins}개 부족해요`); return; } S.user.coins -= r.cost; S.buys.push({name:r.name, cost:r.cost, type:r.type, at:T()}); save(); render(); toast(`“${r.name}” 보상을 받았어요 · −${r.cost} 코인`); return; }
  if (d.achieve){ const q = S.quests.find(x => x.id === d.achieve); if (!q || qProg(q).left) return; q.status = "done"; const b = levelOf(S.user.xp).L, xp = isMain(q) ? 500 : 150; S.user.xp += xp; S.user.coins += isMain(q) ? 200 : 50; save(); render(); toast(`${isMain(q) ? "메인 퀘스트" : "스테이지"} 달성! +${xp} XP`); const a = levelOf(S.user.xp).L; if (a > b) setTimeout(() => levelUp(a), 500); return; }
  switch (d.act){
    case "add": openAdd(); break;
    case "ai": openAI(); break;
    case "pay": paywall(d.why); break;
    case "manage": manage(); break;
    case "fold": V.doneOpen = !V.doneOpen; render(); break;
    case "theme": { const r = document.documentElement, cur = r.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); r.dataset.theme = cur === "dark" ? "light" : "dark"; LS.set("qn:theme", r.dataset.theme); break; }
    case "shield-buy": if (S.user.coins < SHIELD_COST){ toast(`코인이 ${SHIELD_COST - S.user.coins}개 부족해요`); break; } S.user.coins -= SHIELD_COST; S.user.shields++; save(); render(); toast("휴식권을 1장 샀어요"); break;
    case "shield-use": { const y = addD(T(), -1); S.user.rest = S.user.rest || []; if (S.user.rest.includes(y)){ toast("어제는 이미 휴식권을 썼어요"); break; } if (S.missions.some(m => m.doneAt === y) || S.habits.some(h => (h.log || {})[y])){ toast("어제는 이미 기록이 있어서 쓸 필요가 없어요"); break; } S.user.shields--; S.user.rest.push(y); save(); render(); toast(`휴식권을 썼어요 · 연속 ${streak()}일`); break; }
    case "reward-add": formSheet(V.shop === "get" ? "아이템 추가" : "경험 추가", [{id:"rw-n", label:"이름", ph:V.shop === "get" ? "새 러닝화" : "보고 싶던 영화 보기", first:true},{id:"rw-c", label:"코인", type:"number", value:"100"}], v => { if (!v["rw-n"]) return false; S.rewards.push({id:uid(), name:v["rw-n"].slice(0, 40), cost:Math.max(1, Math.min(99999, +v["rw-c"] || 100)), type:V.shop === "get" ? "get" : "do"}); }); break;
    case "rename": formSheet("이름 바꾸기", [{id:"nm", label:"이름", value:S.user.name, first:true}], v => { if (!v.nm) return false; S.user.name = v.nm.slice(0, 12); }); break;
    case "legal": location.href = "legal.html"; break;
    case "login": case "to-auth": close(); MODE = "auth"; authTab = "up"; render(); break;
    case "logout": await auth.signOut(); LS.set("qn:guest", null); S = null; ENT = null; MODE = "auth"; authTab = "in"; render(); toast("로그아웃했어요"); break;
    case "delete": deleteSheet(); break;
    case "guest": LS.set("qn:guest", 1); startGuest(); break;
    case "forgot": { const em = (document.getElementById("au-e") || {}).value || ""; if (!/\S+@\S+/.test(em)){ authMsg = "이메일을 먼저 적어 주세요."; render(); break; } try { await auth.recover(em); authMsg = ""; authOk = "비밀번호를 다시 정하는 메일을 보냈어요."; } catch (er) { authMsg = er.message; } render(); const ei = document.getElementById("au-e"); if (ei) ei.value = em; break; }
  }
});
document.addEventListener("submit", async e => {
  if (e.target.id === "authf"){ e.preventDefault(); const em = document.getElementById("au-e").value.trim(), pw = document.getElementById("au-p").value, btn = document.getElementById("au-go"); btn.disabled = true; authMsg = authOk = "";
    try { if (authTab === "up"){ const r = await auth.signUp(em, pw); if (r.confirm){ authOk = "인증 메일을 보냈어요. 메일의 링크를 누르면 바로 시작돼요."; authTab = "in"; render(); document.getElementById("au-e").value = em; return; } ev("signup"); } else await auth.signIn(em, pw);
      await startUser(); } catch (er) { authMsg = er.message; render(); const ei = document.getElementById("au-e"); if (ei) ei.value = em; } return; }
  const f = e.target.closest("[data-addto]"); if (!f) return; e.preventDefault();
  const inp = f.querySelector("input"), txt = inp.value.trim(); if (!txt) return; const p = parse(txt), q = S.quests.find(x => x.id === f.dataset.addto); if (!q) return;
  S.missions.push({id:uid(), title:(p.title || txt).slice(0, 60), quest:q.id, due:p.date, time:p.time, area:p.area.length ? p.area : (q.area || (S.quests.find(x => x.id === q.parent) || {}).area || []), lv:"normal", done:false}); save(); render(); toast(`미션을 추가했어요 · ${dayLabel(p.date)}${p.time ? " " + tmFmt(p.time) : ""}`);
  const ni = document.getElementById(inp.id); if (ni) ni.focus();
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && layer.innerHTML) close(); if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".row[role=button]")){ e.preventDefault(); e.target.click(); } });

/* ───────── 시작 ───────── */
function startGuest(){ MODE = "app"; SYNC = "off"; const c = LS.get("qn:state:guest"); S = valid(c) ? c : blank(); monthlyShields(); save(); route(); }
async function startUser(){
  MODE = "app"; const local = LS.get(cacheKey()), guest = LS.get("qn:state:guest");
  S = valid(local) ? local : null; if (S){ monthlyShields(); route(); }
  setSync("saving");
  try {
    const remote = await store.load();
    if (valid(remote) && (!S || (remote.updatedAt || 0) >= (S.updatedAt || 0))) S = remote;
    else if (!S) S = valid(guest) && (guest.quests.length || guest.missions.length || guest.habits.length) ? guest : blank((auth.user.email || "").split("@")[0].slice(0, 12));
    if (valid(guest) && S === guest) LS.set("qn:state:guest", null);
    LS.set("qn:guest", null); setSync("on");
  } catch (e) { if (!S) S = blank(); setSync("err"); }
  await loadEnt(); monthlyShields(); save(); route();
  const q = new URLSearchParams(location.search); // 모바일 결제창에서 돌아온 경우
  if (q.get("pay")){ history.replaceState(null, "", location.pathname + location.hash); if (q.get("code")) toast(q.get("message") || "결제 수단 등록을 마치지 못했어요."); else if (q.get("billingKey")) finishSubscribe(q.get("billingKey"), q.get("pay") === "month" ? "month" : "year").catch(() => {}); }
}
(async () => {
  const th = LS.get("qn:theme"); if (th) document.documentElement.dataset.theme = th;
  const red = await auth.fromRedirect();
  if (red && red.error) authMsg = red.error;
  if (red && red.type === "recovery"){ S = S || blank(); MODE = "app"; await startUser(); formSheet("새 비밀번호 정하기", [{id:"np", label:"새 비밀번호 (8자 이상)", type:"password", first:true}], v => { if ((v.np || "").length < 8){ toast("8자 이상으로 정해 주세요"); return false; } auth.setPassword(v.np).then(() => toast("비밀번호를 바꿨어요"), er => toast(er.message)); }); return; }
  if (red && red.type === "signup") ev("signup");
  if (auth.user) await startUser();
  else if (LS.get("qn:guest")) startGuest();
  else { MODE = "auth"; render(); }
})();
